// ==================== SABİTLER ====================
const GITHUB_OWNER = "berkeilgin";
const GITHUB_REPO = "portal";
const GITHUB_BRANCH = "main";

// ==================== FIREBASE ====================
const firebaseConfig = {
  apiKey: "AIzaSyBDClqNyqtNL_h8Yovoe2r9RFAs8VjNef8",
  authDomain: "case-management-system-53f44.firebaseapp.com",
  projectId: "case-management-system-53f44",
  storageBucket: "case-management-system-53f44.firebasestorage.app",
  messagingSenderId: "381220130397",
  appId: "1:381220130397:web:97124d8836681bc62c07b4"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const caseDb = firebase.firestore();

// ==================== GLOBAL STATE ====================
let data = null, fileSha = null, currentUser = null;
let githubToken = null;
let categoryChart = null;

// ==================== GITHUB HELPERS ====================
function getToken() { return githubToken || sessionStorage.getItem('gh_token') || ''; }
function apiBase() { return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`; }

async function ghGet(path) {
  const res = await fetch(`${apiBase()}/${path}?ref=${GITHUB_BRANCH}`, {
    headers: { 'Authorization': `Bearer ${getToken()}`, 'Accept': 'application/vnd.github.v3+json' }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function ghPut(path, content, sha, message) {
  const body = { message, content, branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(`${apiBase()}/${path}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function b64Encode(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64Decode(str) { return decodeURIComponent(escape(atob(str))); }

// ==================== UPLOAD FONKSİYONLARI ====================
let uploadFilesList = [];

function initUpload() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  if (!dropZone || !fileInput) return;

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  });
  fileInput.addEventListener('change', (e) => {
    handleFiles(Array.from(e.target.files));
  });
}

function handleFiles(files) {
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  uploadFilesList = imageFiles;
  const preview = document.getElementById('uploadPreview');
  preview.innerHTML = imageFiles.map(file => `
    <div class="upload-thumb">
      <img src="${URL.createObjectURL(file)}">
      <span>${file.name}</span>
    </div>
  `).join('');
  document.getElementById('uploadBtn').disabled = imageFiles.length === 0;
}

async function uploadFiles() {
  if (!uploadFilesList.length) return;
  const btn = document.getElementById('uploadBtn');
  btn.disabled = true;
  btn.textContent = 'Yükleniyor...';
  const statusDiv = document.getElementById('uploadStatus');
  statusDiv.innerHTML = '';
  
  for (const file of uploadFilesList) {
    try {
      const reader = new FileReader();
      const content = await new Promise((resolve) => {
        reader.onload = (e) => resolve(btoa(e.target.result));
        reader.readAsBinaryString(file);
      });
      const path = `logos/${file.name}`;
      await ghPut(path, content, null, `Upload ${file.name}`);
      statusDiv.innerHTML += `<div>✅ ${file.name} yüklendi.</div>`;
    } catch (err) {
      statusDiv.innerHTML += `<div>❌ ${file.name} yüklenemedi: ${err.message}</div>`;
    }
  }
  btn.disabled = false;
  btn.textContent = '⬆️ GitHub\'a Yükle';
  uploadFilesList = [];
  document.getElementById('uploadPreview').innerHTML = '';
}

// ==================== TOGGLE BUTTONLARI ====================
function initToggles() {
  const maintToggle = document.getElementById('maintToggle');
  const annToggle = document.getElementById('annToggle');
  if (!maintToggle || !annToggle) return;
  
  const newMaint = maintToggle.cloneNode(true);
  maintToggle.parentNode.replaceChild(newMaint, maintToggle);
  const newAnn = annToggle.cloneNode(true);
  annToggle.parentNode.replaceChild(newAnn, annToggle);
  
  newMaint.addEventListener('click', (e) => {
    e.stopPropagation();
    newMaint.classList.toggle('on');
  });
  newAnn.addEventListener('click', (e) => {
    e.stopPropagation();
    newAnn.classList.toggle('on');
  });
}

// ==================== VERİ DÖNÜŞÜMÜ ====================
function migrateData(rawData) {
  if (rawData.categories) {
    rawData.categories.forEach(cat => {
      if (!cat.labelEn) cat.labelEn = cat.label;
    });
  }
  if (rawData.tools) {
    rawData.tools.forEach((tool, idx) => {
      if (!tool.nameEn) tool.nameEn = tool.name;
      if (tool.order === undefined) tool.order = idx;
    });
    rawData.tools.sort((a,b) => (a.order || 0) - (b.order || 0));
  }
  if (!rawData.copyrightText) rawData.copyrightText = '© 2025 QA Portal';
  if (rawData.maintenance === undefined) rawData.maintenance = false;
  if (!rawData.maintenanceMessage) rawData.maintenanceMessage = '';
  if (!rawData.announcement) rawData.announcement = { active: false, text: '', type: 'info' };
  if (!rawData.users) rawData.users = [];
  if (!rawData.themes) rawData.themes = [];
  return rawData;
}

