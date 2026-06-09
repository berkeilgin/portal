// ==================== LOB EŞLEME ARACI ====================
let sourceData = [];        // { clientIdent, client, formId, formName, originalRow }
let filteredData = [];      // client referans listesine göre filtrelenmiş
let checkboxState = {};     // key: clientIdent_formId, value: boolean
let currentDisplayData = []; // { clientIdent, client, formId, formName, lobAdi, lobId, checked }

// DOM Elemanları
const sourceInput = document.getElementById('sourceFileInput');
const dropSource = document.getElementById('dropSourceData');
const sourceStatus = document.getElementById('sourceStatus');
const refInput = document.getElementById('refFileInput');
const dropRef = document.getElementById('dropRefList');
const refStatus = document.getElementById('refStatus');
const loader = document.getElementById('loaderLOB');
const tableContainer = document.getElementById('tableContainer');
const exportBtn = document.getElementById('exportBtn');
const resetCheckboxesBtn = document.getElementById('resetCheckboxesBtn');
const rowCountInfo = document.getElementById('rowCountInfo');

// Yardımcılar
function showLoader(show) {
    loader.classList.toggle('visible', show);
}
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// Dosya yükleme (genel)
function readExcelFile(file, callback) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                resolve(rows);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// 1. Kaynak Data yükleme
async function loadSourceData(file) {
    showLoader(true);
    sourceStatus.innerHTML = '⏳ Yükleniyor...';
    try {
        const rows = await readExcelFile(file);
        if (!rows.length) throw new Error('Dosya boş');
        // Beklenen sütunlar: ClientIdent, Client, LOBID, LOB1, Form ID Text, Form Name
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
        // Eğer referans da yüklendiyse filtrele ve tabloyu göster
        if (refData && refData.length) {
            applyFilterAndRender();
        } else {
            tableContainer.style.display = 'none';
        }
    } catch (err) {
        sourceStatus.innerHTML = `❌ ${err.message}`;
        sourceStatus.style.color = 'var(--accent3)';
        sourceData = [];
        tableContainer.style.display = 'none';
    } finally {
        showLoader(false);
    }
}

let refData = []; // client listesi (string array)

// 2. Proje Referans Listesi yükleme
async function loadRefData(file) {
    showLoader(true);
    refStatus.innerHTML = '⏳ Yükleniyor...';
    try {
        const rows = await readExcelFile(file);
        if (!rows.length) throw new Error('Dosya boş');
        const firstRow = rows[0];
        if (!('Client' in firstRow)) throw new Error('Excel\'de "Client" sütunu bulunamadı');
        refData = rows.map(row => String(row.Client || '').trim()).filter(c => c !== '');
        refStatus.innerHTML = `✅ ${refData.length} benzersiz client referansı yüklendi.`;
        refStatus.style.color = 'var(--accent)';
        if (sourceData.length) {
            applyFilterAndRender();
        } else {
            tableContainer.style.display = 'none';
        }
    } catch (err) {
        refStatus.innerHTML = `❌ ${err.message}`;
        refStatus.style.color = 'var(--accent3)';
        refData = [];
        tableContainer.style.display = 'none';
    } finally {
        showLoader(false);
    }
}

// Filtreleme (sadece refData'daki client'lar) ve tabloyu hazırlama
function applyFilterAndRender() {
    if (!sourceData.length || !refData.length) return;
    const refSet = new Set(refData.map(c => c.toLowerCase()));
    filteredData = sourceData.filter(item => refSet.has(item.client.toLowerCase()));
    
    // checkboxState'leri yükle (localStorage)
    loadCheckboxState();
    
    // Görüntülenecek veriyi oluştur (LOB Adı ve LOB ID inputları için boş)
    currentDisplayData = filteredData.map(item => {
        const key = getRowKey(item);
        return {
            clientIdent: item.clientIdent,
            client: item.client,
            formId: item.formId,
            formName: item.formName,
            lobAdi: '',      // kullanıcı tarafından doldurulacak
            lobId: '',       // kullanıcı tarafından doldurulacak
            checked: checkboxState[key] !== undefined ? checkboxState[key] : true
        };
    });
    
    renderTable();
    tableContainer.style.display = 'block';
    rowCountInfo.textContent = `${currentDisplayData.length} kayıt gösteriliyor (${sourceData.length} toplam, ${filteredData.length} filtrelenmiş)`;
}

