/**
 * ==========================================
 * AJP WEB CATALOG
 * Login Modal Component (Google GIS SDK) - FINAL
 * ==========================================
 */

const LoginModal = {

    /**
     * Membuka Modal Login dan memicu pembuatan tombol Google resmi
     */
    open() {
        const modal = document.getElementById("loginModal"); if (modal) modal.style.display = "flex"; this._gsiRetryCount = 0;

        // Login Google WAJIB internet (baik untuk hubungi Google maupun
        // verifikasi ke backend). Kalau sedang offline, beri tahu jelas
        // daripada modal terlihat "kosong"/rusak tanpa penjelasan.
        if (typeof AppOnline !== "undefined" && !AppOnline.isOnline) {
            const btnContainer = document.getElementById("googleBtn");
            if (btnContainer) {
                btnContainer.innerHTML = `
                    <p style="color:#92400E;background:#FEF3C7;border:1px solid #FDE68A;
                              border-radius:8px;padding:12px 14px;font-size:13px;text-align:left;margin:0;">
                        📴 Sedang offline. Login Google butuh koneksi internet
                        (minimal sekali di awal). Sambungkan internet dulu, lalu coba lagi.
                        Kalau sebelumnya sudah pernah login di perangkat ini, sesi kamu
                        seharusnya masih aktif tanpa perlu login ulang.
                    </p>`;
            }
            return;
        }

        this.initGoogleSignIn();
    },

    /**
     * Menutup Modal Login
     */
    close() {
        const modal = document.getElementById("loginModal"); if (modal) modal.style.display = "none";
    },

    /**
     * Menginisialisasi Google Identity Services (GIS)
     */
    initGoogleSignIn() {
        // Google GSI dimuat dengan async defer — belum tentu ready saat dipanggil
        // Coba lagi setiap 200ms sampai maksimal 5 detik
        if (typeof google === "undefined" || !google.accounts || !google.accounts.id) {
            if (!this._gsiRetryCount) this._gsiRetryCount = 0;
            if (this._gsiRetryCount < 25) {
                this._gsiRetryCount++;
                setTimeout(() => this.initGoogleSignIn(), 200);
            } else {
                this._gsiRetryCount = 0;
                console.error("Google Identity Services gagal dimuat setelah 5 detik.");

                const btnContainer = document.getElementById("googleBtn");
                if (btnContainer) {
                    btnContainer.innerHTML = `
                        <p style="color:#B91C1C;background:#FEE2E2;border:1px solid #FCA5A5;
                                  border-radius:8px;padding:12px 14px;font-size:13px;text-align:left;margin:0;">
                            Gagal memuat layanan Login Google. Cek koneksi internet kamu,
                            lalu tutup dan buka lagi jendela ini.
                        </p>`;
                }
            }
            return;
        }

        this._gsiRetryCount = 0;

        // 1. Konfigurasi Awal Google Auth
        google.accounts.id.initialize({
            client_id: CONFIG.GOOGLE_CLIENT_ID, // Memanggil Client ID aman dari config.js
            callback: (response) => this.handleCredentialResponse(response) // Fungsi callback setelah user pilih email
        });

        // 2. Perintahkan Google untuk merender tombol resmi ke dalam div #googleBtn
        google.accounts.id.renderButton(
            document.getElementById("googleBtn"),
            { 
                theme: "outline", 
                size: "large", 
                width: 300,        // Lebar tombol disesuaikan kotak modal (300px)
                text: "signin_with" // Teks otomatis: "Masuk dengan Google"
            }
        );
    },

    /**
     * Callback Otomatis setelah Sales/User sukses memilih akun Google mereka
     */
    async handleCredentialResponse(response) {
        try {
            const idToken = response.credential; 
            
            if (!idToken) {
                throw new Error("Gagal memperoleh ID Token valid dari Google.");
            }

            const btnContainer = document.getElementById("googleBtn");
            if (btnContainer) {
                btnContainer.innerHTML = "<em style='color: #1F4E5F; font-weight: 600; font-size: 14px;'>Memverifikasi Akun Ke Server Cloud...</em>";
            }

            // Gunakan Login.login() sebagai single entry point untuk auth flow
            // Login.login() sekarang throw Error dengan pesan asli dari backend
            // kalau gagal, jadi tidak perlu ditebak lagi di sini.
            const user = await Login.login(idToken);

            Notify.success(`Selamat Datang, ${user.nama}!`);
            this.close();
            // Beri jeda sebentar supaya toast sempat kelihatan sebelum reload
            setTimeout(() => window.location.reload(), 1200);

        } catch (error) {
            console.error("Proses Login Gagal:", error);
            Notify.error("Gagal Login: " + error.message);
            
            const btnContainer = document.getElementById("googleBtn");
            if (btnContainer) {
                btnContainer.innerHTML = "";
            }
            this.initGoogleSignIn();
        }
    },

    /**
     * Event Listener bawaan modal (klik luar area modal / tombol esc untuk menutup)
     */
    bindEvents() {
        const overlay = document.getElementById("loginModal");
        if (!overlay) return;

        // Klik di luar modal untuk tutup
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) {
                this.close();
            }
        });

        // ESC untuk tutup
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                this.close();
            }
        });

        // Tombol Batal
        document
            .getElementById("cancelLogin")
            ?.addEventListener("click", () => {
                this.close();
            });
    }
};