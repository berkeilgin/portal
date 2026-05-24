// ==================== STATE ====================
let data1 = [], data2 = [], detayLoaded = false;

// ==================== DOM ELEMENTS ====================
const file1Input = document.getElementById('file1');
const file2Input = document.getElementById('file2');
const cnt1Span = document.getElementById('cnt1');
const cnt2Span = document.getElementById('cnt2');
const exportBtn = document.getElementById('exportBtn');
const loaderBar = document.getElementById('loaderBar');
const status1Div = document.getElementById('status1');
const status2Div = document.getElementById('status2');
const card1 = document.getElementById('card1');
const card2 = document.getElementById('card2');

// ==================== HELPER FUNCTIONS ====================
function updateCounts() {
  cnt1Span.textContent = data1.length;
  cnt2Span.textContent = data2.length;
  exportBtn.disabled = !(data1.length && detayLoaded);
}

function setUploadStatus(id, msg, type) {
  const el = document.getElementById('status' + id);
  el.textContent = msg;
  el.className = 'upload-status' + (type ? ' ' + type : '');
}

function excelDateToJSDate(serial) {
  const days = Math.floor(serial), fraction = serial - days;
  const date = new Date(1899, 11, 30);
  date.setDate(date.getDate() + days);
  date.setSeconds(date.getSeconds() + Math.round(fraction * 86400));
  return date;
}

function parseDate(val) {
  if (!val) return '';
  if (!isNaN(val)) return formatDateTR(excelDateToJSDate(Number(val)));
  const d = new Date(val);
  if (!isNaN(d)) return formatDateTR(d);
  return val;
}

function formatDateTR(d) {
  const tr = new Intl.DateTimeFormat('tr-TR', {
    year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d);
  const get = t => tr.find(x => x.type === t)?.value;
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

function toNumber(val) { return Number(String(val).replace(',', '.')) || 0; }

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// ==================== FILE LOADING ====================
async function loadOzetFiles(files) {
  setUploadStatus(1, '⏳ Yükleniyor…', 'loading');
  card1.classList.remove('loaded');
  let allRows = [];
  for (const f of Array.from(files)) {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);
    let rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    rows = rows.filter(r => r['Iptal'] === 'Hayır').map(r => {
      const obj = {};
      for (let k in r) {
        let v = r[k];
        if (k.includes('Tarih')) v = parseDate(v);
        obj[k] = v;
      }
      obj.Puan = toNumber(obj.Puan);
      return obj;
    });
    allRows = allRows.concat(rows);
  }
  data1 = allRows;
  setUploadStatus(1, `✅ ${data1.length} kayıt yüklendi`, 'ok');
  card1.classList.add('loaded');
  updateCounts();
}

async function loadDetayFiles(files) {
  setUploadStatus(2, '⏳ Yükleniyor…', 'loading');
  card2.classList.remove('loaded');
  let allRows = [];
  for (const f of Array.from(files)) {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);
    let rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    rows = rows.map(r => {
      const obj = {};
      for (let k in r) {
        let v = r[k];
        if (k === 'Cevap' || k === 'Soru') v = String(v || '').replace(/\s+/g, ' ').trim();
        if (k.includes('Tarih')) v = parseDate(v);
        obj[k] = v;
      }
      obj.Puan = toNumber(obj.Puan);
      obj.Sure = toNumber(obj.Sure);
      return obj;
    }).filter(r => r['Iptal'] === 'Hayır');
    allRows = allRows.concat(rows);
  }
  data2 = allRows;
  detayLoaded = true;
  setUploadStatus(2, `✅ ${data2.length} kayıt yüklendi`, 'ok');
  card2.classList.add('loaded');
  updateCounts();
}

// ==================== EVENT HANDLERS ====================
file1Input.addEventListener('change', e => {
  if (e.target.files.length) loadOzetFiles(e.target.files);
});
file2Input.addEventListener('change', e => {
  if (e.target.files.length) loadDetayFiles(e.target.files);
});

// Drag & Drop için setup
function setupDrop(dropId, inputId, loadFunc) {
  const drop = document.getElementById(dropId);
  const input = document.getElementById(inputId);
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (e.dataTransfer.files.length) {
      // Simulate change event on input
      const dt = new DataTransfer();
      for (let f of e.dataTransfer.files) dt.items.add(f);
      input.files = dt.files;
      const event = new Event('change', { bubbles: true });
      input.dispatchEvent(event);
    }
  });
}
setupDrop('drop1', 'file1', loadOzetFiles);
setupDrop('drop2', 'file2', loadDetayFiles);

// ==================== EXPORT ====================
function exportAll() {
  if (!data1.length) { alert('Özet data yok'); return; }
  if (!detayLoaded) { alert('Detay yüklenmeden export olmaz'); return; }
  loaderBar.classList.add('visible');
  setTimeout(() => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data1), 'Özet Data');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data2), 'Detay Data');
    const d = new Date();
    const name = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}_TrendyolMPData.xlsx`;
    XLSX.writeFile(wb, name);
    loaderBar.classList.remove('visible');
  }, 150);
}

function resetAll() {
  data1 = [];
  data2 = [];
  detayLoaded = false;
  file1Input.value = '';
  file2Input.value = '';
  setUploadStatus(1, 'Bekleniyor…', '');
  setUploadStatus(2, 'Bekleniyor…', '');
  card1.classList.remove('loaded');
  card2.classList.remove('loaded');
  updateCounts();
}

// Global exports for inline onclick
window.exportAll = exportAll;
window.resetAll = resetAll;