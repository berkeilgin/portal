// ==================== STATE ====================
const U = {
  exData: null, exHeaders: [], exIdents: new Set(),
  newData: null, newHeaders: [], newRows: [], dupRows: [],
  allSheets: {}, selectedSheet: 'BMSData',
  diffFilter: 'all', diffRows: 10,
  sourceFilename: '', exTarget: 0,
  colTypes: {}, colOrder: [], allCols: [], baseCols: [], computedCols: [],
  dateField: null, critH: [], hvalOk: false, aiText: ''
};
let dragSrc = null, selCol = null;

// ==================== TYPE SYSTEM ====================
const TYPE_LABELS = { date: 'DATE', datetime: 'DATETIME', time: 'TIME', int64: 'INT64', float: 'FLOAT', percent: '%', binary: 'BIN', text: 'TEXT' };
const TYPE_CSS = {
  date: 'type-badge type-date', datetime: 'type-badge type-datetime', time: 'type-badge type-time',
  int64: 'type-badge type-int64', float: 'type-badge type-float', percent: 'type-badge type-percent',
  binary: 'type-badge type-binary', text: 'type-badge type-text'
};
const TRM = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

function detectType(vals) {
  if (!vals || !vals.length) return 'text';
  const clean = vals.map(v => String(v || '').trim()).filter(v => v && !/^(n\/a|na|#n\/a|-)$/i.test(v));
  if (!clean.length) return 'text';
  const tot = clean.length;
  const dateRe = /^\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}$/;
  const dtRe = /^\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}[\sT]\d{1,2}:\d{2}/;
  const timeRe = /^\d{1,2}:\d{2}(:\d{2})?$/;
  const pctRe = /^[\d,.]+\s*%$/;
  const intRe = /^-?\d+$/;
  const floatRe = /^-?[\d]+[.,]\d+$/;
  const binaryVals = new Set(['0', '1']);
  let dateCnt = 0, dtCnt = 0, timeCnt = 0, pctCnt = 0, intCnt = 0, floatCnt = 0, isBin = true;
  clean.forEach(v => { if (!binaryVals.has(v) && v !== '') isBin = false; if (dtRe.test(v)) dtCnt++; else if (dateRe.test(v)) dateCnt++; else if (timeRe.test(v)) timeCnt++; else if (pctRe.test(v)) pctCnt++; else if (intRe.test(v)) intCnt++; else if (floatRe.test(v)) floatCnt++; });
  const p = n => n / tot;
  if (p(dtCnt) >= 0.7) return 'datetime';
  if (p(dateCnt) >= 0.7) return 'date';
  if (p(timeCnt) >= 0.7) return 'time';
  if (p(pctCnt) >= 0.7) return 'percent';
  if (isBin && clean.every(v => binaryVals.has(v))) return 'binary';
  if (p(intCnt) >= 0.8) return 'int64';
  if (p(floatCnt + intCnt) >= 0.7) return 'float';
  return 'text';
}

