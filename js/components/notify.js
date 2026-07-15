/**
 * ==========================================
 * AJP WEB CATALOG - Notify System
 * ==========================================
 * Menggantikan alert() dan confirm() browser
 * dengan UI yang lebih bersih.
 *
 * API:
 * Notify.success("Pesan berhasil")
 * Notify.error("Pesan error")
 * Notify.info("Pesan info")
 * await Notify.confirm("Yakin?")  → true / false
 */

const Notify = {

    _container: null,

    _init() {
        if (this._container) return;

        // Toast container
        const c = document.createElement("div");
        c.id = "notifyContainer";
        c.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        `;
        document.body.appendChild(c);
        this._container = c;

        // Confirm modal (reusable)
        const modal = document.createElement("div");
        modal.id = "notifyConfirmModal";
        modal.style.cssText = `
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.45);
            z-index: 10000;
            align-items: center;
            justify-content: center;
        `;
        modal.innerHTML = `
            <div style="
                background: #fff;
                border-radius: 16px;
                padding: 28px;
                max-width: 380px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.18);
                display: flex;
                flex-direction: column;
                gap: 20px;
            ">
                <p id="notifyConfirmMsg" style="
                    font-size: 15px;
                    font-weight: 600;
                    color: #1F4E5F;
                    margin: 0;
                    line-height: 1.6;
                "></p>
                <div style="display:flex;gap:10px;justify-content:flex-end">
                    <button id="notifyConfirmNo" style="
                        background: #fff;
                        border: 1px solid #E2E8F0;
                        border-radius: 8px;
                        padding: 10px 20px;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                        color: #1F4E5F;
                    ">Batal</button>
                    <button id="notifyConfirmYes" style="
                        background: #1F4E5F;
                        border: none;
                        border-radius: 8px;
                        padding: 10px 20px;
                        font-size: 14px;
                        font-weight: 700;
                        cursor: pointer;
                        color: #fff;
                    ">Ya, Lanjutkan</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    _toast(msg, type = "info", duration = 3500) {
        this._init();

        const colors = {
            success: { bg: "#DCFCE7", border: "#86EFAC", text: "#166534", icon: "✓" },
            error:   { bg: "#FEE2E2", border: "#FCA5A5", text: "#991B1B", icon: "✕" },
            info:    { bg: "#DBEAFE", border: "#93C5FD", text: "#1E40AF", icon: "ℹ" },
            warn:    { bg: "#FEF3C7", border: "#FCD34D", text: "#92400E", icon: "⚠" }
        };

        const c = colors[type] || colors.info;

        const toast = document.createElement("div");
        toast.style.cssText = `
            background: ${c.bg};
            border: 1px solid ${c.border};
            color: ${c.text};
            border-radius: 10px;
            padding: 12px 18px;
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: flex-start;
            gap: 10px;
            max-width: 340px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.1);
            pointer-events: auto;
            animation: notifySlideIn 0.25s ease;
            cursor: pointer;
        `;
        toast.innerHTML = `
            <span style="font-size:16px;flex-shrink:0;margin-top:1px">${c.icon}</span>
            <span style="flex:1;line-height:1.5">${msg}</span>
        `;

        // Klik untuk dismiss
        toast.addEventListener("click", () => this._dismiss(toast));

        this._container.appendChild(toast);

        // Auto dismiss
        setTimeout(() => this._dismiss(toast), duration);
    },

    _dismiss(toast) {
        if (!toast || !toast.parentNode) return;
        toast.style.opacity    = "0";
        toast.style.transform  = "translateX(20px)";
        toast.style.transition = "opacity 0.2s, transform 0.2s";
        setTimeout(() => toast.parentNode?.removeChild(toast), 220);
    },

    success(msg, duration = 3500) {
        this._toast(msg, "success", duration);
    },

    error(msg, duration = 5000) {
        this._toast(msg, "error", duration);
    },

    info(msg, duration = 3500) {
        this._toast(msg, "info", duration);
    },

    warn(msg, duration = 4000) {
        this._toast(msg, "warn", duration);
    },

    /**
     * Custom confirm dialog (async)
     * Menggantikan window.confirm()
     *
     * @param {string} msg - Pesan konfirmasi
     * @param {string} [yesLabel="Ya, Lanjutkan"] - Label tombol yes
     * @param {string} [noLabel="Batal"] - Label tombol no
     * @returns {Promise<boolean>}
     */
    confirm(msg, yesLabel = "Ya, Lanjutkan", noLabel = "Batal") {
        this._init();

        return new Promise((resolve) => {

            const modal = document.getElementById("notifyConfirmModal");
            const msgEl = document.getElementById("notifyConfirmMsg");
            const yesBtn = document.getElementById("notifyConfirmYes");
            const noBtn  = document.getElementById("notifyConfirmNo");

            msgEl.textContent = msg;
            yesBtn.textContent = yesLabel;
            noBtn.textContent  = noLabel;

            modal.style.display = "flex";

            const cleanup = (result) => {
                modal.style.display = "none";
                // Clone nodes untuk remove old listeners
                yesBtn.replaceWith(yesBtn.cloneNode(true));
                noBtn.replaceWith(noBtn.cloneNode(true));
                resolve(result);
            };

            document.getElementById("notifyConfirmYes")
                .addEventListener("click", () => cleanup(true));

            document.getElementById("notifyConfirmNo")
                .addEventListener("click", () => cleanup(false));

        });
    },

    _initPrompt() {
        if (this._promptModal) return;

        const modal = document.createElement("div");
        modal.id = "notifyPromptModal";
        modal.style.cssText = `
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.45);
            z-index: 10000;
            align-items: center;
            justify-content: center;
        `;
        modal.innerHTML = `
            <div style="
                background: #fff;
                border-radius: 16px;
                padding: 28px;
                max-width: 380px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.18);
                display: flex;
                flex-direction: column;
                gap: 14px;
            ">
                <p id="notifyPromptTitle" style="
                    font-size: 16px; font-weight: 700; color: #1F4E5F;
                    margin: 0; line-height: 1.5;
                "></p>
                <p id="notifyPromptDesc" style="
                    font-size: 13px; color: #64748B; margin: 0; line-height: 1.5;
                "></p>
                <input id="notifyPromptInput" type="text" style="
                    border: 1px solid #E2E8F0; border-radius: 8px;
                    padding: 11px 12px; font-size: 15px; outline: none;
                    width: 100%; box-sizing: border-box;
                ">
                <p id="notifyPromptError" style="
                    font-size: 12px; color: #EF4444; margin: 0; display: none;
                "></p>
                <div style="display:flex;justify-content:flex-end;gap:10px">
                    <button id="notifyPromptSubmit" style="
                        background: #1F4E5F; border: none; border-radius: 8px;
                        padding: 10px 22px; font-size: 14px; font-weight: 700;
                        cursor: pointer; color: #fff;
                    ">Lanjutkan</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this._promptModal = modal;
    },

    /**
     * Modal input teks generik (mis. untuk minta nomor HP guest).
     * Tidak bisa dibatalkan (tanpa tombol "Batal") kalau `dismissable`
     * di-set false — dipakai saat input itu memang wajib diisi supaya
     * bisa lanjut (mis. gerbang masuk sebelum browsing sebagai guest).
     *
     * @returns {Promise<string>} nilai input yang sudah lolos validasi
     */
    prompt({ title, desc = "", placeholder = "", validate } = {}) {
        this._initPrompt();

        return new Promise((resolve) => {

            const modal    = document.getElementById("notifyPromptModal");
            const titleEl  = document.getElementById("notifyPromptTitle");
            const descEl   = document.getElementById("notifyPromptDesc");
            const input    = document.getElementById("notifyPromptInput");
            const errorEl  = document.getElementById("notifyPromptError");
            const oldBtn   = document.getElementById("notifyPromptSubmit");

            titleEl.textContent = title || "";
            descEl.textContent  = desc;
            descEl.style.display = desc ? "" : "none";
            input.value = "";
            input.placeholder = placeholder;
            errorEl.style.display = "none";

            modal.style.display = "flex";
            setTimeout(() => input.focus(), 50);

            // Clone submit button untuk buang listener lama
            const submitBtn = oldBtn.cloneNode(true);
            oldBtn.replaceWith(submitBtn);

            const trySubmit = () => {
                const val = input.value.trim();
                const err = validate ? validate(val) : null;

                if (err) {
                    errorEl.textContent = err;
                    errorEl.style.display = "";
                    input.focus();
                    return;
                }

                modal.style.display = "none";
                resolve(val);
            };

            submitBtn.addEventListener("click", trySubmit);
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") trySubmit();
            });

        });
    }

};

// Inject keyframe animation
const _notifyStyle = document.createElement("style");
_notifyStyle.textContent = `
    @keyframes notifySlideIn {
        from { opacity: 0; transform: translateX(20px); }
        to   { opacity: 1; transform: translateX(0); }
    }
`;
document.head.appendChild(_notifyStyle);
