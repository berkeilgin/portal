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

// ==================== STEP 1 (Monitoring ID + duplicate - tüm tekrarlar hata) ====================
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
  const lower = columns.map(c => String(c).trim().toLowerCase());
  for (let name of possibleNames) {
    const idx = lower.indexOf(name.toLowerCase());
    if (idx !== -1) return columns[idx];
  }
  return null;
}
function isValidMonitoringId(v) {
  if (v == null) return false;
  let s = String(v).trim();
  return /^\d{8}$/.test(s);
}
function getErrorReason(v) {
  if (v == null || String(v).trim() === "") return "Boş değer";
  let s = String(v).trim();
  if (!/^\d+$/.test(s)) return "Sayısal değil";
  if (s.length !== 8) return `${s.length} haneli (8 gerekli)`;
  return "Geçersiz format";
}
async function processFileStep1(file) {
  if (!file) return;
  if (typeof XLSX === 'undefined') { alert("XLSX kütüphanesi yüklenemedi."); return; }
  showLoader('Step1', true);
  statsContainerStep1.style.display = 'none';
  errorsSectionStep1.style.display = 'none';
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', defval: "" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    let rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rows.length) throw new Error('Dosya boş');
    const columns = Object.keys(rows[0]);
    const monCol = findColumnName(columns, ['Monitoring ID','monitoring id','MonitoringId']);
    const identCol = findColumnName(columns, ['Ident','ident','ID','Id']);
    if (!monCol) throw new Error(`'Monitoring ID' sütunu yok: ${columns.join(', ')}`);
    if (!identCol) throw new Error(`'Ident' sütunu yok: ${columns.join(', ')}`);
    currentDataStep1 = rows;
    // Hata tespiti: format + duplicate
    const errors = [];
    const idMap = new Map(); // monitoringId -> array of row numbers
    rows.forEach((row, idx) => {
      const mid = row[monCol];
      const midStr = mid != null ? String(mid).trim() : null;
      if (midStr) {
        if (!idMap.has(midStr)) idMap.set(midStr, []);
        idMap.get(midStr).push(idx + 2);
      }
    });
    // duplicate olan ID'ler için tüm satırları hata ekle
    const duplicateIds = new Set();
    for (let [id, positions] of idMap.entries()) {
      if (positions.length > 1) duplicateIds.add(id);
    }
    rows.forEach((row, idx) => {
      const mid = row[monCol];
      const ident = row[identCol];
      const rowNum = idx + 2;
      let reason = null;
      if (!isValidMonitoringId(mid)) {
        reason = getErrorReason(mid);
      } else {
        const midStr = String(mid).trim();
        if (duplicateIds.has(midStr)) {
          reason = `Tekrar eden ID (${idMap.get(midStr).filter(r => r !== rowNum).map(r => `${r}. satır`).join(', ')})`;
        }
      }
      if (reason) {
        errors.push({
          rowNumber: rowNum,
          monitoringIdRaw: mid != null ? String(mid) : "(boş)",
          identRaw: ident != null ? String(ident) : "",
          reason: reason
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
      errorTableBodyStep1.innerHTML = `<tr><td colspan="5" class="empty-state">✅ Tüm ID'ler geçerli ve benzersiz!</td></tr>`;
    } else {
      errorsSectionStep1.style.display = 'block';
      let html = '';
      errors.forEach(err => {
        const link = buildMonitorLink(err.identRaw);
        const linkHtml = link ? `<a href="${link}" target="_blank" class="link-btn">🔗 Link</a>` : `<span class="badge-error">Ident eksik</span>`;
        html += `<tr><td>${err.rowNumber}</td><td><code>${escapeHtml(err.monitoringIdRaw)}</code></td><td><code>${escapeHtml(err.identRaw)||"—"}</code></td><td><span class="badge-error">⚠️ ${escapeHtml(err.reason)}</span></td><td>${linkHtml}</td></tr>`;
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

// ==================== STEP 2 (DM, ML, Dönüşüm + özel kurallar) ====================
let mainDataStep2 = [], deletedIdentsStep2 = new Set(), refDataStep2 = [];
let distributionHistory = { DM: [], ML: [], DONUSUM: [] };
const WEEK_TARGET = {1:3,2:2,3:3,4:2};
let currentWeekStep2 = 1;
let currentPreview = { DM: [], ML: [], DONUSUM: [] };

const HP_RULES = {
  'HP_Dutch': { name: 'HP_Dutch', checker: rec => rec.FeedbackCreatorName === 'Suleyman Aslan' },
  'HP_German': { name: 'HP_German', checker: rec => rec.FeedbackCreatorName === 'Halil Emre Ozdemir' },
  'HP_Turkish': { name: 'HP_Turkish', checker: rec => !['Suleyman Aslan','Halil Emre Ozdemir'].includes(rec.FeedbackCreatorName) }
};

const groups = {
  DM: { key:'DM', name:'DM', filter:(ref)=> ref.KaliteDesteği==='Evet' && ref.Dil==='DM' && ref["Dağıtım Türü"]==='Proje', sheetPerProject:true, fileName:()=>`DM_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx` },
  ML: { key:'ML', name:'ML', filter:(ref)=> ref.KaliteDesteği==='Evet' && ref.Dil==='ML' && ref["Dağıtım Türü"]==='Proje', sheetPerProject:true, fileName:()=>`ML_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx`,
        extraFilter:(rec)=> String(rec.position_code_type_full_name || '').toLowerCase().includes('quality assurance analyst') },
  DONUSUM: { key:'DONUSUM', name:'Dönüşüm Projeleri', filter:(ref)=> ref.KaliteDesteği==='Hayır' && ref.Dil==='DM' && ref["Dağıtım Türü"]==='1. Değerlendirici', sheetPerProject:false, fileName:()=>`Dönüşüm Projeleri_Feedback Uyumluluk_(${formatDateForFilename()}).xlsx` }
};

function getRefInfo(proje) { return refDataStep2.find(r => String(r.Proje).trim() === String(proje).trim()); }

function saveHistoryForGroup(gk) { localStorage.setItem(`fb_distribution_history_${gk}`, JSON.stringify(distributionHistory[gk])); }
function loadHistoryForGroup(gk) { const s=localStorage.getItem(`fb_distribution_history_${gk}`); distributionHistory[gk]=s?JSON.parse(s):[]; }
function loadAllHistories() { Object.keys(groups).forEach(g=>loadHistoryForGroup(g)); }
function saveAllHistories() { Object.keys(groups).forEach(g=>saveHistoryForGroup(g)); }
function exportAllHistory() { const all={DM:distributionHistory.DM, ML:distributionHistory.ML, DONUSUM:distributionHistory.DONUSUM}; const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(all,null,2)],{type:'application/json'})); a.download=`feedback_history_all_${formatDateForFilename()}.json`; a.click(); alert("Tüm geçmiş dışa aktarıldı."); }
function importAllHistory(file) { const r=new FileReader(); r.onload=e=>{try{const j=JSON.parse(e.target.result); if(j.DM&&j.ML&&j.DONUSUM){distributionHistory=j; saveAllHistories(); alert('Geçmiş yüklendi.');}else throw new Error();}catch(err){alert('Geçersiz dosya');}}; r.readAsText(file); }
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
    const hist = distributionHistory[g] || [];
    if (!hist.length) { const row = tbody.insertRow(); row.insertCell(0).colSpan = 4; row.insertCell(0).textContent = 'Geçmiş yok'; }
    else {
      hist.slice().sort((a,b)=>a.week-b.week).forEach(entry => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = entry.week;
        row.insertCell(1).textContent = new Date(entry.date).toLocaleString();
        row.insertCell(2).textContent = entry.assignments ? entry.assignments.length : 0;
        const btn = document.createElement('button'); btn.textContent = 'Göster'; btn.className = 'btn-ghost'; btn.style.padding = '0.2rem 0.5rem';
        btn.onclick = () => { const list = entry.assignments ? entry.assignments.map(a=>`${a.FeedbackCreatorName} - ${a.client_name} (${a.emp_monitor_ident})`).join('\n') : 'Detay yok'; alert(list); };
        row.insertCell(3).appendChild(btn);
      });
    }
    content.appendChild(table);
    content.appendChild(document.createElement('hr'));
  });
  modal.appendChild(content); document.body.appendChild(modal);
  document.getElementById('closeModalBtn').onclick = () => modal.remove();
}
function clearAllHistory() { if(confirm('Tüm geçmiş silinecek?')){ distributionHistory={DM:[],ML:[],DONUSUM:[]}; saveAllHistories(); alert('Temizlendi.'); } }

function getDistributedIdentsForGroup(gk, week) { const set=new Set(); distributionHistory[gk].forEach(e=>{if(e.week<week && e.distributedIdents) e.distributedIdents.forEach(id=>set.add(id));}); return set; }
function getCumulativeCountsForGroup(gk, week) { const cnt=new Map(); distributionHistory[gk].forEach(e=>{if(e.week<week && e.assignments) e.assignments.forEach(a=>{const key=`${a.FeedbackCreatorName}|${a.client_name}`; cnt.set(key,(cnt.get(key)||0)+1);});}); return cnt; }
function getAvailableRecordsForGroup(gk, week, groupFilter, extraFilter=null) {
  const distributed=getDistributedIdentsForGroup(gk, week);
  return mainDataStep2.filter(rec=>{
    if(!(rec.CheckListCreated===0||rec.CheckListCreated==='0')) return false;
    const ident=String(rec.emp_monitor_ident||''); if(deletedIdentsStep2.has(ident)) return false; if(distributed.has(ident)) return false;
    const ref=getRefInfo(rec.client_name); if(!ref) return false;
    if(!groupFilter(ref)) return false;
    if(extraFilter && !extraFilter(rec)) return false;
    return true;
  });
}
function calculateDistributionForGroup(gk, week, groupDef) {
  let available = getAvailableRecordsForGroup(gk, week, groupDef.filter, groupDef.extraFilter || null);
  if(available.length===0) return [];
  if(gk === 'ML') {
    const hpRecords = available.filter(r => r.client_name.toLowerCase() === 'hewlett packard inc');
    const nonHpRecords = available.filter(r => r.client_name.toLowerCase() !== 'hewlett packard inc');
    const selected = [];
    for (let [hpKey, rule] of Object.entries(HP_RULES)) {
      const subset = hpRecords.filter(rule.checker);
      if(subset.length) {
        const key = `HP_${hpKey}`;
        const cumulative = getCumulativeCountsForGroup(gk, week);
        let done = cumulative.get(key) || 0;
        let target = WEEK_TARGET[week];
        let need = Math.min(target, 10 - done);
        if(need>0) {
          need = Math.min(need, subset.length);
          if(need>0) {
            const shuffled = [...subset]; for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
            selected.push(...shuffled.slice(0,need));
          }
        }
      }
    }
    if(nonHpRecords.length) {
      const categoryMap = new Map();
      nonHpRecords.forEach(rec => { const proj=rec.client_name; if(!categoryMap.has(proj)) categoryMap.set(proj,[]); categoryMap.get(proj).push(rec); });
      const cumulative = getCumulativeCountsForGroup(gk, week);
      for(let [proj, records] of categoryMap) {
        let done = cumulative.get(proj) || 0;
        let target = WEEK_TARGET[week];
        let need = Math.min(target, 10 - done);
        if(need>0) {
          need = Math.min(need, records.length);
          if(need>0) {
            const shuffled = [...records]; for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
            selected.push(...shuffled.slice(0,need));
          }
        }
      }
    }
    return selected;
  } else {
    const categoryMap = new Map();
    available.forEach(rec => {
      let key = (gk === 'DONUSUM') ? `${rec.FeedbackCreatorName}|${rec.client_name}` : rec.client_name;
      if(!categoryMap.has(key)) categoryMap.set(key,[]);
      categoryMap.get(key).push(rec);
    });
    const cumulative = getCumulativeCountsForGroup(gk, week);
    const needMap = new Map();
    for(let [key, records] of categoryMap) {
      let done = cumulative.get(key) || 0;
      let need = Math.min(WEEK_TARGET[week], 10 - done);
      if(need>0) { need = Math.min(need, records.length); if(need>0) needMap.set(key, need); }
    }
    const selected = [];
    for(let [key, need] of needMap) {
      const records = categoryMap.get(key);
      const shuffled = [...records]; for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
      selected.push(...shuffled.slice(0, need));
    }
    return selected;
  }
}
async function saveGroupDistribution(gk, week, selected) {
  const assignments = selected.map(rec => ({ FeedbackCreatorName: rec.FeedbackCreatorName, client_name: rec.client_name, emp_monitor_ident: rec.emp_monitor_ident, dil: getRefInfo(rec.client_name)?.Dil || '', dagitimTuru: getRefInfo(rec.client_name)?.["Dağıtım Türü"] || '' }));
  const newEntry = { week, date: new Date().toISOString(), distributedIdents: selected.map(r=>String(r.emp_monitor_ident)), assignments };
  const idx = distributionHistory[gk].findIndex(h=>h.week===week);
  if(idx>=0) distributionHistory[gk][idx]=newEntry; else distributionHistory[gk].push(newEntry);
  saveHistoryForGroup(gk);
}
async function exportGroupExcel(gk, selected, week) {
  const group = groups[gk];
  if(!selected.length) return;
  const workbook = XLSX.utils.book_new();
  const addSheetWithStatus = (sheetName, rows) => {
    const data = rows.map(r => ({ ...r, Durum: '' }));
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, ws, sheetName.substring(0,31));
  };
  if(group.sheetPerProject) {
    const grouped = new Map();
    selected.forEach(rec => { const proj=rec.client_name; if(!grouped.has(proj)) grouped.set(proj,[]); grouped.get(proj).push({'İlk Fb Girişi Yapan':rec.FeedbackCreatorName, 'Operasyon':rec.client_name, 'Monitor Ident':rec.emp_monitor_ident, 'Monitor Link':buildMonitorLink(rec.emp_monitor_ident)}); });
    for(let [proj, rows] of grouped) addSheetWithStatus(proj, rows);
  } else {
    let sheetName = "1. Değerlendirici";
    if(selected.length) { const ref=getRefInfo(selected[0].client_name); if(ref && ref["Dağıtım Türü"]) sheetName=String(ref["Dağıtım Türü"]).trim(); }
    const rows = selected.map(rec => ({'İlk Fb Girişi Yapan':rec.FeedbackCreatorName, 'Operasyon':rec.client_name, 'Monitor Ident':rec.emp_monitor_ident, 'Monitor Link':buildMonitorLink(rec.emp_monitor_ident)}));
    addSheetWithStatus(sheetName, rows);
  }
  XLSX.writeFile(workbook, group.fileName());
}
async function previewAllGroups() {
  if(!mainDataStep2.length) { alert('Görüşme listesi yükleyin.'); return; }
  if(!refDataStep2.length) { alert('Referans listesi yükleyin.'); return; }
  const week = parseInt(document.getElementById('weekSelectStep2').value);
  currentWeekStep2 = week;
  const allSelected = [];
  for(let [gk, grp] of Object.entries(groups)) {
    const selected = calculateDistributionForGroup(gk, week, grp);
    currentPreview[gk] = selected;
    allSelected.push(...selected.map(s=>({...s, grup:grp.name})));
  }
  const previewDiv = document.getElementById('previewAreaStep2');
  const previewBody = document.getElementById('previewBodyStep2');
  if(allSelected.length===0) { previewDiv.style.display='block'; previewBody.innerHTML='<tr><td colspan="5">Bu hafta dağıtılacak kayıt yok</td></tr>'; document.getElementById('confirmBtnStep2').disabled=true; return; }
  previewBody.innerHTML='';
  allSelected.forEach(rec=>{ const r=previewBody.insertRow(); r.insertCell(0).textContent=rec.grup; r.insertCell(1).textContent=rec.FeedbackCreatorName||''; r.insertCell(2).textContent=rec.client_name||''; r.insertCell(3).textContent=rec.emp_monitor_ident||''; const a=document.createElement('a'); a.href=buildMonitorLink(rec.emp_monitor_ident); a.target='_blank'; a.textContent='🔗 Link'; a.className='link-btn'; r.insertCell(4).appendChild(a); });
  previewDiv.style.display='block';
  document.getElementById('confirmBtnStep2').disabled=false;
}
async function confirmAndExportAll() {
  if(Object.values(currentPreview).every(arr=>arr.length===0)) { alert('Önce dağıtım hesaplayın.'); return; }
  showLoader('Step2', true);
  try {
    const week = currentWeekStep2;
    for(let gk of ['DM','ML','DONUSUM']) {
      const selected = currentPreview[gk];
      if(selected.length) {
        await saveGroupDistribution(gk, week, selected);
        await exportGroupExcel(gk, selected, week);
      }
    }
    alert(`Dağıtım onaylandı. Toplam ${Object.values(currentPreview).reduce((a,b)=>a+b.length,0)} kayıt dağıtıldı.\nExcel dosyaları indirildi.`);
    document.getElementById('confirmBtnStep2').disabled=true;
    document.getElementById('previewAreaStep2').style.display='none';
    currentPreview = { DM:[], ML:[], DONUSUM:[] };
  } catch(err) { alert('Hata: '+err.message); }
  finally { showLoader('Step2', false); }
}
// Dosya yükleme (Step2)
async function loadMainFileStep2(file) {
  showLoader('Step2', true);
  try {
    const buf=await file.arrayBuffer(); const wb=XLSX.read(buf,{type:'array'}); const sheet=wb.Sheets[wb.SheetNames[0]];
    let rows=XLSX.utils.sheet_to_json(sheet,{defval:""}); if(!rows.length) throw new Error('Boş');
    const required=['FeedbackCreatorName','client_name','emp_monitor_ident','CheckListCreated'];
    const first=rows[0]; const missing=required.filter(c=>!(c in first)); if(missing.length) throw new Error(`Eksik sütun: ${missing.join(', ')}`);
    mainDataStep2=rows.filter(r=>r.CheckListCreated===0||r.CheckListCreated==='0');
    document.getElementById('mainStatusStep2').innerHTML=`✅ ${mainDataStep2.length} kayıt (CheckListCreated=0) yüklendi.`;
    document.getElementById('mainStatusStep2').style.color='var(--accent)';
  } catch(err) { document.getElementById('mainStatusStep2').innerHTML=`❌ ${err.message}`; mainDataStep2=[]; }
  finally { showLoader('Step2', false); }
}
async function loadDeletedFileStep2(file) {
  showLoader('Step2',true);
  try {
    const buf=await file.arrayBuffer(); const wb=XLSX.read(buf,{type:'array'}); const sheet=wb.Sheets[wb.SheetNames[0]];
    let rows=XLSX.utils.sheet_to_json(sheet); const cols=Object.keys(rows[0]); const identCol=cols.find(c=>c.toLowerCase()==='ident');
    if(!identCol) throw new Error('Ident sütunu yok');
    deletedIdentsStep2.clear(); rows.forEach(r=>{const v=r[identCol]; if(v) deletedIdentsStep2.add(String(v).trim());});
    document.getElementById('deletedStatusStep2').innerHTML=`✅ ${deletedIdentsStep2.size} silinen ident`;
    document.getElementById('deletedStatusStep2').style.color='var(--accent)';
  } catch(err){ document.getElementById('deletedStatusStep2').innerHTML=`❌ ${err.message}`; }
  finally{ showLoader('Step2',false); }
}
async function loadRefFileStep2(file) {
  showLoader('Step2',true);
  try {
    const buf=await file.arrayBuffer(); const wb=XLSX.read(buf,{type:'array'}); const sheet=wb.Sheets[wb.SheetNames[0]];
    let rows=XLSX.utils.sheet_to_json(sheet);
    const required=['Proje','KaliteDesteği','Dil','Dağıtım Türü'];
    const first=rows[0]; const missing=required.filter(c=>!(c in first));
    if(missing.length) throw new Error(`Eksik: ${missing.join(', ')}`);
    refDataStep2=rows;
    document.getElementById('refStatusStep2').innerHTML=`✅ ${refDataStep2.length} referans`;
    document.getElementById('refStatusStep2').style.color='var(--accent)';
  } catch(err){ document.getElementById('refStatusStep2').innerHTML=`❌ ${err.message}`; }
  finally{ showLoader('Step2',false); }
}
function setupDrop(dropId,inputId,func){ const drop=document.getElementById(dropId); const inp=document.getElementById(inputId); drop.addEventListener('click',()=>inp.click()); drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag');}); drop.addEventListener('dragleave',()=>drop.classList.remove('drag')); drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag'); if(e.dataTransfer.files[0]){ inp.files=e.dataTransfer.files; func(e.dataTransfer.files[0]); } }); }
setupDrop('dropMainStep2','mainFileInputStep2',loadMainFileStep2);
setupDrop('dropDeletedStep2','deletedFileInputStep2',loadDeletedFileStep2);
setupDrop('dropRefStep2','refFileInputStep2',loadRefFileStep2);
document.getElementById('calculateBtnStep2').addEventListener('click', previewAllGroups);
document.getElementById('confirmBtnStep2').addEventListener('click', confirmAndExportAll);
document.getElementById('exportHistoryBtnStep2').addEventListener('click', exportAllHistory);
document.getElementById('importHistoryBtnStep2').addEventListener('click', ()=>document.getElementById('historyImportInputStep2').click());
document.getElementById('historyImportInputStep2').addEventListener('change', e=>{if(e.target.files[0]) importAllHistory(e.target.files[0]);});
document.getElementById('viewHistoryBtnStep2').addEventListener('click', viewHistoryModal);
document.getElementById('clearHistoryBtnStep2').addEventListener('click', clearAllHistory);
loadAllHistories();

