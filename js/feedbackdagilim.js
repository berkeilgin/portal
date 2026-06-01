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

// ==================== STEP 1 (Monitoring ID + duplicate - tüm tekrarları göster) ====================
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
    const errors = [];
    // duplicate tespiti için: her monitoring ID'nin görüldüğü tüm satır numaralarını tut
    const idOccurrences = new Map(); // key: mid değeri, value: array of rowNumbers
    rows.forEach((row, idx) => {
      const mid = row[monCol];
      if (mid != null && String(mid).trim() !== "") {
        const midStr = String(mid).trim();
        if (!idOccurrences.has(midStr)) idOccurrences.set(midStr, []);
        idOccurrences.get(midStr).push(idx + 2);
      }
    });
    // Her satır için hata kontrolü
    rows.forEach((row, idx) => {
      const mid = row[monCol];
      const ident = row[identCol];
      const rowNum = idx + 2;
      let reason = null;
      if (!isValidMonitoringId(mid)) {
        reason = getErrorReason(mid);
      } else {
        const midStr = String(mid).trim();
        const occurrences = idOccurrences.get(midStr);
        if (occurrences && occurrences.length > 1) {
          // duplicate var
          reason = `Tekrar eden ID (${occurrences.filter(r => r !== rowNum).join(', ')}. satırlarda da var)`;
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
        html += `<tr>
          <td>${err.rowNumber}</td>
          <td><code>${escapeHtml(err.monitoringIdRaw)}</code></td>
          <td><code>${escapeHtml(err.identRaw)||"—"}</code></td>
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

// ==================== STEP 2 (DM, ML, Dönüşüm + özel kurallar) - kısaltılmış, aynı çalışır ====================
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

// ==================== STEP 3 (Raporlama) - DÜZELTİLMİŞ, DOSYA YÜKLEME ÇALIŞIR ====================
let reportMainData = [];
let reportHistory = { DM: [], ML: [], DONUSUM: [] };
const mainFileInputStep3 = document.getElementById('mainFileInputStep3');
const historyFileInputStep3 = document.getElementById('historyFileInputStep3');
const mainStatusStep3 = document.getElementById('mainStatusStep3');
const historyStatusStep3 = document.getElementById('historyStatusStep3');
const calculateReportBtn = document.getElementById('calculateReportBtnStep3');
const exportReportBtn = document.getElementById('exportReportBtnStep3');
const reportBody = document.getElementById('reportBodyStep3');
const reportArea = document.getElementById('reportAreaStep3');

async function loadMainForReport(file) {
  if (!file) return;
  showLoader('Step3', true);
  mainStatusStep3.textContent = 'Yükleniyor...';
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    let rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rows.length) throw new Error('Dosya boş');
    reportMainData = rows.filter(r => r.CheckListCreated === 0 || r.CheckListCreated === '0');
    mainStatusStep3.innerHTML = `✅ ${reportMainData.length} kayıt (CheckListCreated=0) yüklendi.`;
    mainStatusStep3.style.color = 'var(--accent)';
  } catch (err) {
    mainStatusStep3.innerHTML = `❌ Hata: ${err.message}`;
    reportMainData = [];
  } finally {
    showLoader('Step3', false);
  }
}

function loadHistoryForReport(file) {
  if (!file) return;
  showLoader('Step3', true);
  historyStatusStep3.textContent = 'Yükleniyor...';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && typeof parsed === 'object' && 
          Array.isArray(parsed.DM) && Array.isArray(parsed.ML) && Array.isArray(parsed.DONUSUM)) {
        reportHistory = parsed;
        historyStatusStep3.innerHTML = `✅ Geçmiş yüklendi (DM: ${reportHistory.DM.length}, ML: ${reportHistory.ML.length}, Dönüşüm: ${reportHistory.DONUSUM.length} hafta)`;
        historyStatusStep3.style.color = 'var(--accent)';
      } else {
        throw new Error('JSON yapısı hatalı (DM, ML, DONUSUM alanları olmalı)');
      }
    } catch (err) {
      historyStatusStep3.innerHTML = `❌ Geçersiz JSON: ${err.message}`;
      reportHistory = { DM: [], ML: [], DONUSUM: [] };
    } finally {
      showLoader('Step3', false);
    }
  };
  reader.onerror = () => {
    historyStatusStep3.innerHTML = `❌ Dosya okunamadı`;
    showLoader('Step3', false);
  };
  reader.readAsText(file);
}

function generateReport() {
  if (!reportMainData.length) {
    alert('Lütfen önce görüşme listesini yükleyin (Step3 - Görüşme Listesi).');
    return;
  }
  const allDistributedIdents = new Set();
  const groups = ['DM', 'ML', 'DONUSUM'];
  for (let g of groups) {
    const hist = reportHistory[g] || [];
    for (let entry of hist) {
      if (entry && Array.isArray(entry.distributedIdents)) {
        entry.distributedIdents.forEach(id => { if (id) allDistributedIdents.add(String(id).trim()); });
      }
    }
  }
  const projectStats = new Map();
  for (let rec of reportMainData) {
    const proj = rec.client_name;
    if (!proj) continue;
    if (!projectStats.has(proj)) projectStats.set(proj, { total: 0, distributed: 0 });
    const stat = projectStats.get(proj);
    stat.total++;
    const ident = String(rec.emp_monitor_ident || '').trim();
    if (ident && allDistributedIdents.has(ident)) stat.distributed++;
  }
  reportBody.innerHTML = '';
  if (projectStats.size === 0) {
    const emptyRow = reportBody.insertRow();
    emptyRow.insertCell(0).colSpan = 4;
    emptyRow.insertCell(0).textContent = 'Henüz proje bazlı veri yok.';
    reportArea.style.display = 'block';
    exportReportBtn.disabled = true;
    return;
  }
  for (let [proj, stat] of projectStats.entries()) {
    const row = reportBody.insertRow();
    row.insertCell(0).textContent = proj;
    row.insertCell(1).textContent = stat.distributed;
    row.insertCell(2).textContent = stat.total - stat.distributed;
    row.insertCell(3).textContent = stat.total;
  }
  reportArea.style.display = 'block';
  exportReportBtn.disabled = false;
}

function exportReportExcel() {
  const rows = [];
  const tableRows = reportBody.querySelectorAll('tr');
  for (let tr of tableRows) {
    const cells = tr.querySelectorAll('td');
    if (cells.length === 4) {
      rows.push({
        'Proje Adı': cells[0].innerText,
        'Dağıtılan Adet': parseInt(cells[1].innerText) || 0,
        'Bekleyen Adet (Giriş Yapılmamış)': parseInt(cells[2].innerText) || 0,
        'Toplam (CheckListCreated=0)': parseInt(cells[3].innerText) || 0
      });
    }
  }
  if (rows.length === 0) {
    alert('Rapor verisi yok, önce "Raporu Oluştur" butonuna tıklayın.');
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ProjeBazliRapor');
  XLSX.writeFile(wb, `Feedback_Rapor_${formatDateForFilename()}.xlsx`);
}

function setupDropStep3(dropId, inputId, loadFunc) {
  const drop = document.getElementById(dropId);
  const inp = document.getElementById(inputId);
  if (!drop || !inp) return;
  // Temizleme
  drop.removeEventListener('click', drop.clickHandler);
  drop.removeEventListener('dragover', drop.dragOverHandler);
  drop.removeEventListener('dragleave', drop.dragLeaveHandler);
  drop.removeEventListener('drop', drop.dropHandler);
  // Yeni handler'lar
  const clickHandler = () => inp.click();
  const dragOverHandler = e => { e.preventDefault(); drop.classList.add('drag'); };
  const dragLeaveHandler = () => drop.classList.remove('drag');
  const dropHandler = e => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      inp.files = e.dataTransfer.files;
      loadFunc(e.dataTransfer.files[0]);
    }
  };
  drop.addEventListener('click', clickHandler);
  drop.addEventListener('dragover', dragOverHandler);
  drop.addEventListener('dragleave', dragLeaveHandler);
  drop.addEventListener('drop', dropHandler);
  // Kaydet
  drop.clickHandler = clickHandler;
  drop.dragOverHandler = dragOverHandler;
  drop.dragLeaveHandler = dragLeaveHandler;
  drop.dropHandler = dropHandler;
  // input değişikliği
  inp.onchange = e => { if (e.target.files && e.target.files[0]) loadFunc(e.target.files[0]); };
}
setupDropStep3('dropMainStep3', 'mainFileInputStep3', loadMainForReport);
setupDropStep3('dropHistoryStep3', 'historyFileInputStep3', loadHistoryForReport);
if (calculateReportBtn) calculateReportBtn.addEventListener('click', generateReport);
if (exportReportBtn) exportReportBtn.addEventListener('click', exportReportExcel);

reportArea.style.display = 'none';
exportReportBtn.disabled = true;
