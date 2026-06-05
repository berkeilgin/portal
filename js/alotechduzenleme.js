// ==================== STATE ====================
let summaryFiles = [];
let detailFiles = [];
let nextId = 1;

document.addEventListener('DOMContentLoaded', () => {
  console.log('Alotech Düzenleme başladı');
  initTheme();
  setupDropZone('summaryDropZone', 'summaryFileInput', 'summary');
  setupDropZone('detailDropZone', 'detailFileInput', 'detail');
  
  document.getElementById('summaryExportAllBtn')?.addEventListener('click', () => exportAllCategory('summary'));
  document.getElementById('detailExportAllBtn')?.addEventListener('click', () => exportAllCategory('detail'));
  document.getElementById('resetAllBtn')?.addEventListener('click', resetEverything);
  document.getElementById('calculateBtn')?.addEventListener('click', performCalculation);
  
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
          if (!json || json.length === 0) throw new Error('Excel dosyası boş');
          headers = json[0].map(cell => (cell === undefined || cell === null) ? `Sütun_${Math.random()}` : String(cell).trim());
          dataRows = json.slice(1).map(row => headers.map((_, idx) => (row[idx] !== undefined && row[idx] !== null) ? String(row[idx]) : ""));
        } else {
          const text = e.target.result;
          const rows = [];
          let field = '', inQuote = false, row = [];
          for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === '"') inQuote = !inQuote;
            else if ((ch === ',' || ch === '\n') && !inQuote) {
              row.push(field);
              field = '';
              if (ch === '\n') { rows.push(row); row = []; }
            } else field += ch;
          }
          if (field !== '') row.push(field);
          if (row.length) rows.push(row);
          if (rows.length === 0) throw new Error('CSV dosyası boş');
          headers = rows[0].map(h => (h === undefined || h === '') ? `Kolon_${Math.random()}` : h.trim());
          dataRows = rows.slice(1).map(r => {
            while (r.length < headers.length) r.push('');
            return r.slice(0, headers.length);
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
    else reader.readAsText(file, 'UTF-8');
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
      showGlobalMessage(`✅ ${parsed.name} (${parsed.rowCount} satır)`, 'ok');
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
  let html = `<div class="table-wrapper"><table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>`;
  sample.forEach(row => { html += `<tr>${row.map(cell => `<td>${escapeHtml(String(cell).substring(0, 50))}</td>`).join('')}</tr>`; });
  if (file.data.length > maxRows) html += `<tr><td colspan="${headers.length}">... ve ${file.data.length - maxRows} satır daha</td></tr>`;
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

function resetEverything() {
  summaryFiles = [];
  detailFiles = [];
  renderCategoryUI('summary');
  renderCategoryUI('detail');
  showGlobalMessage('🧹 Tüm veriler sıfırlandı', 'ok');
}

function performCalculation() {
  if (summaryFiles.length === 0 && detailFiles.length === 0) {
    showGlobalMessage('⚠️ Lütfen önce Özet ve/veya Detay dosyaları yükleyin', 'err');
    return;
  }
  console.group('🧮 Hesaplama Demo');
  console.log('Özet:', summaryFiles.map(f => ({ name: f.name, satir: f.rowCount, sutunlar: f.headers })));
  console.log('Detay:', detailFiles.map(f => ({ name: f.name, satir: f.rowCount, sutunlar: f.headers })));
  console.groupEnd();
  const sumRows = summaryFiles.reduce((a,b) => a + b.rowCount, 0);
  const detRows = detailFiles.reduce((a,b) => a + b.rowCount, 0);
  alert(`Demo hesaplama tamamlandı.\nÖzet: ${summaryFiles.length} dosya, ${sumRows} satır.\nDetay: ${detailFiles.length} dosya, ${detRows} satır.`);
  showGlobalMessage('✅ Hesaplama tamam, konsola bakın', 'ok');
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
    const themes = ['grey', 'dark', 'light', 'tp'];
    container.innerHTML = themes.map(t => `<button class="theme-btn ${t === saved ? 'active' : ''}" data-theme="${t}">${t === 'grey' ? 'Gri' : t === 'dark' ? 'Koyu' : t === 'light' ? 'Açık' : 'Neon'}</button>`).join('');
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