// ==================== STEP 3 (Raporlama) - DOĞRU MANTIK ====================
console.log('STEP3 (Raporlama) yükleniyor...');

let reportMainData = [];        // Görüşme listesi: { monitoringId, ident, reviewerNameRaw }
let reportHistory = { DM: [], ML: [], DONUSUM: [] };
let currentReportView = 'proje';  // 'proje', 'projekisi', 'kisi'

// DOM elementleri
const mainFileInput = document.getElementById('mainFileInputStep3');
const historyFileInput = document.getElementById('historyFileInputStep3');
const mainStatus = document.getElementById('mainStatusStep3');
const historyStatus = document.getElementById('historyStatusStep3');
const calculateBtn = document.getElementById('calculateReportBtnStep3');
const exportBtn = document.getElementById('exportReportBtnStep3');
const reportBody = document.getElementById('reportBodyStep3');
const reportHeader = document.getElementById('reportHeaderStep3');
const reportArea = document.getElementById('reportAreaStep3');
const tabProje = document.getElementById('reportTabProje');
const tabProjeKisi = document.getElementById('reportTabProjeKisi');
const tabKisi = document.getElementById('reportTabKisi');

function showLoaderStep3(show) {
  const loader = document.getElementById('loaderStep3');
  if (loader) loader.classList.toggle('visible', show);
}

