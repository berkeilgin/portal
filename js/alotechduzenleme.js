// ==================== STATE ====================
let summaryFiles = [];
let detailFiles = [];
let nextId = 1;

// Preview için geçici veri
let currentPreviewFile = null;
let currentPreviewCategory = '';
let currentPreviewRows = 20;

// Loading overlay
function showLoading(show, text = 'Dosyalar yükleniyor, lütfen bekleyin...') {
  const overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  if (show) {
    const textEl = overlay.querySelector('.loading-text');
    if (textEl) textEl.textContent = text;
    overlay.classList.add('active');
  } else {
    overlay.classList.remove('active');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('Alotech Düzenleme başladı');
  initTheme();
  setupDropZone('summaryDropZone', 'summaryFileInput', 'summary');
  setupDropZone('detailDropZone', 'detailFileInput', 'detail');
  
  document.getElementById('resetAllBtn')?.addEventListener('click', resetEverything);
  document.getElementById('exportAllDataBtn')?.addEventListener('click', exportAllData);
  
  renderCategoryUI('summary');
  renderCategoryUI('detail');
});

function showGlobalMessage(msg, type = 'ok') {
  const statusDiv = document.getElementById('globalStatus');
  if (!statusDiv) return;
  statusDiv.textContent = msg;
  statusDiv.className = `status-bar ${type}`;
  statusDiv.style.display = 'block';
  setTimeout(() => { if (statusDiv.style.display === 'block') statusDiv.style.display = 'none'; }, 3500);
}

// UTF-8 decode
function decodeUTF8(buffer) {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(buffer);
}

// Otomatik delimiter algılama
function detectDelimiter(firstLine) {
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return semicolonCount >= commaCount ? ';' : ',';
}

// CSV ayrıştırma (tırnak duyarlı)
function parseCSVAdvanced(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = detectDelimiter(lines[0]);
  const result = [];
  for (const line of lines) {
    const row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        row.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
    row.push(field);
    result.push(row);
  }
  return result;
}

// Trim & Clean fonksiyonu - satır kaymasına neden olan karakterleri temizler
function trimAndClean(str) {
  if (typeof str !== 'string') return str;
  // Normalize line breaks (CRLF, CR -> LF), remove control characters but keep Turkish chars
  let cleaned = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Replace multiple spaces/tabs with single space
  cleaned = cleaned.replace(/[ \t]+/g, ' ').trim();
  // Remove any non-printable characters except newlines (but newlines already handled)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned;
}

