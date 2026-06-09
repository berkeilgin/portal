// ==================== LOB MASTER EŞLEME ARACI (Optimal) ====================
let sourceData = [];            // ham kaynak data
let refClientList = [];         // referans client listesi (string)
let excludedFormIds = new Set(); // LOBDatalari'ndan gelen, zaten eşlenmiş Form ID'ler
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
const filterClient = document.getElementById('filterClient');
const filterFormId = document.getElementById('filterFormId');
const filterFormName = document.getElementById('filterFormName');
const sortSelect = document.getElementById('sortSelect');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');

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

// LOBDatalari.xlsx yükleme (ZORUNLU)
async function loadLobDataFile(file) {
    showLoader(true);
    lobDataStatus.innerHTML = '⏳ Yükleniyor...';
    try {
        const rows = await readExcelFile(file);
        if (!rows.length) throw new Error('Dosya boş');
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
        excludedFormIds = newExcluded;
        lobDataStatus.innerHTML = `✅ ${excludedFormIds.size} benzersiz Form ID yüklendi (daha önce eşlenmiş).`;
        lobDataStatus.style.color = 'var(--accent)';
        // 3. dosya zorunlu olduğu için, diğerleri de yüklendiyse tabloyu göster
        if (sourceData.length && refClientList.length) {
            applyFilterAndRender();
        } else if (!sourceData.length || !refClientList.length) {
            tableContainer.style.display = 'none';
        }
    } catch(err) {
        lobDataStatus.innerHTML = `❌ ${err.message} (Zorunlu dosya)`;
        lobDataStatus.style.color = 'var(--accent3)';
        excludedFormIds.clear();
        tableContainer.style.display = 'none';
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
        if (refClientList.length && excludedFormIds.size > 0) applyFilterAndRender();
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
        if (sourceData.length && excludedFormIds.size > 0) applyFilterAndRender();
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

// Benzersiz anahtar
function getRowKey(item) {
    return `${item.clientIdent}_${item.formId}`;
}

// Checkbox state yönetimi
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
        try { return JSON.parse(stored); } catch(e) { return {}; }
    }
    return {};
}

// Filtreleme ve sıralama uygula
let checkboxState = {};
function applyFilterAndRender() {
    if (!sourceData.length || !refClientList.length || excludedFormIds.size === 0) return;
    const refSet = new Set(refClientList.map(c => c.toLowerCase()));
    // Client filtre
    let temp = sourceData.filter(item => refSet.has(item.client.toLowerCase()));
    // Excluded Form ID'leri çıkar
    temp = temp.filter(item => !excludedFormIds.has(item.formId));
    filteredData = temp;
    
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
    applyFiltersAndSort();
}

// UI filtreleri ve sıralamayı uygula
function applyFiltersAndSort() {
    let data = [...currentDisplayData];
    
    // Filtreler
    const clientFilter = filterClient.value.toLowerCase();
    const formIdFilter = filterFormId.value.toLowerCase();
    const formNameFilter = filterFormName.value.toLowerCase();
    
    if (clientFilter) data = data.filter(r => r.client.toLowerCase().includes(clientFilter));
    if (formIdFilter) data = data.filter(r => r.formId.toLowerCase().includes(formIdFilter));
    if (formNameFilter) data = data.filter(r => r.formName.toLowerCase().includes(formNameFilter));
    
    // Sıralama
    const sortBy = sortSelect.value;
    if (sortBy === 'client') data.sort((a,b) => a.client.localeCompare(b.client));
    else if (sortBy === 'formId') data.sort((a,b) => a.formId.localeCompare(b.formId));
    else if (sortBy === 'formName') data.sort((a,b) => a.formName.localeCompare(b.formName));
    
    renderTable(data);
    rowCountInfo.textContent = `${data.length} / ${currentDisplayData.length} kayıt gösteriliyor (toplam filtrelenmiş: ${filteredData.length})`;
}

