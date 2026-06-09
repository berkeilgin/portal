// ═══════════════════════════════════════════════════════════════
//  LOB MASTER EŞLEME ARACI  —  v2.1 (tema + hız + zorunlu dosya)
// ═══════════════════════════════════════════════════════════════

// ── State ───────────────────────────────────────────────────────
let sourceData         = [];
let refClientList      = [];
let lobDataRows        = [];
let excludedFormIds    = new Set();
let filteredData       = [];
let currentDisplayData = [];
let masterData         = [];
let checkboxState      = {};

let lobSortCol    = null;
let lobSortDir    = 1;
let lobFilter     = '';
let lobFilterTimer;

let okSource   = false;
let okRef      = false;
let okLobData  = false;

// ── DOM kısayolları ─────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dropSource    = $('dropSourceData');
const dropRef       = $('dropRefList');
const dropLobData   = $('dropLobData');
const loader        = $('loaderLOB');
const lobDataPanel  = $('lobDataPanel');
const newRecordsPanel = $('newRecordsPanel');
const lobNotice     = $('lobNotice');
const lobThead      = $('lobThead');
const lobTbody      = $('lobTbody');
const newThead      = $('newThead');
const newTbody      = $('newTbody');
const exportBtn     = $('exportBtn');

// ── Yardımcılar ─────────────────────────────────────────────────
function showLoader(v)  { if(loader) loader.classList.toggle('visible', v); }
function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c =>
        ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    );
}
function showToast(msg, type = 'ok') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    const colors = { ok: 'var(--accent)', err: 'var(--accent3)', warn: 'var(--accent4)' };
    t.style.borderLeftColor = colors[type] || colors.ok;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3400);
}

function readExcel(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => {
            try {
                const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }));
            } catch (err) { reject(err); }
        };
        r.onerror = reject;
        r.readAsArrayBuffer(file);
    });
}

// ── UI durum güncelleme ─────────────────────────────────────────
function cardLoaded(cardId, badgeId, statusEl, msg) {
    const card = $(cardId);
    card.className = 'upload-card state-loaded';
    const badge = $(badgeId);
    if (badge) badge.style.display = 'inline';
    const dropZone = card.querySelector('.file-drop');
    if (dropZone) dropZone.classList.add('state-loaded');
    statusEl.textContent = msg;
    statusEl.style.color = 'var(--accent)';
}
function cardError(cardId, statusEl, msg, keepRequired = false) {
    const card = $(cardId);
    card.className = keepRequired ? 'upload-card state-required state-error' : 'upload-card state-error';
    const dropZone = card.querySelector('.file-drop');
    if (dropZone) dropZone.classList.remove('state-loaded');
    statusEl.textContent = msg;
    statusEl.style.color = 'var(--accent3)';
}

// ── Dosya 1 ─────────────────────────────────────────────────────
async function loadSource(file) {
    showLoader(true);
    $('sourceStatus').textContent = '⏳ Yükleniyor…';
    try {
        const rows = await readExcel(file);
        if (!rows.length) throw new Error('Dosya boş');
        const missing = ['ClientIdent','Client','LOBID','LOB1','Form ID Text','Form Name']
            .filter(c => !(c in rows[0]));
        if (missing.length) throw new Error(`Eksik sütunlar: ${missing.join(', ')}`);
        sourceData = rows.map(r => ({
            clientIdent: String(r.ClientIdent || '').trim(),
            client:      String(r.Client || '').trim(),
            formId:      String(r['Form ID Text'] || '').trim(),
            formName:    String(r['Form Name'] || '').trim(),
        }));
        okSource = true;
        cardLoaded('card1', 'badge1', $('sourceStatus'), `✅ ${sourceData.length} kayıt yüklendi`);
        checkAndRender();
    } catch (e) {
        okSource = false; sourceData = [];
        cardError('card1', $('sourceStatus'), `❌ ${e.message}`);
        newRecordsPanel.style.display = 'none';
    } finally { showLoader(false); }
}

// ── Dosya 2 ─────────────────────────────────────────────────────
async function loadRef(file) {
    showLoader(true);
    $('refStatus').textContent = '⏳ Yükleniyor…';
    try {
        const rows = await readExcel(file);
        if (!rows.length) throw new Error('Dosya boş');
        if (!('Client' in rows[0])) throw new Error('"Client" sütunu bulunamadı');
        refClientList = rows.map(r => String(r.Client || '').trim()).filter(Boolean);
        okRef = true;
        cardLoaded('card2', 'badge2', $('refStatus'), `✅ ${refClientList.length} client referansı`);
        checkAndRender();
    } catch (e) {
        okRef = false; refClientList = [];
        cardError('card2', $('refStatus'), `❌ ${e.message}`);
        newRecordsPanel.style.display = 'none';
    } finally { showLoader(false); }
}

