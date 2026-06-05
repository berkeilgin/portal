// ==================== STATE YÖNETİMİ ====================
let summaryFiles = [];   // { id, name, baseName, headers, data, rowCount }
let detailFiles = [];
let nextId = 1;

// Yardımcı: status mesajları
function showGlobalMessage(msg, type = 'ok') {
  const statusDiv = document.getElementById('globalStatus');
  if (!statusDiv) return;
  statusDiv.textContent = msg;
  statusDiv.className = `status-bar ${type}`;
  statusDiv.style.display = 'block';
  setTimeout(() => { if(statusDiv.style.display === 'block') statusDiv.style.display = 'none'; }, 3000);
}

// Dosya ayrıştırma (CSV veya Excel)
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
          if (json.length === 0) throw new Error('Excel dosyası boş');
          headers = json[0].map(cell => (cell === undefined || cell === null) ? `Sütun_${Math.random()}` : String(cell).trim());
          dataRows = json.slice(1).map(row => headers.map((_, idx) => (row[idx] !== undefined && row[idx] !== null) ? String(row[idx]) : ""));
        } else {
          // CSV parsing (manuel, tırnak ve virgül duyarlı)
          const text = e.target.result;
          const rows = [];
          let field = '';
          let inQuote = false;
          let row = [];
          for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === '"') {
              inQuote = !inQuote;
            } else if ((ch === ',' || ch === '\n') && !inQuote) {
              row.push(field);
              field = '';
              if (ch === '\n') {
                rows.push(row);
                row = [];
              }
            } else {
              field += ch;
            }
          }
          if (field !== '') row.push(field);
          if (row.length) rows.push(row);
          if (rows.length === 0) throw new Error('CSV boş');
          headers = rows[0].map(h => (h === undefined || h === '') ? `Kolon_${Math.random()}` : h.trim());
          dataRows = rows.slice(1).map(r => {
            while(r.length < headers.length) r.push('');
            return r.slice(0, headers.length);
          });
        }
        // Boş satırları temizleme
        const nonEmptyRows = dataRows.filter(r => r.some(cell => cell && cell.trim() !== ''));
        resolve({
          name: file.name,
          baseName: file.name.replace(/\.[^/.]+$/, ''),
          headers: headers,
          data: nonEmptyRows,
          rowCount: nonEmptyRows.length
        });
      } catch(err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Dosya okuma hatası'));
    if (file.name.match(/\.xlsx?$/i)) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, 'UTF-8');
  });
}

// Dosyaları kategoriye ekleme
async function addFilesToCategory(category, fileList) {
  const targetArray = category === 'summary' ? summaryFiles : detailFiles;
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    try {
      const parsed = await parseFileToData(file);
      const existingIndex = targetArray.findIndex(f => f.name === parsed.name);
      const newFileObj = { id: nextId++, ...parsed };
      if (existingIndex !== -1) {
        targetArray[existingIndex] = newFileObj;
        showGlobalMessage(`🔄 ${parsed.name} güncellendi`, 'ok');
      } else {
        targetArray.push(newFileObj);
        showGlobalMessage(`✅ ${parsed.name} yüklendi (${parsed.rowCount} satır, ${parsed.headers.length} sütun)`, 'ok');
      }
    } catch(err) {
      showGlobalMessage(`❌ ${file.name}: ${err.message}`, 'err');
    }
  }
  renderCategoryUI(category);
}

// HTML escape yardımcısı
function escapeHtml(str) { 
  if (!str) return ''; 
  return String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); 
}

// Preview, export, delete handler'ları
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
  // Tüm previewları kapat
  document.querySelectorAll('.preview-container').forEach(div => { div.classList.remove('active'); div.innerHTML = ''; });
  previewDiv.classList.add('active');
  // Tablo oluştur (ilk 20 satır + header)
  const maxPreviewRows = 15;
  const headers = file.headers;
  const sampleData = file.data.slice(0, maxPreviewRows);
  let html = `<div class="table-wrapper"><table style="min-width:300px;"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>`;
  sampleData.forEach(row => {
    html += `<tr>${row.map(cell => `<td>${escapeHtml(String(cell).substring(0, 50))}</td>`).join('')}</tr>`;
  });
  if (file.data.length > maxPreviewRows) html += `<tr><td colspan="${headers.length}" style="color:var(--muted);">... ve ${file.data.length - maxPreviewRows} satır daha</td></tr>`;
  html += `</tbody>}</div><div style="margin-top:8px; font-size:11px; color:var(--muted);">📌 Sütun yapısı: ${headers.join(' | ')}</div>`;
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
  showGlobalMessage(`📎 ${file.name} dışa aktarıldı (${file.rowCount} satır)`, 'ok');
}

function deleteHandler(e) {
  const btn = e.currentTarget;
  const fileId = parseInt(btn.dataset.id);
  const category = btn.dataset.cat;
  if (category === 'summary') {
    summaryFiles = summaryFiles.filter(f => f.id !== fileId);
  } else {
    detailFiles = detailFiles.filter(f => f.id !== fileId);
  }
  renderCategoryUI(category);
  showGlobalMessage(`🗑️ Dosya kaldırıldı`, 'warn');
}

