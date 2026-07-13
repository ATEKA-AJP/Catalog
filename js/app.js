document.addEventListener(
    "DOMContentLoaded",
    initApp
);

async function initApp() {

    try {

        await Database.open();

        // Kalau app dibuka lewat Share Link (?guestToken=...), tukar tokennya
        // jadi sesi guest sebelum lanjut render apa pun.
        await _handleGuestLinkIfPresent();

        // Inisialisasi navbar — handle menu visibility,
        // login/logout button, dan page switching
        await Navbar.init();

        // Bell notifikasi perubahan katalog (harga/produk/varian baru) —
        // hanya tampil untuk user yang benar-benar login
        if (typeof NotificationBell !== "undefined") {
            await NotificationBell.init();
        }

        LoginModal.bindEvents();

        // Tampilkan catalog sebagai halaman awal
        await loadCatalog();

    } finally {

        // Overlay SELALU dihapus di akhir (baik sukses maupun ada error tak
        // terduga di tengah jalan) — supaya user tidak pernah terjebak di
        // layar loading kosong selamanya. Tapi karena ini ada di `finally`
        // SETELAH semua langkah di atas (bukan langsung di awal), menu yang
        // salah/berlebihan tetap tidak akan sempat kelihatan lebih dulu.
        _hideAppLoadingOverlay();

    }

}

function _hideAppLoadingOverlay() {
    const el = document.getElementById("appLoadingOverlay");
    if (el) el.remove();
}

/**
 * Deteksi parameter ?guestToken= di URL (dari Share Link yang di-share
 * sales/admin/supervisor). Kalau ada, minta nomor HP dulu (dipakai untuk
 * membatasi jumlah order per guest), validasi ke backend, simpan sebagai
 * sesi guest lokal, lalu bersihkan token dari address bar supaya tidak
 * nempel di history/bookmark.
 */
async function _handleGuestLinkIfPresent() {
    const params = new URLSearchParams(window.location.search);
    const guestToken = params.get("guestToken");

    if (!guestToken) return;

    let user = null;
    let attempts = 0;

    while (!user && attempts < 3) {
        attempts++;

        const phone = await Notify.prompt({
            title: "Masukkan nomor HP kamu",
            desc:  "Diperlukan untuk mengakses katalog & order sebagai tamu. Nomor ini tidak dipakai untuk hal lain selain membatasi jumlah order.",
            placeholder: "08xxxxxxxxxx",
            validate: (val) => {
                if (!val) return "Nomor HP wajib diisi.";
                const digits = val.replace(/[^\d+]/g, "");
                if (!/^(\+62|62|0)8\d{7,12}$/.test(digits)) {
                    return "Format nomor HP tidak valid (contoh: 08123456789).";
                }
                return null;
            }
        });

        try {
            const result = await API.guestLogin(guestToken, phone);

            if (result.status === "success" && result.user) {
                user = result.user;
            } else {
                throw new Error(result.message || "Link tidak valid.");
            }
        } catch (err) {
            Notify.error(err.message);

            // Error soal link itu sendiri (bukan soal nomor HP) — tidak ada
            // gunanya minta nomor HP ulang, langsung hentikan looping
            if (/kadaluarsa|tidak valid|dinonaktifkan|dihapus|tidak ditemukan/i.test(err.message)) {
                break;
            }
        }
    }

    if (!user) {
        Notify.error("Tidak bisa mengakses link ini. Minta link baru ke sales.");
    } else {
        await SessionStorage.save(user);

        const expiry = user.expiresAt
            ? new Date(user.expiresAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
            : "";

        Notify.success(
            expiry
                ? `Selamat datang! Akses tamu aktif sampai ${expiry}. Sisa order: ${user.remainingOrders ?? "-"}/${user.maxOrders ?? "-"}.`
                : "Selamat datang! Akses tamu aktif."
        );
    }

    // Bersihkan query string supaya guestToken tidak nempel di address bar,
    // history, atau ke-share ulang tanpa sengaja
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("guestToken");
    window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search);
}