// Tabloyu çiz
function renderTable(data) {
    const thead = document.getElementById('tableHeader');
    const tbody = document.getElementById('tableBody');
    if (!thead || !tbody) return;
    thead.innerHTML = `<tr>
        <th class="sortable" data-sort="client">Client <span class="sort-icon">↕</span></th>
        <th class="sortable" data-sort="formId">Form ID <span class="sort-icon">↕</span></th>
        <th class="sortable" data-sort="formName">Form Name <span class="sort-icon">↕</span></th>
        <th>LOB Adı</th><th>LOB ID</th><th style="width:80px">Export Et?</th>
    </tr>`;
    
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">📭 Gösterilecek kayıt yok (hepsi daha önce eşlenmiş veya filtrelerde).</td></tr>`;
        exportBtn.disabled = true;
        return;
    }
    exportBtn.disabled = false;
    tbody.innerHTML = data.map((row, idx) => {
        const isChecked = row.checked;
        return `
        <tr data-idx="${idx}">
            <td>${escapeHtml(row.client)}</td>
            <td>${escapeHtml(row.formId)}</td>
            <td>${escapeHtml(row.formName)}</td>
            <td><input type="text" class="lobAdi-input" data-key="${getRowKey(row)}" value="${escapeHtml(row.lobAdi)}" placeholder="LOB Adı"></td>
            <td><input type="text" class="lobId-input" data-key="${getRowKey(row)}" value="${escapeHtml(row.lobId)}" placeholder="LOB ID"></td>
            <td class="checkbox-cell"><input type="checkbox" class="export-checkbox" data-key="${getRowKey(row)}" ${isChecked ? 'checked' : ''}></td>
        </table>
        `;
    }).join('');
    
    // Event binding (performans için tek tek)
    document.querySelectorAll('.lobAdi-input').forEach(inp => {
        inp.removeEventListener('change', handleLobAdiChange);
        inp.addEventListener('change', handleLobAdiChange);
    });
    document.querySelectorAll('.lobId-input').forEach(inp => {
        inp.removeEventListener('change', handleLobIdChange);
        inp.addEventListener('change', handleLobIdChange);
    });
    document.querySelectorAll('.export-checkbox').forEach(chk => {
        chk.removeEventListener('change', handleCheckboxChange);
        chk.addEventListener('change', handleCheckboxChange);
    });
    // Sıralama eventleri
    document.querySelectorAll('.sortable').forEach(th => {
        th.removeEventListener('click', handleSortClick);
        th.addEventListener('click', handleSortClick);
    });
}

function handleLobAdiChange(e) {
    const key = e.target.dataset.key;
    const row = currentDisplayData.find(r => getRowKey(r) === key);
    if (row) row.lobAdi = e.target.value;
}
function handleLobIdChange(e) {
    const key = e.target.dataset.key;
    const row = currentDisplayData.find(r => getRowKey(r) === key);
    if (row) row.lobId = e.target.value;
}
function handleCheckboxChange(e) {
    const key = e.target.dataset.key;
    const row = currentDisplayData.find(r => getRowKey(r) === key);
    if (row) {
        row.checked = e.target.checked;
        saveCheckboxState();
    }
}
function handleSortClick(e) {
    const sortBy = e.currentTarget.dataset.sort;
    if (sortBy === 'client') sortSelect.value = 'client';
    else if (sortBy === 'formId') sortSelect.value = 'formId';
    else if (sortBy === 'formName') sortSelect.value = 'formName';
    applyFiltersAndSort();
}

// Export: yeni satırlar + mevcut master birleştir
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
        if (existingIndex !== -1) updatedMaster[existingIndex] = newRecord;
        else updatedMaster.push(newRecord);
    }
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
    alert(`${selectedNewRows.length} yeni kayıt eklendi/güncellendi. Toplam master: ${updatedMaster.length} kayıt. Sayfa yenilenecek.`);
    location.reload();
}

function resetAllCheckboxes() {
    if (confirm('Tüm satırların "Export Et?" kutularını işaretli yap?')) {
        currentDisplayData.forEach(row => row.checked = true);
        saveCheckboxState();
        applyFiltersAndSort();
    }
}
function resetFilters() {
    filterClient.value = '';
    filterFormId.value = '';
    filterFormName.value = '';
    sortSelect.value = 'client';
    applyFiltersAndSort();
}

// Drag & Drop setup
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
resetFiltersBtn.addEventListener('click', resetFilters);
filterClient.addEventListener('input', applyFiltersAndSort);
filterFormId.addEventListener('input', applyFiltersAndSort);
filterFormName.addEventListener('input', applyFiltersAndSort);
sortSelect.addEventListener('change', applyFiltersAndSort);

tableContainer.style.display = 'none';
exportBtn.disabled = true;
