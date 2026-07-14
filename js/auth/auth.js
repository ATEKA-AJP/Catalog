/**
 * ==========================================
 * AJP WEB CATALOG - Authentication Core (FINAL & SYNC)
 * ==========================================
 */

const Auth = {
    /**
     * Mengarahkan ke proses login inti di atas
     */
    async login(googleIdToken) {
        return await Login.login(googleIdToken);
    },

    /**
     * Mengosongkan session saat sales klik Logout
     */
    async logout() {
        try {
            await SessionStorage.clear(); // Mengosongkan IndexedDB table session
            return true;
        } catch (error) {
            console.error("Auth Logout Error:", error);
            return false;
        }
    },

    /**
     * Mengambil profil user yang sedang aktif dari session bridge
     */
    async getCurrentUser() {
        return await Session.getCurrentUser();
    },

    /**
     * Memeriksa status login (jika user ditemukan di IndexedDB, maka true)
     */
    async isLoggedIn() {
        const user = await this.getCurrentUser();
        return !!user;
    },

    /**
     * Gerbang pengecekan izin terpadu untuk komponen UI (seperti catalog.js atau productCard.js)
     */
    async can(permission) {
        switch(permission) {
            case "viewPrice":
                return await Permission.canViewPrice();
            case "upload":
                return await Permission.canUpload();
            case "mapping":
                return await Permission.canMapping();
            case "manageUser":
                return await Permission.canManageUser();
            case "changePriceArea":
                return await Permission.canChangePriceArea();
            default:
                return false;
        }
    }
};