/**
 * ==========================================
 * AJP WEB CATALOG - Users Page
 * ==========================================
 * Supervisor dapat:
 * - Lihat semua user
 * - Tambah user baru
 * - Edit user yang sudah ada (klik baris)
 */

const UsersPage = {

    async init() {

        const container =
            document.getElementById("pageUsers");

        if (!container) return;

        container.innerHTML = this._renderHTML();

        this._bindEvents();
        await this._load();

    },

    _renderHTML() {

        return `
            <div class="page-wrap">

                <div class="page-header">
                    <h2 class="page-title">User Management</h2>
                    <button id="btnAddUser" class="btn-primary">+ Tambah User</button>
                </div>

                <div id="usersTableWrap" class="table-wrap">
                    <p class="table-loading">Memuat data...</p>
                </div>

            </div>

            <!-- Modal Add / Edit User -->
            <div class="modal-overlay" id="userModal" style="display:none">
                <div class="form-modal">

                    <h3 class="form-modal-title" id="userModalTitle">Tambah User</h3>

                    <div class="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            id="userEmail"
                            placeholder="email@perusahaan.com"
                            class="form-input">
                    </div>

                    <div class="form-group">
                        <label>Nama</label>
                        <input
                            type="text"
                            id="userName"
                            placeholder="Nama lengkap"
                            class="form-input">
                    </div>

                    <div class="form-group">
                        <label>Role</label>
                        <select id="userRole" class="form-input">
                            <option value="sales">Sales</option>
                            <option value="admin">Admin</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="public">Public</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Area Access</label>
                        <div class="checkbox-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="areaRegular" value="regular" checked>
                                Regular
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="areaSumatra" value="sumatra">
                                Sumatra
                            </label>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Status</label>
                        <div class="checkbox-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="userAktif" checked>
                                Aktif
                            </label>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button id="userModalCancel" class="btn-secondary">Batal</button>
                        <button id="userModalSave" class="btn-primary">Simpan</button>
                    </div>

                </div>
            </div>
        `;

    },

    _bindEvents() {

        document
            .getElementById("btnAddUser")
            ?.addEventListener("click", () => {
                this._openModal(null);
            });

        document
            .getElementById("userModalCancel")
            ?.addEventListener("click", () => {
                this._closeModal();
            });

        document
            .getElementById("userModalSave")
            ?.addEventListener("click", () => {
                this._doSave();
            });

    },

    async _load() {

        const wrap =
            document.getElementById("usersTableWrap");

        wrap.innerHTML =
            `<p class="table-loading">Memuat data...</p>`;

        try {

            const result = await API.getUsers();

            if (result.status !== "success") {
                throw new Error(result.message);
            }

            this._renderTable(result.data);

        } catch (err) {

            wrap.innerHTML =
                `<p class="table-error">❌ ${err.message}</p>`;

        }

    },

    _renderTable(users) {

        const wrap =
            document.getElementById("usersTableWrap");

        if (!users || users.length === 0) {
            wrap.innerHTML =
                `<p class="table-empty">Belum ada user terdaftar.</p>`;
            return;
        }

        wrap.innerHTML = `
            <p class="table-count">${users.length} user terdaftar</p>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Email</th>
                        <th>Nama</th>
                        <th>Role</th>
                        <th>Area Access</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                        <tr>
                            <td>${u.email}</td>
                            <td>${u.nama}</td>
                            <td>
                                <span class="role-badge role-${u.role}">
                                    ${u.role}
                                </span>
                            </td>
                            <td>${Array.isArray(u.areaAccess)
                                    ? u.areaAccess.join(", ")
                                    : u.areaAccess || "-"}</td>
                            <td>
                                <span class="status-badge ${u.aktif ? "status-open" : "status-skip"}">
                                    ${u.aktif ? "Aktif" : "Non-aktif"}
                                </span>
                            </td>
                            <td>
                                <button
                                    class="btn-action btn-edit-user"
                                    data-email="${u.email}"
                                    data-nama="${u.nama}"
                                    data-role="${u.role}"
                                    data-area="${Array.isArray(u.areaAccess)
                                        ? u.areaAccess.join(",")
                                        : u.areaAccess || "regular"}"
                                    data-aktif="${u.aktif}">
                                    Edit
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;

        wrap.querySelectorAll(".btn-edit-user").forEach(btn => {
            btn.addEventListener("click", () => {
                this._openModal({
                    email:      btn.dataset.email,
                    nama:       btn.dataset.nama,
                    role:       btn.dataset.role,
                    areaAccess: btn.dataset.area.split(","),
                    aktif:      btn.dataset.aktif === "true"
                });
            });
        });

    },

    _openModal(user) {

        const modal =
            document.getElementById("userModal");

        const title =
            document.getElementById("userModalTitle");

        const emailInput =
            document.getElementById("userEmail");

        if (user) {

            title.textContent      = "Edit User";
            emailInput.value       = user.email;
            emailInput.disabled    = true; // Email tidak bisa diubah saat edit
            document.getElementById("userName").value = user.nama;
            document.getElementById("userRole").value = user.role;

            document.getElementById("areaRegular").checked =
                user.areaAccess.includes("regular");

            document.getElementById("areaSumatra").checked =
                user.areaAccess.includes("sumatra");

            document.getElementById("userAktif").checked = user.aktif;

        } else {

            title.textContent      = "Tambah User";
            emailInput.value       = "";
            emailInput.disabled    = false;
            document.getElementById("userName").value       = "";
            document.getElementById("userRole").value       = "sales";
            document.getElementById("areaRegular").checked = true;
            document.getElementById("areaSumatra").checked = false;
            document.getElementById("userAktif").checked   = true;

        }

        modal.style.display = "flex";

        setTimeout(() => {
            if (!emailInput.disabled) emailInput.focus();
        }, 100);

    },

    _closeModal() {

        document.getElementById("userModal").style.display = "none";

    },

    async _doSave() {

        const email =
            document.getElementById("userEmail")?.value.trim();

        const nama =
            document.getElementById("userName")?.value.trim();

        const role =
            document.getElementById("userRole")?.value;

        const areaAccess = [];

        if (document.getElementById("areaRegular")?.checked) {
            areaAccess.push("regular");
        }

        if (document.getElementById("areaSumatra")?.checked) {
            areaAccess.push("sumatra");
        }

        const aktif =
            document.getElementById("userAktif")?.checked;

        if (!email) { Notify.warn("Email wajib diisi."); return; }
        if (!nama)  { Notify.warn("Nama wajib diisi.");  return; }

        if (areaAccess.length === 0) {
            Notify.warn("Pilih minimal satu Area Access.");
            return;
        }

        const btn =
            document.getElementById("userModalSave");

        btn.disabled    = true;
        btn.textContent = "Menyimpan...";

        try {

            const result =
                await API.saveUser({
                    email,
                    nama,
                    role,
                    areaAccess,
                    aktif
                });

            if (result.status !== "success") {
                throw new Error(result.message);
            }

            Notify.success(result.message);
            this._closeModal();
            await this._load();

        } catch (err) {

            Notify.error(err.message);

        } finally {

            btn.disabled    = false;
            btn.textContent = "Simpan";

        }

    }

};

function loadUsers() {
    UsersPage.init();
}
