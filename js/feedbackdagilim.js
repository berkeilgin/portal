// ==================== ORTAK YARDIMCILAR ====================
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}
function showLoader(step, show) {
  const el = document.getElementById(`loader${step}`);
  if (el) el.classList.toggle('visible', show);
}
function buildMonitorLink(ident) {
  if (!ident) return '#';
  return `https://sebra.ccms.teleperformance.com/ccms-bin/console/tops/checklist.pl?frmTarget=CHECKLIST&checklist_ident=${encodeURIComponent(ident)}&frmOption=OPTION`;
}
function formatDateForFilename() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

// ========== ADIM GEÇİŞİ ==========
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      const stepId = this.dataset.step;
      document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
      document.getElementById(stepId).classList.add('active');
      document.querySelectorAll('.step-btn').forEach(b => b.classList.replace('btn-primary', 'btn-ghost'));
      this.classList.replace('btn-ghost', 'btn-primary');
    });
  });
});

// ==================== STEP 1 (değişmedi) ====================
let currentDataStep1 = [], errorRowsStep1 = [];
const fileInputStep1 = document.getElementById('fileInputStep1');
const uploadAreaStep1 = document.getElementById('uploadAreaStep1');
const statsContainerStep1 = document.getElementById('statsContainerStep1');
const errorsSectionStep1 = document.getElementById('errorsSectionStep1');
const totalCountSpanStep1 = document.getElementById('totalCountStep1');
const errorCountSpanStep1 = document.getElementById('errorCountStep1');
const validCountSpanStep1 = document.getElementById('validCountStep1');
const errorTableBodyStep1 = document.getElementById('errorTableBodyStep1');

function findColumnName(columns, possibleNames) {
  const lowerCols = columns.map(c => String(c).trim().toLowerCase());
  for (let name of possibleNames) {
    const idx = lowerCols.indexOf(name.toLowerCase());
    if (idx !== -1) return columns[idx];
  }
  return null;
}
function isValidMonitoringId(value) {
  if (value == null) return false;
  let str = String(value).trim();
  return /^\d{8}$/.test(str);
}
function getErrorReason(value) {
  if (value == null || String(value).trim() === "") return "Boş değer";
  let str = String(value).trim();
  if (!/^\d+$/.test(str)) return "Sayısal değil";
  if (str.length !== 8) return `${str.length} haneli (8 gerekli)`;
  return "Geçersiz format";
}
async function processFileStep1(file) {
  if (!file) return;
  if (typeof XLSX === 'undefined') { alert("XLSX kütüphanesi yüklenemedi."); return; }
  showLoader('Step1', true);
  statsContainerStep1.style.display = 'none';
  errorsSectionStep1.style.display = 'none';
  errorRowsStep1 = [];
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', defval: "" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    let rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rows.length) throw new Error('Dosya boş');
    const columns = Object.keys(rows[0]);
    const monitoringCol = findColumnName(columns, ['Monitoring ID', 'monitoring id', 'MonitoringId']);
    const identCol = findColumnName(columns, ['Ident', 'ident', 'ID', 'Id']);
    if (!monitoringCol) throw new Error(`'Monitoring ID' sütunu bulunamadı. Mevcut: ${columns.join(', ')}`);
    if (!identCol) throw new Error(`'Ident' sütunu bulunamadı. Mevcut: ${columns.join(', ')}`);
    currentDataStep1 = rows;
    const errors = [];
    rows.forEach((row, idx) => {
      const monitoringId = row[monitoringCol];
      const ident = row[identCol];
      if (!isValidMonitoringId(monitoringId)) {
        errors.push({
          rowNumber: idx + 2,
          monitoringIdRaw: monitoringId != null ? String(monitoringId) : "(boş)",
          identRaw: ident != null ? String(ident) : "",
          reason: getErrorReason(monitoringId)
        });
      }
    });
    errorRowsStep1 = errors;
    const total = rows.length, errCount = errors.length, valid = total - errCount;
    totalCountSpanStep1.textContent = total;
    errorCountSpanStep1.textContent = errCount;
    validCountSpanStep1.textContent = valid;
    statsContainerStep1.style.display = 'flex';
    if (errCount === 0) {
      errorsSectionStep1.style.display = 'block';
      errorTableBodyStep1.innerHTML = `<tr><td colspan="5" class="empty-state">✅ Tüm Monitoring ID değerleri geçerli!</td></tr>`;
    } else {
      errorsSectionStep1.style.display = 'block';
      let html = '';
      errors.forEach(err => {
        const link = buildMonitorLink(err.identRaw);
        const linkHtml = link ? `<a href="${link}" target="_blank" class="link-btn">🔗 İncele</a>` : `<span class="badge-error">Ident eksik</span>`;
        html += `<tr>
          <td>${err.rowNumber}</td>
          <td><code>${escapeHtml(err.monitoringIdRaw)}</code></td>
          <td><code>${escapeHtml(err.identRaw) || "—"}</code></td>
          <td><span class="badge-error">⚠️ ${escapeHtml(err.reason)}</span></td>
          <td>${linkHtml}</td>
        </tr>`;
      });
      errorTableBodyStep1.innerHTML = html;
    }
  } catch (err) {
    alert("Hata: " + err.message);
  } finally {
    showLoader('Step1', false);
  }
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
  currentDataStep1 = []; errorRowsStep1 = []; fileInputStep1.value = '';
  statsContainerStep1.style.display = 'none'; errorsSectionStep1.style.display = 'none';
  errorTableBodyStep1.innerHTML = '<tr><td colspan="5" class="empty-state">Henüz veri yok</td></tr>';
  totalCountSpanStep1.textContent = '0'; errorCountSpanStep1.textContent = '0'; validCountSpanStep1.textContent = '0';
});

