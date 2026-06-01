// ==================== STATE ====================
let currentData = [];      // Orijinal satırlar (object array)
let errorRows = [];        // Hata içeren satırlar için indeks ve detay

// ==================== DOM Elements ====================
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const loaderBar = document.getElementById('loaderBar');
const statsContainer = document.getElementById('statsContainer');
const errorsSection = document.getElementById('errorsSection');
const totalCountSpan = document.getElementById('totalCount');
const errorCountSpan = document.getElementById('errorCount');
const validCountSpan = document.getElementById('validCount');
const errorTableBody = document.getElementById('errorTableBody');
const resetBtn = document.getElementById('resetBtn');
const clearBtn = document.getElementById('clearBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');

// ==================== Helper Functions ====================
// Tema yönetimi
function initTheme() {
  const isDark = localStorage.getItem('theme') === 'dark';
  if (isDark) document.body.classList.add('dark');
  else document.body.classList.remove('dark');
}
function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
}
themeToggleBtn.addEventListener('click', toggleTheme);
initTheme();

// Monitoring ID kontrolü: tam 8 haneli sayı (string olarak kontrol)
function isValidMonitoringId(value) {
  if (value === null || value === undefined) return false;
  let str = String(value).trim();
  if (str === "") return false;
  // Regex: sadece rakamlar ve tam 8 karakter
  return /^\d{8}$/.test(str);
}

// Hata nedeni mesajı
function getErrorReason(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "Boş veya null değer";
  let str = String(value).trim();
  if (!/^\d+$/.test(str)) return "Sayısal karakter dışında içerik (harf/özel karakter)";
  if (str.length !== 8) return `${str.length} haneli (8 gerekli)`;
  return "Geçersiz format";
}

// Dinamik link oluşturma (Ident kolonu)
function buildDynamicLink(identValue) {
  if (!identValue || String(identValue).trim() === "") return null;
  const baseUrl = "https://sebra.ccms.teleperformance.com/ccms-bin/console/tops/checklist.pl";
  const params = new URLSearchParams({
    frmTarget: "CHECKLIST",
    checklist_ident: String(identValue).trim(),
    frmOption: "OPTION"
  });
  return `${baseUrl}?${params.toString()}`;
}

// Dosya okuma ve işleme
async function processFile(file) {
  if (!file) return;
  
  // Loading göster
  loaderBar.classList.add('visible');
  statsContainer.style.display = 'none';
  errorsSection.style.display = 'none';
  errorRows = [];
  currentData = [];
  
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, defval: "" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    // json output: header'ları otomatik al
    let rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
    
    if (!rows || rows.length === 0) {
      alert("Dosyada veri bulunamadı veya başlık satırı okunamadı.");
      loaderBar.classList.remove('visible');
      return;
    }
    
    // Gerekli sütunların varlığını kontrol et
    const firstRow = rows[0];
    if (!firstRow.hasOwnProperty('Monitoring ID') || !firstRow.hasOwnProperty('Ident')) {
      alert("Dosyada 'Monitoring ID' veya 'Ident' sütunu bulunamadı. Lütfen sütun adlarını kontrol edin.");
      loaderBar.classList.remove('visible');
      return;
    }
    
    currentData = rows;
    
    // Hata tespiti
    const errors = [];
    rows.forEach((row, idx) => {
      const monitoringId = row['Monitoring ID'];
      const ident = row['Ident'];
      const isValid = isValidMonitoringId(monitoringId);
      if (!isValid) {
        errors.push({
          rowNumber: idx + 2,  // +2 çünkü indeks 0 dan başlar + başlık satırı
          monitoringIdRaw: monitoringId !== undefined && monitoringId !== null ? String(monitoringId) : "(boş)",
          identRaw: ident !== undefined && ident !== null ? String(ident) : "",
          reason: getErrorReason(monitoringId)
        });
      }
    });
    
    errorRows = errors;
    renderStatsAndTable();
    
  } catch (err) {
    console.error("Dosya işleme hatası:", err);
    alert("Dosya okunurken bir hata oluştu. Lütfen formatı kontrol edin (Excel/CSV).");
  } finally {
    loaderBar.classList.remove('visible');
  }
}

// İstatistikleri ve tabloyu render et
function renderStatsAndTable() {
  const total = currentData.length;
  const errorCount = errorRows.length;
  const validCount = total - errorCount;
  
  totalCountSpan.textContent = total;
  errorCountSpan.textContent = errorCount;
  validCountSpan.textContent = validCount;
  
  statsContainer.style.display = 'flex';
  
  if (errorCount === 0) {
    errorsSection.style.display = 'block';
    errorTableBody.innerHTML = `<tr><td colspan="5" class="empty-state">✅ Tüm Monitoring ID değerleri geçerli! (8 haneli sayı)</td></tr>`;
    return;
  }
  
  errorsSection.style.display = 'block';
  
  // Tablo satırlarını oluştur
  let html = '';
  errorRows.forEach(err => {
    const link = buildDynamicLink(err.identRaw);
    const linkHtml = link 
      ? `<a href="${link}" target="_blank" rel="noopener noreferrer" class="link-btn">🔗 İncele</a>`
      : `<span class="badge-error">Ident eksik</span>`;
    
    html += `
      <tr>
        <td>${err.rowNumber}</td>
        <td><code>${escapeHtml(err.monitoringIdRaw)}</code></td>
        <td><code>${escapeHtml(err.identRaw) || "—"}</code></td>
        <td><span class="badge-error">⚠️ ${escapeHtml(err.reason)}</span></td>
        <td>${linkHtml}</td>
      </tr>
    `;
  });
  errorTableBody.innerHTML = html;
}

// Escape HTML (XSS koruması)
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
    return c;
  });
}

// Reset / Temizleme
function resetAll() {
  currentData = [];
  errorRows = [];
  fileInput.value = '';
  statsContainer.style.display = 'none';
  errorsSection.style.display = 'none';
  errorTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">Henüz veri yok</td></tr>';
  totalCountSpan.textContent = '0';
  errorCountSpan.textContent = '0';
  validCountSpan.textContent = '0';
  loaderBar.classList.remove('visible');
}

// ==================== EVENT HANDLERS ====================
// Dosya seçme / sürükle bırak
fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    processFile(e.target.files[0]);
  }
});

// Sürükle bırak alanı
uploadArea.addEventListener('click', () => {
  fileInput.click();
});

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const droppedFile = e.dataTransfer.files[0];
    // Dosya tipi kontrolü
    const validExt = /\.(xlsx|xls|csv)$/i;
    if (validExt.test(droppedFile.name)) {
      fileInput.files = e.dataTransfer.files;
      processFile(droppedFile);
    } else {
      alert("Lütfen .xlsx, .xls veya .csv uzantılı bir dosya yükleyin.");
    }
  }
});

// Reset butonları
resetBtn.addEventListener('click', resetAll);
clearBtn.addEventListener('click', resetAll);

// Sayfa ilk açılışta boş durum
resetAll();