function getCellSpec(val, type) {
  const s = String(val || '').trim();
  if (!s || /^(n\/a|na|#n\/a|-)$/i.test(s)) return { t: 's', v: '' };
  switch (type) {
    case 'int64': { const n = parseInt(s.replace(/[,. ]/g, '')); if (isNaN(n)) return { t: 's', v: s }; if (s.length > 15) return { t: 's', v: s }; return { t: 'n', v: n }; }
    case 'float': { const n = parseFloat(s.replace(',', '.')); if (isNaN(n)) return { t: 's', v: s }; return { t: 'n', v: n }; }
    case 'percent': { const n = parseFloat(s.replace('%', '').replace(',', '.').trim()); if (isNaN(n)) return { t: 's', v: s }; return { t: 'n', v: n / 100, z: '0.00%' }; }
    case 'binary': { const n = parseInt(s); return { t: 'n', v: isNaN(n) ? 0 : n }; }
    case 'date': { const d = parseTrDate(s); if (d) return { t: 's', v: fmtTrDate(d) }; return { t: 's', v: s }; }
    case 'datetime': return { t: 's', v: s };
    default: return { t: 's', v: s };
  }
}

function parseTrDate(s) {
  const sep = /[.\/\-]/; const parts = s.split(sep);
  if (parts.length < 3) return null;
  let d = parseInt(parts[0]), m = parseInt(parts[1]), y = parseInt(parts[2]);
  if (m > 12 && d <= 12) { [d, m] = [m, d]; }
  if (y < 100) y += 2000;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}
function fmtTrDate(d) { return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear(); }
function isoWeek(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); }
function getHafta(v) { const d = tryDate(v); return d ? isoWeek(d) + '. Hafta' : ''; }
function getAy(v) { const d = tryDate(v); return d ? TRM[d.getMonth()] : ''; }
function getAyYil(v) { const d = tryDate(v); return d ? TRM[d.getMonth()] + "'" + (String(d.getFullYear()).slice(2)) : ''; }
function getYil(v) { const d = tryDate(v); return d ? d.getFullYear() : ''; }
function tryDate(v) { if (!v) return null; let d = new Date(v); if (!isNaN(d.getTime())) return d; return parseTrDate(String(v)); }
function isNA(v) { return !v || /^(n\/a|na|n\.a\.|-|#n\/a)$/i.test(String(v).trim()); }
function fmtName(s) { if (!s || !s.includes(',')) return (s || '').trim(); const p = s.split(',').map(x => x.trim()); return ((p[1] || '') + ' ' + (p[0] || '')).trim(); }
function fmtWeight(v) { const s = String(v || '').trim(); if (/^\d+\.\d+/.test(s)) { const p = s.split('.'); return p[0] + ',' + (p[1] || '0').slice(0, 1); } return v || ''; }

// ==================== STEP NAVIGATION ====================
function gotoStep(n) {
  [1, 2, 3, 4, 5, 6].forEach(i => {
    document.getElementById('s' + i).classList.toggle('active', i === n);
    const t = document.getElementById('tab' + i);
    t.className = 'stab' + (i === n ? ' active' : i < n ? ' done' : '');
  });
  if (n === 4) buildColEditor();
  if (n === 6) { document.getElementById('expNameDisplay').textContent = buildExportName() + '.xlsx'; document.getElementById('expNamePreview').textContent = 'Dosya adı: ' + buildExportName() + '.xlsx'; }
}

// ==================== STEP 1: EXISTING FILE ====================
document.getElementById('raporYil').value = new Date().getFullYear();
setupDrop(document.getElementById('exDrop'), document.getElementById('exFile'), file => {
  if (!file.name.match(/\.xlsx?$/i)) { st('exSt', '⚠ Lütfen .xlsx dosyası yükleyin.', 'err'); return; }
  U.sourceFilename = file.name;
  const pname = extractProjectName(file.name);
  document.getElementById('pName').value = pname;
  readXLSX(file, wb => {
    U.allSheets = {};
    wb.SheetNames.forEach(sn => { const rows = XLSX.utils.sheet_to_csv(wb.Sheets[sn]).split(/\r?\n/).filter(r => r.trim()); if (rows.length > 1) U.allSheets[sn] = rows.map(r => parseCSV(r)); });
    document.getElementById('exFN').textContent = file.name;
    document.getElementById('exFBar').classList.add('on');
    document.getElementById('exDrop').innerHTML = `<span class="dico">✅</span><div class="dtitle">${file.name}</div><div class="dsub">${wb.SheetNames.length} sheet</div>`;
    document.getElementById('exDrop').classList.add('has');
    renderSheetSel(wb.SheetNames);
    selectSheet((wb.SheetNames.find(s => s === 'BMSData') || wb.SheetNames[0]));
    document.getElementById('sheetArea').style.display = 'block';
    updateExpName(); v1();
  });
});
document.getElementById('exFDel').onclick = e => { e.stopPropagation(); U.exData = null; U.exHeaders = []; U.exIdents = new Set(); U.allSheets = {}; document.getElementById('exFBar').classList.remove('on'); document.getElementById('exDrop').classList.remove('has'); document.getElementById('exDrop').innerHTML = '<span class="dico">📊</span><div class="dtitle">Excel raporunu sürükleyin</div><div class="dsub">veya tıklayarak seçin · .xlsx</div>'; document.getElementById('exSt').className = 'sbar'; document.getElementById('sheetArea').style.display = 'none'; v1(); };

function renderSheetSel(names) {
  document.getElementById('sheetBtns').innerHTML = names.map(sn => `<div class="sheet-btn${sn === 'BMSData' ? ' sel' : ''}" id="shb_${sn.replace(/\W/g, '_')}" onclick="selectSheet('${sn.replace(/'/g, "\\'")}')"><span class="sheet-btn-ico">${sn === 'BMSData' ? '⭐' : sn.includes('Özet') ? '📊' : '📄'}</span><div class="sheet-btn-lbl">${sn}</div><div class="sheet-btn-sub">${U.allSheets[sn] ? U.allSheets[sn].length - 1 : 0} kayıt</div></div>`).join('');
}
function selectSheet(sn) {
  U.selectedSheet = sn;
  document.querySelectorAll('.sheet-btn').forEach(b => b.classList.remove('sel'));
  document.getElementById('shb_' + sn.replace(/\W/g, '_'))?.classList.add('sel');
  const rows = U.allSheets[sn]; if (!rows || rows.length < 2) return;
  U.exData = rows; U.exHeaders = rows[0] || [];
  const identIdx = U.exHeaders.findIndex(h => /ident/i.test(h));
  U.exIdents = new Set();
  if (identIdx >= 0) U.exData.slice(1).forEach(row => { if (row[identIdx]) U.exIdents.add(row[identIdx].trim()); });
  const dateIdx = U.exHeaders.findIndex(h => /(created|monitor).?date/i.test(h));
  const lastDate = dateIdx >= 0 && U.exData.length > 1 ? (U.exData[U.exData.length - 1][dateIdx] || '—') : '—';
  document.getElementById('exFM').textContent = (U.exData.length - 1) + ' kayıt · ' + sn;
  document.getElementById('exTotal').textContent = (U.exData.length - 1).toLocaleString('tr');
  document.getElementById('exIdents').textContent = U.exIdents.size.toLocaleString('tr');
  document.getElementById('exCols').textContent = U.exHeaders.length;
  document.getElementById('exDate').textContent = lastDate;
  inferConfig();
  document.getElementById('sheetHint').className = 'hint' + (sn === 'BMSData' ? ' ok' : ' warn');
  document.getElementById('sheetHintTxt').textContent = sn === 'BMSData' ? `✅ BMSData — ${U.exData.length - 1} kayıt, ${U.exHeaders.length} sütun.` : `⚠ "${sn}" seçildi — BMSData dışı sheet.`;
  st('exSt', identIdx >= 0 ? `✅ ${U.exIdents.size} IDENT algılandı.` : '⚠ IDENT sütunu yok.', 'ok');
  v1();
}
function inferConfig() {
  const h = U.exHeaders;
  const haftaIdx = h.indexOf('Hafta');
  const baseEnd = haftaIdx > 0 ? haftaIdx : h.length;
  U.baseCols = h.slice(0, baseEnd);
  const basariCols = haftaIdx >= 0 ? h.slice(haftaIdx + 4).filter(x => x.endsWith(' Başarı')) : [];
  U.computedCols = haftaIdx >= 0 ? ['Hafta', 'Ay', "AY'YIL", 'Yıl', ...basariCols] : [];
  U.allCols = [...U.baseCols, ...U.computedCols];
  U.colOrder = U.allCols.map((_, i) => i);
  U.dateField = h.find(x => /(monitor|created).?date/i.test(x)) || null;
  const spvIdx = h.findIndex(x => /spv|manager|supervisor/i.test(x));
  U.critH = U.baseCols.slice(spvIdx + 1).filter(h => !/(score|possible\s*score)/i.test(h));
  const wIdx = h.findIndex(x => /weighted/i.test(x));
  if (wIdx >= 0) { const v = U.exData.slice(1).map(r => parseFloat(String(r[wIdx] || '').replace(',', '.'))).filter(n => !isNaN(n)); U.exTarget = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; }
  U.baseCols.forEach(col => { const ci = h.indexOf(col); const vals = U.exData.slice(1, 51).map(r => (r[ci] || '').trim()).filter(v => v); U.colTypes[col] = detectType(vals); });
  U.computedCols.forEach(col => { if (col.endsWith(' Başarı')) U.colTypes[col] = 'binary'; else if (['Hafta', 'Ay', "AY'YIL", 'Yıl'].includes(col)) U.colTypes[col] = 'text'; });
}
function v1() { const ok = U.exData && document.getElementById('pName').value.trim(); document.getElementById('s1Next').disabled = !ok; }
document.getElementById('pName').addEventListener('input', v1);

// ==================== STEP 2: NEW DATA ====================
setupDrop(document.getElementById('newDrop'), document.getElementById('newFile'), file => {
  st('newSt', '⏳ Dosya okunuyor...', 'warn');
  readCSVFile(file, csv => {
    try {
      if (!csv || !csv.trim()) { st('newSt', '❌ Dosya okunamadı veya boş.', 'err'); return; }
      const rows = csv.split(/\r?\n/).filter(r => r.trim() && r.replace(/,/g, '').trim());
      if (rows.length < 2) { st('newSt', '❌ Dosyada veri bulunamadı (en az 1 başlık + 1 satır gerekli).', 'err'); return; }
      U.newData = rows.map(r => parseCSV(r));
      U.newHeaders = U.newData[0] || [];
      if (!U.newHeaders.length) { st('newSt', '❌ Başlıklar okunamadı.', 'err'); return; }
      const delimLabel = _csvDelim === ';' ? 'noktalı virgül' : _csvDelim === '\t' ? 'tab' : _csvDelim === '|' ? 'pipe' : 'virgül';
      U.newHeaders.forEach(col => { const ci = U.newHeaders.indexOf(col); const vals = U.newData.slice(1, 51).map(r => (r[ci] || '').trim()).filter(v => v); if (!U.colTypes[col]) U.colTypes[col] = detectType(vals); });
      document.getElementById('newFN').textContent = file.name;
      document.getElementById('newFBar').classList.add('on');
      document.getElementById('newDrop').classList.add('has');
      const valResult = validateHeaders();
      const totalNew = U.newData.length - 1;
      document.getElementById('newFM').textContent = `${totalNew} satır · ${U.newHeaders.length} sütun · ayırıcı: ${delimLabel}`;
      document.getElementById('newDrop').innerHTML = `<span class="dico">✅</span><div class="dtitle">${file.name}</div><div class="dsub">${totalNew} satır · ${U.newHeaders.length} sütun · ${delimLabel} · ${valResult.ok ? 'Başlıklar uyuşuyor ✅' : '⚠ Başlık uyuşmazlığı'}</div>`;
      renderHval(valResult);
      st('newSt', valResult.ok ? `✅ ${totalNew} satır yüklendi (${delimLabel} ayırıcı). Tüm başlıklar uyuşuyor.` : `⚠ ${totalNew} satır yüklendi. ${valResult.missing.length} eksik başlık — eksik sütunlar boş kalacak.`, valResult.ok ? 'ok' : 'warn');
      document.getElementById('hvalArea').style.display = 'block';
      U.hvalOk = valResult.missing.length === 0;
      v2();
    } catch (err) { st('newSt', '❌ Parse hatası: ' + err.message, 'err'); console.error(err); }
  });
});
document.getElementById('newFDel').onclick = e => { e.stopPropagation(); U.newData = null; document.getElementById('newFBar').classList.remove('on'); document.getElementById('newDrop').classList.remove('has'); document.getElementById('newDrop').innerHTML = '<span class="dico">📄</span><div class="dtitle">Yeni CSV/Excel dosyasını sürükleyin</div><div class="dsub">veya tıklayarak seçin</div>'; document.getElementById('newSt').className = 'sbar'; document.getElementById('hvalArea').style.display = 'none'; v2(); };
function validateHeaders() { if (!U.exData || !U.newData) return { ok: false, match: [], missing: [], extra: [] }; const baseH = new Set(U.baseCols); const newH = new Set(U.newHeaders); const match = [...baseH].filter(h => newH.has(h)); const missing = [...baseH].filter(h => !newH.has(h)); const extra = [...newH].filter(h => !baseH.has(h)); return { ok: missing.length === 0, match, missing, extra }; }
function renderHval(r) { const fmt = (arr, cls) => arr.map(h => `<div class="hval-item ${cls}"><span>${cls === 'ok' ? '✓' : cls === 'miss' ? '✗' : '+'}</span>${h}</div>`).join(''); document.getElementById('hvalMatchCnt').textContent = r.match.length; document.getElementById('hvalMissCnt').textContent = r.missing.length; document.getElementById('hvalExtraCnt').textContent = r.extra.length; document.getElementById('hvalMatch').innerHTML = fmt(r.match, 'ok'); document.getElementById('hvalMiss').innerHTML = fmt(r.missing, 'miss') || '<div class="hval-item ok">Eksik başlık yok ✓</div>'; document.getElementById('hvalExtra').innerHTML = fmt(r.extra, 'extra') || '<div style="padding:6px;font-size:9px;color:var(--muted);font-family:var(--mono)">Fazladan başlık yok</div>'; const hvalSt = document.getElementById('hvalSt'); if (r.missing.length > 0) { hvalSt.textContent = `❌ ${r.missing.length} eksik başlık: ${r.missing.slice(0, 3).join(', ')}${r.missing.length > 3 ? '...' : ''} — Bu başlıklara ait sütunlar yeni kayıtlarda boş kalacak.`; hvalSt.className = 'sbar on err'; } else { hvalSt.textContent = `✅ Tüm ${r.match.length} başlık uyuşuyor.`; hvalSt.className = 'sbar on ok'; } }
function v2() { document.getElementById('s2Next').disabled = !U.newData; }

// ==================== STEP 3: IDENT CHECK ====================
function runCheck() { gotoStep(3); document.getElementById('checkPanel').style.display = 'block'; document.getElementById('resultArea').style.display = 'none'; document.getElementById('s3Next').disabled = true; const bar = document.getElementById('progBar'), msg = document.getElementById('progMsg'); let pct = 0; const iv = setInterval(() => { pct += Math.random() * 25 + 8; if (pct > 100) pct = 100; bar.style.width = pct + '%'; if (pct >= 100) { clearInterval(iv); setTimeout(showResult, 250); } }, 200); }
function showResult() { const identIdx = U.newHeaders.findIndex(h => /ident/i.test(h)); U.newRows = []; U.dupRows = []; U.newData.slice(1).forEach(row => { const id = identIdx >= 0 ? (row[identIdx] || '').trim() : null; if (id && U.exIdents.has(id)) U.dupRows.push(row); else U.newRows.push(row); }); const tot = U.newData.length - 1, nc = U.newRows.length, dc = U.dupRows.length; document.getElementById('stNew').textContent = nc.toLocaleString('tr'); document.getElementById('stDup').textContent = dc.toLocaleString('tr'); document.getElementById('stTot').textContent = tot.toLocaleString('tr'); document.getElementById('stPct').textContent = tot > 0 ? Math.round(nc / tot * 100) + '%' : '—'; const identSt = document.getElementById('identSt'); if (dc === 0) { identSt.textContent = `✅ Tüm ${nc} kayıt yeni.`; identSt.className = 'sbar on ok'; } else if (nc === 0) { identSt.textContent = `🚫 Tüm ${dc} kayıt zaten mevcut. Eklenecek kayıt yok.`; identSt.className = 'sbar on err'; } else { identSt.textContent = `⚠ ${nc} yeni kayıt eklenecek, ${dc} duplikasyon hariç tutulacak.`; identSt.className = 'sbar on warn'; } buildDiffTable(); document.getElementById('checkPanel').style.display = 'none'; document.getElementById('resultArea').style.display = 'block'; document.getElementById('s3Next').disabled = nc === 0; }
function buildDiffTable() { document.getElementById('dH').innerHTML = '<tr><th>Durum</th>' + U.newHeaders.slice(0, 7).map(h => `<th>${h}</th>`).join('') + '</tr>'; renderDiff(); }
function renderDiff() { const f = U.diffFilter; const rows = (f === 'all' ? [...U.newRows.map(r => ({ r, t: 'n' })), ...U.dupRows.map(r => ({ r, t: 'd' }))] : f === 'new' ? U.newRows.map(r => ({ r, t: 'n' })) : U.dupRows.map(r => ({ r, t: 'd' }))).slice(0, U.diffRows); document.getElementById('dB').innerHTML = rows.map(({ r, t }) => `<tr class="r${t}"><td>${t === 'n' ? '<span style="color:var(--accent)">✅</span>' : '<span style="color:var(--accent3)">✕</span>'}</td>${r.slice(0, 7).map(c => `<td>${c || ''}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:14px;color:var(--muted)">Kayıt yok</td></tr>'; }
function setF(f, btn) { U.diffFilter = f; ['dfAll', 'dfNew', 'dfDup'].forEach(id => { const el = document.getElementById(id); el.className = el.className.replace(/\bon\b/g, '').trim(); }); btn.className = btn.className + ' on'; renderDiff(); }
function setDR(n, btn) { U.diffRows = n; document.querySelectorAll('.col-tool-btn.a').forEach(b => b.classList.remove('a')); btn.classList.add('a'); renderDiff(); }

// ==================== STEP 4: COLUMN EDITOR ====================
function buildColEditor() { renderTypeSummary(); renderColEditor(); }
function renderTypeSummary() { const counts = {}; U.allCols.forEach(col => { const t = U.colTypes[col] || 'text'; counts[t] = (counts[t] || 0) + 1; }); document.getElementById('typeSummary').innerHTML = Object.entries(counts).map(([t, n]) => `<span class="${TYPE_CSS[t] || 'type-badge type-text'}" style="font-size:10px;padding:3px 9px">${TYPE_LABELS[t] || t}: ${n}</span>`).join(''); }
function renderColEditor() { const grid = document.getElementById('excelGrid'); const ordered = U.colOrder.map(i => ({ col: U.allCols[i], idx: i })); const isComp = col => U.computedCols.includes(col); const combined = [...(U.exData || []).slice(1), ...U.newRows].slice(0, 6); grid.innerHTML = ordered.map(({ col, idx }, pos) => { const type = U.colTypes[col] || 'text'; const isSel = selCol === pos; const isC = isComp(col); const colIdx = U.exHeaders.indexOf(col); const newColIdx = U.newHeaders.indexOf(col); const samples = combined.map(row => { let v = colIdx >= 0 ? (row[colIdx] || '') : (newColIdx >= 0 ? (row[newColIdx] || '') : ''); v = String(v).trim(); if (isNA(v)) v = ''; return v; }); const cellCls = (v, t) => t === 'int64' || t === 'float' || t === 'binary' ? 'num-cell' : t === 'date' || t === 'datetime' ? 'date-cell' : isC ? 'computed-cell' : ''; const typeOpts = ['date', 'datetime', 'time', 'int64', 'float', 'percent', 'binary', 'text']; return `<div class="excel-col${isSel ? ' sel-col' : ''}" id="ec_${pos}" draggable="true" ondragstart="dragS(event,${pos})" ondragover="dragO(event,${pos})" ondragleave="dragL(event,${pos})" ondrop="dropC(event,${pos})" onclick="selectCol(${pos})"><div class="col-letter">${colLetter(pos)}</div><div class="col-hd"><span style="font-size:9px;color:var(--muted);flex-shrink:0;margin-top:2px">⠿</span><div style="flex:1;min-width:0"><div class="col-hd-name" title="${col}">${col.length > 16 ? col.slice(0, 14) + '…' : col}</div><div style="display:flex;gap:3px;margin-top:3px;flex-wrap:wrap"><span class="${TYPE_CSS[type] || 'type-badge type-text'}">${TYPE_LABELS[type] || type}</span>${isC ? '<span style="font-size:7px;padding:1px 4px;border-radius:3px;background:rgba(124,109,250,.12);color:var(--accent2);border:1px solid rgba(124,109,250,.2)">HESAP</span>' : ''}</div><select class="fi" style="font-size:8px;padding:2px 4px;margin-top:3px;height:auto" onclick="event.stopPropagation()" onchange="setColType('${col.replace(/'/g, "\\'")}',this.value)">${typeOpts.map(t => `<option value="${t}"${t === type ? ' selected' : ''}>${TYPE_LABELS[t]}</option>`).join('')}</select></div></div><div class="col-samples">${samples.map(v => `<div class="col-cell ${cellCls(v, type)}">${v || '<span style="color:var(--muted2)">—</span>'}</div>`).join('')}</div></div>`; }).join(''); selColLabel(); }
function setColType(col, type) { U.colTypes[col] = type; renderColEditor(); renderTypeSummary(); }
function selectCol(pos) { selCol = pos === selCol ? null : pos; renderColEditor(); }
function selColLabel() { const lbl = document.getElementById('selColLbl'); if (!lbl) return; if (selCol !== null && selCol < U.colOrder.length) { const col = U.allCols[U.colOrder[selCol]]; lbl.textContent = `Seçili: ${colLetter(selCol)} — ${col}`; } else lbl.textContent = ''; }
function dragS(e, pos) { dragSrc = pos; setTimeout(() => document.getElementById('ec_' + pos)?.classList.add('dragging'), 0); }
function dragO(e, pos) { e.preventDefault(); document.getElementById('ec_' + pos)?.classList.add('drag-over'); }
function dragL(e, pos) { document.getElementById('ec_' + pos)?.classList.remove('drag-over'); }
function dropC(e, pos) { e.preventDefault(); document.querySelectorAll('.excel-col').forEach(el => el.classList.remove('drag-over', 'dragging')); if (dragSrc === null || dragSrc === pos) return; const tmp = U.colOrder[dragSrc]; U.colOrder.splice(dragSrc, 1); U.colOrder.splice(pos, 0, tmp); selCol = pos; dragSrc = null; renderColEditor(); st('colSt', '✅ Sütun taşındı.', 'ok'); }
function resetColOrder() { U.colOrder = U.allCols.map((_, i) => i); selCol = null; renderColEditor(); st('colSt', '↺ Orijinal sıra.', 'ok'); }
function moveCol(dir) { if (selCol === null) return; const np = selCol + dir; if (np < 0 || np >= U.colOrder.length) return; const tmp = U.colOrder[selCol]; U.colOrder[selCol] = U.colOrder[np]; U.colOrder[np] = tmp; selCol = np; renderColEditor(); st('colSt', 'Taşındı.', 'ok'); }
function moveColEdge(end) { if (selCol === null) return; const val = U.colOrder.splice(selCol, 1)[0]; if (end) U.colOrder.push(val); else U.colOrder.unshift(val); selCol = end ? U.colOrder.length - 1 : 0; renderColEditor(); st('colSt', 'Taşındı.', 'ok'); }

// ==================== STEP 5: AI ====================
async function runAI() { const btn = document.getElementById('aiStartBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Analiz yapılıyor...'; document.getElementById('aiPanel').classList.add('on'); document.getElementById('aiContent').innerHTML = '<div class="ai-loading"><span class="spinner"></span>Claude ile analiz yapılıyor — lütfen bekleyin...</div>'; document.getElementById('aiGenDate').textContent = new Date().toLocaleString('tr-TR'); try { const prompt = buildAIPrompt(); const resp = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }) }); const data = await resp.json(); const text = data.content.map(c => c.text || '').join('\n'); U.aiText = text; document.getElementById('aiContent').innerHTML = formatAIText(text); btn.innerHTML = '✅ Analiz Tamamlandı — Tekrar Çalıştır'; btn.disabled = false; } catch (err) { document.getElementById('aiContent').innerHTML = `<div class="ai-loading" style="color:var(--accent3)">❌ API hatası: ${err.message}</div>`; btn.innerHTML = '🤖 AI Analizi Başlat'; btn.disabled = false; } }
function buildAIPrompt() { const pn = document.getElementById('pName').value.trim(); const tot = (U.exData ? U.exData.length - 1 : 0) + U.newRows.length; const newCnt = U.newRows.length; const h = U.exHeaders; const wIdx = h.findIndex(x => /weighted/i.test(x)); const combined = [...(U.exData || []).slice(1), ...mapNewRows()]; let wAvg = 'N/A'; if (wIdx >= 0) { const vals = combined.map(r => parseFloat(String(r[wIdx] || '').replace(',', '.'))).filter(n => !isNaN(n)); if (vals.length) wAvg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) + '%'; } const haftaIdx = h.indexOf('Hafta'); const basariStart = haftaIdx >= 0 ? haftaIdx + 4 : -1; const basariCols = basariStart >= 0 ? h.slice(basariStart).filter(x => x.endsWith(' Başarı')) : []; const critStats = basariCols.slice(0, 10).map(bc => { const bi = h.indexOf(bc); const tot2 = combined.length; let ok = 0; combined.forEach(r => { const v = r[bi]; if (v === 1 || v === '1' || v === true) ok++; }); return { name: bc.replace(/ Başarı$/, ''), rate: tot2 > 0 ? Math.round(ok / tot2 * 100) : 0 }; }).sort((a, b) => a.rate - b.rate); const dateIdx = h.findIndex(x => /(monitor|created).?date/i.test(x)); const dates = combined.map(r => { const d = new Date(r[dateIdx] || ''); return isNaN(d.getTime()) ? null : d; }).filter(Boolean); const minDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))).toLocaleDateString('tr-TR') : '?'; const maxDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))).toLocaleDateString('tr-TR') : '?'; return `Sen bir kalite yönetimi uzmanısın. Aşağıdaki kalite raporu verilerini analiz et ve Türkçe olarak yorum yap. RAPOR BİLGİSİ: - Proje: ${pn} - Dönem: ${minDate} — ${maxDate} - Toplam kayıt: ${tot} (${newCnt} yeni eklendi) - Genel Weighted Avg: ${wAvg} - Hedef: ${U.exTarget.toFixed(1)}% KRİTER BAŞARI ORANLARI (düşükten yükseğe):\n${critStats.map(c => `- ${c.name}: %${c.rate}`).join('\n')}\nLütfen şunları analiz et: 1. GENEL DEĞERLENDİRME: Kalite durumu nasıl? Hedefle karşılaştır. 2. KRİTİK SORUNLAR: En düşük başarı oranlı kriterler ve öneriler. 3. GÜÇLÜ YÖNLER: Yüksek başarı gösteren alanlar. 4. TREND: Bu güncelleme ile ne değişti? 5. ÖNERİLER: Kısa 3 madde halinde somut adımlar. Kısa, net ve uygulanabilir yorumlar yap. Her bölüm için 2-3 cümle yeterli.`; }
function formatAIText(text) { const sects = text.split(/\n(?=\d+\.|[A-ZÇĞİÖŞÜ]{2,}:)/); return `<div>${sects.map(s => { const trimmed = s.trim(); if (!trimmed) return ''; return `<div class="ai-section">${trimmed.replace(/\n/g, '<br>')}</div>`; }).join('')}</div>`; }

