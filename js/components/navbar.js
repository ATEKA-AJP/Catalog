/**
 * ==========================================
 * AJP WEB CATALOG - Navbar
 * ==========================================
 * Avatar button → dropdown menu berisi:
 * - Nama + Role user
 * - Toggle REG/SUM (hanya kalau punya akses sumatra)
 * - Tombol Logout
 */

const _PRICE_AREA_KEY = "ajp_price_area";

// Fungsi ini juga dipakai catalog.js
function _getActivePriceArea(user) {
    // Guest (Share Link) punya priceArea TETAP dari link-nya — tidak bisa
    // diganti-ganti lewat toggle, jadi jangan baca dari sessionStorage
    // (yang itu punya sales/admin/supervisor yang sedang login normal).
    if (user?.role === "guest") return user.priceArea || "regular";

    if (!user?.areaAccess?.includes("sumatra")) return "regular";
    return sessionStorage.getItem(_PRICE_AREA_KEY) || "regular";
}

function _setPriceArea(area) {
    sessionStorage.setItem(_PRICE_AREA_KEY, area);
}

// ==========================================
// TOGGLE STOCK — sembunyikan angka stock di card (mis. saat presentasi
// ke customer), murni tampilan lokal, tidak perlu reload data ke server
// ==========================================
const _STOCK_HIDDEN_KEY = "ajp_stock_hidden";

// Fungsi ini juga dipakai productCard.js (applyStockVisibility)
function _isStockHidden() {
    return sessionStorage.getItem(_STOCK_HIDDEN_KEY) === "true";
}

function _setStockHidden(hidden) {
    sessionStorage.setItem(_STOCK_HIDDEN_KEY, hidden ? "true" : "false");
}

