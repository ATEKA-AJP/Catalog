/**
 * ==========================================
 * AJP WEB CATALOG - Upload Page
 * ==========================================
 * Flow:
 * 1. User drag-drop / pilih file xlsx atau csv
 * 2. Parse di frontend dengan SheetJS
 * 3. Kirim headers + rows ke backend (uploadPreview)
 * 4. Tampilkan preview stats
 * 5. User klik Import → kirim ke backend (uploadImport)
 */

const UploadPage = {

    _previewData: null,   // Simpan hasil preview untuk dipakai saat import
    _fileName:    "",

    init() {

        const container =
            document.getElementById("pageUpload");

        if (!container) return;

        container.innerHTML =
            this._renderHTML();

        this._bindEvents();

    },

    _renderHTML() {

        return `
            <div class="upload-wrap">

                <h2 class="upload-title">Upload Stock</h2>

                <div class="upload-body">

                    <!-- Kiri: Upload File -->
                    <div class="upload-card">

                        <p class="upload-card-label">Upload File</p>

                        <div class="upload-dropzone" id="uploadDropzone">

                            <svg xmlns="http://www.w3.org/2000/svg"
                                 viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" stroke-width="1.5"
                                 class="upload-icon">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                      d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25
                                         2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0
                                         4.5 4.5M12 3v13.5"/>
                            </svg>

                            <p class="upload-drop-text">
                                Klik atau drag file Excel / CSV
                            </p>

                            <p class="upload-drop-sub">Maksimal 10MB</p>

                            <input
                                type="file"
                                id="uploadFileInput"
                                accept=".xlsx,.xls,.csv"
                                style="display:none">

                            <button
                                class="btn-pilih-file"
                                id="btnPilihFile">
                                Pilih File
                            </button>

                        </div>

                        <div class="upload-info-box">
                            <span class="upload-info-icon">ℹ</span>
                            <span>Duplicate item dengan harga berbeda akan menggunakan harga terakhir.</span>
                        </div>

                    </div>

                    <!-- Kanan: Preview Stats -->
                    <div class="upload-card" id="uploadPreviewCard">

                        <p class="upload-card-label">Preview</p>

                        <div id="uploadPreviewContent" class="upload-preview-empty">
                            <p>Belum ada file dipilih.</p>
                        </div>

                        <div class="upload-import-row" id="uploadImportRow" style="display:none">
                            <button
                                class="btn-import"
                                id="btnImport">
                                Import Data
                            </button>
                        </div>

                    </div>

                </div>

            </div>
        `;

    },

    _bindEvents() {

        const dropzone =
            document.getElementById("uploadDropzone");

        const fileInput =
            document.getElementById("uploadFileInput");

        const btnPilih =
            document.getElementById("btnPilihFile");

        const btnImport =
            document.getElementById("btnImport");

        // Klik tombol Pilih File
        btnPilih.addEventListener("click", () => {
            // Reset value dulu agar event 'change' tetap fire
            // meski user pilih file yang sama persis
            fileInput.value = "";
            fileInput.click();
        });

        // Pilih file via input
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) this._handleFile(file);
        });

        // Drag over styling
        dropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropzone.classList.add("dragover");
        });

        dropzone.addEventListener("dragleave", () => {
            dropzone.classList.remove("dragover");
        });

        // Drop file
        dropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropzone.classList.remove("dragover");
            const file = e.dataTransfer.files[0];
            if (file) this._handleFile(file);
        });

        // Import
        if (btnImport) {
            btnImport.addEventListener("click", () => {
                this._doImport();
            });
        }

    },

    async _handleFile(file) {

        // Validasi ukuran (10MB)
        if (file.size > 10 * 1024 * 1024) {
            this._showError("File terlalu besar. Maksimal 10MB.");
            return;
        }

        this._fileName = file.name;
        this._showLoading("Membaca file...");

        try {

            const { headers, rows } =
                await this._parseFile(file);

            this._showLoading("Memvalidasi ke server...");

            const result =
                await API.uploadPreview(headers, rows);

            if (result.status !== "success") {
                throw new Error(
                    result.message || "Preview gagal."
                );
            }
            // Simpan untuk dipakai saat import
            this._previewData = {
                headers,
                rows: result.result.rows
            };

            this._showPreview(result.result);

        } catch (err) {

            this._showError(err.message);

        }

    },

    /**
     * Parse xlsx / csv menggunakan SheetJS
     * Return: { headers: [], rows: [{itemNo, itemDescription, quantity}] }
     */
    _parseFile(file) {

        return new Promise((resolve, reject) => {

            const reader = new FileReader();

            reader.onload = (e) => {

                try {

                    const data = e.target.result;

                    const workbook =
                        XLSX.read(data, { type: "array" });

                    const sheetName =
                        workbook.SheetNames[0];

                    const sheet =
                        workbook.Sheets[sheetName];

                    // SheetJS → array of arrays
                    const raw =
                        XLSX.utils.sheet_to_json(
                            sheet,
                            { header: 1, defval: "" }
                        );

                    if (!raw || raw.length < 2) {
                        throw new Error(
                            "File kosong atau tidak ada data."
                        );
                    }

                    const headers =
                        raw[0].map(h =>
                            String(h).trim()
                        );

                    const rows =
                        raw.slice(1)
                           .filter(row =>
                                row.some(cell =>
                                    String(cell).trim() !== ""
                                )
                            )
                           .map(row => ({
                                itemNo:          row[0],
                                itemDescription: row[1],
                                quantity:        row[2]
                           }));

                    resolve({ headers, rows });

                } catch (err) {

                    reject(err);

                }

            };

            reader.onerror = () =>
                reject(new Error("Gagal membaca file."));

            reader.readAsArrayBuffer(file);

        });

    },

    _showPreview(result) {

        const content =
            document.getElementById("uploadPreviewContent");

        const importRow =
            document.getElementById("uploadImportRow");

        const {
            totalRows,
            uniqueItems,
            duplicateMerged,
            warnings
        } = result;

        const warningHTML =
            warnings && warnings.length > 0
                ? `<div class="preview-warnings">
                       <p class="preview-warn-title">Warnings</p>
                       <ul>
                           ${warnings.map(w =>
                               `<li>${w}</li>`
                           ).join("")}
                       </ul>
                   </div>`
                : "";

        content.innerHTML = `
            <div class="preview-stats">

                <div class="preview-row">
                    <span class="preview-label">Total Rows</span>
                    <span class="preview-value">${totalRows.toLocaleString("id-ID")}</span>
                </div>

                <div class="preview-row">
                    <span class="preview-label">Unique <span class="preview-sub">(setelah deduplikasi)</span></span>
                    <span class="preview-value preview-green">${uniqueItems.toLocaleString("id-ID")}</span>
                </div>

                <div class="preview-row">
                    <span class="preview-label">Duplicate</span>
                    <span class="preview-value ${duplicateMerged > 0 ? "preview-orange" : ""}">
                        ${duplicateMerged.toLocaleString("id-ID")}
                    </span>
                </div>

                ${warningHTML}

            </div>

            <p class="preview-filename">📄 ${this._fileName}</p>
        `;

        if (importRow) {
            importRow.style.display = "flex";
        }

    },

    _showLoading(msg = "Memproses...") {

        const content =
            document.getElementById("uploadPreviewContent");

        if (content) {
            content.innerHTML = `
                <div class="upload-preview-empty">
                    <p style="color: var(--primary)">⏳ ${msg}</p>
                </div>
            `;
        }

        const importRow =
            document.getElementById("uploadImportRow");

        if (importRow) {
            importRow.style.display = "none";
        }

    },

    _showError(msg) {

        const content = document.getElementById("uploadPreviewContent");

        // Kalau error header, tambahkan contoh format yang benar
        const isHeaderError =
            msg.toLowerCase().includes("header");

        const headerHint = isHeaderError ? `
            <div class="upload-header-hint">
                <p class="hint-title">Format header yang benar (baris pertama file):</p>
                <table class="hint-table">
                    <tr>
                        <th>Item No</th>
                        <th>Item Description</th>
                        <th>Quantity</th>
                    </tr>
                    <tr>
                        <td>ABC001</td>
                        <td>Ballpoint GP10 Red</td>
                        <td>120</td>
                    </tr>
                </table>
                <p class="hint-note">Pastikan nama kolom persis sama (tidak case-sensitive).</p>
            </div>
        ` : "";

        if (content) {
            content.innerHTML = `
                <div class="upload-error-wrap">
                    <p style="color:#EF4444;margin:0">❌ ${msg}</p>
                    ${headerHint}
                </div>
            `;
        }

        const importRow = document.getElementById("uploadImportRow");
        if (importRow) importRow.style.display = "none";

        this._previewData = null;

        // Reset file input agar file yang sama bisa dipilih lagi
        // tanpa harus reload atau pilih file lain dulu
        const fileInput = document.getElementById("uploadFileInput");
        if (fileInput) fileInput.value = "";

    },

    async _doImport() {

        if (!this._previewData) {
            Notify.warn("Tidak ada data untuk diimport.");
            return;
        }

        const btn =
            document.getElementById("btnImport");

        if (btn) {
            btn.disabled = true;
            btn.textContent = "Mengimport...";
        }

        try {

            const result =
                await API.uploadImport(
                    this._previewData.headers,
                    this._previewData.rows,
                    this._fileName
                );

            if (result.status !== "success") {
                throw new Error(
                    result.message || "Import gagal."
                );
            }

            this._showImportSuccess(result);

        } catch (err) {

            this._showError(err.message);

        } finally {

            if (btn) {
                btn.disabled = false;
                btn.textContent = "Import Data";
            }

        }

    },

    _showImportSuccess(result) {

        const content =
            document.getElementById("uploadPreviewContent");

        if (content) {
            content.innerHTML = `
                <div class="import-success">

                    <div class="import-success-icon">✓</div>

                    <p class="import-success-title">Import Berhasil</p>

                    <div class="preview-stats">

                        <div class="preview-row">
                            <span class="preview-label">Diimport</span>
                            <span class="preview-value preview-green">
                                ${result.imported.toLocaleString("id-ID")} item
                            </span>
                        </div>

                        <div class="preview-row">
                            <span class="preview-label">Sudah Termapping</span>
                            <span class="preview-value">${result.mapped.toLocaleString("id-ID")}</span>
                        </div>

                        <div class="preview-row">
                            <span class="preview-label">Unmapped (perlu mapping)</span>
                            <span class="preview-value preview-orange">
                                ${result.unmapped.toLocaleString("id-ID")}
                            </span>
                        </div>

                    </div>

                    <p class="import-time">
                        ${new Date().toLocaleString("id-ID")}
                    </p>

                </div>
            `;
        }

        const importRow =
            document.getElementById("uploadImportRow");

        if (importRow) {
            importRow.style.display = "none";
        }

        // Reset state
        this._previewData = null;
        this._fileName    = "";

        // Reset file input agar bisa upload file baru
        const fileInput =
            document.getElementById("uploadFileInput");

        if (fileInput) {
            fileInput.value = "";
        }

    }

};

// Entry point yang dipanggil Navbar._onPageLoad()
function loadUpload() {
    UploadPage.init();
}
