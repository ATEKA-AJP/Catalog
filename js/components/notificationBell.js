/**
 * ==========================================
 * AJP WEB CATALOG - Notification Bell
 * ==========================================
 * Ikon lonceng di header + panel dropdown berisi histori perubahan katalog
 * (perubahan harga, produk baru, varian/ukuran baru). Hanya tampil untuk
 * user yang benar-benar login (sales/admin/supervisor) — lihat catalog.js
 * untuk logic deteksi perubahannya.
 */

const NotificationBell = {

    async init() {
        const user = await Session.getCurrentUser();
        const show = !!user && user.role !== "public" && user.role !== "guest";

        const wrap = document.getElementById("notifBellWrap");
        if (!wrap) return;

        if (!show) {
            wrap.style.display = "none";
            return;
        }

        wrap.style.display = "";
        await this.refreshBadge();

        document.getElementById("notifBellBtn")
            ?.addEventListener("click", (e) => {
                e.stopPropagation();
                this.togglePanel();
            });

        // Tutup panel kalau klik di luar
        document.addEventListener("click", (e) => {
            const panel = document.getElementById("notifPanel");
            if (panel && panel.style.display !== "none" && !wrap.contains(e.target)) {
                panel.style.display = "none";
            }
        });
    },

    async refreshBadge() {
        const badge = document.getElementById("notifBadge");
        if (!badge) return;

        const count = await NotificationStorage.unreadCount();

        if (count > 0) {
            badge.textContent  = count > 99 ? "99+" : String(count);
            badge.style.display = "flex";
        } else {
            badge.style.display = "none";
        }
    },

    async togglePanel() {
        const panel = document.getElementById("notifPanel");
        if (!panel) return;

        const isOpen = panel.style.display !== "none";
        if (isOpen) {
            panel.style.display = "none";
            return;
        }

        await this.renderPanel();
        panel.style.display = "block";
    },

    async renderPanel() {
        const panel = document.getElementById("notifPanel");
        if (!panel) return;

        const notifs = await NotificationStorage.getAll();

        panel.innerHTML = `
            <div class="notif-panel-header">
                <span>Notifikasi Perubahan Katalog</span>
                ${notifs.some(n => !n.read)
                    ? `<button id="notifMarkAllRead" class="notif-mark-all">Tandai semua dibaca</button>`
                    : ""}
            </div>
            <div class="notif-panel-list">
                ${notifs.length === 0
                    ? `<p class="notif-empty">Belum ada notifikasi.</p>`
                    : notifs.slice(0, 50).map(n => this._renderItem(n)).join("")}
            </div>
        `;

        document.getElementById("notifMarkAllRead")
            ?.addEventListener("click", async (e) => {
                e.stopPropagation();
                await NotificationStorage.markAllRead();
                await this.refreshBadge();
                await this.renderPanel();
            });

        panel.querySelectorAll(".notif-item").forEach(el => {
            el.addEventListener("click", async () => {
                const id = el.dataset.id;
                await NotificationStorage.markRead(id);
                el.classList.remove("unread");
                await this.refreshBadge();
            });
        });
    },

    _renderItem(n) {
        const icon = {
            price_change: "💰",
            new_product:  "🆕",
            new_variant:  "📏"
        }[n.type] || "🔔";

        return `
            <div class="notif-item ${n.read ? "" : "unread"}" data-id="${n.id}">
                <span class="notif-icon">${icon}</span>
                <div class="notif-body">
                    <p class="notif-text">${this._describe(n)}</p>
                    <p class="notif-time">${this._relativeTime(n.createdAt)}</p>
                </div>
                ${n.read ? "" : `<span class="notif-dot"></span>`}
            </div>
        `;
    },

    _describe(n) {
        const varLabel = n.variantName ? ` (${this._esc(n.variantName)})` : "";
        const name     = this._esc(n.productName || "");

        switch (n.type) {
            case "price_change":
                return `Harga <strong>${name}${varLabel}</strong> berubah dari `
                    + `Rp ${Number(n.oldPrice).toLocaleString("id-ID")} `
                    + `jadi Rp ${Number(n.newPrice).toLocaleString("id-ID")}`;
            case "new_product":
                return `Produk baru: <strong>${name}</strong>`;
            case "new_variant":
                return `Varian/ukuran baru ditambahkan ke <strong>${name}</strong>${varLabel}`;
            default:
                return "Ada perubahan pada katalog.";
        }
    },

    _esc(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    },

    _relativeTime(iso) {
        const diffMs  = Date.now() - new Date(iso).getTime();
        const minutes = Math.floor(diffMs / 60000);

        if (minutes < 1)  return "Baru saja";
        if (minutes < 60) return `${minutes} menit lalu`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} jam lalu`;

        const days = Math.floor(hours / 24);
        if (days < 7) return `${days} hari lalu`;

        return new Date(iso).toLocaleDateString("id-ID", {
            day: "numeric", month: "short", year: "numeric"
        });
    }

};