// İsim formatını düzelt: "Soyisim, İsim" -> "İsim Soyisim"
function formatReviewerName(name) {
  if (!name) return '';
  const parts = name.split(',');
  if (parts.length === 2) {
    const soyisim = parts[0].trim();
    const isim = parts[1].trim();
    return `${isim} ${soyisim}`;
  }
  return name.trim();
}

// Sütun bulma
function findColumnNameStep3(columns, possibleNames) {
  const lowerCols = columns.map(c => String(c).trim().toLowerCase());
  for (let name of possibleNames) {
    const idx = lowerCols.indexOf(name.toLowerCase());
    if (idx !== -1) return columns[idx];
  }
  return null;
}

// Görüşme listesi yükleme (Monitoring ID, Ident, Reviewer Name)
function loadMainExcel(file) {
  if (!file) return;
  console.log('Görüşme dosyası yükleniyor:', file.name);
  showLoaderStep3(true);
  mainStatus.innerHTML = '⏳ Yükleniyor...';
  mainStatus.style.color = 'var(--muted)';

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      let rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (!rows.length) throw new Error('Dosya boş');

      const cols = Object.keys(rows[0]);
      console.log('Mevcut sütunlar:', cols);

      const monCol = findColumnNameStep3(cols, ['Monitoring ID', 'monitoring id', 'MonitoringId']);
      const identCol = findColumnNameStep3(cols, ['Ident', 'ident', 'ID']);
      const reviewerCol = findColumnNameStep3(cols, ['Reviewer Name', 'reviewer name', 'ReviewerName', 'Değerlendirici']);

      if (!monCol) throw new Error(`Monitoring ID sütunu bulunamadı. Mevcut: ${cols.join(', ')}`);
      if (!identCol) throw new Error(`Ident sütunu bulunamadı.`);
      if (!reviewerCol) throw new Error(`Reviewer Name sütunu bulunamadı.`);

      // CheckListCreated kontrolü (varsa)
      const checkCol = cols.find(c => c.toLowerCase().includes('checklistcreated'));

      reportMainData = rows.filter(row => {
        if (checkCol) {
          const val = row[checkCol];
          return val === 0 || val === '0' || val === 0.0;
        }
        return true;
      }).map(row => ({
        monitoringId: String(row[monCol] || '').trim(),
        ident: String(row[identCol] || '').trim(),
        reviewerNameRaw: String(row[reviewerCol] || '').trim(),
        reviewerNameFormatted: formatReviewerName(String(row[reviewerCol] || '').trim())
      }));

      console.log('Yüklenen kayıt sayısı:', reportMainData.length);
      mainStatus.innerHTML = `✅ ${reportMainData.length} kayıt (CheckListCreated=0) yüklendi.`;
      mainStatus.style.color = 'var(--accent)';

      if (reportHistory.DM.length || reportHistory.ML.length || reportHistory.DONUSUM.length) {
        generateReport();
      }
    } catch (err) {
      console.error(err);
      mainStatus.innerHTML = `❌ Hata: ${err.message}`;
      mainStatus.style.color = 'var(--accent3)';
      reportMainData = [];
    } finally {
      showLoaderStep3(false);
    }
  };
  reader.onerror = () => {
    mainStatus.innerHTML = `❌ Dosya okunamadı`;
    showLoaderStep3(false);
  };
  reader.readAsArrayBuffer(file);
}

