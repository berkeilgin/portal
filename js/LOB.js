// ==================== LOB MASTER EŞLEME ARACI ====================
let sourceData = [];            // ham kaynak data
let refClientList = [];         // referans client listesi (string)
let excludedFormIds = new Set(); // LOBDatalari'ndan gelen, zaten eşlenmiş Form ID'ler (dışlanacak)
let filteredData = [];          // client filtresi + exclusion uygulanmış data
let currentDisplayData = [];    // tabloda gösterilen satırlar (lobAdi, lobId, checked)
let masterData = [];            // localStorage'daki tüm master kayıtlar

// DOM elemanları
const sourceInput = document.getElementById('sourceFileInput');
const dropSource = document.getElementById('dropSourceData');
const sourceStatus = document.getElementById('sourceStatus');
const refInput = document.getElementById('refFileInput');
const dropRef = document.getElementById('dropRefList');
const refStatus = document.getElementById('refStatus');
const lobDataInput = document.getElementById('lobDataFileInput');
const dropLobData = document.getElementById('dropLobData');
const lobDataStatus = document.getElementById('lobDataStatus');
const loader = document.getElementById('loaderLOB');
const tableContainer = document.getElementById('tableContainer');
const exportBtn = document.getElementById('exportBtn');
const resetCheckboxesBtn = document.getElementById('resetCheckboxesBtn');
const rowCountInfo = document.getElementById('rowCountInfo');

function showLoader(show) {
    if (loader) loader.classList.toggle('visible', show);
}
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// Excel dosyasını JSON'a çevir
function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                resolve(rows);
            } catch(err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// localStorage'dan master veriyi yükle
function loadMasterFromLocalStorage() {
    const stored = localStorage.getItem('LOB_masterData');
    if (stored) {
        try {
            masterData = JSON.parse(stored);
            // excludedFormIds'i güncelle
            excludedFormIds.clear();
            masterData.forEach(item => {
                if (item.FormID) excludedFormIds.add(String(item.FormID).trim());
            });
        } catch(e) { masterData = []; }
    } else {
        masterData = [];
        excludedFormIds.clear();
    }
}

// Master veriyi localStorage'a kaydet
function saveMasterToLocalStorage(data) {
    localStorage.setItem('LOB_masterData', JSON.stringify(data));
    masterData = data;
    excludedFormIds.clear();
    masterData.forEach(item => {
        if (item.FormID) excludedFormIds.add(String(item.FormID).trim());
    });
}

// LOBDatalari.xlsx yükleme (eski eşlemeler)
async function loadLobDataFile(file) {
    showLoader(true);
    lobDataStatus.innerHTML = '⏳ Yükleniyor...';
    try {
        const rows = await readExcelFile(file);
        if (!rows.length) throw new Error('Dosya boş');
        // Sütun adlarını normalize et
        const firstRow = rows[0];
        let formIdCol = null;
        for (let key of Object.keys(firstRow)) {
            const lower = key.toLowerCase();
            if (lower.includes('form') && lower.includes('id')) {
                formIdCol = key;
                break;
            }
        }
        if (!formIdCol) formIdCol = 'FormID';
        
        const newExcluded = new Set();
        const masterRecords = [];
        for (const row of rows) {
            const formId = String(row[formIdCol] || '').trim();
            if (formId) newExcluded.add(formId);
            const lobAdi = row.LOBAdı || row['LOB Adı'] || '';
            const lobId = row.LOBID || row['LOB ID'] || '';
            const clientIdent = row.ClientIdent || '';
            const client = row.Client || '';
            const formName = row.FormName || row['Form Name'] || '';
            if (formId) {
                masterRecords.push({
                    ClientIdent: String(clientIdent).trim(),
                    Client: String(client).trim(),
                    FormID: formId,
                    FormName: String(formName).trim(),
                    LOBAdi: String(lobAdi).trim(),
                    LOBID: String(lobId).trim()
                });
            }
        }
        // Mevcut localStorage'daki master ile birleştirme (üzerine yazma, sadece exclusion set'i oluşturuyoruz)
        excludedFormIds = newExcluded;
        lobDataStatus.innerHTML = `✅ ${excludedFormIds.size} benzersiz Form ID yüklendi (daha önce eşlenmiş).`;
        lobDataStatus.style.color = 'var(--accent)';
        if (sourceData.length && refClientList.length) {
            applyFilterAndRender();
        }
    } catch(err) {
        lobDataStatus.innerHTML = `❌ ${err.message}`;
        lobDataStatus.style.color = 'var(--accent3)';
        excludedFormIds.clear();
    } finally {
        showLoader(false);
    }
}

// Kaynak Data yükleme
async function loadSourceData(file) {
    showLoader(true);
    sourceStatus.innerHTML = '⏳ Yükleniyor...';
    try {
        const rows = await readExcelFile(file);
        if (!rows.length) throw new Error('Dosya boş');
        const firstRow = rows[0];
        const required = ['ClientIdent', 'Client', 'LOBID', 'LOB1', 'Form ID Text', 'Form Name'];
        const missing = required.filter(c => !(c in firstRow));
        if (missing.length) throw new Error(`Eksik sütunlar: ${missing.join(', ')}`);
        
        sourceData = rows.map(row => ({
            clientIdent: String(row.ClientIdent || '').trim(),
            client: String(row.Client || '').trim(),
            formId: String(row['Form ID Text'] || '').trim(),
            formName: String(row['Form Name'] || '').trim(),
            originalRow: row
        }));
        sourceStatus.innerHTML = `✅ ${sourceData.length} kayıt yüklendi.`;
        sourceStatus.style.color = 'var(--accent)';
        if (refClientList.length) applyFilterAndRender();
        else tableContainer.style.display = 'none';
    } catch(err) {
        sourceStatus.innerHTML = `❌ ${err.message}`;
        sourceStatus.style.color = 'var(--accent3)';
        sourceData = [];
        tableContainer.style.display = 'none';
    } finally {
        showLoader(false);
    }
}

// Proje Referans Listesi yükleme
async function loadRefData(file) {
    showLoader(true);
    refStatus.innerHTML = '⏳ Yükleniyor...';
    try {
        const rows = await readExcelFile(file);
        if (!rows.length) throw new Error('Dosya boş');
        const firstRow = rows[0];
        if (!('Client' in firstRow)) throw new Error('Excel\'de "Client" sütunu bulunamadı');
        refClientList = rows.map(row => String(row.Client || '').trim()).filter(c => c !== '');
        refStatus.innerHTML = `✅ ${refClientList.length} benzersiz client referansı yüklendi.`;
        refStatus.style.color = 'var(--accent)';
        if (sourceData.length) applyFilterAndRender();
        else tableContainer.style.display = 'none';
    } catch(err) {
        refStatus.innerHTML = `❌ ${err.message}`;
        refStatus.style.color = 'var(--accent3)';
        refClientList = [];
        tableContainer.style.display = 'none';
    } finally {
        showLoader(false);
    }
}

// Benzersiz anahtar (checkbox state için)
function getRowKey(item) {
    return `${item.clientIdent}_${item.formId}`;
}

// Checkbox durumlarını localStorage'a kaydet (sadece UI için)
function saveCheckboxState() {
    const state = {};
    currentDisplayData.forEach(row => {
        const key = getRowKey({ clientIdent: row.clientIdent, formId: row.formId });
        state[key] = row.checked;
    });
    localStorage.setItem('LOB_checkboxState', JSON.stringify(state));
}
function loadCheckboxState() {
    const stored = localStorage.getItem('LOB_checkboxState');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch(e) { return {}; }
    }
    return {};
}
let checkboxState = {};

