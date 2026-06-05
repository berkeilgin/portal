// ==================== STATE ====================
let summaryFiles = [];
let detailFiles = [];
let nextId = 1;
let currentPreview = { category: null, fileId: null, file: null };

// Loading overlay
function showLoading(show, text = 'Dosyalar yükleniyor...') {
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

// Modal kontrol
function showModal(show) {
  const modal = document.getElementById('previewModal');
  if (modal) modal.classList.toggle('active', show);
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupDropZone('summaryDropZone', 'summaryFileInput', 'summary');
  setupDropZone('detailDropZone', 'detailFileInput', 'detail');
  document.getElementById('resetAllBtn')?.addEventListener('click', resetEverything);
  document.getElementById('exportAllDataBtn')?.addEventListener('click', exportAllData);
  document.getElementById('closeModalBtn')?.addEventListener('click', () => showModal(false));
  document.getElementById('refreshPreviewBtn')?.addEventListener('click', refreshPreview);
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

// Gelişmiş CSV ayrıştırıcı - tırnak içindeki satır sonlarını korur
function parseCSVAdvanced(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  
  // Delimiter algılama (ilk satırdan)
  const firstLineEnd = text.indexOf('\n');
  const firstLine = firstLineEnd === -1 ? text : text.substring(0, firstLineEnd);
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = semicolonCount >= commaCount ? ';' : ',';
  
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
    } 
    else if (ch === delimiter && !inQuotes) {
      currentRow.push(cleanField(currentField));
      currentField = '';
    }
    else if (ch === '\n' && !inQuotes) {
      currentRow.push(cleanField(currentField));
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    }
    else {
      currentField += ch;
    }
    i++;
  }
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(cleanField(currentField));
    rows.push(currentRow);
  }
  
  return rows;
}

function cleanField(field) {
  // Tırnakları kaldır, başındaki ve sonundaki boşlukları temizle
  let cleaned = field.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }
  // İçindeki çift tırnakları tek tırnak yap
  cleaned = cleaned.replace(/""/g, '"');
  return cleaned;
}

// Trim & clean özel alan (Değerlendirme Notu için)
function trimAndClean(str) {
  if (!str) return '';
  return String(str).replace(/\s+/g, ' ').trim();
}

async function parseFileToData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let dataRows = [], headers = [];
        if (file.name.match(/\.xlsx?$/i)) {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
          if (!json || json.length === 0) throw new Error('Excel boş');
          headers = json[0].map(cell => (cell === undefined || cell === null) ? `Sütun_${Math.random()}` : String(cell).trim());
          dataRows = json.slice(1).map(row => headers.map((_, idx) => {
            let val = (row[idx] !== undefined && row[idx] !== null) ? String(row[idx]) : "";
            // Değerlendirme_Notu için trim&clean
            const headerName = headers[idx];
            if (headerName && (headerName.includes('Degerlendirme_Notu') || headerName.includes('Değerlendirme_Notu'))) {
              val = trimAndClean(val);
            }
            return val;
          }));
        } else {
          let text = (e.target.result instanceof ArrayBuffer) ? decodeUTF8(e.target.result) : e.target.result;
          const rows = parseCSVAdvanced(text);
          if (rows.length === 0) throw new Error('CSV boş');
          headers = rows[0].map(h => h || `Kolon_${Math.random()}`);
          dataRows = rows.slice(1).map(row => {
            const newRow = [];
            for (let i = 0; i < headers.length; i++) {
              let val = (i < row.length) ? row[i] : "";
              const headerName = headers[i];
              if (headerName && (headerName.includes('Degerlendirme_Notu') || headerName.includes('Değerlendirme_Notu'))) {
                val = trimAndClean(val);
              }
              newRow.push(val);
            }
            return newRow;
          });
        }
        const nonEmptyRows = dataRows.filter(r => r.some(cell => cell && cell.trim() !== ''));
        resolve({
          name: file.name,
          baseName: file.name.replace(/\.[^/.]+$/, ''),
          headers: headers,
          data: nonEmptyRows,
          rowCount: nonEmptyRows.length
        });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Dosya okuma hatası'));
    if (file.name.match(/\.xlsx?$/i)) reader.readAsArrayBuffer(file);
    else reader.readAsArrayBuffer(file);
  });
}

