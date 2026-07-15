/**
 * ==========================================
 * AJP WEB CATALOG - Orders
 * ==========================================
 *
 * Flow:
 * 1. Sales tambah item ke Cart (bebas, tanpa nama dulu)
 * 2. Di halaman Order → beri nama customer → Kirim atau Simpan Draft
 * 3. "Mulai Cart Baru" → cart sekarang jadi draft → siap order baru
 * 4. Draft list → bisa dibuka, diedit, dikirim kapan saja
 *
 * IndexedDB stores:
 * - "cart"         → satu cart aktif (items tanpa nama), keyPath: "kode"
 * - "drafts"       → draft order bernama, keyPath: "id"
 * - "orderHistory" → riwayat terkirim (summary), keyPath: "id"
 */

// ==========================================
// DRAFT ADD-MODE
// ==========================================
// Supaya sales bisa nambah beberapa produk berturut-turut ke draft
// yang sama tanpa harus klik "+ Tambah Produk" tiap kali. Setelah
// diaktifkan lewat start(), user tetap berada di halaman Produk
// setiap kali menambah item — banner kecil di atas layar menunjukkan
// draft mana yang sedang diisi & berapa item yang sudah ditambahkan,
// sampai user menekan "Selesai" (atau menutup draft-nya).
// ==========================================

const DraftAddMode = {

    _draftId:  null,
    _customer: "",
    _count:    0,

    start(draftId, customer) {
        this._draftId  = draftId;
        this._customer = customer;
        this._count    = 0;
        window._pendingDraftId = draftId;
        this.renderBanner();
    },

    isActive() {
        return !!this._draftId && window._pendingDraftId === this._draftId;
    },

    bumpCount() {
        this._count += 1;
        this.renderBanner();
    },

    // Dipanggil kalau mode dibatalkan tanpa melalui tombol "Selesai"
    // (mis. user menutup draft secara manual)
    cancel() {
        this._draftId  = null;
        this._customer = "";
        this._count    = 0;
        this.renderBanner();
    },

    async finish() {
        const draftId = this._draftId;
        this.cancel();
        window._pendingDraftId = null;

        if (draftId && typeof Navbar !== "undefined") {
            Navbar.switchPage("menuOrders", true);
            await OrderPage.refreshCart();
            await OrderPage._renderDraftList();
            await OrderPage._openDraft(draftId);
        }
    },

    renderBanner() {
        const el = document.getElementById("draftAddModeBanner");
        if (!el) return;

        if (!this.isActive()) {
            el.innerHTML = "";
            return;
        }

        el.innerHTML = `
            <div class="draft-addmode-banner">
                <span>
                    🛒 Sedang menambah produk ke draft <strong>"${this._customer}"</strong>
                    ${this._count > 0 ? ` — ${this._count} item ditambahkan` : " — pilih produk lalu Tambah Order"}
                </span>
                <button id="btnFinishDraftAddMode" class="btn-primary btn-sm">
                    ✓ Selesai &amp; Kembali ke Draft
                </button>
            </div>
        `;

        document.getElementById("btnFinishDraftAddMode")
            ?.addEventListener("click", () => this.finish());
    }

};

// ==========================================
// CART — satu cart aktif (sementara, tanpa nama)
// ==========================================

// ==========================================
// MERGE QTY — dipakai bareng oleh Cart & Draft
// ==========================================
// Supaya perilaku "tambah produk yang sama lagi" KONSISTEN di Cart maupun
// Draft: qty baru DITAMBAHKAN ke qty yang sudah ada (bukan menimpa), dan
// catatan pakai yang baru kalau diisi, kalau kosong pertahankan yang lama.
// Satu fungsi ini yang dipanggil dari kedua tempat, bukan ditulis ulang.
function mergeQty(existingItem, newQty) {
    return {
        carton: (existingItem?.carton || 0) + (newQty.carton || 0),
        inner:  (existingItem?.inner  || 0) + (newQty.inner  || 0),
        pack:   (existingItem?.pack   || 0) + (newQty.pack   || 0),
        pcs:    (existingItem?.pcs    || 0) + (newQty.pcs    || 0),
        note:   newQty.note || existingItem?.note || ""
    };
}

const Cart = {

    async getAll() {
        return await Database.getAll("cart");
    },

    async add(item) {
        // Kalau variant yang sama sudah ada di cart, gabungkan qty-nya
        // (bukan menimpa) — konsisten dengan perilaku di Draft. Dipakai
        // saat user pilih produk dari katalog / "+ Tambah Produk Lagi".
        //
        // PENTING: keyPath asli object store "cart" di IndexedDB adalah
        // `variant_kode` (lihat database.js), BUKAN `cart_id` — cart_id
        // cuma field dekoratif sisa skema lama. Query pencarian existing
        // HARUS pakai variant_kode, kalau tidak Database.get() selalu
        // balik undefined (dikira belum ada) padahal put() di bawah tetap
        // menimpa record lama berdasarkan variant_kode yang sama.
        const existing = await Database.get("cart", item.variant_kode);
        const finalItem = existing
            ? { ...item, ...mergeQty(existing, item) }
            : item;

        await Database.put("cart", finalItem);
        await this.updateBadge();
    },

    async set(item) {
        // TIMPA langsung dengan qty persis seperti yang diberikan — dipakai
        // saat user mengedit qty item yang SUDAH ada di cart (bukan
        // menambah item baru), jadi tidak boleh ikut ke-merge/dobel.
        await Database.put("cart", item);
        await this.updateBadge();
    },

    async remove(variantKode) {
        await Database.delete("cart", variantKode);
        await this.updateBadge();
    },

    async clear() {
        await Database.clear("cart");
        await this.updateBadge();
    },

    async count() {
        return (await this.getAll()).length;
    },

    async updateBadge() {
        try {
            const count = await this.count();
            const badge = document.getElementById("cartBadge");
            if (!badge) return;
            badge.textContent   = count;
            badge.style.display = count > 0 ? "inline-flex" : "none";
        } catch {}
    }

};

