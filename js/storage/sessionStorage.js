/**
 * ==========================================\
 * AJP WEB CATALOG
 * Session Storage Wrapper (IndexedDB Gateway)
 * ==========================================\
 */

const SessionStorage = {
    // Kunci nama tabel agar sinkron dengan database.js
    storeName: "session", 
    
    // Kunci ID baris data session di IndexedDB
    sessionKey: "current_logged_in_user", 

    /**
     * Menyimpan data session user setelah sukses login Google
     */
    async save(userData) {
        try {
            // Kita bungkus datanya agar memiliki keyPath yang sesuai
            const dataToSave = {
                email: this.sessionKey,
                profile: userData
            };
            await Database.put(this.storeName, dataToSave);
            console.log("SessionStorage: Data user berhasil disimpan ke IndexedDB.");
        } catch (error) {
            console.error("SessionStorage Save Error:", error);
            throw error;
        }
    },

    /**
     * Memuat data session aktif untuk dicek oleh catalog.js
     */
    async load() {
        try {
            const record = await Database.get(this.storeName, this.sessionKey);
            return record ? record.profile : null;
        } catch (error) {
            console.error("SessionStorage Load Error:", error);
            return null;
        }
    },

    /**
     * Menghapus session saat sales klik Logout
     */
    async clear() {
        try {
            await Database.delete(this.storeName, this.sessionKey);
            console.log("SessionStorage: Data session berhasil dihapus.");
        } catch (error) {
            console.error("SessionStorage Clear Error:", error);
            throw error;
        }
    }
};