// ==================== LOAD DATA & RENDER ====================
async function loadData() {
  try {
    const result = await ghGet('tools.json');
    fileSha = result.sha;
    let raw = JSON.parse(b64Decode(result.content));
    data = migrateData(raw);
    
    const maintToggle = document.getElementById('maintToggle');
    const annToggle = document.getElementById('annToggle');
    if (maintToggle) maintToggle.classList.toggle('on', data.maintenance === true);
    if (annToggle) annToggle.classList.toggle('on', data.announcement?.active === true);
    
    const maintMsg = document.getElementById('maintMsg');
    const annText = document.getElementById('annText');
    const annType = document.getElementById('annType');
    const copyrightInput = document.getElementById('copyrightInput');
    if (maintMsg) maintMsg.value = data.maintenanceMessage || '';
    if (annText) annText.value = data.announcement?.text || '';
    if (annType) annType.value = data.announcement?.type || 'info';
    if (copyrightInput) copyrightInput.value = data.copyrightText;
    
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) saveBtn.disabled = false;
    
    renderAll();
    if (window.initThemes) window.initThemes(data);
    
  } catch(e) {
    console.error(e);
    const statusMsg = document.getElementById('statusMsg');
    if (statusMsg) statusMsg.textContent = 'Veri yüklenemedi: ' + e.message;
    else alert('Veri yüklenemedi: ' + e.message);
  }
}

function renderAll() {
  renderToolsTable();
  renderCategoriesTable();
  renderUsersTable();
  renderThemesTable();
  loadStats();
}

function renderToolsTable() {
  const tbody = document.getElementById('toolsTableBody');
  if (!tbody || !data) return;
  const catMap = Object.fromEntries(data.categories.map(c => [c.id, c]));
  const searchTerm = (document.getElementById('searchTools')?.value || '').toLowerCase();
  let filtered = data.tools.filter(t => t.name.toLowerCase().includes(searchTerm) || t.id.toLowerCase().includes(searchTerm));
  tbody.innerHTML = filtered.map((t) => {
    const actualIndex = data.tools.findIndex(tt => tt.id === t.id);
    return `
    <tr>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="moveTool(${actualIndex}, -1)" ${actualIndex === 0 ? 'disabled' : ''}>▲</button>
        <button class="btn btn-ghost btn-sm" onclick="moveTool(${actualIndex}, 1)" ${actualIndex === data.tools.length-1 ? 'disabled' : ''}>▼</button>
        ${actualIndex+1}
      </td>
      <td><img src="logos/${t.icon}" style="width:24px;" onerror="this.src='logos/logo.png'"></td>
      <td>${t.name}<br><span style="font-size:10px">${t.id}</span></td>
      <td>${catMap[t.cat]?.icon || ''} ${catMap[t.cat]?.label || t.cat}</td>
      <td class="url-cell">${t.url}</td>
      <td><button class="toggle-switch ${t.isEnabled !== false ? 'on' : ''}" onclick="toggleToolFlag('${t.id}','isEnabled',this)"></button></td>
      <td><button class="toggle-switch ${t.isNew ? 'on' : ''}" onclick="toggleToolFlag('${t.id}','isNew',this)"></button></td>
      <td><button class="toggle-switch ${t.isTest ? 'on' : ''}" onclick="toggleToolFlag('${t.id}','isTest',this)"></button></td>
      <td><button class="toggle-switch ${t.isBest ? 'on' : ''}" onclick="toggleToolFlag('${t.id}','isBest',this)"></button></td>
      <td><button class="btn btn-ghost btn-sm" onclick="editTool('${t.id}')">✏️</button></td>
    </tr>
    `;
  }).join('');
}

