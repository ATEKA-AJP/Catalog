/**
 * ==========================================
 * AJP WEB CATALOG - Product Card Component
 * ==========================================
 *
 * Variant rules:
 * - 1 card per kode (main product code)
 * - Pills = dari kolom Varian, kode = variant_kode
 * - Kalau kode == variant_kode ATAU varian kosong/"-" → tidak ada variant
 * - Klik pill → ganti gambar (dari image per varianData), harga, stock
 * - Stock tersembunyi untuk public (tidak login)
 * - Satuan/inner/carton tampil sebagai spec-like rows
 */

// State: variant aktif per produk
window._activeVariant = {};

/**
 * Cek apakah value valid (bukan kosong / "-" / 0)
 */
function _isValidPackVal(val) {
    return val !== undefined && val !== null &&
           String(val).trim() !== "" &&
           String(val).trim() !== "-" &&
           Number(val) !== 0;
}

/**
 * Format angka ala Indonesia: 1000 -> "1.000"
 */
function _formatPackNumber(val) {
    const n = Number(val);
    if (isNaN(n)) return String(val);
    return n.toLocaleString("id-ID");
}

/**
 * Build teks packaging sesuai format yang diminta:
 * - Inner + Carton + satuan               -> "10/1.000 pack"
 * - Hanya Carton + satuan                 -> "1.000 pack"
 * - Ditambah isi per pack                 -> "... (1 pack isi 25 pcs)"
 *   Contoh lengkap: "10/1.000 pack (1 pack isi 25 pcs)"
 * - Kalau HANYA isi per pack yang ada (inner & carton kosong)
 *   -> tetap tampil sendiri: "(1 pack isi 25 pcs)"
 */
function formatPackagingText(v) {
    const hasInner       = _isValidPackVal(v.inner);
    const hasCarton      = _isValidPackVal(v.carton);
    const hasIsiPerPack  = _isValidPackVal(v.isi_per_pack);
    const satuan         = (v.satuan && v.satuan !== "-") ? v.satuan : "";

    // Tidak ada data packaging sama sekali
    if (!hasCarton && !hasIsiPerPack) return "";

    let text = "";

    if (hasCarton) {
        const cartonFmt = _formatPackNumber(v.carton);
        const innerFmt  = hasInner ? _formatPackNumber(v.inner) : "";

        text = hasInner
            ? `${innerFmt}/${cartonFmt}${satuan ? " " + satuan : ""}`
            : `${cartonFmt}${satuan ? " " + satuan : ""}`;
    }

    if (hasIsiPerPack && satuan) {
        // Kata di dalam kurung mengikuti kolom "satuan" produk itu sendiri
        // (mis. satuan "card" -> "1 card isi 5 pcs", satuan "pack" -> "1 pack isi 25 pcs")
        const isiText = `(1 ${satuan} isi ${v.isi_per_pack} pcs)`;
        // Kalau tidak ada inner/carton, tampilkan isi per pack saja
        text = text ? `${text} ${isiText}` : isiText;
    }

    return text;
}

/**
 * Build packaging info HTML
 * Dipanggil saat render awal dan saat switchVariant
 */
function _buildPackHTML(v) {
    const text = formatPackagingText(v);
    if (!text) return "";

    return `
        <div class="spec-item">
            <span class="spec-key">Packaging</span>
            <span class="spec-val">${text}</span>
        </div>
    `;
}

