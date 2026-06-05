// ==================== STATE ====================
let summaryFiles = [];
let detailFiles = [];
let nextId = 1;

const EXPECTED_SUMMARY_COLS = 20;
const EXPECTED_DETAIL_COLS = 18;

let currentPreviewFile = null;
let currentPreviewCategory = null;

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
  
  const modal = document.getElementById('previewModal');
  const closeBtn = document.getElementById('closeModalBtn');
  closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
  modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
  document.getElementById('previewLimitSelect')?.addEventListener('change', () => refreshPreview());
  
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

function decodeUTF8(buffer) {
  return new TextDecoder('utf-8').decode(buffer);
}

function detectDelimiter(firstLine) {
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return semicolonCount >= commaCount ? ';' : ',';
}

function parseCSVAdvanced(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const delimiter = detectDelimiter(text.split(/\r?\n/)[0]);
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      currentField += ch;
    } else if (ch === delimiter && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((ch === '\n' || (ch === '\r' && text[i+1] === '\n')) && !inQuotes) {
      currentRow.push(currentField);
      if (currentRow.length > 0) rows.push(currentRow);
      currentRow = [];
      currentField = '';
      if (ch === '\r') i++;
    } else {
      currentField += ch;
    }
    i++;
  }
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

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
          headers = json[0].map(cell => (cell === undefined || cell === null) ? `Sütun_${Math.random()}` : String(cell).trim());
          dataRows = json.slice(1).map(row => headers.map((_, idx) => (row[idx] !== undefined && row[idx] !== null) ? String(row[idx]) : ""));
        } else {
          let text = decodeUTF8(e.target.result);
          const rows = parseCSVAdvanced(text);
          if (rows.length === 0) throw new Error('CSV dosyası boş');
          headers = rows[0].map(h => (h === undefined || h === '') ? `Kolon_${Math.random()}` : h.trim());
          dataRows = rows.slice(1).map(r => {
            while (r.length < headers.length) r.push('');
            return r.slice(0, headers.length).map(cell => cell || "");
          });
        }
        
        const colCount = headers.length;
        if (category === 'summary' && colCount !== EXPECTED_SUMMARY_COLS) {
          throw new Error(`Özet data ${EXPECTED_SUMMARY_COLS} sütun bekler, bu dosya ${colCount} sütun içeriyor.`);
        }
        if (category === 'detail' && colCount !== EXPECTED_DETAIL_COLS) {
          throw new Error(`Detay data ${EXPECTED_DETAIL_COLS} sütun bekler, bu dosya ${colCount} sütun içeriyor.`);
        }
        
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
    if (file.name.match(/\.xlsx?$/i)) reader.readAsArrayBuffer(file);
    else reader.readAsArrayBuffer(file);
  });
}

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
      showGlobalMessage(`✅ ${parsed.name} (${parsed.rowCount} satır, ${parsed.headers.length} sütun)`, 'ok');
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

function openPreview(file, category) {
  currentPreviewFile = file;
  currentPreviewCategory = category;
  document.getElementById('modalTitle').innerText = `Önizleme: ${file.name}`;
  document.getElementById('previewLimitSelect').value = '20';
  refreshPreview();
  document.getElementById('previewModal').classList.add('active');
}

function refreshPreview() {
  if (!currentPreviewFile) return;
  const limitSelect = document.getElementById('previewLimitSelect');
  let limit = limitSelect.value;
  let dataToShow = [];
  const allData = currentPreviewFile.data;
  
  if (limit === 'max') {
    const sampleSize = Math.min(500, allData.length);
    if (sampleSize === allData.length) {
      dataToShow = allData;
    } else {
      const shuffled = [...allData];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      dataToShow = shuffled.slice(0, sampleSize);
    }
    showGlobalMessage(`Maks seçildi, rastgele ${dataToShow.length} satır gösteriliyor.`, 'warn');
  } else {
    const num = parseInt(limit, 10);
    dataToShow = allData.slice(0, num);
  }
  
  const headers = currentPreviewFile.headers;
  let html = `<table class="preview-table"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</thead><tbody>`;
  for (const row of dataToShow) {
    html += `<tr>${row.map(cell => `<td>${escapeHtml(String(cell).substring(0, 100))}</td>`).join('')}</tr>`;
  }
  html += `</tbody></table>`;
  if (dataToShow.length === 0) html = '<div>Veri bulunamadı</div>';
  document.getElementById('previewContent').innerHTML = html;
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
  
  document.querySelectorAll(`.preview-btn[data-cat="${category}"]`).forEach(btn => {
    btn.removeEventListener('click', previewClickHandler);
    btn.addEventListener('click', previewClickHandler);
  });
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
  if (file) openPreview(file, category);
}

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
    if (summaryFiles.length > 0) {
      await exportCategoryData(summaryFiles, 'OzetData', dateStr, false);
    }
    if (detailFiles.length > 0) {
      await exportCategoryData(detailFiles, 'DetayData', dateStr, true);
    }
    showGlobalMessage(`✅ Dışa aktarma tamamlandı`, 'ok');
  } catch (err) {
    showGlobalMessage(`❌ Dışa aktarma hatası: ${err.message}`, 'err');
  } finally {
    showLoading(false);
  }
}

