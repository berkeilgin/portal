// ==================== ORTAK YARDIMCILAR ====================
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}
function showLoader(step, show) {
  const el = document.getElementById(`loader${step}`);
  if (el) el.classList.toggle('visible', show);
}
function buildMonitorLinkStep1(ident, action = 'OPTION') {
  if (!ident) return '#';
  const baseUrl = 'https://sebra.ccms.teleperformance.com/ccms-bin/console/tops/checklist.pl';
  const frmOption = action === 'DELETE' ? 'DELETE' : 'OPTION';
  return `${baseUrl}?frmTarget=CHECKLIST&checklist_ident=${encodeURIComponent(ident)}&frmOption=${frmOption}`;
}
function buildMonitorLinkStep2(empMonitorIdent, employeeIdent) {
  if (!empMonitorIdent) return '#';
  const baseUrl = 'https://sebra.ccms.teleperformance.com/ccms-bin/employee/monitor.pl';
  return `${baseUrl}?emp_monitor_ident=${encodeURIComponent(empMonitorIdent)}&frmTarget=MONITOR&employee_ident=${encodeURIComponent(employeeIdent || '')}&frmOption=MAIN`;
}
function formatDateForFilename() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
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
    thead.innerHTML = `<tr><th># Satır</th><th>Monitoring ID</th><th>Hata Nedeni</th><th>İşlemler</th></tr>`;
  }
  if (!errorRowsStep1.length) {
    errorTableBodyStep1.innerHTML = `<tr><td colspan="4" class="empty-state">✅ Tüm ID'ler geçerli ve benzersiz!</td></tr>`;
    return;
  }
  errorTableBodyStep1.innerHTML = errorRowsStep1.map(err => {
    const normalLink = buildMonitorLinkStep1(err.identRaw, 'OPTION');
    const deleteLink = buildMonitorLinkStep1(err.identRaw, 'DELETE');
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
if (!document.querySelector('#step1-styles')) {
  const style = document.createElement('style');
  style.id = 'step1-styles';
  style.textContent = `
    .delete-row { background-color: #fff3cd !important; }
    .clicked-row { background-color: #d4edda !important; }
    .delete-row, .clicked-row,
    .delete-row td, .clicked-row td,
    .delete-row code, .clicked-row code {
      color: #1a1a1a !important;
    }
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

// ==================== STEP 2 ====================
let mainDataStep2 = [], deletedIdentsStep2 = new Set(), refDataStep2 = [], checkedMonitoringIds = new Set();
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
    filter: ref => ref.KaliteDesteği === 'Evet' && ref.Dil === 'DM',
    // Değişiklik 1: DM için extraFilter eklendi
    extraFilter: rec => String(rec.position_code_type_full_name || '').trim().toLowerCase() === 'operations supervisor',
    sheetPerProject: true,
    fileName: () => `DM_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx`
  },
  ML: {
    key: 'ML', name: 'ML',
    filter: ref => ref.KaliteDesteği === 'Evet' && ref.Dil === 'ML',
    extraFilter: (rec) => {
      const pos = String(rec.reviewerPosition || '').trim().toLowerCase();
      const code = String(rec.position_code_type_full_name || '').trim().toLowerCase();
      return pos === 'quality assurance analyst i' && code === 'operations supervisor';
    },
    sheetPerProject: true,
    fileName: () => `ML_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx`
  },
  DONUSUM: {
    key: 'DONUSUM', name: 'Dönüşüm Projeleri',
    filter: ref => ref.KaliteDesteği === 'Hayır' && ref.Dil === 'DM',
    // Değişiklik 1: Dönüşüm için extraFilter eklendi
    extraFilter: rec => String(rec.position_code_type_full_name || '').trim().toLowerCase() === 'operations supervisor',
    sheetPerProject: false,
    fileName: () => `Dönüşüm Projeleri_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx`
  }
};

function getRefInfo(proje) { return refDataStep2.find(r => String(r.Proje).trim() === String(proje).trim()); }
function getRefInfoForGroup(proje, groupFilter) {
  return refDataStep2.find(r => String(r.Proje).trim() === String(proje).trim() && groupFilter(r));
}
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
    table.innerHTML = '<thead><tr><th>Hafta</th><th>Tarih</th><th>Sayı</th><th>Detay</th></thead><tbody></tbody>';
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
          const list = entry.assignments ? entry.assignments.map(a => {
            let extra = '';
            if (g === 'ML' && a.hpGroup) extra = ` [${a.hpGroup}]`;
            return `${a.FeedbackCreatorName}${extra} - ${a.client_name} (${a.emp_monitor_ident})`;
          }).join('\n') : 'Detay yok';
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
// Değişiklik 4: getCumulativeCountsForGroup – DM ve Dönüşüm için sadece OS atamalarını say
function getCumulativeCountsForGroup(gk, week) {
  const cnt = new Map();
  distributionHistory[gk].forEach(e => {
    if (e.week < week && e.assignments) {
      e.assignments.forEach(a => {
        // DM ve DONUSUM için: eğer position_code_type_full_name varsa, sadece OS olanları say
        if ((gk === 'DM' || gk === 'DONUSUM') &&
            a.position_code_type_full_name !== undefined &&
            a.position_code_type_full_name !== '') {
          if (String(a.position_code_type_full_name).trim().toLowerCase() !== 'operations supervisor') return;
        }
        const key = `${a.FeedbackCreatorName}|${a.client_name}`;
        cnt.set(key, (cnt.get(key) || 0) + 1);
      });
    }
  });
  return cnt;
}
function getHPCumulativeForML(week) {
  const cnt = { HP_Dutch: 0, HP_German: 0, HP_Turkish: 0 };
  const hpLower = 'hewlett packard inc';
  (distributionHistory['ML'] || []).forEach(e => {
    if (e.week < week && e.assignments) {
      e.assignments.forEach(a => {
        if (String(a.client_name || '').toLowerCase().trim() !== hpLower) return;
        const name = String(a.FeedbackCreatorName || '').trim();
        if (name === 'Suleyman Aslan') cnt.HP_Dutch++;
        else if (name === 'Halil Emre Ozdemir') cnt.HP_German++;
        else cnt.HP_Turkish++;
      });
    }
  });
  return cnt;
}
function getAvailableRecordsForGroup(gk, week, groupFilter, extraFilter = null) {
  const distributed = getDistributedIdentsForGroup(gk, week);
  return mainDataStep2.filter(rec => {
    const checkVal = Number(rec.CheckListCreated);
    if (isNaN(checkVal)) return false;
    const ident = String(rec.emp_monitor_ident || '').trim();
    if (ident === '') return false;
    if (deletedIdentsStep2.has(ident)) return false;
    if (distributed.has(ident) && checkedMonitoringIds.has(ident)) return false;
    const client = String(rec.client_name || '').trim();
    if (client === '') return false;
    const creator = String(rec.FeedbackCreatorName || '').trim();
    if (creator === '') return false;
    const ref = getRefInfoForGroup(client, groupFilter);
    if (!ref) return false;
    if (extraFilter && !extraFilter(rec)) return false;
    if (gk === 'DM' || gk === 'ML' || gk === 'DONUSUM') {
      const targetRaw = ref.Target;
      if (targetRaw !== undefined && targetRaw !== '' && !isNaN(Number(targetRaw))) {
        const target = Number(targetRaw);
        if (target > 0) {
          const monitorScore = rec.MonitorScore;
          const criticalCountRaw = rec.CriticalCount;
          if (monitorScore !== null && !isNaN(monitorScore) && 
              criticalCountRaw !== undefined && criticalCountRaw !== '' && !isNaN(Number(criticalCountRaw))) {
            const criticalCount = Number(criticalCountRaw);
            if (monitorScore >= target && criticalCount === 0) {
              return false;
            }
          }
        }
      }
    }
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
// Değişiklik 2: calculateDistributionForGroup – extraFilter'ı gerçekten kullan
function calculateDistributionForGroup(gk, week, groupDef) {
  let extraFilter = null;
  if (gk === 'ML') {
    extraFilter = (rec) => {
      const pos = String(rec.reviewerPosition || '').trim().toLowerCase();
      const code = String(rec.position_code_type_full_name || '').trim().toLowerCase();
      return pos === 'quality assurance analyst i' && code === 'operations supervisor';
    };
  } else if (groupDef.extraFilter) {
    extraFilter = groupDef.extraFilter;
  }
  const available = getAvailableRecordsForGroup(gk, week, groupDef.filter, extraFilter);

  if (!available.length) return [];
  if (gk === 'ML') {
    const HP_NAME = 'hewlett packard inc';
    const hpRecords = available.filter(r => String(r.client_name || '').toLowerCase().trim() === HP_NAME);
    const nonHp    = available.filter(r => String(r.client_name || '').toLowerCase().trim() !== HP_NAME);
    const selected = [];
    const hpCumulative = getHPCumulativeForML(week);
    for (const [hpKey, rule] of Object.entries(HP_RULES)) {
      const subset = hpRecords.filter(rule.checker);
      if (!subset.length) continue;
      const done = hpCumulative[hpKey] || 0;
      const need = Math.min(Math.min(WEEK_TARGET[week], 10 - done), subset.length);
      if (need > 0) selected.push(...shuffle(subset).slice(0, need));
    }
    const cumulativeNonHp = getCumulativeCountsForGroup(gk, week);
    const categoryMap = new Map();
    nonHp.forEach(rec => {
      const key = `${rec.FeedbackCreatorName}|${rec.client_name}`;
      if (!categoryMap.has(key)) categoryMap.set(key, []);
      categoryMap.get(key).push(rec);
    });
    for (const [key, records] of categoryMap) {
      const done = cumulativeNonHp.get(key) || 0;
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
  const HP_NAME = 'hewlett packard inc';
  const groupFilter = groups[gk]?.filter;
  const assignments = selected.map(rec => {
    const ref = groupFilter
      ? getRefInfoForGroup(String(rec.client_name).trim(), groupFilter)
      : getRefInfo(rec.client_name);
    let hpGroup = '';
    if (gk === 'ML' && String(rec.client_name || '').toLowerCase().trim() === HP_NAME) {
      const name = String(rec.FeedbackCreatorName || '').trim();
      if (name === 'Suleyman Aslan') hpGroup = 'HP_Dutch';
      else if (name === 'Halil Emre Ozdemir') hpGroup = 'HP_German';
      else hpGroup = 'HP_Turkish';
    }
    // Değişiklik 3: position_code_type_full_name JSON'a eklendi
    return {
      FeedbackCreatorName: rec.FeedbackCreatorName,
      client_name: rec.client_name,
      emp_monitor_ident: rec.emp_monitor_ident,
      employee_ident: rec.employee_ident || '',
      position_code_type_full_name: String(rec.position_code_type_full_name || '').trim(),
      dil: ref?.Dil || '',
      dagitimTuru: ref?.['Dağıtım Türü'] || '',
      hpGroup: hpGroup || undefined
    };
  });
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
  const groupFilter = group.filter;
  const addSheet = (sheetName, rows) => {
    let safeName = sheetName.substring(0, 31);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.map(r => ({ ...r, Durum: '' }))), safeName);
  };
  if (group.sheetPerProject) {
    const grouped = new Map();
    selected.forEach(rec => {
      let key = rec.client_name;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push({
        'İlk Fb Girişi Yapan': rec.FeedbackCreatorName,
        'Operasyon': rec.client_name,
        'Monitor Ident': rec.emp_monitor_ident,
        'Monitor Link': buildMonitorLinkStep2(rec.emp_monitor_ident, rec.employee_ident || '')
      });
    });
    for (const [sheetName, rows] of grouped) {
      addSheet(sheetName, rows);
    }
  } else {
    const ref = selected.length
      ? getRefInfoForGroup(String(selected[0].client_name).trim(), groupFilter) || getRefInfo(selected[0].client_name)
      : null;
    const sheetName = ref?.['Dağıtım Türü'] ? String(ref['Dağıtım Türü']).trim() : '1. Değerlendirici';
    addSheet(sheetName, selected.map(rec => ({
      'İlk Fb Girişi Yapan': rec.FeedbackCreatorName,
      'Operasyon': rec.client_name,
      'Monitor Ident': rec.emp_monitor_ident,
      'Monitor Link': buildMonitorLinkStep2(rec.emp_monitor_ident, rec.employee_ident || '')
    })));
  }
  XLSX.writeFile(workbook, group.fileName());
}
function checkMissingProjects() {
  if (!mainDataStep2.length || !refDataStep2.length) return;
  const refProjects = new Set(refDataStep2.map(r => String(r.Proje).trim().toLowerCase()));
  const mainProjects = new Set();
  mainDataStep2.forEach(rec => {
    const name = String(rec.client_name || '').trim();
    if (name) mainProjects.add(name.toLowerCase());
  });
  const missing = [];
  for (let proj of mainProjects) {
    if (!refProjects.has(proj)) {
      const original = mainDataStep2.find(r => String(r.client_name).trim().toLowerCase() === proj)?.client_name;
      if (original) missing.push(original);
    }
  }
  let warningDiv = document.getElementById('missingProjectsWarning');
  if (!warningDiv) {
    warningDiv = document.createElement('div');
    warningDiv.id = 'missingProjectsWarning';
    warningDiv.style.cssText = 'margin-top: 1rem; padding: 0.75rem; border-radius: 0.5rem; background-color: #fff3cd; color: #856404; border-left: 4px solid #ffc107;';
    const refStatus = document.getElementById('refStatusStep2');
    if (refStatus && refStatus.parentNode) {
      refStatus.parentNode.insertBefore(warningDiv, refStatus.nextSibling);
    } else {
      document.getElementById('step2')?.appendChild(warningDiv);
    }
  }
  if (missing.length) {
    warningDiv.innerHTML = `
      <strong>⚠️ Referans Listesinde Bulunmayan Projeler:</strong><br>
      ${missing.map(p => `• ${escapeHtml(p)}`).join('<br>')}<br>
      <small>Bu projeler için dağıtım yapılamaz. Lütfen referans Excel'inize bu satırları ekleyin ve tekrar yükleyin.</small>
    `;
    warningDiv.style.display = 'block';
  } else {
    warningDiv.style.display = 'none';
  }
}
function exportPreviewToExcel() {
  const allSelected = [];
  for (const [gk, grp] of Object.entries(groups)) {
    const selected = currentPreview[gk] || [];
    allSelected.push(...selected.map(s => ({ ...s, grup: grp.name, _group: gk })));
  }
  if (!allSelected.length) {
    alert('Dışa aktarılacak önizleme verisi yok. Önce "Dağıtımı Hesapla" butonuna tıklayın.');
    return;
  }
  const workbook = XLSX.utils.book_new();
  const rows = allSelected.map(rec => {
    let grupLabel = rec.grup || '';
    return {
      'Grup': grupLabel,
      'Değerlendirici (FeedbackCreatorName)': rec.FeedbackCreatorName,
      'Proje (client_name)': rec.client_name,
      'Monitor Ident (emp_monitor_ident)': rec.emp_monitor_ident,
      'Monitor Link': buildMonitorLinkStep2(rec.emp_monitor_ident, rec.employee_ident || ''),
      'MonitorScore': rec.MonitorScore !== undefined ? rec.MonitorScore : '',
      'CriticalCount': rec.CriticalCount !== undefined ? rec.CriticalCount : '',
      'CheckListCreated': rec.CheckListCreated
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, ws, `Preview_Week${currentWeekStep2}`);
  XLSX.writeFile(workbook, `Feedback_Preview_${formatDateForFilename()}.xlsx`);
}
function clearAllStep2Data() {
  if (confirm('Tüm yüklenen dosyalar ve hesaplanan dağıtım verileri silinecek. Devam etmek istiyor musunuz?')) {
    mainDataStep2 = [];
    deletedIdentsStep2.clear();
    refDataStep2 = [];
    checkedMonitoringIds.clear();
    currentPreview = { DM: [], ML: [], DONUSUM: [] };
    currentWeekStep2 = 1;
    const mainInput = document.getElementById('mainFileInputStep2');
    const deletedInput = document.getElementById('deletedFileInputStep2');
    const refInput = document.getElementById('refFileInputStep2');
    const checkedInput = document.getElementById('checkedFileInputStep2');
    if (mainInput) mainInput.value = '';
    if (deletedInput) deletedInput.value = '';
    if (refInput) refInput.value = '';
    if (checkedInput) checkedInput.value = '';
    const mainStatus = document.getElementById('mainStatusStep2');
    const deletedStatus = document.getElementById('deletedStatusStep2');
    const refStatus = document.getElementById('refStatusStep2');
    const checkedStatus = document.getElementById('checkedStatusStep2');
    if (mainStatus) { mainStatus.innerHTML = 'Henüz yüklenmedi'; mainStatus.style.color = ''; }
    if (deletedStatus) { deletedStatus.innerHTML = 'Henüz yüklenmedi'; deletedStatus.style.color = ''; }
    if (refStatus) { refStatus.innerHTML = 'Henüz yüklenmedi'; refStatus.style.color = ''; }
    if (checkedStatus) { checkedStatus.innerHTML = 'Henüz yüklenmedi'; checkedStatus.style.color = ''; }
    const previewDiv = document.getElementById('previewAreaStep2');
    if (previewDiv) previewDiv.style.display = 'none';
    const confirmBtn = document.getElementById('confirmBtnStep2');
    if (confirmBtn) confirmBtn.disabled = true;
    const warningDiv = document.getElementById('missingProjectsWarning');
    if (warningDiv) warningDiv.style.display = 'none';
    const weekSelect = document.getElementById('weekSelectStep2');
    if (weekSelect) weekSelect.value = '1';
    alert('Tüm veriler temizlendi.');
  }
}
async function previewAllGroups() {
  if (!mainDataStep2.length) { alert('Görüşme listesi yükleyin.'); return; }
  if (!refDataStep2.length) { alert('Referans listesi yükleyin.'); return; }
  checkMissingProjects();
  if (document.getElementById('missingProjectsWarning')?.style.display !== 'none') {
    if (!confirm('Referans listesinde olmayan projeler var. Dağıtım yapılmadan önce referans listesini güncellemeniz önerilir. Devam etmek istiyor musunuz?')) {
      return;
    }
  }
  const week = parseInt(document.getElementById('weekSelectStep2').value);
  currentWeekStep2 = week;
  const allSelected = [];
  for (const [gk, grp] of Object.entries(groups)) {
    const selected = calculateDistributionForGroup(gk, week, grp);
    currentPreview[gk] = selected;
    allSelected.push(...selected.map(s => ({ ...s, grup: grp.name, _group: gk })));
  }
  const previewDiv = document.getElementById('previewAreaStep2');
  const previewBody = document.getElementById('previewBodyStep2');
  previewDiv.style.display = 'block';
  if (!allSelected.length) {
    previewBody.innerHTML = '<tr><td colspan="5">Bu hafta dağıtılacak kayıt yok</td></tr>';
    document.getElementById('confirmBtnStep2').disabled = true;
    return;
  }
  previewBody.innerHTML = allSelected.map(rec => {
    let grupLabel = escapeHtml(rec.grup || '');
    return `
    <tr>
      <td>${grupLabel}</td>
      <td>${escapeHtml(rec.FeedbackCreatorName || '')}</td>
      <td>${escapeHtml(rec.client_name || '')}</td>
      <td>${escapeHtml(String(rec.emp_monitor_ident || ''))}</td>
      <td><a href="${buildMonitorLinkStep2(rec.emp_monitor_ident, rec.employee_ident || '')}" target="_blank" class="link-btn">🔗 Link</a></td>
    </tr>`;
  }).join('');
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
    const hasManager = 'Manager_name' in rows[0];
    const seen = new Set();
    const uniqueRows = [];
    for (const row of rows) {
      const ident = String(row.emp_monitor_ident || '').trim();
      if (ident && !seen.has(ident)) {
        seen.add(ident);
        uniqueRows.push(row);
      }
    }
    mainDataStep2 = uniqueRows.filter(r => {
      const val = Number(r.CheckListCreated);
      return !isNaN(val);
    }).map(r => {
      let feedbackName = String(r.FeedbackCreatorName || '').trim();
      if (feedbackName === '' || feedbackName.toLowerCase() === 'null') {
        if (hasManager) {
          feedbackName = String(r.Manager_name || '').trim();
          if (feedbackName.toLowerCase() === 'null') feedbackName = '';
        } else {
          feedbackName = '';
        }
      }
      let monitorScore = r.MonitorScore !== undefined && r.MonitorScore !== '' ? Number(r.MonitorScore) : null;
      let criticalCount = null;
      if (r.CriticalCount !== undefined && r.CriticalCount !== '' && !isNaN(Number(r.CriticalCount))) {
        criticalCount = Number(r.CriticalCount);
      }
      if (isNaN(monitorScore)) monitorScore = null;
      return { 
        ...r, 
        FeedbackCreatorName: feedbackName,
        MonitorScore: monitorScore,
        CriticalCount: criticalCount,
        employee_ident: r.employee_ident ? String(r.employee_ident).trim() : ''
      };
    });
    statusEl.innerHTML = `✅ ${mainDataStep2.length} benzersiz kayıt (CheckListCreated geçerli) yüklendi. (${rows.length - uniqueRows.length} duplicate atlandı)`;
    statusEl.style.color = 'var(--accent)';
    if (refDataStep2.length) checkMissingProjects();
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
    if (mainDataStep2.length) checkMissingProjects();
  } catch (err) {
    statusEl.innerHTML = `❌ ${err.message}`;
    statusEl.style.color = 'var(--accent3)';
    refDataStep2 = [];
  } finally {
    showLoader('Step2', false);
  }
}
async function loadCheckedFileStep2(file) {
  showLoader('Step2', true);
  const statusEl = document.getElementById('checkedStatusStep2');
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    if (!rows.length) throw new Error('Dosya boş');
    const cols = Object.keys(rows[0]);
    const monCol = cols.find(c => c.toLowerCase() === 'monitoring id' || c.toLowerCase() === 'monitoringid');
    if (!monCol) throw new Error('Monitoring ID sütunu yok');
    checkedMonitoringIds.clear();
    rows.forEach(r => { const v = r[monCol]; if (v) checkedMonitoringIds.add(String(v).trim()); });
    statusEl.innerHTML = `✅ ${checkedMonitoringIds.size} kontrol edilmiş Monitoring ID yüklendi.`;
    statusEl.style.color = 'var(--accent)';
  } catch (err) {
    statusEl.innerHTML = `❌ ${err.message}`;
    statusEl.style.color = 'var(--accent3)';
    checkedMonitoringIds.clear();
  } finally {
    showLoader('Step2', false);
  }
}
function setupDrop(dropId, inputId, func) {
  const drop = document.getElementById(dropId);
  const inp = document.getElementById(inputId);
  if (!drop || !inp) { console.error(`setupDrop: ${dropId} veya ${inputId} bulunamadı`); return; }
  drop.addEventListener('click', e => { if (e.target !== inp) inp.click(); });
  inp.addEventListener('change', e => { if (e.target.files[0]) func(e.target.files[0]); });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (e.dataTransfer.files[0]) func(e.dataTransfer.files[0]);
  });
}
function addFourthFileUploader() {
  const step2Div = document.getElementById('step2');
  if (!step2Div) return;
  const uploadGrid = step2Div.querySelector('.upload-grid');
  if (!uploadGrid) return;
  if (document.getElementById('dropCheckedStep2')) return;
  const newCard = document.createElement('div');
  newCard.className = 'upload-card';
  newCard.innerHTML = `
    <h3>✅ 4. Kontrol Edilenler (Monitoring ID)</h3>
    <div class="file-drop" id="dropCheckedStep2">
      <input type="file" id="checkedFileInputStep2" accept=".csv,.xlsx,.xls">
      <div>📂 Sürükle/tıkla</div>
      <div style="font-size:0.7rem;">Monitoring ID sütunu zorunlu (daha önce dağıtılıp kontrol edilenler)</div>
    </div>
    <div class="upload-status" id="checkedStatusStep2">Henüz yüklenmedi</div>
  `;
  uploadGrid.appendChild(newCard);
  setupDrop('dropCheckedStep2', 'checkedFileInputStep2', loadCheckedFileStep2);
}
// Değişiklik 5: repairHistoryWithPositionData fonksiyonu
async function repairHistoryWithPositionData() {
  if (!mainDataStep2.length) {
    alert('Önce görüşme listesini (Ana Excel) yükleyin, ardından bu butona tıklayın.');
    return;
  }
  // emp_monitor_ident → position_code_type_full_name haritası
  const positionMap = new Map();
  mainDataStep2.forEach(rec => {
    const ident = String(rec.emp_monitor_ident || '').trim();
    if (ident) positionMap.set(ident, String(rec.position_code_type_full_name || '').trim());
  });

  let updatedCount = 0, notFoundCount = 0;
  Object.keys(distributionHistory).forEach(gk => {
    distributionHistory[gk].forEach(entry => {
      (entry.assignments || []).forEach(ass => {
        const ident = String(ass.emp_monitor_ident || '').trim();
        if (positionMap.has(ident)) {
          ass.position_code_type_full_name = positionMap.get(ident);
          updatedCount++;
        } else {
          notFoundCount++;
        }
      });
    });
  });

  saveAllHistories();
  alert(
    `✅ Güncellendi: ${updatedCount} atama\n` +
    `⚠️ Bulunamadı (Excel'de yok): ${notFoundCount} atama\n\n` +
    `Güncellenmiş JSON indiriliyor...`
  );
  exportAllHistory();
}
function addExtraButtonsStep2() {
  const buttonContainer = document.getElementById('calculateBtnStep2')?.parentNode;
  if (!buttonContainer) return;
  if (!document.getElementById('exportPreviewBtnStep2')) {
    const exportPreviewBtn = document.createElement('button');
    exportPreviewBtn.id = 'exportPreviewBtnStep2';
    exportPreviewBtn.className = 'btn btn-ghost';
    exportPreviewBtn.innerHTML = '📎 Önizlemeyi Dışa Aktar';
    exportPreviewBtn.style.marginLeft = '0.5rem';
    exportPreviewBtn.addEventListener('click', exportPreviewToExcel);
    buttonContainer.insertBefore(exportPreviewBtn, document.getElementById('confirmBtnStep2'));
  }
  if (!document.getElementById('clearAllStep2Btn')) {
    const clearAllBtn = document.createElement('button');
    clearAllBtn.id = 'clearAllStep2Btn';
    clearAllBtn.className = 'btn btn-ghost';
    clearAllBtn.innerHTML = '🧹 Tüm Verileri Temizle';
    clearAllBtn.style.marginLeft = '0.5rem';
    clearAllBtn.addEventListener('click', clearAllStep2Data);
    buttonContainer.appendChild(clearAllBtn);
  }
  // Değişiklik 5: Geçmişi Onar butonu
  if (!document.getElementById('repairHistoryBtnStep2')) {
    const repairBtn = document.createElement('button');
    repairBtn.id = 'repairHistoryBtnStep2';
    repairBtn.className = 'btn btn-ghost';
    repairBtn.innerHTML = '🔧 Geçmişi Onar';
    repairBtn.title = 'Eski JSON\'a position_code_type_full_name ekler ve güncellenmiş JSON\'u indirir';
    repairBtn.style.marginLeft = '0.5rem';
    repairBtn.addEventListener('click', repairHistoryWithPositionData);
    buttonContainer.appendChild(repairBtn);
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    addFourthFileUploader();
    addExtraButtonsStep2();
  });
} else {
  addFourthFileUploader();
  addExtraButtonsStep2();
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

// ==================== STEP 3 (YENİ - 3 Veri Kaynaklı Raporlama) ====================
let reportMainData = [];          // Görüşme listesi
let reportHistory3 = { DM: [], ML: [], DONUSUM: [] }; // Dağıtım geçmişi
let checkedMonitoringIdsStep3 = new Set(); // ✅ Kontrol Edilenler (Monitoring ID set'i)
let currentReportView = 'proje';

// DOM elemanları
const mainFileInputS3 = document.getElementById('mainFileInputStep3');
const historyFileInputS3 = document.getElementById('historyFileInputStep3');
const checkedFileInputS3 = document.getElementById('checkedFileInputStep3');
const mainStatusS3 = document.getElementById('mainStatusStep3');
const historyStatusS3 = document.getElementById('historyStatusStep3');
const checkedStatusS3 = document.getElementById('checkedStatusStep3');
const calculateBtnS3 = document.getElementById('calculateReportBtnStep3');
const exportBtnS3 = document.getElementById('exportReportBtnStep3');
const reportBodyS3 = document.getElementById('reportBodyStep3');
const reportHeaderS3 = document.getElementById('reportHeaderStep3');
const reportAreaS3 = document.getElementById('reportAreaStep3');

const tabProje = document.getElementById('reportTabProje');
const tabProjeKisi = document.getElementById('reportTabProjeKisi');
const tabKisi = document.getElementById('reportTabKisi');
const tabGroup = document.getElementById('reportTabGroup');

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

// ---------- 1. Görüşme Listesi ----------
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

      const monCol = findColumnNameStep3(cols, ['emp_monitor_ident', 'Monitoring ID', 'monitoring id']);
      const fbCol = findColumnNameStep3(cols, ['FeedbackCreatorName', 'Feedback Creator Name']);
      const clientCol = findColumnNameStep3(cols, ['client_name', 'Client Name', 'Proje']);
      const posCol = findColumnNameStep3(cols, ['position_code_type_full_name', 'Position']);

      if (!monCol) throw new Error(`emp_monitor_ident veya Monitoring ID bulunamadı. Mevcut: ${cols.join(', ')}`);
      if (!fbCol) throw new Error(`FeedbackCreatorName bulunamadı.`);
      if (!clientCol) throw new Error(`client_name veya Proje bulunamadı.`);

      reportMainData = rows.map(r => ({
        monitorId: String(r[monCol]).trim(),
        feedbackCreatorName: String(r[fbCol]).trim(),
        clientName: String(r[clientCol]).trim(),
        position: posCol ? String(r[posCol]).trim() : ''
      })).filter(r => r.monitorId !== '');

      mainStatusS3.innerHTML = `✅ ${reportMainData.length} kayıt yüklendi. (Anahtar: ${monCol})`;
      mainStatusS3.style.color = 'var(--accent)';
      if (Object.values(reportHistory3).some(arr => arr.length) || checkedMonitoringIdsStep3.size) generateReportS3();
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

// ---------- 2. Dağıtım Geçmişi (JSON) ----------
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
        if (reportMainData.length || checkedMonitoringIdsStep3.size) generateReportS3();
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

// ---------- 3. Kontrol Edilenler (Monitoring ID) ----------
function loadCheckedFileStep3(file) {
  if (!file) return;
  showLoaderStep3(true);
  checkedStatusS3.innerHTML = '⏳ Yükleniyor...';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) throw new Error('Dosya boş');
      const cols = Object.keys(rows[0]);
      const monCol = findColumnNameStep3(cols, ['Monitoring ID', 'monitoring id', 'monitoringId']);
      if (!monCol) throw new Error(`Monitoring ID sütunu bulunamadı. Mevcut: ${cols.join(', ')}`);

      checkedMonitoringIdsStep3.clear();
      rows.forEach(r => {
        const id = String(r[monCol]).trim();
        if (id) checkedMonitoringIdsStep3.add(id);
      });
      checkedStatusS3.innerHTML = `✅ ${checkedMonitoringIdsStep3.size} giriş yapılan Monitoring ID yüklendi.`;
      checkedStatusS3.style.color = 'var(--accent)';
      if (reportMainData.length || Object.values(reportHistory3).some(arr => arr.length)) generateReportS3();
    } catch (err) {
      checkedStatusS3.innerHTML = `❌ ${err.message}`;
      checkedMonitoringIdsStep3.clear();
    } finally {
      showLoaderStep3(false);
    }
  };
  reader.onerror = () => {
    checkedStatusS3.innerHTML = '❌ Dosya okunamadı';
    showLoaderStep3(false);
  };
  reader.readAsArrayBuffer(file);
}