// ==================== DATE & EXPORT NAME ====================
function getDateRangeLabel() { const h = U.exHeaders.length ? U.exHeaders : U.newHeaders; const dateIdx = h.findIndex(x => /(monitor|created).?date/i.test(x)); const combined = [...(U.exData || []).slice(1), ...U.newRows]; if (!combined.length || dateIdx < 0) return new Date().toLocaleDateString('tr-TR').replace(/\./g, '-'); const dates = combined.map(r => { const dv = r[dateIdx] || ''; const d = new Date(dv); if (!isNaN(d.getTime())) return d; const p = parseTrDate(dv); return p; }).filter(Boolean); if (!dates.length) return ''; const minD = new Date(Math.min(...dates.map(d => d.getTime()))); const maxD = new Date(Math.max(...dates.map(d => d.getTime()))); const selAy = document.getElementById('raporAy')?.value; const selYil = document.getElementById('raporYil')?.value; const yilStr = selYil ? ("'" + (String(selYil).length === 4 ? String(selYil).slice(2) : String(selYil))) : ("'" + (String(maxD.getFullYear()).slice(2))); if (minD.getMonth() === maxD.getMonth()) return `${minD.getDate()}-${maxD.getDate()} ${selAy || TRM[maxD.getMonth()]}${yilStr}`; return `${minD.getDate()} ${TRM[minD.getMonth()]}-${maxD.getDate()} ${TRM[maxD.getMonth()]}${yilStr}`; }
function buildExportName() { const pn = document.getElementById('pName')?.value.trim() || 'Güncelleme'; const dr = getDateRangeLabel(); return dr ? `${pn}_${dr}_Kalite_Raporu_Güncelleme` : `${pn}_Kalite_Raporu_Güncelleme`; }
function updateExpName() { const name = buildExportName(); const el = document.getElementById('expNamePreview'); if (el) el.textContent = 'Dosya adı: ' + name + '.xlsx'; }