const Navbar = {

    _menuPermissions: {
        menuProducts: null,
        menuOrders:   "order.view",
        menuUpload:   "stock.import",
        menuUnmapped: "mapping.edit",
        menuMapping:  "mapping.edit",
        menuUsers:    "user.manage"
    },

    _menuPages: {
        menuProducts: "pageCatalog",
        menuOrders:   "pageOrders",
        menuUpload:   "pageUpload",
        menuUnmapped: "pageUnmapped",
        menuMapping:  "pageMapping",
        menuUsers:    "pageUsers"
    },

    async init() {
        const user = await Session.getCurrentUser();
        this._applyPermissions(user);
        this._updateLoginButton(user);
        this._bindMenuEvents();
        this._injectDropdown(user);
    },

    /**
     * Dipanggil saat backend bilang token/sesi sudah tidak valid lagi
     * (lihat api.js `_checkAuthError`, event "ajp:auth-expired").
     * Update navbar jadi tampilan logged-out SEKARANG JUGA, tanpa reload
     * halaman — supaya user langsung bisa login ulang lewat modal yang
     * otomatis terbuka, bukan bingung kenapa avatar masih kelihatan
     * "login" padahal sebenarnya sesinya sudah mati.
     */
    forceLoggedOutUI() {
        this._applyPermissions(null);
        this._updateLoginButton(null);
        document.getElementById("userDropdown")?.remove();
    },

    _hide(el) { if (el) el.classList.add("hidden-menu"); },
    _show(el) { if (el) el.classList.remove("hidden-menu"); },

    _applyPermissions(user) {
        const roleMenu = document.getElementById("roleMenu");

        if (!user) { this._hide(roleMenu); return; }

        this._show(roleMenu);

        const perms = Array.isArray(user.permissions) ? user.permissions : [];

        console.log("[Navbar] role:", user.role, "| permissions:", perms);

        Object.entries(this._menuPermissions).forEach(([menuId, permission]) => {
            const el  = document.getElementById(menuId);
            if (!el) return;
            const canSee = permission === null || perms.includes(permission);
            canSee ? this._show(el) : this._hide(el);
        });
    },

    _updateLoginButton(user) {
        const btn = document.getElementById("loginButton");
        if (!btn) return;

        if (user) {
            const inisial = user.nama ? user.nama.charAt(0).toUpperCase() : "?";
            btn.innerHTML = `<span class="avatar-initial">${inisial}</span>`;
            btn.title     = user.nama;

            // Toggle dropdown saat klik avatar
            btn.onclick = (e) => {
                e.stopPropagation();
                const dd = document.getElementById("userDropdown");
                if (!dd) return;
                const isOpen = dd.style.display !== "none";
                dd.style.display = isOpen ? "none" : "block";
            };

        } else {
            btn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg"
                     viewBox="0 0 24 24" fill="currentColor"
                     style="width:20px;height:20px;">
                    <path fill-rule="evenodd"
                          d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25
                             8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1
                             12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
                          clip-rule="evenodd"/>
                </svg>`;
            btn.title   = "Login";
            btn.onclick = () => LoginModal.open();
        }
    },

    // ==========================================
    // DROPDOWN MENU
    // ==========================================
    _injectDropdown(user) {
        if (!user) return;

        const existingDD = document.getElementById("userDropdown");
        if (existingDD) existingDD.remove();

        const isGuest = user.role === "guest";

        const hasSumatra = user.areaAccess?.includes("sumatra");
        const activeArea = _getActivePriceArea(user);
        const stockHidden = _isStockHidden();

        // Share Link cuma boleh di-generate oleh user beneran (bukan guest)
        // yang punya izin order.edit (sales/admin/supervisor)
        const canShareLink = !isGuest &&
            Array.isArray(user.permissions) &&
            user.permissions.includes("order.edit");

        const roleLabel = {
            supervisor: "Supervisor",
            admin:      "Admin",
            sales:      "Sales",
            public:     "Public",
            guest:      "Guest (Share Link)"
        }[user.role] || user.role;

        const dropdown = document.createElement("div");
        dropdown.id    = "userDropdown";
        dropdown.innerHTML = `
            <!-- User Info -->
            <div class="dd-header">
                <p class="dd-name">${isGuest ? "Tamu" : user.nama}</p>
                <p class="dd-role">${roleLabel}</p>
                ${isGuest && user.expiresAt ? `
                <p class="dd-guest-expiry">
                    Sesi berlaku sampai<br>
                    <strong>${new Date(user.expiresAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</strong>
                </p>` : ""}
            </div>

            ${!isGuest ? `
            <!-- Settings (collapsible) -->
            <div class="dd-divider"></div>
            <div class="dd-section">
                <button class="dd-settings-btn" id="ddSettingsBtn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2"
                         style="width:14px;height:14px">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                    Settings
                    <span id="ddSettingsChevron" style="margin-left:auto">▾</span>
                </button>
                <div id="ddSettingsContent" style="display:none;padding-top:10px">
                    ${hasSumatra ? `
                    <p class="dd-section-label">Area Harga</p>
                    <div class="dd-area-toggle">
                        <button class="area-btn ${activeArea === "regular" ? "active" : ""}"
                                data-area="regular">RE</button>
                        <button class="area-btn ${activeArea === "sumatra" ? "active" : ""}"
                                data-area="sumatra">SU</button>
                    </div>
                    ` : ""}

                    <p class="dd-section-label" ${hasSumatra ? 'style="margin-top:14px"' : ""}>Tampilan Stock</p>
                    <div class="dd-area-toggle">
                        <button class="area-btn ${!stockHidden ? "active" : ""}"
                                data-stock="show">Tampil</button>
                        <button class="area-btn ${stockHidden ? "active" : ""}"
                                data-stock="hide">Sembunyi</button>
                    </div>
                </div>
            </div>
            ` : ""}

            ${canShareLink ? `
            <!-- Share Link -->
            <div class="dd-divider"></div>
            <div class="dd-section">
                <p class="dd-section-label">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2"
                         style="width:12px;height:12px;vertical-align:-1px;margin-right:4px">
                        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                    Share Link (Guest)
                </p>
                <p class="dd-share-desc">
                    Guest bisa lihat harga & order tanpa login.
                    Maks 3x order/nomor HP (aktif selama 12 jam).
                </p>
                <button class="dd-share-btn" id="ddBtnShareLink">
                    🔗 Copy Link
                </button>
                <button class="dd-share-revoke" id="ddBtnRevokeLink" style="display:none">
                    Nonaktifkan link aktif
                </button>
                <p class="dd-share-status" id="ddShareStatus"></p>
            </div>
            ` : ""}

            <div class="dd-divider"></div>

            <!-- Logout -->
            <button class="dd-logout" id="ddBtnLogout">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" stroke-width="2"
                     style="width:16px;height:16px">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                ${isGuest ? "Keluar dari sesi tamu" : "Logout"}
            </button>
        `;

        // Posisi dropdown di bawah loginButton
        const loginBtn = document.getElementById("loginButton");
        if (loginBtn?.parentNode) {
            loginBtn.parentNode.style.position = "relative";
            loginBtn.parentNode.appendChild(dropdown);
        } else {
            document.body.appendChild(dropdown);
        }

        // Logout / keluar sesi tamu
        document.getElementById("ddBtnLogout")
            ?.addEventListener("click", async () => {
                const ok = await Notify.confirm(
                    isGuest
                        ? "Keluar dari sesi tamu ini?"
                        : `Logout dari akun ${user.nama}?`,
                    isGuest ? "Keluar" : "Logout", "Batal"
                );
                if (!ok) return;
                await Auth.logout();
                window.location.reload();
            });

        // Settings toggle (collapsible)
        document.getElementById("ddSettingsBtn")
            ?.addEventListener("click", (e) => {
                e.stopPropagation();
                const content  = document.getElementById("ddSettingsContent");
                const chevron  = document.getElementById("ddSettingsChevron");
                const isOpen   = content?.style.display !== "none";
                if (content) content.style.display = isOpen ? "none" : "block";
                if (chevron) chevron.textContent    = isOpen ? "▾" : "▴";
            });

        // Price area toggle
        if (hasSumatra) {
            dropdown.querySelectorAll(".area-btn[data-area]").forEach(btn => {
                btn.addEventListener("click", async () => {
                    const area = btn.dataset.area;
                    _setPriceArea(area);

                    dropdown.querySelectorAll(".area-btn[data-area]").forEach(b =>
                        b.classList.toggle("active", b.dataset.area === area)
                    );

                    dropdown.style.display = "none";

                    await CatalogStorage.invalidate(user);

                    // Reload catalog
                    if (typeof loadCatalog === "function") {
                        loadCatalog(
                            typeof _currentQuery !== "undefined" ? _currentQuery : "",
                            typeof _currentPage  !== "undefined" ? _currentPage  : 1
                        );
                    }
                });
            });
        }

        // Toggle tampilan stock — murni tampilan lokal (tidak perlu fetch ulang
        // ke server), langsung show/hide angka stock yang sudah ada di layar
        dropdown.querySelectorAll(".area-btn[data-stock]").forEach(btn => {
            btn.addEventListener("click", () => {
                const hide = btn.dataset.stock === "hide";
                _setStockHidden(hide);

                dropdown.querySelectorAll(".area-btn[data-stock]").forEach(b =>
                    b.classList.toggle("active", (b.dataset.stock === "hide") === hide)
                );

                if (typeof applyStockVisibility === "function") {
                    applyStockVisibility(true); // dropdown ini hanya ada untuk user yang login
                }
            });
        });

        // Share Link — generate/copy
        if (canShareLink) {
            document.getElementById("ddBtnShareLink")
                ?.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    await this._handleShareLinkClick();
                });

            document.getElementById("ddBtnRevokeLink")
                ?.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const ok = await Notify.confirm(
                        "Nonaktifkan share link yang sedang aktif? Orang yang sudah punya link itu tidak akan bisa akses lagi.",
                        "Nonaktifkan", "Batal"
                    );
                    if (!ok) return;
                    try {
                        await API.revokeShareLink();
                        Notify.success("Share link dinonaktifkan.");
                        document.getElementById("ddBtnRevokeLink").style.display = "none";
                        document.getElementById("ddShareStatus").textContent = "";
                    } catch (err) {
                        Notify.error(err.message);
                    }
                });
        }

        // Tutup dropdown kalau klik di luar
        document.addEventListener("click", (e) => {
            if (!dropdown.contains(e.target)) {
                dropdown.style.display = "none";
            }
        });
    },

    /**
     * Generate (atau reuse) share link, copy ke clipboard, tampilkan status.
     */
    async _handleShareLinkClick() {
        const statusEl = document.getElementById("ddShareStatus");
        const revokeBtn = document.getElementById("ddBtnRevokeLink");
        const btn = document.getElementById("ddBtnShareLink");

        if (btn) { btn.disabled = true; btn.textContent = "Membuat link..."; }

        try {
            const result = await API.generateShareLink();
            if (result.status !== "success" || !result.token) {
                throw new Error(result.message || "Gagal membuat share link.");
            }

            const url = new URL(window.location.href);
            url.search = "";
            url.searchParams.set("guestToken", result.token);
            const fullUrl = url.toString();

            let copied = false;
            try {
                await navigator.clipboard.writeText(fullUrl);
                copied = true;
            } catch {
                copied = false;
            }

            const expiryText = result.expiresAt
                ? new Date(result.expiresAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
                : "";

            if (statusEl) {
                statusEl.innerHTML = copied
                    ? `✅ Link disalin! Berlaku sampai <strong>${expiryText}</strong>`
                    : `Link: <span style="word-break:break-all">${fullUrl}</span><br>Berlaku sampai <strong>${expiryText}</strong>`;
            }

            if (revokeBtn) revokeBtn.style.display = "";

            Notify.success(copied ? "Share link disalin ke clipboard!" : "Share link berhasil dibuat.");

        } catch (err) {
            Notify.error(err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = "🔗 Copy Link"; }
        }
    },

    _bindMenuEvents() {
        Object.entries(this._menuPages).forEach(([menuId]) => {
            const el = document.getElementById(menuId);
            if (!el) return;
            el.addEventListener("click", (e) => {
                e.preventDefault();
                this.switchPage(menuId);
            });
        });
    },

    switchPage(activeMenuId, skipLoad = false) {
        Object.keys(this._menuPages).forEach(menuId => {
            document.getElementById(menuId)?.classList.remove("active");
        });
        Object.values(this._menuPages).forEach(pageId => {
            const page = document.getElementById(pageId);
            if (page) page.style.display = "none";
        });

        document.getElementById(activeMenuId)?.classList.add("active");

        const targetPage = document.getElementById(this._menuPages[activeMenuId]);
        if (targetPage) targetPage.style.display = "";

        // skipLoad=true dipakai saat pemanggil ingin mengatur ulang konten
        // halaman secara manual (mis. reopen draft tertentu) tanpa memicu
        // reload/reset penuh dari _onPageLoad
        if (!skipLoad) this._onPageLoad(activeMenuId);
    },

    _onPageLoad(menuId) {
        switch (menuId) {
            case "menuProducts": if (typeof loadCatalog   === "function") loadCatalog();   break;
            case "menuOrders":   if (typeof loadOrders    === "function") loadOrders();    break;
            case "menuUpload":   if (typeof loadUpload    === "function") loadUpload();    break;
            case "menuUnmapped": if (typeof loadUnmapped  === "function") loadUnmapped();  break;
            case "menuMapping":  if (typeof loadMapping   === "function") loadMapping();   break;
            case "menuUsers":    if (typeof loadUsers     === "function") loadUsers();     break;
        }
    }

};