// ---------- Dağıtım Haritası ----------
function buildDistributedMapS3() {
  const map = new Map();
  const groupMap = { DM: 'DM', ML: 'ML', DONUSUM: 'Dönüşüm' };
  for (const [gKey, entries] of Object.entries(reportHistory3)) {
    const groupName = groupMap[gKey] || gKey;
    for (const entry of entries || []) {
      for (const ass of entry.assignments || []) {
        const ident = String(ass.emp_monitor_ident || '').trim();
        if (ident) {
          map.set(ident, {
            client_name: ass.client_name || '',
            feedbackCreatorName: ass.FeedbackCreatorName || '',
            group: groupName,
            date: entry.date || '',
            week: entry.week || '',
            hpGroup: ass.hpGroup || '',
            position: ass.position_code_type_full_name || '',
            dil: ass.dil || '',
            dagitimTuru: ass.dagitimTuru || ''
          });
        }
      }
    }
  }
  return map;
}

// ---------- Rapor Oluştur ----------
function generateReportS3() {
  if (!reportMainData.length) {
    alert('Önce görüşme listesini yükleyin.');
    return;
  }
  const distMap = buildDistributedMapS3();

  // Her kaydı zenginleştir
  const enriched = reportMainData.map(rec => {
    const dist = distMap.get(rec.monitorId);
    const isDistributed = !!dist;
    const isChecked = checkedMonitoringIdsStep3.has(rec.monitorId);
    return {
      ...rec,
      distGroup: dist ? dist.group : 'Dağıtılmadı',
      distDate: dist ? dist.date : '',
      distHpGroup: dist ? dist.hpGroup : '',
      distPosition: dist ? dist.position : rec.position,
      distDil: dist ? dist.dil : '',
      distDagitimTuru: dist ? dist.dagitimTuru : '',
      isDistributed: isDistributed,
      isChecked: isChecked  // ✅ Kontrol Edilenler dosyasından geldi mi?
    };
  });

  let headers, rows;
  if (currentReportView === 'proje') {
    const map = new Map();
    enriched.forEach(rec => {
      if (!rec.clientName) return;
      if (!map.has(rec.clientName)) map.set(rec.clientName, { total: 0, dist: 0, checked: 0 });
      const s = map.get(rec.clientName);
      s.total++;
      if (rec.isDistributed) s.dist++;
      if (rec.isChecked) s.checked++;
    });
    headers = ['Proje Adı', 'Toplam', 'Dağıtılan', 'Giriş Yapılan', 'Giriş Yapılmayan', 'Dağıtılmayan', 'Giriş Oranı'];
    rows = Array.from(map.entries()).map(([p, s]) => {
      const girisYapilmayan = s.dist - s.checked;
      const dagitilmayan = s.total - s.dist;
      const oran = s.dist > 0 ? ((s.checked / s.dist) * 100).toFixed(1) + '%' : '0%';
      return [p, s.total, s.dist, s.checked, girisYapilmayan, dagitilmayan, oran];
    });
  } else if (currentReportView === 'projekisi') {
    const map = new Map();
    enriched.forEach(rec => {
      if (!rec.clientName || !rec.feedbackCreatorName) return;
      const key = `${rec.clientName}|${rec.feedbackCreatorName}`;
      if (!map.has(key)) map.set(key, { proje: rec.clientName, kisi: rec.feedbackCreatorName, total: 0, dist: 0, checked: 0 });
      const s = map.get(key);
      s.total++;
      if (rec.isDistributed) s.dist++;
      if (rec.isChecked) s.checked++;
    });
    headers = ['Proje', 'Değerlendirici', 'Toplam', 'Dağıtılan', 'Giriş Yapılan', 'Giriş Yapılmayan', 'Dağıtılmayan', 'Giriş Oranı'];
    rows = Array.from(map.values()).map(v => {
      const girisYapilmayan = v.dist - v.checked;
      const dagitilmayan = v.total - v.dist;
      const oran = v.dist > 0 ? ((v.checked / v.dist) * 100).toFixed(1) + '%' : '0%';
      return [v.proje, v.kisi, v.total, v.dist, v.checked, girisYapilmayan, dagitilmayan, oran];
    });
  } else if (currentReportView === 'kisi') {
    const map = new Map();
    enriched.forEach(rec => {
      if (!rec.feedbackCreatorName) return;
      if (!map.has(rec.feedbackCreatorName)) map.set(rec.feedbackCreatorName, { total: 0, dist: 0, checked: 0 });
      const s = map.get(rec.feedbackCreatorName);
      s.total++;
      if (rec.isDistributed) s.dist++;
      if (rec.isChecked) s.checked++;
    });
    headers = ['Değerlendirici', 'Toplam', 'Dağıtılan', 'Giriş Yapılan', 'Giriş Yapılmayan', 'Dağıtılmayan', 'Giriş Oranı'];
    rows = Array.from(map.entries()).map(([k, s]) => {
      const girisYapilmayan = s.dist - s.checked;
      const dagitilmayan = s.total - s.dist;
      const oran = s.dist > 0 ? ((s.checked / s.dist) * 100).toFixed(1) + '%' : '0%';
      return [k, s.total, s.dist, s.checked, girisYapilmayan, dagitilmayan, oran];
    });
  } else if (currentReportView === 'group') {
    const map = new Map();
    enriched.forEach(rec => {
      const group = rec.distGroup || 'Dağıtılmadı';
      if (!map.has(group)) map.set(group, { total: 0, dist: 0, checked: 0 });
      const s = map.get(group);
      s.total++;
      if (rec.isDistributed) s.dist++;
      if (rec.isChecked) s.checked++;
    });
    headers = ['Grup', 'Toplam', 'Dağıtılan', 'Giriş Yapılan', 'Giriş Yapılmayan', 'Dağıtılmayan', 'Giriş Oranı'];
    rows = Array.from(map.entries()).map(([g, s]) => {
      const girisYapilmayan = s.dist - s.checked;
      const dagitilmayan = s.total - s.dist;
      const oran = s.dist > 0 ? ((s.checked / s.dist) * 100).toFixed(1) + '%' : '0%';
      return [g, s.total, s.dist, s.checked, girisYapilmayan, dagitilmayan, oran];
    });
  }

  renderReportTableS3(headers, rows);
  reportAreaS3.style.display = 'block';
  exportBtnS3.disabled = false;

  // Sekme aktiflik
  [tabProje, tabProjeKisi, tabKisi, tabGroup].forEach(b => b.classList.remove('btn-primary', 'btn-ghost'));
  [tabProje, tabProjeKisi, tabKisi, tabGroup].forEach(b => b.classList.add('btn-ghost'));
  const activeTab = { proje: tabProje, projekisi: tabProjeKisi, kisi: tabKisi, group: tabGroup }[currentReportView];
  if (activeTab) activeTab.classList.replace('btn-ghost', 'btn-primary');
}

