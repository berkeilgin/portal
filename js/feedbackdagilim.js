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
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

// Adım geçiş
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const stepId = btn.dataset.step;
      document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
      document.getElementById(stepId).classList.add('active');
      document.querySelectorAll('.step-btn').forEach(b => b.classList.replace('btn-primary','btn-ghost'));
      btn.classList.replace('btn-ghost','btn-primary');
    });
  });
});

// ==================== STEP 1 (Monitoring ID + duplicate + renklendirme) ====================
let currentDataStep1 = [], errorRowsStep1 = [];
let markedForDeletion = new Set();   // sarı yapılacak satır numaraları
let clickedRows = new Set();         // linke tıklanmış satırlar (yeşil)

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

// Rastgele bir satır seç
function selectRandomRow(rowsArray) {
  if (!rowsArray.length) return null;
  const randomIndex = Math.floor(Math.random() * rowsArray.length);
  return rowsArray[randomIndex];
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
    const wb      = XLSX.read(await file.arrayBuffer(), { type: 'array', defval: '' });
    const rows    = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!rows.length) throw new Error('Dosya boş');
    const columns = Object.keys(rows[0]);
    const monCol  = findColumnName(columns, ['Monitoring ID','monitoring id','MonitoringId']);
    const identCol = findColumnName(columns, ['Ident','ident','ID','Id']);
    if (!monCol)   throw new Error(`'Monitoring ID' sütunu yok: ${columns.join(', ')}`);
    if (!identCol) throw new Error(`'Ident' sütunu yok: ${columns.join(', ')}`);

    currentDataStep1 = rows;

    // 1. Tüm duplicate ID'leri grupla
    const idMap = new Map(); // key = monitoringId, value = [{ rowNum, identRaw, monitoringIdRaw }]
    rows.forEach((row, idx) => {
      const mid = row[monCol];
      const midStr = mid != null ? String(mid).trim() : null;
      if (midStr && isValidMonitoringId(mid)) {
        if (!idMap.has(midStr)) idMap.set(midStr, []);
        idMap.get(midStr).push({
          rowNum: idx + 2,
          identRaw: row[identCol] != null ? String(row[identCol]) : '',
          monitoringIdRaw: midStr
        });
      }
    });

    // 2. Her duplicate grubu için rastgele bir satırı silinecek (sarı) olarak işaretle
    const toDeleteSet = new Set();
    for (let [id, entries] of idMap.entries()) {
      if (entries.length > 1) {
        const selected = selectRandomRow(entries);
        if (selected) toDeleteSet.add(selected.rowNum);
      }
    }

    // 3. Hata listesini oluştur (format hatası + duplicate bilgisi)
    const duplicateGroups = new Map();
    for (let [id, entries] of idMap.entries()) {
      if (entries.length > 1) {
        duplicateGroups.set(id, entries.map(e => e.rowNum));
      }
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
          rowNumber: rowNum,
          monitoringIdRaw: mid != null ? String(mid) : '(boş)',
          identRaw: ident != null ? String(ident) : '',
          reason: reason,
          markedForDeletion: toDeleteSet.has(rowNum)   // sarı yapılacak mı?
        });
      }
    });

    errorRowsStep1 = errors;

    const total = rows.length, errCount = errors.length;
    totalCountSpanStep1.textContent = total;
    errorCountSpanStep1.textContent = errCount;
    validCountSpanStep1.textContent = total - errCount;
    statsContainerStep1.style.display = 'flex';
    errorsSectionStep1.style.display  = 'block';

    renderErrorTable(); // ayrı fonksiyon (renkler ve ikonlar için)
  } catch (err) {
    alert('Hata: ' + err.message);
  } finally {
    showLoader('Step1', false);
  }
}

// Tabloyu render et (sarı/yeşil renkler ve ikonlarla)
function renderErrorTable() {
  if (!errorRowsStep1.length) {
    errorTableBodyStep1.innerHTML = `<td><td colspan="5" class="empty-state">✅ Tüm ID'ler geçerli ve benzersiz!</td></tr>`;
    return;
  }

  errorTableBodyStep1.innerHTML = errorRowsStep1.map(err => {
    const link = buildMonitorLink(err.identRaw);
    const linkHtml = link
      ? `<a href="${link}" target="_blank" class="link-btn" data-row="${err.rowNumber}">🔗 Link</a>`
      : `<span class="badge-error">Ident eksik</span>`;

    // Renk belirleme: önce link tıklanmış mı? -> yeşil, yoksa silinecek mi? -> sarı
    let rowClass = '';
    if (clickedRows.has(err.rowNumber)) {
      rowClass = 'clicked-row';   // yeşil
    } else if (err.markedForDeletion) {
      rowClass = 'delete-row';     // sarı
    }

    // Silme ikonu (sadece silinecek olanlara)
    const deleteIcon = err.markedForDeletion
      ? `<span class="delete-icon" data-row="${err.rowNumber}" style="cursor:pointer; margin-left:8px; font-size:1.1rem;" title="Silinecek olarak işaretlendi">🗑️</span>`
      : '';

    return `
      <tr class="${rowClass}" data-row="${err.rowNumber}">
        <td>${err.rowNumber}</td>
        <td><code>${escapeHtml(err.monitoringIdRaw)}</code></td>
        <td><code>${escapeHtml(err.identRaw) || '—'}</code>${deleteIcon}</td>
        <td><span class="badge-error">⚠️ ${escapeHtml(err.reason)}</span></td>
        <td>${linkHtml}</td>
       </tr>
    `;
  }).join('');

  // Event listener'ları bağla (link tıklama ve silme ikonu)
  document.querySelectorAll('.link-btn').forEach(btn => {
    btn.removeEventListener('click', handleLinkClick);
    btn.addEventListener('click', handleLinkClick);
  });
  document.querySelectorAll('.delete-icon').forEach(icon => {
    icon.removeEventListener('click', handleDeleteIconClick);
    icon.addEventListener('click', handleDeleteIconClick);
  });
}