// Geçmiş JSON yükleme (DM, ML, Dönüşüm Projeleri)
function loadHistoryJSON(file) {
  if (!file) return;
  showLoaderStep3(true);
  historyStatus.innerHTML = '⏳ Yükleniyor...';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && typeof parsed === 'object' && 
          Array.isArray(parsed.DM) && Array.isArray(parsed.ML) && Array.isArray(parsed.DONUSUM)) {
        reportHistory = parsed;
        historyStatus.innerHTML = `✅ Geçmiş yüklendi (DM:${reportHistory.DM.length}, ML:${reportHistory.ML.length}, Dönüşüm:${reportHistory.DONUSUM.length})`;
        historyStatus.style.color = 'var(--accent)';
        if (reportMainData.length) generateReport();
      } else throw new Error('JSON yapısı hatalı (DM, ML, DONUSUM eksik)');
    } catch (err) {
      console.error(err);
      historyStatus.innerHTML = `❌ Geçersiz JSON: ${err.message}`;
      historyStatus.style.color = 'var(--accent3)';
    } finally {
      showLoaderStep3(false);
    }
  };
  reader.onerror = () => {
    historyStatus.innerHTML = `❌ Dosya okunamadı`;
    showLoaderStep3(false);
  };
  reader.readAsText(file);
}