function renderReportTableS3(headers, rows) {
  reportHeaderS3.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
  reportBodyS3.innerHTML = rows.length
    ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}">Veri yok</td></tr>`;
}

// ---------- Export (Excel) ----------
function exportReportS3() {
  if (!reportMainData.length) {
    alert('Rapor verisi yok');
    return;
  }
  const wb = XLSX.utils.book_new();
  const distMap = buildDistributedMapS3();

  const enriched = reportMainData.map(rec => {
    const dist = distMap.get(rec.monitorId);
    return {
      ...rec,
      distGroup: dist ? dist.group : 'Dağıtılmadı',
      distDate: dist ? dist.date : '',
      distHpGroup: dist ? dist.hpGroup : '',
      distPosition: dist ? dist.position : rec.position,
      distDil: dist ? dist.dil : '',
      distDagitimTuru: dist ? dist.dagitimTuru : '',
      isDistributed: !!dist,
      isChecked: checkedMonitoringIdsStep3.has(rec.monitorId)
    };
  });

  // 1. Proje Bazlı
  const projMap = new Map();
  enriched.forEach(rec => { if (!rec.clientName) return; if (!projMap.has(rec.clientName)) projMap.set(rec.clientName, { total: 0, dist: 0, checked: 0 }); const s = projMap.get(rec.clientName); s.total++; if (rec.isDistributed) s.dist++; if (rec.isChecked) s.checked++; });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(projMap.entries()).map(([p, s]) => ({ 'Proje': p, 'Toplam': s.total, 'Dağıtılan': s.dist, 'Giriş Yapılan': s.checked, 'Giriş Yapılmayan': s.dist - s.checked, 'Dağıtılmayan': s.total - s.dist, 'Giriş Oranı': s.dist > 0 ? ((s.checked / s.dist) * 100).toFixed(1) + '%' : '0%' }))), 'Proje_Bazlı');

  // 2. Proje+Kişi
  const pkMap = new Map();
  enriched.forEach(rec => { if (!rec.clientName || !rec.feedbackCreatorName) return; const key = `${rec.clientName}|${rec.feedbackCreatorName}`; if (!pkMap.has(key)) pkMap.set(key, { proje: rec.clientName, kisi: rec.feedbackCreatorName, total: 0, dist: 0, checked: 0 }); const s = pkMap.get(key); s.total++; if (rec.isDistributed) s.dist++; if (rec.isChecked) s.checked++; });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(pkMap.values()).map(v => ({ 'Proje': v.proje, 'Değerlendirici': v.kisi, 'Toplam': v.total, 'Dağıtılan': v.dist, 'Giriş Yapılan': v.checked, 'Giriş Yapılmayan': v.dist - v.checked, 'Dağıtılmayan': v.total - v.dist, 'Giriş Oranı': v.dist > 0 ? ((v.checked / v.dist) * 100).toFixed(1) + '%' : '0%' }))), 'Proje_Kisi');

  // 3. Kişi Bazlı
  const kisiMap = new Map();
  enriched.forEach(rec => { if (!rec.feedbackCreatorName) return; if (!kisiMap.has(rec.feedbackCreatorName)) kisiMap.set(rec.feedbackCreatorName, { total: 0, dist: 0, checked: 0 }); const s = kisiMap.get(rec.feedbackCreatorName); s.total++; if (rec.isDistributed) s.dist++; if (rec.isChecked) s.checked++; });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(kisiMap.entries()).map(([k, s]) => ({ 'Değerlendirici': k, 'Toplam': s.total, 'Dağıtılan': s.dist, 'Giriş Yapılan': s.checked, 'Giriş Yapılmayan': s.dist - s.checked, 'Dağıtılmayan': s.total - s.dist, 'Giriş Oranı': s.dist > 0 ? ((s.checked / s.dist) * 100).toFixed(1) + '%' : '0%' }))), 'Kisi_Bazlı');

  // 4. Grup Bazlı
  const groupMap = new Map();
  enriched.forEach(rec => {
    const g = rec.distGroup || 'Dağıtılmadı';
    if (!groupMap.has(g)) groupMap.set(g, { total: 0, dist: 0, checked: 0 });
    const s = groupMap.get(g);
    s.total++;
    if (rec.isDistributed) s.dist++;
    if (rec.isChecked) s.checked++;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(groupMap.entries()).map(([g, s]) => ({ 'Grup': g, 'Toplam': s.total, 'Dağıtılan': s.dist, 'Giriş Yapılan': s.checked, 'Giriş Yapılmayan': s.dist - s.checked, 'Dağıtılmayan': s.total - s.dist, 'Giriş Oranı': s.dist > 0 ? ((s.checked / s.dist) * 100).toFixed(1) + '%' : '0%' }))), 'Grup_Bazlı');

  // 5. RAW DATA (Pivot için)
  const rawData = enriched.map(rec => ({
    'Grup': rec.distGroup,
    'Proje': rec.clientName,
    'Değerlendirici': rec.feedbackCreatorName,
    'Monitoring ID': rec.monitorId,
    'Dağıtım Durumu': rec.isDistributed ? 'Evet' : 'Hayır',
    'Giriş Yapıldı mı?': rec.isChecked ? 'Evet' : 'Hayır',
    'Dağıtım Tarihi': rec.distDate,
    'HP Grubu (ML)': rec.distHpGroup,
    'Pozisyon': rec.distPosition || rec.position,
    'Dil': rec.distDil,
    'Dağıtım Türü': rec.distDagitimTuru
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawData), 'RAW_Detay');

  XLSX.writeFile(wb, `Feedback_Rapor_${formatDateForFilename()}.xlsx`);
}

