/**
 * ==========================================
 * AJP WEB CATALOG - Catalog Storage
 * ==========================================
 * Stale-While-Revalidate cache untuk catalog.
 *
 * Strategi:
 * 1. Cek IndexedDB → kalau ada & fresh → tampilkan langsung (instant)
 * 2. Fetch dari API di background
 * 3. Kalau data beda → update tampilan tanpa flicker
 *
 * Cache key:
 * - "public"                     → public, max age 30 menit
 * - "user_{email}_{priceArea}"   → login, max age 5 menit
 */

const CatalogStorage = {

    STORE:             "products",
    META_KEY:          "catalog_meta",
    MAX_AGE_PUBLIC_MS: 30 * 60 * 1000,
    MAX_AGE_USER_MS:    5 * 60 * 1000,

    _buildKey(user) {
        if (!user || !user.email) return "public";
        return `user_${user.email}_${user.priceArea || "regular"}`;
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

    async isFresh(user) {
        const key    = this._buildKey(user);
        const maxAge = (!user || !user.email)
            ? this.MAX_AGE_PUBLIC_MS
            : this.MAX_AGE_USER_MS;

        const meta = await this._getMeta();
        const ts   = meta[key];
        if (!ts) return false;
        return (Date.now() - ts) < maxAge;
    },

    async load(user) {
        const key = this._buildKey(user);
        try {
            const row = await Database.get(this.STORE, key);
            return row ? row.data : null;
        } catch { return null; }
    },

    async save(user, apiResult) {
        const key = this._buildKey(user);
        try {
            await Database.put(this.STORE, { kode: key, data: apiResult });
            const meta = await this._getMeta();
            meta[key]  = Date.now();
            await this._saveMeta(meta);
        } catch {}
    },

    async invalidate(user) {
        const key = this._buildKey(user);
        try {
            await Database.delete(this.STORE, key);
            const meta = await this._getMeta();
            delete meta[key];
            await this._saveMeta(meta);
        } catch {}
    }

};