// Filtreleme (Client bazlı + excludedFormIds)
function applyFilterAndRender() {
    if (!sourceData.length || !refClientList.length) return;
    const refSet = new Set(refClientList.map(c => c.toLowerCase()));
    // 1. Client filtre
    let temp = sourceData.filter(item => refSet.has(item.client.toLowerCase()));
    // 2. Daha önce eşlenmiş Form ID'leri çıkar
    temp = temp.filter(item => !excludedFormIds.has(item.formId));
    filteredData = temp;
    
    // localStorage'daki checkbox state'lerini yükle
    checkboxState = loadCheckboxState();
    
    currentDisplayData = filteredData.map(item => {
        const key = getRowKey(item);
        return {
            clientIdent: item.clientIdent,
            client: item.client,
            formId: item.formId,
            formName: item.formName,
            lobAdi: '',
            lobId: '',
            checked: checkboxState[key] !== undefined ? checkboxState[key] : true
        };
    });
    
    renderTable();
    tableContainer.style.display = 'block';
    rowCountInfo.textContent = `${currentDisplayData.length} yeni eşlenecek kayıt (${filteredData.length} filtrelenmiş, toplam kaynak: ${sourceData.length})`;
}

// Tabloyu çiz
function renderTable() {
    const thead = document.getElementById('tableHeader');
    const tbody = document.getElementById('tableBody');
    if (!thead || !tbody) return;
    thead.innerHTML = `<tr>
        <th>ClientIdent</th><th>Client</th><th>Form ID</th><th>Form Name</th>
        <th>LOB Adı</th><th>LOB ID</th><th style="width:80px">Export Et?</th>
    </tr>`;
    if (!currentDisplayData.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">📭 Gösterilecek yeni kayıt yok (hepsi daha önce eşlenmiş veya client filtresinde değil).</td></tr>`;
        exportBtn.disabled = true;
        return;
    }
    exportBtn.disabled = false;
    tbody.innerHTML = currentDisplayData.map((row, idx) => {
        const key = getRowKey({ clientIdent: row.clientIdent, formId: row.formId });
        const isChecked = row.checked;
        return `
        <tr data-row-idx="${idx}">
            <td>${escapeHtml(row.clientIdent)}</td>
            <td>${escapeHtml(row.client)}</td>
            <td>${escapeHtml(row.formId)}</td>
            <td>${escapeHtml(row.formName)}</td>
            <td><input type="text" class="lobAdi-input" data-idx="${idx}" value="${escapeHtml(row.lobAdi)}" placeholder="LOB Adı girin"></td>
            <td><input type="text" class="lobId-input" data-idx="${idx}" value="${escapeHtml(row.lobId)}" placeholder="LOB ID girin"></td>
            <td class="checkbox-cell"><input type="checkbox" class="export-checkbox" data-idx="${idx}" ${isChecked ? 'checked' : ''}></td>
        </tr>
        `;
    }).join('');
    
    // Event binding
    document.querySelectorAll('.lobAdi-input').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(inp.dataset.idx);
            if (!isNaN(idx) && currentDisplayData[idx]) currentDisplayData[idx].lobAdi = inp.value;
        });
    });
    document.querySelectorAll('.lobId-input').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(inp.dataset.idx);
            if (!isNaN(idx) && currentDisplayData[idx]) currentDisplayData[idx].lobId = inp.value;
        });
    });
    document.querySelectorAll('.export-checkbox').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const idx = parseInt(chk.dataset.idx);
            if (!isNaN(idx) && currentDisplayData[idx]) {
                currentDisplayData[idx].checked = chk.checked;
                saveCheckboxState();
            }
        });
    });
}