// ---------- Görünüm Değiştirme ----------
function setReportViewS3(view) {
  currentReportView = view;
  if (reportMainData.length) generateReportS3();
}

// ---------- Başlangıç ----------
function initStep3() {
  const dropMain = document.getElementById('dropMainStep3');
  const dropHistory = document.getElementById('dropHistoryStep3');
  const dropChecked = document.getElementById('dropCheckedStep3');

  if (!dropMain || !dropHistory || !dropChecked) return;

  // Ana liste
  dropMain.addEventListener('click', e => { if (e.target !== mainFileInputS3) mainFileInputS3.click(); });
  mainFileInputS3.addEventListener('change', e => { if (e.target.files[0]) loadMainExcelS3(e.target.files[0]); });
  dropMain.addEventListener('dragover', e => e.preventDefault());
  dropMain.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) loadMainExcelS3(e.dataTransfer.files[0]);
  });

  // Geçmiş JSON
  dropHistory.addEventListener('click', e => { if (e.target !== historyFileInputS3) historyFileInputS3.click(); });
  historyFileInputS3.addEventListener('change', e => { if (e.target.files[0]) loadHistoryJSONS3(e.target.files[0]); });
  dropHistory.addEventListener('dragover', e => e.preventDefault());
  dropHistory.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) loadHistoryJSONS3(e.dataTransfer.files[0]);
  });

  // Kontrol Edilenler
  dropChecked.addEventListener('click', e => { if (e.target !== checkedFileInputS3) checkedFileInputS3.click(); });
  checkedFileInputS3.addEventListener('change', e => { if (e.target.files[0]) loadCheckedFileStep3(e.target.files[0]); });
  dropChecked.addEventListener('dragover', e => e.preventDefault());
  dropChecked.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) loadCheckedFileStep3(e.dataTransfer.files[0]);
  });

  // Butonlar
  calculateBtnS3.addEventListener('click', generateReportS3);
  exportBtnS3.addEventListener('click', exportReportS3);
  tabProje.addEventListener('click', () => setReportViewS3('proje'));
  tabProjeKisi.addEventListener('click', () => setReportViewS3('projekisi'));
  tabKisi.addEventListener('click', () => setReportViewS3('kisi'));
  if (tabGroup) tabGroup.addEventListener('click', () => setReportViewS3('group'));

  [tabProje, tabProjeKisi, tabKisi, tabGroup].forEach(b => b.style.display = 'inline-flex');
  reportAreaS3.style.display = 'none';
  exportBtnS3.disabled = true;
}

