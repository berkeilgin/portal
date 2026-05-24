// ==================== GLOBAL STATE ====================
let rawData = [], numericCols = [], selectedCols = [], corrMatrix = [], colsUsed = [], logItems = [];
let lastAiData = null;
let fileSha = null;

// ==================== RENK KURALLARI ====================
const RULES = [
  { test: v => v <= -0.7,             bg: 'FB80B0', fg: '000000' },
  { test: v => v > -0.7 && v < -0.4, bg: 'FED3E4', fg: '000000' },
  { test: v => v >= -0.4 && v < 0.4, bg: null,     fg: null     },
  { test: v => v >= 0.4 && v < 0.7,  bg: 'BBFFF7', fg: '000000' },
  { test: v => v >= 0.7,             bg: '35FFE6', fg: '000000' },
];
function getRule(v) { return RULES.find(r => r.test(v)) || RULES[2]; }

// ==================== PROJE ADI & DOSYA ADI ====================
const projectNameInput = document.getElementById('projectNameInput');
const fileNamePreview = document.getElementById('fileNamePreview');
function getExportFileName(ext) {
  const proj = projectNameInput.value.trim() || 'Proje';
  const now = new Date();
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  return `${proj}_TP_Korelasyon-${months[now.getMonth()]}-${now.getFullYear()}.${ext}`;
}
function updatePreview() { fileNamePreview.textContent = '→ ' + getExportFileName('xlsx'); }
projectNameInput.addEventListener('input', updatePreview);
updatePreview();

function checkProjectName() {
  const val = projectNameInput.value.trim();
  if (!val) {
    projectNameInput.style.borderColor = 'var(--accent3)';
    projectNameInput.style.boxShadow = '0 0 0 3px rgba(239,83,80,0.25)';
    showProjectNameToast();
    return false;
  }
  projectNameInput.style.borderColor = '';
  projectNameInput.style.boxShadow = '';
  return true;
}
projectNameInput.addEventListener('input', () => {
  if (projectNameInput.value.trim()) {
    projectNameInput.style.borderColor = 'var(--accent2)';
    projectNameInput.style.boxShadow = '0 0 0 3px rgba(124,109,250,0.18)';
  } else {
    projectNameInput.style.borderColor = 'var(--accent3)';
    projectNameInput.style.boxShadow = '0 0 0 3px rgba(239,83,80,0.15)';
  }
});
function showProjectNameToast() {
  let t = document.getElementById('projNameToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'projNameToast';
    t.style.cssText = `position:fixed;top:24px;left:50%;transform:translateX(-50%);background:var(--accent3);color:#fff;padding:12px 22px;border-radius:10px;font-size:13px;font-weight:bold;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.4);display:flex;align-items:center;gap:10px;animation:slideDown .25s ease;`;
    const style = document.createElement('style');
    style.textContent = '@keyframes slideDown{from{opacity:0;transform:translate(-50%,-16px)}to{opacity:1;transform:translate(-50%,0)}}';
    document.head.appendChild(style);
    document.body.appendChild(t);
  }
  t.innerHTML = '⚠️ PDF veya Excel export için <b>Proje Adı</b> girilmesi zorunludur.';
  t.style.display = 'flex';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, 3500);
}

// ==================== STATS ====================
function colVals(col) { return rawData.map(r => parseFloat(r[col])).filter(v => !isNaN(v)); }
function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxy += xs[i] * ys[i]; sx2 += xs[i] ** 2; sy2 += ys[i] ** 2; }
  const num = n * sxy - sx * sy, den = Math.sqrt((n * sx2 - sx ** 2) * (n * sy2 - sy ** 2));
  return den === 0 ? 0 : num / den;
}
function rankArr(arr) {
  const s = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = new Array(arr.length); let i = 0;
  while (i < s.length) { let j = i; while (j < s.length && s[j].v === s[i].v) j++; const avg = (i + j + 1) / 2; for (let k = i; k < j; k++) r[s[k].i] = avg; i = j; }
  return r;
}
function spearman(xs, ys) { return pearson(rankArr(xs), rankArr(ys)); }

// ==================== DOM ELEMENTS ====================
const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const statusEl = document.getElementById('status');
const tooltip = document.getElementById('tooltip');

// ==================== DROP / FILE ====================
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

function setStatus(msg, err = false) {
  statusEl.textContent = msg;
  statusEl.className = 'status-bar' + (err ? ' err' : ' ok');
}

