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

// ==================== LOAD DATA & RENDER SETTINGS ====================
async function loadData() {
  try {
    const result = await ghGet('tools.json');
    fileSha = result.sha;
    data = JSON.parse(b64Decode(result.content));
    if (!data.categories) data.categories = [];
    if (!data.tools) data.tools = [];
    if (!data.users) data.users = [];
    if (!data.copyrightText) data.copyrightText = '© 2025 QA Portal';
    
    // Toggle butonlarının durumunu yükle
    document.getElementById('maintToggle').classList.toggle('on', data.maintenance === true);
    document.getElementById('maintMsg').value = data.maintenanceMessage || '';
    document.getElementById('annToggle').classList.toggle('on', data.announcement?.active === true);
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

// ==================== RENDER ====================
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
    <table>
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
      <td>${c.id}</td><td>${c.icon || ''} ${c.label}</td>
      <td>${c.icon || ''}</td><td>${data.tools.filter(t => t.cat === c.id).length}</td>
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

function editTool(id) { alert('Düzenleme: ' + id); }
function editCategory(id) { alert('Düzenleme: ' + id); }
function editUser(id) { alert('Düzenleme: ' + id); }

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
  
  // Toggle butonlarının durumunu oku
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
    alert('✅ Kaydedildi! Sayfayı yenileyin.');
    location.reload();
  } catch(e) { alert('Hata: ' + e.message); }
  btn.disabled = false; btn.innerHTML = '💾 Kaydet & Yayınla';
}

// ==================== CASE STATS (MODERN) ====================
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
    const avgTime = cases.filter(c => c.resolutionTime).reduce((a,c)=>a+c.resolutionTime,0) / (cases.filter(c=>c.resolutionTime).length || 1);
    
    cards.innerHTML = `
      <div class="stat-card"><div class="number">${total}</div><div>Toplam Case</div></div>
      <div class="stat-card"><div class="number">${open}</div><div>Açık Case</div></div>
      <div class="stat-card"><div class="number">${resolved}</div><div>Çözülen</div></div>
      <div class="stat-card"><div class="number">${avgTime.toFixed(1)}</div><div>Ort. Çözüm (gün)</div></div>
    `;
    
    // Son 7 gün trendi
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
    await loadData();
  } catch (err) { errorDiv.textContent = 'Giriş başarısız: ' + err.message; sessionStorage.removeItem('gh_token'); }
});

// Sayfa yüklendiğinde token varsa doğrudan paneli göster
document.addEventListener('DOMContentLoaded', () => {
  const token = sessionStorage.getItem('gh_token');
  if (token) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    currentUser = { username: 'admin', role: 'admin' };
    document.getElementById('roleBadge').innerHTML = 'ADMIN';
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