initStep3();

// ==================== STEP 4 (Gelişmiş Tablo - Hafta Yok, Çoklama Engelli) ====================
let allHistoryData = [];      // { date, dateRaw, group, reviewer, project, monitorId, link }
let currentDisplayData = [];
let sortColumn = null;
let sortDirection = 'asc';
let loadedFiles = new Set();   // Dosya adı+boyut+sonDeğişiklik bazında benzersizlik

// DOM Elemanları
const historyFileInputStep4 = document.getElementById('historyFileInputStep4');
const dropHistoryStep4 = document.getElementById('dropHistoryStep4');
const historyStatusStep4 = document.getElementById('historyStatusStep4');
const clearHistoryBtn = document.getElementById('clearHistoryDataBtnStep4');
const distributionAreaStep4 = document.getElementById('distributionAreaStep4');
const distributionTableBody = document.getElementById('distributionTableBodyStep4');
const exportBtnStep4 = document.getElementById('exportDistributionBtnStep4');
const filterStatsSpan = document.getElementById('filterStatsStep4');

// Sütun tanımları (hafta yok)
const columns = [
  { key: 'date', label: 'Dağıtım Tarihi', type: 'string', filterType: 'text' },
  { key: 'group', label: 'Grup', type: 'string', filterType: 'text' },
  { key: 'reviewer', label: 'Değerlendirici', type: 'string', filterType: 'text' },
  { key: 'project', label: 'Proje', type: 'string', filterType: 'text' },
  { key: 'monitorId', label: 'Monitoring ID', type: 'string', filterType: 'text' },
  { key: 'link', label: 'Link', type: 'link', filterType: null }
];