// ==================== DATA BUILD ====================
function mapNewRows() { return U.newRows.map(row => { const nh = U.newHeaders; return U.exHeaders.map(col => { if (col === 'Hafta' || col === 'Ay' || col === "AY'YIL" || col === 'Yıl') return ''; if (col.endsWith(' Başarı')) return ''; const ci = nh.indexOf(col); if (ci < 0) return ''; const v = (row[ci] || '').trim(); if (isNA(v)) return ''; if (/employee.?name/i.test(col)) return fmtName(v); if (/manager.?name/i.test(col)) return fmtName(v); if (/weighted/i.test(col)) return fmtWeight(v); return v; }); }); }
function buildCombined() { const ordered = U.colOrder.map(i => U.allCols[i]); const haftaIdx = U.exHeaders.indexOf('Hafta'); const basariStart = haftaIdx >= 0 ? haftaIdx + 4 : -1; const basariCols = basariStart >= 0 ? U.exHeaders.slice(basariStart).filter(x => x.endsWith(' Başarı')) : []; function getVal(row, col, isNewRow) { if (isNewRow) { const nh = U.newHeaders; if (col === 'Hafta') { const dv = U.dateField ? row[nh.indexOf(U.dateField)] || '' : ''; return getHafta(dv); } if (col === 'Ay') { const dv = U.dateField ? row[nh.indexOf(U.dateField)] || '' : ''; return getAy(dv); } if (col === "AY'YIL") { const dv = U.dateField ? row[nh.indexOf(U.dateField)] || '' : ''; return getAyYil(dv); } if (col === 'Yıl') { const dv = U.dateField ? row[nh.indexOf(U.dateField)] || '' : ''; return getYil(dv); } if (col.endsWith(' Başarı')) { const baseCol = col.replace(/ Başarı$/, ''); const ci = nh.indexOf(baseCol); if (ci < 0) return ''; const v = (row[ci] || '').trim(); if (isNA(v) || v === '') return ''; const pos = inferPos(baseCol); return pos && v.toLowerCase() === pos.toLowerCase() ? 1 : 0; } const ci = nh.indexOf(col); if (ci < 0) return ''; let v = (row[ci] || '').trim(); if (isNA(v)) return ''; if (/employee.?name/i.test(col)) return fmtName(v); if (/manager.?name/i.test(col)) return fmtName(v); if (/weighted/i.test(col)) return fmtWeight(v); return v; } else { const ci = U.exHeaders.indexOf(col); if (ci < 0) return ''; const v = row[ci]; if (v === null || v === undefined || v === '') return ''; if (col.endsWith(' Başarı')) { const n = parseInt(v); return isNaN(n) ? 0 : n; } return v; } } const exRows = U.exData.slice(1).map(row => ordered.map(col => getVal(row, col, false))); const newMapped = U.newRows.map(row => ordered.map(col => getVal(row, col, true))); return { headers: ordered, rows: [ordered, ...exRows, ...newMapped] }; }
function inferPos(col) { const exCol = col + ' Başarı'; const exIdx = U.exHeaders.indexOf(exCol); const baseIdx = U.exHeaders.indexOf(col); if (exIdx < 0 || baseIdx < 0) return null; const map = {}; U.exData.slice(1).forEach(r => { const b = r[exIdx]; const v = (r[baseIdx] || '').trim(); if ((b === 1 || b === '1') && v) { map[v] = (map[v] || 0) + 1; } }); const top = Object.entries(map).sort((a, b) => b[1] - a[1])[0]; return top ? top[0] : null; }

