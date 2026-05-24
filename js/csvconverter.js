// ==================== STATE ====================
let files = []; // { name, baseName, data, headers }
let mode = 'standart';
let excludedCols = new Set();

// ==================== DOM ELEMENTS ====================
const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const editPanel = document.getElementById('editPanel');
const editColList = document.getElementById('editColList');

// ==================== HELPERS ====================
function showStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status-bar ' + (type ? ' ' + type : '');
  if (msg) statusEl.style.display = 'block';
  else statusEl.style.display = 'none';
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function parseCSVLine(line) {
  let result = [], current = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) { result.push(current); current = ''; }
    else current += c;
  }
  result.push(current);
  return result;
}

// ==================== FILE PARSING ====================
async function parseFile(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        let content = e.target.result;
        if (file.name.match(/\.xlsx?$/i)) {
          const wb = XLSX.read(content, { type: 'array' });
          content = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
        }
        const rows = content.split(/\r?\n/).filter(r => r.trim()).map(parseCSVLine);
        resolve({ name: file.name, baseName: file.name.replace(/\.[^/.]+$/, ''), data: rows, headers: rows[0] || [] });
      } catch (err) {
        showStatus('❌ ' + file.name + ': ' + err.message, 'err');
        resolve(null);
      }
    };
    if (file.name.match(/\.xlsx?$/i)) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, 'UTF-8');
  });
}

async function loadFiles(newFiles) {
  for (const f of newFiles) {
    const existing = files.findIndex(x => x.name === f.name);
    const parsed = await parseFile(f);
    if (!parsed) continue;
    if (existing >= 0) files[existing] = parsed;
    else files.push(parsed);
  }
  renderFileList();
  if (mode === 'duzenle') renderEditCols();
  downloadBtn.disabled = files.length === 0;
  showStatus(files.length ? `✅ ${files.length} dosya hazır` : '', 'ok');
}

function renderFileList() {
  fileList.innerHTML = files.map((f, i) => `
    <div class="file-item ok">
      <span style="font-size:16px">${f.name.match(/\.xlsx?$/i) ? '📊' : '📄'}</span>
      <span class="file-name">${escapeHtml(f.name)}</span>
      <span class="file-rows">${f.data.length} satır</span>
      <button class="file-del" onclick="removeFile(${i})" title="Kaldır">✕</button>
    </div>
  `).join('');
}

function removeFile(i) {
  files.splice(i, 1);
  renderFileList();
  if (mode === 'duzenle') renderEditCols();
  downloadBtn.disabled = files.length === 0;
  if (!files.length) showStatus('', '');
}

function setMode(m) {
  mode = m;
  document.getElementById('modeStandart').classList.toggle('on', m === 'standart');
  document.getElementById('modeDuzenle').classList.toggle('on', m === 'duzenle');
  editPanel.classList.toggle('on', m === 'duzenle');
  if (m === 'duzenle' && files.length) renderEditCols();
}

function renderEditCols() {
  if (!files.length) {
    editColList.innerHTML = '<div style="font-size:11px;color:var(--muted);font-family:var(--mono)">Önce dosya yükleyin.</div>';
    return;
  }
  const headers = files[0].headers;
  editColList.innerHTML = headers.map((h, i) => `
    <div class="edit-row">
      <span class="edit-label">${escapeHtml(h || '(boş)')}</span>
      <span class="edit-val">${i === 0 ? 'İlk sütun' : 'Kolon ' + (i + 1)}</span>
      <button class="edit-toggle on" id="col_${i}" onclick="toggleCol(${i}, this)" title="Dahil/Hariç"></button>
    </div>
  `).join('');
  // Restore excluded state
  excludedCols.forEach(i => {
    const btn = document.getElementById('col_' + i);
    if (btn) btn.classList.remove('on');
  });
}

function toggleCol(i, btn) {
  btn.classList.toggle('on');
  if (btn.classList.contains('on')) excludedCols.delete(i);
  else excludedCols.add(i);
}

// ==================== EXPORT ====================
let weightIdx = -1, scoreIdxs = [], identIdxs = [];

function detectSpecialCols(headers) {
  weightIdx = headers.findIndex(h => h.toLowerCase().includes('weighted'));
  scoreIdxs = headers.map((h, i) => h.toLowerCase().includes('score') ? i : -1).filter(i => i !== -1);
  identIdxs = headers.map((h, i) => h.toLowerCase().includes('ident') ? i : -1).filter(i => i !== -1);
}

function formatCell(value, colIndex) {
  if (!value) return '';
  let v = String(value).replace(/"/g, '').trim();
  if (identIdxs.includes(colIndex)) return v;
  if (colIndex === weightIdx && /^\d+\.\d+$/.test(v)) return v.replace('.', ',');
  if (scoreIdxs.includes(colIndex) && /^\d+\.\d+$/.test(v)) return v.replace('.', ',');
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d)) return { v: d, t: 'd' };
  }
  if (/^\d+\.\d+$/.test(v)) return { v: parseFloat(v), t: 'n' };
  if (/^\d+$/.test(v)) return { v: parseInt(v), t: 'n' };
  return v;
}

function buildSheet(fileObj) {
  detectSpecialCols(fileObj.headers);
  const filteredData = mode === 'duzenle'
    ? fileObj.data.map(row => row.filter((_, ci) => !excludedCols.has(ci)))
    : fileObj.data;
  const ws = XLSX.utils.aoa_to_sheet(
    filteredData.map((row, rIdx) => row.map((cell, cIdx) => rIdx === 0 ? cell : formatCell(cell, cIdx)))
  );
  Object.keys(ws).forEach(cell => {
    if (cell[0] === '!') return;
    const c = ws[cell];
    if (c.t === 'n') c.z = '#,##0.00';
    if (c.t === 'd') c.z = 'dd.mm.yyyy';
  });
  return ws;
}

function downloadAll() {
  if (!files.length) return;
  let success = 0;
  for (const f of files) {
    try {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, buildSheet(f), 'Data');
      XLSX.writeFile(wb, f.baseName + '_clean.xlsx');
      success++;
    } catch (e) {
      showStatus('❌ ' + f.name + ': ' + e.message, 'err');
    }
  }
  if (success > 0) showStatus(`✅ ${success} Excel indirildi`, 'ok');
}

function resetAll() {
  files = [];
  excludedCols.clear();
  fileInput.value = '';
  renderFileList();
  editColList.innerHTML = '';
  downloadBtn.disabled = true;
  showStatus('', '');
}

// ==================== EVENT LISTENERS ====================
drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { if (e.target.files.length) loadFiles(Array.from(e.target.files)); });
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', e => {
  e.preventDefault();
  drop.classList.remove('drag');
  if (e.dataTransfer.files.length) loadFiles(Array.from(e.dataTransfer.files));
});
resetBtn.addEventListener('click', resetAll);

// Global functions for inline calls
window.removeFile = removeFile;
window.toggleCol = toggleCol;
window.setMode = setMode;
window.downloadAll = downloadAll;