// ==================== DATE / TEXT DETECTION ====================
const monthNames = ['ocak','şubat','mart','nisan','mayıs','haziran','temmuz','ağustos','eylül','ekim','kasım','aralık',
  'january','february','march','april','may','june','july','august','september','october','november','december',
  'jan','feb','mar','apr','jun','jul','aug','sep','oct','nov','dec'];
const weekNames = ['hafta','week','hf','wk','pazartesi','salı','çarşamba','perşembe','cuma','cumartesi','pazar',
  'monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

function looksLikeDateOrText(fieldName, vals) {
  const nameLow = fieldName.toLowerCase();
  if (monthNames.some(m => nameLow.includes(m))) return 'ay_ismi';
  if (weekNames.some(w => nameLow.includes(w))) return 'hafta_takvim';
  if (/\b(tarih|date|time|zaman|dönem|period|yil|year|quarter|q[1-4])\b/.test(nameLow)) return 'tarih';
  const strVals = vals.map(v => String(v || '').toLowerCase().trim()).filter(v => v !== '');
  const textCount = strVals.filter(v => isNaN(parseFloat(v)) && v !== '').length;
  if (textCount > 0) return 'metin_deger';
  return null;
}

function validateData(data, fields) {
  const errors = [];
  if (data.length < 2) errors.push(`<b>Satır sayısı yetersiz:</b> Yüklenen dosyada yalnızca ${data.length} satır var. En az 5 satır gereklidir.`);
  else if (data.length < 5) errors.push(`<b>Az satır uyarısı:</b> Yalnızca ${data.length} satır var. Güvenilir korelasyon için 20+ satır önerilir.`);
  const suspectCols = [];
  fields.forEach(f => { const vals = data.map(r => r[f]).filter(v => v !== null && v !== undefined); const reason = looksLikeDateOrText(f, vals); if (reason) suspectCols.push({ col: f, reason }); });
  const nonNumericFields = fields.filter(f => { const vals = data.map(r => r[f]).filter(v => v !== null && v !== '' && v !== undefined); if (vals.length === 0) return false; return !vals.every(v => !isNaN(parseFloat(v))); });
  if (suspectCols.length > 0) { const names = suspectCols.map(s => `"${s.col}"`).join(', '); errors.push(`<b>Uygunsuz sütun tespit edildi:</b> ${names} — Bu sütunlar analize dahil edilmemelidir.`); }
  if (nonNumericFields.length > 0) { const names = nonNumericFields.slice(0, 5).map(f => `"${f}"`).join(', '); errors.push(`<b>Sayısal olmayan sütun:</b> ${names}${nonNumericFields.length > 5 ? ` ve ${nonNumericFields.length - 5} diğeri` : ''} — Sayısal değer içermiyor.`); }
  const numFields = fields.filter(f => { const vals = data.map(r => r[f]).filter(v => v !== null && v !== '' && v !== undefined); return vals.length > 0 && vals.every(v => !isNaN(parseFloat(v))); });
  if (numFields.length < 2) errors.push(`<b>Yetersiz sayısal sütun:</b> Analiz için en az 2 sayısal sütun gerekli, ancak yalnızca ${numFields.length} sayısal sütun bulundu.`);
  return { errors, hasBlockingErrors: errors.filter(e => !e.includes('uyarı') && !e.includes('yüksek eksik')).length > 0 };
}

function handleFile(file) {
  if (!file) return;
  setStatus('Dosya okunuyor...');
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const r = new FileReader();
    r.onload = ev => { const res = Papa.parse(ev.target.result, { header: true, dynamicTyping: true, skipEmptyLines: true }); processLoadedData(res.data, res.meta.fields, file.name); };
    r.readAsText(file, 'UTF-8');
  } else if (['xlsx', 'xls'].includes(ext)) {
    const r = new FileReader();
    r.onload = ev => {
      try { const wb = XLSX.read(ev.target.result, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; const json = XLSX.utils.sheet_to_json(ws, { defval: null }); processLoadedData(json, json.length ? Object.keys(json[0]) : [], file.name); }
      catch (e) { setStatus('Dosya okunamadı.', true); alert('Dosya okunamadı. Lütfen dosyayı kontrol edin.'); }
    };
    r.readAsArrayBuffer(file);
  } else { setStatus('Desteklenmeyen format.', true); }
}

function processLoadedData(data, fields, name) {
  if (!fields || fields.length === 0) { setStatus('Dosya boş veya başlık satırı yok.', true); return; }
  const { errors, hasBlockingErrors } = validateData(data, fields);
  if (errors.length > 0) {
    alert('Veri uyarıları:\n' + errors.join('\n'));
    if (hasBlockingErrors) { setStatus('Veri hatası — dosyanızı kontrol edin.', true); return; }
  }
  loadData(data, fields, name);
}

function loadData(data, fields, name) {
  rawData = data;
  numericCols = fields.filter(f => { const vals = data.map(r => r[f]).filter(v => v !== null && v !== '' && v !== undefined); return vals.length > 0 && vals.every(v => !isNaN(parseFloat(v))); });
  if (numericCols.length < 2) { setStatus('Hata: en az 2 sayısal sütun gerekli.', true); return; }
  setStatus(`✅ ${name} yüklendi — ${data.length} satır, ${numericCols.length} sayısal sütun`);
  const mc = document.getElementById('metaCards');
  mc.style.display = 'flex';
  mc.innerHTML = `<div class="card"><div class="card-label">Satır</div><div class="card-value">${data.length.toLocaleString('tr')}</div></div>
    <div class="card"><div class="card-label">Toplam Sütun</div><div class="card-value">${fields.length}</div></div>
    <div class="card"><div class="card-label">Sayısal Sütun</div><div class="card-value">${numericCols.length}</div></div>
    <div class="card"><div class="card-label">Dosya</div><div class="card-value" style="font-size:13px;">${name}</div></div>`;
  selectedCols = [...numericCols];
  renderColTags();
  document.getElementById('controls').style.display = 'block';
  document.getElementById('results').style.display = 'none';
}

function renderColTags() {
  const wrap = document.getElementById('colTags'); wrap.innerHTML = '';
  numericCols.forEach(c => {
    const t = document.createElement('span');
    t.className = 'col-tag' + (selectedCols.includes(c) ? ' on' : '');
    t.textContent = c;
    t.dataset.col = c;
    t.addEventListener('click', () => {
      const i = selectedCols.indexOf(c);
      if (i >= 0) { selectedCols.splice(i, 1); t.classList.remove('on'); }
      else { selectedCols.push(c); t.classList.add('on'); }
      updateSelectAllBtn();
    });
    wrap.appendChild(t);
  });
  updateSelectAllBtn();
}
function updateSelectAllBtn() {
  const btn = document.getElementById('selectAllBtn');
  btn.textContent = numericCols.every(c => selectedCols.includes(c)) ? '☐ Tümünü Kaldır' : '☑ Tümünü Seç';
}
document.getElementById('selectAllBtn').addEventListener('click', () => {
  const allSel = numericCols.every(c => selectedCols.includes(c));
  if (allSel) { selectedCols = []; document.querySelectorAll('.col-tag').forEach(t => t.classList.remove('on')); }
  else { selectedCols = [...numericCols]; document.querySelectorAll('.col-tag').forEach(t => t.classList.add('on')); }
  updateSelectAllBtn();
});

// ==================== RUN ANALYSIS ====================
document.getElementById('runBtn').addEventListener('click', runAnalysis);
document.getElementById('rerunAi').addEventListener('click', runAiComment);

function runAnalysis() {
  if (selectedCols.length < 2) { setStatus('En az 2 sütun seçin.', true); return; }
  const method = document.getElementById('methodSel').value;
  colsUsed = [...selectedCols];
  corrMatrix = colsUsed.map(ci => colsUsed.map(cj => {
    if (ci === cj) return 1;
    return method === 'pearson' ? pearson(colVals(ci), colVals(cj)) : spearman(colVals(ci), colVals(cj));
  }));
  drawHeatmap(colsUsed, corrMatrix);
  buildTable(colsUsed, corrMatrix);
  addLog(`[${new Date().toLocaleTimeString('tr')}] ${method.toUpperCase()} · ${colsUsed.length} sütun`);
  document.getElementById('results').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setStatus(`✅ Analiz tamamlandı — ${colsUsed.length}×${colsUsed.length} matris`);
  runAiComment();
}

// ==================== HEATMAP ====================
function measureMaxLabelWidth(cols, fontSize) {
  const tmp = document.createElement('canvas');
  const ctx = tmp.getContext('2d');
  ctx.font = `${fontSize}px Arial`;
  return Math.max(...cols.map(c => ctx.measureText(c).width));
}

function drawHeatmap(cols, matrix) {
  const isLight = document.body.classList.contains('light');
  const n = cols.length;
  const cell = Math.max(36, Math.min(72, Math.floor(760 / n)));
  const fs = Math.max(8, Math.min(11, cell / 5.5));
  const maxLabelChars = Math.max(10, Math.floor(cell * 1.6 / (fs * 0.6)));
  const displayLabels = cols.map(c => c.length > maxLabelChars ? c.slice(0, maxLabelChars - 1) + '…' : c);
  const tmp = document.createElement('canvas');
  const tmpCtx = tmp.getContext('2d');
  tmpCtx.font = `${fs}px Arial`;
  const maxRowLabelW = Math.max(...displayLabels.map(l => tmpCtx.measureText(l).width));
  const labelH = Math.max(60, Math.min(160, maxRowLabelW + 16));
  const labelW = Math.max(80, Math.min(200, maxRowLabelW + 16));
  const W = labelW + n * cell;
  const H = labelH + n * cell;
  const canvas = document.getElementById('heatmapCanvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = isLight ? '#f5f5f5' : '#1e1e2f';
  ctx.fillRect(0, 0, W, H);
  ctx.font = `${fs}px Arial`;
  displayLabels.forEach((c, i) => {
    ctx.fillStyle = isLight ? '#555' : '#aaa';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(c, labelW - 8, labelH + i * cell + cell / 2);
  });
  matrix.forEach((row, i) => {
    row.forEach((val, j) => {
      if (j > i) return;
      const x = labelW + j * cell, y = labelH + i * cell;
      const rule = getRule(val);
      ctx.fillStyle = rule.bg ? ('#' + rule.bg) : (isLight ? '#e0e0e0' : '#2c2c3e');
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.fillStyle = rule.bg ? ('#' + rule.fg) : (isLight ? '#222' : '#ddd');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${i === j ? 'bold ' : ''}${fs}px Arial`;
      if (i === j) ctx.fillText('—', x + cell / 2, y + cell / 2);
      else if (val !== 0) ctx.fillText(val.toFixed(2), x + cell / 2, y + cell / 2);
    });
  });
  displayLabels.forEach((c, j) => {
    ctx.fillStyle = isLight ? '#555' : '#aaa';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(labelW + j * cell + cell / 2, labelH - 8);
    ctx.rotate(-Math.PI / 4);
    ctx.font = `${fs}px Arial`;
    ctx.fillText(c, 0, 0);
    ctx.restore();
  });
  canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width, scaleY = H / rect.height;
    const mx = (e.clientX - rect.left) * scaleX, my = (e.clientY - rect.top) * scaleY;
    const ci = Math.floor((mx - labelW) / cell), ri = Math.floor((my - labelH) / cell);
    if (ci >= 0 && ci < n && ri >= 0 && ri < n && ri >= ci) {
      const v = matrix[ri][ci];
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top = (e.clientY + 14) + 'px';
      if (ri === ci) tooltip.innerHTML = `<b>${cols[ri]}</b><br>Köşegen (r = 1.00)`;
      else {
        const strength = Math.abs(v) >= 0.7 ? 'Güçlü' : Math.abs(v) >= 0.4 ? 'Orta' : 'Zayıf';
        const dir = v > 0.01 ? 'pozitif' : v < -0.01 ? 'negatif' : 'ilişki yok';
        tooltip.innerHTML = `<b>${cols[ri]}</b><br><b>${cols[ci]}</b><br>r = ${v.toFixed(4)}<br>${strength} ${dir}`;
      }
    } else { tooltip.style.display = 'none'; }
  };
  canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
}

// ==================== HTML TABLE ====================
function buildTable(cols, matrix) {
  let h = `<thead><tr><th></th>${cols.map(c => `<th>${c}</th>`).join('')}</thead><tbody>`;
  matrix.forEach((row, i) => {
    h += `<tr><th style="text-align:left">${cols[i]}</th>`;
    row.forEach((val, j) => {
      if (j > i) h += `<td style="background:transparent;color:transparent;">.</td>`;
      else if (i === j) h += `<td style="font-weight:bold;text-align:center;">—</td>`;
      else {
        const rule = getRule(val);
        const bg = rule.bg ? `#${rule.bg}` : '';
        const clr = rule.bg ? `#${rule.fg}` : 'inherit';
        const display = (val === 0) ? '' : val.toFixed(2);
        h += `<td style="background:${bg};color:${clr};" title="${cols[i]} × ${cols[j]}: r=${val.toFixed(4)}">${display}</td>`;
      }
    });
    h += `</tr>`;
  });
  h += `</tbody>`;
  document.getElementById('tableWrap').innerHTML = h;
}

// ==================== AI COMMENT ====================
async function runAiComment() {
  if (!corrMatrix.length) return;
  const aiContent = document.getElementById('aiContent');
  aiContent.innerHTML = `<div class="ai-loading"><div class="spinner"></div>Korelasyon verileri analiz ediliyor...</div>`;
  const pairs = [];
  for (let i = 1; i < colsUsed.length; i++) {
    for (let j = 0; j < i; j++) { const v = corrMatrix[i][j]; if (Math.abs(v) >= 0.4) pairs.push({ a: colsUsed[i], b: colsUsed[j], r: v }); }
  }
  pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
  const topPairs = pairs.slice(0, 10).map(p => `${p.a} ↔ ${p.b}: r=${p.r.toFixed(3)} (${Math.abs(p.r) >= 0.7 ? 'çok güçlü' : 'orta'} ${p.r > 0 ? 'pozitif' : 'negatif'})`).join('\n');
  const allStats = colsUsed.map(c => { const vals = colVals(c); const mean = vals.reduce((a, b) => a + b, 0) / vals.length; const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length); return `${c}: ort=${mean.toFixed(2)}, std=${std.toFixed(2)}, n=${vals.length}`; }).join('\n');
  const projeName = projectNameInput.value.trim() || 'Bu proje';
  const prompt = `Sen bir veri analizi uzmanısın. Aşağıdaki korelasyon analizi sonuçlarını değerlendiriyorsun.
Proje: "${projeName}"
Yöntem: ${document.getElementById('methodSel').value.toUpperCase()}
Sütun sayısı: ${colsUsed.length}
Anlamlı korelasyon çiftleri (|r| ≥ 0.4):
${topPairs || 'Anlamlı korelasyon bulunamadı (tüm |r| < 0.4)'}
Sütun istatistikleri:
${allStats}
Lütfen JSON formatında yanıt ver (sadece JSON, başka hiçbir şey yazma):
{"teknik":{"baslik":"Teknik Korelasyon Özeti","maddeler":["...","..."]},"roadmap":{"baslik":"Önerilen Roadmap","maddeler":["...","..."]},"ongorular":{"baslik":"Öngörüler & Trendler","maddeler":["...","..."]},"riskler":{"baslik":"Riskler & Uyarılar","maddeler":["...","..."]},"oneriler":{"baslik":"Stratejik Öneriler","maddeler":["...","..."]}}`;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
    });
    const data = await response.json();
    const text = data.content?.map(i => i.text || '').join('') || '';
    const clean = text.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch (e) { throw new Error('parse'); }
    lastAiData = { parsed, pairs };
    renderAiComment(parsed, pairs);
  } catch (err) { renderAiCommentFallback(pairs); }
}
function renderAiComment(data, pairs) {
  const aiContent = document.getElementById('aiContent');
  const sectionMap = [
    { key: 'teknik', cls: 'ai-technical', icon: '🔬' },
    { key: 'roadmap', cls: 'ai-roadmap', icon: '🗺️' },
    { key: 'ongorular', cls: 'ai-forecast', icon: '📈' },
    { key: 'riskler', cls: 'ai-risks', icon: '⚠️' },
    { key: 'oneriler', cls: 'ai-suggestions', icon: '💡' },
  ];
  const sp = pairs.filter(p => p.r >= 0.7).slice(0, 5);
  const mp = pairs.filter(p => p.r >= 0.4 && p.r < 0.7).slice(0, 5);
  const sn = pairs.filter(p => p.r <= -0.7).slice(0, 5);
  const mn = pairs.filter(p => p.r <= -0.4 && p.r > -0.7).slice(0, 5);
  let badgeHtml = '';
  if (sp.length || mp.length || sn.length || mn.length) {
    badgeHtml = `<div style="margin-bottom:18px">`;
    sp.forEach(p => badgeHtml += `<span class="corr-pair-badge strong-pos" title="r=${p.r.toFixed(3)}">${p.a} ↔ ${p.b}</span>`);
    mp.forEach(p => badgeHtml += `<span class="corr-pair-badge mid-pos" title="r=${p.r.toFixed(3)}">${p.a} ↔ ${p.b}</span>`);
    sn.forEach(p => badgeHtml += `<span class="corr-pair-badge strong-neg" title="r=${p.r.toFixed(3)}">${p.a} ↔ ${p.b}</span>`);
    mn.forEach(p => badgeHtml += `<span class="corr-pair-badge mid-neg" title="r=${p.r.toFixed(3)}">${p.a} ↔ ${p.b}</span>`);
    badgeHtml += `</div>`;
  }
  let html = badgeHtml;
  sectionMap.forEach(({ key, cls, icon }) => {
    const sec = data[key];
    if (!sec) return;
    html += `<div class="ai-section"><div class="ai-section-title ${cls}">${icon} ${sec.baslik || key}</div><ul>${(sec.maddeler || []).map(m => `<li>${m}</li>`).join('')}</ul></div>`;
  });
  aiContent.innerHTML = html || '<div style="color:var(--muted)">Yorum üretilemedi.</div>';
}
function renderAiCommentFallback(pairs) {
  const sp = pairs.filter(p => p.r >= 0.7);
  const mp = pairs.filter(p => p.r >= 0.4 && p.r < 0.7);
  const sn = pairs.filter(p => p.r <= -0.7);
  const mn = pairs.filter(p => p.r <= -0.4 && p.r > -0.7);
  let badgeHtml = '';
  if (sp.length || mp.length || sn.length || mn.length) {
    badgeHtml = `<div style="margin-bottom:18px">`;
    sp.slice(0, 5).forEach(p => badgeHtml += `<span class="corr-pair-badge strong-pos">${p.a} ↔ ${p.b}</span>`);
    mp.slice(0, 5).forEach(p => badgeHtml += `<span class="corr-pair-badge mid-pos">${p.a} ↔ ${p.b}</span>`);
    sn.slice(0, 5).forEach(p => badgeHtml += `<span class="corr-pair-badge strong-neg">${p.a} ↔ ${p.b}</span>`);
    mn.slice(0, 5).forEach(p => badgeHtml += `<span class="corr-pair-badge mid-neg">${p.a} ↔ ${p.b}</span>`);
    badgeHtml += `</div>`;
  }
  const html = badgeHtml + `
    <div class="ai-section"><div class="ai-section-title ai-technical">🔬 Teknik Özet</div><ul><li>${sp.length} çok güçlü pozitif, ${mp.length} orta pozitif, ${sn.length} çok güçlü negatif, ${mn.length} orta negatif korelasyon.</li>${sp.slice(0, 3).map(p => `<li><b>${p.a}</b> ile <b>${p.b}</b> arasında çok güçlü pozitif ilişki (r=${p.r.toFixed(3)}).</li>`).join('')}${sn.slice(0, 3).map(p => `<li><b>${p.a}</b> ile <b>${p.b}</b> arasında çok güçlü negatif ilişki (r=${p.r.toFixed(3)}).</li>`).join('')}</ul></div>
    <div class="ai-section"><div class="ai-section-title ai-roadmap">🗺️ Önerilen Roadmap</div><ul><li>Yüksek korelasyonlu değişken çiftleri için ek veri toplama çalışması başlatın.</li><li>Negatif korelasyonlar için dengeleme stratejisi geliştirin.</li></ul></div>
    <div class="ai-section"><div class="ai-section-title ai-risks">⚠️ Riskler</div><ul><li>Çok güçlü korelasyonlar çoklu doğrusallık riskini artırır.</li><li>Korelasyon nedensellik değildir; yorumlarda dikkatli olunmalı.</li></ul></div>
    <div class="ai-section"><div class="ai-section-title ai-suggestions">💡 Öneriler</div><ul><li>Güçlü korelasyonlu değişkenlerden biri makine öğrenmesi modellerinde özellik seçiminden çıkarılabilir.</li></ul></div>`;
  document.getElementById('aiContent').innerHTML = html;
}