// Link tıklama: o satırı yeşil yap
function handleLinkClick(e) {
  e.preventDefault();
  const link = e.currentTarget;
  const rowNum = parseInt(link.getAttribute('data-row'));
  if (rowNum && !clickedRows.has(rowNum)) {
    clickedRows.add(rowNum);
    renderErrorTable(); // yeniden render
  }
  // Linki yeni sekmede aç
  window.open(link.href, '_blank');
}

// Silme ikonuna tıklama: bilgilendirme
function handleDeleteIconClick(e) {
  e.stopPropagation();
  const rowNum = e.currentTarget.getAttribute('data-row');
  alert(`Satır ${rowNum} silinecek olarak işaretlendi. (Bu özellik sadece görsel uyarıdır.)`);
}

// Event listener'lar (upload, reset vb.)
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
  currentDataStep1 = [];
  errorRowsStep1 = [];
  markedForDeletion.clear();
  clickedRows.clear();
  fileInputStep1.value = '';
  statsContainerStep1.style.display = 'none';
  errorsSectionStep1.style.display  = 'none';
  errorTableBodyStep1.innerHTML = `<tr><td colspan="5" class="empty-state">Henüz veri yok</td></tr>`;
  totalCountSpanStep1.textContent = '0';
  errorCountSpanStep1.textContent = '0';
  validCountSpanStep1.textContent = '0';
});

// CSS stilleri (sarı ve yeşil arka plan)
const style = document.createElement('style');
style.textContent = `
  .delete-row { background-color: #fff3cd !important; }
  .clicked-row { background-color: #d4edda !important; }
  .delete-icon:hover { opacity: 0.7; transform: scale(1.1); display: inline-block; }
`;
document.head.appendChild(style);

// ==================== STEP 2 (DM, ML, Dönüşüm + özel kurallar) ====================
let mainDataStep2 = [], deletedIdentsStep2 = new Set(), refDataStep2 = [];
let distributionHistory = { DM: [], ML: [], DONUSUM: [] };
const WEEK_TARGET = { 1: 3, 2: 2, 3: 3, 4: 2 };
let currentWeekStep2 = 1;
let currentPreview = { DM: [], ML: [], DONUSUM: [] };

const HP_RULES = {
  HP_Dutch:   { checker: rec => rec.FeedbackCreatorName === 'Suleyman Aslan' },
  HP_German:  { checker: rec => rec.FeedbackCreatorName === 'Halil Emre Ozdemir' },
  HP_Turkish: { checker: rec => !['Suleyman Aslan','Halil Emre Ozdemir'].includes(rec.FeedbackCreatorName) }
};

const groups = {
  DM: {
    key: 'DM', name: 'DM',
    filter: ref => ref.KaliteDesteği === 'Evet' && ref.Dil === 'DM' && ref['Dağıtım Türü'] === 'Proje',
    sheetPerProject: true,
    fileName: () => `DM_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx`
  },
  ML: {
    key: 'ML', name: 'ML',
    filter: ref => ref.KaliteDesteği === 'Evet' && ref.Dil === 'ML' && ref['Dağıtım Türü'] === 'Proje',
    extraFilter: rec => String(rec.position_code_type_full_name || '').toLowerCase().includes('quality assurance analyst'),
    sheetPerProject: true,
    fileName: () => `ML_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx`
  },
  DONUSUM: {
    key: 'DONUSUM', name: 'Dönüşüm Projeleri',
    filter: ref => ref.KaliteDesteği === 'Hayır' && ref.Dil === 'DM' && ref['Dağıtım Türü'] === '1. Değerlendirici',
    sheetPerProject: false,
    fileName: () => `Dönüşüm Projeleri_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx`
  }
};

function getRefInfo(proje) { return refDataStep2.find(r => String(r.Proje).trim() === String(proje).trim()); }

