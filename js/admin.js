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
const caseDb = firebase.firestore();

// ==================== GLOBAL STATE ====================
let data = null, fileSha = null, currentUser = null;

// ==================== GITHUB HELPERS ====================
function getToken() { return sessionStorage.getItem('gh_token') || ''; }
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

// ==================== TOGGLE BUTONLARINI BAŞLAT ====================
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

// ==================== LOAD DATA & RENDER ====================
async function loadData() {
  try {
    const result = await ghGet('tools.json');
    fileSha = result.sha;
    data = JSON.parse(b64Decode(result.content));
    if (!data.categories) data.categories = [];
    if (!data.tools) data.tools = [];
    if (!data.users) data.users = [];
    if (!data.copyrightText) data.copyrightText = '© 2025 QA Portal';
    
    const maintToggle = document.getElementById('maintToggle');
    const annToggle = document.getElementById('annToggle');
    if (maintToggle) maintToggle.classList.toggle('on', data.maintenance === true);
    if (annToggle) annToggle.classList.toggle('on', data.announcement?.active === true);
    
    document.getElementById('maintMsg').value = data.maintenanceMessage || '';
    document.getElementById('annText').value = data.announcement?.text || '';
    document.getElementById('annType').value = data.announcement?.type || 'info';
    document.getElementById('copyrightInput').value = data.copyrightText;
    
    document.getElementById('saveBtn').disabled = false;
    renderAll();
  } catch(e) {
    console.error(e);
    document.getElementById('statusMsg').textContent = 'Veri yüklenemedi: ' + e.message;
  }
}

function renderAll() {
  renderToolsTable();
  renderCategoriesTable();
  renderUsersTable();
  loadStats();
}

function renderToolsTable() {
  const catMap = Object.fromEntries(data.categories.map(c => [c.id, c]));
  const tbody = document.getElementById('toolsTableBody');
  tbody.innerHTML = data.tools.map(t => `
    <tr>
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
  `).join('');
}

function renderCategoriesTable() {
  const tbody = document.getElementById('categoriesTableBody');
  tbody.innerHTML = data.categories.map((c, i) => `
    <tr>
      <td><button class="btn btn-ghost btn-sm" onclick="moveCategory(${i},-1)">▲</button> ${i+1}</td>
      <td>${c.id}</td>
      <td>${c.icon || ''} ${c.label}</td>
      <td>${c.icon || ''}</td>
      <td>${data.tools.filter(t => t.cat === c.id).length}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="editCategory('${c.id}')">✏️</button></td>
    </tr>
  `).join('');
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
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

// ==================== MODAL KONTROLLERİ (POPUP) ====================
function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

// ----- TOOL MODAL -----
function openToolModal(toolId = null) {
  if (!data) { alert('Veri henüz yüklenmedi.'); return; }
  
  const modal = document.getElementById('toolModal');
  const title = document.getElementById('toolModalTitle');
  const catSelect = document.getElementById('toolCat');
  
  catSelect.innerHTML = '<option value="">Seçin</option>' + 
    data.categories.map(c => `<option value="${c.id}">${c.icon || ''} ${c.label}</option>`).join('');
  
  const enabledBtn = document.getElementById('toolEnabled');
  const isNewBtn = document.getElementById('toolIsNew');
  const isTestBtn = document.getElementById('toolIsTest');
  const isBestBtn = document.getElementById('toolIsBest');
  
  if (toolId) {
    const tool = data.tools.find(t => t.id === toolId);
    if (!tool) return;
    title.innerText = '✏️ Araç Düzenle';
    document.getElementById('toolId').value = tool.id;
    document.getElementById('toolId').disabled = true;
    document.getElementById('toolName').value = tool.name;
    document.getElementById('toolUrl').value = tool.url;
    document.getElementById('toolIcon').value = tool.icon || '';
    catSelect.value = tool.cat;
    enabledBtn.classList.toggle('on', tool.isEnabled !== false);
    isNewBtn.classList.toggle('on', tool.isNew === true);
    isTestBtn.classList.toggle('on', tool.isTest === true);
    isBestBtn.classList.toggle('on', tool.isBest === true);
  } else {
    title.innerText = '+ Yeni Araç';
    document.getElementById('toolId').disabled = false;
    document.getElementById('toolId').value = '';
    document.getElementById('toolName').value = '';
    document.getElementById('toolUrl').value = '';
    document.getElementById('toolIcon').value = '';
    catSelect.value = '';
    enabledBtn.classList.remove('on');
    isNewBtn.classList.remove('on');
    isTestBtn.classList.remove('on');
    isBestBtn.classList.remove('on');
    enabledBtn.classList.add('on');
  }
  
  attachToggleClick([enabledBtn, isNewBtn, isTestBtn, isBestBtn]);
  modal.style.display = 'flex';
}

function attachToggleClick(buttons) {
  buttons.forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      newBtn.classList.toggle('on');
    });
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
  const url = document.getElementById('toolUrl').value.trim();
  const cat = document.getElementById('toolCat').value;
  const icon = document.getElementById('toolIcon').value.trim();
  const isEnabled = document.getElementById('toolEnabled').classList.contains('on');
  const isNew = document.getElementById('toolIsNew').classList.contains('on');
  const isTest = document.getElementById('toolIsTest').classList.contains('on');
  const isBest = document.getElementById('toolIsBest').classList.contains('on');
  
  if (!id || !name || !url || !cat) {
    alert('ID, Ad, URL ve Kategori zorunludur.');
    return;
  }
  
  const existing = data.tools.find(t => t.id === id);
  if (existing && document.getElementById('toolId').disabled === false) {
    alert('Bu ID ile bir araç zaten var.');
    return;
  }
  
  const toolData = { id, name, url, cat, icon, isEnabled, isNew, isTest, isBest };
  if (existing) Object.assign(existing, toolData);
  else data.tools.push(toolData);
  
  renderToolsTable();
  closeModal('toolModal');
}

