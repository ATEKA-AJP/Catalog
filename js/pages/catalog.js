/**
 * ==========================================
 * AJP WEB CATALOG - Catalog Page
 * ==========================================
 */

window._catalogProducts = {};

// State
let _currentPage  = 1;
let _currentQuery = "";
let _searchTimer  = null;
let _newOnly      = false;
let _sortBy       = "";

async function loadCatalog(query = "", page = 1) {

    _currentQuery = query;
    _currentPage  = page;

    const grid = document.getElementById("productGrid");

    try {
        const currentUser = await Session.getCurrentUser();

        // Cek cache hanya untuk full catalog (tanpa query/filter/sort, page 1)
        const isPlainFullCatalog = !query && page === 1 && !_newOnly && !_sortBy;

        if (isPlainFullCatalog) {
            const fresh = await CatalogStorage.isFresh(currentUser);
            if (fresh) {
                const cached = await CatalogStorage.load(currentUser);
                if (cached && cached.products) {
                    renderProducts(cached.products, cached.priceArea || "regular");
                    _renderPagination(cached.pagination);
                    _fetchAndUpdate(currentUser, query, page);
                    return;
                }
            }
        }

        if (grid) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;color:#94A3B8;padding:40px">
                    Memuat produk...
                </div>`;
        }

        await _fetchAndUpdate(currentUser, query, page);

    } catch (err) {
        console.error("Gagal memuat katalog:", err);
        if (grid) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;color:#EF4444;padding:40px">
                    Gagal memuat produk: ${err.message}
                </div>`;
        }
    }
}