// ==================== STYLE HELPERS ====================
function thinBorder(rgb = 'D9D9D9') { const b = { style: 'thin', color: { rgb } }; return { top: b, bottom: b, left: b, right: b }; }
function hdrStyle(hex, sz) { return { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: sz || 10, name: 'Calibri' }, fill: { patternType: 'solid', fgColor: { rgb: hex || '3D3580' } }, border: thinBorder(), alignment: { horizontal: 'center', vertical: 'center', wrapText: true } }; }
function cellStyle(bgHex, txtHex, sz, bold) { return { font: { sz: sz || 9, name: 'Calibri', color: { rgb: txtHex || '2C2C3E' }, bold: !!bold }, fill: { patternType: 'solid', fgColor: { rgb: bgHex || 'FFFFFF' } }, border: thinBorder(), alignment: { vertical: 'center' } }; }
function setNoGrid(ws) { ws['!views'] = [{ showGridLines: false }]; }
function applySheetStyles(ws, allRows, opts) { const { hdrHex = '3D3580', even1 = 'F0EDFF', even2 = 'FFFFFF', wIdx = -1, target = 0, basariStart = -1, colTypes = {} } = opts || {}; allRows.forEach((row, ri) => { row.forEach((val, ci) => { const addr = XLSX.utils.encode_cell({ r: ri, c: ci }); if (!ws[addr]) return; if (ri === 0) { ws[addr].s = hdrStyle(hdrHex, 10); return; } const isEven = ri % 2 === 0; let bgHex = isEven ? even1 : even2; let txtHex = '2C2C3E'; if (basariStart >= 0 && ci >= basariStart) { const n = typeof val === 'number' ? val : parseInt(val); bgHex = n === 1 ? 'C6EFCE' : n === 0 ? 'FFCCCC' : 'F0F0F0'; txtHex = n === 1 ? '1A7A3A' : n === 0 ? 'C0392B' : '666666'; } else if (ci === wIdx && target > 0) { const n = parseFloat(String(val || '').replace(',', '.')); if (!isNaN(n)) { bgHex = n >= target ? 'C6EFCE' : n >= target * 0.95 ? 'FFED99' : 'FFCCCC'; txtHex = n >= target ? '1A7A3A' : n >= target * 0.95 ? '7A5A00' : 'C0392B'; } } ws[addr].s = cellStyle(bgHex, txtHex, 9, false); const colName = allRows[0][ci]; const ctype = colTypes[colName]; if (ctype && ri > 0) { const spec = getCellSpec(String(val || ''), ctype); if (spec.t === 'n' && typeof spec.v === 'number') { ws[addr].t = 'n'; ws[addr].v = spec.v; if (spec.z) ws[addr].z = spec.z; } } }); }); }