// ── Dosya 3 (ZORUNLU) ───────────────────────────────────────────
async function loadLobData(file) {
    showLoader(true);
    $('lobDataStatus').textContent = '⏳ Yükleniyor…';
    try {
        const rows = await readExcel(file);
        if (!rows.length) throw new Error('Dosya boş');
        const firstRow = rows[0];
        const formIdCol = Object.keys(firstRow)
            .find(k => k.toLowerCase().replace(/\s+/g,'').includes('formid')) ?? 'FormID';
        excludedFormIds.clear();
        lobDataRows = [];
        for (const r of rows) {
            const fid = String(r[formIdCol] || '').trim();
            if (!fid) continue;
            excludedFormIds.add(fid);
            lobDataRows.push({
                ClientIdent: String(r.ClientIdent || '').trim(),
                Client:      String(r.Client || '').trim(),
                FormID:      fid,
                FormName:    String(r.FormName || r['Form Name'] || '').trim(),
                LOBAdi:      String(r.LOBAdı || r['LOB Adı'] || r.LOBAdi || '').trim(),
                LOBID:       String(r.LOBID || r['LOB ID'] || '').trim(),
            });
        }
        okLobData = true;
        const card3 = $('card3');
        card3.className = 'upload-card state-loaded';
        dropLobData.classList.add('state-loaded');
        if($('badge3req')) $('badge3req').style.display = 'none';
        if($('badge3')) $('badge3').style.display = 'inline';
        const st = $('lobDataStatus');
        st.textContent = `✅ ${lobDataRows.length} kayıt · ${excludedFormIds.size} Form ID dışlanacak`;
        st.style.color = 'var(--accent)';
        renderLobTable();
        lobDataPanel.style.display = 'block';
        checkAndRender();
    } catch (e) {
        okLobData = false; lobDataRows = []; excludedFormIds.clear();
        lobDataPanel.style.display = 'none';
        cardError('card3', $('lobDataStatus'), `❌ ${e.message}`, true);
        newRecordsPanel.style.display = 'none';
    } finally { showLoader(false); }
}

// ── Render karar ────────────────────────────────────────────────
function checkAndRender() {
    lobNotice.style.display = (okSource && okRef && !okLobData) ? 'block' : 'none';
    if (okSource && okRef && okLobData) {
        lobNotice.style.display = 'none';
        applyAndRender();
    }
}

// ── Filtrele ve yeni kayıtlar tablosu ───────────────────────────
function rKey(r) { return `${r.clientIdent}_${r.formId}`; }
function saveCheckboxState() {
    const s = {};
    currentDisplayData.forEach(r => { s[rKey(r)] = r.checked; });
    localStorage.setItem('LOB_checkboxState', JSON.stringify(s));
}
function loadCheckboxState() {
    try { checkboxState = JSON.parse(localStorage.getItem('LOB_checkboxState') || '{}'); }
    catch { checkboxState = {}; }
}
function applyAndRender() {
    const refSet = new Set(refClientList.map(c => c.toLowerCase()));
    filteredData = sourceData
        .filter(r => refSet.has(r.client.toLowerCase()))
        .filter(r => !excludedFormIds.has(r.formId));
    loadCheckboxState();
    currentDisplayData = filteredData.map(item => ({
        clientIdent: item.clientIdent,
        client:      item.client,
        formId:      item.formId,
        formName:    item.formName,
        lobAdi:      '',
        lobId:       '',
        checked:     checkboxState[rKey(item)] !== undefined ? checkboxState[rKey(item)] : true,
    }));
    renderNewTable();
    newRecordsPanel.style.display = 'block';
    const meta = document.getElementById('rowMeta');
    if(meta) meta.textContent = `${currentDisplayData.length} yeni kayıt · ${sourceData.length} toplam kaynak · ${excludedFormIds.size} dışlanmış Form ID`;
    const chip = document.getElementById('newCountChip');
    if(chip) chip.textContent = `${currentDisplayData.length} kayıt`;
    exportBtn.disabled = currentDisplayData.length === 0;
}