function saveHistoryForGroup(gk)  { localStorage.setItem(`fb_distribution_history_${gk}`, JSON.stringify(distributionHistory[gk])); }
function loadHistoryForGroup(gk)  { const s = localStorage.getItem(`fb_distribution_history_${gk}`); distributionHistory[gk] = s ? JSON.parse(s) : []; }
function loadAllHistories()       { Object.keys(groups).forEach(g => loadHistoryForGroup(g)); }
function saveAllHistories()       { Object.keys(groups).forEach(g => saveHistoryForGroup(g)); }

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
  const modal   = document.createElement('div'); modal.className = 'modal'; modal.style.display = 'flex';
  const content = document.createElement('div'); content.className = 'modal-content';
  content.innerHTML = '<h3>Tüm Geçmiş Dağıtımlar</h3><button id="closeModalBtn" style="float:right;">Kapat</button><div style="clear:both;"></div>';
  ['DM','ML','DONUSUM'].forEach(g => {
    const title = document.createElement('h4');
    title.textContent = g === 'DONUSUM' ? 'Dönüşüm Projeleri' : g;
    content.appendChild(title);
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;';
    table.innerHTML = '<thead><tr><th>Hafta</th><th>Tarih</th><th>Sayı</th><th>Detay</th></tr></thead><tbody></tbody>';
    const tbody = table.querySelector('tbody');
    const hist  = distributionHistory[g] || [];
    if (!hist.length) {
      tbody.innerHTML = '<tr><td colspan="4">Geçmiş yok</td></tr>';
    } else {
      hist.slice().sort((a,b) => a.week - b.week).forEach(entry => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = entry.week;
        row.insertCell(1).textContent = new Date(entry.date).toLocaleString('tr-TR');
        row.insertCell(2).textContent = entry.assignments ? entry.assignments.length : 0;
        const btn = document.createElement('button');
        btn.textContent = 'Göster'; btn.className = 'btn-ghost'; btn.style.cssText = 'padding:0.2rem 0.5rem;';
        btn.onclick = () => {
          const list = entry.assignments
            ? entry.assignments.map(a => `${a.FeedbackCreatorName} - ${a.client_name} (${a.emp_monitor_ident})`).join('\n')
            : 'Detay yok';
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
    if (!(rec.CheckListCreated === 0 || rec.CheckListCreated === '0')) return false;
    const ident = String(rec.emp_monitor_ident || '');
    if (deletedIdentsStep2.has(ident) || distributed.has(ident)) return false;
    const ref = getRefInfo(rec.client_name);
    if (!ref || !groupFilter(ref)) return false;
    if (extraFilter && !extraFilter(rec)) return false;
    return true;
  });
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function calculateDistributionForGroup(gk, week, groupDef) {
  const available = getAvailableRecordsForGroup(gk, week, groupDef.filter, groupDef.extraFilter || null);
  if (!available.length) return [];

  if (gk === 'ML') {
    const hpRecords  = available.filter(r => r.client_name.toLowerCase() === 'hewlett packard inc');
    const nonHp      = available.filter(r => r.client_name.toLowerCase() !== 'hewlett packard inc');
    const selected   = [];
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

  // DM ve DONUSUM
  const categoryMap = new Map();
  available.forEach(rec => {
    const key = gk === 'DONUSUM' ? `${rec.FeedbackCreatorName}|${rec.client_name}` : rec.client_name;
    if (!categoryMap.has(key)) categoryMap.set(key, []);
    categoryMap.get(key).push(rec);
  });
  const cumulative = getCumulativeCountsForGroup(gk, week);
  const selected   = [];
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
    client_name:         rec.client_name,
    emp_monitor_ident:   rec.emp_monitor_ident,
    dil:                 getRefInfo(rec.client_name)?.Dil || '',
    dagitimTuru:         getRefInfo(rec.client_name)?.['Dağıtım Türü'] || ''
  }));
  const newEntry = { week, date: new Date().toISOString(), distributedIdents: selected.map(r => String(r.emp_monitor_ident)), assignments };
  const idx = distributionHistory[gk].findIndex(h => h.week === week);
  if (idx >= 0) distributionHistory[gk][idx] = newEntry; else distributionHistory[gk].push(newEntry);
  saveHistoryForGroup(gk);
}
async function exportGroupExcel(gk, selected) {
  const group    = groups[gk];
  if (!selected.length) return;
  const workbook = XLSX.utils.book_new();
  const addSheet = (sheetName, rows) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.map(r => ({ ...r, Durum: '' }))), sheetName.substring(0, 31));
  };
  if (group.sheetPerProject) {
    const grouped = new Map();
    selected.forEach(rec => {
      if (!grouped.has(rec.client_name)) grouped.set(rec.client_name, []);
      grouped.get(rec.client_name).push({ 'İlk Fb Girişi Yapan': rec.FeedbackCreatorName, 'Operasyon': rec.client_name, 'Monitor Ident': rec.emp_monitor_ident, 'Monitor Link': buildMonitorLink(rec.emp_monitor_ident) });
    });
    for (const [proj, rows] of grouped) addSheet(proj, rows);
  } else {
    const ref       = selected.length ? getRefInfo(selected[0].client_name) : null;
    const sheetName = ref?.['Dağıtım Türü'] ? String(ref['Dağıtım Türü']).trim() : '1. Değerlendirici';
    addSheet(sheetName, selected.map(rec => ({ 'İlk Fb Girişi Yapan': rec.FeedbackCreatorName, 'Operasyon': rec.client_name, 'Monitor Ident': rec.emp_monitor_ident, 'Monitor Link': buildMonitorLink(rec.emp_monitor_ident) })));
  }
  XLSX.writeFile(workbook, group.fileName());
}
async function previewAllGroups() {
  if (!mainDataStep2.length)  { alert('Görüşme listesi yükleyin.');  return; }
  if (!refDataStep2.length)   { alert('Referans listesi yükleyin.'); return; }
  const week = parseInt(document.getElementById('weekSelectStep2').value);
  currentWeekStep2 = week;
  const allSelected = [];
  for (const [gk, grp] of Object.entries(groups)) {
    const selected = calculateDistributionForGroup(gk, week, grp);
    currentPreview[gk] = selected;
    allSelected.push(...selected.map(s => ({ ...s, grup: grp.name })));
  }
  const previewDiv  = document.getElementById('previewAreaStep2');
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
      <td><a href="${buildMonitorLink(rec.emp_monitor_ident)}" target="_blank" class="link-btn">🔗 Link</a></td>
    </tr>`).join('');
  document.getElementById('confirmBtnStep2').disabled = false;
}
async function confirmAndExportAll() {
  if (Object.values(currentPreview).every(arr => !arr.length)) { alert('Önce dağıtım hesaplayın.'); return; }
  showLoader('Step2', true);
  try {
    const week  = currentWeekStep2;
    const total = Object.values(currentPreview).reduce((a, b) => a + b.length, 0);
    for (const gk of ['DM','ML','DONUSUM']) {
      const selected = currentPreview[gk];
      if (selected.length) {
        await saveGroupDistribution(gk, week, selected);
        await exportGroupExcel(gk, selected);
      }
    }
    alert(`Dağıtım onaylandı. Toplam ${total} kayıt dağıtıldı.\nExcel dosyaları indirildi.`);
    document.getElementById('confirmBtnStep2').disabled  = true;
    document.getElementById('previewAreaStep2').style.display = 'none';
    currentPreview = { DM: [], ML: [], DONUSUM: [] };
  } catch (err) {
    alert('Hata: ' + err.message);
  } finally {
    showLoader('Step2', false);
  }
}

// ── Dosya yükleme (Step 2) ──

async function loadMainFileStep2(file) {
  showLoader('Step2', true);
  const statusEl = document.getElementById('mainStatusStep2');
  try {
    const wb   = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!rows.length) throw new Error('Dosya boş');
    const required = ['FeedbackCreatorName','client_name','emp_monitor_ident','CheckListCreated'];
    const missing  = required.filter(c => !(c in rows[0]));
    if (missing.length) throw new Error(`Eksik sütun: ${missing.join(', ')}`);
    mainDataStep2 = rows.filter(r => r.CheckListCreated === 0 || r.CheckListCreated === '0');
    statusEl.innerHTML   = `✅ ${mainDataStep2.length} kayıt (CheckListCreated=0) yüklendi.`;
    statusEl.style.color = 'var(--accent)';
  } catch (err) {
    statusEl.innerHTML   = `❌ ${err.message}`;
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
    const wb   = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const cols = Object.keys(rows[0]);
    const identCol = cols.find(c => c.toLowerCase() === 'ident');
    if (!identCol) throw new Error('Ident sütunu yok');
    deletedIdentsStep2.clear();
    rows.forEach(r => { const v = r[identCol]; if (v) deletedIdentsStep2.add(String(v).trim()); });
    statusEl.innerHTML   = `✅ ${deletedIdentsStep2.size} silinen ident yüklendi.`;
    statusEl.style.color = 'var(--accent)';
  } catch (err) {
    statusEl.innerHTML   = `❌ ${err.message}`;
    statusEl.style.color = 'var(--accent3)';
  } finally {
    showLoader('Step2', false);
  }
}
async function loadRefFileStep2(file) {
  showLoader('Step2', true);
  const statusEl = document.getElementById('refStatusStep2');
  try {
    const wb   = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    if (!rows.length) throw new Error('Dosya boş');
    const required = ['Proje','KaliteDesteği','Dil','Dağıtım Türü'];
    const missing  = required.filter(c => !(c in rows[0]));
    if (missing.length) throw new Error(`Eksik sütun: ${missing.join(', ')}`);
    refDataStep2 = rows;
    statusEl.innerHTML   = `✅ ${refDataStep2.length} referans yüklendi.`;
    statusEl.style.color = 'var(--accent)';
  } catch (err) {
    statusEl.innerHTML   = `❌ ${err.message}`;
    statusEl.style.color = 'var(--accent3)';
    refDataStep2 = [];
  } finally {
    showLoader('Step2', false);
  }
}

/**
 * ✅ FIX: setupDrop artık hem drag-drop hem de
 *         tıklayıp seçme için change listener kuruyor.
 *         Önceki versiyonda change listener yoktu —
 *         dialog açılıyor, dosya seçiliyor, hiçbir şey olmuyordu.
 */
function setupDrop(dropId, inputId, func) {
  const drop = document.getElementById(dropId);
  const inp  = document.getElementById(inputId);
  if (!drop || !inp) { console.error(`setupDrop: element bulunamadı (${dropId}, ${inputId})`); return; }

  // Tıklayıp dialog'dan seçme
  drop.addEventListener('click', () => inp.click());
  inp.addEventListener('change', e => { if (e.target.files[0]) func(e.target.files[0]); }); // ← EKSİK OLAN BU

  // Drag & drop
  drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', ()  => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (e.dataTransfer.files[0]) func(e.dataTransfer.files[0]);
  });
}

setupDrop('dropMainStep2',    'mainFileInputStep2',    loadMainFileStep2);
setupDrop('dropDeletedStep2', 'deletedFileInputStep2', loadDeletedFileStep2);
setupDrop('dropRefStep2',     'refFileInputStep2',     loadRefFileStep2);

document.getElementById('calculateBtnStep2').addEventListener('click',  previewAllGroups);
document.getElementById('confirmBtnStep2').addEventListener('click',    confirmAndExportAll);
document.getElementById('exportHistoryBtnStep2').addEventListener('click', exportAllHistory);
document.getElementById('importHistoryBtnStep2').addEventListener('click', () => document.getElementById('historyImportInputStep2').click());
document.getElementById('historyImportInputStep2').addEventListener('change', e => { if (e.target.files[0]) importAllHistory(e.target.files[0]); });
document.getElementById('viewHistoryBtnStep2').addEventListener('click',  viewHistoryModal);
document.getElementById('clearHistoryBtnStep2').addEventListener('click', clearAllHistory);
loadAllHistories();

// ==================== STEP 3 (Raporlama) ====================
console.log('STEP3 (Raporlama) yükleniyor...');

let reportMainData = [];
let reportHistory  = { DM: [], ML: [], DONUSUM: [] };
let currentReportView = 'proje';

const mainFileInputS3    = document.getElementById('mainFileInputStep3');
const historyFileInputS3 = document.getElementById('historyFileInputStep3');
const mainStatusS3       = document.getElementById('mainStatusStep3');
const historyStatusS3    = document.getElementById('historyStatusStep3');
const calculateBtnS3     = document.getElementById('calculateReportBtnStep3');
const exportBtnS3        = document.getElementById('exportReportBtnStep3');
const reportBodyS3       = document.getElementById('reportBodyStep3');
const reportHeaderS3     = document.getElementById('reportHeaderStep3');
const reportAreaS3       = document.getElementById('reportAreaStep3');
const tabProje           = document.getElementById('reportTabProje');
const tabProjeKisi       = document.getElementById('reportTabProjeKisi');
const tabKisi            = document.getElementById('reportTabKisi');

function showLoaderStep3(show) {
  const loader = document.getElementById('loaderStep3');
  if (loader) loader.classList.toggle('visible', show);
}

// "Soyisim, İsim" → "İsim Soyisim"
// indexOf kullanılıyor; birden fazla virgül olsa bile sadece ilk virgülden böler
function formatReviewerName(name) {
  if (!name) return '';
  const str      = name.trim();
  const commaIdx = str.indexOf(',');
  if (commaIdx === -1) return str;                          // virgül yoksa olduğu gibi
  const soyisim = str.substring(0, commaIdx).trim();
  const isim    = str.substring(commaIdx + 1).trim();
  return isim ? `${isim} ${soyisim}` : soyisim;
}
function findColumnNameStep3(columns, possibleNames) {
  const lowerCols = columns.map(c => String(c).trim().toLowerCase());
  for (const name of possibleNames) {
    const idx = lowerCols.indexOf(name.toLowerCase());
    if (idx !== -1) return columns[idx];
  }
  return null;
}

const GROUP_LABELS = { DM: 'DM', ML: 'ML', DONUSUM: 'Dönüşüm Projeleri' };

// key = emp_monitor_ident → dağıtım bilgileri
function buildDistributedMap() {
  const map = new Map();
  for (const [groupKey, entries] of Object.entries(reportHistory)) {
    const groupName = GROUP_LABELS[groupKey] || groupKey;
    for (const entry of entries || []) {
      for (const ass of entry.assignments || []) {
        const ident = String(ass.emp_monitor_ident || '').trim();
        if (ident) {
          map.set(ident, {
            client_name:         ass.client_name         || '',
            feedbackCreatorName: ass.FeedbackCreatorName || '',
            group:               groupName,
            week:                entry.week || '',
            date:                entry.date || '',
            dil:                 ass.dil         || '',
            dagitimTuru:         ass.dagitimTuru || ''
          });
        }
      }
    }
  }
  return map;
}

// Eşleşme: rec.monitoringId (Excel) === emp_monitor_ident (JSON)
function buildEnrichedData() {
  const distMap = buildDistributedMap();
  return reportMainData.map(rec => {
    const info = distMap.get(rec.monitoringId);
    return {
      monitoringId:        rec.monitoringId,
      ident:               rec.ident,
      reviewerName:        rec.reviewerNameFormatted,
      isDistributed:       !!info,
      client_name:         info ? info.client_name         : '',
      feedbackCreatorName: info ? info.feedbackCreatorName : '',
      group:               info ? info.group               : ''
    };
  });
}

function loadMainExcel(file) {
  if (!file) return;
  showLoaderStep3(true);
  mainStatusS3.innerHTML   = '⏳ Yükleniyor...';
  mainStatusS3.style.color = 'var(--muted)';

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) throw new Error('Dosya boş');

      const cols        = Object.keys(rows[0]);
      const monCol      = findColumnNameStep3(cols, ['Monitoring ID', 'monitoring id', 'MonitoringId']);
      const identCol    = findColumnNameStep3(cols, ['Ident', 'ident', 'ID']);
      const reviewerCol = findColumnNameStep3(cols, ['Reviewer Name', 'reviewer name', 'ReviewerName', 'Değerlendirici']);

      if (!monCol)      throw new Error(`"Monitoring ID" sütunu bulunamadı. Mevcut: ${cols.join(', ')}`);
      if (!identCol)    throw new Error('"Ident" sütunu bulunamadı.');
      if (!reviewerCol) throw new Error('"Reviewer Name" sütunu bulunamadı.');

      const checkCol = cols.find(c => c.toLowerCase().includes('checklistcreated'));
      reportMainData = rows
        .filter(row => { if (!checkCol) return true; const v = row[checkCol]; return v === 0 || v === '0' || v === 0.0; })
        .map(row => ({
          monitoringId:          String(row[monCol]      || '').trim(),
          ident:                 String(row[identCol]    || '').trim(),
          reviewerNameRaw:       String(row[reviewerCol] || '').trim(),
          reviewerNameFormatted: formatReviewerName(String(row[reviewerCol] || '').trim())
        }));

      mainStatusS3.innerHTML   = `✅ ${reportMainData.length} kayıt (CheckListCreated=0) yüklendi.`;
      mainStatusS3.style.color = 'var(--accent)';
      // Otomatik rapor oluşturma yok — kullanıcı "Raporu Oluştur" butonuna basmalı
    } catch (err) {
      console.error(err);
      mainStatusS3.innerHTML   = `❌ Hata: ${err.message}`;
      mainStatusS3.style.color = 'var(--accent3)';
      reportMainData = [];
    } finally {
      showLoaderStep3(false);
    }
  };
  reader.onerror = () => { mainStatusS3.innerHTML = '❌ Dosya okunamadı'; showLoaderStep3(false); };
  reader.readAsArrayBuffer(file);
}

function loadHistoryJSON(file) {
  if (!file) return;
  showLoaderStep3(true);
  historyStatusS3.innerHTML = '⏳ Yükleniyor...';

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && Array.isArray(parsed.DM) && Array.isArray(parsed.ML) && Array.isArray(parsed.DONUSUM)) {
        reportHistory = parsed;
        historyStatusS3.innerHTML   = `✅ Geçmiş yüklendi (DM: ${reportHistory.DM.length}, ML: ${reportHistory.ML.length}, Dönüşüm Projeleri: ${reportHistory.DONUSUM.length})`;
        historyStatusS3.style.color = 'var(--accent)';
        // Otomatik rapor oluşturma yok — kullanıcı "Raporu Oluştur" butonuna basmalı
      } else {
        throw new Error('JSON yapısı hatalı — DM, ML, DONUSUM anahtarları eksik');
      }
    } catch (err) {
      historyStatusS3.innerHTML   = `❌ Geçersiz JSON: ${err.message}`;
      historyStatusS3.style.color = 'var(--accent3)';
    } finally {
      showLoaderStep3(false);
    }
  };
  reader.onerror = () => { historyStatusS3.innerHTML = '❌ Dosya okunamadı'; showLoaderStep3(false); };
  reader.readAsText(file);
}

function generateReport() {
  if (!reportMainData.length) { alert('Önce görüşme listesini yükleyin.'); return; }
  const enriched = buildEnrichedData();

  if (currentReportView === 'proje') {
    const projMap = new Map();
    for (const rec of enriched) {
      if (!rec.client_name) continue;
      if (!projMap.has(rec.client_name)) projMap.set(rec.client_name, { total: 0, distributed: 0 });
      const s = projMap.get(rec.client_name); s.total++; if (rec.isDistributed) s.distributed++;
    }
    renderReportTable(
      ['Proje Adı', 'Dağıtılan', 'Bekleyen', 'Toplam'],
      Array.from(projMap.entries()).map(([p, s]) => [p, s.distributed, s.total - s.distributed, s.total])
    );
  } else if (currentReportView === 'projekisi') {
    const keyMap = new Map();
    for (const rec of enriched) {
      if (!rec.client_name || !rec.feedbackCreatorName) continue;
      const key = `${rec.client_name}|${rec.feedbackCreatorName}`;
      if (!keyMap.has(key)) keyMap.set(key, { proje: rec.client_name, kisi: rec.feedbackCreatorName, total: 0, distributed: 0 });
      const s = keyMap.get(key); s.total++; if (rec.isDistributed) s.distributed++;
    }
    renderReportTable(
      ['Proje', 'Değerlendirici', 'Dağıtılan', 'Bekleyen', 'Toplam'],
      Array.from(keyMap.values()).map(v => [v.proje, v.kisi, v.distributed, v.total - v.distributed, v.total])
    );
  } else {
    const kisiMap = new Map();
    for (const rec of enriched) {
      if (!rec.reviewerName) continue;
      if (!kisiMap.has(rec.reviewerName)) kisiMap.set(rec.reviewerName, { total: 0, distributed: 0 });
      const s = kisiMap.get(rec.reviewerName); s.total++; if (rec.isDistributed) s.distributed++;
    }
    renderReportTable(
      ['Değerlendirici', 'Dağıtılan', 'Bekleyen', 'Toplam'],
      Array.from(kisiMap.entries()).map(([k, s]) => [k, s.distributed, s.total - s.distributed, s.total])
    );
  }

  reportAreaS3.style.display = 'block';
  exportBtnS3.disabled       = false;
  tabProje.style.display     = 'inline-flex';
  tabProjeKisi.style.display = 'inline-flex';
  tabKisi.style.display      = 'inline-flex';

  // Aktif tab butonuna doğru rengi ver
  [tabProje, tabProjeKisi, tabKisi].forEach(btn => btn.classList.remove('btn-primary', 'btn-ghost'));
  [tabProje, tabProjeKisi, tabKisi].forEach(btn => btn.classList.add('btn-ghost'));
  if (currentReportView === 'proje')          { tabProje.classList.remove('btn-ghost');     tabProje.classList.add('btn-primary'); }
  else if (currentReportView === 'projekisi') { tabProjeKisi.classList.remove('btn-ghost'); tabProjeKisi.classList.add('btn-primary'); }
  else                                        { tabKisi.classList.remove('btn-ghost');      tabKisi.classList.add('btn-primary'); }
}

function renderReportTable(headers, rows) {
  reportHeaderS3.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
  reportBodyS3.innerHTML   = rows.length
    ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}">Henüz veri yok — projeler dağıtılmamış olabilir.</td></tr>`;
}