function renderCategoriesTable() {
  const tbody = document.getElementById('categoriesTableBody');
  if (!tbody || !data) return;
  tbody.innerHTML = data.categories.map((c, i) => `
    <tr>
      <td><button class="btn btn-ghost btn-sm" onclick="moveCategory(${i},-1)">▲</button> ${i+1}</td>
      <td>${c.id}</td>
      <td>${c.label}</td>
      <td>${c.labelEn || c.label}</td>
      <td>${c.icon || ''}</td>
      <td>${data.tools.filter(t => t.cat === c.id).length}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="editCategory('${c.id}')">✏️</button></td>
    </tr>
  `).join('');
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody || !data) return;
  tbody.innerHTML = data.users.map(u => `
    <tr>
      <td>${u.username}</td>
      <td>${u.role}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="editUser('${u.username}')">✏️</button></td>
    </tr>
  `).join('');
}

function toggleToolFlag(id, field, btn) {
  const tool = data.tools.find(t => t.id === id);
  if (tool) { tool[field] = !tool[field]; btn.classList.toggle('on'); }
}

function moveCategory(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= data.categories.length) return;
  [data.categories[idx], data.categories[newIdx]] = [data.categories[newIdx], data.categories[idx]];
  renderCategoriesTable();
}

function moveTool(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= data.tools.length) return;
  [data.tools[idx], data.tools[newIdx]] = [data.tools[newIdx], data.tools[idx]];
  data.tools.forEach((t, i) => { t.order = i; });
  renderToolsTable();
}

// ==================== MODAL KONTROLLERİ ====================
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
}

// ----- TOOL MODAL -----
function openToolModal(toolId = null) {
  if (!data) { alert('Veri henüz yüklenmedi.'); return; }
  const modal = document.getElementById('toolModal');
  const title = document.getElementById('toolModalTitle');
  const catSelect = document.getElementById('toolCat');
  if (!modal || !title || !catSelect) return;
  catSelect.innerHTML = '<option value="">Seçin</option>' + data.categories.map(c => `<option value="${c.id}">${c.icon || ''} ${c.label}</option>`).join('');
  const enabledBtn = document.getElementById('toolEnabled');
  const isNewBtn = document.getElementById('toolIsNew');
  const isTestBtn = document.getElementById('toolIsTest');
  const isBestBtn = document.getElementById('toolIsBest');
  if (toolId) {
    const tool = data.tools.find(t => t.id === toolId);
    if (!tool) return;
    title.innerText = '✏️ Araç Düzenle';
    document.getElementById('toolId').value = tool.id; document.getElementById('toolId').disabled = true;
    document.getElementById('toolName').value = tool.name || '';
    document.getElementById('toolNameEn').value = tool.nameEn || '';
    document.getElementById('toolUrl').value = tool.url;
    document.getElementById('toolIcon').value = tool.icon || '';
    catSelect.value = tool.cat;
    if (enabledBtn) enabledBtn.classList.toggle('on', tool.isEnabled !== false);
    if (isNewBtn) isNewBtn.classList.toggle('on', tool.isNew === true);
    if (isTestBtn) isTestBtn.classList.toggle('on', tool.isTest === true);
    if (isBestBtn) isBestBtn.classList.toggle('on', tool.isBest === true);
  } else {
    title.innerText = '+ Yeni Araç';
    document.getElementById('toolId').disabled = false;
    document.getElementById('toolId').value = '';
    document.getElementById('toolName').value = '';
    document.getElementById('toolNameEn').value = '';
    document.getElementById('toolUrl').value = '';
    document.getElementById('toolIcon').value = '';
    catSelect.value = '';
    if (enabledBtn) { enabledBtn.classList.remove('on'); enabledBtn.classList.add('on'); }
    if (isNewBtn) isNewBtn.classList.remove('on');
    if (isTestBtn) isTestBtn.classList.remove('on');
    if (isBestBtn) isBestBtn.classList.remove('on');
  }
  attachToggleClick([enabledBtn, isNewBtn, isTestBtn, isBestBtn]);
  modal.style.display = 'flex';
}

function attachToggleClick(buttons) {
  buttons.forEach(btn => {
    if (!btn) return;
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', (e) => { e.stopPropagation(); newBtn.classList.toggle('on'); });
  });
  const enabled = document.getElementById('toolEnabled');
  const isNew = document.getElementById('toolIsNew');
  const isTest = document.getElementById('toolIsTest');
  const isBest = document.getElementById('toolIsBest');
  if (enabled) enabled.addEventListener('click', (e) => e.stopPropagation());
  if (isNew) isNew.addEventListener('click', (e) => e.stopPropagation());
  if (isTest) isTest.addEventListener('click', (e) => e.stopPropagation());
  if (isBest) isBest.addEventListener('click', (e) => e.stopPropagation());
}