// Export: yeni satırlar + mevcut master veriyi birleştir, localStorage'a kaydet ve Excel indir
function exportMaster() {
    const selectedNewRows = currentDisplayData.filter(row => row.checked === true && (row.lobAdi || row.lobId));
    if (!selectedNewRows.length) {
        alert('Hiç yeni satır seçilmedi veya boş LOB bilgisi girilmedi.');
        return;
    }
    let updatedMaster = [...masterData];
    for (const newRow of selectedNewRows) {
        const existingIndex = updatedMaster.findIndex(m => m.FormID === newRow.formId);
        const newRecord = {
            ClientIdent: newRow.clientIdent,
            Client: newRow.client,
            FormID: newRow.formId,
            FormName: newRow.formName,
            LOBAdi: newRow.lobAdi,
            LOBID: newRow.lobId
        };
        if (existingIndex !== -1) {
            updatedMaster[existingIndex] = newRecord;
        } else {
            updatedMaster.push(newRecord);
        }
    }
    // localStorage'a kaydet
    saveMasterToLocalStorage(updatedMaster);
    // Excel export
    const exportData = updatedMaster.map(record => ({
        'ClientIdent': record.ClientIdent,
        'Client': record.Client,
        'FormID': record.FormID,
        'FormName': record.FormName,
        'LOB Adı': record.LOBAdi,
        'LOB ID': record.LOBID
    }));
    // Sayısal alanları number yap
    const processed = exportData.map(row => {
        const newRow = { ...row };
        if (/^\d+$/.test(String(newRow.ClientIdent))) newRow.ClientIdent = Number(newRow.ClientIdent);
        if (/^\d+$/.test(String(newRow.FormID))) newRow.FormID = Number(newRow.FormID);
        if (newRow['LOB ID'] && /^\d+$/.test(String(newRow['LOB ID']))) newRow['LOB ID'] = Number(newRow['LOB ID']);
        return newRow;
    });
    const ws = XLSX.utils.json_to_sheet(processed);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'LOB_Master');
    XLSX.writeFile(wb, `LOB_Master_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.xlsx`);
    alert(`${selectedNewRows.length} yeni kayıt eklendi/güncellendi. Toplam master: ${updatedMaster.length} kayıt. Dosya indirildi.\nSayfa yenilenecek.`);
    location.reload();
}

function resetAllCheckboxes() {
    if (confirm('Tüm satırların "Export Et?" kutularını işaretli yapmak istediğinize emin misiniz?')) {
        currentDisplayData.forEach(row => row.checked = true);
        saveCheckboxState();
        renderTable();
    }
}

// Drag & Drop yardımcısı
function setupDrop(dropEl, inputEl, loadFunc) {
    dropEl.addEventListener('click', e => { if (e.target !== inputEl) inputEl.click(); });
    inputEl.addEventListener('change', e => { if (e.target.files[0]) loadFunc(e.target.files[0]); });
    dropEl.addEventListener('dragover', e => { e.preventDefault(); dropEl.classList.add('drag'); });
    dropEl.addEventListener('dragleave', () => dropEl.classList.remove('drag'));
    dropEl.addEventListener('drop', e => {
        e.preventDefault();
        dropEl.classList.remove('drag');
        if (e.dataTransfer.files[0]) loadFunc(e.dataTransfer.files[0]);
    });
}

// Başlatma
loadMasterFromLocalStorage();
setupDrop(dropSource, sourceInput, loadSourceData);
setupDrop(dropRef, refInput, loadRefData);
setupDrop(dropLobData, lobDataInput, loadLobDataFile);
exportBtn.addEventListener('click', exportMaster);
resetCheckboxesBtn.addEventListener('click', resetAllCheckboxes);

tableContainer.style.display = 'none';
exportBtn.disabled = true;