// ==================== SUMMARY BUILDERS ====================
function buildOzet(combined, headers) { const wIdx = headers.findIndex(x => /weighted/i.test(x)); const ayIdx = headers.indexOf('Ay'), hfIdx = headers.indexOf('Hafta'); if (wIdx < 0) return [['Weighted Avg sütunu yok']]; const mon = {}, week = {}; combined.slice(1).forEach(row => { const sc = parseFloat(String(row[wIdx] || '').replace(',', '.')); if (isNaN(sc)) return; const ay = ayIdx >= 0 ? row[ayIdx] || '' : ''; const hf = hfIdx >= 0 ? row[hfIdx] || '' : ''; if (ay) { if (!mon[ay]) mon[ay] = { sum: 0, cnt: 0 }; mon[ay].sum += sc; mon[ay].cnt++; } if (hf) { if (!week[hf]) week[hf] = { sum: 0, cnt: 0 }; week[hf].sum += sc; week[hf].cnt++; } }); const tgt = U.exTarget; const r = [['Ay', 'Kayıt Adet', 'Ort. Skor', 'Hedef', 'Durum']]; Object.entries(mon).forEach(([ay, d]) => { const s = Number((d.sum / d.cnt).toFixed(1)); r.push([ay, d.cnt, s, tgt.toFixed(1) + '%', s >= tgt ? '✅ Hedef Üstü' : s >= tgt * 0.95 ? '⚠ Hedefe Yakın' : '❌ Hedef Altı']); }); r.push([], []); r.push(['Hafta', 'Kayıt Adet', 'Ort. Skor', 'Hedef', 'Durum']); Object.entries(week).forEach(([hf, d]) => { const s = Number((d.sum / d.cnt).toFixed(1)); r.push([hf, d.cnt, s, tgt.toFixed(1) + '%', s >= tgt ? '✅' : s >= tgt * 0.95 ? '⚠' : '❌']); }); return r; }
function buildDeger(combined, headers) { const rpIdx = headers.findIndex(x => /reviewer.?position/i.test(x)), wIdx = headers.findIndex(x => /weighted/i.test(x)); if (rpIdx < 0) return [['Reviewer Position sütunu yok']]; const map = {}; combined.slice(1).forEach(row => { const rp = (row[rpIdx] || '').trim(); if (!rp) return; if (!map[rp]) map[rp] = { cnt: 0, sum: 0 }; map[rp].cnt++; const sc = parseFloat(String(row[wIdx] || '').replace(',', '.')); if (!isNaN(sc)) map[rp].sum += sc; }); const r = [['Reviewer Position', 'Adet', 'Ort. Skor']]; Object.entries(map).forEach(([rp, d]) => r.push([rp, d.cnt, d.cnt ? Number((d.sum / d.cnt).toFixed(1)) : 0])); return r; }
function buildKriter(combined, headers, periodFn) { const hIdx = headers.indexOf('Hafta'); if (hIdx < 0) return [['Hafta yok']]; const basariStart = hIdx + 4; const bcols = headers.slice(basariStart).filter(h => h.endsWith(' Başarı')); if (!bcols.length) return [['Başarı sütunu yok']]; const ayIdx = headers.indexOf('Ay'), hfIdx = headers.indexOf('Hafta'); const pIdx = periodFn === getAy ? ayIdx : hfIdx; const periods = [...new Set(combined.slice(1).map(r => r[pIdx] || '').filter(Boolean))].sort(); const r = [['Kriter', ...periods, 'Genel']]; bcols.forEach((bc, bi) => { const bIdx = basariStart + bi; const rates = []; const row = [bc.replace(/ Başarı$/, '')]; periods.forEach(p => { const pr = combined.slice(1).filter(r => r[pIdx] === p); let t = 0, ok = 0; pr.forEach(r => { const v = r[bIdx]; if (v === '' || v === null || v === undefined) return; t++; if (v === 1 || v === '1' || v === true) ok++; }); const rt = t > 0 ? Number((ok / t * 100).toFixed(1)) : null; row.push(rt !== null ? rt : ''); if (rt !== null) rates.push(rt); }); row.push(rates.length ? Number((rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1)) : ''); r.push(row); }); return r; }

