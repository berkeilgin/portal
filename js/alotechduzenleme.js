// ==================== STATE ====================
let summaryFiles = [];
let detailFiles = [];
let nextId = 1;

document.addEventListener('DOMContentLoaded', () => {
  console.log('Alotech Düzenleme başladı');
  initTheme();
  setupDropZone('summaryDropZone', 'summaryFileInput', 'summary');
  setupDropZone('detailDropZone', 'detailFileInput', 'detail');
  
  // Tek bir export butonu
  document.getElementById('exportAllDataBtn')?.addEventListener('click', exportAllData);
  document.getElementById('resetAllBtn')?.addEventListener('click', resetEverything);
  
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

// Otomatik delimiter algılama (virgül, noktalı virgül, tab, pipe)
function detectDelimiter(line) {
  const delimiters = [',', ';', '\t', '|'];
  let bestDelim = ',';
  let maxCount = 0;
  for (const delim of delimiters) {
    const count = (line.match(new RegExp(`\\${delim}`, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      bestDelim = delim;
    }
  }
  return bestDelim;
}

// Gelişmiş CSV parser (tırnak duyarlı, delimiter otomatik)
function parseCSVAdvanced(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];
  
  // İlk satırdan delimiter algıla
  const delimiter = detectDelimiter(lines[0]);
  
  const rows = [];
  for (let line of lines) {
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
    rows.push(row);
  }
  return rows;
}

// Dosya ayrıştırma (CSV: ArrayBuffer ile UTF-8, delimiter algılama)
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
          // CSV dosyası - UTF-8 decoding
          let text;
          if (e.target.result instanceof ArrayBuffer) {
            text = decodeUTF8(e.target.result);
          } else {
            text = e.target.result;
          }
          // BOM silme
          if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
          const rows = parseCSVAdvanced(text);
          if (rows.length === 0) throw new Error('CSV dosyası boş');
          headers = rows[0].map(h => (h === undefined || h === '') ? `Kolon_${Math.random()}` : h);
          dataRows = rows.slice(1).map(r => {
            while (r.length < headers.length) r.push('');
            return r.slice(0, headers.length).map(cell => cell || "");
          });
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

async function addFilesToCategory(category, fileList) {
  const targetArray = category === 'summary' ? summaryFiles : detailFiles;
  for (const file of fileList) {
    try {
      const parsed = await parseFileToData(file);
      const existingIndex = targetArray.findIndex(f => f.name === parsed.name);
      const newFile = { id: nextId++, ...parsed };
      if (existingIndex !== -1) targetArray[existingIndex] = newFile;
      else targetArray.push(newFile);
      showGlobalMessage(`✅ ${parsed.name} (${parsed.rowCount} satır, ${parsed.headers.length} sütun)`, 'ok');
    } catch (err) {
      showGlobalMessage(`❌ ${file.name}: ${err.message}`, 'err');
    }
  }
  renderCategoryUI(category);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function previewHandler(e) {
  const btn = e.currentTarget;
  const fileId = parseInt(btn.dataset.id);
  const category = btn.dataset.cat;
  const filesArray = category === 'summary' ? summaryFiles : detailFiles;
  const file = filesArray.find(f => f.id === fileId);
  if (!file) return;
  const previewDiv = document.getElementById(`preview-${category}-${fileId}`);
  if (!previewDiv) return;
  if (previewDiv.classList.contains('active')) {
    previewDiv.classList.remove('active');
    previewDiv.innerHTML = '';
    return;
  }
  document.querySelectorAll('.preview-container').forEach(div => { div.classList.remove('active'); div.innerHTML = ''; });
  previewDiv.classList.add('active');
  const maxRows = 15;
  const headers = file.headers;
  const sample = file.data.slice(0, maxRows);
  let html = `<div class="table-wrapper"><table style="min-width:300px;"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</thead><tbody>`;
  sample.forEach(row => {
    html += `<tr>${row.map(cell => `<td>${escapeHtml(String(cell).substring(0, 50))}</td>`).join('')}</tr>`;
  });
  if (file.data.length > maxRows) html += `<tr><td colspan="${headers.length}" style="color:var(--muted);">... ve ${file.data.length - maxRows} satır daha</td></tr>`;
  html += `</tbody>}</div><div style="margin-top:8px; font-size:10px; color:var(--muted);">Sütunlar: ${headers.join(' | ')}</div>`;
  previewDiv.innerHTML = html;
}

function exportHandler(e) {
  const btn = e.currentTarget;
  const fileId = parseInt(btn.dataset.id);
  const category = btn.dataset.cat;
  const filesArray = category === 'summary' ? summaryFiles : detailFiles;
  const file = filesArray.find(f => f.id === fileId);
  if (!file) return;
  const sheetData = [file.headers, ...file.data];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `${file.baseName}_${category}_export.xlsx`);
  showGlobalMessage(`📎 ${file.name} dışa aktarıldı`, 'ok');
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
      <button class="btn btn-ghost btn-sm export-btn" data-id="${file.id}" data-cat="${category}">💾 Dışa Aktar</button>
      <button class="file-del" data-id="${file.id}" data-cat="${category}">✕</button>
    </div>
    <div id="preview-${category}-${file.id}" class="preview-container"></div>
  `).join('');
  
  document.querySelectorAll(`.preview-btn[data-cat="${category}"]`).forEach(btn => {
    btn.removeEventListener('click', previewHandler);
    btn.addEventListener('click', previewHandler);
  });
  document.querySelectorAll(`.export-btn[data-cat="${category}"]`).forEach(btn => {
    btn.removeEventListener('click', exportHandler);
    btn.addEventListener('click', exportHandler);
  });
  document.querySelectorAll(`.file-del[data-cat="${category}"]`).forEach(btn => {
    btn.removeEventListener('click', deleteHandler);
    btn.addEventListener('click', deleteHandler);
  });
}

// Tarih formatı YYYYMMDD
function getTodayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// Tek bir dosyayı Excel'e export et (verilen adla)
function exportSingleFile(file, fileNamePrefix, categoryName) {
  const sheetData = [file.headers, ...file.data];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, categoryName);
  XLSX.writeFile(wb, `${fileNamePrefix}.xlsx`);
}

// Tüm verileri dışa aktar (Özet ve Detay ayrı ayrı)
function exportAllData() {
  const today = getTodayString();
  let exportedCount = 0;
  
  // Özet data export
  if (summaryFiles.length > 0) {
    // Eğer birden fazla özet dosyası varsa, her birini ayrı indir? İstek: "Alotech_OzetData_Bugün" - tek dosya mı? Genelde tüm özet dosyaları birleştirilir mi?
    // Kullanıcı "Tümünü Dışarı Aktar" butonu iki datayı da indirsin demiş, ama her bir kategori altında birden fazla dosya olabilir.
    // Mantıklı olan: her kategori için TÜM dosyaları tek bir Excel'de birleştirmek? Hayır, her dosya ayrı Excel olarak indirilsin daha güvenli.
    // Ama isimlendirme: "Alotech_OzetData_Bugün" + dosya adı? Karışık. Basitçe: her özet dosyasını "Alotech_OzetData_Bugün_dosyaadi.xlsx" olarak indirelim.
    // Daha temiz: Özet kategorisindeki TÜM dosyaları tek bir Excel'de ayrı sheetler olarak? Karmaşık. Kullanıcı "İki datayı indirsin" demiş, yani özet ve detay ayrı ayrı ama her birinin içinde birden fazla dosya varsa ne olacak?
    // En güvenlisi: Her bir dosyayı ayrı indir, ama isimlendirme: "Alotech_OzetData_Bugün_originalname.xlsx"
    summaryFiles.forEach(file => {
      const fileName = `Alotech_OzetData_${today}_${file.baseName}.xlsx`;
      const sheetData = [file.headers, ...file.data];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'ÖzetData');
      XLSX.writeFile(wb, fileName);
      exportedCount++;
    });
  } else {
    showGlobalMessage('⚠️ Özet data yok, sadece detay export edilecek', 'warn');
  }
  
  // Detay data export
  if (detailFiles.length > 0) {
    detailFiles.forEach(file => {
      const fileName = `Alotech_DetayData_${today}_${file.baseName}.xlsx`;
      const sheetData = [file.headers, ...file.data];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'DetayData');
      XLSX.writeFile(wb, fileName);
      exportedCount++;
    });
  } else {
    showGlobalMessage('⚠️ Detay data yok, sadece özet export edildi', 'warn');
  }
  
  if (exportedCount === 0) {
    showGlobalMessage('❌ Hiç veri yok, export yapılamadı', 'err');
  } else {
    showGlobalMessage(`📦 ${exportedCount} dosya export edildi (Özet/Detay)`, 'ok');
  }
}

function resetEverything() {
  summaryFiles = [];
  detailFiles = [];
  renderCategoryUI('summary');
  renderCategoryUI('detail');
  showGlobalMessage('🧹 Tüm veriler sıfırlandı', 'ok');
}

// Drop zone kurulumu
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