async function _fetchAndUpdate(currentUser, query, page) {

    try {
        const params = { page };

        if (query)    params.q   = query;
        if (_newOnly) params.new = "true";
        if (_sortBy)  params.sort = _sortBy;
        if (currentUser && currentUser.role !== "public") {
            params.priceArea = _getActivePriceArea(currentUser);
        }

        const result = await API.getProducts(params);

        if (result && result.products) {
            renderProducts(result.products, params.priceArea || "regular");
            _renderPagination(result.pagination);

            // Notifikasi perubahan katalog hanya relevan untuk user yang
            // benar-benar login (sales/admin/supervisor) — public tidak
            // lihat harga sama sekali, dan guest sesinya sementara.
            const isRealUser = currentUser && currentUser.role !== "public" && currentUser.role !== "guest";

            // Cek perubahan HARGA di hasil fetch MANA PUN (search/filter/
            // sort/pagination/browse biasa) — tidak dibatasi cuma katalog
            // penuh, supaya harga yang cuma ketemu lewat search pun tetap
            // ke-detect kalau berubah.
            if (isRealUser && typeof PriceHistory !== "undefined") {
                PriceHistory.checkAndUpdate(result.products)
                    .catch(e => console.warn("Gagal cek histori harga:", e));
            }

            const isPlainFullCatalog = !query && page === 1 && !_newOnly && !_sortBy;
            if (isPlainFullCatalog) {
                // Deteksi produk baru / varian baru BUTUH gambaran lengkap
                // katalog supaya tidak salah anggap "baru" padahal cuma
                // belum kelihatan di hasil search/filter saat ini — makanya
                // ini tetap dibatasi ke halaman katalog penuh saja.
                if (isRealUser && typeof diffCatalog === "function" && typeof NotificationStorage !== "undefined") {
                    try {
                        const previous = await CatalogStorage.load(currentUser);
                        const changes  = diffCatalog(previous?.products, result.products)
                            .filter(c => c.type !== "price_change"); // sudah ditangani PriceHistory di atas

                        if (changes.length > 0) {
                            await NotificationStorage.addMany(changes);
                            if (typeof NotificationBell !== "undefined") {
                                await NotificationBell.refreshBadge();
                            }
                        }
                    } catch (e) {
                        console.warn("Gagal cek perubahan katalog:", e);
                    }
                }

                await CatalogStorage.save(currentUser, result);
            }
        } else {
            renderProducts([], "regular");
            _renderPagination(null);
        }

        if (typeof Cart !== "undefined") await Cart.updateBadge();

    } catch (err) {
        console.error("Fetch gagal:", err);

        // Offline / gagal konek ke server → coba tampilkan data katalog
        // terakhir yang tersimpan di IndexedDB (biar tidak blank/error total).
        // Search/filter/sort diterapkan manual di sisi client sebagai
        // best-effort, karena tidak bisa minta server yang sudah mati.
        const offlineFallback = await _tryOfflineFallback(currentUser, query, page);

        if (offlineFallback) {
            return;
        }

        const grid = document.getElementById("productGrid");
        if (grid?.innerHTML.includes("Memuat produk")) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;color:#EF4444;padding:40px">
                    Gagal memuat produk: ${err.message}
                </div>`;
        }
        _renderPagination(null);
    }

}

/**
 * Coba sajikan data dari cache IndexedDB saat fetch ke server gagal
 * (biasanya karena offline). Mengembalikan true kalau berhasil menampilkan
 * sesuatu, false kalau memang tidak ada cache sama sekali untuk ditampilkan.
 */
async function _tryOfflineFallback(currentUser, query, page) {
    try {
        const cached = await CatalogStorage.load(currentUser);
        if (!cached || !cached.products) return false;

        let products = cached.products;

        // Search manual (best-effort, sama logikanya dengan yang di backend:
        // tiap kata harus ketemu, urutan bebas)
        if (query) {
            const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
            products = products.filter(p => {
                const hay = [
                    p.kode, p.nama_item, p.kategori, p.sub_kategori,
                    JSON.stringify(p.varianData || [])
                ].join(" ").toLowerCase();
                return words.every(w => hay.includes(w));
            });
        }

        if (_newOnly) {
            products = products.filter(p => p.new === true);
        }

        if (_sortBy) {
            products = _sortProductsClientSide(products, _sortBy);
        }

        renderProducts(products, cached.priceArea || "regular");
        _renderPagination(null); // pagination server-side tidak berlaku offline

        if (typeof Notify !== "undefined") {
            Notify.info("Sedang offline — menampilkan data tersimpan terakhir (mungkin tidak terbaru).");
        }

        return true;
    } catch {
        return false;
    }
}

function _sortProductsClientSide(products, sortBy) {
    const minHarga = (p) => {
        const prices = (p.varianData || [])
            .map(v => Number(v.harga))
            .filter(n => !isNaN(n) && n > 0);
        return prices.length ? Math.min(...prices) : null;
    };

    const arr = [...products];

    switch (sortBy) {
        case "name_asc":
            arr.sort((a, b) => String(a.nama_item || "").localeCompare(String(b.nama_item || "")));
            break;
        case "name_desc":
            arr.sort((a, b) => String(b.nama_item || "").localeCompare(String(a.nama_item || "")));
            break;
        case "price_asc":
            arr.sort((a, b) => {
                const pa = minHarga(a), pb = minHarga(b);
                if (pa === null && pb === null) return 0;
                if (pa === null) return 1;
                if (pb === null) return -1;
                return pa - pb;
            });
            break;
        case "price_desc":
            arr.sort((a, b) => {
                const pa = minHarga(a), pb = minHarga(b);
                if (pa === null && pb === null) return 0;
                if (pa === null) return 1;
                if (pb === null) return -1;
                return pb - pa;
            });
            break;
        case "newest":
            arr.sort((a, b) => (b.new === true ? 1 : 0) - (a.new === true ? 1 : 0));
            break;
    }

    return arr;
}

// ==========================================
// _PRICE_AREA_KEY, _getActivePriceArea, _setPriceArea
// sudah dideklarasikan di navbar.js (load lebih awal)

function _applySumatraTint(isSumatra) {
    const grid = document.getElementById("productGrid");
    if (!grid) return;
    grid.classList.toggle("price-area-sumatra", isSumatra);
}

// ==========================================
// PAGINATION
// ==========================================

function _renderPagination(pagination) {
    let wrap = document.getElementById("catalogPagination");

    if (!wrap) {
        wrap = document.createElement("div");
        wrap.id = "catalogPagination";
        wrap.style.cssText = "margin: 24px 0;";

        const grid = document.getElementById("productGrid");
        if (grid?.parentNode) {
            grid.parentNode.insertBefore(wrap, grid.nextSibling);
        }
    }

    if (!pagination || pagination.totalPages <= 1) {
        wrap.innerHTML = "";
        return;
    }

    const { page, totalPages, total } = pagination;

    const pageNumbers = _buildPageNumbers(page, totalPages);

    wrap.innerHTML = `
        <div class="pagination">
            <span class="pagination-info">
                Total ${total.toLocaleString("id-ID")} produk
            </span>
            <div class="pagination-btns">
                <button class="pg-btn" data-page="${page - 1}"
                    ${page <= 1 ? "disabled" : ""}>‹ Sebelumnya</button>
                ${pageNumbers.map(p =>
                    p === "..."
                        ? `<span class="pg-ellipsis">…</span>`
                        : `<button class="pg-btn ${p === page ? "active" : ""}"
                                data-page="${p}">${p}</button>`
                ).join("")}
                <button class="pg-btn" data-page="${page + 1}"
                    ${page >= totalPages ? "disabled" : ""}>Berikutnya ›</button>
            </div>
        </div>
    `;

    wrap.querySelectorAll(".pg-btn:not([disabled])").forEach(btn => {
        btn.addEventListener("click", () => {
            loadCatalog(_currentQuery, Number(btn.dataset.page));
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    });
}

function _buildPageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [1];
    if (current > 3) pages.push("...");
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
        pages.push(i);
    }
    if (current < total - 2) pages.push("...");
    pages.push(total);
    return pages;
}

// ==========================================
// SEARCH
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("searchInput");
    if (!searchInput) return;

    searchInput.addEventListener("input", () => {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => {
            _currentPage = 1;
            loadCatalog(searchInput.value.trim(), 1);
        }, 400);
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            clearTimeout(_searchTimer);
            _currentPage = 1;
            loadCatalog(searchInput.value.trim(), 1);
        }
    });

    // Filter & Sort hanya untuk user yang login (bukan public)
    Session.getCurrentUser().then(user => {
        const toolbar = document.getElementById("catalogToolbar");
        if (!toolbar) return;
        toolbar.style.display = user ? "" : "none";
    });

    // Filter "Produk Baru" — toggle on/off
    const btnNewOnly = document.getElementById("filterNewOnly");
    btnNewOnly?.addEventListener("click", () => {
        _newOnly = !_newOnly;
        btnNewOnly.classList.toggle("active", _newOnly);
        loadCatalog(_currentQuery, 1);
    });

    // Dropdown Sort
    const sortSelect = document.getElementById("sortSelect");
    sortSelect?.addEventListener("change", () => {
        _sortBy = sortSelect.value;
        loadCatalog(_currentQuery, 1);
    });

    // Begitu koneksi balik online setelah sempat offline, otomatis fetch
    // ulang katalog (bukan cuma nunggu user pindah halaman/search manual)
    // supaya harga & stock langsung ke-refresh ke data terbaru dari server.
    if (typeof AppOnline !== "undefined") {
        AppOnline.onChange((isOnline) => {
            if (isOnline) {
                loadCatalog(_currentQuery, _currentPage);
            }
        });
    }
});

// ==========================================
// RENDER
// ==========================================

function renderProducts(products, priceArea) {

    const grid = document.getElementById("productGrid");
    if (!grid) return;

    _applySumatraTint(priceArea === "sumatra");

    if (!products || products.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;color:#6B7280;padding:40px">
                Tidak ada produk yang ditemukan.
            </div>`;
        return;
    }

    // Jangan reset _activeVariant — user mungkin sudah pilih variant sebelum background fetch
    // createProductCard sudah handle default (index 0) kalau belum ada pilihan
    window._catalogProducts = {};
    products.forEach(p => { window._catalogProducts[p.kode] = p; });

    grid.innerHTML = products
        .map(product => createProductCard(product, priceArea))
        .join("");

    // Aktifkan drag-to-scroll untuk variant pills yang overflow
    if (typeof initVariantPillsScroll === "function") {
        initVariantPillsScroll(grid);
    }

    // Terapkan stock visibility berdasarkan permission stock.view
    // (bukan cuma status login — guest sengaja TIDAK dapat permission ini,
    // jadi stock tidak akan pernah ditampilkan meskipun guest "login")
    Session.getCurrentUser().then(user => {
        const canViewStock = !!user?.permissions?.includes("stock.view");
        applyStockVisibility(canViewStock);
    });

    // Wire "Tambah Order" buttons
    grid.querySelectorAll(".add-cart-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const user = await Session.getCurrentUser();
            if (!user) { LoginModal.open(); return; }
            const product = window._catalogProducts[btn.dataset.kode];
            if (product && typeof openCartModal === "function") {
                // Kirim product dengan variant yang sedang aktif
                const activeIdx = window._activeVariant[product.kode] ?? 0;
                openCartModal(product, activeIdx);
            }
        });
    });
}
