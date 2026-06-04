// ==================== ORTAK YARDIMCILAR ====================
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}
function showLoader(step, show) {
  const el = document.getElementById(`loader${step}`);
  if (el) el.classList.toggle('visible', show);
}
function buildMonitorLink(ident, action = 'CHECKLIST') {
  if (!ident) return '#';
  const baseUrl = 'https://sebra.ccms.teleperformance.com/ccms-bin/console/tops/checklist.pl';
  const frmOption = action === 'DELETE' ? 'DELETE' : 'OPTION';
  return `${baseUrl}?frmTarget=CHECKLIST&checklist_ident=${encodeURIComponent(ident)}&frmOption=${frmOption}`;
}
function formatDateForFilename() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
// Adım geçiş
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const stepId = btn.dataset.step;
      document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
      document.getElementById(stepId).classList.add('active');
      document.querySelectorAll('.step-btn').forEach(b => b.classList.replace('btn-primary', 'btn-ghost'));
      btn.classList.replace('btn-ghost', 'btn-primary');
    });
  });
});

// ==================== STEP 1 ====================
let currentDataStep1 = [], errorRowsStep1 = [];
let markedForDeletion = new Set();
let clickedRows = new Set();

const fileInputStep1      = document.getElementById('fileInputStep1');
const uploadAreaStep1     = document.getElementById('uploadAreaStep1');
const statsContainerStep1 = document.getElementById('statsContainerStep1');
const errorsSectionStep1  = document.getElementById('errorsSectionStep1');
const totalCountSpanStep1 = document.getElementById('totalCountStep1');
const errorCountSpanStep1 = document.getElementById('errorCountStep1');
const validCountSpanStep1 = document.getElementById('validCountStep1');
const errorTableBodyStep1 = document.getElementById('errorTableBodyStep1');