// ==================== PNG EXPORT ====================
document.getElementById('exportPng').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = document.getElementById('heatmapCanvas').toDataURL('image/png');
  a.download = getExportFileName('png');
  a.click();
});

// ==================== PDF EXPORT ====================
document.getElementById('exportPdf').addEventListener('click', exportPdf);
function exportPdf() {
  if (!corrMatrix.length) { alert('Önce analizi çalıştırın.'); return; }
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { alert('PDF kütüphanesi yüklenemedi.'); return; }
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const proj = projectNameInput.value.trim() || 'Proje';
  const now = new Date();
  const dateStr = now.toLocaleDateString('tr-TR');
  const method = document.getElementById('methodSel').value.toUpperCase();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  function addPageHeader(doc, title, pageNum) {
    doc.setFillColor(44, 44, 62); doc.rect(0, 0, W, 16, 'F');
    doc.setTextColor(76, 175, 80); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(`Korelasyon Analizi — ${proj}`, 10, 10);
    doc.setTextColor(180, 180, 180); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`${title} | ${method} | ${dateStr} | Sayfa ${pageNum}/3`, W - 10, 10, { align: 'right' });
    doc.setTextColor(76, 175, 80); doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text(title, 10, 25);
  }

  // Sayfa 1: Isı Haritası
  addPageHeader(doc, '🗺 Isı Haritası', 1);
  const canvas = document.getElementById('heatmapCanvas');
  const imgData = canvas.toDataURL('image/png');
  const cW = canvas.width / (window.devicePixelRatio || 1);
  const cH = canvas.height / (window.devicePixelRatio || 1);
  const maxW = W - 20, maxH = H - 40;
  let drawW = cW, drawH = cH;
  if (drawW > maxW) { drawH = drawH * maxW / drawW; drawW = maxW; }
  if (drawH > maxH) { drawW = drawW * maxH / drawH; drawH = maxH; }
  const xOff = (W - drawW) / 2;
  doc.addImage(imgData, 'PNG', xOff, 30, drawW, drawH);
  const legY = 30 + drawH + 4;
  const legendItems = [
    { color: [251, 128, 176], label: '≤ -0.7 Çok Güçlü Negatif' },
    { color: [254, 211, 228], label: '-0.7 → -0.4 Orta Negatif' },
    { color: [68, 68, 68], label: '|r| < 0.4 Zayıf' },
    { color: [187, 255, 247], label: '+0.4 → +0.7 Orta Pozitif' },
    { color: [53, 255, 230], label: '≥ +0.7 Çok Güçlü Pozitif' },
  ];
  if (legY < H - 10) {
    let lx = 10;
    legendItems.forEach(li => {
      doc.setFillColor(...li.color); doc.rect(lx, legY, 5, 3.5, 'F');
      doc.setTextColor(180, 180, 180); doc.setFontSize(7); doc.text(li.label, lx + 6.5, legY + 2.8);
      lx += 52;
    });
  }

  // Sayfa 2: Tablo
  doc.addPage();
  addPageHeader(doc, '📋 Korelasyon Tablosu', 2);
  const head = [['', ...colsUsed]];
  const body = corrMatrix.map((row, i) => [colsUsed[i], ...row.map((val, j) => {
    if (i === j) return '—';
    if (j > i) return '';
    if (val === 0) return '';
    return val.toFixed(2);
  })]);
  const cellStyles = {};
  corrMatrix.forEach((row, i) => {
    row.forEach((val, j) => {
      if (i === j || j > i || val === 0) return;
      const rule = getRule(val);
      if (rule.bg) {
        const r = parseInt(rule.bg.slice(0, 2), 16), g = parseInt(rule.bg.slice(2, 4), 16), b = parseInt(rule.bg.slice(4, 6), 16);
        cellStyles[`${i}-${j}`] = { fillColor: [r, g, b], textColor: [0, 0, 0] };
      }
    });
  });
  doc.autoTable({
    head, body, startY: 32, theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2, halign: 'center', font: 'helvetica', textColor: [200, 200, 200], fillColor: [30, 30, 47], lineColor: [80, 80, 100], lineWidth: 0.3 },
    headStyles: { fillColor: [44, 44, 62], textColor: [76, 175, 80], fontStyle: 'bold', fontSize: 7 },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', fillColor: [44, 44, 62], textColor: [76, 175, 80] } },
    didParseCell: function (data) {
      if (data.section === 'body' && data.column.index > 0) {
        const ri = data.row.index, ci = data.column.index - 1;
        const style = cellStyles[`${ri}-${ci}`];
        if (style) { data.cell.styles.fillColor = style.fillColor; data.cell.styles.textColor = style.textColor; data.cell.styles.fontStyle = 'bold'; }
        if (ci > ri) { data.cell.styles.fillColor = [25, 25, 40]; data.cell.styles.textColor = [25, 25, 40]; }
      }
    }, margin: { left: 8, right: 8 }
  });
  const tblEnd = doc.lastAutoTable.finalY + 6;
  if (tblEnd < H - 12) {
    let lx = 10;
    legendItems.forEach(li => {
      doc.setFillColor(...li.color); doc.rect(lx, tblEnd, 4, 3, 'F');
      doc.setTextColor(160, 160, 160); doc.setFontSize(6.5); doc.text(li.label, lx + 5, tblEnd + 2.2);
      lx += 50;
    });
  }

  // Sayfa 3: AI Yorumu
  doc.addPage();
  addPageHeader(doc, '🤖 AI Yorumu — Roadmap, Öngörüler & Öneriler', 3);
  doc.setFillColor(60, 50, 20); doc.setDrawColor(200, 150, 0); doc.roundedRect(10, 28, W - 20, 10, 2, 2, 'FD');
  doc.setTextColor(220, 170, 30); doc.setFontSize(7); doc.setFont('helvetica', 'italic');
  doc.text('⚠ Bu yorumlar AI ile hazırlanmıştır. Analizi hazırlayan kişi tarafından kontrol edilmelidir. Doğrudan analiz niteliği taşımamakta olup iç görü sağlamak amacıyla hazırlanmıştır.', 14, 34.5, { maxWidth: W - 28 });
  let curY = 44;
  const aiBlocks = document.querySelectorAll('#aiContent .ai-section');
  doc.setFont('helvetica', 'normal');
  if (aiBlocks.length === 0) {
    doc.setTextColor(150, 150, 150); doc.setFontSize(9);
    doc.text('AI yorumu henüz yüklenmedi. Lütfen analizi çalıştırın.', 10, curY);
  } else {
    const sectionColors = { 'ai-technical': [156, 39, 176], 'ai-roadmap': [76, 175, 80], 'ai-forecast': [33, 150, 243], 'ai-risks': [244, 67, 54], 'ai-suggestions': [255, 193, 7] };
    aiBlocks.forEach(block => {
      const titleEl = block.querySelector('.ai-section-title');
      const items = block.querySelectorAll('li');
      if (!titleEl && items.length === 0) return;
      let clr = [76, 175, 80];
      if (titleEl) {
        Object.entries(sectionColors).forEach(([cls, c]) => { if (titleEl.classList.contains(cls)) clr = c; });
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...clr);
        if (curY > H - 20) { doc.addPage(); curY = 20; }
        doc.text(titleEl.textContent.trim(), 10, curY); curY += 5;
      }
      items.forEach(li => {
        if (curY > H - 15) { doc.addPage(); curY = 20; }
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 200, 200);
        const txt = '• ' + li.textContent.trim();
        const lines = doc.splitTextToSize(txt, W - 22);
        doc.text(lines, 14, curY); curY += lines.length * 4 + 1;
      });
      curY += 3;
    });
  }
  doc.setFontSize(7); doc.setTextColor(100, 100, 120);
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.text(`${proj} — Korelasyon Analizi Raporu | ${dateStr} | ${method}`, W / 2, H - 5, { align: 'center' }); }
  doc.save(getExportFileName('pdf'));
}

