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

// ==================== STEP 1 ====================
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
      errorTableBodyStep1.innerHTML = `<tr><td colspan="5" class="empty-state">✅ Tüm Monitoring ID değerleri geçerli!</tr>`;
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

// ==================== STEP 2 ====================
let mainDataStep2 = [], deletedIdentsStep2 = new Set(), distributionHistoryStep2 = [], currentPreviewStep2 = [], currentWeekStep2 = 1;
let refDataStep2 = [];
const WEEK_TARGET = {1:3, 2:2, 3:3, 4:2};

function getRefInfo(projeAdi) {
  return refDataStep2.find(r => String(r.Proje).trim() === String(projeAdi).trim());
}
function saveHistoryAndDownload() {
  localStorage.setItem('fb_distribution_history', JSON.stringify(distributionHistoryStep2));
  const dataStr = JSON.stringify(distributionHistoryStep2, null, 2);
  const blob = new Blob([dataStr], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `feedback_history_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  alert("Geçmiş kaydedildi ve JSON dosyası otomatik indirildi.");
}
function loadHistoryStep2() {
  const stored = localStorage.getItem('fb_distribution_history');
  if (stored) try { distributionHistoryStep2 = JSON.parse(stored); } catch(e) { distributionHistoryStep2 = []; }
  else distributionHistoryStep2 = [];
}
function saveHistoryStep2() { localStorage.setItem('fb_distribution_history', JSON.stringify(distributionHistoryStep2)); }
function getDistributedIdentsStep2() {
  const set = new Set();
  distributionHistoryStep2.forEach(entry => { if (entry.distributedIdents) entry.distributedIdents.forEach(id => set.add(id)); });
  return set;
}
function getWeekCounts(week) {
  const weekData = distributionHistoryStep2.find(h => h.week === week);
  if (!weekData || !weekData.assignments) return new Map();
  const counts = new Map();
  weekData.assignments.forEach(ass => {
    const key = `${ass.FeedbackCreatorName}|${ass.client_name}|${ass.dil || ''}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}
function getCumulativeBefore(week) {
  const counts = new Map();
  for (let w = 1; w < week; w++) {
    const wc = getWeekCounts(w);
    for (let [k, cnt] of wc) counts.set(k, (counts.get(k) || 0) + cnt);
  }
  return counts;
}
function getAvailableRecords() {
  const distributed = getDistributedIdentsStep2();
  return mainDataStep2.filter(rec => {
    const zero = (rec.CheckListCreated === 0 || rec.CheckListCreated === '0' || rec.CheckListCreated === 0.0);
    if (!zero) return false;
    const ident = String(rec.emp_monitor_ident || '');
    if (deletedIdentsStep2.has(ident)) return false;
    if (distributed.has(ident)) return false;
    return true;
  });
}
function calculateDistributionStep2(week) {
  const available = getAvailableRecords();
  if (available.length === 0) return [];
  if (refDataStep2.length === 0) { alert("Referans listesi yüklenmemiş!"); return []; }
  const categoryMap = new Map();
  available.forEach(rec => {
    const proje = rec.client_name;
    const ref = getRefInfo(proje);
    if (!ref) {
      console.warn(`Proje ${proje} referans listede yok, atlanıyor.`);
      return;
    }
    const dagitimTuru = String(ref["Dağıtım Türü"]).trim();
    const dil = String(ref.Dil).trim();
    const degerlendirici = rec.FeedbackCreatorName;
    let key;
    if (dagitimTuru === "Proje") {
      key = `PROJE|${proje}|${dil}`;
    } else {
      key = `KISI|${degerlendirici}|${proje}|${dil}`;
    }
    if (!categoryMap.has(key)) categoryMap.set(key, []);
    categoryMap.get(key).push(rec);
  });
  const cumulativeBefore = getCumulativeBefore(week);
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
function previewDistributionStep2() {
  if (!mainDataStep2.length) { alert('Görüşme listesi yükleyin.'); return; }
  if (!refDataStep2.length) { alert('Referans listesi yükleyin.'); return; }
  const week = parseInt(document.getElementById('weekSelectStep2').value);
  currentWeekStep2 = week;
  const selected = calculateDistributionStep2(week);
  currentPreviewStep2 = selected;
  const previewDiv = document.getElementById('previewAreaStep2');
  const previewBody = document.getElementById('previewBodyStep2');
  if (selected.length === 0) {
    previewDiv.style.display = 'block';
    previewBody.innerHTML = '<tr><td colspan="4">Bu hafta için dağıtılacak uygun kayıt bulunamadı.</td></tr>';
    document.getElementById('confirmBtnStep2').disabled = true;
    return;
  }
  previewBody.innerHTML = '';
  selected.forEach(rec => {
    const row = previewBody.insertRow();
    row.insertCell(0).textContent = rec.FeedbackCreatorName || '';
    row.insertCell(1).textContent = rec.client_name || '';
    row.insertCell(2).textContent = rec.emp_monitor_ident || '';
    const linkCell = row.insertCell(3);
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
async function confirmAndExportStep2() {
  if (currentPreviewStep2.length === 0) { alert('Önce dağıtım hesaplayın.'); return; }
  showLoader('Step2', true);
  try {
    const week = currentWeekStep2;
    const assignmentsWithMeta = currentPreviewStep2.map(rec => {
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
      distributedIdents: currentPreviewStep2.map(r => String(r.emp_monitor_ident)),
      assignments: assignmentsWithMeta
    };
    const idx = distributionHistoryStep2.findIndex(h => h.week === week);
    if (idx >= 0) distributionHistoryStep2[idx] = newEntry;
    else distributionHistoryStep2.push(newEntry);
    saveHistoryAndDownload();
    // Excel oluştur (font ayarı yapılmıyor, standart xlsx ile)
    const grouped = new Map();
    currentPreviewStep2.forEach(rec => {
      const ref = getRefInfo(rec.client_name);
      const sheetName = `${rec.client_name}_${ref ? ref.Dil : ''}_${ref ? ref["Dağıtım Türü"] : ''}`.substring(0, 31);
      if (!grouped.has(sheetName)) grouped.set(sheetName, []);
      grouped.get(sheetName).push({
        'İlk Fb Girişi Yapan': rec.FeedbackCreatorName,
        'Operasyon': rec.client_name,
        'Monitor Ident': rec.emp_monitor_ident,
        'Monitor Link': buildMonitorLink(rec.emp_monitor_ident),
        'Dil': ref ? ref.Dil : '',
        'Dağıtım Türü': ref ? ref["Dağıtım Türü"] : ''
      });
    });
    const workbook = XLSX.utils.book_new();
    for (let [sheetName, rows] of grouped.entries()) {
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
    }
    const reportRows = currentPreviewStep2.map(r => ({
      'Kişi': r.FeedbackCreatorName, 'Proje': r.client_name, 'Ident': r.emp_monitor_ident, 'Hafta': week
    }));
    const reportSheet = XLSX.utils.json_to_sheet(reportRows);
    XLSX.utils.book_append_sheet(workbook, reportSheet, 'Dağıtım_Raporu');
    XLSX.writeFile(workbook, `Hafta${week}_Dagilim_Referansli_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.xlsx`);
    alert(`Dağıtım onaylandı. Toplam ${currentPreviewStep2.length} kayıt dağıtıldı.\nGeçmiş JSON otomatik indirildi.`);
    document.getElementById('confirmBtnStep2').disabled = true;
    document.getElementById('previewAreaStep2').style.display = 'none';
    currentPreviewStep2 = [];
  } catch (err) {
    alert('Hata: ' + err.message);
  } finally {
    showLoader('Step2', false);
  }
}
// Dosya yükleme fonksiyonları
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
document.getElementById('calculateBtnStep2').addEventListener('click', previewDistributionStep2);
document.getElementById('confirmBtnStep2').addEventListener('click', confirmAndExportStep2);
document.getElementById('exportHistoryBtnStep2').addEventListener('click', () => saveHistoryAndDownload());
document.getElementById('importHistoryBtnStep2').addEventListener('click', () => document.getElementById('historyImportInputStep2').click());
document.getElementById('historyImportInputStep2').addEventListener('change', e => {
  if (!e.target.files[0]) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (Array.isArray(imported)) { distributionHistoryStep2 = imported; saveHistoryStep2(); alert('Geçmiş yüklendi.'); }
      else throw new Error();
    } catch (err) { alert('Geçersiz dosya'); }
  };
  reader.readAsText(e.target.files[0]);
});
document.getElementById('viewHistoryBtnStep2').addEventListener('click', () => {
  const modal = document.createElement('div'); modal.className = 'modal'; modal.style.display = 'flex';
  const content = document.createElement('div'); content.className = 'modal-content';
  content.innerHTML = '<h3>Geçmiş Dağıtımlar</h3><button id="closeModalBtn" style="float:right;">Kapat</button><div style="clear:both;"></div>';
  const table = document.createElement('table'); table.style.width = '100%'; table.style.borderCollapse = 'collapse';
  table.innerHTML = '<thead><tr><th>Hafta</th><th>Tarih</th><th>Sayı</th><th>Detay</th></tr></thead><tbody></tbody>';
  const tbody = table.querySelector('tbody');
  distributionHistoryStep2.slice().sort((a,b) => a.week - b.week).forEach(entry => {
    const row = tbody.insertRow();
    row.insertCell(0).textContent = entry.week;
    row.insertCell(1).textContent = new Date(entry.date).toLocaleString();
    row.insertCell(2).textContent = entry.assignments.length;
    const btn = document.createElement('button'); btn.textContent = 'Göster'; btn.className = 'btn-ghost'; btn.style.padding = '0.2rem 0.5rem';
    btn.onclick = () => alert(entry.assignments.map(a => `${a.FeedbackCreatorName} - ${a.client_name} (${a.emp_monitor_ident})`).join('\n'));
    row.insertCell(3).appendChild(btn);
  });
  content.appendChild(table); modal.appendChild(content); document.body.appendChild(modal);
  document.getElementById('closeModalBtn').onclick = () => modal.remove();
});
document.getElementById('clearHistoryBtnStep2').addEventListener('click', () => {
  if (confirm('Tüm geçmiş silinecek. Devam?')) { distributionHistoryStep2 = []; saveHistoryStep2(); alert('Geçmiş temizlendi.'); }
});
loadHistoryStep2();