function findColumnName(columns, possibleNames) {
  const lower = columns.map(c => String(c).trim().toLowerCase());
  for (const name of possibleNames) {
    const idx = lower.indexOf(name.toLowerCase());
    if (idx !== -1) return columns[idx];
  }
  return null;
}
function isValidMonitoringId(v) {
  if (v == null) return false;
  return /^\d{8}$/.test(String(v).trim());
}
function getErrorReason(v) {
  if (v == null || String(v).trim() === '') return 'Boş değer';
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) return 'Sayısal değil';
  if (s.length !== 8) return `${s.length} haneli (8 gerekli)`;
  return 'Geçersiz format';
}
function selectRandomRow(rowsArray) {
  if (!rowsArray.length) return null;
  return rowsArray[Math.floor(Math.random() * rowsArray.length)];
}
async function processFileStep1(file) {
  if (!file) return;
  if (typeof XLSX === 'undefined') { alert('XLSX kütüphanesi yüklenemedi.'); return; }
  showLoader('Step1', true);
  statsContainerStep1.style.display = 'none';
  errorsSectionStep1.style.display  = 'none';
  markedForDeletion.clear();
  clickedRows.clear();
  try {
    const wb   = XLSX.read(await file.arrayBuffer(), { type: 'array', defval: '' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!rows.length) throw new Error('Dosya boş');
    const columns = Object.keys(rows[0]);
    const monCol  = findColumnName(columns, ['Monitoring ID', 'monitoring id', 'MonitoringId']);
    const identCol = findColumnName(columns, ['Ident', 'ident', 'ID', 'Id']);
    if (!monCol)   throw new Error(`'Monitoring ID' sütunu yok: ${columns.join(', ')}`);
    if (!identCol) throw new Error(`'Ident' sütunu yok: ${columns.join(', ')}`);
    currentDataStep1 = rows;
    const idMap = new Map();
    rows.forEach((row, idx) => {
      const mid = row[monCol];
      const midStr = mid != null ? String(mid).trim() : null;
      if (midStr && isValidMonitoringId(midStr)) {
        if (!idMap.has(midStr)) idMap.set(midStr, []);
        idMap.get(midStr).push({
          rowIndex: idx,
          rowNum: idx + 2,
          identRaw: row[identCol] != null ? String(row[identCol]) : '',
          monitoringIdRaw: midStr
        });
      }
    });
    const toDeleteSet = new Set();
    for (let [id, entries] of idMap.entries()) {
      if (entries.length > 1) {
        const selected = selectRandomRow(entries);
        if (selected) toDeleteSet.add(selected.rowIndex);
      }
    }
    const duplicateGroups = new Map();
    for (let [id, entries] of idMap.entries()) {
      if (entries.length > 1) duplicateGroups.set(id, entries.map(e => e.rowNum));
    }
    const errors = [];
    rows.forEach((row, idx) => {
      const mid = row[monCol];
      const ident = row[identCol];
      const rowNum = idx + 2;
      let reason = null;
      if (!isValidMonitoringId(mid)) {
        reason = getErrorReason(mid);
      } else {
        const midStr = String(mid).trim();
        if (duplicateGroups.has(midStr)) {
          const otherRows = duplicateGroups.get(midStr).filter(r => r !== rowNum);
          reason = `Tekrar eden ID (${otherRows.map(r => `${r}. satır`).join(', ')})`;
        }
      }
      if (reason) {
        errors.push({
          rowIndex: idx,
          rowNumber: rowNum,
          monitoringIdRaw: mid != null ? String(mid) : '(boş)',
          identRaw: ident != null ? String(ident) : '',
          reason: reason,
          markedForDeletion: toDeleteSet.has(idx)
        });
      }
    });
    errorRowsStep1 = errors.sort((a, b) => {
      const idA = a.monitoringIdRaw, idB = b.monitoringIdRaw;
      if (idA === '(boş)') return 1;
      if (idB === '(boş)') return -1;
      const numA = parseInt(idA, 10);
      const numB = parseInt(idB, 10);
      if (isNaN(numA)) return 1;
      if (isNaN(numB)) return -1;
      return numA - numB;
    });
    const total = rows.length, errCount = errorRowsStep1.length;
    totalCountSpanStep1.textContent = total;
    errorCountSpanStep1.textContent = errCount;
    validCountSpanStep1.textContent = total - errCount;
    statsContainerStep1.style.display = 'flex';
    errorsSectionStep1.style.display  = 'block';
    renderErrorTable();
  } catch (err) {
    alert('Hata: ' + err.message);
  } finally {
    showLoader('Step1', false);
  }
}
function renderErrorTable() {
  const thead = document.querySelector('#errorsSectionStep1 .error-table thead');
  if (thead) {
    thead.innerHTML = `<tr><th># Satır</th><th>Monitoring ID</th><th>Hata Nedeni</th><th>İşlemler</th></td>`;
  }
  if (!errorRowsStep1.length) {
    errorTableBodyStep1.innerHTML = `</table><td colspan="4" class="empty-state">✅ Tüm ID'ler geçerli ve benzersiz!</td></tr>`;
    return;
  }
  errorTableBodyStep1.innerHTML = errorRowsStep1.map(err => {
    const normalLink = buildMonitorLink(err.identRaw, 'CHECKLIST');
    const deleteLink = buildMonitorLink(err.identRaw, 'DELETE');
    let rowClass = '';
    if (clickedRows.has(err.rowIndex)) {
      rowClass = 'clicked-row';
    } else if (err.markedForDeletion) {
      rowClass = 'delete-row';
    }
    return `
      <tr class="${rowClass}" data-row-index="${err.rowIndex}">
        <td>${err.rowNumber}</td>
        <td><code>${escapeHtml(err.monitoringIdRaw)}</code></td>
        <td><span class="badge-error">⚠️ ${escapeHtml(err.reason)}</span></td>
        <td>
          <a href="${normalLink}" target="_blank" class="link-btn" data-row-index="${err.rowIndex}">🔗 Link</a>
          <a href="${deleteLink}" target="_blank" class="delete-link-btn" data-row-index="${err.rowIndex}">🗑️ Sil</a>
        </td>
      </tr>
    `;
  }).join('');
  document.querySelectorAll('.link-btn, .delete-link-btn').forEach(btn => {
    btn.removeEventListener('click', handleStep1LinkClick);
    btn.addEventListener('click', handleStep1LinkClick);
  });
}
function handleStep1LinkClick(e) {
  e.preventDefault();
  const btn = e.currentTarget;
  const rowIndex = parseInt(btn.getAttribute('data-row-index'));
  if (!isNaN(rowIndex) && !clickedRows.has(rowIndex)) {
    clickedRows.add(rowIndex);
    renderErrorTable();
  }
  window.open(btn.href, '_blank');
}
uploadAreaStep1.addEventListener('click', () => fileInputStep1.click());
fileInputStep1.addEventListener('change', e => { if (e.target.files[0]) processFileStep1(e.target.files[0]); });
uploadAreaStep1.addEventListener('dragover', e => { e.preventDefault(); uploadAreaStep1.classList.add('drag'); });
uploadAreaStep1.addEventListener('dragleave', () => uploadAreaStep1.classList.remove('drag'));
uploadAreaStep1.addEventListener('drop', e => {
  e.preventDefault();
  uploadAreaStep1.classList.remove('drag');
  if (e.dataTransfer.files[0]) processFileStep1(e.dataTransfer.files[0]);
});
document.getElementById('resetStep1Btn').addEventListener('click', () => {
  currentDataStep1 = []; errorRowsStep1 = []; markedForDeletion.clear(); clickedRows.clear();
  fileInputStep1.value = '';
  statsContainerStep1.style.display = 'none';
  errorsSectionStep1.style.display  = 'none';
  errorTableBodyStep1.innerHTML = `<tr><td colspan="5" class="empty-state">Henüz veri yok</td></tr>`;
  totalCountSpanStep1.textContent = '0';
  errorCountSpanStep1.textContent = '0';
  validCountSpanStep1.textContent = '0';
});
// CSS stilleri (tüm temalarda okunabilirlik için)
if (!document.querySelector('#step1-styles')) {
  const style = document.createElement('style');
  style.id = 'step1-styles';
  style.textContent = `
    .delete-row { background-color: #fff3cd !important; }
    .clicked-row { background-color: #d4edda !important; }
    /* Sarı ve yeşil satırlarda yazı rengini koyu yap (tüm temalar için) */
    .delete-row, .clicked-row,
    .delete-row td, .clicked-row td,
    .delete-row code, .clicked-row code {
      color: #1a1a1a !important;
    }
    /* Butonların beyaz kalmasını sağla */
    .delete-row .link-btn, .clicked-row .link-btn,
    .delete-row .delete-link-btn, .clicked-row .delete-link-btn {
      color: white !important;
    }
    .delete-link-btn { 
      background-color: #dc3545; 
      color: white; 
      padding: 0.25rem 0.75rem; 
      border-radius: 2rem; 
      text-decoration: none; 
      font-size: 0.75rem; 
      margin-left: 5px; 
      display: inline-flex; 
      align-items: center; 
      gap: 0.25rem; 
    }
    .delete-link-btn:hover { filter: brightness(0.9); }
  `;
  document.head.appendChild(style);
}

// ==================== STEP 2 (kısaltılmış, çalışır) ====================
let mainDataStep2 = [], deletedIdentsStep2 = new Set(), refDataStep2 = [];
let distributionHistory = { DM: [], ML: [], DONUSUM: [] };
const WEEK_TARGET = { 1: 3, 2: 2, 3: 3, 4: 2 };
let currentWeekStep2 = 1;
let currentPreview = { DM: [], ML: [], DONUSUM: [] };

const HP_RULES = {
  HP_Dutch:   { checker: rec => rec.FeedbackCreatorName === 'Suleyman Aslan' },
  HP_German:  { checker: rec => rec.FeedbackCreatorName === 'Halil Emre Ozdemir' },
  HP_Turkish: { checker: rec => !['Suleyman Aslan', 'Halil Emre Ozdemir'].includes(rec.FeedbackCreatorName) }
};

const groups = {
  DM: {
    key: 'DM', name: 'DM',
    filter: ref => ref.KaliteDesteği === 'Evet' && ref.Dil === 'DM',  // Dağıtım Türü kontrolü yok
    sheetPerProject: true,
    fileName: () => `DM_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx`
  },
  ML: {
    key: 'ML', name: 'ML',
    filter: ref => ref.KaliteDesteği === 'Evet' && ref.Dil === 'ML',  // Dağıtım Türü kontrolü yok
    extraFilter: rec => String(rec.position_code_type_full_name || '').toLowerCase().includes('quality assurance analyst'),
    sheetPerProject: true,
    fileName: () => `ML_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx`
  },
  DONUSUM: {
    key: 'DONUSUM', name: 'Dönüşüm Projeleri',
    filter: ref => ref.KaliteDesteği === 'Hayır' && ref.Dil === 'DM',
    sheetPerProject: false,
    fileName: () => `Dönüşüm Projeleri_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx`
  }
};

function getRefInfo(proje) { return refDataStep2.find(r => String(r.Proje).trim() === String(proje).trim()); }
function saveHistoryForGroup(gk) { localStorage.setItem(`fb_distribution_history_${gk}`, JSON.stringify(distributionHistory[gk])); }
function loadHistoryForGroup(gk) { const s = localStorage.getItem(`fb_distribution_history_${gk}`); distributionHistory[gk] = s ? JSON.parse(s) : []; }
function loadAllHistories() { Object.keys(groups).forEach(g => loadHistoryForGroup(g)); }
function saveAllHistories() { Object.keys(groups).forEach(g => saveHistoryForGroup(g)); }
function exportAllHistory() {
  const all = { DM: distributionHistory.DM, ML: distributionHistory.ML, DONUSUM: distributionHistory.DONUSUM };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' }));
  a.download = `feedback_history_all_${formatDateForFilename()}.json`;
  a.click();
  alert('Tüm geçmiş dışa aktarıldı.');
}
function importAllHistory(file) {
  const r = new FileReader();
  r.onload = e => {
    try {
      const j = JSON.parse(e.target.result);
      if (j.DM && j.ML && j.DONUSUM) { distributionHistory = j; saveAllHistories(); alert('Geçmiş yüklendi.'); }
      else throw new Error();
    } catch { alert('Geçersiz dosya'); }
  };
  r.readAsText(file);
}
function viewHistoryModal() {
  const modal = document.createElement('div'); modal.className = 'modal'; modal.style.display = 'flex';
  const content = document.createElement('div'); content.className = 'modal-content';
  content.innerHTML = '<h3>Tüm Geçmiş Dağıtımlar</h3><button id="closeModalBtn" style="float:right;">Kapat</button><div style="clear:both;"></div>';
  ['DM', 'ML', 'DONUSUM'].forEach(g => {
    const title = document.createElement('h4');
    title.textContent = g === 'DONUSUM' ? 'Dönüşüm Projeleri' : g;
    content.appendChild(title);
    const table = document.createElement('table'); table.style.cssText = 'width:100%;border-collapse:collapse;';
    table.innerHTML = '<thead><tr><th>Hafta</th><th>Tarih</th><th>Sayı</th><th>Detay</th></tr></thead><tbody></tbody>';
    const tbody = table.querySelector('tbody');
    const hist = distributionHistory[g] || [];
    if (!hist.length) { tbody.innerHTML = '<tr><td colspan="4">Geçmiş yok</td></tr>'; }
    else {
      hist.slice().sort((a, b) => a.week - b.week).forEach(entry => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = entry.week;
        row.insertCell(1).textContent = new Date(entry.date).toLocaleString('tr-TR');
        row.insertCell(2).textContent = entry.assignments ? entry.assignments.length : 0;
        const btn = document.createElement('button'); btn.textContent = 'Göster'; btn.className = 'btn-ghost'; btn.style.cssText = 'padding:0.2rem 0.5rem;';
        btn.onclick = () => {
          const list = entry.assignments ? entry.assignments.map(a => `${a.FeedbackCreatorName} - ${a.client_name} (${a.emp_monitor_ident})`).join('\n') : 'Detay yok';
          alert(list);
        };
        row.insertCell(3).appendChild(btn);
      });
    }
    content.appendChild(table);
    content.appendChild(document.createElement('hr'));
  });
  modal.appendChild(content);
  document.body.appendChild(modal);
  document.getElementById('closeModalBtn').onclick = () => modal.remove();
}
function clearAllHistory() {
  if (confirm('Tüm geçmiş silinecek?')) {
    distributionHistory = { DM: [], ML: [], DONUSUM: [] };
    saveAllHistories();
    alert('Temizlendi.');
  }
}
function getDistributedIdentsForGroup(gk, week) {
  const set = new Set();
  distributionHistory[gk].forEach(e => { if (e.week < week && e.distributedIdents) e.distributedIdents.forEach(id => set.add(id)); });
  return set;
}
function getCumulativeCountsForGroup(gk, week) {
  const cnt = new Map();
  distributionHistory[gk].forEach(e => {
    if (e.week < week && e.assignments) {
      e.assignments.forEach(a => {
        const key = `${a.FeedbackCreatorName}|${a.client_name}`;
        cnt.set(key, (cnt.get(key) || 0) + 1);
      });
    }
  });
  return cnt;
}
function getAvailableRecordsForGroup(gk, week, groupFilter, extraFilter = null) {
  const distributed = getDistributedIdentsForGroup(gk, week);
  return mainDataStep2.filter(rec => {
    // 1. CheckListCreated = 0 olmalı
    if (!(rec.CheckListCreated === 0 || rec.CheckListCreated === '0')) return false;
    
    // 2. emp_monitor_ident boş veya null olmamalı
    const ident = String(rec.emp_monitor_ident || '').trim();
    if (ident === '') return false;
    
    // 3. Silinenlerde veya daha önce dağıtılmış olmamalı
    if (deletedIdentsStep2.has(ident) || distributed.has(ident)) return false;
    
    // 4. client_name boş veya null olmamalı
    const client = String(rec.client_name || '').trim();
    if (client === '') return false;
    
    // 5. FeedbackCreatorName boş veya null olmamalı
    const creator = String(rec.FeedbackCreatorName || '').trim();
    if (creator === '') return false;
    
    // 6. Referans listesinde proje olmalı ve filtreye uymalı
    const ref = getRefInfo(client);
    if (!ref || !groupFilter(ref)) return false;
    
    // 7. Varsa ek filtre (örneğin ML için pozisyon kontrolü)
    if (extraFilter && !extraFilter(rec)) return false;
    
    return true;
  });
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function calculateDistributionForGroup(gk, week, groupDef) {
  const available = getAvailableRecordsForGroup(gk, week, groupDef.filter, groupDef.extraFilter || null);
  if (!available.length) return [];
  if (gk === 'ML') {
    const hpRecords = available.filter(r => r.client_name.toLowerCase() === 'hewlett packard inc');
    const nonHp = available.filter(r => r.client_name.toLowerCase() !== 'hewlett packard inc');
    const selected = [];
    const cumulative = getCumulativeCountsForGroup(gk, week);
    for (const [hpKey, rule] of Object.entries(HP_RULES)) {
      const subset = hpRecords.filter(rule.checker);
      if (!subset.length) continue;
      const done = cumulative.get(hpKey) || 0;
      const need = Math.min(Math.min(WEEK_TARGET[week], 10 - done), subset.length);
      if (need > 0) selected.push(...shuffle(subset).slice(0, need));
    }
    const categoryMap = new Map();
    nonHp.forEach(rec => { if (!categoryMap.has(rec.client_name)) categoryMap.set(rec.client_name, []); categoryMap.get(rec.client_name).push(rec); });
    for (const [proj, records] of categoryMap) {
      const done = cumulative.get(proj) || 0;
      const need = Math.min(Math.min(WEEK_TARGET[week], 10 - done), records.length);
      if (need > 0) selected.push(...shuffle(records).slice(0, need));
    }
    return selected;
  }
  const categoryMap = new Map();
  available.forEach(rec => {
    const key = `${rec.FeedbackCreatorName}|${rec.client_name}`;
    if (!categoryMap.has(key)) categoryMap.set(key, []);
    categoryMap.get(key).push(rec);
  });
  const cumulative = getCumulativeCountsForGroup(gk, week);
  const selected = [];
  for (const [key, records] of categoryMap) {
    const done = cumulative.get(key) || 0;
    const need = Math.min(Math.min(WEEK_TARGET[week], 10 - done), records.length);
    if (need > 0) selected.push(...shuffle(records).slice(0, need));
  }
  return selected;
}
async function saveGroupDistribution(gk, week, selected) {
  const assignments = selected.map(rec => ({
    FeedbackCreatorName: rec.FeedbackCreatorName,
    client_name: rec.client_name,
    emp_monitor_ident: rec.emp_monitor_ident,
    dil: getRefInfo(rec.client_name)?.Dil || '',
    dagitimTuru: getRefInfo(rec.client_name)?.['Dağıtım Türü'] || ''
  }));
  const newEntry = { week, date: new Date().toISOString(), distributedIdents: selected.map(r => String(r.emp_monitor_ident)), assignments };
  const idx = distributionHistory[gk].findIndex(h => h.week === week);
  if (idx >= 0) distributionHistory[gk][idx] = newEntry;
  else distributionHistory[gk].push(newEntry);
  saveHistoryForGroup(gk);
}
async function exportGroupExcel(gk, selected) {
  const group = groups[gk];
  if (!selected.length) return;
  const workbook = XLSX.utils.book_new();
  const addSheet = (sheetName, rows) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.map(r => ({ ...r, Durum: '' }))), sheetName.substring(0, 31));
  };
  if (group.sheetPerProject) {
    const grouped = new Map();
    selected.forEach(rec => {
      if (!grouped.has(rec.client_name)) grouped.set(rec.client_name, []);
      grouped.get(rec.client_name).push({
        'İlk Fb Girişi Yapan': rec.FeedbackCreatorName,
        'Operasyon': rec.client_name,
        'Monitor Ident': rec.emp_monitor_ident,
        'Monitor Link': buildMonitorLink(rec.emp_monitor_ident, 'CHECKLIST')
      });
    });
    for (const [proj, rows] of grouped) addSheet(proj, rows);
  } else {
    const ref = selected.length ? getRefInfo(selected[0].client_name) : null;
    const sheetName = ref?.['Dağıtım Türü'] ? String(ref['Dağıtım Türü']).trim() : '1. Değerlendirici';
    addSheet(sheetName, selected.map(rec => ({
      'İlk Fb Girişi Yapan': rec.FeedbackCreatorName,
      'Operasyon': rec.client_name,
      'Monitor Ident': rec.emp_monitor_ident,
      'Monitor Link': buildMonitorLink(rec.emp_monitor_ident, 'CHECKLIST')
    })));
  }
  XLSX.writeFile(workbook, group.fileName());
}
async function previewAllGroups() {
  if (!mainDataStep2.length) { alert('Görüşme listesi yükleyin.'); return; }
  if (!refDataStep2.length) { alert('Referans listesi yükleyin.'); return; }
  const week = parseInt(document.getElementById('weekSelectStep2').value);
  currentWeekStep2 = week;
  const allSelected = [];
  for (const [gk, grp] of Object.entries(groups)) {
    const selected = calculateDistributionForGroup(gk, week, grp);
    currentPreview[gk] = selected;
    allSelected.push(...selected.map(s => ({ ...s, grup: grp.name })));
  }
  const previewDiv = document.getElementById('previewAreaStep2');
  const previewBody = document.getElementById('previewBodyStep2');
  previewDiv.style.display = 'block';
  if (!allSelected.length) {
    previewBody.innerHTML = '<tr><td colspan="5">Bu hafta dağıtılacak kayıt yok</td></tr>';
    document.getElementById('confirmBtnStep2').disabled = true;
    return;
  }
  previewBody.innerHTML = allSelected.map(rec => `
    <tr>
      <td>${escapeHtml(rec.grup)}</td>
      <td>${escapeHtml(rec.FeedbackCreatorName || '')}</td>
      <td>${escapeHtml(rec.client_name || '')}</td>
      <td>${escapeHtml(String(rec.emp_monitor_ident || ''))}</td>
      <td><a href="${buildMonitorLink(rec.emp_monitor_ident, 'CHECKLIST')}" target="_blank" class="link-btn">🔗 Link</a></td>
    </tr>`).join('');
  document.getElementById('confirmBtnStep2').disabled = false;
}
async function confirmAndExportAll() {
  if (Object.values(currentPreview).every(arr => !arr.length)) { alert('Önce dağıtım hesaplayın.'); return; }
  showLoader('Step2', true);
  try {
    const week = currentWeekStep2;
    const total = Object.values(currentPreview).reduce((a, b) => a + b.length, 0);
    for (const gk of ['DM', 'ML', 'DONUSUM']) {
      const selected = currentPreview[gk];
      if (selected.length) {
        await saveGroupDistribution(gk, week, selected);
        await exportGroupExcel(gk, selected);
      }
    }
    alert(`Dağıtım onaylandı. Toplam ${total} kayıt dağıtıldı.\nExcel dosyaları indirildi.`);
    document.getElementById('confirmBtnStep2').disabled = true;
    document.getElementById('previewAreaStep2').style.display = 'none';
    currentPreview = { DM: [], ML: [], DONUSUM: [] };
  } catch (err) {
    alert('Hata: ' + err.message);
  } finally {
    showLoader('Step2', false);
  }
}
async function loadMainFileStep2(file) {
  showLoader('Step2', true);
  const statusEl = document.getElementById('mainStatusStep2');
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!rows.length) throw new Error('Dosya boş');
    const required = ['FeedbackCreatorName', 'client_name', 'emp_monitor_ident', 'CheckListCreated'];
    const missing = required.filter(c => !(c in rows[0]));
    if (missing.length) throw new Error(`Eksik sütun: ${missing.join(', ')}`);
    mainDataStep2 = rows.filter(r => r.CheckListCreated === 0 || r.CheckListCreated === '0');
    statusEl.innerHTML = `✅ ${mainDataStep2.length} kayıt (CheckListCreated=0) yüklendi.`;
    statusEl.style.color = 'var(--accent)';
  } catch (err) {
    statusEl.innerHTML = `❌ ${err.message}`;
    statusEl.style.color = 'var(--accent3)';
    mainDataStep2 = [];
  } finally {
    showLoader('Step2', false);
  }
}
async function loadDeletedFileStep2(file) {
  showLoader('Step2', true);
  const statusEl = document.getElementById('deletedStatusStep2');
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const cols = Object.keys(rows[0]);
    const identCol = cols.find(c => c.toLowerCase() === 'ident');
    if (!identCol) throw new Error('Ident sütunu yok');
    deletedIdentsStep2.clear();
    rows.forEach(r => { const v = r[identCol]; if (v) deletedIdentsStep2.add(String(v).trim()); });
    statusEl.innerHTML = `✅ ${deletedIdentsStep2.size} silinen ident yüklendi.`;
    statusEl.style.color = 'var(--accent)';
  } catch (err) {
    statusEl.innerHTML = `❌ ${err.message}`;
    statusEl.style.color = 'var(--accent3)';
  } finally {
    showLoader('Step2', false);
  }
}
async function loadRefFileStep2(file) {
  showLoader('Step2', true);
  const statusEl = document.getElementById('refStatusStep2');
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    if (!rows.length) throw new Error('Dosya boş');
    const required = ['Proje', 'KaliteDesteği', 'Dil', 'Dağıtım Türü'];
    const missing = required.filter(c => !(c in rows[0]));
    if (missing.length) throw new Error(`Eksik sütun: ${missing.join(', ')}`);
    refDataStep2 = rows;
    statusEl.innerHTML = `✅ ${refDataStep2.length} referans yüklendi.`;
    statusEl.style.color = 'var(--accent)';
  } catch (err) {
    statusEl.innerHTML = `❌ ${err.message}`;
    statusEl.style.color = 'var(--accent3)';
    refDataStep2 = [];
  } finally {
    showLoader('Step2', false);
  }
}
function setupDrop(dropId, inputId, func) {
  const drop = document.getElementById(dropId);
  const inp = document.getElementById(inputId);
  if (!drop || !inp) { console.error(`setupDrop: ${dropId} veya ${inputId} bulunamadı`); return; }
  drop.addEventListener('click', () => inp.click());
  inp.addEventListener('change', e => { if (e.target.files[0]) func(e.target.files[0]); });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (e.dataTransfer.files[0]) func(e.dataTransfer.files[0]);
  });
}
setupDrop('dropMainStep2', 'mainFileInputStep2', loadMainFileStep2);
setupDrop('dropDeletedStep2', 'deletedFileInputStep2', loadDeletedFileStep2);
setupDrop('dropRefStep2', 'refFileInputStep2', loadRefFileStep2);
document.getElementById('calculateBtnStep2').addEventListener('click', previewAllGroups);
document.getElementById('confirmBtnStep2').addEventListener('click', confirmAndExportAll);
document.getElementById('exportHistoryBtnStep2').addEventListener('click', exportAllHistory);
document.getElementById('importHistoryBtnStep2').addEventListener('click', () => document.getElementById('historyImportInputStep2').click());
document.getElementById('historyImportInputStep2').addEventListener('change', e => { if (e.target.files[0]) importAllHistory(e.target.files[0]); });
document.getElementById('viewHistoryBtnStep2').addEventListener('click', viewHistoryModal);
document.getElementById('clearHistoryBtnStep2').addEventListener('click', clearAllHistory);
loadAllHistories();