// ── LOB DATA TABLOSU (sıralanabilir/filtrelenebilir) ────────────
const LOB_COLS = [
    { key: 'ClientIdent', label: 'Clnt ID',  w: '68px'  },
    { key: 'Client',      label: 'Client'               },
    { key: 'FormID',      label: 'Form ID',  w: '80px'  },
    { key: 'FormName',    label: 'Form Adı'              },
    { key: 'LOBAdi',      label: 'LOB Adı'               },
    { key: 'LOBID',       label: 'LOB ID',   w: '68px'  },
];
function renderLobTable() {
    let data = lobDataRows;
    if (lobFilter) {
        const q = lobFilter.toLowerCase();
        data = data.filter(r =>
            r.Client.toLowerCase().includes(q) ||
            r.FormID.toLowerCase().includes(q) ||
            r.FormName.toLowerCase().includes(q) ||
            r.LOBAdi.toLowerCase().includes(q) ||
            r.LOBID.toLowerCase().includes(q)
        );
    }
    if (lobSortCol) {
        const col = lobSortCol, dir = lobSortDir;
        data = data.slice().sort((a,b) => {
            const av = String(a[col] ?? '').toLowerCase();
            const bv = String(b[col] ?? '').toLowerCase();
            return av < bv ? -dir : av > bv ? dir : 0;
        });
    }
    const countSpan = document.getElementById('lobCountChip');
    if(countSpan) countSpan.textContent = lobFilter ? `${data.length} / ${lobDataRows.length}` : `${lobDataRows.length} kayıt`;
    lobThead.innerHTML = '<tr>' + LOB_COLS.map(c => {
        const active = lobSortCol === c.key;
        const arrow = active ? (lobSortDir === 1 ? ' ▲' : ' ▼') : '';
        const wAttr = c.w ? ` style="width:${c.w}"` : '';
        return `<th class="sortable${active ? ' sort-on' : ''}" data-col="${c.key}"${wAttr}>${c.label}${arrow}</th>`;
    }).join('') + '</tr>';
    const slice = data.slice(0, 1500);
    lobTbody.innerHTML = slice.map(r => `
        <tr>
            <td>${esc(r.ClientIdent)}</td>
            <td>${esc(r.Client)}</td>
            <td>${esc(r.FormID)}</td>
            <td>${esc(r.FormName)}</td>
            <td>${esc(r.LOBAdi)}</td>
            <td>${esc(r.LOBID)}</td>
        </tr>
    `).join('');
    if (data.length > 1500) lobTbody.insertAdjacentHTML('beforeend', `<tr><td colspan="6" class="empty-state">… ve ${data.length-1500} kayıt daha — aramayı daraltın</td></tr>`);
}
lobThead.addEventListener('click', e => {
    const th = e.target.closest('.sortable');
    if (!th) return;
    const col = th.dataset.col;
    lobSortDir = (lobSortCol === col) ? -lobSortDir : 1;
    lobSortCol = col;
    renderLobTable();
});
const searchInput = document.getElementById('lobSearchInput');
const clearBtn = document.getElementById('btnClearSearch');
if(searchInput) searchInput.addEventListener('input', e => {
    clearTimeout(lobFilterTimer);
    lobFilterTimer = setTimeout(() => { lobFilter = e.target.value.trim(); renderLobTable(); }, 220);
});
if(clearBtn) clearBtn.addEventListener('click', () => {
    if(searchInput) searchInput.value = '';
    lobFilter = '';
    renderLobTable();
});

// ── YENİ KAYITLAR TABLOSU ───────────────────────────────────────
function renderNewTable() {
    newThead.innerHTML = `<tr>
        <th style="width:68px">Clnt ID</th><th>Client</th><th style="width:80px">Form ID</th>
        <th>Form Adı</th><th style="min-width:140px">LOB Adı</th><th style="width:110px">LOB ID</th>
        <th style="width:58px;text-align:center">Export?</th>
    </tr>`;
    if (!currentDisplayData.length) {
        newTbody.innerHTML = `<tr><td colspan="7" class="empty-state">📭 Gösterilecek yeni kayıt yok — tüm Form ID'ler zaten eşlenmiş veya client filtresinde yok.</td></tr>`;
        exportBtn.disabled = true;
        return;
    }
    exportBtn.disabled = false;
    newTbody.innerHTML = currentDisplayData.map((r, i) => `
        <tr>
            <td>${esc(r.clientIdent)}</td>
            <td>${esc(r.client)}</td>
            <td>${esc(r.formId)}</td>
            <td>${esc(r.formName)}</td>
            <td><input type="text" class="la" data-i="${i}" value="${esc(r.lobAdi)}" placeholder="LOB Adı"></td>
            <td><input type="text" class="li" data-i="${i}" value="${esc(r.lobId)}" placeholder="LOB ID"></td>
            <td class="cb-cell"><input type="checkbox" class="ec" data-i="${i}" ${r.checked ? 'checked' : ''}></td>
        </tr>
    `).join('');
}
newTbody.addEventListener('change', e => {
    const i = parseInt(e.target.dataset.i, 10);
    if (isNaN(i) || !currentDisplayData[i]) return;
    const cl = e.target.classList;
    if (cl.contains('la')) currentDisplayData[i].lobAdi = e.target.value;
    if (cl.contains('li')) currentDisplayData[i].lobId = e.target.value;
    if (cl.contains('ec')) { currentDisplayData[i].checked = e.target.checked; saveCheckboxState(); }
});