// ==================== STEP 2 (ÜÇ GRUP) ====================
let mainDataStep2 = [], deletedIdentsStep2 = new Set(), refDataStep2 = [];
let distributionHistory = { DM: [], ML: [], DONUSUM: [] };
const WEEK_TARGET = {1:3, 2:2, 3:3, 4:2};
let currentWeekStep2 = 1;
let currentPreview = { DM: [], ML: [], DONUSUM: [] };

// Grup tanımları
const groups = {
  DM: { key: 'DM', name: 'DM', filter: (ref) => ref.KaliteDesteği === 'Evet' && ref.Dil === 'DM' && ref["Dağıtım Türü"] === 'Proje', sheetPerProject: true, fileName: (week) => `DM_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx` },
  ML: { key: 'ML', name: 'ML', filter: (ref) => ref.KaliteDesteği === 'Evet' && ref.Dil === 'ML' && ref["Dağıtım Türü"] === 'Proje', sheetPerProject: true, fileName: (week) => `ML_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx` },
  DONUSUM: { key: 'DONUSUM', name: 'Dönüşüm Projeleri', filter: (ref) => ref.KaliteDesteği === 'Hayır' && ref.Dil === 'DM' && ref["Dağıtım Türü"] === '1. Değerlendirici', sheetPerProject: false, fileName: (week) => `Dönüşüm Projeleri_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx` }
};

function getRefInfo(projeAdi) {
  return refDataStep2.find(r => String(r.Proje).trim() === String(projeAdi).trim());
}

