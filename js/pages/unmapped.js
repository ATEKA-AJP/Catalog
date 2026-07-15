/**
 * ==========================================
 * AJP WEB CATALOG - Unmapped Page
 * ==========================================
 * Supervisor dapat:
 * - Lihat list item yang belum termapping
 * - Filter by status (OPEN / PENDING / SKIP / ALL)
 * - Search by item no / description
 * - Update status item (PENDING / SKIP)
 * - Buka mapping form langsung dari tabel
 */

const UnmappedPage = {

    _currentPage:   1,
    _currentStatus: "OPEN",
    _searchTimer:   null,

    async init() {

        const container =
            document.getElementById("pageUnmapped");

        if (!container) return;

        container.innerHTML = this._renderHTML();

        this._bindEvents();
        await this._load();

    },

    _renderHTML() {

        return `
            <div class="page-wrap">

                <div class="page-header">
                    <h2 class="page-title">Unmapped Items</h2>
                </div>

                <div class="table-toolbar">

                    <div class="search-input-wrap">
                        <input
                            type="text"
                            id="unmappedSearch"
                            placeholder="Search item no / description..."
                            class="table-search">
                    </div>

                    <select id="unmappedStatusFilter" class="table-select">
                        <option value="OPEN">OPEN</option>
                        <option value="PENDING">PENDING</option>
                        <option value="SKIP">SKIP</option>
                        <option value="ALL">Semua Status</option>
                    </select>

                </div>

                <div id="unmappedTableWrap" class="table-wrap">
                    <p class="table-loading">Memuat data...</p>
                </div>

                <div id="unmappedPagination" class="pagination-wrap"></div>

            </div>

            <!-- Modal Mapping dari Unmapped -->
            <div class="modal-overlay" id="unmappedMappingModal" style="display:none">
                <div class="form-modal">
                    <h3 class="form-modal-title">Tambah Mapping</h3>
                    <p id="unmappedMappingItemNo" class="form-modal-sub"></p>

                    <div class="form-group">
                        <label>Variant Kode (dari MASTER)</label>
                        <input
                            type="text"
                            id="unmappedVariantKode"
                            placeholder="Contoh: BP-GP10-RED"
                            class="form-input">
                    </div>

                    <div class="form-actions">
                        <button id="unmappedMappingCancel" class="btn-secondary">Batal</button>
                        <button id="unmappedMappingSave" class="btn-primary">Simpan Mapping</button>
                    </div>
                </div>
            </div>
        `;

    },

    _bindEvents() {

        // Search dengan debounce
        document
            .getElementById("unmappedSearch")
            ?.addEventListener("input", () => {
                clearTimeout(this._searchTimer);
                this._searchTimer = setTimeout(() => {
                    this._currentPage = 1;
                    this._load();
                }, 400);
            });

        // Filter status
        document
            .getElementById("unmappedStatusFilter")
            ?.addEventListener("change", () => {
                this._currentStatus =
                    document.getElementById("unmappedStatusFilter").value;
                this._currentPage = 1;
                this._load();
            });

        // Modal cancel
        document
            .getElementById("unmappedMappingCancel")
            ?.addEventListener("click", () => {
                this._closeModal();
            });

        // Modal save
        document
            .getElementById("unmappedMappingSave")
            ?.addEventListener("click", () => {
                this._doSaveMapping();
            });

    },

    async _load() {

        const wrap =
            document.getElementById("unmappedTableWrap");

        wrap.innerHTML =
            `<p class="table-loading">Memuat data...</p>`;

        try {

            const result =
                await API.getUnmapped(
                    this._currentStatus,
                    this._currentPage
                );

            if (result.status !== "success") {
                throw new Error(result.message);
            }

            this._renderTable(result.data);
            this._renderPagination(result.pagination);

        } catch (err) {

            wrap.innerHTML =
                `<p class="table-error">❌ ${err.message}</p>`;

        }

    },

    _renderTable(rows) {

        const wrap =
            document.getElementById("unmappedTableWrap");

        if (!rows || rows.length === 0) {
            wrap.innerHTML =
                `<p class="table-empty">Tidak ada item unmapped dengan status ini.</p>`;
            return;
        }

        wrap.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Kode Supplier</th>
                        <th>Description</th>
                        <th>Qty</th>
                        <th>First Seen</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td class="td-mono">${r.itemNo}</td>
                            <td>${r.itemDescription || "-"}</td>
                            <td>${r.quantity.toLocaleString("id-ID")}</td>
                            <td class="td-date">${r.date || "-"}</td>
                            <td>
                                <span class="status-badge status-${r.status.toLowerCase()}">
                                    ${r.status}
                                </span>
                            </td>
                            <td>
                                <button
                                    class="btn-action btn-mapping"
                                    data-itemno="${r.itemNo}"
                                    data-itemdesc="${r.itemDescription || ""}">
                                    Mapping
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;

        // Bind action buttons
        wrap.querySelectorAll(".btn-mapping").forEach(btn => {
            btn.addEventListener("click", () => {
                this._openModal(btn.dataset.itemno, btn.dataset.itemdesc);
            });
        });

    },

    _renderPagination(pagination) {

        const wrap =
            document.getElementById("unmappedPagination");

        if (!pagination || pagination.totalPages <= 1) {
            wrap.innerHTML = "";
            return;
        }

        const { page, totalPages, total } = pagination;

        wrap.innerHTML = `
            <div class="pagination">
                <span class="pagination-info">
                    Total ${total.toLocaleString("id-ID")} item
                </span>
                <div class="pagination-btns">
                    <button class="pg-btn" data-page="${page - 1}"
                        ${page <= 1 ? "disabled" : ""}>‹</button>
                    ${this._pageNumbers(page, totalPages)
                        .map(p => p === "..."
                            ? `<span class="pg-ellipsis">…</span>`
                            : `<button class="pg-btn ${p === page ? "active" : ""}"
                                data-page="${p}">${p}</button>`
                        ).join("")}
                    <button class="pg-btn" data-page="${page + 1}"
                        ${page >= totalPages ? "disabled" : ""}>›</button>
                </div>
            </div>
        `;

        wrap.querySelectorAll(".pg-btn:not([disabled])").forEach(btn => {
            btn.addEventListener("click", () => {
                this._currentPage = Number(btn.dataset.page);
                this._load();
            });
        });

    },

    _pageNumbers(current, total) {

        if (total <= 7) {
            return Array.from({ length: total }, (_, i) => i + 1);
        }

        const pages = [1];

        if (current > 3) pages.push("...");

        for (
            let i = Math.max(2, current - 1);
            i <= Math.min(total - 1, current + 1);
            i++
        ) {
            pages.push(i);
        }

        if (current < total - 2) pages.push("...");

        pages.push(total);

        return pages;

    },

    _openModal(itemNo, itemDescription) {

        const modal = document.getElementById("unmappedMappingModal");
        const sub   = document.getElementById("unmappedMappingItemNo");
        const input = document.getElementById("unmappedVariantKode");

        if (sub) sub.textContent = `Supplier Kode: ${itemNo}`;
        if (input) input.value = "";

        modal.dataset.itemno   = itemNo;
        modal.dataset.itemdesc = itemDescription || "";
        modal.style.display    = "flex";

        setTimeout(() => input?.focus(), 100);

    },

    _closeModal() {

        const modal =
            document.getElementById("unmappedMappingModal");

        modal.style.display = "none";

    },

    async _doSaveMapping() {

        const modal      = document.getElementById("unmappedMappingModal");
        const supplierKode   = modal.dataset.itemno;
        const itemDescription = modal.dataset.itemdesc || "";

        const variantKode =
            document.getElementById("unmappedVariantKode")?.value.trim();

        if (!variantKode) { Notify.error("Variant Kode wajib diisi."); return; }

        const btn = document.getElementById("unmappedMappingSave");
        btn.disabled    = true;
        btn.textContent = "Menyimpan...";

        try {
            const result = await API.saveMapping(
                supplierKode,
                variantKode,
                itemDescription,
                true  // default Include
            );

            if (result.status !== "success") throw new Error(result.message);

            this._closeModal();
            Notify.success(result.message);
            await this._load();

        } catch (err) {
            Notify.error(err.message);
        } finally {
            btn.disabled    = false;
            btn.textContent = "Simpan Mapping";
        }

    }

};

function loadUnmapped() {
    UnmappedPage.init();
}
