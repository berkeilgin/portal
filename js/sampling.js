// ==================== STATE ====================
let datasets = [];
let boxCount = 0;
const SHOW_COLS = ['active_call_key', 'agent_name', 'agent_email', 'queue_name', 'call_date', 'total_duration'];
const DEFAULT_RANGES = [[45, 90, 2], [91, 150, 2], [151, 239, 2], [240, 300, 2]];

// ==================== HELPERS ====================
function updateCount() {
  const n = datasets.length;
  document.getElementById('toolbarCount').textContent = `${n} dataset`;
  document.getElementById('emptyState').style.display = n ? 'none' : 'flex';
}

function normalizeDate(v) {
  if (!v) return '';
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
  }
  return String(v).split(' ')[0];
}

function addRangeRow(tbody, mn = 0, mx = 0, cnt = 2) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="range-input" value="${mn}" type="number"></td>
    <td><input class="range-input" value="${mx}" type="number"></td>
    <td><input class="range-input" value="${cnt}" type="number" style="width:46px"></td>
    <td><button class="del-row" onclick="this.closest('tr').remove()">✕</button></td>`;
  tbody.appendChild(tr);
}

function makeRangeTable() {
  const wrap = document.createElement('div');
  wrap.className = 'range-wrap';
  const tbl = document.createElement('table');
  tbl.className = 'range-table';
  tbl.innerHTML = `<thead><tr><th>Min</th><th>Max</th><th>Adet</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');
  DEFAULT_RANGES.forEach(([mn, mx, cnt]) => addRangeRow(tbody, mn, mx, cnt));
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  const addBtn = document.createElement('button');
  addBtn.className = 'add-row-btn';
  addBtn.textContent = '➕ Satır Ekle';
  addBtn.onclick = () => addRangeRow(tbody);
  wrap.appendChild(addBtn);
  return wrap;
}

// ==================== ADD DATA BOX ====================
function addData() {
  boxCount++;
  const id = Date.now();
  const box = document.createElement('div');
  box.className = 'data-box';
  box.dataset.id = id;

  const header = document.createElement('div');
  header.className = 'box-header';
  header.innerHTML = `
    <div>
      <div class="box-num">DATASET ${boxCount}</div>
      <div class="box-name" id="boxName${id}">Dosya seçilmedi</div>
    </div>
    <button class="del-box" onclick="removeData(${id}, this)" title="Kaldır">✕</button>`;

  const dropEl = document.createElement('div');
  dropEl.className = 'box-drop';
  dropEl.id = 'drop' + id;
  dropEl.innerHTML = `<div style="font-size:22px;margin-bottom:6px">📂</div><div>Dosya seç veya sürükle</div>`;

  const fileInp = document.createElement('input');
  fileInp.type = 'file';
  fileInp.style.display = 'none';

  dropEl.onclick = () => fileInp.click();
  dropEl.ondragover = e => { e.preventDefault(); dropEl.classList.add('drag'); };
  dropEl.ondragleave = () => dropEl.classList.remove('drag');
  dropEl.ondrop = e => {
    e.preventDefault();
    dropEl.classList.remove('drag');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0], id);
  };
  fileInp.onchange = e => { if (e.target.files[0]) loadFile(e.target.files[0], id); };

  const rangeTable = makeRangeTable();

  box.appendChild(header);
  box.appendChild(dropEl);
  box.appendChild(fileInp);
  box.appendChild(rangeTable);

  const grid = document.getElementById('grid');
  grid.appendChild(box);

  datasets.push({ id, data: [] });
  updateCount();
}

function removeData(id, btn) {
  btn.closest('.data-box').remove();
  datasets = datasets.filter(d => d.id !== id);
  updateCount();
}

function clearAll() {
  datasets = [];
  document.getElementById('grid').innerHTML = `
    <div class="empty-state" id="emptyState">
      <div class="empty-icon">📂</div>
      <div class="empty-title">Henüz dataset yok</div>
      <div class="empty-sub">Yeni Data butonuna tıklayarak Excel dosyalarınızı yükleyin</div>
    </div>`;
  boxCount = 0;
  updateCount();
}

// ==================== LOAD FILE ====================
function loadFile(file, id) {
  const reader = new FileReader();
  const dropEl = document.getElementById('drop' + id);
  const nameEl = document.getElementById('boxName' + id);
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, { type: 'array' });
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const filtered = data.filter(r => !isNaN(r.total_duration));
    const ds = datasets.find(x => x.id === id);
    if (ds) ds.data = filtered;
    dropEl.className = 'box-drop loaded';
    dropEl.innerHTML = `<div style="font-size:20px;margin-bottom:4px">✅</div><div style="font-weight:600">${file.name}</div><div style="font-size:11px;margin-top:3px">${filtered.length} kayıt</div>`;
    nameEl.textContent = file.name.length > 28 ? file.name.slice(0, 25) + '…' : file.name;
  };
  reader.readAsArrayBuffer(file);
}

// ==================== RUN SAMPLING ====================
function getBestDate(r) {
  const m = {};
  r.forEach(x => { if (!m[x.call_date]) m[x.call_date] = 0; m[x.call_date]++; });
  return Object.keys(m).sort((a, b) => m[b] - m[a])[0] || 'NoDate';
}

async function run() {
  const zip = new JSZip();
  let count = 0;
  const boxes = document.querySelectorAll('.data-box');
  for (let i = 0; i < datasets.length; i++) {
    const ds = datasets[i];
    if (!ds.data.length) continue;
    const box = boxes[i];
    if (!box) continue;
    const rows = box.querySelectorAll('.range-table tbody tr');
    let results = [], logs = [];
    ds.data.forEach(r => r.call_date = normalizeDate(r.call_date));
    rows.forEach(row => {
      const inp = row.querySelectorAll('input');
      if (inp.length < 3) return;
      const min = +inp[0].value, max = +inp[1].value, cnt = +inp[2].value;
      const filtered = ds.data.filter(r => r.total_duration >= min && r.total_duration < max);
      const map = {};
      filtered.forEach(r => { if (!map[r.agent_name]) map[r.agent_name] = []; map[r.agent_name].push(r); });
      for (const a in map) {
        const pool = map[a];
        const sel = pool.sort(() => Math.random() - 0.5).slice(0, cnt);
        sel.forEach(r => results.push({ ...r, __range: `${min}-${max}sn` }));
        if (pool.length < cnt) logs.push({ Agent: a, Süre: `${min}-${max}`, Eksik: cnt - pool.length });
      }
    });
    if (!results.length) continue;
    count++;
    const out = results.map(r => {
      const row = { AHT_Araligi: r.__range };
      SHOW_COLS.forEach(c => { row[c] = c === 'call_date' ? "'" + r[c] : (r[c] ?? ''); });
      return row;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), 'Data');
    if (logs.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logs), 'Log');
    const file = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
    zip.file(getBestDate(results) + '_Tur2.xlsx', file);
  }
  if (count === 0) {
    alert('Çıktı yok — önce dosya yükleyip Çalıştır düğmesine basın');
    return;
  }
  if (count === 1) {
    const fn = Object.keys(zip.files)[0];
    saveAs(await zip.file(fn).async('blob'), fn);
    return;
  }
  const d = new Date();
  const name = `Sampling_${String(d.getDate()).padStart(2, '0')}_${String(d.getMonth() + 1).padStart(2, '0')}_${d.getFullYear()}.zip`;
  saveAs(await zip.generateAsync({ type: 'blob' }), name);
}

// Start with one dataset
addData();

// Global functions for inline calls
window.addData = addData;
window.removeData = removeData;
window.clearAll = clearAll;
window.run = run;