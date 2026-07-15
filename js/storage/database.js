/**
 * ==========================================\
 * AJP WEB CATALOG
 * Core Database Config & Helpers (IndexedDB)
 * ==========================================\
 */

const Database = {
    db: null,

    // Menyimpan promise open() supaya idempotent — siapapun yang manggil
    // ready()/open() lebih dari sekali akan menunggu proses buka yang SAMA,
    // bukan bikin request indexedDB.open() baru.
    _openPromise: null,

    /**
     * Membuka koneksi IndexedDB dan memastikan semua tabel terbuat otomatis
     */
    open() {
        if (this._openPromise) return this._openPromise;

        this._openPromise = new Promise((resolve, reject) => {
            // v7: tambah tabel priceHistory (lihat catatan di bawah)
            const request = indexedDB.open(CONFIG.DB_NAME, 7);

            request.onupgradeneeded = (event) => {
                const db         = event.target.result;
                const oldVersion = event.oldVersion;

                if (!db.objectStoreNames.contains("products")) {
                    db.createObjectStore("products", { keyPath: "kode" });
                }

                if (!db.objectStoreNames.contains("session")) {
                    db.createObjectStore("session", { keyPath: "email" });
                }

                // v4 → v5: cart keyPath disederhanakan ke variant_kode
                // variant_kode sudah unik per variant di MASTER
                if (oldVersion < 5 && db.objectStoreNames.contains("cart")) {
                    db.deleteObjectStore("cart");
                }
                if (!db.objectStoreNames.contains("cart")) {
                    db.createObjectStore("cart", { keyPath: "variant_kode" });
                }

                if (!db.objectStoreNames.contains("drafts")) {
                    db.createObjectStore("drafts", { keyPath: "id" });
                }

                if (!db.objectStoreNames.contains("orderHistory")) {
                    db.createObjectStore("orderHistory", { keyPath: "id" });
                }

                // v6: histori notifikasi perubahan katalog (harga, produk
                // baru, varian/ukuran baru) — lihat js/storage/notifications.js
                if (!db.objectStoreNames.contains("notifications")) {
                    const store = db.createObjectStore("notifications", { keyPath: "id" });
                    store.createIndex("createdAt", "createdAt", { unique: false });
                }

                // v6: histori harga per-variant, dipakai untuk deteksi
                // perubahan harga di MANA PUN produk itu terlihat (search,
                // filter, sort, bukan cuma saat browse katalog penuh)
                if (!db.objectStoreNames.contains("priceHistory")) {
                    db.createObjectStore("priceHistory", { keyPath: "variant_kode" });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log("IndexedDB: Koneksi database AJP berhasil.");
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error("IndexedDB Error:", event.target.error);
                this._openPromise = null; // izinkan retry open() berikutnya
                reject(event.target.error);
            };

            // Kalau ada tab lain yang masih pegang koneksi versi lama,
            // upgrade akan nge-block tanpa pernah resolve/reject.
            // Tanpa handler ini, await Database.open() bisa nge-hang
            // diam-diam dan bikin login "lama banget".
            request.onblocked = () => {
                console.warn(
                    "IndexedDB: upgrade diblokir oleh tab lain yang masih terbuka. " +
                    "Tutup tab AJP lain lalu refresh halaman ini."
                );
            };
        });

        return this._openPromise;
    },

    /**
     * Dipanggil oleh semua fungsi get/put/delete/dst sebelum transaksi.
     * Kalau open() belum pernah dipanggil (mis. dipanggil dari kode yang
     * jalan sebelum app.js), fungsi ini akan memicunya sendiri lalu
     * menunggu sampai selesai — jadi tidak ada lagi kondisi "belum terbuka".
     */
    async _ensureReady() {
        if (this.db) return this.db;
        return this.open();
    },

    /**
     * FUNGSI AMBIL DATA (Suntikan Perbaikan Eror)
     * Mengambil satu data berdasarkan key (ID/Kode) dari tabel tertentu
     */
    async get(storeName, key) {
        await this._ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * FUNGSI AMBIL SEMUA DATA
     * Mengambil seluruh isi data dari tabel tertentu
     */
    async getAll(storeName) {
        await this._ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * FUNGSI SIMPAN/UPDATE DATA
     * Memasukkan atau memperbarui data ke dalam tabel tertentu
     */
    async put(storeName, data) {
        await this._ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, "readwrite");
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * FUNGSI HAPUS DATA
     * Menghapus satu data dari tabel tertentu berdasarkan key
     */
    async delete(storeName, key) {
        await this._ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, "readwrite");
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * FUNGSI BERSIHKAN SATU TABEL FULL
     */
    async clear(storeName) {
        await this._ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, "readwrite");
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
};