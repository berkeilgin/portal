// ==================== STATE ====================
let existingData = null, existingHeaders = [], existingIdents = new Set();
let newData = null, newHeaders = [];
let newRows = [], dupRows = [];
let selectedPeriod = null;
let diffFilter = 'all', diffRows = 10;
let currentStep = 1;

// DOM Elements
const step1Next = document.getElementById('step1Next');
const step2Next = document.getElementById('step2Next');
const step3Next = document.getElementById('step3Next');
const exportBtn = document.getElementById('exportBtn');

// ==================== STEPPER ====================
function goToStep(step) {
  currentStep = step;
  for (let i = 1; i <= 4; i++) {
    const screen = document.getElementById(`step${i}`);
    const stepEl = document.querySelector(`.step[data-step="${i}"]`);
    if (i === step) {
      screen.classList.add('active');
      stepEl.classList.add('active');
      stepEl.classList.remove('done');
    } else {
      screen.classList.remove('active');
      stepEl.classList.remove('active');
      if (i < step) stepEl.classList.add('done');
      else stepEl.classList.remove('done');
    }
  }
  if (step === 3 && existingData && newData) runIdentCheck();
  if (step === 4) renderSheetsPreview();
}

// ==================== STEP 1: EXISTING FILE ====================
const existingDrop = document.getElementById('existingDrop');
const existingFile = document.getElementById('existingFile');

existingDrop.addEventListener('click', () => existingFile.click());
existingDrop.addEventListener('dragover', e => { e.preventDefault(); existingDrop.classList.add('drag'); });
existingDrop.addEventListener('dragleave', () => existingDrop.classList.remove('drag'));
existingDrop.addEventListener('drop', e => {
  e.preventDefault();
  existingDrop.classList.remove('drag');
  if (e.dataTransfer.files[0]) loadExistingFile(e.dataTransfer.files[0]);
});
existingFile.addEventListener('change', e => { if (e.target.files[0]) loadExistingFile(e.target.files[0]); });

function loadExistingFile(file) {
  if (!file.name.match(/\.xlsx?$/i)) { alert('Lütfen .xlsx dosyası yükleyin'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
    // Ana Sayfa sheetini bul
    const sheetName = wb.SheetNames.includes('Ana Sayfa') ? 'Ana Sayfa' : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    existingData = rows.map(r => r.map(c => String(c || '').trim()));
    existingHeaders = existingData[0] || [];
    
    // IDENT sütununu bul
    const identIdx = existingHeaders.findIndex(h => /ident/i.test(h));
    existingIdents.clear();
    if (identIdx >= 0) {
      existingData.slice(1).forEach(row => {
        if (row[identIdx]) existingIdents.add(row[identIdx].trim());
      });
    }
    
    const info = document.getElementById('existingInfo');
    info.style.display = 'block';
    info.innerHTML = `<strong>${file.name}</strong><br>${existingData.length-1} kayıt, ${existingHeaders.length} sütun, ${existingIdents.size} benzersiz IDENT`;
    
    const stats = document.getElementById('existingStats');
    stats.style.display = 'grid';
    stats.innerHTML = `
      <div class="stat-card"><div class="stat-value">${existingData.length-1}</div><div class="stat-label">Toplam Kayıt</div></div>
      <div class="stat-card"><div class="stat-value">${existingIdents.size}</div><div class="stat-label">Benzersiz IDENT</div></div>
      <div class="stat-card"><div class="stat-value">${existingHeaders.length}</div><div class="stat-label">Sütun Sayısı</div></div>
    `;
    existingDrop.innerHTML = '✅ ' + file.name;
    step1Next.disabled = !document.getElementById('projectName').value.trim();
  };
  reader.readAsArrayBuffer(file);
}

document.getElementById('projectName').addEventListener('input', () => {
  step1Next.disabled = !existingData || !document.getElementById('projectName').value.trim();
});

// Periyot seçimi
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedPeriod = btn.dataset.period;
  });
});

// ==================== STEP 2: NEW FILE ====================
const newDrop = document.getElementById('newDrop');
const newFileInput = document.getElementById('newFile');

newDrop.addEventListener('click', () => newFileInput.click());
newDrop.addEventListener('dragover', e => { e.preventDefault(); newDrop.classList.add('drag'); });
newDrop.addEventListener('dragleave', () => newDrop.classList.remove('drag'));
newDrop.addEventListener('drop', e => {
  e.preventDefault();
  newDrop.classList.remove('drag');
  if (e.dataTransfer.files[0]) loadNewFile(e.dataTransfer.files[0]);
});
newFileInput.addEventListener('change', e => { if (e.target.files[0]) loadNewFile(e.target.files[0]); });

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

function loadNewFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    let content = e.target.result;
    if (file.name.match(/\.xlsx?$/i)) {
      const wb = XLSX.read(content, { type: 'array' });
      content = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
    }
    const rows = content.split(/\r?\n/).filter(r => r.trim());
    newData = rows.map(r => parseCSVLine(r));
    newHeaders = newData[0] || [];
    
    document.getElementById('newInfo').style.display = 'block';
    document.getElementById('newInfo').innerHTML = `<strong>${file.name}</strong><br>${newData.length-1} satır, ${newHeaders.length} sütun`;
    newDrop.innerHTML = '✅ ' + file.name;
    
    // Başlık kontrolü
    const match = existingHeaders.filter(h => newHeaders.includes(h));
    const miss = existingHeaders.filter(h => !newHeaders.includes(h));
    const headerDiv = document.getElementById('headerValidation');
    headerDiv.style.display = 'block';
    document.getElementById('headerMatchList').innerHTML = `<strong>✅ Eşleşen (${match.length}):</strong> ${match.join(', ')}`;
    document.getElementById('headerMissList').innerHTML = `<strong>⚠️ Eksik (${miss.length}):</strong> ${miss.join(', ')}`;
    
    step2Next.disabled = false;
  };
  if (file.name.match(/\.xlsx?$/i)) reader.readAsArrayBuffer(file);
  else reader.readAsText(file, 'UTF-8');
}