// UI render: dosya listesi + preview container'ları güncelle
function renderCategoryUI(category) {
  const filesArray = category === 'summary' ? summaryFiles : detailFiles;
  const container = document.getElementById(`${category}FileList`);
  const statsSpan = document.getElementById(`${category}Stats`);
  if (!container || !statsSpan) return;
  const totalRows = filesArray.reduce((acc, f) => acc + f.rowCount, 0);
  statsSpan.innerText = `${filesArray.length} dosya, ${totalRows} satır`;
  
  if (!filesArray.length) {
    container.innerHTML = '<div style="color:var(--muted); text-align:center; padding:20px;">Henüz dosya yüklenmedi</div>';
    return;
  }
  
  container.innerHTML = filesArray.map(file => `
    <div class="file-item" data-id="${file.id}">
      <span>${file.name.match(/\.xlsx?$/i) ? '📊' : '📄'}</span>
      <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
      <span class="file-rows">${file.rowCount} satır | ${file.headers.length} kolon</span>
      <button class="btn btn-ghost btn-sm preview-btn" data-id="${file.id}" data-cat="${category}">👁️ Önizle</button>
      <button class="btn btn-ghost btn-sm export-btn" data-id="${file.id}" data-cat="${category}">💾 Dışa Aktar</button>
      <button class="file-del" data-id="${file.id}" data-cat="${category}" title="Kaldır">✕</button>
    </div>
    <div id="preview-${category}-${file.id}" class="preview-container"></div>
  `).join('');
  
  // Event binding for preview & export & delete
  document.querySelectorAll(`.preview-btn`).forEach(btn => {
    btn.removeEventListener('click', previewHandler);
    btn.addEventListener('click', previewHandler);
  });
  document.querySelectorAll(`.export-btn`).forEach(btn => {
    btn.removeEventListener('click', exportHandler);
    btn.addEventListener('click', exportHandler);
  });
  document.querySelectorAll(`.file-del`).forEach(btn => {
    btn.removeEventListener('click', deleteHandler);
    btn.addEventListener('click', deleteHandler);
  });
}

// Tümünü dışa aktar (kategori bazlı)
function exportAllCategory(category) {
  const filesArray = category === 'summary' ? summaryFiles : detailFiles;
  if (filesArray.length === 0) { showGlobalMessage(`${category === 'summary' ? 'Özet' : 'Detay'} verisi yok`, 'warn'); return; }
  filesArray.forEach(file => {
    const sheetData = [file.headers, ...file.data];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${file.baseName}_${category}_all.xlsx`);
  });
  showGlobalMessage(`📦 ${filesArray.length} dosya dışa aktarıldı (${category === 'summary' ? 'Özet' : 'Detay'})`, 'ok');
}

// Sıfırlama
function resetEverything() {
  summaryFiles = [];
  detailFiles = [];
  renderCategoryUI('summary');
  renderCategoryUI('detail');
  showGlobalMessage('🧹 Tüm veriler sıfırlandı', 'ok');
}

// HESAPLAMA (demo – veri yapısını ve içeriği konsola yazdırır, işlem için hazır)
function performCalculation() {
  if (summaryFiles.length === 0 && detailFiles.length === 0) {
    showGlobalMessage('⚠️ Lütfen önce Özet ve/veya Detay dosyaları yükleyin', 'err');
    return;
  }
  console.group('🧮 HESAPLAMA DEMO (Veri Yapıları)');
  console.log('📌 Özet Dosyaları:', summaryFiles.map(f => ({ name: f.name, satir: f.rowCount, sutunlar: f.headers })));
  console.log('📌 Detay Dosyaları:', detailFiles.map(f => ({ name: f.name, satir: f.rowCount, sutunlar: f.headers })));
  console.log('📊 Özet İlk Veri Örneği:', summaryFiles[0]?.data.slice(0,2));
  console.log('📊 Detay İlk Veri Örneği:', detailFiles[0]?.data.slice(0,2));
  console.groupEnd();
  
  let msg = `🧪 Demo hesaplama tamamlandı.\nÖzet: ${summaryFiles.length} dosya, ${summaryFiles.reduce((a,b)=>a+b.rowCount,0)} satır.\nDetay: ${detailFiles.length} dosya, ${detailFiles.reduce((a,b)=>a+b.rowCount,0)} satır.`;
  alert(msg + '\nKonsolu açarak veri yapılarını inceleyebilirsiniz.');
  showGlobalMessage('✅ Hesaplama hazır, veri yapısı konsola yazdırıldı', 'ok');
}

// Drag & drop ve tıklama kurulumu
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

// Tema değiştirici
function initTheme() {
  const saved = localStorage.getItem('dataforge_theme') || 'grey';
  document.body.className = saved;
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === saved);
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      document.body.className = theme;
      localStorage.setItem('dataforge_theme', theme);
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
    });
  });
}

// Sayfa yüklendiğinde tüm eventleri bağla
document.addEventListener('DOMContentLoaded', () => {
  setupDropZone('summaryDropZone', 'summaryFileInput', 'summary');
  setupDropZone('detailDropZone', 'detailFileInput', 'detail');
  initTheme();
  renderCategoryUI('summary');
  renderCategoryUI('detail');
  
  // Butonlar
  const summaryExportBtn = document.getElementById('summaryExportAllBtn');
  const detailExportBtn = document.getElementById('detailExportAllBtn');
  const resetBtn = document.getElementById('resetAllBtn');
  const calculateBtn = document.getElementById('calculateBtn');
  
  if (summaryExportBtn) summaryExportBtn.addEventListener('click', () => exportAllCategory('summary'));
  if (detailExportBtn) detailExportBtn.addEventListener('click', () => exportAllCategory('detail'));
  if (resetBtn) resetBtn.addEventListener('click', resetEverything);
  if (calculateBtn) calculateBtn.addEventListener('click', performCalculation);
});