// Rapor oluşturma (Monitoring ID ile emp_monitor_ident eşleşmesi)
function generateReport() {
  if (!reportMainData.length) {
    alert('Önce görüşme listesini yükleyin.');
    return;
  }

  // Dağıtılmış ident'leri ve proje/değerlendirici bilgilerini topla
  // distributedMap: key = monitoringId, value = { client_name, feedbackCreatorName, group }
  const distributedMap = new Map();
  for (let [groupKey, entries] of Object.entries(reportHistory)) {
    let groupName = groupKey;
    if (groupKey === 'DONUSUM') groupName = 'Dönüşüm Projeleri';
    for (let entry of entries) {
      if (entry && Array.isArray(entry.assignments)) {
        for (let ass of entry.assignments) {
          const ident = String(ass.emp_monitor_ident || '').trim();
          if (ident) {
            distributedMap.set(ident, {
              client_name: ass.client_name || '',
              feedbackCreatorName: ass.FeedbackCreatorName || '',
              group: groupName
            });
          }
        }
      }
    }
  }

  // Görüşme listesindeki her kayıt için durumu belirle
  const enrichedData = reportMainData.map(rec => {
    const distInfo = distributedMap.get(rec.monitoringId);
    return {
      monitoringId: rec.monitoringId,
      ident: rec.ident,
      reviewerName: rec.reviewerNameFormatted,
      isDistributed: !!distInfo,
      client_name: distInfo ? distInfo.client_name : '',
      feedbackCreatorName: distInfo ? distInfo.feedbackCreatorName : '',
      group: distInfo ? distInfo.group : ''
    };
  });

  // Raporu oluştur (seçilen görünüme göre)
  if (currentReportView === 'proje') {
    // Proje Bazlı: client_name bazında
    const projMap = new Map();
    for (let rec of enrichedData) {
      const proj = rec.client_name;
      if (!proj) continue;
      if (!projMap.has(proj)) projMap.set(proj, { total: 0, distributed: 0 });
      const stat = projMap.get(proj);
      stat.total++;
      if (rec.isDistributed) stat.distributed++;
    }
    const headers = ['Proje Adı', 'Dağıtılan Adet', 'Bekleyen Adet', 'Toplam'];
    const rows = Array.from(projMap.entries()).map(([proj, stat]) => [proj, stat.distributed, stat.total - stat.distributed, stat.total]);
    renderReportTable(headers, rows);
  } 
  else if (currentReportView === 'projekisi') {
    // Proje + Değerlendirici Bazlı
    const keyMap = new Map();
    for (let rec of enrichedData) {
      const proj = rec.client_name;
      const kisi = rec.feedbackCreatorName;
      if (!proj || !kisi) continue;
      const key = `${proj}|${kisi}`;
      if (!keyMap.has(key)) keyMap.set(key, { proje: proj, kisi: kisi, total: 0, distributed: 0 });
      const stat = keyMap.get(key);
      stat.total++;
      if (rec.isDistributed) stat.distributed++;
    }
    const headers = ['Proje', 'Değerlendirici', 'Dağıtılan Adet', 'Bekleyen Adet', 'Toplam'];
    const rows = Array.from(keyMap.values()).map(v => [v.proje, v.kisi, v.distributed, v.total - v.distributed, v.total]);
    renderReportTable(headers, rows);
  } 
  else {
    // Değerlendirici Bazlı (görüşme listesindeki Reviewer Name)
    const kisiMap = new Map();
    for (let rec of enrichedData) {
      const kisi = rec.reviewerName;
      if (!kisi) continue;
      if (!kisiMap.has(kisi)) kisiMap.set(kisi, { total: 0, distributed: 0 });
      const stat = kisiMap.get(kisi);
      stat.total++;
      if (rec.isDistributed) stat.distributed++;
    }
    const headers = ['Değerlendirici (Reviewer Name)', 'Dağıtılan Adet', 'Bekleyen Adet', 'Toplam'];
    const rows = Array.from(kisiMap.entries()).map(([kisi, stat]) => [kisi, stat.distributed, stat.total - stat.distributed, stat.total]);
    renderReportTable(headers, rows);
  }

  reportArea.style.display = 'block';
  exportBtn.disabled = false;
  tabProje.style.display = 'inline-flex';
  tabProjeKisi.style.display = 'inline-flex';
  tabKisi.style.display = 'inline-flex';
}