function saveTool() {
  if (!data) { alert('Veri yüklenmedi.'); return; }
  const id = document.getElementById('toolId').value.trim();
  const name = document.getElementById('toolName').value.trim();
  const nameEn = document.getElementById('toolNameEn').value.trim();
  const url = document.getElementById('toolUrl').value.trim();
  const cat = document.getElementById('toolCat').value;
  const icon = document.getElementById('toolIcon').value.trim();
  const isEnabled = document.getElementById('toolEnabled').classList.contains('on');
  const isNew = document.getElementById('toolIsNew').classList.contains('on');
  const isTest = document.getElementById('toolIsTest').classList.contains('on');
  const isBest = document.getElementById('toolIsBest').classList.contains('on');
  if (!id || !name || !url || !cat) { alert('ID, Ad (TR), URL ve Kategori zorunludur.'); return; }
  const existing = data.tools.find(t => t.id === id);
  if (existing && document.getElementById('toolId').disabled === false) { alert('Bu ID ile bir araç zaten var.'); return; }
  const newOrder = existing ? existing.order : data.tools.length;
  const toolData = { id, name, nameEn: nameEn || name, url, cat, icon, isEnabled, isNew, isTest, isBest, order: newOrder };
  if (existing) Object.assign(existing, toolData);
  else data.tools.push(toolData);
  data.tools.sort((a,b) => (a.order || 0) - (b.order || 0));
  data.tools.forEach((t, i) => { t.order = i; });
  renderToolsTable();
  closeModal('toolModal');
}

// ----- CATEGORY MODAL -----
function openCategoryModal(catId = null) {
  if (!data) { alert('Veri henüz yüklenmedi.'); return; }
  const modal = document.getElementById('categoryModal');
  const title = document.getElementById('categoryModalTitle');
  if (!modal || !title) return;
  if (catId) {
    const cat = data.categories.find(c => c.id === catId);
    if (!cat) return;
    title.innerText = '✏️ Kategori Düzenle';
    document.getElementById('catId').value = cat.id; document.getElementById('catId').disabled = true;
    document.getElementById('catLabel').value = cat.label || '';
    document.getElementById('catLabelEn').value = cat.labelEn || '';
    document.getElementById('catIcon').value = cat.icon || '';
  } else {
    title.innerText = '+ Yeni Kategori';
    document.getElementById('catId').disabled = false;
    document.getElementById('catId').value = '';
    document.getElementById('catLabel').value = '';
    document.getElementById('catLabelEn').value = '';
    document.getElementById('catIcon').value = '';
  }
  modal.style.display = 'flex';
}

function saveCategory() {
  if (!data) { alert('Veri yüklenmedi.'); return; }
  const id = document.getElementById('catId').value.trim();
  const label = document.getElementById('catLabel').value.trim();
  const labelEn = document.getElementById('catLabelEn').value.trim();
  const icon = document.getElementById('catIcon').value.trim();
  if (!id || !label) { alert('ID ve Etiket (TR) zorunludur.'); return; }
  const existing = data.categories.find(c => c.id === id);
  if (existing && document.getElementById('catId').disabled === false) { alert('Bu ID ile bir kategori zaten var.'); return; }
  if (existing) { existing.label = label; existing.labelEn = labelEn || label; existing.icon = icon; }
  else data.categories.push({ id, label, labelEn: labelEn || label, icon });
  renderCategoriesTable();
  closeModal('categoryModal');
}

// ----- USER MODAL -----
function openUserModal(username = null) {
  if (!data) { alert('Veri henüz yüklenmedi.'); return; }
  const modal = document.getElementById('userModal');
  const title = document.getElementById('userModalTitle');
  if (!modal || !title) return;
  if (username) {
    const user = data.users.find(u => u.username === username);
    if (!user) return;
    title.innerText = '✏️ Kullanıcı Düzenle';
    document.getElementById('userUsername').value = user.username; document.getElementById('userUsername').disabled = true;
    document.getElementById('userRole').value = user.role;
    document.getElementById('userPassword').value = ''; document.getElementById('userPassword2').value = '';
  } else {
    title.innerText = '+ Yeni Kullanıcı';
    document.getElementById('userUsername').disabled = false;
    document.getElementById('userUsername').value = '';
    document.getElementById('userRole').value = 'editor';
    document.getElementById('userPassword').value = ''; document.getElementById('userPassword2').value = '';
  }
  modal.style.display = 'flex';
}