let filterValues = {
  date: '',
  group: '',
  reviewer: '',
  project: '',
  monitorId: ''
};

// JSON'dan veri çıkarma (hafta bilgisini artık kullanmıyoruz)
function extractAssignmentsFromJson(jsonObj) {
  const result = [];
  const groupMap = {
    'DM': 'DM',
    'ML': 'ML',
    'DONUSUM': 'Dönüşüm Projeleri'
  };
  for (const [groupKey, groupName] of Object.entries(groupMap)) {
    const entries = jsonObj[groupKey] || [];
    for (const entry of entries) {
      const dateRaw = entry.date;
      let formattedDate = '';
      if (dateRaw) {
        const d = new Date(dateRaw);
        if (!isNaN(d.getTime())) {
          formattedDate = d.toLocaleDateString('tr-TR');
        }
      }
      const assignments = entry.assignments || [];
      for (const ass of assignments) {
        let link = '#';
        if (typeof buildMonitorLinkStep2 === 'function') {
          link = buildMonitorLinkStep2(ass.emp_monitor_ident, ass.employee_ident || '');
        } else if (typeof buildMonitorLink === 'function') {
          link = buildMonitorLink(ass.emp_monitor_ident, 'CHECKLIST');
        }
        result.push({
          date: formattedDate,
          dateRaw: dateRaw,
          group: groupName,
          reviewer: ass.FeedbackCreatorName || '',
          project: ass.client_name || '',
          monitorId: ass.emp_monitor_ident || '',
          link: link
        });
      }
    }
  }
  return result;
}

