/**
 * ==========================================
 * AJP WEB CATALOG - Catalog Page
 * ==========================================
 *
 * Loading Strategy:
 *
 * [ONLINE]
 *  Phase 1 → Show page1 cache immediately (instant)
 *  Phase 2 → Fetch page1 from server → update display
 *  Phase 3 → Background: fetch ALL pages → save full cache (silent)
 *
 * [OFFLINE]
 *  → Client-side pagination from full cache (all pages available)
 *  → Falls back to page1 cache if full cache not yet built
 */

window._catalogProducts = {};

let _currentPage  = 1;
let _currentQuery = "";
let _searchTimer  = null;
let _newOnly      = false;
let _sortBy       = "";
let _bgFetchRunning = false;  // lock agar tidak double background fetch

// ==========================================
// MAIN ENTRY
// ==========================================

async function loadCatalog(query = "", page = 1) {

    _currentQuery = query;
    _currentPage  = page;

    const grid = document.getElementById("productGrid");
    const currentUser = await Session.getCurrentUser();

    // ---- Mode OFFLINE ----
    if (!AppOnline.isOnline) {
        await _loadOffline(currentUser, query, page);
        return;
    }

    // ---- Mode ONLINE ----
    const isPlain = !query && !_newOnly && !_sortBy;

    // PHASE 1: Tampilkan cache segera (jika plain catalog & page 1)
    if (isPlain && page === 1) {
        const cached = await CatalogStorage.loadPage1(currentUser);
        if (cached?.products) {
            renderProducts(cached.products, cached.priceArea || "regular");
            _renderPagination(cached.pagination);
            // Tetap fetch fresh di background (tidak await)
            _fetchPage1AndUpdate(currentUser, query, page).catch(() => {});
            return;
        }
    }

    // Tidak ada cache / bukan plain page1 → loading placeholder
    if (grid) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;color:#94A3B8;padding:40px">
                Memuat produk...
            </div>`;
    }

    await _fetchPage1AndUpdate(currentUser, query, page);
}

// ==========================================
// FETCH PAGE 1 (primary display)
// ==========================================

async function _fetchPage1AndUpdate(currentUser, query, page) {
    try {
        const params = { page };
        if (query)    params.q    = query;
        if (_newOnly) params.new  = "true";
        if (_sortBy)  params.sort = _sortBy;
        if (currentUser?.role !== "public") {
            params.priceArea = _getActivePriceArea(currentUser);
        }

        const result = await API.getProducts(params);

        if (result?.products) {
            renderProducts(result.products, params.priceArea || "regular");
            _renderPagination(result.pagination);

            // Cek harga dari hasil fetch ini
            _runPriceCheck(currentUser, result.products);

            // Simpan page1 cache (untuk load berikutnya tetap instant)
            const isPlain = !query && page === 1 && !_newOnly && !_sortBy;
            if (isPlain) {
                await CatalogStorage.savePage1(currentUser, result);
            }

            // PHASE 3: Background full-catalog fetch (hanya untuk plain page1)
            if (isPlain && !_bgFetchRunning) {
                _backgroundFetchAll(currentUser, result).catch(() => {});
            }

        } else {
            renderProducts([], "regular");
            _renderPagination(null);
        }

        if (typeof Cart !== "undefined") await Cart.updateBadge();

    } catch (err) {
        // Network error → coba offline fallback
        const ok = await _loadOffline(currentUser, query, page);
        if (!ok) {
            const grid = document.getElementById("productGrid");
            if (grid?.innerHTML.includes("Memuat produk")) {
                grid.innerHTML = `
                    <div style="grid-column:1/-1;text-align:center;color:#EF4444;padding:40px">
                        Gagal memuat produk. Periksa koneksi internet.
                    </div>`;
            }
            _renderPagination(null);
        }
    }
}

// ==========================================
// BACKGROUND: FETCH ALL PAGES
// ==========================================

async function _backgroundFetchAll(currentUser, page1Result) {

    const pagination = page1Result.pagination;
    if (!pagination || pagination.totalPages <= 1) {
        // Hanya 1 halaman → simpan langsung ke full cache
        await CatalogStorage.saveFull(
            currentUser,
            page1Result.products,
            page1Result.priceArea || "regular",
            page1Result.filters
        );
        await _runCatalogDiff(currentUser, page1Result.products);
        return;
    }

    _bgFetchRunning = true;

    try {
        const allProducts  = [...page1Result.products];
        const totalPages   = pagination.totalPages;
        const priceArea    = page1Result.priceArea || "regular";

        // Fetch halaman 2, 3, ... secara berurutan (tidak serentak, agar
        // tidak membebani Apps Script yang punya quota request)
        for (let p = 2; p <= totalPages; p++) {
            if (!AppOnline.isOnline) break;  // batal kalau tiba-tiba offline

            try {
                const params = { page: p };
                if (currentUser?.role !== "public") {
                    params.priceArea = _getActivePriceArea(currentUser);
                }

                const result = await API.getProducts(params);

                if (result?.products) {
                    allProducts.push(...result.products);
                    // Cek harga dari setiap halaman yang di-fetch
                    _runPriceCheck(currentUser, result.products);
                }

                // Jeda kecil agar tidak spam request ke Apps Script
                await _sleep(300);

            } catch {
                // Halaman ini gagal → lanjut ke berikutnya
            }
        }

        // Simpan semua ke full cache
        await CatalogStorage.saveFull(currentUser, allProducts, priceArea, page1Result.filters);

        // Deteksi produk baru / varian baru dari gambaran lengkap
        await _runCatalogDiff(currentUser, allProducts);

    } finally {
        _bgFetchRunning = false;
    }
}

function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// OFFLINE: CLIENT-SIDE PAGINATION
// ==========================================

async function _loadOffline(currentUser, query, page) {
    try {
        // Coba full cache dulu (semua halaman tersedia)
        const full = await CatalogStorage.loadFull(currentUser);

        if (full?.products) {
            const { products, pagination } = CatalogStorage.paginateLocal(
                full.products, page,
                { q: query, newOnly: _newOnly, sort: _sortBy }
            );

            renderProducts(products, full.priceArea || "regular");
            _renderPagination(pagination);

            if (typeof Notify !== "undefined") {
                Notify.info("Offline — menampilkan data tersimpan.");
            }
            return true;
        }

        // Fallback ke page1 cache (hanya halaman 1)
        const page1 = await CatalogStorage.loadPage1(currentUser);
        if (page1?.products) {
            renderProducts(page1.products, page1.priceArea || "regular");
            _renderPagination(null);

            if (typeof Notify !== "undefined") {
                Notify.warn(
                    "Offline — hanya halaman 1 tersedia. " +
                    "Buka saat online agar semua halaman tersimpan."
                );
            }
            return true;
        }

        return false;
    } catch {
        return false;
    }
}

// ==========================================
// PRICE CHECK & CATALOG DIFF
// ==========================================

function _runPriceCheck(currentUser, products) {
    const isRealUser = currentUser &&
        currentUser.role !== "public" &&
        currentUser.role !== "guest";

    if (isRealUser && typeof PriceHistory !== "undefined") {
        PriceHistory.checkAndUpdate(products)
            .catch(e => console.warn("Price check gagal:", e));
    }
}

async function _runCatalogDiff(currentUser, newProducts) {
    const isRealUser = currentUser &&
        currentUser.role !== "public" &&
        currentUser.role !== "guest";

    if (!isRealUser) return;
    if (typeof diffCatalog !== "function") return;
    if (typeof NotificationStorage === "undefined") return;

    try {
        const previous = await CatalogStorage.loadFull(currentUser);
        const changes  = diffCatalog(previous?.products, newProducts)
            .filter(c => c.type !== "price_change"); // price_change ditangani PriceHistory

        if (changes.length > 0) {
            await NotificationStorage.addMany(changes);
            if (typeof NotificationBell !== "undefined") {
                await NotificationBell.refreshBadge();
            }
        }
    } catch (e) {
        console.warn("Catalog diff gagal:", e);
    }
}

// ==========================================
// BACKGROUND SYNC SAAT APP DIBUKA
// Cek perubahan harga SEMUA produk terlepas
// dari halaman mana yang sedang dibuka
// ==========================================

async function runBackgroundPriceSync(currentUser) {
    if (!currentUser || currentUser.role === "public" || !AppOnline.isOnline) return;
    if (typeof PriceHistory === "undefined") return;

    try {
        const full = await CatalogStorage.loadFull(currentUser);
        if (!full?.products) return;

        // Semua produk tersimpan → cek harga semuanya sekaligus
        await PriceHistory.checkAndUpdate(full.products);
    } catch {}
}

// ==========================================
// UTIL
// ==========================================

function _applySumatraTint(isSumatra) {
    const grid = document.getElementById("productGrid");
    if (!grid) return;
    grid.classList.toggle("price-area-sumatra", isSumatra);
}

// ==========================================
// PAGINATION (UI)
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
// SEARCH & FILTER TOOLBAR
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
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
                loadCatalog(searchInput.value.trim(), 1);
            }
        });
    }

    // Toolbar (filter + sort) — hanya untuk user login
    Session.getCurrentUser().then(user => {
        const toolbar = document.getElementById("catalogToolbar");
        if (toolbar) toolbar.style.display = user ? "" : "none";
    });

    document.getElementById("filterNewOnly")?.addEventListener("click", function() {
        _newOnly = !_newOnly;
        this.classList.toggle("active", _newOnly);
        loadCatalog(_currentQuery, 1);
    });

    document.getElementById("sortSelect")?.addEventListener("change", function() {
        _sortBy = this.value;
        loadCatalog(_currentQuery, 1);
    });

    // Auto-refresh saat koneksi kembali online
    if (typeof AppOnline !== "undefined") {
        AppOnline.onChange(isOnline => {
            if (isOnline) loadCatalog(_currentQuery, _currentPage);
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

    window._catalogProducts = {};
    products.forEach(p => { window._catalogProducts[p.kode] = p; });

    grid.innerHTML = products
        .map(product => createProductCard(product, priceArea))
        .join("");

    if (typeof initVariantPillsScroll === "function") {
        initVariantPillsScroll(grid);
    }

    Session.getCurrentUser().then(user => {
        const canViewStock = !!user?.permissions?.includes("stock.view");
        applyStockVisibility(canViewStock && _getStockVisible());
    });

    grid.querySelectorAll(".add-cart-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const user = await Session.getCurrentUser();
            if (!user) { LoginModal.open(); return; }
            const product = window._catalogProducts[btn.dataset.kode];
            if (product && typeof openCartModal === "function") {
                const activeIdx = window._activeVariant?.[product.kode] ?? 0;
                openCartModal(product, activeIdx);
            }
        });
    });
}