function saveUser() {
  if (!data) { alert('Veri yüklenmedi.'); return; }
  const username = document.getElementById('userUsername').value.trim();
  const role = document.getElementById('userRole').value;
  const password = document.getElementById('userPassword').value;
  const password2 = document.getElementById('userPassword2').value;
  if (!username) { alert('Kullanıcı adı zorunludur.'); return; }
  const existing = data.users.find(u => u.username === username);
  const isNew = !existing;
  if (isNew && !password) { alert('Yeni kullanıcı için şifre girilmelidir.'); return; }
  if (password !== password2) { alert('Şifreler eşleşmiyor.'); return; }
  if (existing) { existing.role = role; if (password) existing.password = password; }
  else data.users.push({ username, role, password });
  renderUsersTable();
  closeModal('userModal');
}

window.editTool = function(id) { openToolModal(id); };
window.editCategory = function(id) { openCategoryModal(id); };
window.editUser = function(username) { openUserModal(username); };
window.moveTool = moveTool;

// ==================== DETAYLI STATS ====================
function loadStats() {
  if (!data) return;
  const statsRaw = JSON.parse(localStorage.getItem('qa_stats') || '{}');
  const total = Object.values(statsRaw).reduce((a,b)=>a+b,0);
  
  const statsContainer = document.getElementById('statsCards');
  if (statsContainer) {
    statsContainer.innerHTML = `<div class="stat-card"><div class="number">${total}</div><div>Toplam Açılış</div></div>`;
  }
  
  // Kategori bazlı toplamlar
  const catTotals = {};
  data.categories.forEach(cat => { catTotals[cat.id] = 0; });
  data.tools.forEach(tool => {
    const count = statsRaw[tool.id] || 0;
    if (catTotals[tool.cat] !== undefined) catTotals[tool.cat] += count;
  });
  
  const catLabels = [];
  const catData = [];
  for (const [catId, count] of Object.entries(catTotals)) {
    const cat = data.categories.find(c => c.id === catId);
    if (cat && count > 0) {
      catLabels.push(cat.icon + ' ' + (localStorage.getItem('qa_lang') === 'en' ? (cat.labelEn || cat.label) : cat.label));
      catData.push(count);
    }
  }
  
  const ctx = document.getElementById('categoryChart')?.getContext('2d');
  if (ctx) {
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: catLabels, datasets: [{ label: 'Tıklanma Sayısı', data: catData, backgroundColor: 'var(--accent2)', borderColor: 'var(--accent)', borderWidth: 1 }] },
      options: { responsive: true, maintainAspectRatio: true, scales: { y: { beginAtZero: true } } }
    });
  }
  
  // En çok tıklanan 10 araç
  const toolStats = data.tools.map(tool => ({ id: tool.id, name: tool.name, nameEn: tool.nameEn, cat: tool.cat, count: statsRaw[tool.id] || 0 }));
  toolStats.sort((a,b) => b.count - a.count);
  const top10 = toolStats.slice(0,10);
  const topListDiv = document.getElementById('topToolsList');
  if (topListDiv) {
    topListDiv.innerHTML = top10.map((t, i) => {
      const lang = localStorage.getItem('qa_lang') === 'en' ? t.nameEn : t.name;
      return `<div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid var(--border);"><span><strong>${i+1}.</strong> ${lang}</span><span>${t.count} kez</span></div>`;
    }).join('');
  }
  
  // Tüm araçların tablosu
  const tbody = document.getElementById('toolsStatsBody');
  if (tbody) {
    tbody.innerHTML = toolStats.map(t => {
      const percent = total ? ((t.count / total) * 100).toFixed(1) : '0.0';
      const lang = localStorage.getItem('qa_lang') === 'en' ? t.nameEn : t.name;
      const cat = data.categories.find(c => c.id === t.cat);
      const catName = cat ? (localStorage.getItem('qa_lang') === 'en' ? (cat.labelEn || cat.label) : cat.label) : t.cat;
      return `<tr><td>${lang}</td><td>${catName}</td><td>${t.count}</td><td>${percent}%</td></tr>`;
    }).join('');
  }
}

function clearStats() {
  if (confirm('Tüm istatistikler sıfırlansın mı?')) {
    localStorage.removeItem('qa_stats');
    loadStats();
  }
}