// Dosya ayrıştırma - Degerlendirme_Notu için trim&clean
async function parseFileToData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let dataRows = [];
        let headers = [];
        if (file.name.match(/\.xlsx?$/i)) {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
          if (!json || json.length === 0) throw new Error('Excel dosyası boş');
          headers = json[0].map(cell => (cell === undefined || cell === null) ? `Sütun_${Math.random()}` : String(cell));
          dataRows = json.slice(1).map(row => headers.map((_, idx) => {
            const val = row[idx];
            return (val !== undefined && val !== null) ? String(val) : "";
          }));
        } else {
          let text;
          if (e.target.result instanceof ArrayBuffer) {
            text = decodeUTF8(e.target.result);
          } else {
            text = e.target.result;
          }
          const rows = parseCSVAdvanced(text);
          if (rows.length === 0) throw new Error('CSV dosyası boş');
          headers = rows[0].map(h => (h === undefined || h === '') ? `Kolon_${Math.random()}` : h);
          dataRows = rows.slice(1).map(r => {
            while (r.length < headers.length) r.push('');
            return r.slice(0, headers.length).map(cell => cell || "");
          });
        }
        
        // "Degerlendirme_Notu" sütununu bul ve trim&clean uygula
        const degerlendirmeIndex = headers.findIndex(h => h === 'Degerlendirme_Notu' || h === 'Değerlendirme Notu');
        if (degerlendirmeIndex !== -1) {
          for (const row of dataRows) {
            if (row[degerlendirmeIndex]) {
              row[degerlendirmeIndex] = trimAndClean(row[degerlendirmeIndex]);
            }
          }
        }
        
        // Boş satırları temizle
        const nonEmptyRows = dataRows.filter(r => r.some(cell => cell && cell.trim() !== ''));
        resolve({
          name: file.name,
          baseName: file.name.replace(/\.[^/.]+$/, ''),
          headers: headers,
          data: nonEmptyRows,
          rowCount: nonEmptyRows.length
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Dosya okuma hatası'));
    if (file.name.match(/\.xlsx?$/i)) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}

// Puan'ı sayıya çevir (digit 0 formatında)
function parsePuanValue(val) {
  if (val === undefined || val === null || val === '') return 0;
  let str = String(val).trim().replace(',', '.');
  let num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// Iptal kontrolü (Evet ise true döner)
function isIptal(row, headers) {
  const iptalIndex = headers.findIndex(h => h === 'Iptal' || h === 'İptal');
  if (iptalIndex === -1) return false;
  const val = row[iptalIndex];
  return val && String(val).trim().toLowerCase() === 'evet';
}

// Dosya ekleme
async function addFilesToCategory(category, fileList) {
  const targetArray = category === 'summary' ? summaryFiles : detailFiles;
  showLoading(true, `${category === 'summary' ? 'Özet' : 'Detay'} dosyaları yükleniyor...`);
  let addedCount = 0;
  for (const file of fileList) {
    try {
      const parsed = await parseFileToData(file);
      const existingIndex = targetArray.findIndex(f => f.name === parsed.name);
      const newFile = { id: nextId++, ...parsed };
      if (existingIndex !== -1) targetArray[existingIndex] = newFile;
      else targetArray.push(newFile);
      showGlobalMessage(`✅ ${parsed.name} (${parsed.rowCount} satır)`, 'ok');
      addedCount++;
    } catch (err) {
      showGlobalMessage(`❌ ${file.name}: ${err.message}`, 'err');
    }
  }
  showLoading(false);
  if (addedCount > 0) renderCategoryUI(category);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// Preview Modal
function openPreviewModal(file, category) {
  currentPreviewFile = file;
  currentPreviewCategory = category;
  currentPreviewRows = 20;
  document.getElementById('previewTitle').textContent = `${category === 'summary' ? 'Özet' : 'Detay'} - ${file.name}`;
  updatePreviewTable();
  document.getElementById('previewModal').classList.add('active');
}

function closePreviewModal() {
  document.getElementById('previewModal').classList.remove('active');
  currentPreviewFile = null;
}

function updatePreviewTable() {
  if (!currentPreviewFile) return;
  const rowsToShow = currentPreviewRows === 'max' ? currentPreviewFile.data.length : Math.min(currentPreviewRows, currentPreviewFile.data.length);
  const displayData = currentPreviewFile.data.slice(0, rowsToShow);
  const headers = currentPreviewFile.headers;
  
  let html = `<div class="table-wrapper"><table style="min-width:500px;"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>`;
  for (const row of displayData) {
    html += `<tr>${row.map(cell => `<td>${escapeHtml(String(cell).substring(0, 100))}</td>`).join('')}</tr>`;
  }
  if (currentPreviewFile.data.length > rowsToShow) {
    html += `<tr><td colspan="${headers.length}" style="color:var(--muted);">... ve ${currentPreviewFile.data.length - rowsToShow} satır daha</td></tr>`;
  }
  html += `</tbody></table></div>`;
  document.getElementById('previewTableContainer').innerHTML = html;
}

// Delete handler
function deleteHandler(e) {
  const btn = e.currentTarget;
  const fileId = parseInt(btn.dataset.id);
  const category = btn.dataset.cat;
  if (category === 'summary') {
    summaryFiles = summaryFiles.filter(f => f.id !== fileId);
    renderCategoryUI('summary');
  } else {
    detailFiles = detailFiles.filter(f => f.id !== fileId);
    renderCategoryUI('detail');
  }
  showGlobalMessage('🗑️ Dosya kaldırıldı', 'warn');
}

// Preview handler
function previewClickHandler(e) {
  const btn = e.currentTarget;
  const fileId = parseInt(btn.dataset.id);
  const category = btn.dataset.cat;
  const filesArray = category === 'summary' ? summaryFiles : detailFiles;
  const file = filesArray.find(f => f.id === fileId);
  if (file) openPreviewModal(file, category);
}

// UI Render (Önizleme butonu eklendi)
function renderCategoryUI(category) {
  const filesArray = category === 'summary' ? summaryFiles : detailFiles;
  const container = document.getElementById(`${category}FileList`);
  const statsSpan = document.getElementById(`${category}Stats`);
  if (!container || !statsSpan) return;
  const totalRows = filesArray.reduce((acc, f) => acc + f.rowCount, 0);
  statsSpan.innerText = `${filesArray.length} dosya, ${totalRows} satır`;
  if (filesArray.length === 0) {
    container.innerHTML = '<div style="color:var(--muted); text-align:center; padding:20px;">Henüz dosya yüklenmedi</div>';
    return;
  }
  container.innerHTML = filesArray.map(file => `
    <div class="file-item">
      <span>${file.name.match(/\.xlsx?$/i) ? '📊' : '📄'}</span>
      <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
      <span class="file-rows">${file.rowCount} satır | ${file.headers.length} kolon</span>
      <button class="btn btn-ghost btn-sm preview-btn" data-id="${file.id}" data-cat="${category}">👁️ Önizle</button>
      <button class="file-del" data-id="${file.id}" data-cat="${category}" title="Kaldır">✕</button>
    </div>
  `).join('');
  
  // Preview event
  document.querySelectorAll(`.preview-btn[data-cat="${category}"]`).forEach(btn => {
    btn.removeEventListener('click', previewClickHandler);
    btn.addEventListener('click', previewClickHandler);
  });
  // Delete event
  document.querySelectorAll(`.file-del[data-cat="${category}"]`).forEach(btn => {
    btn.removeEventListener('click', deleteHandler);
    btn.addEventListener('click', deleteHandler);
  });
}

// Tüm verileri dışa aktar (İptal edilenler ayrı sheet)
async function exportAllData() {
  if (summaryFiles.length === 0 && detailFiles.length === 0) {
    showGlobalMessage('⚠️ Hiç dosya yüklenmemiş', 'warn');
    return;
  }
  
  showLoading(true, 'Dosyalar hazırlanıyor, dışa aktarılıyor...');
  
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  const dateStr = `${day}-${month}-${year}`;
  
  try {
    // Özet Data işleme
    if (summaryFiles.length > 0) {
      await processCategoryExport(summaryFiles, 'OzetData', dateStr);
    }
    // Detay Data işleme (Başarı_Oranı eklenmiş)
    if (detailFiles.length > 0) {
      await processDetailExport(detailFiles, 'DetayData', dateStr);
    }
    showGlobalMessage(`✅ Dışa aktarma tamamlandı`, 'ok');
  } catch (err) {
    showGlobalMessage(`❌ Dışa aktarma hatası: ${err.message}`, 'err');
  } finally {
    showLoading(false);
  }
}

// Özet ve Detay ortak işleme (İptal ayrıştırmalı)
async function processCategoryExport(filesArray, sheetNamePrefix, dateStr) {
  // Tüm dosyaları birleştir, Iptal kontrolü yap
  const allRows = [];
  const iptalRows = [];
  let commonHeaders = filesArray[0].headers;
  
  // Puan index'ini bul (sayısal dönüşüm için)
  const puanIndex = commonHeaders.findIndex(h => h === 'Puan');
  
  for (const file of filesArray) {
    // Başlık uyumu kontrolü (basit)
    for (const row of file.data) {
      const paddedRow = [...row];
      while (paddedRow.length < commonHeaders.length) paddedRow.push('');
      
      // Puan'ı sayısal hale getir
      if (puanIndex !== -1 && paddedRow[puanIndex]) {
        paddedRow[puanIndex] = parsePuanValue(paddedRow[puanIndex]);
      }
      
      // Iptal kontrolü
      if (isIptal(paddedRow, commonHeaders)) {
        iptalRows.push([...paddedRow]);
      } else {
        allRows.push([...paddedRow]);
      }
    }
  }
  
  // Workbook oluştur
  const wb = XLSX.utils.book_new();
  
  // Ana sheet (İptal edilmeyenler)
  if (allRows.length > 0) {
    const mainSheetData = [commonHeaders, ...allRows];
    const wsMain = XLSX.utils.aoa_to_sheet(mainSheetData);
    XLSX.utils.book_append_sheet(wb, wsMain, sheetNamePrefix);
  } else {
    // Boş sheet ekleme
    const wsEmpty = XLSX.utils.aoa_to_sheet([commonHeaders]);
    XLSX.utils.book_append_sheet(wb, wsEmpty, sheetNamePrefix);
  }
  
  // İptal Edilenler sheet (varsa)
  if (iptalRows.length > 0) {
    const iptalSheetData = [commonHeaders, ...iptalRows];
    const wsIptal = XLSX.utils.aoa_to_sheet(iptalSheetData);
    XLSX.utils.book_append_sheet(wb, wsIptal, 'Iptal Edilenler');
  }
  
  XLSX.writeFile(wb, `Alotech_${sheetNamePrefix}_${dateStr}.xlsx`);
}

// Detay Data özel işleme (Başarı_Oranı ekle)
async function processDetailExport(filesArray, sheetNamePrefix, dateStr) {
  const allRows = [];
  const iptalRows = [];
  let commonHeaders = [...filesArray[0].headers];
  
  // Başarı_Oranı sütununu ekle
  commonHeaders.push('Başarı_Oranı');
  const puanIndex = filesArray[0].headers.findIndex(h => h === 'Puan');
  
  for (const file of filesArray) {
    for (const row of file.data) {
      const paddedRow = [...row];
      while (paddedRow.length < filesArray[0].headers.length) paddedRow.push('');
      
      // Puan değerini al ve Başarı_Oranı hesapla
      let puanVal = 0;
      if (puanIndex !== -1 && paddedRow[puanIndex]) {
        puanVal = parsePuanValue(paddedRow[puanIndex]);
        paddedRow[puanIndex] = puanVal;
      }
      const basariOrani = puanVal > 0 ? 1 : 0;
      paddedRow.push(basariOrani);
      
      // Iptal kontrolü
      if (isIptal(paddedRow, filesArray[0].headers)) {
        iptalRows.push([...paddedRow]);
      } else {
        allRows.push([...paddedRow]);
      }
    }
  }
  
  const wb = XLSX.utils.book_new();
  
  // Ana sheet
  if (allRows.length > 0) {
    const mainSheetData = [commonHeaders, ...allRows];
    const wsMain = XLSX.utils.aoa_to_sheet(mainSheetData);
    XLSX.utils.book_append_sheet(wb, wsMain, sheetNamePrefix);
  } else {
    const wsEmpty = XLSX.utils.aoa_to_sheet([commonHeaders]);
    XLSX.utils.book_append_sheet(wb, wsEmpty, sheetNamePrefix);
  }
  
  // İptal Edilenler sheet
  if (iptalRows.length > 0) {
    const iptalSheetData = [commonHeaders, ...iptalRows];
    const wsIptal = XLSX.utils.aoa_to_sheet(iptalSheetData);
    XLSX.utils.book_append_sheet(wb, wsIptal, 'Iptal Edilenler');
  }
  
  XLSX.writeFile(wb, `Alotech_${sheetNamePrefix}_${dateStr}.xlsx`);
}

function resetEverything() {
  summaryFiles = [];
  detailFiles = [];
  renderCategoryUI('summary');
  renderCategoryUI('detail');
  showGlobalMessage('🧹 Tüm veriler sıfırlandı', 'ok');
}

// Preview row seçim butonları için event binding (modal açıkken)
function bindPreviewRowButtons() {
  document.querySelectorAll('.preview-row-btn').forEach(btn => {
    btn.removeEventListener('click', previewRowHandler);
    btn.addEventListener('click', previewRowHandler);
  });
}

function previewRowHandler(e) {
  const rows = e.currentTarget.dataset.rows;
  currentPreviewRows = rows === 'max' ? 'max' : parseInt(rows);
  updatePreviewTable();
}

// Modal kapatma için global
window.closePreviewModal = closePreviewModal;

// Drag & drop
function setupDropZone(zoneId, inputId, category) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) { console.error('Drop zone bulunamadı:', zoneId); return; }
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => {
    if (e.target.files.length) addFilesToCategory(category, Array.from(e.target.files));
    input.value = '';
  });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag');
    if (e.dataTransfer.files.length) addFilesToCategory(category, Array.from(e.dataTransfer.files));
  });
}

// Tema
function initTheme() {
  const saved = localStorage.getItem('alotech_theme') || 'grey';
  document.body.className = saved;
  const container = document.getElementById('themeSwitch');
  if (container) {
    const themes = [
      { id: 'grey', name: 'Gri' },
      { id: 'dark', name: 'Siyah' },
      { id: 'light', name: 'Beyaz' },
      { id: 'tp', name: 'TP' }
    ];
    container.innerHTML = themes.map(t => `<button class="theme-btn ${t.id === saved ? 'active' : ''}" data-theme="${t.id}">${t.name}</button>`).join('');
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        document.body.className = theme;
        localStorage.setItem('alotech_theme', theme);
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
      });
    });
  }
}

// Modal açıkken row butonlarını bağla (DOM'a dinamik eklendiği için)
setInterval(() => {
  if (document.getElementById('previewModal').classList.contains('active')) {
    bindPreviewRowButtons();
  }
}, 500);
