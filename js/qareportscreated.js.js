// ==================== STATE ====================
const S = {
  data: null, headers: [], logoURL: null,
  lobActive: false, lobs: [], // {id,name,data,headers,cfg:{...},target:0}
  pTarget: 0, dateField: null, outliers: new Set(),
  previewRows: 5,
  cfg: { splitIdx: -1, critH: [], excludedCrit: new Set(), posMode: 'global', globalPos: null, perPos: {}, ccSel: new Set(), bcSel: new Set(), cmpSel: new Set() },
  colTypes: {}, colOrder: [], allCols: [], baseCols: [], computedCols: [],
  currentLOBIdx: 0 // 0=main data, 1+N=lob index
};
let lobCtr = 0, dragSrc = null, selColIdx = null;

// ==================== TYPE SYSTEM ====================
const TL = { date: 'DATE', datetime: 'DATETIME', time: 'TIME', int64: 'INT64', float: 'FLOAT', percent: '%', binary: 'BIN', text: 'TEXT' };
const TC = { date: 'type-badge type-date', datetime: 'type-badge type-datetime', time: 'type-badge type-time', int64: 'type-badge type-int64', float: 'type-badge type-float', percent: 'type-badge type-percent', binary: 'type-badge type-binary', text: 'type-badge type-text' };
const TRM = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

function detectType(vals) { /* mevcut logic */ }
function parseTrDate(s) { /* mevcut */ }
function fmtTrDate(d) { /* mevcut */ }
function isoWeek(d) { /* mevcut */ }
function getHafta(v) { /* mevcut */ }
function getAy(v) { /* mevcut */ }
function getAyYil(v) { /* mevcut */ }
function getYil(v) { /* mevcut */ }
function tryDate(v) { /* mevcut */ }
function isNA(v) { /* mevcut */ }
function fmtName(s) { /* mevcut */ }
function fmtWeight(v) { /* mevcut */ }

function suggestLOBName(fn) { /* mevcut */ }

// ==================== UTILS ====================
function parseCSVLine(line) { /* mevcut */ }
function readFile(file, cb) { /* mevcut */ }
function setupDrop(d, f, fn) { /* mevcut */ }
function st(id, msg, t) { /* mevcut */ }
function colLetter(i) { /* mevcut */ }
function detectCat(h) { /* mevcut */ }
function isTCD(h) { /* mevcut */ }
function scrollTop() { /* mevcut */ }
function isCatRelated(h) { /* mevcut */ }

// ==================== THEME ====================
function setTheme(t, btn) { /* mevcut (theme.js ile entegre) */ }
(() => { const saved = localStorage.getItem('qa-theme') || 'dark'; document.documentElement.setAttribute('data-theme', saved); })();

// ==================== RESET ====================
function doReset() { /* mevcut */ }

// ==================== STEP NAV ====================
function gotoStep(n) { /* mevcut */ }
function adjYear(d) { /* mevcut */ }

// ==================== STEP 1 ====================
setupDrop(document.getElementById('mainDrop'), document.getElementById('mainFile'), file => { /* mevcut */ });
document.getElementById('mainFDel').onclick = e => { /* mevcut */ };
document.getElementById('lgFile').onchange = e => { /* mevcut */ };
function v1() { /* mevcut */ }
function toggleLOB() { /* mevcut */ }
function updateTargetUI() { /* mevcut */ }
function renderLOBTargets() { /* mevcut */ }
function saveLOBTarget(inputId) { /* mevcut */ }
function addLOB() { /* mevcut */ }
function removeLOB(id) { /* mevcut */ }
function renderLOBList() { /* mevcut */ }
function acceptSuggest(id) { /* mevcut */ }

// ==================== VALIDATION ====================
function getCurrentStep() { /* mevcut */ }
function isValidPercent(v) { /* mevcut */ }
function getValidationErrorsForConfig(cfg, headers, label) { /* mevcut */ }
function getStepValidationErrors(step) { /* mevcut */ }
function showValModal(errs) { /* mevcut */ }
function tryGoto(targetStep) { /* mevcut */ }
function v2() { /* mevcut */ }
function setDate(el, f) { /* mevcut */ }
function toggleOb(el, t) { /* mevcut */ }