// ==================== SAVE TO GITHUB ====================
async function saveToGitHub() {
  if (!data || !fileSha) { alert('Veri yüklenmedi'); return; }
  data.maintenance = document.getElementById('maintToggle').classList.contains('on');
  data.maintenanceMessage = document.getElementById('maintMsg').value;
  data.announcement = {
    active: document.getElementById('annToggle').classList.contains('on'),
    text: document.getElementById('annText').value,
    type: document.getElementById('annType').value
  };
  data.copyrightText = document.getElementById('copyrightInput').value;
  const btn = document.getElementById('saveBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = 'Kaydediliyor...'; }
  try {
    await ghPut('tools.json', b64Encode(JSON.stringify(data, null, 2)), fileSha, 'Admin güncelleme');
    alert('✅ Kaydedildi! Sayfa yenilenecek.');
    location.reload();
  } catch(e) { alert('Hata: ' + e.message); }
  if (btn) { btn.disabled = false; btn.innerHTML = '💾 Kaydet & Yayınla'; }
}

// ==================== CASE STATS ====================
async function loadCaseStats() {
  const cards = document.getElementById('caseStatsCards');
  const details = document.getElementById('caseStatsDetails');
  if (!cards || !details) return;
  cards.innerHTML = '<div class="loading-spinner"></div>';
  details.innerHTML = '';
  try {
    const snap = await caseDb.collection('cases').get();
    const cases = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const total = cases.length;
    const open = cases.filter(c => c.status !== 'çözüldü' && c.status !== 'reddedildi').length;
    const resolved = cases.filter(c => c.status === 'çözüldü').length;
    let avgTime = 0;
    const times = cases.filter(c => c.resolutionTime).map(c => c.resolutionTime);
    if (times.length) avgTime = times.reduce((a,b)=>a+b,0)/times.length;
    cards.innerHTML = `
      <div class="stat-card"><div class="number">${total}</div><div>Toplam Case</div></div>
      <div class="stat-card"><div class="number">${open}</div><div>Açık Case</div></div>
      <div class="stat-card"><div class="number">${resolved}</div><div>Çözülen</div></div>
      <div class="stat-card"><div class="number">${avgTime.toFixed(1)}</div><div>Ort. Çözüm (gün)</div></div>
    `;
    const last7 = [];
    for (let i = 6; i >= 0; i--) { let d = new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0); last7.push(d); }
    const trend = last7.map(day => ({
      date: day.toLocaleDateString('tr-TR', { month:'short', day:'numeric' }),
      count: cases.filter(c => { let cr = c.createdAt?.toDate(); if(!cr) return false; cr.setHours(0,0,0,0); return cr.getTime() === day.getTime(); }).length
    }));
    const maxCount = Math.max(...trend.map(t=>t.count),1);
    const trendHtml = `<div style="display:flex; gap:12px; align-items:flex-end; height:160px; margin-top:16px;">${trend.map(t => `
      <div style="flex:1; text-align:center;">
        <div style="height:${(t.count/maxCount)*120}px; background:linear-gradient(180deg,var(--accent2),var(--accent)); border-radius:6px 6px 0 0;"></div>
        <div style="font-size:11px; margin-top:6px;">${t.date}</div>
        <div style="font-size:12px; font-weight:bold;">${t.count}</div>
      </div>
    `).join('')}</div>`;
    details.innerHTML = `
      <div class="panel"><h3>📈 Son 7 Gün Trendi</h3>${trendHtml}</div>
      <div class="panel"><h3>📊 Durum Dağılımı</h3><div class="stats-grid">${['beklemede','sürüyor','çözüldü','reddedildi'].map(s => `<div class="stat-card"><div class="number">${cases.filter(c=>c.status===s).length}</div><div>${s}</div></div>`).join('')}</div></div>
    `;
  } catch(e) { cards.innerHTML = '<div class="status-bar err">Yüklenemedi</div>'; }
}

// ==================== TEMA YÖNETİMİ ====================
function renderThemesTable() {
  const tbody = document.getElementById('themesTableBody');
  if (!tbody || !data || !data.themes) return;
  tbody.innerHTML = data.themes.map((t) => `
    <table>
      <td>${t.id}</td>
      <td>${t.icon || ''}</td>
      <td>${t.nameTr || ''}</td>
      <td>${t.nameEn || ''}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="editTheme('${t.id}')">✏️</button></td>
    </tr>
  `).join('');
}

function rgbToHex(color) {
  if (!color) return '#000000';
  if (color.startsWith('#')) return color;
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (match) {
    return '#' + ((1 << 24) + (parseInt(match[1]) << 16) + (parseInt(match[2]) << 8) + parseInt(match[3])).toString(16).slice(1);
  }
  return '#000000';
}