// Benzersiz satır anahtarı (localStorage için)
function getRowKey(item) {
    return `${item.clientIdent}_${item.formId}`;
}

// Checkbox durumlarını localStorage'a kaydet
function saveCheckboxState() {
    const state = {};
    currentDisplayData.forEach(row => {
        const key = getRowKey({ clientIdent: row.clientIdent, formId: row.formId });
        state[key] = row.checked;
    });
    localStorage.setItem('LOB_checkboxState', JSON.stringify(state));
}

// Checkbox durumlarını yükle
function loadCheckboxState() {
    const stored = localStorage.getItem('LOB_checkboxState');
    if (stored) {
        try {
            const state = JSON.parse(stored);
            checkboxState = state;
        } catch(e) { checkboxState = {}; }
    } else {
        checkboxState = {};
    }
}

// Tabloyu çiz (LOB Adı, LOB ID inputları ve checkbox ile)
function renderTable() {
    const thead = document.getElementById('tableHeader');
    const tbody = document.getElementById('tableBody');
    if (!thead || !tbody) return;
    
    // Başlıklar
    thead.innerHTML = `<tr>
        <th>ClientIdent</th><th>Client</th><th>Form ID</th><th>Form Name</th>
        <th>LOB Adı</th><th>LOB ID</th><th style="width:80px">Export Et?</th>
    </tr>`;
    
    if (!currentDisplayData.length) {
        tbody.innerHTML = `<td><td colspan="7" class="empty-state">Veri yok</td></tr>`;
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
    
    // Input ve checkbox eventlerini bağla
    document.querySelectorAll('.lobAdi-input').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(inp.dataset.idx);
            if (!isNaN(idx) && currentDisplayData[idx]) {
                currentDisplayData[idx].lobAdi = inp.value;
            }
        });
    });
    document.querySelectorAll('.lobId-input').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(inp.dataset.idx);
            if (!isNaN(idx) && currentDisplayData[idx]) {
                currentDisplayData[idx].lobId = inp.value;
            }
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

// Excel export (sadece işaretli satırlar, number formatında)
function exportToExcel() {
    const selectedRows = currentDisplayData.filter(row => row.checked === true);
    if (!selectedRows.length) {
        alert('İşaretli hiç satır yok. Lütfen en az bir satır seçin.');
        return;
    }
    // Export verisi
    const exportData = selectedRows.map(row => ({
        'ClientIdent': row.clientIdent,
        'Client': row.client,
        'Form ID': row.formId,
        'Form Name': row.formName,
        'LOB Adı': row.lobAdi,
        'LOB ID': row.lobId
    }));
    
    // Sayısal ID'leri number yap (LOB ID içinde sadece sayı varsa number, yoksa text)
    const processedData = exportData.map(row => {
        const newRow = { ...row };
        // ClientIdent ve Form ID'leri sayıya çevir (eğer tamamen sayısal ise)
        if (/^\d+$/.test(String(newRow.ClientIdent))) newRow.ClientIdent = Number(newRow.ClientIdent);
        if (/^\d+$/.test(String(newRow['Form ID']))) newRow['Form ID'] = Number(newRow['Form ID']);
        if (newRow['LOB ID'] && /^\d+$/.test(String(newRow['LOB ID']))) newRow['LOB ID'] = Number(newRow['LOB ID']);
        return newRow;
    });
    
    const ws = XLSX.utils.json_to_sheet(processedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'LOB_Eslesme');
    XLSX.writeFile(wb, `LOB_Export_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.xlsx`);
    alert(`${selectedRows.length} satır dışa aktarıldı.`);
}

// Tüm işaretleri sıfırla (hepsini true yap)
function resetAllCheckboxes() {
    if (confirm('Tüm satırların "Export Et?" kutularını işaretli hale getirmek istediğinize emin misiniz?')) {
        currentDisplayData.forEach(row => row.checked = true);
        saveCheckboxState();
        renderTable(); // yeniden çiz
    }
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

setupDrop(dropSource, sourceInput, loadSourceData);
setupDrop(dropRef, refInput, loadRefData);
exportBtn.addEventListener('click', exportToExcel);
resetCheckboxesBtn.addEventListener('click', resetAllCheckboxes);

// Başlangıçta tablo gizli
tableContainer.style.display = 'none';
exportBtn.disabled = true;