function createProductCard(product, priceArea) {

    const kode  = product.kode;
    const vData = product.varianData;

    // Set default active variant
    if (window._activeVariant[kode] === undefined) {
        window._activeVariant[kode] = 0;
    }

    const idx = window._activeVariant[kode];
    const v   = vData[idx] || vData[0];

    // Tentukan apakah product punya variant nyata
    // Rule: hasVariant true kalau lebih dari 1 varianData
    //       ATAU kode != variant_kode
    //       DAN varian tidak kosong/"-"
    const hasRealVariants = vData.length > 1 ||
        (vData.length === 1 &&
         vData[0].variant_kode !== kode &&
         vData[0].varian &&
         vData[0].varian !== "-");

    // ======================================================
    // IMAGE — dari varianData (variant_kode based)
    // ======================================================
    const imageUrl = v.image || product.image || "";

    // ======================================================
    // PILLS — hanya kalau ada real variants
    // ======================================================
    let pillsHTML = "";

    if (hasRealVariants && vData.length > 1) {
        pillsHTML = `
            <div class="variant-pills" id="pills_${kode}">
                ${vData.map((vd, i) => {
                    const label = vd.varian && vd.varian !== "-"
                        ? vd.varian
                        : vd.variant_kode;
                    return `
                        <button
                            class="pill ${i === idx ? "active" : ""}"
                            onclick="switchVariant('${kode}', ${i})"
                            data-variant-index="${i}">
                            ${label}
                        </button>`;
                }).join("")}
            </div>
        `;
    }

    // ======================================================
    // SPEC — max 3 visible, sisanya collapsed
    // ======================================================
    const specEntries = Object.entries(v.spec || {});
    const cardSpecId  = "spec_" + kode.replace(/[^a-z0-9]/gi, "_");

    let specHTML = "";

    if (specEntries.length > 0) {
        const visible = specEntries.slice(0, 3);
        const hidden  = specEntries.slice(3);

        const makeSpecItem = ([key, val], isHidden = false) => `
            <div class="spec-item ${isHidden ? "spec-item-hidden" : ""}">
                <span class="spec-key">${key}</span>
                <span class="spec-val">${val}</span>
            </div>`;

        specHTML = `
            <div class="product-spec-wrap">
                <div class="spec-list" id="${cardSpecId}">
                    ${visible.map(e => makeSpecItem(e, false)).join("")}
                    ${hidden.map(e => makeSpecItem(e, true)).join("")}
                </div>
                ${hidden.length > 0 ? `
                    <button class="spec-toggle-btn"
                            onclick="toggleSpec('${cardSpecId}', this)">
                        Lihat ${hidden.length} spesifikasi lainnya ▾
                    </button>` : ""}
            </div>
        `;
    }

    // ======================================================
    // PACKAGING — "Packaging: Inner X · Carton Y · satuan"
    // ======================================================
    const packContent = _buildPackHTML(v);
    const packHTML = packContent ? `
        <div class="spec-list pack-info" id="pack_${kode}">
            ${packContent}
        </div>` : `<div class="pack-info" id="pack_${kode}"></div>`;

    // ======================================================
    // HARGA — "Rp X / hargaType"
    // Catatan: kolom "satuan" di sheet itu untuk satuan Inner/Carton,
    // BUKAN untuk satuan harga. Satuan harga diambil dari kolom
    // "Harga Type" (v.hargaType). Fallback ke satuan hanya kalau
    // Harga Type kosong, supaya tidak polos tanpa label sama sekali.
    //
    // PENTING: v.harga === undefined artinya user memang tidak punya izin
    // lihat harga sama sekali (backend tidak mengirim field itu) — untuk
    // kasus ini price-amount/price-satuan TIDAK dirender sama sekali.
    // v.harga === null artinya user PUNYA izin, tapi variant INI kebetulan
    // tidak ada harganya (sel "-" di sheet) — untuk kasus ini span-nya
    // TETAP dirender (kosong), supaya switchVariant() bisa nemu & update
    // elemen ini nanti saat pindah ke variant lain. Kalau span tidak
    // dirender sama sekali, switchVariant tidak akan pernah ketemu
    // elemennya, dan harga dari variant SEBELUMNYA bisa nyangkut/ tidak
    // pernah ke-clear saat pindah ke variant yang tidak ada harganya.
    // ======================================================
    let priceHTML = "";

    const hasPriceAccess = v.harga !== undefined;

    if (hasPriceAccess) {
        const hasValidPrice = v.harga !== null;
        const finalPrice = hasValidPrice ? Number(
            priceArea === "sumatra" && v.hargaSumatra
                ? v.hargaSumatra
                : v.harga
        ) : null;
        const priceUnitLabel = v.hargaType
            ? v.hargaType.toLowerCase()
            : (v.satuan ? v.satuan.toLowerCase() : "");

        priceHTML = `
            <span class="price-amount" id="price_${kode}">
                ${hasValidPrice ? "Rp " + finalPrice.toLocaleString("id-ID") : ""}
            </span>
            <span class="price-satuan" id="satuan_${kode}">
                ${hasValidPrice && priceUnitLabel ? "/ " + priceUnitLabel : ""}
            </span>
        `;
    }

    // ======================================================
    // STOCK — hanya tampil kalau user login
    // Ditentukan oleh class "has-price" pada grid
    // Kita pakai data attribute, JS akan hide/show
    // ======================================================
    const stock      = v.stock ?? 0;
    const stockClass = stock > 0 ? "stock-ok" : "stock-empty";

    return `
        <div class="product-card"
             data-kode="${kode}"
             data-variants='${JSON.stringify(vData.map(vd => ({
                 variant_kode: vd.variant_kode,
                 varian:       vd.varian,
                 image:        vd.image || product.image || "",
                 harga:        vd.harga,
                 hargaSumatra: vd.hargaSumatra,
                 hargaType:    vd.hargaType,
                 netto:        vd.netto,
                 ppn:          vd.ppn,
                 satuan:       vd.satuan,
                 isi_per_pack: vd.isi_per_pack,
                 inner:        vd.inner,
                 carton:       vd.carton,
                 stock:        vd.stock,
                 spec:         vd.spec
             })))}'>

            ${(() => {
                const parts = [];
                if (product.new) parts.push(`<span class="badge-new">NEW</span>`);
                if (v.netto)     parts.push(`<span class="badge-netto">Netto</span>`);
                if (v.ppn)       parts.push(`<span class="badge-ppn">+PPN</span>`);
                return `<div class="badges" id="badges_${kode}"${parts.length ? "" : ' style="display:none"'}>${parts.join("")}</div>`;
            })()}

            <div class="product-image">
                <img id="img_${kode}" src="${imageUrl}"
                     alt="${product.nama_item}" loading="lazy"
                     onerror="this.src=''">
            </div>

            <h3>${product.nama_item}</h3>

            ${specHTML}

            ${packHTML}

            ${pillsHTML}

            <div class="price-stock">
                <div class="price">${priceHTML}</div>
                <div class="stock ${stockClass} card-stock" id="stock_${kode}">
                    Stock: <strong>${stock}</strong>
                </div>
            </div>

            <button class="add-cart-btn" data-kode="${kode}">
                Tambah Order
            </button>

        </div>
    `;
}