// ----- CATEGORY MODAL -----
function openCategoryModal(catId = null) {
  if (!data) { alert('Veri henüz yüklenmedi.'); return; }
  const modal = document.getElementById('categoryModal');
  const title = document.getElementById('categoryModalTitle');
  
  if (catId) {
    const cat = data.categories.find(c => c.id === catId);
    if (!cat) return;
    title.innerText = '✏️ Kategori Düzenle';
    document.getElementById('catId').value = cat.id;
    document.getElementById('catId').disabled = true;
    document.getElementById('catLabel').value = cat.label;
    document.getElementById('catIcon').value = cat.icon || '';
  } else {
    title.innerText = '+ Yeni Kategori';
    document.getElementById('catId').disabled = false;
    document.getElementById('catId').value = '';
    document.getElementById('catLabel').value = '';
    document.getElementById('catIcon').value = '';
  }
  modal.style.display = 'flex';
}

function saveCategory() {
  if (!data) { alert('Veri yüklenmedi.'); return; }
  const id = document.getElementById('catId').value.trim();
  const label = document.getElementById('catLabel').value.trim();
  const icon = document.getElementById('catIcon').value.trim();
  
  if (!id || !label) { alert('ID ve Etiket zorunludur.'); return; }
  const existing = data.categories.find(c => c.id === id);
  if (existing && document.getElementById('catId').disabled === false) { alert('Bu ID ile bir kategori zaten var.'); return; }
  if (existing) { existing.label = label; existing.icon = icon; }
  else data.categories.push({ id, label, icon });
  
  renderCategoriesTable();
  closeModal('categoryModal');
}

// ----- USER MODAL -----
function openUserModal(username = null) {
  if (!data) { alert('Veri henüz yüklenmedi.'); return; }
  const modal = document.getElementById('userModal');
  const title = document.getElementById('userModalTitle');
  
  if (username) {
    const user = data.users.find(u => u.username === username);
    if (!user) return;
    title.innerText = '✏️ Kullanıcı Düzenle';
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userUsername').disabled = true;
    document.getElementById('userRole').value = user.role;
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword2').value = '';
  } else {
    title.innerText = '+ Yeni Kullanıcı';
    document.getElementById('userUsername').disabled = false;
    document.getElementById('userUsername').value = '';
    document.getElementById('userRole').value = 'editor';
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword2').value = '';
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

// Düzenleme butonlarını global yap
window.editTool = function(id) { openToolModal(id); };
window.editCategory = function(id) { openCategoryModal(id); };
window.editUser = function(username) { openUserModal(username); };

// ==================== STATS ====================
function loadStats() {
  const stats = JSON.parse(localStorage.getItem('qa_stats') || '{}');
  const total = Object.values(stats).reduce((a,b)=>a+b,0);
  document.getElementById('statsCards').innerHTML = `<div class="stat-card"><div class="number">${total}</div><div>Toplam Açılış</div></div>`;
}
function clearStats() { localStorage.removeItem('qa_stats'); loadStats(); }

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
  btn.disabled = true; btn.innerHTML = 'Kaydediliyor...';
  try {
    await ghPut('tools.json', b64Encode(JSON.stringify(data, null, 2)), fileSha, 'Admin güncelleme');
    alert('✅ Kaydedildi! Sayfa yenilenecek.');
    location.reload();
  } catch(e) { alert('Hata: ' + e.message); }
  btn.disabled = false; btn.innerHTML = '💾 Kaydet & Yayınla';
}

// ==================== CASE STATS ====================
async function loadCaseStats() {
  const cards = document.getElementById('caseStatsCards');
  const details = document.getElementById('caseStatsDetails');
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

// ==================== LOGIN ====================
document.getElementById('loginBtn').addEventListener('click', async () => {
  const token = document.getElementById('githubToken').value.trim();
  const errorDiv = document.getElementById('loginError');
  if (!token) { errorDiv.textContent = 'Token girin'; return; }
  errorDiv.textContent = '';
  sessionStorage.setItem('gh_token', token);
  try {
    const res = await fetch('https://api.github.com/user', { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) throw new Error('Geçersiz token');
    const userData = await res.json();
    sessionStorage.setItem('qa_user', JSON.stringify({ username: userData.login, role: 'admin' }));
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    currentUser = { username: userData.login, role: 'admin' };
    document.getElementById('roleBadge').innerHTML = 'ADMIN';
    initToggles();
    await loadData();
  } catch (err) { errorDiv.textContent = 'Giriş başarısız: ' + err.message; sessionStorage.removeItem('gh_token'); }
});

document.addEventListener('DOMContentLoaded', () => {
  const token = sessionStorage.getItem('gh_token');
  if (token) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    currentUser = { username: 'admin', role: 'admin' };
    document.getElementById('roleBadge').innerHTML = 'ADMIN';
    initToggles();
    loadData().catch(() => {
      document.getElementById('loginScreen').style.display = 'block';
      document.getElementById('adminPanel').style.display = 'none';
      sessionStorage.removeItem('gh_token');
    });
  }
});

// Tab geçişleri
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    btn.classList.add('active');
    if (tabId === 'caseStats') loadCaseStats();
  });
});

// Search
document.getElementById('searchTools').addEventListener('input', () => renderToolsTable());