// ==================== STEP 3 ====================
let reportMainData = [];
let reportHistory3 = { DM: [], ML: [], DONUSUM: [] };
let currentReportView = 'proje';

const mainFileInputS3 = document.getElementById('mainFileInputStep3');
const historyFileInputS3 = document.getElementById('historyFileInputStep3');
const mainStatusS3 = document.getElementById('mainStatusStep3');
const historyStatusS3 = document.getElementById('historyStatusStep3');
const calculateBtnS3 = document.getElementById('calculateReportBtnStep3');
const exportBtnS3 = document.getElementById('exportReportBtnStep3');
const reportBodyS3 = document.getElementById('reportBodyStep3');
const reportHeaderS3 = document.getElementById('reportHeaderStep3');
const reportAreaS3 = document.getElementById('reportAreaStep3');
const tabProje = document.getElementById('reportTabProje');
const tabProjeKisi = document.getElementById('reportTabProjeKisi');
const tabKisi = document.getElementById('reportTabKisi');

function showLoaderStep3(show) {
  const loader = document.getElementById('loaderStep3');
  if (loader) loader.classList.toggle('visible', show);
}
function findColumnNameStep3(columns, possibleNames) {
  const lower = columns.map(c => String(c).trim().toLowerCase());
  for (const name of possibleNames) {
    const idx = lower.indexOf(name.toLowerCase());
    if (idx !== -1) return columns[idx];
  }
  return null;
}
function loadMainExcelS3(file) {
  if (!file) return;
  showLoaderStep3(true);
  mainStatusS3.innerHTML = '⏳ Yükleniyor...';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) throw new Error('Dosya boş');
      const cols = Object.keys(rows[0]);
      const monCol = findColumnNameStep3(cols, ['Monitoring ID', 'monitoring id', 'MonitoringId']);
      const identCol = findColumnNameStep3(cols, ['Ident', 'ident', 'ID']);
      const clientCol = findColumnNameStep3(cols, ['client_name', 'client name']);
      const fbCol = findColumnNameStep3(cols, ['FeedbackCreatorName', 'feedbackcreatorname']);
      const checkCol = cols.find(c => c.toLowerCase().includes('checklistcreated'));
      if (!monCol) throw new Error(`Monitoring ID sütunu yok. Mevcut: ${cols.join(', ')}`);
      if (!identCol) throw new Error(`Ident sütunu yok`);
      if (!clientCol) throw new Error(`client_name sütunu yok`);
      if (!fbCol) throw new Error(`FeedbackCreatorName sütunu yok`);
      reportMainData = rows
        .filter(r => { if (!checkCol) return true; const v = r[checkCol]; return v === 0 || v === '0'; })
        .map(r => ({
          monitoringId: String(r[monCol]).trim(),
          ident: String(r[identCol]).trim(),
          client_name: String(r[clientCol]).trim(),
          feedbackCreatorName: String(r[fbCol]).trim()
        }));
      mainStatusS3.innerHTML = `✅ ${reportMainData.length} kayıt (CheckListCreated=0) yüklendi.`;
      mainStatusS3.style.color = 'var(--accent)';
      if (reportHistory3.DM.length || reportHistory3.ML.length || reportHistory3.DONUSUM.length) generateReportS3();
    } catch (err) {
      mainStatusS3.innerHTML = `❌ ${err.message}`;
      reportMainData = [];
    } finally {
      showLoaderStep3(false);
    }
  };
  reader.onerror = () => {
    mainStatusS3.innerHTML = '❌ Dosya okunamadı';
    showLoaderStep3(false);
  };
  reader.readAsArrayBuffer(file);
}
function loadHistoryJSONS3(file) {
  if (!file) return;
  showLoaderStep3(true);
  historyStatusS3.innerHTML = '⏳ Yükleniyor...';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && Array.isArray(parsed.DM) && Array.isArray(parsed.ML) && Array.isArray(parsed.DONUSUM)) {
        reportHistory3 = parsed;
        historyStatusS3.innerHTML = `✅ Geçmiş yüklendi (DM: ${reportHistory3.DM.length}, ML: ${reportHistory3.ML.length}, Dönüşüm: ${reportHistory3.DONUSUM.length})`;
        historyStatusS3.style.color = 'var(--accent)';
        if (reportMainData.length) generateReportS3();
      } else throw new Error('Geçersiz JSON yapısı');
    } catch (err) {
      historyStatusS3.innerHTML = `❌ ${err.message}`;
      reportHistory3 = { DM: [], ML: [], DONUSUM: [] };
    } finally {
      showLoaderStep3(false);
    }
  };
  reader.onerror = () => {
    historyStatusS3.innerHTML = '❌ Dosya okunamadı';
    showLoaderStep3(false);
  };
  reader.readAsText(file);
}
function buildDistributedMap() {
  const map = new Map();
  for (const [g, entries] of Object.entries(reportHistory3)) {
    for (const entry of entries || []) {
      for (const ass of entry.assignments || []) {
        const ident = String(ass.emp_monitor_ident || '').trim();
        if (ident) map.set(ident, { client_name: ass.client_name || '', feedbackCreatorName: ass.FeedbackCreatorName || '', group: g === 'DONUSUM' ? 'Dönüşüm Projeleri' : g });
      }
    }
  }
  return map;
}
function generateReportS3() {
  if (!reportMainData.length) {
    alert('Önce görüşme listesini yükleyin.');
    return;
  }
  const distMap = buildDistributedMap();
  const enriched = reportMainData.map(rec => ({
    ...rec,
    isDistributed: distMap.has(rec.monitoringId),
    ...(distMap.get(rec.monitoringId) || { client_name: '', feedbackCreatorName: '' })
  }));
  if (currentReportView === 'proje') {
    const projMap = new Map();
    enriched.forEach(rec => {
      if (!rec.client_name) return;
      if (!projMap.has(rec.client_name)) projMap.set(rec.client_name, { total: 0, dist: 0 });
      const s = projMap.get(rec.client_name);
      s.total++;
      if (rec.isDistributed) s.dist++;
    });
    renderReportTableS3(['Proje Adı', 'Dağıtılan', 'Bekleyen', 'Toplam'],
      Array.from(projMap.entries()).map(([p, s]) => [p, s.dist, s.total - s.dist, s.total]));
  } else if (currentReportView === 'projekisi') {
    const keyMap = new Map();
    enriched.forEach(rec => {
      if (!rec.client_name || !rec.feedbackCreatorName) return;
      const key = `${rec.client_name}|${rec.feedbackCreatorName}`;
      if (!keyMap.has(key)) keyMap.set(key, { proje: rec.client_name, kisi: rec.feedbackCreatorName, total: 0, dist: 0 });
      const s = keyMap.get(key);
      s.total++;
      if (rec.isDistributed) s.dist++;
    });
    renderReportTableS3(['Proje', 'Değerlendirici', 'Dağıtılan', 'Bekleyen', 'Toplam'],
      Array.from(keyMap.values()).map(v => [v.proje, v.kisi, v.dist, v.total - v.dist, v.total]));
  } else {
    const kisiMap = new Map();
    enriched.forEach(rec => {
      if (!rec.feedbackCreatorName) return;
      if (!kisiMap.has(rec.feedbackCreatorName)) kisiMap.set(rec.feedbackCreatorName, { total: 0, dist: 0 });
      const s = kisiMap.get(rec.feedbackCreatorName);
      s.total++;
      if (rec.isDistributed) s.dist++;
    });
    renderReportTableS3(['Değerlendirici', 'Dağıtılan', 'Bekleyen', 'Toplam'],
      Array.from(kisiMap.entries()).map(([k, s]) => [k, s.dist, s.total - s.dist, s.total]));
  }
  reportAreaS3.style.display = 'block';
  exportBtnS3.disabled = false;
  [tabProje, tabProjeKisi, tabKisi].forEach(btn => btn.style.display = 'inline-flex');
  [tabProje, tabProjeKisi, tabKisi].forEach(btn => btn.classList.remove('btn-primary', 'btn-ghost'));
  [tabProje, tabProjeKisi, tabKisi].forEach(btn => btn.classList.add('btn-ghost'));
  if (currentReportView === 'proje') tabProje.classList.replace('btn-ghost', 'btn-primary');
  else if (currentReportView === 'projekisi') tabProjeKisi.classList.replace('btn-ghost', 'btn-primary');
  else tabKisi.classList.replace('btn-ghost', 'btn-primary');
}
function renderReportTableS3(headers, rows) {
  reportHeaderS3.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
  reportBodyS3.innerHTML = rows.length
    ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}">Veri yok</td></tr>`;
}
function exportReportS3() {
  if (!reportMainData.length) {
    alert('Rapor verisi yok');
    return;
  }
  const wb = XLSX.utils.book_new();
  const distMap = buildDistributedMap();
  const enriched = reportMainData.map(rec => ({ ...rec, isDistributed: distMap.has(rec.monitoringId), ...(distMap.get(rec.monitoringId) || { client_name: '', feedbackCreatorName: '' }) }));
  // Proje Bazlı
  const projMap = new Map();
  enriched.forEach(rec => { if (!rec.client_name) return; if (!projMap.has(rec.client_name)) projMap.set(rec.client_name, { total: 0, dist: 0 }); const s = projMap.get(rec.client_name); s.total++; if (rec.isDistributed) s.dist++; });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(projMap.entries()).map(([p, s]) => ({ 'Proje': p, 'Dağıtılan': s.dist, 'Bekleyen': s.total - s.dist, 'Toplam': s.total }))), 'Proje_Bazlı');
  // Proje+Kişi
  const pkMap = new Map();
  enriched.forEach(rec => { if (!rec.client_name || !rec.feedbackCreatorName) return; const key = `${rec.client_name}|${rec.feedbackCreatorName}`; if (!pkMap.has(key)) pkMap.set(key, { proje: rec.client_name, kisi: rec.feedbackCreatorName, total: 0, dist: 0 }); const s = pkMap.get(key); s.total++; if (rec.isDistributed) s.dist++; });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(pkMap.values()).map(v => ({ 'Proje': v.proje, 'Değerlendirici': v.kisi, 'Dağıtılan': v.dist, 'Bekleyen': v.total - v.dist, 'Toplam': v.total }))), 'Proje_Değerlendirici');
  // Kişi Bazlı
  const kisiMap = new Map();
  enriched.forEach(rec => { if (!rec.feedbackCreatorName) return; if (!kisiMap.has(rec.feedbackCreatorName)) kisiMap.set(rec.feedbackCreatorName, { total: 0, dist: 0 }); const s = kisiMap.get(rec.feedbackCreatorName); s.total++; if (rec.isDistributed) s.dist++; });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(kisiMap.entries()).map(([k, s]) => ({ 'Değerlendirici': k, 'Dağıtılan': s.dist, 'Bekleyen': s.total - s.dist, 'Toplam': s.total }))), 'Değerlendirici_Bazlı');
  // RAW Dağıtım Detay
  const rawDist = [];
  for (const [g, entries] of Object.entries(reportHistory3)) {
    const groupName = g === 'DONUSUM' ? 'Dönüşüm Projeleri' : g;
    for (const entry of entries || []) {
      for (const ass of entry.assignments || []) {
        rawDist.push({
          'Grup': groupName,
          'Hafta': entry.week,
          'Dağıtım Tarihi': entry.date ? new Date(entry.date).toLocaleString('tr-TR') : '',
          'Değerlendirici (FeedbackCreatorName)': ass.FeedbackCreatorName,
          'Proje (client_name)': ass.client_name,
          'Monitoring ID (emp_monitor_ident)': ass.emp_monitor_ident,
          'Dil': ass.dil,
          'Dağıtım Türü': ass.dagitimTuru
        });
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDist), 'RAW_Dağıtım_Detay');
  // RAW Görüşme Listesi
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportMainData.map(r => ({
    'Monitoring ID': r.monitoringId,
    'Ident': r.ident,
    'Proje': r.client_name,
    'Değerlendirici': r.feedbackCreatorName
  }))), 'RAW_Görüşme_Listesi');
  XLSX.writeFile(wb, `Feedback_Rapor_${formatDateForFilename()}.xlsx`);
}
function setReportViewS3(view) {
  currentReportView = view;
  [tabProje, tabProjeKisi, tabKisi].forEach(btn => btn.classList.remove('btn-primary'));
  [tabProje, tabProjeKisi, tabKisi].forEach(btn => btn.classList.add('btn-ghost'));
  if (view === 'proje') tabProje.classList.replace('btn-ghost', 'btn-primary');
  else if (view === 'projekisi') tabProjeKisi.classList.replace('btn-ghost', 'btn-primary');
  else tabKisi.classList.replace('btn-ghost', 'btn-primary');
  if (reportMainData.length) generateReportS3();
}
function initStep3() {
  const dropMain = document.getElementById('dropMainStep3');
  const dropHistory = document.getElementById('dropHistoryStep3');
  if (!dropMain || !dropHistory) return;
  dropMain.addEventListener('click', () => mainFileInputS3.click());
  dropHistory.addEventListener('click', () => historyFileInputS3.click());
  mainFileInputS3.addEventListener('change', e => { if (e.target.files[0]) loadMainExcelS3(e.target.files[0]); });
  historyFileInputS3.addEventListener('change', e => { if (e.target.files[0]) loadHistoryJSONS3(e.target.files[0]); });
  [dropMain, dropHistory].forEach(d => {
    d.addEventListener('dragover', e => e.preventDefault());
    d.addEventListener('drop', e => {
      e.preventDefault();
      if (e.dataTransfer.files[0]) {
        if (d === dropMain) loadMainExcelS3(e.dataTransfer.files[0]);
        else loadHistoryJSONS3(e.dataTransfer.files[0]);
      }
    });
  });
}
calculateBtnS3.addEventListener('click', generateReportS3);
exportBtnS3.addEventListener('click', exportReportS3);
tabProje.addEventListener('click', () => setReportViewS3('proje'));
tabProjeKisi.addEventListener('click', () => setReportViewS3('projekisi'));
tabKisi.addEventListener('click', () => setReportViewS3('kisi'));
[tabProje, tabProjeKisi, tabKisi].forEach(btn => btn.style.display = 'none');
reportAreaS3.style.display = 'none';
exportBtnS3.disabled = true;
initStep3();
