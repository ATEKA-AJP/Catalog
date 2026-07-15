/**
 * ==========================================
 * AJP WEB CATALOG
 * Authentication Session Bridge
 * ==========================================
 */

const Session = {
    /**
     * Mengambil data user yang sedang login saat ini
     */
    async getCurrentUser() {
        try {
            // Memanggil SessionStorage (IndexedDB) yang menyimpan profile user
            const user = await SessionStorage.load();
            if (!user) return null;

            // Sesi guest (dari Share Link) punya batas waktu — kalau sudah
            // lewat, otomatis dianggap logout tanpa perlu ke server dulu.
            // (Server tetap validasi ulang expiry di setiap request juga,
            // ini cuma supaya UI langsung tahu tanpa nunggu network gagal.)
            if (user.role === "guest" && user.expiresAt) {
                if (new Date() > new Date(user.expiresAt)) {
                    await SessionStorage.clear();
                    return null;
                }
            }

            return user;
        } catch (error) {
            console.error("Session Bridge Error:", error);
            return null;
        }
    },

    /**
     * Memeriksa apakah ada user yang sedang login atau tidak
     */
    async isLoggedIn() {
        const user = await this.getCurrentUser();
        return user !== null && !!user.email;
    }
};