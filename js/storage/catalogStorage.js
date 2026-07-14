/**
 * ==========================================
 * AJP WEB CATALOG - Catalog Storage
 * ==========================================
 *
 * Strategi HYBRID DUAL-LAYER:
 *
 * Layer 1 — "page1" cache (fast display):
 *   Simpan hasil halaman 1 saja → tampil instan saat app dibuka
 *
 * Layer 2 — "full" cache (offline pagination):
 *   Simpan SEMUA produk di background → pagination offline jalan sempurna
 *
 * Flow Online:
 *   1. Cek layer 1 (page1) → tampilkan segera jika ada
 *   2. Fetch page 1 dari server → update tampilan
 *   3. Background: fetch semua halaman → simpan ke layer 2
 *
 * Flow Offline:
 *   → Load dari layer 2 (semua produk) → pagination client-side
 *   → Jika layer 2 belum ada, fallback ke layer 1 (halaman 1 saja)
 */

const CatalogStorage = {

    STORE:              "products",
    META_KEY:           "catalog_meta",
    PAGE_SIZE:          24,
    MAX_AGE_PAGE1_MS:   5  * 60 * 1000,   // 5 menit untuk page 1
    MAX_AGE_FULL_MS:    60 * 60 * 1000,   // 1 jam untuk full catalog

    _buildKey(user, suffix = "") {
        const base = (!user || !user.email)
            ? "public"
            : `user_${user.email}_${user.priceArea || "regular"}`;
        return suffix ? `${base}_${suffix}` : base;
    },

    async _getMeta() {
        try {
            const row = await Database.get(this.STORE, this.META_KEY);
            return row ? row.data : {};
        } catch { return {}; }
    },

    async _saveMeta(meta) {
        try {
            await Database.put(this.STORE, { kode: this.META_KEY, data: meta });
        } catch {}
    },

    async _isKeyFresh(key, maxAge) {
        const meta = await this._getMeta();
        const ts   = meta[key];
        if (!ts) return false;
        return (Date.now() - ts) < maxAge;
    },

    // ---- Layer 1: Page 1 Cache ----

    async isPage1Fresh(user) {
        return this._isKeyFresh(this._buildKey(user, "p1"), this.MAX_AGE_PAGE1_MS);
    },

    async loadPage1(user) {
        try {
            const row = await Database.get(this.STORE, this._buildKey(user, "p1"));
            return row ? row.data : null;
        } catch { return null; }
    },

    async savePage1(user, result) {
        const key = this._buildKey(user, "p1");
        try {
            await Database.put(this.STORE, { kode: key, data: result });
            const meta = await this._getMeta();
            meta[key] = Date.now();
            await this._saveMeta(meta);
        } catch {}
    },

    // ---- Layer 2: Full Catalog Cache ----

    async isFullFresh(user) {
        return this._isKeyFresh(this._buildKey(user, "full"), this.MAX_AGE_FULL_MS);
    },

    async hasFullCache(user) {
        try {
            const row = await Database.get(this.STORE, this._buildKey(user, "full"));
            return !!(row && row.data && row.data.products);
        } catch { return false; }
    },

    async loadFull(user) {
        try {
            const row = await Database.get(this.STORE, this._buildKey(user, "full"));
            return row ? row.data : null;
        } catch { return null; }
    },

    async saveFull(user, allProducts, priceArea, filters) {
        const key = this._buildKey(user, "full");
        try {
            await Database.put(this.STORE, {
                kode: key,
                data: { products: allProducts, priceArea, filters }
            });
            const meta = await this._getMeta();
            meta[key] = Date.now();
            await this._saveMeta(meta);
        } catch {}
    },

    /**
     * Pagination client-side dari full cache
     * Mendukung search, filter newOnly, sort
     */
    paginateLocal(allProducts, page = 1, options = {}) {
        let products = [...allProducts];

        // Search
        if (options.q) {
            const words = options.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
            products = products.filter(p => {
                const hay = [
                    p.kode, p.nama_item, p.kategori, p.sub_kategori,
                    JSON.stringify(p.varianData || [])
                ].join(" ").toLowerCase();
                return words.every(w => hay.includes(w));
            });
        }

        // Filter new only
        if (options.newOnly) products = products.filter(p => p.new === true);

        // Sort
        if (options.sort) products = this._sortProducts(products, options.sort);

        const total      = products.length;
        const pageSize   = this.PAGE_SIZE;
        const totalPages = Math.ceil(total / pageSize) || 1;
        const safePage   = Math.min(Math.max(1, page), totalPages);
        const start      = (safePage - 1) * pageSize;

        return {
            products:    products.slice(start, start + pageSize),
            allProducts: products,
            pagination: {
                page:       safePage,
                limit:      pageSize,
                total,
                totalPages
            }
        };
    },

    _sortProducts(arr, sort) {
        const a = [...arr];
        const minH = p => {
            const prices = (p.varianData || [])
                .map(v => Number(v.harga)).filter(n => !isNaN(n) && n > 0);
            return prices.length ? Math.min(...prices) : null;
        };
        switch (sort) {
            case "name_asc":   return a.sort((x,y) => String(x.nama_item||"").localeCompare(String(y.nama_item||"")));
            case "name_desc":  return a.sort((x,y) => String(y.nama_item||"").localeCompare(String(x.nama_item||"")));
            case "price_asc":  return a.sort((x,y) => { const px=minH(x),py=minH(y); return px===null?1:py===null?-1:px-py; });
            case "price_desc": return a.sort((x,y) => { const px=minH(x),py=minH(y); return px===null?1:py===null?-1:py-px; });
            case "newest":     return a.sort((x,y) => (y.new?1:0)-(x.new?1:0));
        }
        return a;
    },

    // ---- Kompatibilitas dengan kode lama ----

    async isFresh(user) {
        return this.isPage1Fresh(user);
    },

    async load(user) {
        return this.loadPage1(user);
    },

    async save(user, result) {
        return this.savePage1(user, result);
    },

    async invalidate(user) {
        const keys = [
            this._buildKey(user, "p1"),
            this._buildKey(user, "full")
        ];
        for (const key of keys) {
            try {
                await Database.delete(this.STORE, key);
            } catch {}
        }
        const meta = await this._getMeta();
        keys.forEach(k => delete meta[k]);
        await this._saveMeta(meta);
    }

};