// Dosya için benzersiz anahtar oluştur (ad + boyut + son değişiklik)
function getFileKey(file) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

// Çoklu JSON yükleme (çoklama engelli)
async function loadMultipleHistoryFiles(files) {
  if (!files || files.length === 0) return;
  if (typeof showLoader === 'function') showLoader('Step4', true);
  
  const newFiles = [];
  const duplicateFiles = [];
  for (const file of files) {
    const key = getFileKey(file);
    if (loadedFiles.has(key)) {
      duplicateFiles.push(file.name);
    } else {
      loadedFiles.add(key);
      newFiles.push(file);
    }
  }
  
  if (duplicateFiles.length) {
    alert(`Şu dosyalar daha önce yüklenmiş, atlandı:\n${duplicateFiles.join('\n')}`);
  }
  if (newFiles.length === 0) {
    historyStatusStep4.innerHTML = `⚠️ Yeni dosya yok, hepsi daha önce yüklenmiş.`;
    if (typeof showLoader === 'function') showLoader('Step4', false);
    return;
  }
  
  historyStatusStep4.innerHTML = `⏳ ${newFiles.length} yeni dosya yükleniyor...`;
  let totalAdded = 0;
  for (const file of newFiles) {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (json && Array.isArray(json.DM) && Array.isArray(json.ML) && Array.isArray(json.DONUSUM)) {
        const newRecords = extractAssignmentsFromJson(json);
        allHistoryData.push(...newRecords);
        totalAdded += newRecords.length;
      } else {
        console.warn(`${file.name} geçersiz yapı`);
      }
    } catch (err) {
      console.error(`${file.name} okunamadı:`, err);
      historyStatusStep4.innerHTML = `❌ ${file.name} hatalı: ${err.message}`;
      setTimeout(() => {
        if (historyStatusStep4.innerHTML.includes('hatalı')) historyStatusStep4.innerHTML = `⚠️ Bazı dosyalar yüklenemedi. Son durum: ${allHistoryData.length} kayıt.`;
      }, 2000);
    }
  }
  historyStatusStep4.innerHTML = `✅ Toplam ${allHistoryData.length} dağıtım kaydı yüklendi. (${newFiles.length} yeni dosya)`;
  historyStatusStep4.style.color = 'var(--accent)';
  if (typeof showLoader === 'function') showLoader('Step4', false);
  distributionAreaStep4.style.display = 'block';
  exportBtnStep4.disabled = false;
  renderTableHeader();
  applyFiltersAndRender();
}