/**
 * Ganti variant aktif pada satu card
 * Dipanggil dari onclick pill
 */
function switchVariant(kode, idx) {

    window._activeVariant[kode] = idx;

    const card = document.querySelector(`.product-card[data-kode="${kode}"]`);
    if (!card) return;

    let variants;
    try {
        variants = JSON.parse(card.dataset.variants);
    } catch { return; }

    const v = variants[idx];
    if (!v) return;

    // Ganti gambar
    const img = document.getElementById("img_" + kode);
    if (img && v.image) img.src = v.image;

    // Ganti harga — kalau variant ini tidak ada harganya (null), teks
    // DIKOSONGKAN, bukan dibiarkan (supaya harga variant SEBELUMNYA tidak
    // nyangkut/kelihatan seolah itu harga variant yang sekarang aktif).
    const priceEl  = document.getElementById("price_" + kode);
    const satuanEl = document.getElementById("satuan_" + kode);

    const hasValidPrice = v.harga !== undefined && v.harga !== null;

    if (priceEl) {
        priceEl.textContent = hasValidPrice
            ? "Rp " + Number(v.harga).toLocaleString("id-ID")
            : "";
    }
    if (satuanEl) {
        const priceUnitLabel = v.hargaType
            ? v.hargaType.toLowerCase()
            : (v.satuan ? v.satuan.toLowerCase() : "");
        satuanEl.textContent = (hasValidPrice && priceUnitLabel) ? "/ " + priceUnitLabel : "";
    }

    // Ganti stock
    const stockEl = document.getElementById("stock_" + kode);
    if (stockEl) {
        const stock = v.stock ?? 0;
        stockEl.textContent = "Stock: " + stock;
        stockEl.className   = "stock card-stock " +
            (stock > 0 ? "stock-ok" : "stock-empty");
    }

    // Ganti pack info
    const packEl = document.getElementById("pack_" + kode);
    if (packEl) {
        packEl.innerHTML = _buildPackHTML(v);
    }

    // Ganti spec — preserve expand/collapse state
    const specId   = "spec_" + kode.replace(/[^a-z0-9]/gi, "_");
    const specEl   = document.getElementById(specId);
    const specWrap = specEl?.closest(".product-spec-wrap");
    const toggleBtn = specWrap?.querySelector(".spec-toggle-btn");

    // Baca state sebelum update
    const wasOpen = toggleBtn?.dataset.open === "true";

    if (specEl && v.spec) {
        const entries = Object.entries(v.spec);
        const visible = entries.slice(0, 3);
        const hidden  = entries.slice(3);
        const makeItem = ([key, val], isHidden) => `
            <div class="spec-item${isHidden ? " spec-item-hidden" : ""}">
                <span class="spec-key">${key}</span>
                <span class="spec-val">${val}</span>
            </div>`;

        specEl.innerHTML =
            visible.map(e => makeItem(e, false)).join("") +
            hidden.map(e => makeItem(e, true)).join("");

        // Restore state yang sama
        const hiddenItems = specEl.querySelectorAll(".spec-item-hidden");

        if (hidden.length > 0 && toggleBtn) {
            hiddenItems.forEach(item => {
                // Kalau sebelumnya open → tampilkan, kalau closed → sembunyikan
                item.style.display = wasOpen ? "contents" : "none";
            });
            toggleBtn.dataset.open  = wasOpen ? "true" : "false";
            toggleBtn.textContent   = wasOpen
                ? "Sembunyikan ▴"
                : `Lihat ${hidden.length} spesifikasi lainnya ▾`;
            toggleBtn.style.display = "";
        } else if (toggleBtn) {
            // Variant baru tidak punya hidden spec → sembunyikan tombol toggle
            toggleBtn.style.display = "none";
        }
    }

    // Ganti badge Netto/PPN (per-variant), NEW tetap dipertahankan (per-produk)
    const badgesEl = document.getElementById("badges_" + kode);
    if (badgesEl) {
        const hadNew = !!badgesEl.querySelector(".badge-new");
        const parts  = [];
        if (hadNew)  parts.push(`<span class="badge-new">NEW</span>`);
        if (v.netto) parts.push(`<span class="badge-netto">Netto</span>`);
        if (v.ppn)   parts.push(`<span class="badge-ppn">+PPN</span>`);
        badgesEl.innerHTML     = parts.join("");
        badgesEl.style.display = parts.length ? "" : "none";
    }

    // Update active pill
    const pillsWrap = document.getElementById("pills_" + kode);
    if (pillsWrap) {
        pillsWrap.querySelectorAll(".pill").forEach((btn, i) => {
            btn.classList.toggle("active", i === idx);
        });
    }
}