// Sayısal dönüşüm için yardımcı fonksiyon
function toNumberIfPossible(val) {
  if (val === undefined || val === null || val === '') return null;
  const str = String(val).trim().replace(',', '.'); // virgülü noktaya çevir
  const num = parseFloat(str);
  return isNaN(num) ? val : num;
}

async function exportCategoryData(files, sheetPrefix, dateStr, addSuccessRate = false) {
  const mainSheetData = [];
  const iptalSheetData = [];
  let mainHeaders = null;
  let iptalHeaders = null;
  let puanColIndex = -1;
  let iptalColIndex = -1;
  
  for (const file of files) {
    if (!mainHeaders) {
      mainHeaders = [...file.headers];
      iptalHeaders = [...file.headers];
      if (addSuccessRate) {
        mainHeaders.push('Başarı_Oranı');
        iptalHeaders.push('Başarı_Oranı');
      }
      iptalColIndex = mainHeaders.findIndex(h => h.toLowerCase() === 'iptal');
      if (addSuccessRate) {
        puanColIndex = mainHeaders.findIndex(h => h.toLowerCase() === 'puan');
      }
      mainSheetData.push(mainHeaders);
      iptalSheetData.push(iptalHeaders);
    }
    
    for (const row of file.data) {
      let paddedRow = [...row];
      while (paddedRow.length < file.headers.length) paddedRow.push('');
      
      // Başarı_Oranı hesapla (detay için) – sayısal
      let successRate = null;
      if (addSuccessRate && puanColIndex !== -1 && puanColIndex < paddedRow.length) {
        const puanVal = toNumberIfPossible(paddedRow[puanColIndex]);
        const puan = (typeof puanVal === 'number') ? puanVal : parseFloat(String(paddedRow[puanColIndex]).replace(',', '.'));
        successRate = (!isNaN(puan) && puan > 0) ? 1 : 0;
      }
      
      // Iptal kontrolü
      let isIptal = false;
      if (iptalColIndex !== -1 && iptalColIndex < paddedRow.length) {
        const val = String(paddedRow[iptalColIndex]).trim().toLowerCase();
        if (val === 'evet') isIptal = true;
      }
      
      // Satırı işle: Puan sütununu sayısal yap, diğerlerini olduğu gibi bırak
      const processedRow = paddedRow.map((cell, idx) => {
        if (mainHeaders && idx < mainHeaders.length && mainHeaders[idx].toLowerCase() === 'puan') {
          return toNumberIfPossible(cell);
        }
        return cell;
      });
      
      if (addSuccessRate) processedRow.push(successRate);
      
      if (isIptal) {
        iptalSheetData.push(processedRow);
      } else {
        mainSheetData.push(processedRow);
      }
    }
  }
  
  // Workbook oluştur ve hücre tiplerini zorla (sayısal hücreler için 'n')
  const wb = XLSX.utils.book_new();
  if (mainSheetData.length > 1) {
    const wsMain = XLSX.utils.aoa_to_sheet(mainSheetData);
    // Sayısal hücreleri 'n' tipine zorla (otomatik algılamazsa)
    for (let r = 1; r < mainSheetData.length; r++) {
      for (let c = 0; c < mainSheetData[r].length; c++) {
        const cellValue = mainSheetData[r][c];
        if (typeof cellValue === 'number') {
          const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
          if (!wsMain[cellRef]) wsMain[cellRef] = {};
          wsMain[cellRef].t = 'n';
          wsMain[cellRef].v = cellValue;
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, wsMain, sheetPrefix);
  }
  if (iptalSheetData.length > 1) {
    const wsIptal = XLSX.utils.aoa_to_sheet(iptalSheetData);
    for (let r = 1; r < iptalSheetData.length; r++) {
      for (let c = 0; c < iptalSheetData[r].length; c++) {
        const cellValue = iptalSheetData[r][c];
        if (typeof cellValue === 'number') {
          const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
          if (!wsIptal[cellRef]) wsIptal[cellRef] = {};
          wsIptal[cellRef].t = 'n';
          wsIptal[cellRef].v = cellValue;
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, wsIptal, 'İptal Edilenler');
  }
  if (wb.SheetNames.length > 0) {
    XLSX.writeFile(wb, `Alotech_${sheetPrefix}_${dateStr}.xlsx`);
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
  if (saved === 'dark') {
    document.body.style.setProperty('--text', '#f0f0f0');
    document.body.style.setProperty('--muted', '#c0c0e0');
  }
}
