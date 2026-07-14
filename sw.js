/**
 * ==========================================
 * AJP WEB CATALOG - Service Worker
 * ==========================================
 * Tujuan: supaya aplikasi (HTML/CSS/JS/gambar) tetap bisa dibuka
 * walau tidak ada koneksi internet (offline-first app shell).
 *
 * PENTING kalau deploy update baru:
 * Naikkan CACHE_VERSION di bawah setiap kali ada perubahan file
 * (HTML/CSS/JS). Kalau tidak dinaikkan, browser bisa tetap memakai
 * file lama dari cache dan perubahan baru tidak akan terlihat.
 * ==========================================
 */

const CACHE_VERSION = "ajp-catalog-v4";
const CACHE_NAME     = CACHE_VERSION;

// Semua file "app shell" yang wajib bisa diakses offline.
// Data produk/order tetap disimpan terpisah di IndexedDB (lihat
// js/storage/*), service worker ini HANYA menangani file statis.
const PRECACHE_ASSETS = [
    "./",
    "./index.html",
    "./manifest.json",

    "./css/variables.css",
    "./css/global.css",
    "./css/components.css",
    "./css/products.css",
    "./css/roleMenu.css",

    "./assets/Logo.png",
    "./assets/icon-192.png",
    "./assets/icon-512.png",
    "./assets/placeholder.webp",

    "./js/offline.js",
    "./js/config.js",
    "./js/api.js",
    "./js/app.js",

    "./js/auth/auth.js",
    "./js/auth/login.js",
    "./js/auth/logout.js",
    "./js/auth/permission.js",
    "./js/auth/session.js",

    "./js/components/badge.js",
    "./js/components/loginModal.js",
    "./js/components/modal.js",
    "./js/components/navbar.js",
    "./js/components/notify.js",
    "./js/components/notificationBell.js",
    "./js/components/orderCard.js",
    "./js/components/pagination.js",
    "./js/components/productCard.js",
    "./js/components/searchBar.js",

    "./js/pages/catalog.js",
    "./js/pages/mapping.js",
    "./js/pages/orders.js",
    "./js/pages/unmapped.js",
    "./js/pages/upload.js",
    "./js/pages/users.js",

    "./js/state/appState.js",

    "./js/storage/catalogStorage.js",
    "./js/storage/notifications.js",
    "./js/storage/priceHistory.js",
    "./js/storage/database.js",
    "./js/storage/orders.js",
    "./js/storage/sessionStorage.js",

    "./js/utils/constants.js",
    "./js/utils/catalogDiff.js",
    "./js/utils/formatter.js",
    "./js/utils/helpers.js",
    "./js/utils/validator.js"
];

// ==========================================
// INSTALL — precache seluruh app shell
// ==========================================
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ==========================================
// ACTIVATE — bersihkan cache versi lama
// ==========================================
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

// ==========================================
// FETCH
// ==========================================
// Strategi per jenis request:
//
// 1. Request ke backend (Google Apps Script) & layanan pihak ketiga
//    (Google Identity, cdnjs, dsb) → dibiarkan lewat apa adanya
//    (network only). Data produk/order sudah punya cache sendiri
//    di IndexedDB (lihat catalogStorage.js), jadi tidak perlu
//    di-cache di level service worker.
//
// 2. Request file statis same-origin (HTML/CSS/JS/gambar) →
//    stale-while-revalidate: langsung sajikan dari cache kalau ada
//    (supaya instant & tetap jalan offline), sambil diam-diam
//    fetch versi terbaru dari network untuk kunjungan berikutnya.
// ==========================================
self.addEventListener("fetch", (event) => {
    const req = event.request;

    // Hanya proses GET; selain itu (POST ke Apps Script dll) lewatkan
    if (req.method !== "GET") return;

    const url = new URL(req.url);

    // Request ke domain lain (API backend, Google, cdnjs) → network only
    if (url.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(req);

            const networkFetch = fetch(req)
                .then((res) => {
                    if (res && res.status === 200) {
                        cache.put(req, res.clone());
                    }
                    return res;
                })
                .catch(() => null);

            // Kalau ada di cache → langsung pakai itu (cepat + offline-ready),
            // update cache di background. Kalau tidak ada di cache →
            // tunggu network, dan kalau network juga gagal (offline +
            // belum pernah ke-cache), untuk navigasi halaman fallback
            // ke index.html supaya app shell tetap terbuka.
            if (cached) {
                networkFetch;
                return cached;
            }

            const fresh = await networkFetch;
            if (fresh) return fresh;

            if (req.mode === "navigate") {
                const fallback = await cache.match("./index.html");
                if (fallback) return fallback;
            }

            return new Response(
                "Offline dan file ini belum pernah dimuat sebelumnya.",
                { status: 503, statusText: "Offline" }
            );
        })
    );
});