function renderReportTable(headers, rows) {
  reportHeader.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
  reportBody.innerHTML = rows.map(row => `<td>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
  if (rows.length === 0) {
    reportBody.innerHTML = '<td><td colspan="10">Henüz veri yok (projeler dağıtılmamış olabilir)</td></tr>';
  }
}

// Excel export (tüm raporlar + RAW datalar)
function exportReport() {
  if (!reportMainData.length) {
    alert('Rapor verisi yok, önce "Raporu Oluştur" butonuna tıklayın.');
    return;
  }

  const workbook = XLSX.utils.book_new();

  // 1. Mevcut görünümdeki rapor tablosu
  const headers = Array.from(reportHeader.querySelectorAll('th')).map(th => th.innerText);
  const dataRows = [];
  document.querySelectorAll('#reportBodyStep3 tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length) {
      const row = {};
      cells.forEach((cell, idx) => row[headers[idx]] = cell.innerText);
      dataRows.push(row);
    }
  });
  let sheetName = currentReportView === 'proje' ? 'Proje Bazlı' : (currentReportView === 'projekisi' ? 'Proje+Değerlendirici' : 'Değerlendirici Bazlı');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dataRows), sheetName);

  // 2. Proje Bazlı rapor (her zaman)
  const projMap = new Map();
  const enrichedForExport = reportMainData.map(rec => {
    const distInfo = (() => {
      for (let g of ['DM', 'ML', 'DONUSUM']) {
        for (let entry of reportHistory[g] || []) {
          for (let ass of entry.assignments || []) {
            if (String(ass.emp_monitor_ident).trim() === rec.monitoringId) return ass;
          }
        }
      }
      return null;
    })();
    return {
      monitoringId: rec.monitoringId,
      ident: rec.ident,
      reviewerName: rec.reviewerNameFormatted,
      isDistributed: !!distInfo,
      client_name: distInfo ? distInfo.client_name : '',
      feedbackCreatorName: distInfo ? distInfo.FeedbackCreatorName : ''
    };
  });
  for (let rec of enrichedForExport) {
    if (!rec.client_name) continue;
    if (!projMap.has(rec.client_name)) projMap.set(rec.client_name, { total: 0, dist: 0 });
    const s = projMap.get(rec.client_name);
    s.total++;
    if (rec.isDistributed) s.dist++;
  }
  const projRows = Array.from(projMap.entries()).map(([p, s]) => ({ 'Proje': p, 'Dağıtılan': s.dist, 'Bekleyen': s.total - s.dist, 'Toplam': s.total }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(projRows), 'Proje_Bazli_Rapor');

  // 3. Proje+Değerlendirici rapor
  const pkMap = new Map();
  for (let rec of enrichedForExport) {
    if (!rec.client_name || !rec.feedbackCreatorName) continue;
    const key = `${rec.client_name}|${rec.feedbackCreatorName}`;
    if (!pkMap.has(key)) pkMap.set(key, { proje: rec.client_name, kisi: rec.feedbackCreatorName, total: 0, dist: 0 });
    const s = pkMap.get(key);
    s.total++;
    if (rec.isDistributed) s.dist++;
  }
  const pkRows = Array.from(pkMap.values()).map(v => ({ 'Proje': v.proje, 'Değerlendirici': v.kisi, 'Dağıtılan': v.dist, 'Bekleyen': v.total - v.dist, 'Toplam': v.total }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pkRows), 'Proje_Değerlendirici_Rapor');

  // 4. Değerlendirici bazlı rapor (görüşme listesindeki Reviewer Name)
  const kisiMap = new Map();
  for (let rec of enrichedForExport) {
    const kisi = rec.reviewerName;
    if (!kisi) continue;
    if (!kisiMap.has(kisi)) kisiMap.set(kisi, { total: 0, dist: 0 });
    const s = kisiMap.get(kisi);
    s.total++;
    if (rec.isDistributed) s.dist++;
  }
  const kisiRows = Array.from(kisiMap.entries()).map(([k, s]) => ({ 'Değerlendirici': k, 'Dağıtılan': s.dist, 'Bekleyen': s.total - s.dist, 'Toplam': s.total }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(kisiRows), 'Değerlendirici_Rapor');

  // 5. RAW dağıtım detayları (tüm dağıtılan kayıtlar)
  const rawDist = [];
  for (let [g, entries] of Object.entries(reportHistory)) {
    let groupName = g === 'DM' ? 'DM' : (g === 'ML' ? 'ML' : 'Dönüşüm Projeleri');
    for (let entry of entries) {
      for (let ass of entry.assignments || []) {
        rawDist.push({
          'Grup': groupName,
          'Hafta': entry.week,
          'Dağıtım Tarihi': entry.date ? new Date(entry.date).toLocaleString() : '',
          'Değerlendirici (FeedbackCreatorName)': ass.FeedbackCreatorName || '',
          'Proje (client_name)': ass.client_name || '',
          'Ident (emp_monitor_ident)': ass.emp_monitor_ident || '',
          'Dil': ass.dil || '',
          'Dağıtım Türü': ass.dagitimTuru || ''
        });
      }
    }
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rawDist), 'RAW_Dagıtım_Detay');

  // 6. Görüşme listesi (RAW)
  const interviewRaw = reportMainData.map(rec => ({
    'Monitoring ID': rec.monitoringId,
    'Ident': rec.ident,
    'Reviewer Name (Orijinal)': rec.reviewerNameRaw,
    'Reviewer Name (Düzenlenmiş)': rec.reviewerNameFormatted
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(interviewRaw), 'RAW_Gorusme_Listesi');

  XLSX.writeFile(workbook, `Feedback_Rapor_${formatDateForFilename()}.xlsx`);
}

// Görünüm değiştirme
function setView(view) {
  currentReportView = view;
  [tabProje, tabProjeKisi, tabKisi].forEach(btn => btn.classList.remove('btn-primary'));
  if (view === 'proje') tabProje.classList.add('btn-primary');
  else if (view === 'projekisi') tabProjeKisi.classList.add('btn-primary');
  else tabKisi.classList.add('btn-primary');
  if (reportMainData.length) generateReport();
}

// Event kurulumu
function initStep3() {
  const dropMain = document.getElementById('dropMainStep3');
  const dropHistory = document.getElementById('dropHistoryStep3');
  if (!dropMain || !dropHistory) {
    console.error('Drop alanları bulunamadı');
    return;
  }
  dropMain.addEventListener('click', () => mainFileInput.click());
  dropHistory.addEventListener('click', () => historyFileInput.click());
  mainFileInput.addEventListener('change', (e) => { if (e.target.files.length) loadMainExcel(e.target.files[0]); });
  historyFileInput.addEventListener('change', (e) => { if (e.target.files.length) loadHistoryJSON(e.target.files[0]); });
  dropMain.addEventListener('dragover', e => e.preventDefault());
  dropMain.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files.length) loadMainExcel(e.dataTransfer.files[0]);
  });
  dropHistory.addEventListener('dragover', e => e.preventDefault());
  dropHistory.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files.length) loadHistoryJSON(e.dataTransfer.files[0]);
  });
}

calculateBtn.addEventListener('click', generateReport);
exportBtn.addEventListener('click', exportReport);
tabProje.addEventListener('click', () => setView('proje'));
tabProjeKisi.addEventListener('click', () => setView('projekisi'));
tabKisi.addEventListener('click', () => setView('kisi'));

// Başlangıç durumu
tabProje.style.display = 'none';
tabProjeKisi.style.display = 'none';
tabKisi.style.display = 'none';
reportArea.style.display = 'none';
exportBtn.disabled = true;
initStep3();
