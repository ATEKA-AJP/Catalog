/**
 * ==========================================
 * AJP WEB CATALOG - Notification Storage
 * ==========================================
 * Histori perubahan katalog: perubahan harga, produk baru, varian/ukuran
 * baru. Dibuat otomatis saat katalog di-fetch ulang dan ketahuan ada yang
 * beda dari cache sebelumnya (lihat js/utils/catalogDiff.js dipanggil dari
 * catalog.js).
 */

const NotificationStorage = {

    STORE: "notifications",

    // Simpan maksimal segini biar IndexedDB tidak numpuk tanpa batas
    MAX_ITEMS: 200,

    async add(notif) {
        const record = {
            id:        "notif_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
            read:      false,
            createdAt: new Date().toISOString(),
            ...notif
        };
        await Database.put(this.STORE, record);
        await this._trim();
        return record;
    },

    async addMany(notifs) {
        for (const n of notifs) {
            await this.add(n);
        }
    },

    async getAll() {
        const all = await Database.getAll(this.STORE);
        // Terbaru duluan
        return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async unreadCount() {
        const all = await Database.getAll(this.STORE);
        return all.filter(n => !n.read).length;
    },

    async markRead(id) {
        const notif = await Database.get(this.STORE, id);
        if (!notif) return;
        notif.read = true;
        await Database.put(this.STORE, notif);
    },

    async markAllRead() {
        const all = await Database.getAll(this.STORE);
        for (const n of all) {
            if (!n.read) {
                n.read = true;
                await Database.put(this.STORE, n);
            }
        }
    },

    async clear() {
        await Database.clear(this.STORE);
    },

    // Buang notifikasi paling lama kalau sudah lewat MAX_ITEMS
    async _trim() {
        const all = await this.getAll();
        if (all.length <= this.MAX_ITEMS) return;

        const toRemove = all.slice(this.MAX_ITEMS);
        for (const n of toRemove) {
            await Database.delete(this.STORE, n.id);
        }
    }

};