// ==========================================
// ORDER STORAGE — drafts & history
// ==========================================

const OrderStorage = {

    async saveDraft(customer, items, globalNote = "", nota = "") {
        const draft = {
            id:         "draft_" + Date.now(),
            customer:   customer.trim(),
            globalNote: globalNote.trim(),
            nota:       nota.trim(),
            items:      items,
            createdAt:  new Date().toISOString(),
            updatedAt:  new Date().toISOString()
        };
        await Database.put("drafts", draft);
        return draft;
    },

    async getDraft(id) {
        return await Database.get("drafts", id);
    },

    async getAllDrafts() {
        const all = await Database.getAll("drafts");
        return all.sort((a, b) =>
            new Date(b.updatedAt) - new Date(a.updatedAt)
        );
    },

    async updateDraft(draft) {
        draft.updatedAt = new Date().toISOString();
        await Database.put("drafts", draft);
    },

    async deleteDraft(id) {
        await Database.delete("drafts", id);
    },

    async saveHistory(customer, itemCount) {
        await Database.put("orderHistory", {
            id:        "hist_" + Date.now(),
            customer,
            itemCount,
            sentAt:    new Date().toISOString()
        });
    },

    async getAllHistory() {
        const all = await Database.getAll("orderHistory");
        return all.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
    },

    async cleanOldHistory() {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const all = await Database.getAll("orderHistory");
        for (const h of all) {
            if (new Date(h.sentAt) < cutoff) {
                await Database.delete("orderHistory", h.id);
            }
        }
    }

};

// ==========================================
// CART MODAL — tambah item ke cart aktif
// ==========================================