/**
 * Toggle spec expand/collapse
 */
function toggleSpec(listId, btn) {
    const list        = document.getElementById(listId);
    if (!list) return;

    const hiddenItems = list.querySelectorAll(".spec-item-hidden");
    const count       = hiddenItems.length;
    const isOpen      = btn.dataset.open === "true";

    hiddenItems.forEach(item => {
        item.style.display = isOpen ? "none" : "contents";
    });

    btn.dataset.open = isOpen ? "false" : "true";
    btn.textContent  = isOpen
        ? `Lihat ${count} spesifikasi lainnya ▾`
        : "Sembunyikan ▴";
}

/**
 * Sembunyikan/tampilkan stock berdasarkan status login DAN preferensi
 * toggle "Tampilan Stock" di dropdown user (lihat navbar.js).
 * Dipanggil dari renderProducts setelah grid render, dan juga dari
 * navbar.js saat toggle diklik (tanpa perlu render ulang produk).
 */
function applyStockVisibility(isLoggedIn) {
    const manuallyHidden = typeof _isStockHidden === "function" ? _isStockHidden() : false;
    const shouldShow = isLoggedIn && !manuallyHidden;
    document.querySelectorAll(".card-stock").forEach(el => {
        el.style.display = shouldShow ? "" : "none";
    });
}

/**
 * ==========================================
 * VARIANT PILLS — drag-to-scroll horizontal
 * ==========================================
 * - Desktop: klik-tahan lalu geser (mouse drag)
 * - Mobile/tablet: swipe native (touch scroll bawaan browser)
 * - Menambahkan class "has-overflow" kalau kontennya melebihi lebar
 *   card, supaya fade-hint di tepi kanan hanya muncul saat perlu
 * Dipanggil sekali setelah grid produk selesai dirender
 */
function initVariantPillsScroll(scope) {
    const root = scope || document;

    root.querySelectorAll(".variant-pills").forEach(el => {

        // Hindari pasang listener dua kali pada elemen yang sama
        if (el.dataset.dragInit === "true") return;
        el.dataset.dragInit = "true";

        // Tandai overflow supaya fade hint hanya tampil saat pill-nya
        // memang lebih panjang dari lebar card
        const syncOverflow = () => {
            el.classList.toggle(
                "has-overflow",
                el.scrollWidth > el.clientWidth + 1
            );
            syncFadeEnd();
        };

        // Matikan fade begitu sudah scroll sampai ujung kanan (pill terakhir terlihat)
        const syncFadeEnd = () => {
            const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
            el.classList.toggle("at-end", atEnd);
        };

        syncOverflow();
        window.addEventListener("resize", syncOverflow);
        el.addEventListener("scroll", syncFadeEnd);

        // Drag-to-scroll pakai mouse (desktop)
        let isDown     = false;
        let startX     = 0;
        let startScroll = 0;
        let moved      = false;

        el.addEventListener("mousedown", (e) => {
            isDown = true;
            moved  = false;
            el.classList.add("dragging");
            startX = e.pageX;
            startScroll = el.scrollLeft;
        });

        window.addEventListener("mousemove", (e) => {
            if (!isDown) return;
            const dx = e.pageX - startX;
            if (Math.abs(dx) > 4) moved = true;
            el.scrollLeft = startScroll - dx;
        });

        const stopDrag = () => {
            if (!isDown) return;
            isDown = false;
            el.classList.remove("dragging");
        };
        window.addEventListener("mouseup", stopDrag);
        el.addEventListener("mouseleave", stopDrag);

        // Kalau ternyata cuma drag (bukan klik biasa), cegah klik pill
        // ke-trigger switchVariant secara tidak sengaja
        el.addEventListener("click", (e) => {
            if (moved) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);
    });
}