// ==================== EXPORT ====================
function getColTypesMap(headers) { const m = {}; headers.forEach(h => { m[h] = U.colTypes[h] || 'text'; }); return m; }
function applyBMSFull(ws, headers, rows, target) { setNoGrid(ws); const wIdx = headers.indexOf ? headers.findIndex(h => /weighted/i.test(h)) : headers.indexOf('Weighted Avg') || 0; const haftaIdx = headers.indexOf ? headers.indexOf('Hafta') : -1; const basariStart = haftaIdx >= 0 ? haftaIdx + 4 : -1; const ctypes = getColTypesMap(headers); applySheetStyles(ws, rows, { hdrHex: '3D3580', even1: 'EEEEFF', even2: 'FFFFFF', wIdx, target, basariStart, colTypes: ctypes }); ws['!cols'] = headers.map(h => ({ wch: Math.max(10, String(h).length + 4) })); ws['!freeze'] = { xSplit: 0, ySplit: 1 }; }
function doExportBMSOnly() { const pn = document.getElementById('pName').value.trim(); if (!pn || !U.newRows.length) { st('expSt', '⚠ Proje adı veya eklenecek veri yok.', 'err'); return; } const { headers, rows } = buildCombined(); const ws = XLSX.utils.aoa_to_sheet(rows); applyBMSFull(ws, headers, rows, U.exTarget); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'BMSData'); XLSX.writeFile(wb, buildExportName() + '_BMSOnly.xlsx'); st('expSt', '✅ BMSData indirildi.', 'ok'); }
function doExport() { const pn = document.getElementById('pName').value.trim(); if (!pn) { st('expSt', '⚠ Proje adı boş!', 'err'); return; } if (!U.newRows.length) { st('expSt', '⚠ Eklenecek kayıt yok.', 'err'); return; } const { headers, rows } = buildCombined(); const wb = XLSX.utils.book_new(); const exportName = buildExportName(); const period = getDateRangeLabel(); const note = document.getElementById('updateNote')?.value || ''; const ana = [[pn + ' — Kalite Raporu Güncelleme'], [`Dönem: ${period} | Tarih: ${new Date().toLocaleDateString('tr-TR')}`], [`+${U.newRows.length} yeni kayıt · ${U.dupRows.length} duplikasyon hariç`], ...(note ? [[`Not: ${note}`]] : []), [], ['Sheetler'], [' ● Özet'], [' ● Değerlendirici Özet'], [' ● Kriter Bazlı | Ay'], [' ● Kriter Bazlı | Hafta'], [' ● BMSData'], ...(U.aiText ? [[], ['AI Analizi:', U.aiText.slice(0, 200) + '...']] : [])]; const wsAna = XLSX.utils.aoa_to_sheet(ana); setNoGrid(wsAna); if (wsAna['A1']) wsAna['A1'].s = { font: { bold: true, sz: 16, color: { rgb: '7C6DFA' }, name: 'Calibri' }, fill: { patternType: 'solid', fgColor: { rgb: '1A1A2E' } } }; if (wsAna['A2']) wsAna['A2'].s = { font: { sz: 9, color: { rgb: '888899' }, name: 'Calibri' }, fill: { patternType: 'solid', fgColor: { rgb: '111118' } } }; wsAna['!cols'] = [{ wch: 60 }]; XLSX.utils.book_append_sheet(wb, wsAna, 'Ana Sayfa'); const oD = buildOzet(rows, headers); const wsO = XLSX.utils.aoa_to_sheet(oD); setNoGrid(wsO); applySheetStyles(wsO, oD, { hdrHex: '5B4DA8', even1: 'F0EDFF', even2: 'FFFFFF', wIdx: 2, target: U.exTarget }); wsO['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 18 }]; XLSX.utils.book_append_sheet(wb, wsO, 'Özet'); const dD = buildDeger(rows, headers); const wsD = XLSX.utils.aoa_to_sheet(dD); setNoGrid(wsD); applySheetStyles(wsD, dD, { hdrHex: '5B4DA8', even1: 'F0EDFF', even2: 'FFFFFF', wIdx: 2, target: U.exTarget }); wsD['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 14 }]; XLSX.utils.book_append_sheet(wb, wsD, 'Değerlendirici Özet'); const ayD = buildKriter(rows, headers, getAy); const wsAy = XLSX.utils.aoa_to_sheet(ayD); setNoGrid(wsAy); applySheetStyles(wsAy, ayD, { hdrHex: '5B4DA8', even1: 'E8F5E9', even2: 'FFFFFF' }); wsAy['!cols'] = [{ wch: 30 }, ...(ayD[0] || []).slice(1).map(() => ({ wch: 10 }))]; XLSX.utils.book_append_sheet(wb, wsAy, 'Kriter Bazlı | Ay'); const hfD = buildKriter(rows, headers, getHafta); const wsHf = XLSX.utils.aoa_to_sheet(hfD); setNoGrid(wsHf); applySheetStyles(wsHf, hfD, { hdrHex: '5B4DA8', even1: 'E8F5E9', even2: 'FFFFFF' }); wsHf['!cols'] = [{ wch: 30 }, ...(hfD[0] || []).slice(1).map(() => ({ wch: 10 }))]; XLSX.utils.book_append_sheet(wb, wsHf, 'Kriter Bazlı | Hafta'); const wsBMS = XLSX.utils.aoa_to_sheet(rows); applyBMSFull(wsBMS, headers, rows, U.exTarget); XLSX.utils.book_append_sheet(wb, wsBMS, 'BMSData'); XLSX.writeFile(wb, exportName + '.xlsx'); st('expSt', `✅ "${exportName}.xlsx" indirildi — ${wb.SheetNames.length} sheet.`, 'ok'); }

