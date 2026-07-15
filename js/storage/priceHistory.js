/**
 * ==========================================
 * AJP WEB CATALOG - Price History
 * ==========================================
 * Beda dengan CatalogStorage (cache full-katalog, cuma untuk halaman 1
 * tanpa search/filter), PriceHistory melacak harga TERAKHIR YANG DIKETAHUI
 * per variant_kode — dan diupdate dari HASIL FETCH MANA PUN (search,
 * filter, sort, pagination, browse biasa). Ini yang bikin deteksi
 * perubahan harga tetap jalan biarpun user cuma pernah lihat produk itu
 * lewat pencarian, bukan lewat scroll katalog penuh.
 *
 * Deteksi "produk baru" / "varian baru" TETAP pakai CatalogDiff terhadap
 * cache full-katalog (lihat catalogDiff.js) — itu butuh gambaran lengkap
 * supaya tidak salah anggap "baru" padahal cuma belum kelihatan di
 * hasil search saat ini.
 */

const PriceHistory = {

    STORE: "priceHistory",

    /**
     * Cek harga produk-produk yang baru di-fetch (dari sumber apa pun —
     * search/filter/sort/browse) terhadap histori tersimpan. Kalau beda,
     * bikin notifikasi price_change. Selalu update histori ke harga
     * terbaru di akhir, apa pun hasilnya.
     *
     * @param {Array} products - hasil terbaru dari API (bentuk sama dengan
     *   response getProducts: [{kode, nama_item, varianData:[{variant_kode,varian,harga}]}])
     */
    async checkAndUpdate(products) {
        if (!Array.isArray(products) || products.length === 0) return;

        const changes = [];

        for (const product of products) {
            for (const v of (product.varianData || [])) {
                if (!v.variant_kode) continue;
                if (v.harga === undefined || v.harga === null) continue; // tidak ada izin lihat harga / memang kosong

                const newPrice = Number(v.harga);
                if (isNaN(newPrice)) continue;

                let existing;
                try {
                    existing = await Database.get(this.STORE, v.variant_kode);
                } catch { existing = undefined; }

                if (existing && Number(existing.harga) !== newPrice) {
                    changes.push({
                        type:        "price_change",
                        productKode: product.kode,
                        productName: product.nama_item,
                        variantName: (v.varian && v.varian !== "-") ? v.varian : "",
                        oldPrice:    Number(existing.harga),
                        newPrice:    newPrice
                    });
                }

                // Update/insert baseline harga terbaru — baik ada perubahan
                // maupun tidak, baik record baru maupun sudah ada
                try {
                    await Database.put(this.STORE, {
                        variant_kode: v.variant_kode,
                        harga:        newPrice,
                        productKode:  product.kode,
                        productName:  product.nama_item,
                        variantName:  (v.varian && v.varian !== "-") ? v.varian : "",
                        updatedAt:    new Date().toISOString()
                    });
                } catch {}
            }
        }

        if (changes.length > 0 && typeof NotificationStorage !== "undefined") {
            await NotificationStorage.addMany(changes);
            if (typeof NotificationBell !== "undefined") {
                await NotificationBell.refreshBadge();
            }
        }
    }

};