// ==================== STEP 3: IDENT CHECK ====================
async function runIdentCheck() {
  const identIdx = newHeaders.findIndex(h => /ident/i.test(h));
  newRows = [];
  dupRows = [];
  
  for (let i = 1; i < newData.length; i++) {
    const row = newData[i];
    const ident = identIdx >= 0 ? (row[identIdx] || '').trim() : null;
    if (ident && existingIdents.has(ident)) {
      dupRows.push(row);
    } else {
      newRows.push(row);
    }
  }
  
  const total = newData.length - 1;
  const newCount = newRows.length;
  const dupCount = dupRows.length;
  const pct = total > 0 ? Math.round((newCount / total) * 100) : 0;
  
  document.getElementById('identStats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${newCount}</div><div class="stat-label">Yeni Kayıt</div></div>
    <div class="stat-card"><div class="stat-value">${dupCount}</div><div class="stat-label">Duplikasyon</div></div>
    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Toplam Gelen</div></div>
    <div class="stat-card"><div class="stat-value">${pct}%</div><div class="stat-label">Eklenme Oranı</div></div>
  `;
  
  document.getElementById('checkingPanel').style.display = 'none';
  document.getElementById('resultPanel').style.display = 'block';
  step3Next.disabled = newCount === 0;
  renderDiffTable();
}

function renderDiffTable() {
  let rows = [];
  if (diffFilter === 'all') {
    rows = [...newRows.map(r => ({ r, type: 'new' })), ...dupRows.map(r => ({ r, type: 'dup' }))];
  } else if (diffFilter === 'new') {
    rows = newRows.map(r => ({ r, type: 'new' }));
  } else {
    rows = dupRows.map(r => ({ r, type: 'dup' }));
  }
  rows = rows.slice(0, diffRows);
  
  const head = '<th>Durum</th>' + (newHeaders.slice(0, 6).map(h => `<th>${escapeHtml(h)}</th>`).join(''));
  document.getElementById('diffHead').innerHTML = head;
  
  document.getElementById('diffBody').innerHTML = rows.map(({ r, type }) => `
    <tr class="row-${type}">
      <td>${type === 'new' ? '✅ Yeni' : '✕ Dup'}</td>
      ${r.slice(0, 6).map(c => `<td>${escapeHtml(c)}</td>`).join('')}
    </tr>
  `).join('') || '<tr><td colspan="7">Gösterilecek kayıt yok</td></tr>';
}

function setDiffFilter(filter) {
  diffFilter = filter;
  renderDiffTable();
}

function setDiffRows(rows) {
  diffRows = rows;
  renderDiffTable();
}

// ==================== STEP 4: EXPORT ====================
function renderSheetsPreview() {
  exportBtn.disabled = newRows.length === 0;
}

function doExport() {
  const projectName = document.getElementById('projectName').value.trim();
  const updateNote = document.getElementById('updateNote').value.trim();
  const statusEl = document.getElementById('exportStatus');
  
  if (!projectName) {
    statusEl.style.display = 'block';
    statusEl.textContent = '⚠️ Proje adı girilmedi!';
    statusEl.className = 'status-bar err';
    return;
  }
  if (newRows.length === 0) {
    statusEl.style.display = 'block';
    statusEl.textContent = '⚠️ Eklenecek yeni kayıt yok!';
    statusEl.className = 'status-bar err';
    return;
  }
  
  // Birleştirilmiş veri: mevcut + yeni
  const combined = [
    existingHeaders,
    ...existingData.slice(1),
    ...newRows
  ];
  
  if (updateNote) {
    combined.splice(1, 0, [`[Güncelleme Notu: ${updateNote} · ${new Date().toLocaleDateString('tr-TR')} · +${newRows.length} kayıt]`]);
  }
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(combined), 'Ana Sayfa');
  
  // Diğer sheetler için placeholder (içerik eklenebilir)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Özet - Güncellendi']]), 'Özet');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Değerlendirici Özet - Güncellendi']]), 'Değerlendirici Özet');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Kriter Bazlı | Ay']]), 'Kriter Bazlı | Ay');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Kriter Bazlı | Hafta']]), 'Kriter Bazlı | Hafta');
  
  const fileName = `${projectName}_Güncelleme_${new Date().toLocaleDateString('tr-TR').replace(/\./g, '-')}.xlsx`;
  XLSX.writeFile(wb, fileName);
  
  statusEl.style.display = 'block';
  statusEl.textContent = `✅ ${fileName} indirildi. +${newRows.length} yeni kayıt eklendi, ${dupRows.length} duplikasyon hariç.`;
  statusEl.className = 'status-bar ok';
}

// ==================== NAVIGATION ====================
document.getElementById('step1Next').onclick = () => goToStep(2);
document.getElementById('step2Next').onclick = () => goToStep(3);
document.getElementById('step3Next').onclick = () => goToStep(4);

// ==================== UTILITIES ====================
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}