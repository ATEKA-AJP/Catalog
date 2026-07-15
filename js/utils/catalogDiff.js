/**
 * ==========================================
 * AJP WEB CATALOG - Catalog Diff
 * ==========================================
 * Bandingkan snapshot katalog LAMA (dari cache) vs BARU (baru di-fetch),
 * hasilkan daftar perubahan yang relevan buat notifikasi:
 * - price_change  → harga salah satu variant berubah
 * - new_product   → produk baru yang belum pernah ada
 * - new_variant   → varian/ukuran baru ditambahkan ke produk yang sudah ada
 *
 * Sengaja tidak mendeteksi "produk dihapus" — kemungkinan besar itu cuma
 * soal stock habis / status nonaktif di sheet, bukan sesuatu yang perlu
 * di-notif-kan sebagai perubahan penting.
 */

function diffCatalog(oldProducts, newProducts) {
    const changes = [];

    if (!Array.isArray(oldProducts) || !Array.isArray(newProducts)) {
        return changes;
    }

    // Kalau cache lama kosong total (pertama kali buka app), jangan anggap
    // SEMUA produk itu "baru" — itu bakal bikin ratusan notifikasi palsu.
    if (oldProducts.length === 0) {
        return changes;
    }

    const oldByKode = new Map(oldProducts.map(p => [p.kode, p]));

    for (const newProduct of newProducts) {
        const oldProduct = oldByKode.get(newProduct.kode);

        if (!oldProduct) {
            changes.push({
                type:        "new_product",
                productKode: newProduct.kode,
                productName: newProduct.nama_item
            });
            continue; // varian di produk yang sama sekali baru tidak perlu dicek satu-satu
        }

        const oldVariantsByKey = new Map(
            (oldProduct.varianData || []).map(v => [_variantKey(v, oldProduct.kode), v])
        );

        for (const newVariant of (newProduct.varianData || [])) {
            const key = _variantKey(newVariant, newProduct.kode);
            const oldVariant = oldVariantsByKey.get(key);

            if (!oldVariant) {
                changes.push({
                    type:        "new_variant",
                    productKode: newProduct.kode,
                    productName: newProduct.nama_item,
                    variantName: _variantLabel(newVariant)
                });
                continue;
            }

            // Perubahan harga — cuma valid kalau DUA sisinya punya field
            // harga (kalau salah satu undefined, mis. role tidak punya izin
            // lihat harga, jangan dianggap "berubah")
            if (
                oldVariant.harga !== undefined && oldVariant.harga !== null &&
                newVariant.harga !== undefined && newVariant.harga !== null &&
                Number(oldVariant.harga) !== Number(newVariant.harga)
            ) {
                changes.push({
                    type:        "price_change",
                    productKode: newProduct.kode,
                    productName: newProduct.nama_item,
                    variantName: _variantLabel(newVariant),
                    oldPrice:    Number(oldVariant.harga),
                    newPrice:    Number(newVariant.harga)
                });
            }
        }
    }

    return changes;
}

function _variantKey(v, productKode) {
    return (v.variant_kode && v.variant_kode !== productKode)
        ? v.variant_kode
        : (v.varian || "-");
}

function _variantLabel(v) {
    return (v.varian && v.varian !== "-") ? v.varian : "";
}