const CartModal = {

    _product: null,

    async open(product, activeIdx = 0) {
        this._product   = product;
        this._activeIdx = activeIdx;
        if (!document.getElementById("cartModal")) this._inject();
        this._populate(product, activeIdx);
        document.getElementById("cartModal").style.display = "flex";
    },

    _inject() {
        const el = document.createElement("div");
        el.innerHTML = `
            <div class="modal-overlay" id="cartModal" style="display:none">
                <div class="cart-modal">

                    <div class="cart-modal-header">
                        <h3 class="cart-modal-title">TAMBAH KE CART</h3>
                        <button id="cartModalClose" class="cart-modal-close">✕</button>
                    </div>

                    <div id="cartModalProduct"></div>

                    <div class="cart-qty-row">
                        ${["Carton","Inner","Pack","Pcs"].map(u => `
                            <div class="cart-qty-group">
                                <label>${u}</label>
                                <div class="qty-spinner">
                                    <button class="qty-btn" data-action="minus" data-unit="${u}">−</button>
                                    <input type="text" inputmode="numeric" pattern="[0-9]*" id="qty${u}" class="qty-input" value="0">
                                    <button class="qty-btn" data-action="plus" data-unit="${u}">+</button>
                                </div>
                            </div>
                        `).join("")}
                    </div>

                    <div class="form-group" style="margin-top:10px">
                        <label>Note (opsional)</label>
                        <input type="text" id="cartNote"
                            placeholder="Catatan untuk item ini..." class="form-input">
                    </div>

                    <div class="cart-modal-actions">
                        <button id="cartModalCancel" class="btn-secondary">Batal</button>
                        <button id="cartModalAdd" class="btn-primary">Tambah ke Cart</button>
                    </div>

                </div>
            </div>
        `;
        document.body.appendChild(el.firstElementChild);

        document.getElementById("cartModalClose")
            ?.addEventListener("click", () => this.close());
        document.getElementById("cartModalCancel")
            ?.addEventListener("click", () => this.close());
        document.getElementById("cartModalAdd")
            ?.addEventListener("click", () => this._addToCart());

        // Qty spinner via event delegation
        document.getElementById("cartModal")
            ?.addEventListener("click", (e) => {
                if (!e.target.classList.contains("qty-btn")) return;
                const unit  = e.target.dataset.unit;
                const input = document.getElementById("qty" + unit);
                if (!input) return;
                let val = parseInt(input.value) || 0;
                input.value = e.target.dataset.action === "plus"
                    ? val + 1 : Math.max(0, val - 1);
            });
    },

    _populate(product, activeIdx = 0) {
        const v = product.varianData[activeIdx] || product.varianData[0];

        const prodEl = document.getElementById("cartModalProduct");
        if (prodEl) {
            const packParts = [];
            if (v.inner  && v.inner  !== "-" && String(v.inner)  !== "0")
                packParts.push("Inner " + v.inner);
            if (v.carton && v.carton !== "-" && String(v.carton) !== "0")
                packParts.push("Carton " + v.carton);
            if (v.satuan && v.satuan !== "-")
                packParts.push(v.satuan);

            const priceUnitLabel = v.hargaType || v.satuan || "";

            const priceHTML = (v.harga !== undefined && v.harga !== null)
                ? `<p class="cart-modal-price">
                       Rp ${Number(v.harga).toLocaleString("id-ID")}
                       ${priceUnitLabel ? "/ " + priceUnitLabel : ""}
                   </p>`
                : "";

            const varianHTML = (v.varian && v.varian !== "-")
                ? `<span style="font-weight:400;color:#64748B"> — ${v.varian}</span>`
                : "";

            const packHTML = packParts.length > 0
                ? `<p class="cart-modal-packaging">📦 ${packParts.join(" · ")}</p>`
                : "";

            prodEl.innerHTML = `
                <div class="cart-modal-product">
                    <img src="${v.image || product.image || ""}" alt=""
                         class="cart-modal-img" onerror="this.style.display='none'">
                    <div>
                        <p class="cart-modal-name">${product.nama_item}${varianHTML}</p>
                        ${priceHTML}
                        <p class="cart-modal-stock">Stock: ${v.stock ?? 0}</p>
                        ${packHTML}
                    </div>
                </div>
            `;
        }

        // Reset inputs
        ["Carton","Inner","Pack","Pcs"].forEach(u => {
            const el = document.getElementById("qty" + u);
            if (el) el.value = 0;
        });
        const noteEl = document.getElementById("cartNote");
        if (noteEl) noteEl.value = "";
    },

    async _addToCart() {
        const product = this._product;
        if (!product) return;

        const v      = product.varianData[this._activeIdx || 0];
        const carton = parseInt(document.getElementById("qtyCarton")?.value) || 0;
        const inner  = parseInt(document.getElementById("qtyInner")?.value)  || 0;
        const pack   = parseInt(document.getElementById("qtyPack")?.value)   || 0;
        const pcs    = parseInt(document.getElementById("qtyPcs")?.value)    || 0;
        const note   = document.getElementById("cartNote")?.value.trim() || "";

        if (carton === 0 && inner === 0 && pack === 0 && pcs === 0) {
            Notify.warn("Isi minimal satu jumlah (Carton / Inner / Pack / Pcs).");
            return;
        }

        const vKode = v.variant_kode || product.kode;

        // ======================================================
        // MODE 1: sedang dalam mode "+ Tambah Produk" dari sebuah draft
        // → item HANYA masuk ke draft itu, TIDAK ikut masuk ke Cart aktif
        //   (sebelumnya item selalu ditambahkan ke Cart dulu di awal fungsi
        //   ini, lalu ditambahkan lagi ke draft di bawah — sehingga item
        //   muncul dobel di Cart & di draft. Sekarang dipisah jadi 2 mode
        //   yang saling eksklusif.)
        // ======================================================
        if (window._pendingDraftId) {
            const draftId = window._pendingDraftId;

            try {
                const d = await OrderStorage.getDraft(draftId);

                if (d) {
                    const newItem = {
                        kode:         product.kode,
                        variant_kode: vKode,
                        nama_item:    product.nama_item,
                        varian:       v.varian     || "-",
                        harga:        v.harga      || 0,
                        satuan:       v.satuan     || "",
                        hargaType:    v.hargaType  || "",
                        image:        v.image || product.image || "",
                        carton, inner, pack, pcs, note
                    };

                    const existing = d.items.findIndex(i =>
                        (i.variant_kode || i.kode) === vKode
                    );
                    if (existing >= 0) {
                        // Produk yang sama dipilih lagi lewat "+ Tambah Produk" —
                        // jumlahnya DITAMBAHKAN ke qty yang sudah ada di draft
                        // (pakai fungsi mergeQty yang sama dengan Cart), bukan
                        // menimpa — supaya tidak perlu scroll cari-cari item
                        // yang sama kalau cuma mau nambah jumlah.
                        d.items[existing] = {
                            ...d.items[existing],
                            ...mergeQty(d.items[existing], { carton, inner, pack, pcs, note })
                        };
                        Notify.success(`Qty "${product.nama_item}" di draft "${d.customer}" ditambahkan.`);
                    } else {
                        d.items.push(newItem);
                        Notify.success(`Ditambahkan ke draft "${d.customer}" (${d.items.length} item total).`);
                    }

                    await OrderStorage.updateDraft(d);

                    this.close();

                    // Tetap di mode tambah-berkelanjutan: TIDAK menutup mode &
                    // TIDAK pindah halaman, supaya user bisa langsung pilih
                    // produk berikutnya tanpa klik "+ Tambah Produk" lagi.
                    // User keluar dari mode ini lewat tombol "Selesai" di banner.
                    if (typeof DraftAddMode !== "undefined" && DraftAddMode.isActive()) {
                        DraftAddMode.bumpCount();
                    }
                    return;
                }
            } catch {}

            // Draft tidak ditemukan (mis. sudah dihapus) → bersihkan flag & mode,
            // lanjut sebagai penambahan normal ke Cart di bawah
            window._pendingDraftId = null;
            if (typeof DraftAddMode !== "undefined") DraftAddMode.cancel();
        }

        // ======================================================
        // MODE 2: normal → tambah ke Cart aktif
        // ======================================================

        // Buat cart_id yang benar-benar unik per variant:
        // Kombinasi kode + variant_kode + varian sebagai fallback berlapis
        // Ini memastikan variant berbeda dari produk sama tidak saling overwrite
        const cart_id = product.kode + "__" +
            (v.variant_kode && v.variant_kode !== product.kode
                ? v.variant_kode
                : (v.varian && v.varian !== "-"
                    ? v.varian
                    : String(this._activeIdx ?? 0)));

        await Cart.add({
            cart_id,                  // keyPath — dijamin unik
            variant_kode: vKode,
            kode:         product.kode,
            nama_item:    product.nama_item,
            varian:       v.varian   || "-",
            harga:        v.harga    || 0,
            satuan:       v.satuan   || "",
            hargaType:    v.hargaType || "",
            inner_info:   v.inner    || "",
            carton_info:  v.carton   || "",
            image:        v.image || product.image || "",
            carton, inner, pack, pcs, note
        });

        this.close();

        Notify.success(`${product.nama_item}${v.varian && v.varian !== "-" ? " — " + v.varian : ""} ditambahkan ke cart.`);

        const orderPage = document.getElementById("pageOrders");
        if (orderPage && orderPage.style.display !== "none") {
            await OrderPage.refreshCart();
        }
    },

    close() {
        const modal = document.getElementById("cartModal");
        if (modal) modal.style.display = "none";
        this._product = null;
    }

};

