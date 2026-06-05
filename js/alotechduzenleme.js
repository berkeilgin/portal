// ==================== STATE ====================
let summaryFiles = [];
let detailFiles = [];
let nextId = 1;
let currentPreviewFile = null;   // Önizleme için dosya objesi
let currentPreviewCategory = null;

// Loading overlay kontrolü
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
  
  // Modal kapatma
  const modal = document.getElementById('previewModal');
  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('active'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
  
  // Satır limit değişince yeniden göster
  const limitSelect = document.getElementById('previewLimitSelect');
  if (limitSelect) limitSelect.addEventListener('change', () => {
    if (currentPreviewFile) renderModalPreview(currentPreviewFile, currentPreviewCategory);
  });
  
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

// Otomatik delimiter algılama (noktalı virgül veya virgül)
function detectDelimiter(firstLine) {
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return semicolonCount >= commaCount ? ';' : ',';
}

// Gelişmiş CSV ayrıştırma (tırnak içi ayraçları yoksayar)
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

// Özet Data'da "Degerlendirme_Notu" sütununu bulup trim+clean yap
function cleanTextCells(headers, dataRow, colName = 'Degerlendirme_Notu') {
  const colIndex = headers.findIndex(h => h === colName);
  if (colIndex !== -1 && dataRow[colIndex]) {
    dataRow[colIndex] = dataRow[colIndex].trim().replace(/\s+/g, ' ');
  }
  return dataRow;
}

// Puan sütununu sayısal yap (float)
function normalizePuan(headers, dataRow) {
  const puanIndex = headers.findIndex(h => h === 'Puan');
  if (puanIndex !== -1) {
    let val = dataRow[puanIndex];
    if (val === undefined || val === null || val === '') val = '0';
    let num = parseFloat(String(val).replace(',', '.')); // virgüllü sayılar için
    if (isNaN(num)) num = 0;
    dataRow[puanIndex] = num;
  }
  return dataRow;
}

// Detay Data'ya "Başarı_Oranı" ekle (Puan > 0 ise 1 else 0)
function addBasariOrani(headers, dataRow) {
  const puanIndex = headers.findIndex(h => h === 'Puan');
  let puan = 0;
  if (puanIndex !== -1) {
    puan = typeof dataRow[puanIndex] === 'number' ? dataRow[puanIndex] : parseFloat(dataRow[puanIndex]) || 0;
  }
  const basariOrani = puan > 0 ? 1 : 0;
  dataRow.push(basariOrani);
  return dataRow;
}

// Dosya ayrıştırma (CSV veya Excel)
async function parseFileToData(file, category) {
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
          let text = decodeUTF8(e.target.result);
          const rows = parseCSVAdvanced(text);
          if (rows.length === 0) throw new Error('CSV dosyası boş');
          headers = rows[0].map(h => (h === undefined || h === '') ? `Kolon_${Math.random()}` : h);
          dataRows = rows.slice(1).map(r => {
            while (r.length < headers.length) r.push('');
            return r.slice(0, headers.length).map(cell => cell || "");
          });
        }
        
        // Satır işlemleri (temizlik, puan normalizasyonu, başarı oranı ekleme)
        let processedRows = [];
        for (let row of dataRows) {
          // Boş satır kontrolü
          if (row.every(cell => !cell || cell.trim() === '')) continue;
          
          // Özet Data: "Degerlendirme_Notu" temizle
          if (category === 'summary') {
            row = cleanTextCells(headers, row, 'Degerlendirme_Notu');
          }
          
          // "Puan" kolonunu sayısal yap (her iki kategori için)
          row = normalizePuan(headers, row);
          
          if (category === 'detail') {
            // Detay Data: Başarı_Oranı ekle (yeni bir kolon olarak sona eklenir)
            // Önce orijinal row'u kopyala, sonra ekle
            let newRow = [...row];
            newRow = addBasariOrani(headers, newRow);
            processedRows.push(newRow);
          } else {
            processedRows.push(row);
          }
        }
        
        // Eğer kategori detail ise, headers'a "Başarı_Oranı" ekle
        let finalHeaders = [...headers];
        if (category === 'detail') {
          finalHeaders.push('Başarı_Oranı');
        }
        
        // Sayısal hücreleri koru (Excel'e yazarken number formatı)
        // Ama şimdilik olduğu gibi bırak, dışa aktarımda XLSX otomatik algılar.
        
        resolve({
          name: file.name,
          baseName: file.name.replace(/\.[^/.]+$/, ''),
          headers: finalHeaders,
          data: processedRows,
          rowCount: processedRows.length
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

// Dosya yükleme (loading animasyonlu)
async function addFilesToCategory(category, fileList) {
  const targetArray = category === 'summary' ? summaryFiles : detailFiles;
  showLoading(true, `${category === 'summary' ? 'Özet' : 'Detay'} dosyaları yükleniyor...`);
  let addedCount = 0;
  for (const file of fileList) {
    try {
      const parsed = await parseFileToData(file, category);
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
  if (str === undefined || str === null) return '';
  return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// Önizleme modal göster
function showPreview(file, category) {
  currentPreviewFile = file;
  currentPreviewCategory = category;
  const modal = document.getElementById('previewModal');
  document.getElementById('modalTitle').innerHTML = `${category === 'summary' ? 'Özet' : 'Detay'} - ${escapeHtml(file.name)}`;
  renderModalPreview(file, category);
  modal.classList.add('active');
}

function renderModalPreview(file, category) {
  const limitSelect = document.getElementById('previewLimitSelect');
  let limit = parseInt(limitSelect.value);
  const wrapper = document.getElementById('modalTableWrapper');
  if (!wrapper) return;
  
  const headers = file.headers;
  let dataToShow = file.data;
  if (limit !== 999999 && dataToShow.length > limit) {
    dataToShow = dataToShow.slice(0, limit);
  }
  
  let html = '<div class="table-wrapper"><table><thead><tr>';
  headers.forEach(h => { html += `<th>${escapeHtml(h)}</th>`; });
  html += '</tr></thead><tbody>';
  dataToShow.forEach(row => {
    html += '<tr>';
    row.forEach(cell => {
      let display = (cell !== undefined && cell !== null) ? String(cell) : '';
      if (display.length > 100) display = display.substring(0, 100) + '...';
      html += `<td>${escapeHtml(display)}</td>`;
    });
    html += '</tr>';
  });
  if (dataToShow.length === 0) html += '<tr><td colspan="'+headers.length+'">Veri yok</td></tr>';
  html += '</tbody></table></div>';
  wrapper.innerHTML = html;
}

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
  
  // Preview eventleri
  document.querySelectorAll(`.preview-btn[data-cat="${category}"]`).forEach(btn => {
    btn.removeEventListener('click', previewClickHandler);
    btn.addEventListener('click', previewClickHandler);
  });
  // Delete eventleri
  document.querySelectorAll(`.file-del[data-cat="${category}"]`).forEach(btn => {
    btn.removeEventListener('click', deleteHandler);
    btn.addEventListener('click', deleteHandler);
  });
}

function previewClickHandler(e) {
  const btn = e.currentTarget;
  const fileId = parseInt(btn.dataset.id);
  const category = btn.dataset.cat;
  const filesArray = category === 'summary' ? summaryFiles : detailFiles;
  const file = filesArray.find(f => f.id === fileId);
  if (file) showPreview(file, category);
}

// Tüm verileri dışa aktar
async function exportAllData() {
  if (summaryFiles.length === 0 && detailFiles.length === 0) {
    showGlobalMessage('⚠️ Hiç dosya yüklenmemiş', 'warn');
    return;
  }
  showLoading(true, 'Dosyalar dışa aktarılıyor...');
  
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  const dateStr = `${day}-${month}-${year}`;
  
  try {
    // Özet Data
    if (summaryFiles.length > 0) {
      const summarySheetData = [];
      const summaryHeaders = summaryFiles[0].headers;
      summarySheetData.push(summaryHeaders);
      for (const file of summaryFiles) {
        for (const row of file.data) {
          const paddedRow = [...row];
          while (paddedRow.length < summaryHeaders.length) paddedRow.push('');
          summarySheetData.push(paddedRow);
        }
      }
      const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);
      const wbSummary = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wbSummary, wsSummary, 'OzetData');
      XLSX.writeFile(wbSummary, `Alotech_OzetData_${dateStr}.xlsx`);
    }
    
    // Detay Data
    if (detailFiles.length > 0) {
      const detailSheetData = [];
      const detailHeaders = detailFiles[0].headers;
      detailSheetData.push(detailHeaders);
      for (const file of detailFiles) {
        for (const row of file.data) {
          const paddedRow = [...row];
          while (paddedRow.length < detailHeaders.length) paddedRow.push('');
          detailSheetData.push(paddedRow);
        }
      }
      const wsDetail = XLSX.utils.aoa_to_sheet(detailSheetData);
      const wbDetail = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wbDetail, wsDetail, 'DetayData');
      XLSX.writeFile(wbDetail, `Alotech_DetayData_${dateStr}.xlsx`);
    }
    
    showGlobalMessage(`✅ Dışa aktarma tamamlandı: Özet (${summaryFiles.length} dosya), Detay (${detailFiles.length} dosya)`, 'ok');
  } catch (err) {
    showGlobalMessage(`❌ Dışa aktarma hatası: ${err.message}`, 'err');
  } finally {
    showLoading(false);
  }
}

function resetEverything() {
  summaryFiles = [];
  detailFiles = [];
  renderCategoryUI('summary');
  renderCategoryUI('detail');
  showGlobalMessage('🧹 Tüm veriler sıfırlandı', 'ok');
}

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
