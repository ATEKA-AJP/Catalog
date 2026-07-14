/**
 * ==========================================
 * Login
 * ==========================================
 */

const Login = {

    async login(googleIdToken) {

        // Verifikasi ke backend (Google token + cek terdaftar/aktif di sheet User)
        const result =
            await API.verify(googleIdToken);

        if (
            result.status !== "success" ||
            !result.user
        ) {
            // Pesan asli dari backend, mis. "User tidak terdaftar",
            // "User tidak aktif", "Token tidak valid" — bukan digeneralisir.
            throw new Error(
                result.message || "Verifikasi akun gagal."
            );
        }

        // Simpan user data + token ke session.
        // Kalau ini gagal, itu BUKAN masalah "email tidak terdaftar" —
        // backend sudah bilang sukses di atas. Jadi error-nya dibiarkan
        // naik apa adanya supaya pesan ke user akurat.
        try {
            await SessionStorage.save({
                ...result.user,
                token: googleIdToken
            });
        } catch (storageError) {
            console.error("Gagal menyimpan session:", storageError);
            throw new Error(
                "Login ke server berhasil, tapi gagal menyimpan sesi di perangkat ini. " +
                "Coba muat ulang halaman lalu login lagi."
            );
        }

        return result.user;

    }

};