// ==========================================
// ORDER PAGE
// ==========================================

const OrderPage = {

    // Draft yang sedang dibuka di detail view
    _openDraftId: null,

    async init() {
        const container = document.getElementById("pageOrders");
        if (!container) return;
        container.innerHTML = this._renderShell();
        await OrderStorage.cleanOldHistory();
        await this.refreshCart();
        await this._renderDraftList();
        await this._renderHistory();
    },

    _renderShell() {
        return `
            <div class="page-wrap">

                <!-- SECTION: Cart aktif -->
                <div class="page-header">
                    <h2 class="page-title">Cart</h2>
                </div>

                <div id="cartSectionWrap"></div>

                <!-- SECTION: Draft list -->
                <div id="draftSectionWrap"></div>

                <!-- SECTION: Detail draft yang dibuka -->
                <div id="draftDetailWrap" style="display:none"></div>

                <!-- SECTION: History -->
                <div id="orderHistoryWrap"></div>

            </div>
        `;
    },

    async refreshCart() {
        const wrap  = document.getElementById("cartSectionWrap");
        if (!wrap) return;

        const items = await Cart.getAll();
        await Cart.updateBadge();

        const currentUser = await Session.getCurrentUser();
        const isGuest = currentUser?.role === "guest";

        if (items.length === 0) {
            wrap.innerHTML = `
                <div class="order-empty" style="margin-bottom:24px">
                    <p>Cart kosong.</p>
                    <p style="font-size:13px;color:#94A3B8">Pilih produk lalu klik "Tambah Order".</p>
                    <button onclick="Navbar.switchPage('menuProducts')"
                        class="btn-primary" style="margin-top:12px;font-size:13px;padding:8px 16px">
                        ← Ke Halaman Produk
                    </button>
                </div>`;
            return;
        }

        const warnings    = this._checkPriceChanges(items);
        const hasWarnings = Object.keys(warnings).length > 0;

        wrap.innerHTML = `
            ${hasWarnings ? `<div class="price-warning-banner" style="margin-bottom:12px">
                ⚠️ Ada ${Object.keys(warnings).length} item dengan perubahan harga.</div>` : ""}
            <div class="cart-list" style="background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:12px;">
                ${items.map(item => this._renderCartItem(item, warnings[item.variant_kode || item.kode])).join("")}
            </div>
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px">
                <p class="cart-total" style="margin:0">${items.length} item dalam cart</p>
                <button id="btnGoToProducts" class="btn-secondary btn-sm">+ Tambah Produk Lagi</button>
            </div>
            <div class="order-form-wrap" id="cartCheckoutForm">
                <div class="form-group">
                    <label>Nama Customer / Toko <span class="required">*</span></label>
                    <input type="text" id="cartCustomerName" placeholder="Contoh: Toko Makmur" class="form-input">
                </div>
                ${!isGuest ? `
                <div class="form-group">
                    <label>Nota / SH <span class="required">*</span></label>
                    <input type="text" id="cartNota" placeholder="Nomor nota / SH / faktur pajak" class="form-input">
                </div>
                ` : ""}
                <div class="form-group">
                    <label>Global Note (opsional)</label>
                    <input type="text" id="cartGlobalNote" placeholder="Catatan umum untuk order ini" class="form-input">
                </div>
                <div class="cart-checkout-actions">
                    <button id="btnSaveDraft" class="btn-secondary">💾 Simpan Draft</button>
                    <button id="btnSendNow" class="btn-primary btn-submit-order">Kirim Order Sekarang</button>
                </div>
            </div>`;

        document.getElementById("btnGoToProducts")
            ?.addEventListener("click", () => {
                if (typeof Navbar !== "undefined") Navbar.switchPage("menuProducts");
            });

        wrap.querySelectorAll(".btn-remove-cart").forEach(btn => {
            btn.addEventListener("click", async () => {
                await Cart.remove(btn.dataset.variantkey);
                await this.refreshCart();
            });
        });

        wrap.querySelectorAll(".btn-edit-cart").forEach(btn => {
            btn.addEventListener("click", () => this._openEditQty(btn.dataset.variantkey, items));
        });

        document.getElementById("btnSaveDraft")?.addEventListener("click", () => this._saveDraft());
        document.getElementById("btnSendNow")?.addEventListener("click", () => this._sendNow());
    },

    _openEditQty(variantKode, items) {
        const item = items.find(i => (i.variant_kode || i.kode) === variantKode);
        if (!item) return;

        const safeId = variantKode.replace(/[^a-z0-9_]/gi, "_");
        const existing = document.getElementById("editQtyPanel_" + safeId);
        if (existing) { existing.remove(); return; }

        const cartEl = document.querySelector(`.cart-item[data-variantkey="${item.variant_kode || item.kode}"]`);
        if (!cartEl) return;

        const panel = document.createElement("div");
        panel.id = "editQtyPanel_" + safeId;
        panel.style.cssText = "padding:12px 16px;background:#F8FAFC;border-top:1px solid var(--border)";
        panel.innerHTML = `
            <div class="cart-qty-row" style="margin-bottom:10px">
                ${["Carton","Inner","Pack","Pcs"].map(u => `
                    <div class="cart-qty-group">
                        <label>${u}</label>
                        <div class="qty-spinner">
                            <button class="qty-btn" data-action="minus" data-unit="${u}">−</button>
                            <input type="text" inputmode="numeric" pattern="[0-9]*" id="edit_qty${u}_${safeId}" class="qty-input"
                                value="${item[u.toLowerCase()] || 0}">
                            <button class="qty-btn" data-action="plus" data-unit="${u}">+</button>
                        </div>
                    </div>`).join("")}
            </div>
            <div class="form-group" style="margin-bottom:10px">
                <label style="font-size:12px;color:#64748B;font-weight:600">Catatan item (opsional)</label>
                <input type="text" id="edit_note_${safeId}" class="form-input"
                    value="${item.note || ""}"
                    placeholder="Catatan untuk item ini...">
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button id="editCancelBtn_${safeId}" class="btn-secondary btn-sm">Batal</button>
                <button id="editSaveBtn_${safeId}" class="btn-primary btn-sm">Simpan</button>
            </div>`;

        cartEl.after(panel);

        panel.querySelectorAll(".qty-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const u   = btn.dataset.unit;
                const inp = document.getElementById("edit_qty" + u + "_" + safeId);
                if (!inp) return;
                let val = parseInt(inp.value) || 0;
                inp.value = btn.dataset.action === "plus" ? val + 1 : Math.max(0, val - 1);
            });
        });

        document.getElementById("editCancelBtn_" + safeId)
            ?.addEventListener("click", () => panel.remove());

        document.getElementById("editSaveBtn_" + safeId)
            ?.addEventListener("click", async () => {
                const carton = parseInt(document.getElementById("edit_qtyCarton_" + safeId)?.value) || 0;
                const inner  = parseInt(document.getElementById("edit_qtyInner_"  + safeId)?.value) || 0;
                const pack   = parseInt(document.getElementById("edit_qtyPack_"   + safeId)?.value) || 0;
                const pcs    = parseInt(document.getElementById("edit_qtyPcs_"    + safeId)?.value) || 0;

                if (carton === 0 && inner === 0 && pack === 0 && pcs === 0) {
                    Notify.warn("Isi minimal satu jumlah."); return;
                }
                const editedNote = document.getElementById("edit_note_" + safeId)?.value.trim() || "";
                await Cart.set({ ...item, carton, inner, pack, pcs, note: editedNote });
                Notify.success("Item diperbarui.");
                await this.refreshCart();
            });
    },

    _renderCartItem(item, priceWarn) {
        const parts = [];
        if ((item.carton || 0) > 0) parts.push(item.carton + " Carton");
        if ((item.inner  || 0) > 0) parts.push(item.inner  + " Inner");
        if ((item.pack   || 0) > 0) parts.push(item.pack   + " Pack");
        if ((item.pcs    || 0) > 0) parts.push(item.pcs    + " Pcs");
        const qty        = parts.join(" · ") || "-";
        const varianLabel = item.varian && item.varian !== "-" ? " — " + item.varian : "";
        const cartKey    = item.variant_kode || item.kode;

        return `
            <div class="cart-item" data-variantkey="${item.variant_kode || item.kode}">
                <img src="${item.image}" alt="" class="cart-item-img" onerror="this.style.display='none'">
                <div class="cart-item-info">
                    <p class="cart-item-name">${item.nama_item}${varianLabel
                        ? '<span class="cart-item-varian">' + varianLabel + "</span>" : ""}</p>
                    <p class="cart-item-qty">${qty}</p>
                    ${item.harga ? '<p class="cart-item-price' + (priceWarn ? " price-changed" : "") + '">' +
                        "Rp " + Number(item.harga).toLocaleString("id-ID") +
                        ((item.hargaType || item.satuan) ? " / " + (item.hargaType || item.satuan) : "") + "</p>" : ""}
                    ${item.note ? '<p class="cart-item-note">📝 ' + item.note + "</p>" : ""}
                    ${priceWarn ? '<div class="price-warn-badge">⚠️ Harga berubah: Rp ' +
                        Number(priceWarn.oldPrice).toLocaleString("id-ID") + " → Rp " +
                        Number(priceWarn.newPrice).toLocaleString("id-ID") + "</div>" : ""}
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
                    <button class="btn-edit-cart" data-variantkey="${item.variant_kode || item.kode}"
                        style="background:none;border:1px solid var(--border);border-radius:6px;
                               padding:4px 8px;cursor:pointer;font-size:12px;color:#64748B"
                        title="Edit jumlah">✏️</button>
                    <button class="btn-remove-cart" data-variantkey="${item.variant_kode || item.kode}">✕</button>
                </div>
            </div>`;
    },


    _checkPriceChanges(items) {
        const warnings = {};
        items.forEach(item => {
            const lookupKode = item.productKode || item.kode;
            const prod = window._catalogProducts?.[lookupKode];
            if (!prod) return;

            const cur = prod.varianData?.find(v =>
                v.variant_kode === (item.variant_kode || item.kode)
            ) || prod.varianData?.[0];

            if (!cur) return;
            const cp = cur.harga;
            if (cp !== undefined && cp !== null && Number(cp) !== Number(item.harga)) {
                // Key pakai variant_kode agar variant berbeda bisa dibedakan
                const warnKey = item.variant_kode || item.kode;
                warnings[warnKey] = { oldPrice: item.harga, newPrice: cp };
            }
        });
        return warnings;
    },

    async _saveDraft() {
        const customer = document.getElementById("cartCustomerName")?.value.trim();
        const note     = document.getElementById("cartGlobalNote")?.value.trim() || "";
        const nota     = document.getElementById("cartNota")?.value.trim() || "";

        if (!customer) { Notify.warn("Nama customer wajib diisi untuk menyimpan draft."); return; }

        const items = await Cart.getAll();
        if (items.length === 0) { Notify.warn("Cart kosong."); return; }

        await OrderStorage.saveDraft(customer, items, note, nota);
        await Cart.clear();

        Notify.success(`Draft "${customer}" disimpan. Cart siap untuk order baru.`);

        await this.refreshCart();
        await this._renderDraftList();
    },

    async _sendNow() {
        if (typeof AppOnline !== "undefined" && !AppOnline.isOnline) {
            Notify.warn("Sedang offline — order tidak bisa dikirim sekarang. Simpan sebagai draft dulu, kirim nanti kalau sudah online.");
            return;
        }

        const currentUser = await Session.getCurrentUser();
        const isGuest = currentUser?.role === "guest";

        const customer = document.getElementById("cartCustomerName")?.value.trim();
        const note     = document.getElementById("cartGlobalNote")?.value.trim() || "";
        const nota     = document.getElementById("cartNota")?.value.trim() || "";

        if (!customer) { Notify.warn("Nama customer wajib diisi."); return; }
        if (!isGuest && !nota) { Notify.warn("Nota / SH wajib diisi."); return; }

        const items = await Cart.getAll();
        if (items.length === 0) { Notify.warn("Cart kosong."); return; }

        // Cek perubahan harga
        const warnings = this._checkPriceChanges(items);
        if (Object.keys(warnings).length > 0) {
            const ok = await Notify.confirm(
                `⚠️ Ada ${Object.keys(warnings).length} item dengan perubahan harga.\nTetap kirim dengan harga di cart?`,
                "Ya, Kirim", "Batal"
            );
            if (!ok) return;
        }

        const btn = document.getElementById("btnSendNow");
        if (btn) { btn.disabled = true; btn.textContent = "Mengirim..."; }

        try {
            const result = await API.createOrder({ customer, globalNote: note, nota, items });

            if (result.status !== "success") throw new Error(result.message);

            await OrderStorage.saveHistory(customer, items.length);
            await Cart.clear();

            Notify.success(`Order untuk "${customer}" berhasil dikirim!`);

            await this.refreshCart();
            await this._renderHistory();

        } catch (err) {
            Notify.error(err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = "Kirim Order Sekarang"; }
        }
    },

    // ==========================================
    // DRAFT LIST
    // ==========================================

    async _renderDraftList() {
        const wrap = document.getElementById("draftSectionWrap");
        if (!wrap) return;

        const drafts = await OrderStorage.getAllDrafts();

        if (drafts.length === 0) {
            wrap.innerHTML = "";
            return;
        }

        wrap.innerHTML = `
            <h3 class="section-title" style="margin-top:32px">
                Draft Tersimpan (${drafts.length})
            </h3>
            <div class="draft-list">
                ${drafts.map(d => this._renderDraftCard(d)).join("")}
            </div>
        `;

        drafts.forEach(d => {
            document.getElementById(`btnOpenDraft_${d.id}`)
                ?.addEventListener("click", () => this._openDraft(d.id));
            document.getElementById(`btnDeleteDraft_${d.id}`)
                ?.addEventListener("click", () => this._deleteDraft(d.id));
        });
    },

    _renderDraftCard(draft) {
        const date = new Date(draft.updatedAt).toLocaleDateString("id-ID", {
            day: "2-digit", month: "short", year: "numeric"
        });
        return `
            <div class="draft-card">
                <div class="draft-card-info">
                    <p class="draft-card-customer">${draft.customer}</p>
                    <p class="draft-card-meta">${draft.items.length} item · ${date}</p>
                </div>
                <div class="draft-card-actions">
                    <button id="btnOpenDraft_${draft.id}" class="btn-primary btn-sm">
                        Buka / Kirim
                    </button>
                    <button id="btnDeleteDraft_${draft.id}"
                        class="btn-secondary btn-sm btn-danger">
                        Hapus
                    </button>
                </div>
            </div>
        `;
    },

    async _openDraft(draftId) {
        this._openDraftId = draftId;
        const draft       = await OrderStorage.getDraft(draftId);
        if (!draft) return;

        const priceWarnings = this._checkPriceChanges(draft.items);
        const hasWarnings   = Object.keys(priceWarnings).length > 0;

        const currentUser = await Session.getCurrentUser();
        const isGuest = currentUser?.role === "guest";

        const wrap = document.getElementById("draftDetailWrap");
        if (!wrap) return;

        wrap.style.display = "block";
        wrap.innerHTML = `
            <div class="draft-detail" style="margin-top:24px">

                <div class="draft-detail-header">
                    <div>
                        <h3 class="draft-detail-title">${draft.customer}</h3>
                        <p class="draft-detail-meta">${draft.items.length} item</p>
                    </div>
                    <div style="display:flex;gap:8px">
                        <button id="btnAddProductToDraft" class="btn-secondary btn-sm">
                            + Tambah Produk
                        </button>
                        <button id="btnCloseDraft" class="btn-secondary btn-sm">✕ Tutup</button>
                    </div>
                </div>

                ${hasWarnings ? `
                    <div class="price-warning-banner">
                        ⚠️ Ada ${Object.keys(priceWarnings).length} item dengan perubahan harga.
                    </div>` : ""}

                <div class="draft-items" id="draftItemList">
                    ${draft.items.length === 0
                        ? `<p class="table-empty">Belum ada item. Klik "+ Tambah Produk" untuk mulai.</p>`
                        : draft.items.map(item =>
                            this._renderDraftItem(item, priceWarnings[item.variant_kode || item.kode], draftId)
                          ).join("")}
                </div>

                <div class="draft-send-form">
                    ${!isGuest ? `
                    <div class="form-group">
                        <label>Nota / SH <span class="required">*</span></label>
                        <input type="text" id="draftNota"
                            value="${draft.nota || ""}"
                            placeholder="Nomor nota / SH / faktur pajak"
                            class="form-input">
                    </div>
                    ` : ""}
                    <div class="form-group">
                        <label>Global Note (opsional)</label>
                        <input type="text" id="draftGlobalNote"
                            value="${draft.globalNote || ""}"
                            placeholder="Catatan umum untuk order ini"
                            class="form-input">
                    </div>
                    <div class="draft-send-actions">
                        <button id="btnSendDraft" class="btn-primary btn-submit-order"
                            ${draft.items.length === 0 ? "disabled" : ""}>
                            Kirim Order ke ${draft.customer}
                        </button>
                    </div>
                </div>

            </div>
        `;

        wrap.scrollIntoView({ behavior: "smooth", block: "start" });

        // Tambah Produk → pindah ke catalog dengan mode tambah-berkelanjutan aktif
        document.getElementById("btnAddProductToDraft")
            ?.addEventListener("click", () => {
                DraftAddMode.start(draftId, draft.customer);
                Notify.info(`Mode tambah produk ke "${draft.customer}" aktif. Pilih produk sebanyak yang dibutuhkan, lalu klik "Selesai" di banner atas.`);
                Navbar.switchPage("menuProducts");
            });

        document.getElementById("btnCloseDraft")?.addEventListener("click", () => {
            wrap.style.display = "none";
            this._openDraftId  = null;
            window._pendingDraftId = null;
            DraftAddMode.cancel();
        });

        // Spinner buttons untuk draft qty edit
        wrap.querySelectorAll(".qty-btn-draft").forEach(btn => {
            btn.addEventListener("click", () => {
                const unit  = btn.dataset.unit;
                const id    = btn.dataset.id;
                const input = document.getElementById(
                    "edit_" + unit.toLowerCase() + "_" + id
                );
                if (!input) return;
                let val = parseInt(input.value) || 0;
                input.value = btn.dataset.action === "plus"
                    ? val + 1 : Math.max(0, val - 1);
            });
        });

        // Bind hapus per item di draft
        wrap.querySelectorAll(".btn-remove-draft-item").forEach(btn => {
            btn.addEventListener("click", async () => {
                const variantKode = btn.dataset.variant;
                const d = await OrderStorage.getDraft(draftId);
                if (!d) return;
                d.items = d.items.filter(i =>
                    (i.variant_kode || i.kode) !== variantKode
                );
                await OrderStorage.updateDraft(d);
                await this._openDraft(draftId);
                await this._renderDraftList();
                await Cart.updateBadge();
            });
        });

        // Bind inline qty save
        wrap.querySelectorAll(".btn-save-draft-qty").forEach(btn => {
            btn.addEventListener("click", async () => {
                const variantKode = btn.dataset.variant;
                const uniqueId    = variantKode.replace(/[^a-zA-Z0-9_]/g, "_");
                const carton = parseInt(document.getElementById(`edit_carton_${uniqueId}`)?.value) || 0;
                const inner  = parseInt(document.getElementById(`edit_inner_${uniqueId}`)?.value)  || 0;
                const pack   = parseInt(document.getElementById(`edit_pack_${uniqueId}`)?.value)   || 0;
                const pcs    = parseInt(document.getElementById(`edit_pcs_${uniqueId}`)?.value)    || 0;
                const note   = document.getElementById(`edit_note_${uniqueId}`)?.value.trim() || "";

                if (carton === 0 && inner === 0 && pack === 0 && pcs === 0) {
                    Notify.warn("Qty tidak boleh semua 0.");
                    return;
                }

                const d = await OrderStorage.getDraft(draftId);
                if (!d) return;

                const idx = d.items.findIndex(i =>
                    (i.variant_kode || i.kode) === variantKode
                );
                if (idx >= 0) {
                    d.items[idx] = { ...d.items[idx], carton, inner, pack, pcs, note };
                    await OrderStorage.updateDraft(d);
                    Notify.success("Qty diperbarui.");
                    await this._openDraft(draftId);
                }
            });
        });

        document.getElementById("btnSendDraft")
            ?.addEventListener("click", () => this._sendDraft(draftId));
    },

    _renderDraftItem(item, priceWarn, draftId) {
        // Gunakan variant_kode sebagai unique ID agar variant berbeda bisa dibedakan
        const uniqueId = (item.variant_kode || item.kode).replace(/[^a-zA-Z0-9_]/g, "_");
        const varianLabel = item.varian && item.varian !== "-" ? ` — ${item.varian}` : "";
        const parts = [];
        if ((item.carton || 0) > 0) parts.push(item.carton + " Carton");
        if ((item.inner  || 0) > 0) parts.push(item.inner  + " Inner");
        if ((item.pack   || 0) > 0) parts.push(item.pack   + " Pack");
        if ((item.pcs    || 0) > 0) parts.push(item.pcs    + " Pcs");
        const qty = parts.join(" · ") || "-";

        return `
            <div class="draft-item">
                <img src="${item.image}" alt="" class="draft-item-img"
                    onerror="this.style.display='none'">
                <div class="draft-item-info">
                    <p class="draft-item-name">
                        ${item.nama_item}
                        ${varianLabel
                            ? `<span class="cart-item-varian">${varianLabel}</span>` : ""}
                    </p>
                    <p class="draft-item-qty">${qty}</p>
                    ${item.harga
                        ? `<p class="draft-item-price ${priceWarn ? "price-changed" : ""}">
                            Rp ${Number(item.harga).toLocaleString("id-ID")}
                            ${(item.hargaType || item.satuan) ? "/ " + (item.hargaType || item.satuan) : ""}
                           </p>` : ""}
                    ${item.note ? `<p class="cart-item-note">📝 ${item.note}</p>` : ""}
                    ${priceWarn ? `
                        <div class="price-warn-badge">
                            ⚠️ Rp ${Number(priceWarn.oldPrice).toLocaleString("id-ID")}
                            → Rp ${Number(priceWarn.newPrice).toLocaleString("id-ID")}
                        </div>` : ""}

                    <!-- Inline qty edit — sama dengan cart edit UI -->
                    <div class="draft-qty-edit">
                        <div class="cart-qty-row" style="margin:10px 0 8px 0">
                            ${["Carton","Inner","Pack","Pcs"].map(u => `
                                <div class="cart-qty-group">
                                    <label>${u}</label>
                                    <div class="qty-spinner">
                                        <button class="qty-btn qty-btn-draft"
                                            data-action="minus" data-unit="${u}"
                                            data-id="${uniqueId}">−</button>
                                        <input type="text" inputmode="numeric" pattern="[0-9]*"
                                            id="edit_${u.toLowerCase()}_${uniqueId}"
                                            class="qty-input"
                                            value="${item[u.toLowerCase()] || 0}">
                                        <button class="qty-btn qty-btn-draft"
                                            data-action="plus" data-unit="${u}"
                                            data-id="${uniqueId}">+</button>
                                    </div>
                                </div>`).join("")}
                        </div>
                        <div class="form-group" style="margin-bottom:10px">
                            <label style="font-size:12px;color:#64748B;font-weight:600">Catatan item (opsional)</label>
                            <input type="text" id="edit_note_${uniqueId}" class="form-input"
                                value="${item.note || ""}"
                                placeholder="Catatan untuk item ini...">
                        </div>
                        <div style="display:flex;justify-content:flex-end;gap:8px">
                            <button class="btn-save-draft-qty btn-primary btn-sm"
                                    data-variant="${item.variant_kode || item.kode}">
                                Simpan
                            </button>
                        </div>
                    </div>
                </div>
                <button class="btn-remove-draft-item btn-remove-cart"
                        data-variant="${item.variant_kode || item.kode}"
                        title="Hapus item">✕</button>
            </div>
        `;
    },

    async _sendDraft(draftId) {
        if (typeof AppOnline !== "undefined" && !AppOnline.isOnline) {
            Notify.warn("Sedang offline — order tidak bisa dikirim sekarang. Draft ini tetap tersimpan, coba kirim lagi kalau sudah online.");
            return;
        }

        const draft = await OrderStorage.getDraft(draftId);
        if (!draft || !draft.items.length) return;

        const currentUser = await Session.getCurrentUser();
        const isGuest = currentUser?.role === "guest";

        const note = document.getElementById("draftGlobalNote")?.value.trim() || "";
        const nota = document.getElementById("draftNota")?.value.trim() || "";

        if (!isGuest && !nota) { Notify.warn("Nota / SH wajib diisi sebelum kirim."); return; }

        draft.globalNote = note;
        draft.nota       = nota;
        await OrderStorage.updateDraft(draft);

        const warnings = this._checkPriceChanges(draft.items);
        if (Object.keys(warnings).length > 0) {
            const ok = await Notify.confirm(
                `⚠️ Ada ${Object.keys(warnings).length} item dengan perubahan harga.\nTetap kirim?`,
                "Ya, Kirim", "Batal"
            );
            if (!ok) return;
        }

        const btn = document.getElementById("btnSendDraft");
        if (btn) { btn.disabled = true; btn.textContent = "Mengirim..."; }

        try {
            const result = await API.createOrder({
                customer:   draft.customer,
                globalNote: draft.globalNote,
                nota:       draft.nota,
                items:      draft.items
            });

            if (result.status !== "success") throw new Error(result.message);

            await OrderStorage.saveHistory(draft.customer, draft.items.length);
            await OrderStorage.deleteDraft(draftId);

            Notify.success(`Order untuk "${draft.customer}" berhasil dikirim!`);

            document.getElementById("draftDetailWrap").style.display = "none";
            this._openDraftId = null;

            await this._renderDraftList();
            await this._renderHistory();

        } catch (err) {
            Notify.error(err.message);
            if (btn) {
                btn.disabled    = false;
                btn.textContent = `Kirim Order ke ${draft.customer}`;
            }
        }
    },

    async _deleteDraft(draftId) {
        const draft = await OrderStorage.getDraft(draftId);
        if (!draft) return;

        const ok = await Notify.confirm(
            `Hapus draft "${draft.customer}"?`,
            "Hapus", "Batal"
        );
        if (!ok) return;

        await OrderStorage.deleteDraft(draftId);

        if (this._openDraftId === draftId) {
            document.getElementById("draftDetailWrap").style.display = "none";
            this._openDraftId = null;
        }

        if (window._pendingDraftId === draftId) {
            window._pendingDraftId = null;
            DraftAddMode.cancel();
        }

        Notify.info(`Draft "${draft.customer}" dihapus.`);
        await this._renderDraftList();
    },

    // ==========================================
    // HISTORY
    // ==========================================

    async _renderHistory() {
        const wrap = document.getElementById("orderHistoryWrap");
        if (!wrap) return;

        const history = await OrderStorage.getAllHistory();
        if (history.length === 0) { wrap.innerHTML = ""; return; }

        wrap.innerHTML = `
            <h3 class="section-title" style="margin-top:32px">
                Riwayat Order (30 hari terakhir)
            </h3>
            <div class="history-list">
                ${history.map(h => {
                    const date = new Date(h.sentAt).toLocaleDateString("id-ID", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit"
                    });
                    return `
                        <div class="history-item">
                            <div>
                                <p class="history-customer">${h.customer}</p>
                                <p class="history-meta">${h.itemCount} item · ${date}</p>
                            </div>
                            <span class="status-badge status-open">Terkirim</span>
                        </div>`;
                }).join("")}
            </div>
        `;
    }

};

// ==========================================
// Entry points
// ==========================================

function loadOrders() {
    OrderPage.init();
}

function openCartModal(product, activeIdx = 0) {
    CartModal.open(product, activeIdx);
}