function exportReport() {
  if (!reportMainData.length) { alert('Rapor verisi yok — önce raporu oluşturun.'); return; }
  const enriched = buildEnrichedData();
  const wb       = XLSX.utils.book_new();

  // 1. Proje Bazlı
  const projMap = new Map();
  for (const rec of enriched) {
    if (!rec.client_name) continue;
    if (!projMap.has(rec.client_name)) projMap.set(rec.client_name, { total: 0, dist: 0 });
    const s = projMap.get(rec.client_name); s.total++; if (rec.isDistributed) s.dist++;
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    Array.from(projMap.entries()).map(([p, s]) => ({ 'Proje': p, 'Dağıtılan': s.dist, 'Bekleyen': s.total - s.dist, 'Toplam': s.total }))
  ), 'Proje_Bazlı');

  // 2. Proje + Değerlendirici
  const pkMap = new Map();
  for (const rec of enriched) {
    if (!rec.client_name || !rec.feedbackCreatorName) continue;
    const key = `${rec.client_name}|${rec.feedbackCreatorName}`;
    if (!pkMap.has(key)) pkMap.set(key, { proje: rec.client_name, kisi: rec.feedbackCreatorName, total: 0, dist: 0 });
    const s = pkMap.get(key); s.total++; if (rec.isDistributed) s.dist++;
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    Array.from(pkMap.values()).map(v => ({ 'Proje': v.proje, 'Değerlendirici': v.kisi, 'Dağıtılan': v.dist, 'Bekleyen': v.total - v.dist, 'Toplam': v.total }))
  ), 'Proje_Değerlendirici');

  // 3. Değerlendirici Bazlı
  const kisiMap = new Map();
  for (const rec of enriched) {
    if (!rec.reviewerName) continue;
    if (!kisiMap.has(rec.reviewerName)) kisiMap.set(rec.reviewerName, { total: 0, dist: 0 });
    const s = kisiMap.get(rec.reviewerName); s.total++; if (rec.isDistributed) s.dist++;
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    Array.from(kisiMap.entries()).map(([k, s]) => ({ 'Değerlendirici': k, 'Dağıtılan': s.dist, 'Bekleyen': s.total - s.dist, 'Toplam': s.total }))
  ), 'Değerlendirici_Bazlı');

  // 4. RAW — Dağıtım Detayı
  // pendingSet: reportMainData'da (CheckListCreated=0) hâlâ bekleyen monitoring ID'leri
  // Dağıtılmış bir ID bu sette varsa → Tamamlanmadı, yoksa → Tamamlandı
  const pendingSet = new Set(reportMainData.map(r => r.monitoringId));

  const rawDist = [];
  for (const [g, entries] of Object.entries(reportHistory)) {
    const groupName = GROUP_LABELS[g] || g;
    for (const entry of entries || []) {
      for (const ass of entry.assignments || []) {
        const monId = String(ass.emp_monitor_ident || '').trim();
        rawDist.push({
          'Grup':                                   groupName,
          'Hafta':                                  entry.week || '',
          'Dağıtım Tarihi':                         entry.date ? new Date(entry.date).toLocaleString('tr-TR') : '',
          'Değerlendirici (FeedbackCreatorName)':   ass.FeedbackCreatorName || '',
          'Proje (client_name)':                    ass.client_name         || '',
          'Monitoring ID (emp_monitor_ident)':      monId,
          'Dil':                                    ass.dil                 || '',
          'Dağıtım Türü':                           ass.dagitimTuru         || '',
          'Durum':                                  pendingSet.has(monId) ? 'Tamamlanmadı' : 'Tamamlandı'
        });
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDist), 'RAW_Dağıtım_Detay');

  // 5. RAW — Görüşme Listesi
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    reportMainData.map(rec => ({
      'Monitoring ID':               rec.monitoringId,
      'Ident':                       rec.ident,
      'Reviewer Name (Orijinal)':    rec.reviewerNameRaw,
      'Reviewer Name (Düzenlenmiş)': rec.reviewerNameFormatted
    }))
  ), 'RAW_Görüşme_Listesi');

  // 6. RAW — Eşleşme Durumu
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    enriched.map(rec => ({
      'Monitoring ID':         rec.monitoringId,
      'Ident':                 rec.ident,
      'Reviewer Name':         rec.reviewerName,
      'Dağıtıldı mı':         rec.isDistributed ? 'Evet' : 'Hayır',
      'Proje':                 rec.client_name,
      'Değerlendirici (JSON)': rec.feedbackCreatorName,
      'Grup':                  rec.group
    }))
  ), 'RAW_Eşleşme_Durumu');

  XLSX.writeFile(wb, `Feedback_Rapor_${formatDateForFilename()}.xlsx`);
}

