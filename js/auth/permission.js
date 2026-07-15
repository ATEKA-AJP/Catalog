/**
 * ==========================================
 * AJP WEB CATALOG
 * Permission System (Permission-Based)
 * ==========================================
 */
const Permission = {
    /**
     * Helper internal untuk mengambil session user
     */
    async getUserSession() {
        return await Session.getCurrentUser();
    },

    /**
     * Fungsi inti mengecek apakah user memiliki hak spesifik
     */
    async hasPermission(permissionName) {
        const user = await this.getUserSession();
        
        // Jika belum login, hanya diizinkan melihat katalog standar (public)
        if (!user || !user.permissions) {
            return permissionName === "catalog.view";
        }
        
        // Cek apakah permission yang diminta ada di dalam array permissions milik user
        return user.permissions.includes(permissionName);
    },

    /**
     * Shortcuts untuk mempermudah pemanggilan di file UI/komponen lainnya
     */
    async canViewPrice() {
        return await this.hasPermission("price.view");
    },

    async canUpload() {
        return await this.hasPermission("stock.import");
    },

    async canMapping() {
        return await this.hasPermission("mapping.edit");
    },

    async canManageUser() {
        return await this.hasPermission("user.manage");
    },

    /**
     * Mengecek apakah user diperbolehkan memindah-mindah area harga secara manual
     */
    async canChangePriceArea() {
        const user = await this.getUserSession();
        return user ? !!user.canChangeArea : false;
    }
};