// ==================== XLSX EXPORT ====================
function fallbackXlsx() {
  const cols = colsUsed;
  const aoa = [['Korelasyon Matrisi', ...cols]];
  corrMatrix.forEach((row, i) => {
    aoa.push([cols[i], ...row.map((v, j) => {
      if (i === j) return '—';
      if (j > i) return '';
      if (v === 0) return '';
      return +(v.toFixed(4));
    })]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 28 }, ...cols.map(() => ({ wch: 12 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Korelasyon Matrisi');
  XLSX.writeFile(wb, getExportFileName('xlsx'));
}
document.getElementById('exportXlsx').addEventListener('click', () => {
  if (!corrMatrix.length) return;
  fallbackXlsx();
});

// ==================== LOG ====================
function addLog(msg) {
  logItems.unshift(msg);
  const list = document.getElementById('logList');
  list.innerHTML = logItems.map(m => `<div style="padding:6px 0; border-bottom:1px solid var(--border);">${m}</div>`).join('') || '<div style="color:var(--muted);font-style:italic">Henüz analiz yapılmadı.</div>';
}
document.getElementById('clearLog').addEventListener('click', () => {
  logItems = [];
  document.getElementById('logList').innerHTML = '<div style="color:var(--muted);font-style:italic">Geçmiş temizlendi.</div>';
});