function setView(view) {
  currentReportView = view;
  [tabProje, tabProjeKisi, tabKisi].forEach(btn => {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-ghost');
  });
  if (view === 'proje')          { tabProje.classList.remove('btn-ghost');     tabProje.classList.add('btn-primary'); }
  else if (view === 'projekisi') { tabProjeKisi.classList.remove('btn-ghost'); tabProjeKisi.classList.add('btn-primary'); }
  else                           { tabKisi.classList.remove('btn-ghost');      tabKisi.classList.add('btn-primary'); }
  if (reportMainData.length) generateReport();
}

function initStep3() {
  const dropMain    = document.getElementById('dropMainStep3');
  const dropHistory = document.getElementById('dropHistoryStep3');
  if (!dropMain || !dropHistory) { console.error('Drop alanları bulunamadı'); return; }

  dropMain.addEventListener('click',    () => mainFileInputS3.click());
  dropHistory.addEventListener('click', () => historyFileInputS3.click());
  mainFileInputS3.addEventListener('change',    e => { if (e.target.files.length) loadMainExcel(e.target.files[0]); });
  historyFileInputS3.addEventListener('change', e => { if (e.target.files.length) loadHistoryJSON(e.target.files[0]); });

  [dropMain, dropHistory].forEach(drop => {
    drop.addEventListener('dragover', e => e.preventDefault());
    drop.addEventListener('drop', e => {
      e.preventDefault();
      if (!e.dataTransfer.files.length) return;
      if (drop === dropMain) loadMainExcel(e.dataTransfer.files[0]);
      else                   loadHistoryJSON(e.dataTransfer.files[0]);
    });
  });
}

calculateBtnS3.addEventListener('click', generateReport);
exportBtnS3.addEventListener('click',    exportReport);
tabProje.addEventListener('click',       () => setView('proje'));
tabProjeKisi.addEventListener('click',   () => setView('projekisi'));
tabKisi.addEventListener('click',        () => setView('kisi'));

tabProje.style.display     = 'none';
tabProjeKisi.style.display = 'none';
tabKisi.style.display      = 'none';
reportAreaS3.style.display = 'none';
exportBtnS3.disabled       = true;

initStep3();