// Başlık satırını oluştur (sıralama başlıkları + filtre inputları)
function renderTableHeader() {
  const thead = document.getElementById('historyTableHeaderStep4');
  if (!thead) return;
  
  const headerRow1 = document.createElement('tr');
  const headerRow2 = document.createElement('tr');
  
  for (const col of columns) {
    // Sıralama başlığı
    const th = document.createElement('th');
    th.textContent = col.label;
    th.style.cursor = 'pointer';
    th.style.userSelect = 'none';
    th.dataset.sort = col.key;
    if (sortColumn === col.key) {
      th.textContent += sortDirection === 'asc' ? ' ▲' : ' ▼';
    }
    th.addEventListener('click', () => {
      if (sortColumn === col.key) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = col.key;
        sortDirection = 'asc';
      }
      renderTableHeader();
      applyFiltersAndRender();
    });
    headerRow1.appendChild(th);
    
    // Filtre inputu
    const td = document.createElement('td');
    if (col.filterType && col.key !== 'link') {
      const input = document.createElement('input');
      input.type = col.filterType === 'number' ? 'number' : 'text';
      input.placeholder = `Filtrele...`;
      input.style.width = '100%';
      input.style.padding = '0.3rem';
      input.style.borderRadius = '0.4rem';
      input.style.border = '1px solid var(--border)';
      input.style.background = 'var(--surface)';
      input.style.color = 'var(--text)';
      input.value = filterValues[col.key] || '';
      input.addEventListener('input', (e) => {
        filterValues[col.key] = e.target.value;
        applyFiltersAndRender();
      });
      td.appendChild(input);
    } else {
      td.textContent = '';
    }
    headerRow2.appendChild(td);
  }
  
  thead.innerHTML = '';
  thead.appendChild(headerRow1);
  thead.appendChild(headerRow2);
}

// Filtreleme ve sıralama (hafta yok)
function applyFiltersAndRender() {
  let filtered = [...allHistoryData];
  
  if (filterValues.date) {
    const val = filterValues.date.toLowerCase();
    filtered = filtered.filter(r => r.date.toLowerCase().includes(val));
  }
  if (filterValues.group) {
    const val = filterValues.group.toLowerCase();
    filtered = filtered.filter(r => r.group.toLowerCase().includes(val));
  }
  if (filterValues.reviewer) {
    const val = filterValues.reviewer.toLowerCase();
    filtered = filtered.filter(r => r.reviewer.toLowerCase().includes(val));
  }
  if (filterValues.project) {
    const val = filterValues.project.toLowerCase();
    filtered = filtered.filter(r => r.project.toLowerCase().includes(val));
  }
  if (filterValues.monitorId) {
    const val = filterValues.monitorId.toLowerCase();
    filtered = filtered.filter(r => r.monitorId.toLowerCase().includes(val));
  }
  
  // Sıralama
  if (sortColumn && sortColumn !== 'link') {
    filtered.sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];
      if (sortColumn === 'date') {
        valA = a.dateRaw || '';
        valB = b.dateRaw || '';
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }
  
  currentDisplayData = filtered;
  renderTableBody();
  updateFilterStats();
}

// Tablo gövdesini çiz
function renderTableBody() {
  if (!distributionTableBody) return;
  if (!currentDisplayData.length) {
    distributionTableBody.innerHTML = `<tr><td colspan="${columns.length}" class="empty-state">Hiç kayıt yok</td></tr>`;
    return;
  }
  
  distributionTableBody.innerHTML = currentDisplayData.map(row => `
    <tr>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.group)}</td>
      <td>${escapeHtml(row.reviewer)}</td>
      <td>${escapeHtml(row.project)}</td>
      <td>${escapeHtml(row.monitorId)}</td>
      <td><a href="${row.link}" target="_blank" class="link-btn">🔗 Link</a></td>
    </tr>
  `).join('');
}

// Filtre istatistiğini güncelle
function updateFilterStats() {
  if (filterStatsSpan) {
    filterStatsSpan.textContent = `${currentDisplayData.length} / ${allHistoryData.length} kayıt gösteriliyor`;
  }
}

// Excel'e aktar (filtrelenmiş veri)
function exportFilteredToExcel() {
  if (!currentDisplayData.length) {
    alert('Aktarılacak veri yok');
    return;
  }
  if (typeof XLSX === 'undefined') {
    alert('XLSX kütüphanesi yüklenemedi.');
    return;
  }
  const exportData = currentDisplayData.map(row => ({
    'Dağıtım Tarihi': row.date,
    'Grup': row.group,
    'Değerlendirici': row.reviewer,
    'Proje': row.project,
    'Monitoring ID': row.monitorId,
    'Link': row.link
  }));
  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Geçmis_Dagitim_${formatDateForFilename()}`);
  XLSX.writeFile(wb, `gecmis_dagitim_filtreli_${formatDateForFilename()}.xlsx`);
}

// Tüm veriyi temizle (yüklenen dosya listesi de temizlenir)
function clearAllHistoryData() {
  if (confirm('Tüm yüklenen geçmiş verileri silinecek. Devam etmek istiyor musunuz?')) {
    allHistoryData = [];
    currentDisplayData = [];
    loadedFiles.clear();
    sortColumn = null;
    sortDirection = 'asc';
    for (let key in filterValues) {
      filterValues[key] = '';
    }
    renderTableHeader();
    renderTableBody();
    updateFilterStats();
    historyStatusStep4.innerHTML = 'Veriler temizlendi. Yeni JSON yükleyebilirsiniz.';
    historyStatusStep4.style.color = 'var(--muted)';
    distributionAreaStep4.style.display = 'none';
    exportBtnStep4.disabled = true;
  }
}

// Drag & Drop ve çoklu dosya yükleme
function setupDropStep4() {
  if (!dropHistoryStep4 || !historyFileInputStep4) return;
  dropHistoryStep4.addEventListener('click', e => { if (e.target !== historyFileInputStep4) historyFileInputStep4.click(); });
  historyFileInputStep4.addEventListener('change', e => {
    if (e.target.files && e.target.files.length) loadMultipleHistoryFiles(Array.from(e.target.files));
    e.target.value = '';
  });
  dropHistoryStep4.addEventListener('dragover', e => { e.preventDefault(); dropHistoryStep4.classList.add('drag'); });
  dropHistoryStep4.addEventListener('dragleave', () => dropHistoryStep4.classList.remove('drag'));
  dropHistoryStep4.addEventListener('drop', e => {
    e.preventDefault();
    dropHistoryStep4.classList.remove('drag');
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      loadMultipleHistoryFiles(Array.from(e.dataTransfer.files));
    }
  });
}

// Buton olayları
if (exportBtnStep4) exportBtnStep4.addEventListener('click', exportFilteredToExcel);
if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearAllHistoryData);

// Başlangıç
setupDropStep4();
distributionAreaStep4.style.display = 'none';
exportBtnStep4.disabled = true;
