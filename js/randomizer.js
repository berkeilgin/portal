// ==================== STATE ====================
let uploadedData = [];
let selectedRandomData = [];
let manualLogs = [];
let usedNumbers = new Set();

// ==================== DOM ELEMENTS ====================
const excelDrop = document.getElementById('excelDrop');
const excelFileInput = document.getElementById('excelFileInput');
const fileInfo = document.getElementById('fileInfo');
const fileNameSpan = document.getElementById('fileName');
const fileStatsSpan = document.getElementById('fileStats');
const clearFileBtn = document.getElementById('clearFileBtn');
const randomBtn = document.getElementById('randomBtn');
const exportBtn = document.getElementById('exportBtn');
const randomCountInput = document.getElementById('randomCount');
const excelStatus = document.getElementById('excelStatus');

const manualBtn = document.getElementById('manualBtn');
const maxNumberInput = document.getElementById('maxNumber');
const manualResultBox = document.getElementById('manualResultBox');
const manualResultSpan = document.getElementById('manualResult');
const logList = document.getElementById('logList');
const clearLogBtn = document.getElementById('clearLogBtn');

// ==================== TAB SWITCHING ====================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(tabId + 'Tab').classList.add('active');
  });
});

// ==================== FILE UPLOAD ====================
excelDrop.addEventListener('click', () => excelFileInput.click());
excelDrop.addEventListener('dragover', e => { e.preventDefault(); excelDrop.classList.add('drag'); });
excelDrop.addEventListener('dragleave', () => excelDrop.classList.remove('drag'));
excelDrop.addEventListener('drop', e => {
  e.preventDefault();
  excelDrop.classList.remove('drag');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
excelFileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    uploadedData = XLSX.utils.sheet_to_json(sheet);
    fileNameSpan.textContent = file.name;
    fileStatsSpan.textContent = `${uploadedData.length} kayıt`;
    fileInfo.classList.add('visible');
    excelDrop.classList.add('has-file');
    excelDrop.innerHTML = '✅ Dosya yüklendi';
    excelStatus.textContent = `✅ ${uploadedData.length} kayıt yüklendi`;
    excelStatus.className = 'status-bar ok';
    exportBtn.disabled = true;
    selectedRandomData = [];
  };
  reader.readAsArrayBuffer(file);
}

clearFileBtn.addEventListener('click', () => {
  uploadedData = [];
  selectedRandomData = [];
  excelFileInput.value = '';
  fileInfo.classList.remove('visible');
  excelDrop.classList.remove('has-file');
  excelDrop.innerHTML = '📥 Excel / CSV dosyası sürükleyin veya tıklayın';
  excelStatus.textContent = 'Bekleniyor…';
  excelStatus.className = 'status-bar';
  exportBtn.disabled = true;
});

// ==================== EXCEL RANDOM ====================
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

randomBtn.addEventListener('click', () => {
  if (!uploadedData.length) {
    excelStatus.textContent = '⚠️ Önce dosya yükleyin';
    excelStatus.className = 'status-bar err';
    return;
  }
  const count = parseInt(randomCountInput.value);
  if (!count || count < 1) {
    excelStatus.textContent = '⚠️ Geçerli sayı girin';
    excelStatus.className = 'status-bar err';
    return;
  }
  selectedRandomData = shuffle(uploadedData).slice(0, count);
  excelStatus.textContent = `🎯 ${selectedRandomData.length} kayıt seçildi`;
  excelStatus.className = 'status-bar ok';
  exportBtn.disabled = false;
});

exportBtn.addEventListener('click', () => {
  if (!selectedRandomData.length) {
    excelStatus.textContent = '⚠️ Önce seçim yapın';
    excelStatus.className = 'status-bar err';
    return;
  }
  const ws = XLSX.utils.json_to_sheet(selectedRandomData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Random');
  XLSX.writeFile(wb, 'random_selection.xlsx');
  excelStatus.textContent = '✅ Excel indirildi';
  excelStatus.className = 'status-bar ok';
});

// ==================== MANUAL RANDOM ====================
function renderManualLogs() {
  if (manualLogs.length === 0) {
    logList.innerHTML = '<div style="color: var(--muted); text-align: center; padding: 20px;">Henüz seçim yapılmadı.</div>';
    return;
  }
  logList.innerHTML = manualLogs.map(log => `
    <div class="log-item">
      <strong>🎧 ${log.num}</strong>
      <span>${log.time}</span>
    </div>
  `).join('');
}

manualBtn.addEventListener('click', () => {
  const max = parseInt(maxNumberInput.value);
  if (!max || max < 1) {
    alert('Geçerli maksimum değer girin');
    return;
  }
  if (usedNumbers.size >= max) {
    alert('Tüm sayılar kullanıldı! Geçmişi temizleyin.');
    return;
  }
  let rand;
  do {
    rand = Math.floor(Math.random() * max) + 1;
  } while (usedNumbers.has(rand));
  usedNumbers.add(rand);

  manualResultBox.style.display = 'block';
  manualResultSpan.textContent = rand;
  // Animasyonu yeniden tetikle
  manualResultSpan.style.animation = 'none';
  manualResultSpan.offsetHeight; // reflow
  manualResultSpan.style.animation = 'popIn .3s cubic-bezier(.34,1.56,.64,1)';

  const time = new Date().toLocaleTimeString('tr-TR');
  manualLogs.unshift({ num: rand, time });
  renderManualLogs();
});

clearLogBtn.addEventListener('click', () => {
  manualLogs = [];
  usedNumbers.clear();
  renderManualLogs();
  manualResultBox.style.display = 'none';
});