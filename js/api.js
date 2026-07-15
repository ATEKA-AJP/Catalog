/**
 * ==========================================
 * AJP WEB CATALOG - API Layer
 * ==========================================
 */

const API = {

    /**
     * Ambil token dari session untuk disertakan ke request
     * Token disimpan saat login dan dibutuhkan untuk semua POST endpoint
     */
    async getToken() {
        try {
            const user = await SessionStorage.load();
            return user ? (user.token || "") : "";
        } catch {
            return "";
        }
    },

    /**
     * Resolusi kredensial request: kalau session-nya guest (masuk lewat
     * Share Link) kirim guestToken, kalau bukan kirim token Google biasa.
     * Dipakai di semua request supaya guest & user biasa sama-sama bisa
     * mengakses endpoint yang relevan.
     */
    async _getAuthParams() {
        try {
            const user = await SessionStorage.load();
            if (!user) return {};
            if (user.role === "guest" && user.guestToken) {
                return { guestToken: user.guestToken, guestPhone: user.phone || "" };
            }
            return user.token ? { token: user.token } : {};
        } catch {
            return {};
        }
    },

    async get(action = "", params = {}) {
        const url = new URL(CONFIG.API_URL);

        if (action) {
            url.searchParams.append("action", action);
        }

        Object.keys(params).forEach(key => {
            url.searchParams.append(key, params[key]);
        });

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Gagal mengambil data dari server.");
        }

        const data = await response.json();
        return this._checkAuthError(data);
    },

    /**
     * Semua POST request otomatis membawa token dari session
     * Backend wajib menerima token untuk verifyUser() + requirePermission()
     */
    async post(payload = {}) {
        const auth = await this._getAuthParams();

        const response = await fetch(CONFIG.API_URL, {
            method: "POST",
            // text/plain menghindari CORS preflight (OPTIONS)
            // yang tidak didukung Google Apps Script.
            // Body tetap JSON string, hanya content-type yang berbeda.
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify({
                ...auth,
                ...payload
            })
        });

        if (!response.ok) {
            throw new Error("Gagal mengirim data ke server.");
        }

        const data = await response.json();
        return this._checkAuthError(data);
    },

    /**
     * Kalau backend bilang sesi/token sudah tidak valid (token Google
     * kadaluarsa, user dinonaktifkan/dihapus, dst — lihat AuthError di
     * backend), JANGAN biarkan pemanggil menganggapnya sebagai "data
     * kosong". Ini yang tadinya bikin: buka app besok pagi, ikon masih
     * kelihatan "login" (profil lokal masih ada), tapi katalog kosong —
     * padahal sebenarnya request-nya GAGAL karena token basi, cuma
     * gagalnya didiamkan begitu saja.
     *
     * Di sini: bersihkan session lokal, kabari bagian lain aplikasi
     * (Navbar, LoginModal) lewat event supaya UI langsung berubah ke
     * "logged out" + tawarkan login ulang — lalu throw supaya pemanggil
     * (catalog.js dst) tahu request ini GAGAL, bukan sekadar kosong.
     */
    async _checkAuthError(data) {
        if (data && data.status === "auth_error") {

            try { await SessionStorage.clear(); } catch {}

            window.dispatchEvent(new CustomEvent("ajp:auth-expired", {
                detail: { message: data.message || "Sesi login sudah berakhir." }
            }));

            const err = new Error(
                data.message || "Sesi login sudah berakhir, silakan login lagi."
            );
            err.isAuthError = true;
            throw err;
        }

        return data;
    },

    /**
     * Ambil produk — otomatis sertakan token/guestToken jika ada session.
     * Backend akan buka field harga (dan stock, untuk user biasa) berdasarkan
     * permission dari kredensial tersebut.
     */
    async getProducts(params = {}) {
        const auth = await this._getAuthParams();

        const response = await this.get(
            ACTIONS.PRODUCTS,
            { ...auth, ...params }
        );

        // status:"auth_error" sudah ditangani (throw) di dalam get()/_checkAuthError.
        // Sisanya: status:"error" lain (mis. area harga tidak diizinkan) juga
        // HARUS dianggap gagal, bukan "0 produk" — supaya pemanggil (catalog.js)
        // masuk ke jalur catch (fallback offline / pesan error), bukan diam-diam
        // menampilkan grid kosong seolah memang tidak ada produk.
        if (response.status === "error") {
            throw new Error(response.message || "Gagal memuat produk.");
        }

        return {
            products:   response.data,
            filters:    response.filters,
            pagination: response.pagination,
            role:       response.role,
            priceArea:  response.priceArea
        };
    },

    async verify(googleIdToken) {
        return await this.get(
            ACTIONS.VERIFY,
            { token: googleIdToken }
        );
    },

    /**
     * Tukar token dari Share Link (?guestToken=...) + nomor HP menjadi
     * profil guest. Dipanggil sekali di awal saat guest membuka link.
     */
    async guestLogin(guestToken, phone) {
        return await this.get(
            ACTIONS.GUEST_LOGIN,
            { guestToken, phone }
        );
    },

    /**
     * Generate (atau ambil ulang, kalau masih aktif) Share Link milik
     * user yang sedang login. `hours` opsional, default 24 jam di backend.
     */
    async generateShareLink(hours) {
        return await this.post({
            action: ACTIONS.GENERATE_SHARE_LINK,
            hours
        });
    },

    /**
     * Nonaktifkan Share Link aktif milik user yang sedang login.
     */
    async revokeShareLink() {
        return await this.post({
            action: ACTIONS.REVOKE_SHARE_LINK
        });
    },

    async createOrder(orderPayload) {
        return await this.post({
            action: ACTIONS.CREATE_ORDER,
            ...orderPayload
        });
    },

    async uploadPreview(headers, rows) {
        return await this.post({
            action:  ACTIONS.UPLOAD_PREVIEW,
            headers,
            rows
        });
    },

    async uploadImport(headers, rows, fileName = "") {
        return await this.post({
            action: ACTIONS.UPLOAD_IMPORT,
            headers,
            rows,
            fileName
        });
    },

    // ==========================================
    // Mapping & Unmapped (supervisor)
    // ==========================================

    async getMapping(q = "") {
        const token = await this.getToken();
        const params = { token };
        if (q) params.q = q;
        return await this.get(ACTIONS.GET_MAPPING, params);
    },

    async getUnmapped(status = "OPEN", page = 1) {
        const token = await this.getToken();
        return await this.get(ACTIONS.GET_UNMAPPED, { token, status, page });
    },

    async saveMapping(supplierKode, variantKode, itemDescription = "", include = true) {
        return await this.post({
            action: ACTIONS.SAVE_MAPPING,
            supplierKode,
            variantKode,
            itemDescription,
            include
        });
    },

    async updateMapping(supplierKode, include) {
        return await this.post({
            action: ACTIONS.UPDATE_MAPPING,
            supplierKode,
            include
        });
    },

    async updateUnmapped(itemNo, status, note = "") {
        return await this.post({
            action: ACTIONS.UPDATE_UNMAPPED,
            itemNo,
            status,
            note
        });
    },

    // ==========================================
    // User Management (supervisor)
    // ==========================================

    async getUsers() {
        const token = await this.getToken();
        return await this.get(ACTIONS.GET_USERS, { token });
    },

    async saveUser(userData) {
        return await this.post({
            action: ACTIONS.SAVE_USER,
            ...userData
        });
    }

};
