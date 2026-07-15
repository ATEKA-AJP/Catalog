/**
 * ==========================================
 * AJP WEB CATALOG - Mapping Page
 * ==========================================
 * Kolom MAPPING: Supplier Kode | Variant Kode | Include | Item Description
 */

const MappingPage = {

    _searchTimer: null,

    async init() {
        const container = document.getElementById("pageMapping");
        if (!container) return;
        container.innerHTML = this._renderHTML();
        this._bindEvents();
        await this._load();
    },

    _renderHTML() {
        return `
            <div class="page-wrap">

                <div class="page-header">
                    <h2 class="page-title">Mapping</h2>
                    <button id="btnAddMapping" class="btn-primary">+ Tambah Mapping</button>
                </div>

                <!-- Form Tambah Mapping -->
                <div id="mappingFormWrap" class="inline-form-wrap" style="display:none">
                    <div class="inline-form">

                        <h4 class="inline-form-title">Mapping Baru</h4>

                        <div class="inline-form-row">
                            <div class="form-group">
                                <label>Supplier Kode <span class="required">*</span></label>
                                <input type="text" id="mappingSupplierKode"
                                    placeholder="Contoh: ABC001" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Variant Kode / MASTER <span class="required">*</span></label>
                                <input type="text" id="mappingVariantKode"
                                    placeholder="Contoh: BP-GP10-RED" class="form-input">
                            </div>
                        </div>

                        <div class="inline-form-row">
                            <div class="form-group">
                                <label>Item Description (dari file supplier)</label>
                                <input type="text" id="mappingItemDesc"
                                    placeholder="Contoh: Ballpoint GP10 Red" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Status</label>
                                <select id="mappingInclude" class="form-input">
                                    <option value="include">Include</option>
                                    <option value="exclude">Exclude</option>
                                </select>
                            </div>
                        </div>

                        <div class="inline-form-actions">
                            <button id="btnMappingCancel" class="btn-secondary">Batal</button>
                            <button id="btnMappingSave" class="btn-primary">Simpan</button>
                        </div>

                    </div>
                </div>

                <div class="table-toolbar">
                    <div class="search-input-wrap">
                        <input type="text" id="mappingSearch"
                            placeholder="Search supplier kode / variant kode / description..."
                            class="table-search">
                    </div>
                </div>

                <div id="mappingTableWrap" class="table-wrap">
                    <p class="table-loading">Memuat data...</p>
                </div>

            </div>
        `;
    },

    _bindEvents() {

        document.getElementById("btnAddMapping")
            ?.addEventListener("click", () => this._toggleForm(true));

        document.getElementById("btnMappingCancel")
            ?.addEventListener("click", () => this._toggleForm(false));

        document.getElementById("btnMappingSave")
            ?.addEventListener("click", () => this._doSave());

        document.getElementById("mappingSearch")
            ?.addEventListener("input", () => {
                clearTimeout(this._searchTimer);
                this._searchTimer = setTimeout(() => this._load(), 400);
            });

    },

    async _load() {

        const wrap = document.getElementById("mappingTableWrap");
        wrap.innerHTML = `<p class="table-loading">Memuat data...</p>`;

        try {
            const q = document.getElementById("mappingSearch")?.value.trim() || "";
            const result = await API.getMapping(q);

            if (result.status !== "success") throw new Error(result.message);

            this._renderTable(result.data, result.total);

        } catch (err) {
            wrap.innerHTML = `<p class="table-error">❌ ${err.message}</p>`;
        }

    },

    _renderTable(rows, total) {

        const wrap = document.getElementById("mappingTableWrap");

        if (!rows || rows.length === 0) {
            wrap.innerHTML = `<p class="table-empty">Belum ada data mapping.</p>`;
            return;
        }

        wrap.innerHTML = `
            <p class="table-count">
                Menampilkan ${rows.length.toLocaleString("id-ID")}
                ${total !== rows.length ? ` dari ${total.toLocaleString("id-ID")}` : ""}
                mapping
            </p>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Supplier Kode</th>
                        <th>Item Description</th>
                        <th>Variant Kode</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td class="td-mono">${r.supplierKode}</td>
                            <td style="color:#64748B;font-size:13px">
                                ${r.itemDescription || "-"}
                            </td>
                            <td class="td-mono">${r.variantKode}</td>
                            <td>
                                <span class="status-badge ${r.include ? "status-open" : "status-skip"}">
                                    ${r.include ? "Include" : "Exclude"}
                                </span>
                            </td>
                            <td>
                                <button
                                    class="btn-action btn-toggle-include"
                                    data-kode="${r.supplierKode}"
                                    data-include="${r.include}">
                                    ${r.include ? "Set Exclude" : "Set Include"}
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;

        // Bind toggle buttons
        wrap.querySelectorAll(".btn-toggle-include").forEach(btn => {
            btn.addEventListener("click", () => {
                const currentInclude = btn.dataset.include === "true";
                this._doToggle(btn.dataset.kode, !currentInclude);
            });
        });

    },

    _toggleForm(show) {
        const formWrap = document.getElementById("mappingFormWrap");
        formWrap.style.display = show ? "block" : "none";
        if (show) {
            document.getElementById("mappingSupplierKode")?.focus();
        } else {
            document.getElementById("mappingSupplierKode").value = "";
            document.getElementById("mappingVariantKode").value  = "";
            document.getElementById("mappingItemDesc").value     = "";
            document.getElementById("mappingInclude").value      = "include";
        }
    },

    async _doSave() {

        const supplierKode =
            document.getElementById("mappingSupplierKode")?.value.trim().toUpperCase();
        const variantKode =
            document.getElementById("mappingVariantKode")?.value.trim();
        const itemDesc =
            document.getElementById("mappingItemDesc")?.value.trim();
        const include =
            document.getElementById("mappingInclude")?.value === "include";

        if (!supplierKode) { Notify.error("Supplier Kode wajib diisi."); return; }
        if (!variantKode)  { Notify.error("Variant Kode wajib diisi.");  return; }

        const btn = document.getElementById("btnMappingSave");
        btn.disabled    = true;
        btn.textContent = "Menyimpan...";

        try {
            const result =
                await API.saveMapping(supplierKode, variantKode, itemDesc, include);

            if (result.status !== "success") throw new Error(result.message);

            Notify.success(result.message);
            this._toggleForm(false);
            await this._load();

        } catch (err) {
            Notify.error(err.message);
        } finally {
            btn.disabled    = false;
            btn.textContent = "Simpan";
        }

    },

    async _doToggle(supplierKode, newInclude) {

        try {
            const result = await API.updateMapping(supplierKode, newInclude);

            if (result.status !== "success") throw new Error(result.message);

            Notify.success(result.message);
            await this._load();

        } catch (err) {
            Notify.error(err.message);
        }

    }

};

function loadMapping() {
    MappingPage.init();
}