async function addFilesToCategory(category, fileList) {
  const targetArray = category === 'summary' ? summaryFiles : detailFiles;
  showLoading(true, `${category === 'summary' ? 'Özet' : 'Detay'} yükleniyor...`);
  for (const file of fileList) {
    try {
      const parsed = await parseFileToData(file);
      const existingIndex = targetArray.findIndex(f => f.name === parsed.name);
      const newFile = { id: nextId++, ...parsed };
      if (existingIndex !== -1) targetArray[existingIndex] = newFile;
      else targetArray.push(newFile);
      showGlobalMessage(`✅ ${parsed.name} (${parsed.rowCount} satır)`, 'ok');
    } catch (err) {
      showGlobalMessage(`❌ ${file.name}: ${err.message}`, 'err');
    }
  }
  showLoading(false);
  renderCategoryUI(category);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function openPreview(category, fileId) {
  const filesArray = category === 'summary' ? summaryFiles : detailFiles;
  const file = filesArray.find(f => f.id === fileId);
  if (!file) return;
  currentPreview = { category, fileId, file };
  refreshPreview();
  showModal(true);
}

function refreshPreview() {
  if (!currentPreview.file) return;
  const file = currentPreview.file;
  const rowLimit = parseInt(document.getElementById('previewRowCount').value);
  const maxRows = (rowLimit === 999999) ? file.data.length : Math.min(rowLimit, file.data.length);
  const previewData = file.data.slice(0, maxRows);
  
  let html = `<div class="table-wrapper"><table><thead><tr>${file.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>`;
  previewData.forEach(row => {
    html += `<tr>${row.map(cell => `<td>${escapeHtml(String(cell).substring(0, 100))}</td>`).join('')}</tr>`;
  });
  html += `</tbody></table></div><div style="margin-top:8px; font-size:11px; color:var(--muted);">Toplam ${file.data.length} satır, ${maxRows} gösteriliyor.</div>`;
  document.getElementById('previewTableContainer').innerHTML = html;
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
      <button class="file-del" data-id="${file.id}" data-cat="${category}">✕</button>
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
  openPreview(category, fileId);
}

// Export: Puan'ı number yap, Başarı_Oranı ekle, Iptal=Evet olanları ayır
function processDataForExport(filesArray, categoryName) {
  if (!filesArray.length) return null;
  
  const allHeaders = [...filesArray[0].headers];
  // Puan index'ini bul
  let puanIndex = allHeaders.findIndex(h => h && (h.toLowerCase().includes('puan')));
  // Iptal index'i
  let iptalIndex = allHeaders.findIndex(h => h && h.toLowerCase().includes('iptal'));
  
  // Detay data için Başarı_Oranı ekle
  let basariIndex = -1;
  if (categoryName === 'Detay') {
    basariIndex = allHeaders.length;
    allHeaders.push('Başarı_Oranı');
  }
  
  const mainData = [];
  const iptalData = [];
  
  for (const file of filesArray) {
    for (let row of file.data) {
      // Satırı kopyala
      let newRow = [...row];
      while (newRow.length < allHeaders.length - (basariIndex !== -1 ? 1 : 0)) newRow.push('');
      
      // Puan dönüşümü (sayısal)
      let puanValue = 0;
      if (puanIndex !== -1 && puanIndex < newRow.length) {
        let raw = newRow[puanIndex];
        if (raw === undefined || raw === null || raw === '') raw = '0';
        let parsed = parseFloat(String(raw).replace(',', '.').replace(/[^0-9.-]/g, ''));
        puanValue = isNaN(parsed) ? 0 : parsed;
        newRow[puanIndex] = puanValue;
      }
      
      // Başarı_Oranı hesapla (Detay için)
      if (categoryName === 'Detay' && basariIndex !== -1) {
        newRow[basariIndex] = puanValue > 0 ? 1 : 0;
      }
      
      // Iptal kontrolü
      let isIptal = false;
      if (iptalIndex !== -1 && iptalIndex < newRow.length) {
        let iptalVal = String(newRow[iptalIndex] || '').trim().toLowerCase();
        isIptal = (iptalVal === 'evet' || iptalVal === 'e');
      }
      
      if (isIptal) {
        iptalData.push(newRow);
      } else {
        mainData.push(newRow);
      }
    }
  }
  
  return { headers: allHeaders, mainData, iptalData };
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
    // Özet Data işleme
    if (summaryFiles.length > 0) {
      const summaryProcessed = processDataForExport(summaryFiles, 'Özet');
      if (summaryProcessed) {
        const wbSummary = XLSX.utils.book_new();
        // Ana sayfa
        const mainSheet = XLSX.utils.aoa_to_sheet([summaryProcessed.headers, ...summaryProcessed.mainData]);
        XLSX.utils.book_append_sheet(wbSummary, mainSheet, 'Özet Data');
        // İptal Edilenler sayfası
        if (summaryProcessed.iptalData.length > 0) {
          const iptalSheet = XLSX.utils.aoa_to_sheet([summaryProcessed.headers, ...summaryProcessed.iptalData]);
          XLSX.utils.book_append_sheet(wbSummary, iptalSheet, 'İptal Edilenler');
        }
        XLSX.writeFile(wbSummary, `Alotech_OzetData_${dateStr}.xlsx`);
      }
    }
    
    // Detay Data işleme
    if (detailFiles.length > 0) {
      const detailProcessed = processDataForExport(detailFiles, 'Detay');
      if (detailProcessed) {
        const wbDetail = XLSX.utils.book_new();
        const mainSheet = XLSX.utils.aoa_to_sheet([detailProcessed.headers, ...detailProcessed.mainData]);
        XLSX.utils.book_append_sheet(wbDetail, mainSheet, 'Detay Data');
        if (detailProcessed.iptalData.length > 0) {
          const iptalSheet = XLSX.utils.aoa_to_sheet([detailProcessed.headers, ...detailProcessed.iptalData]);
          XLSX.utils.book_append_sheet(wbDetail, iptalSheet, 'İptal Edilenler');
        }
        XLSX.writeFile(wbDetail, `Alotech_DetayData_${dateStr}.xlsx`);
      }
    }
    
    showGlobalMessage(`✅ Dışa aktarma tamamlandı (İptal edilenler ayrı sayfada)`, 'ok');
  } catch (err) {
    showGlobalMessage(`❌ Hata: ${err.message}`, 'err');
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
  if (!zone || !input) return;
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
