/**
 * ==========================================
 * AJP WEB CATALOG - Offline Support
 * ==========================================
 * 1. Mendaftarkan service worker (sw.js) supaya app shell
 *    (HTML/CSS/JS/gambar) tetap bisa dibuka tanpa internet.
 * 2. Memantau status koneksi (online/offline) dan menampilkan
 *    banner peringatan di atas layar saat koneksi terputus.
 * 3. Expose `AppOnline.isOnline` supaya bagian lain aplikasi
 *    (mis. tombol "Kirim Order Sekarang") bisa cek status koneksi
 *    sebelum melakukan aksi yang butuh network.
 * ==========================================
 */

const AppOnline = {

    isOnline: navigator.onLine,

    _listeners: [],

    // Daftarkan fungsi yang dipanggil setiap kali status online/offline berubah
    onChange(fn) {
        this._listeners.push(fn);
    },

    _notify() {
        this._listeners.forEach(fn => {
            try { fn(this.isOnline); } catch {}
        });
    },

    _renderBanner() {
        const el = document.getElementById("offlineBanner");
        if (!el) return;

        if (this.isOnline) {
            el.style.display = "none";
            el.innerHTML = "";
        } else {
            el.style.display = "block";
            el.innerHTML = `
                <div class="offline-banner-inner">
                    📴 Anda sedang offline — menampilkan data tersimpan terakhir.
                    Order baru tidak bisa dikirim sampai koneksi kembali (tetap bisa disimpan sebagai draft).
                </div>
            `;
        }
    },

    init() {
        this._renderBanner();

        window.addEventListener("online", () => {
            this.isOnline = true;
            this._renderBanner();
            this._notify();
        });

        window.addEventListener("offline", () => {
            this.isOnline = false;
            this._renderBanner();
            this._notify();
        });

        // Daftarkan service worker (kalau browser mendukung)
        if ("serviceWorker" in navigator) {
            window.addEventListener("load", () => {
                navigator.serviceWorker
                    .register("sw.js")
                    .catch(err => console.warn("Gagal mendaftarkan service worker:", err));
            });
        }
    }

};

AppOnline.init();