// ── EXPORT ───────────────────────────────────────────────────────
function exportMaster() {
    const selected = currentDisplayData.filter(r => r.checked && (r.lobAdi || r.lobId));
    if (!selected.length) {
        showToast('⚠️ LOB bilgisi dolu ve işaretli kayıt bulunamadı.', 'warn');
        return;
    }
    let updated = [...masterData];
    for (const r of selected) {
        const rec = {
            ClientIdent: r.clientIdent, Client: r.client,
            FormID: r.formId, FormName: r.formName,
            LOBAdi: r.lobAdi, LOBID: r.lobId
        };
        const idx = updated.findIndex(m => m.FormID === r.formId);
        if (idx !== -1) updated[idx] = rec; else updated.push(rec);
    }
    saveMaster(updated);
    const toNum = v => (/^\d+$/.test(String(v)) ? +v : v);
    const ws = XLSX.utils.json_to_sheet(updated.map(r => ({
        'ClientIdent': toNum(r.ClientIdent),
        'Client': r.Client,
        'FormID': toNum(r.FormID),
        'FormName': r.FormName,
        'LOB Adı': r.LOBAdi,
        'LOB ID': r.LOBID ? toNum(r.LOBID) : r.LOBID,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'LOB_Master');
    XLSX.writeFile(wb, `LOB_Master_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.xlsx`);
    showToast(`✅ ${selected.length} kayıt eklendi/güncellendi · Toplam master: ${updated.length} · Dosya indirildi`);
    setTimeout(applyAndRender, 300);
}

function resetCheckboxes() {
    currentDisplayData.forEach(r => r.checked = true);
    saveCheckboxState();
    renderNewTable();
    showToast('Tüm satırlar işaretlendi.');
}

// ── localStorage master ─────────────────────────────────────────
function loadMaster() {
    try {
        const s = localStorage.getItem('LOB_masterData');
        if (s) {
            masterData = JSON.parse(s);
            masterData.forEach(r => { if (r.FormID) excludedFormIds.add(String(r.FormID).trim()); });
        }
    } catch { masterData = []; }
}
function saveMaster(data) {
    localStorage.setItem('LOB_masterData', JSON.stringify(data));
    masterData = data;
    excludedFormIds.clear();
    masterData.forEach(r => { if (r.FormID) excludedFormIds.add(String(r.FormID).trim()); });
}

// ── Tema ─────────────────────────────────────────────────────────
function setTheme(t) {
    document.body.className = t;
    localStorage.setItem('qaPortalTheme', t);
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === t);
    });
}
document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
});

// ── Drag & Drop ─────────────────────────────────────────────────
function setupDrop(drop, input, fn) {
    drop.addEventListener('click', e => { if (e.target !== input) input.click(); });
    input.addEventListener('change', e => { if (e.target.files[0]) fn(e.target.files[0]); });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
        e.preventDefault(); drop.classList.remove('drag');
        if (e.dataTransfer.files[0]) fn(e.dataTransfer.files[0]);
    });
}

// ── INIT ─────────────────────────────────────────────────────────
loadMaster();
loadCheckboxState();
const savedTheme = localStorage.getItem('qaPortalTheme') || 'grey';
setTheme(savedTheme);
setupDrop(dropSource, document.getElementById('sourceFileInput'), loadSource);
setupDrop(dropRef, document.getElementById('refFileInput'), loadRef);
setupDrop(dropLobData, document.getElementById('lobDataFileInput'), loadLobData);
document.getElementById('exportBtn')?.addEventListener('click', exportMaster);
document.getElementById('resetCheckboxesBtn')?.addEventListener('click', resetCheckboxes);

// Başlangıçta panelleri gizle
lobDataPanel.style.display = 'none';
newRecordsPanel.style.display = 'none';