function editTheme(themeId) {
  const theme = data.themes.find(t => t.id === themeId);
  if (!theme) return;
  document.getElementById('themeModalTitle').innerText = '✏️ Temayı Düzenle';
  document.getElementById('themeId').value = theme.id;
  document.getElementById('themeId').disabled = true;
  document.getElementById('themeIcon').value = theme.icon || '';
  document.getElementById('themeNameTr').value = theme.nameTr || '';
  document.getElementById('themeNameEn').value = theme.nameEn || '';

  const container = document.getElementById('colorFields');
  const colors = theme.colors || {};
  container.innerHTML = Object.keys(colors).map(key => `
    <div class="form-group">
      <label>${key}</label>
      <div style="display: flex; gap: 8px; align-items: center;">
        <input type="color" data-color-key="${key}" value="${rgbToHex(colors[key])}" style="width: 50px; height: 35px; padding: 0; border: 1px solid var(--border); background: var(--surface);">
        <input type="text" class="color-text" data-color-key="${key}" value="${colors[key]}" style="flex: 1; font-family: monospace;">
        <div class="color-preview" style="background-color: ${colors[key]}; width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--border);"></div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('input[type="color"]').forEach(picker => {
    picker.addEventListener('input', (e) => {
      const key = picker.dataset.colorKey;
      const hex = picker.value;
      const textInput = container.querySelector(`.color-text[data-color-key="${key}"]`);
      const preview = picker.parentElement.querySelector('.color-preview');
      if (textInput) textInput.value = hex;
      if (preview) preview.style.backgroundColor = hex;
    });
  });
  container.querySelectorAll('.color-text').forEach(text => {
    text.addEventListener('input', (e) => {
      const key = text.dataset.colorKey;
      const val = text.value;
      const picker = container.querySelector(`input[type="color"][data-color-key="${key}"]`);
      const preview = text.parentElement.querySelector('.color-preview');
      if (picker) picker.value = val;
      if (preview) preview.style.backgroundColor = val;
    });
  });

  document.getElementById('deleteThemeBtn').style.display = 'inline-block';
  document.getElementById('deleteThemeBtn').onclick = () => deleteTheme(theme.id);
  document.getElementById('themeModal').style.display = 'flex';
}

function openThemeModal() {
  document.getElementById('themeModalTitle').innerText = '+ Yeni Tema';
  document.getElementById('themeId').value = '';
  document.getElementById('themeId').disabled = false;
  document.getElementById('themeIcon').value = '';
  document.getElementById('themeNameTr').value = '';
  document.getElementById('themeNameEn').value = '';
  const defaultColors = data.themes[0]?.colors || {};
  const container = document.getElementById('colorFields');
  container.innerHTML = Object.keys(defaultColors).map(key => `
    <div class="form-group">
      <label>${key}</label>
      <div style="display: flex; gap: 8px; align-items: center;">
        <input type="color" data-color-key="${key}" value="${rgbToHex(defaultColors[key])}" style="width: 50px; height: 35px; padding: 0; border: 1px solid var(--border); background: var(--surface);">
        <input type="text" class="color-text" data-color-key="${key}" value="${defaultColors[key]}" style="flex: 1; font-family: monospace;">
        <div class="color-preview" style="background-color: ${defaultColors[key]}; width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--border);"></div>
      </div>
    </div>
  `).join('');
  
  container.querySelectorAll('input[type="color"]').forEach(picker => {
    picker.addEventListener('input', (e) => {
      const key = picker.dataset.colorKey;
      const hex = picker.value;
      const textInput = container.querySelector(`.color-text[data-color-key="${key}"]`);
      const preview = picker.parentElement.querySelector('.color-preview');
      if (textInput) textInput.value = hex;
      if (preview) preview.style.backgroundColor = hex;
    });
  });
  container.querySelectorAll('.color-text').forEach(text => {
    text.addEventListener('input', (e) => {
      const key = text.dataset.colorKey;
      const val = text.value;
      const picker = container.querySelector(`input[type="color"][data-color-key="${key}"]`);
      const preview = text.parentElement.querySelector('.color-preview');
      if (picker) picker.value = val;
      if (preview) preview.style.backgroundColor = val;
    });
  });
  
  document.getElementById('deleteThemeBtn').style.display = 'none';
  document.getElementById('themeModal').style.display = 'flex';
}

function saveTheme() {
  const id = document.getElementById('themeId').value.trim();
  const icon = document.getElementById('themeIcon').value.trim();
  const nameTr = document.getElementById('themeNameTr').value.trim();
  const nameEn = document.getElementById('themeNameEn').value.trim();
  if (!id || !nameTr) { alert('ID ve TR ad zorunlu'); return; }

  const colors = {};
  document.querySelectorAll('#colorFields .color-text').forEach(inp => {
    colors[inp.dataset.colorKey] = inp.value;
  });

  const newTheme = { id, icon, nameTr, nameEn, colors };
  const existingIndex = data.themes.findIndex(t => t.id === id);
  if (existingIndex >= 0) data.themes[existingIndex] = newTheme;
  else data.themes.push(newTheme);

  closeModal('themeModal');
  renderThemesTable();
  if (window.refreshThemeList) window.refreshThemeList(data.themes);
  if (window.getCurrentTheme && window.getCurrentTheme() === id) window.setTheme(id, false);
}

function deleteTheme(themeId) {
  if (data.themes.length <= 1) { alert('En az bir tema kalmalıdır.'); return; }
  if (!confirm(`"${themeId}" temasını silmek istediğinizden emin misiniz?`)) return;
  data.themes = data.themes.filter(t => t.id !== themeId);
  if (window.getCurrentTheme && window.getCurrentTheme() === themeId) {
    window.setTheme(data.themes[0].id, true);
  }
  renderThemesTable();
  if (window.refreshThemeList) window.refreshThemeList(data.themes);
  closeModal('themeModal');
}

window.renderThemesTable = renderThemesTable;
window.editTheme = editTheme;
window.openThemeModal = openThemeModal;
window.saveTheme = saveTheme;
window.deleteTheme = deleteTheme;

// ==================== FIREBASE LOGIN ====================
async function loginWithFirebase(email, password) {
  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;
    const userDoc = await firebase.firestore().collection('adminUsers').doc(user.uid).get();
    if (!userDoc.exists) throw new Error('Yetkisiz kullanıcı.');
    const userData = userDoc.data();
    githubToken = userData.githubToken;
    if (!githubToken) throw new Error('GitHub token bulunamadı.');
    sessionStorage.setItem('gh_token', githubToken);
    sessionStorage.setItem('qa_user', JSON.stringify({ username: user.email, role: userData.role || 'editor' }));
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('roleBadge').innerHTML = userData.role === 'admin' ? 'ADMIN' : 'EDITOR';
    initToggles();
    await loadData();
    return true;
  } catch (error) {
    console.error(error);
    let errorMsg = 'Giriş başarısız: ';
    switch (error.code) {
      case 'auth/user-not-found': errorMsg += 'Kullanıcı bulunamadı.'; break;
      case 'auth/wrong-password': errorMsg += 'Hatalı şifre.'; break;
      case 'auth/invalid-email': errorMsg += 'Geçersiz email.'; break;
      default: errorMsg += error.message;
    }
    document.getElementById('loginError').textContent = errorMsg;
    return false;
  }
}

document.getElementById('loginBtn').addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorDiv = document.getElementById('loginError');
  if (!email || !password) { errorDiv.textContent = 'Email ve şifre giriniz.'; return; }
  errorDiv.textContent = '';
  await loginWithFirebase(email, password);
});

auth.onAuthStateChanged(async (user) => {
  if (user) {
    try {
      const userDoc = await firebase.firestore().collection('adminUsers').doc(user.uid).get();
      if (userDoc.exists) {
        githubToken = userDoc.data().githubToken;
        sessionStorage.setItem('gh_token', githubToken);
        sessionStorage.setItem('qa_user', JSON.stringify({ username: user.email, role: userDoc.data().role || 'editor' }));
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        document.getElementById('roleBadge').innerHTML = userDoc.data().role === 'admin' ? 'ADMIN' : 'EDITOR';
        initToggles();
        initUpload();
        await loadData();
      } else {
        await auth.signOut();
        document.getElementById('loginScreen').style.display = 'block';
        document.getElementById('adminPanel').style.display = 'none';
      }
    } catch (err) {
      await auth.signOut();
      document.getElementById('loginScreen').style.display = 'block';
      document.getElementById('adminPanel').style.display = 'none';
    }
  } else {
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
  }
});

// Tab geçişleri
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const activeTab = document.getElementById(`tab-${tabId}`);
    if (activeTab) activeTab.classList.add('active');
    btn.classList.add('active');
    if (tabId === 'caseStats') loadCaseStats();
    if (tabId === 'stats') loadStats();
  });
});

const searchTools = document.getElementById('searchTools');
if (searchTools) searchTools.addEventListener('input', () => renderToolsTable());

// Sayfa yüklendiğinde upload özelliğini başlat (giriş yoksa bile çalışmaz, ama zararı yok)
document.addEventListener('DOMContentLoaded', () => {
  initUpload();
});