// ==================== STEP 3 – LOB WIZARD ====================
function renderLOBWizard() { /* mevcut */ }
function switchLOB(idx) { /* mevcut */ }
function switchLOBNext() { /* mevcut */ }
function getCfg(lob) { /* mevcut */ }
function getHeaders(lob) { /* mevcut */ }
function getData(lob) { /* mevcut */ }
function renderSingleConfig(lob) { /* mevcut */ }
function afterRenderConfig(lob) { /* mevcut */ }
function filterChips(q, lobId, lob) { /* mevcut */ }
function renderChips(filter, lobId, lob) { /* mevcut */ }
function setSplit(idx, lobId, isLob) { /* mevcut */ }
function toggleExclude(e, i, lobId, isLob) { /* mevcut */ }
function renderSelCritChips(lobId, lob) { /* mevcut */ }
function toggleExcludeByName(hdr, lobId, isLob) { /* mevcut */ }
function getUniqForCol(ci, lob) { /* mevcut */ }
function populatePosOpts(lobId, lob) { /* mevcut */ }
function setGlobal(v, lobId, isLob) { /* mevcut */ }
function setPer(col, v, lobId, isLob, el) { /* mevcut */ }
function setPosMode(m, lobId) { /* mevcut */ }
function fillCritBoxes(lobId, lob) { /* mevcut */ }
function clearCatAuto(cat, lobId) { /* mevcut */ }
function toggleCrit(cat, hdr, lobId, isLob, el) { /* mevcut */ }

// ==================== TRANSFORM ROW ====================
function getPosFor(col, cfg) { /* mevcut */ }
function transformRow(row, headers, cfg, dateField, colTypes) { /* mevcut */ }
function getFullHeaders(headers, cfg) { /* mevcut */ }

// ==================== STEP 4 – PREVIEW ====================
function buildPreview() { /* mevcut */ }
function buildColTypes(headers, data, cfg) { /* mevcut */ }
function setPR(n, btn) { /* mevcut */ }
function updateSheetGrid() { /* mevcut */ }

// ==================== STEP 5 – COLUMN EDITOR ====================
function buildColEditor() { /* mevcut */ }
function renderTypeSummary4(colTypes) { /* mevcut */ }
function renderColEditor(fullH, data, headers, cfg, colTypes) { /* mevcut */ }
function getCatColor(h) { /* mevcut */ }
function setColType(idx, type) { /* mevcut */ }
function selCol(pos) { /* mevcut */ }
function updateSelColLbl() { /* mevcut */ }
function dragS(e, pos) { /* mevcut */ }
function dragO(e, pos) { /* mevcut */ }
function dragL(e, pos) { /* mevcut */ }
function dropC(e, pos) { /* mevcut */ }
function resetColOrder() { /* mevcut */ }
function moveColDir(d) { /* mevcut */ }
function moveColEdge(e) { /* mevcut */ }

// ==================== DATE & EXPORT NAME ====================
function getDateRangeLabel() { /* mevcut */ }
function buildExportName() { /* mevcut */ }
function updateExpName() { /* mevcut */ }
document.getElementById('pName').addEventListener('input', updateExpName);
document.getElementById('pTarget').addEventListener('input', () => { S.pTarget = parseFloat(document.getElementById('pTarget').value || 0); v2(); });

// ==================== STYLE HELPERS (Excel) ====================
function thinB(rgb) { /* mevcut */ }
function hdrS(hex, sz) { /* mevcut */ }
function cellS(bgHex, txtHex, sz, bold) { /* mevcut */ }
function setNoGrid(ws) { /* mevcut */ }
function writeCell(ws, r, c, val, type, style) { /* mevcut */ }
function styleSheet(ws, rows, headers, opts) { /* mevcut */ }

// ==================== BUILD DATA ROWS ====================
function buildRows(data, headers, cfg, dateField, colTypes) { /* mevcut */ }

// ==================== SUMMARY BUILDERS ====================
function buildOzet(rows, headers) { /* mevcut */ }
function buildDeger(rows, headers) { /* mevcut */ }
function buildKriter(rows, headers, periodFn) { /* mevcut */ }

// ==================== EXPORT HELPERS ====================
function getLOBsForExport() { /* mevcut */ }
function buildBMSSheet(data, headers, cfg, colTypes, target) { /* mevcut */ }
function buildBirleşimSheet(lobs, target) { /* mevcut */ }
function doExportBMSOnly() { /* mevcut */ }
function doExport() { /* mevcut */ }

// ==================== PDF EXPORT ====================
function T(s) { /* mevcut Türkçe karakter dönüşümü */ }
function pdfNewPage(doc, dark) { /* mevcut */ }
function exportPDF() { /* mevcut (jspdf ile) */ }

// ==================== INIT ====================
document.getElementById('raporYil').value = new Date().getFullYear();
// LOB başlangıçta kapalı, addLOB çağrılmayacak (kullanıcı açarsa)