// Geçmiş işlemleri (her grup için ayrı localStorage)
function saveHistoryForGroup(groupKey) {
  localStorage.setItem(`fb_distribution_history_${groupKey}`, JSON.stringify(distributionHistory[groupKey]));
}
function loadHistoryForGroup(groupKey) {
  const stored = localStorage.getItem(`fb_distribution_history_${groupKey}`);
  if (stored) try { distributionHistory[groupKey] = JSON.parse(stored); } catch(e) { distributionHistory[groupKey] = []; }
  else distributionHistory[groupKey] = [];
}
function loadAllHistories() {
  loadHistoryForGroup('DM');
  loadHistoryForGroup('ML');
  loadHistoryForGroup('DONUSUM');
}
function saveAllHistories() {
  saveHistoryForGroup('DM');
  saveHistoryForGroup('ML');
  saveHistoryForGroup('DONUSUM');
}
// Geçmişi tek bir JSON olarak dışa aktar
function exportAllHistory() {
  const all = { DM: distributionHistory.DM, ML: distributionHistory.ML, DONUSUM: distributionHistory.DONUSUM };
  const dataStr = JSON.stringify(all, null, 2);
  const blob = new Blob([dataStr], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `feedback_history_all_${formatDateForFilename()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  alert("Tüm geçmiş dışa aktarıldı.");
}
// Geçmiş yükle
function importAllHistory(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (imported.DM && imported.ML && imported.DONUSUM) {
        distributionHistory = imported;
        saveAllHistories();
        alert('Geçmiş başarıyla yüklendi.');
      } else throw new Error('Geçersiz format');
    } catch (err) { alert('Geçersiz dosya'); }
  };
  reader.readAsText(file);
}
// Geçmişi görüntüleme modal'ı (tüm gruplar)
function viewHistoryModal() {
  const modal = document.createElement('div'); modal.className = 'modal'; modal.style.display = 'flex';
  const content = document.createElement('div'); content.className = 'modal-content';
  content.innerHTML = '<h3>Tüm Geçmiş Dağıtımlar</h3><button id="closeModalBtn" style="float:right;">Kapat</button><div style="clear:both;"></div>';
  const groupsList = ['DM', 'ML', 'DONUSUM'];
  groupsList.forEach(g => {
    const title = document.createElement('h4');
    title.textContent = g === 'DONUSUM' ? 'Dönüşüm Projeleri' : g;
    content.appendChild(title);
    const table = document.createElement('table'); table.style.width = '100%'; table.style.borderCollapse = 'collapse';
    table.innerHTML = '<thead><tr><th>Hafta</th><th>Tarih</th><th>Sayı</th><th>Detay</th></tr></thead><tbody></tbody>';
    const tbody = table.querySelector('tbody');
    const hist = distributionHistory[g];
    if (!hist.length) {
      const row = tbody.insertRow();
      row.insertCell(0).colSpan = 4; row.insertCell(0).textContent = 'Geçmiş yok';
    } else {
      hist.slice().sort((a,b) => a.week - b.week).forEach(entry => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = entry.week;
        row.insertCell(1).textContent = new Date(entry.date).toLocaleString();
        row.insertCell(2).textContent = entry.assignments.length;
        const btn = document.createElement('button'); btn.textContent = 'Göster'; btn.className = 'btn-ghost'; btn.style.padding = '0.2rem 0.5rem';
        btn.onclick = () => alert(entry.assignments.map(a => `${a.FeedbackCreatorName} - ${a.client_name} (${a.emp_monitor_ident})`).join('\n'));
        row.insertCell(3).appendChild(btn);
      });
    }
    content.appendChild(table);
    content.appendChild(document.createElement('hr'));
  });
  modal.appendChild(content); document.body.appendChild(modal);
  document.getElementById('closeModalBtn').onclick = () => modal.remove();
}
function clearAllHistory() {
  if (confirm('Tüm grupların geçmişi silinecek. Devam?')) {
    distributionHistory = { DM: [], ML: [], DONUSUM: [] };
    saveAllHistories();
    alert('Tüm geçmiş temizlendi.');
  }
}

// Ortak yardımcılar (dağıtım algoritması grup bazlı)
function getDistributedIdentsForGroup(groupKey, week) {
  const set = new Set();
  const hist = distributionHistory[groupKey];
  for (let entry of hist) {
    if (entry.week < week) { // önceki haftalar
      if (entry.distributedIdents) entry.distributedIdents.forEach(id => set.add(id));
    }
  }
  return set;
}
function getCumulativeCountsForGroup(groupKey, week) {
  const counts = new Map();
  const hist = distributionHistory[groupKey];
  for (let w = 1; w < week; w++) {
    const entry = hist.find(h => h.week === w);
    if (entry && entry.assignments) {
      entry.assignments.forEach(ass => {
        const key = `${ass.FeedbackCreatorName}|${ass.client_name}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    }
  }
  return counts;
}
function getAvailableRecordsForGroup(groupKey, week, groupFilter) {
  const distributedIdents = getDistributedIdentsForGroup(groupKey, week);
  return mainDataStep2.filter(rec => {
    const zero = (rec.CheckListCreated === 0 || rec.CheckListCreated === '0');
    if (!zero) return false;
    const ident = String(rec.emp_monitor_ident || '');
    if (deletedIdentsStep2.has(ident)) return false;
    if (distributedIdents.has(ident)) return false;
    // Grup filtresine uygun proje mi?
    const ref = getRefInfo(rec.client_name);
    if (!ref) return false;
    return groupFilter(ref);
  });
}
function calculateDistributionForGroup(groupKey, week, groupFilter) {
  const available = getAvailableRecordsForGroup(groupKey, week, groupFilter);
  if (available.length === 0) return [];
  // Kategorilere ayır: Proje bazlı (çünkü DM/ML'de Dağıtım Türü zaten Proje, Dönüşüm'de 1. Değerlendirici)
  // DM ve ML için kategori = proje adı (tüm değerlendiriciler birlikte)
  // Dönüşüm için kategori = değerlendirici + proje (kişi-proje bazlı)
  const categoryMap = new Map();
  available.forEach(rec => {
    const ref = getRefInfo(rec.client_name);
    let key;
    if (groupKey === 'DONUSUM') {
      key = `${rec.FeedbackCreatorName}|${rec.client_name}`; // kişi-proje
    } else {
      key = rec.client_name; // sadece proje
    }
    if (!categoryMap.has(key)) categoryMap.set(key, []);
    categoryMap.get(key).push(rec);
  });
  const cumulativeBefore = getCumulativeCountsForGroup(groupKey, week);
  const needMap = new Map();
  for (let [key, records] of categoryMap) {
    let done = cumulativeBefore.get(key) || 0;
    let target = WEEK_TARGET[week];
    let need = Math.min(target, 10 - done);
    if (need > 0) {
      need = Math.min(need, records.length);
      if (need > 0) needMap.set(key, need);
    }
  }
  const selected = [];
  for (let [key, need] of needMap) {
    const records = categoryMap.get(key);
    const shuffled = [...records];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    selected.push(...shuffled.slice(0, need));
  }
  return selected;
}
async function saveGroupDistribution(groupKey, week, selected, groupFilter) {
  const assignmentsWithMeta = selected.map(rec => {
    const ref = getRefInfo(rec.client_name);
    return {
      FeedbackCreatorName: rec.FeedbackCreatorName,
      client_name: rec.client_name,
      emp_monitor_ident: rec.emp_monitor_ident,
      dil: ref ? ref.Dil : '',
      dagitimTuru: ref ? ref["Dağıtım Türü"] : ''
    };
  });
  const newEntry = {
    week: week,
    date: new Date().toISOString(),
    distributedIdents: selected.map(r => String(r.emp_monitor_ident)),
    assignments: assignmentsWithMeta
  };
  const idx = distributionHistory[groupKey].findIndex(h => h.week === week);
  if (idx >= 0) distributionHistory[groupKey][idx] = newEntry;
  else distributionHistory[groupKey].push(newEntry);
  saveHistoryForGroup(groupKey);
}
async function exportGroupExcel(groupKey, selected, week) {
  const group = groups[groupKey];
  if (!selected.length) return;
  const workbook = XLSX.utils.book_new();
  if (group.sheetPerProject) {
    // Her proje için ayrı sheet
    const grouped = new Map();
    selected.forEach(rec => {
      const proj = rec.client_name;
      if (!grouped.has(proj)) grouped.set(proj, []);
      grouped.get(proj).push({
        'İlk Fb Girişi Yapan': rec.FeedbackCreatorName,
        'Operasyon': rec.client_name,
        'Monitor Ident': rec.emp_monitor_ident,
        'Monitor Link': buildMonitorLink(rec.emp_monitor_ident)
      });
    });
    for (let [proj, rows] of grouped.entries()) {
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, proj.substring(0, 31));
    }
  } else {
    // Dönüşüm Projeleri: tek sheet, sheet adı referanstaki Dağıtım Türü (ör. "1. Değerlendirici")
    let sheetName = "1. Değerlendirici"; // varsayılan
    if (selected.length > 0) {
      const ref = getRefInfo(selected[0].client_name);
      if (ref && ref["Dağıtım Türü"]) sheetName = String(ref["Dağıtım Türü"]).trim();
    }
    const rows = selected.map(rec => ({
      'İlk Fb Girişi Yapan': rec.FeedbackCreatorName,
      'Operasyon': rec.client_name,
      'Monitor Ident': rec.emp_monitor_ident,
      'Monitor Link': buildMonitorLink(rec.emp_monitor_ident)
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, ws, sheetName.substring(0, 31));
  }
  XLSX.writeFile(workbook, group.fileName(week));
}

// Önizleme ve Onaylama
async function previewAllGroups() {
  if (!mainDataStep2.length) { alert('Görüşme listesi yükleyin.'); return; }
  if (!refDataStep2.length) { alert('Referans listesi yükleyin.'); return; }
  const week = parseInt(document.getElementById('weekSelectStep2').value);
  currentWeekStep2 = week;
  let allSelected = [];
  for (let [groupKey, group] of Object.entries(groups)) {
    const selected = calculateDistributionForGroup(groupKey, week, group.filter);
    currentPreview[groupKey] = selected;
    allSelected.push(...selected.map(s => ({ ...s, grup: group.name })));
  }
  const previewDiv = document.getElementById('previewAreaStep2');
  const previewBody = document.getElementById('previewBodyStep2');
  if (allSelected.length === 0) {
    previewDiv.style.display = 'block';
    previewBody.innerHTML = '<tr><td colspan="5">Bu hafta için hiçbir grupta dağıtılacak kayıt yok.</td></tr>';
    document.getElementById('confirmBtnStep2').disabled = true;
    return;
  }
  previewBody.innerHTML = '';
  allSelected.forEach(rec => {
    const row = previewBody.insertRow();
    row.insertCell(0).textContent = rec.grup;
    row.insertCell(1).textContent = rec.FeedbackCreatorName || '';
    row.insertCell(2).textContent = rec.client_name || '';
    row.insertCell(3).textContent = rec.emp_monitor_ident || '';
    const linkCell = row.insertCell(4);
    const a = document.createElement('a');
    a.href = buildMonitorLink(rec.emp_monitor_ident);
    a.target = '_blank';
    a.textContent = '🔗 Link';
    a.className = 'link-btn';
    linkCell.appendChild(a);
  });
  previewDiv.style.display = 'block';
  document.getElementById('confirmBtnStep2').disabled = false;
}
async function confirmAndExportAll() {
  if (Object.values(currentPreview).every(arr => arr.length === 0)) { alert('Önce dağıtım hesaplayın.'); return; }
  showLoader('Step2', true);
  try {
    const week = currentWeekStep2;
    for (let [groupKey, group] of Object.entries(groups)) {
      const selected = currentPreview[groupKey];
      if (selected.length > 0) {
        await saveGroupDistribution(groupKey, week, selected, group.filter);
        await exportGroupExcel(groupKey, selected, week);
      }
    }
    alert(`Dağıtım onaylandı. ${Object.values(currentPreview).reduce((a,b)=>a+b.length,0)} kayıt dağıtıldı.\nExcel dosyaları indirildi.`);
    document.getElementById('confirmBtnStep2').disabled = true;
    document.getElementById('previewAreaStep2').style.display = 'none';
    currentPreview = { DM: [], ML: [], DONUSUM: [] };
  } catch (err) {
    alert('Hata: ' + err.message);
  } finally {
    showLoader('Step2', false);
  }
}

// Dosya yükleme fonksiyonları (değişmedi)
async function loadMainFileStep2(file) {
  showLoader('Step2', true);
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    let rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rows.length) throw new Error('Boş');
    const required = ['FeedbackCreatorName', 'client_name', 'emp_monitor_ident', 'CheckListCreated'];
    const first = rows[0];
    const missing = required.filter(c => !(c in first));
    if (missing.length) throw new Error(`Eksik sütun: ${missing.join(', ')}`);
    mainDataStep2 = rows.filter(r => r.CheckListCreated === 0 || r.CheckListCreated === '0');
    document.getElementById('mainStatusStep2').innerHTML = `✅ ${mainDataStep2.length} kayıt (CheckListCreated=0) yüklendi.`;
    document.getElementById('mainStatusStep2').style.color = 'var(--accent)';
  } catch (err) {
    document.getElementById('mainStatusStep2').innerHTML = `❌ ${err.message}`;
    document.getElementById('mainStatusStep2').style.color = 'var(--accent3)';
    mainDataStep2 = [];
  } finally { showLoader('Step2', false); }
}
async function loadDeletedFileStep2(file) {
  showLoader('Step2', true);
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    let rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rows.length) throw new Error('Boş');
    const cols = Object.keys(rows[0]);
    const identCol = cols.find(c => c.toLowerCase() === 'ident');
    if (!identCol) throw new Error(`'Ident' sütunu yok. Mevcut: ${cols.join(', ')}`);
    deletedIdentsStep2.clear();
    rows.forEach(r => { const v = r[identCol]; if (v) deletedIdentsStep2.add(String(v).trim()); });
    document.getElementById('deletedStatusStep2').innerHTML = `✅ ${deletedIdentsStep2.size} silinen ident yüklendi.`;
    document.getElementById('deletedStatusStep2').style.color = 'var(--accent)';
  } catch (err) {
    document.getElementById('deletedStatusStep2').innerHTML = `❌ ${err.message}`;
    document.getElementById('deletedStatusStep2').style.color = 'var(--accent3)';
    deletedIdentsStep2.clear();
  } finally { showLoader('Step2', false); }
}
async function loadRefFileStep2(file) {
  showLoader('Step2', true);
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    let rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rows.length) throw new Error('Referans listesi boş');
    const required = ['Proje', 'KaliteDesteği', 'Dil', 'Dağıtım Türü'];
    const first = rows[0];
    const missing = required.filter(c => !(c in first));
    if (missing.length) throw new Error(`Referans listesinde eksik sütun: ${missing.join(', ')}`);
    refDataStep2 = rows;
    document.getElementById('refStatusStep2').innerHTML = `✅ ${refDataStep2.length} proje referansı yüklendi.`;
    document.getElementById('refStatusStep2').style.color = 'var(--accent)';
  } catch (err) {
    document.getElementById('refStatusStep2').innerHTML = `❌ ${err.message}`;
    document.getElementById('refStatusStep2').style.color = 'var(--accent3)';
    refDataStep2 = [];
  } finally { showLoader('Step2', false); }
}
// Event listeners Step2
document.getElementById('mainFileInputStep2').addEventListener('change', e => { if (e.target.files[0]) loadMainFileStep2(e.target.files[0]); });
document.getElementById('deletedFileInputStep2').addEventListener('change', e => { if (e.target.files[0]) loadDeletedFileStep2(e.target.files[0]); });
document.getElementById('refFileInputStep2').addEventListener('change', e => { if (e.target.files[0]) loadRefFileStep2(e.target.files[0]); });
function setupDrop(dropId, inputId, func) {
  const drop = document.getElementById(dropId);
  const inp = document.getElementById(inputId);
  drop.addEventListener('click', () => inp.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (e.dataTransfer.files[0]) {
      inp.files = e.dataTransfer.files;
      func(e.dataTransfer.files[0]);
    }
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