// ==================== PDF EXPORT ====================
function exportPDF() { const pn = document.getElementById('pName').value.trim() || 'Kalite'; if (!window.jspdf) { alert('jsPDF yüklenemedi.'); return; } const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }); const { headers, rows } = buildCombined(); const period = getDateRangeLabel(); const exportName = buildExportName(); let y = 20; doc.setFillColor(26, 26, 46); doc.rect(0, 0, 210, 297, 'F'); doc.setTextColor(124, 109, 250); doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.text(pn, 20, y); y += 9; doc.setTextColor(6, 214, 160); doc.setFontSize(13); doc.text('Kalite Raporu Güncelleme', 20, y); y += 8; doc.setTextColor(170, 170, 200); doc.setFontSize(9); doc.text(`Dönem: ${period}  |  Oluşturma: ${new Date().toLocaleDateString('tr-TR')}`, 20, y); y += 6; doc.text(`Toplam: ${(U.exData ? U.exData.length - 1 : 0) + U.newRows.length} kayıt  |  +${U.newRows.length} yeni`, 20, y); y += 12; doc.setDrawColor(124, 109, 250); doc.setLineWidth(0.5); doc.line(20, y, 190, y); y += 8; const ozetD = buildOzet(rows, headers); if (ozetD && ozetD.length > 1) { doc.setTextColor(6, 214, 160); doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text('Özet — Aylık Performans', 20, y); y += 5; doc.autoTable({ startY: y, head: [ozetD[0]], body: ozetD.slice(1).filter(r => r.length >= 3 && r[0]), headStyles: { fillColor: [61, 53, 128], textColor: 255, fontStyle: 'bold', fontSize: 8 }, bodyStyles: { fontSize: 8, textColor: [44, 44, 62] }, alternateRowStyles: { fillColor: [240, 237, 255] }, styles: { font: 'helvetica', cellPadding: 2 }, columnStyles: { 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' } }, theme: 'grid', margin: { left: 20, right: 20 } }); y = doc.lastAutoTable.finalY + 10; } const ayD = buildKriter(rows, headers, getAy); if (ayD && ayD.length > 1 && y < 240) { doc.setTextColor(6, 214, 160); doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text('Kriter Başarı Oranları — Aylık (%)', 20, y); y += 5; const maxCols = Math.min(ayD[0].length, 7); doc.autoTable({ startY: y, head: [ayD[0].slice(0, maxCols)], body: ayD.slice(1).map(r => r.slice(0, maxCols)), headStyles: { fillColor: [61, 53, 128], textColor: 255, fontStyle: 'bold', fontSize: 7 }, bodyStyles: { fontSize: 7, textColor: [44, 44, 62] }, alternateRowStyles: { fillColor: [232, 245, 233] }, styles: { font: 'helvetica', cellPadding: 1.5, overflow: 'ellipsize' }, columnStyles: { 0: { cellWidth: 50 } }, didParseCell: (d) => { if (d.section === 'body' && d.column.index > 0 && d.cell.raw !== '') { const n = parseFloat(d.cell.raw); if (!isNaN(n)) { if (n >= 85) d.cell.styles.fillColor = [198, 239, 206]; else if (n >= 75) d.cell.styles.fillColor = [255, 237, 153]; else if (n !== '') d.cell.styles.fillColor = [255, 204, 204]; } } }, theme: 'grid', margin: { left: 20, right: 20 } }); y = doc.lastAutoTable.finalY + 10; } if (U.aiText && U.aiText.trim()) { if (y > 240) { doc.addPage(); doc.setFillColor(26, 26, 46); doc.rect(0, 0, 210, 297, 'F'); y = 20; } doc.setTextColor(124, 109, 250); doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text('AI Analiz Raporu (Claude Sonnet)', 20, y); y += 7; doc.setDrawColor(124, 109, 250); doc.line(20, y, 190, y); y += 5; doc.setTextColor(200, 200, 220); doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); const cleanText = U.aiText.replace(/[*#]/g, '').replace(/\n{3,}/g, '\n\n'); const lines = doc.splitTextToSize(cleanText, 165); let remaining = lines; while (remaining.length > 0) { const pageLines = Math.floor((280 - y) / 4.5); const chunk = remaining.slice(0, pageLines); doc.text(chunk, 20, y); remaining = remaining.slice(pageLines); if (remaining.length > 0) { doc.addPage(); doc.setFillColor(26, 26, 46); doc.rect(0, 0, 210, 297, 'F'); y = 20; doc.setTextColor(200, 200, 220); doc.setFontSize(8.5); } else y += chunk.length * 4.5; } } doc.save(exportName + '_Analiz.pdf'); st('expSt', `✅ "${exportName}_Analiz.pdf" indirildi.`, 'ok'); }

// ==================== UTILITIES ====================
function extractProjectName(fn) { let n = fn.replace(/\.[^.]+$/, '').replace(/[-_]\d{4}$/, ''); const cleanTokens = ['Kalite_Raporu_Güncelleme', 'Kalite_Raporu', 'Güncelleme', 'BMSOnly', '_Güncelleme']; cleanTokens.forEach(t => n = n.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')); const datePattern = /[_-]?\d{1,2}-\d{1,2}\s*[A-ZÇĞİÖŞÜa-zçğışöüı]+['']?\d{2}/g; n = n.replace(datePattern, ''); n = n.replace(/[_-]+$/, '').replace(/^[_-]+/, '').trim(); return n || fn.replace(/\.[^.]+$/, ''); }
function adjYear(d) { const el = document.getElementById('raporYil'); el.value = parseInt(el.value || new Date().getFullYear()) + d; updateExpName(); }
let _csvDelim = ','; function parseCSV(line) { const sep = _csvDelim; let r = [], c = '', q = false; for (let i = 0; i < line.length; i++) { if (line[i] === '"') { q = !q; } else if (line[i] === sep && !q) { r.push(c.trim()); c = ''; } else c += line[i]; } r.push(c.trim()); return r; }
function readXLSX(file, cb) { const rd = new FileReader(); rd.onload = e => { const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' }); cb(wb); }; rd.readAsArrayBuffer(file); }
function readCSVFile(file, cb) { const isXLSX = file.name.match(/\.xlsx?$/i); if (isXLSX) { const rd = new FileReader(); rd.onload = e => { try { const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', raw: false, dateNF: 'dd.mm.yyyy' }); const ws = wb.Sheets[wb.SheetNames[0]]; const csv = XLSX.utils.sheet_to_csv(ws, { FS: ',' }); _csvDelim = ','; cb(csv); } catch (err) { cb(''); } }; rd.readAsArrayBuffer(file); return; } const tryRead = (encoding) => { const rd = new FileReader(); rd.onload = e => { let text = e.target.result; if (!text || !text.trim()) { if (encoding === 'UTF-8') tryRead('windows-1252'); else cb(''); return; } if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); const firstLine = text.split(/\r?\n/).find(l => l.trim()); if (firstLine) { const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 }; let inQ = false; for (let ch of firstLine) { if (ch === '"') inQ = !inQ; else if (!inQ && counts[ch] !== undefined) counts[ch]++; } _csvDelim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]; } cb(text); }; rd.onerror = () => { if (encoding === 'UTF-8') tryRead('windows-1252'); else cb(''); }; try { rd.readAsText(file, encoding); } catch (e) { cb(''); } }; tryRead('UTF-8'); }
function setupDrop(d, f, fn) { d.onclick = () => f.click(); f.onchange = e => { if (e.target.files[0]) fn(e.target.files[0]); }; d.ondragover = e => { e.preventDefault(); d.classList.add('drag'); }; d.ondragleave = () => d.classList.remove('drag'); d.ondrop = e => { e.preventDefault(); d.classList.remove('drag'); if (e.dataTransfer.files[0]) fn(e.dataTransfer.files[0]); }; }
function st(id, msg, t) { const el = document.getElementById(id); if (!el) return; el.textContent = msg; el.className = 'sbar on ' + (t || ''); }
function colLetter(i) { let s = ''; i++; while (i > 0) { i--; s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26); } return s; }

// ==================== INIT ====================
document.querySelectorAll('.df-btn[id]').forEach(btn => { btn.onclick = () => setF(btn.id === 'dfAll' ? 'all' : btn.id === 'dfNew' ? 'new' : 'dup', btn); });
document.querySelectorAll('.col-tool-btn').forEach(btn => { if (btn.textContent.includes('10') || btn.textContent.includes('25') || btn.textContent.includes('50')) btn.onclick = () => setDR(parseInt(btn.textContent), btn); });