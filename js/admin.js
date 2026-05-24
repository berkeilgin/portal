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

// ==================== STATE ====================
let data = null, fileSha = null, currentUser = null;
let editToolId = null, editCatId = null, editUsername = null;
let catFilter = 'all', uploadQueue = [];

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

// ==================== LOAD DATA ====================
async function loadData() {
  try {
    setStatus('warn', 'Yükleniyor...');
    const result = await ghGet('tools.json');
    fileSha = result.sha;
    data = JSON.parse(b64Decode(result.content));
    if (!data.categories) data.categories = [];
    if (!data.tools) data.tools = [];
    if (!data.users) data.users = [];
    if (!data.maintenanceMessage) data.maintenanceMessage = '';
    if (!data.announcement) data.announcement = { active: false, text: '', type: 'info' };
    if (!data.copyrightText) data.copyrightText = '© 2025 QA Portal. Tüm hakları saklıdır.';
    setStatus('ok', `Yüklendi · ${data.tools.length} araç, ${data.categories.length} kategori`);
    document.getElementById('saveBtn').disabled = false;
    renderAll();
  } catch(e) {
    setStatus('err', 'Veri yüklenemedi: ' + e.message);
    console.error(e);
  }
}

// ==================== RENDER ====================
function renderAll() {
  renderToolsTable();
  renderCategoriesTable();
  renderSettingsForm();
  renderUsersTable();
  renderCatFilterChips();
  loadStats();
}

function renderToolsTable() {
  const search = document.getElementById('searchTools')?.value.toLowerCase() || '';
  const filtered = data.tools.filter(t => {
    if (catFilter !== 'all' && t.cat !== catFilter) return false;
    if (search && !t.name.toLowerCase().includes(search) && !t.id.toLowerCase().includes(search)) return false;
    return true;
  });
  const catMap = Object.fromEntries(data.categories.map(c => [c.id, c]));
  const tbody = document.getElementById('toolsTableBody');
  tbody.innerHTML = filtered.map(t => `
    <tr>
      <td><img src="logos/${t.icon}" style="width:24px;height:24px;object-fit:contain;" onerror="this.src='logos/logo.png'"></td>
      <td><strong>${escapeHtml(t.name)}</strong><br><span style="font-size:10px;color:var(--muted)">${t.id}</span></td>
      <td>${catMap[t.cat]?.icon || ''} ${escapeHtml(catMap[t.cat]?.label || t.cat)}</td>
      <td class="url-cell" title="${t.url}">${t.url}</td>
      <td><button class="toggle-switch ${t.isEnabled !== false ? 'on' : ''}" onclick="toggleToolFlag('${t.id}','isEnabled',this)"></button></td>
      <td><button class="toggle-switch ${t.isNew ? 'on' : ''}" onclick="toggleToolFlag('${t.id}','isNew',this)"></button></td>
      <td><button class="toggle-switch ${t.isTest ? 'on' : ''}" onclick="toggleToolFlag('${t.id}','isTest',this)"></button></td>
      <td><button class="toggle-switch ${t.isBest ? 'on' : ''}" onclick="toggleToolFlag('${t.id}','isBest',this)"></button></td>
      <td class="row-actions">
        <button class="btn btn-ghost btn-sm" onclick="openToolModal('${t.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteTool('${t.id}')">🗑</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="9">Araç bulunamadı</td></tr>';
}

function renderCategoriesTable() {
  const tbody = document.getElementById('categoriesTableBody');
  const toolCount = id => data.tools.filter(t => t.cat === id).length;
  tbody.innerHTML = data.categories.map((c, idx) => `
    <tr>
      <td><button class="btn btn-ghost btn-sm" onclick="moveCategory(${idx},-1)">▲</button> ${idx+1}</td>
      <td><code>${c.id}</code></td>
      <td>${c.icon || ''} ${escapeHtml(c.label)}</td>
      <td style="font-size:20px">${c.icon || ''}</td>
      <td>${toolCount(c.id)}</td>
      <td class="row-actions">
        <button class="btn btn-ghost btn-sm" onclick="openCategoryModal('${c.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCategory('${c.id}')">🗑</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6">Kategori yok</td></tr>';
}

function renderSettingsForm() {
  document.getElementById('maintToggle').classList.toggle('on', !!data.maintenance);
  document.getElementById('maintMsg').value = data.maintenanceMessage || '';
  document.getElementById('annToggle').classList.toggle('on', !!data.announcement?.active);
  document.getElementById('annText').value = data.announcement?.text || '';
  document.getElementById('annType').value = data.announcement?.type || 'info';
  document.getElementById('copyrightInput').value = data.copyrightText || '';
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = data.users.map(u => `
    <tr>
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-new' : 'badge-test'}">${u.role}</span></td>
      <td class="row-actions">
        <button class="btn btn-ghost btn-sm" onclick="openUserModal('${u.username}')">✏️</button>
        ${u.username !== currentUser?.username ? `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.username}')">🗑</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="3">Kullanıcı yok</td></tr>';
}

function renderCatFilterChips() {
  const container = document.getElementById('catFilterChips');
  container.innerHTML = `<button class="chip ${catFilter === 'all' ? 'active' : ''}" onclick="setCatFilter('all')">Tümü</button>` +
    data.categories.map(c => `<button class="chip ${catFilter === c.id ? 'active' : ''}" onclick="setCatFilter('${c.id}')">${c.icon || ''} ${c.label}</button>`).join('');
}

function setCatFilter(id) { catFilter = id; renderCatFilterChips(); renderToolsTable(); }
function toggleToolFlag(id, field, btn) { const tool = data.tools.find(t => t.id === id); if (tool) { tool[field] = !tool[field]; btn.classList.toggle('on'); } }
function moveCategory(idx, dir) { const newIdx = idx + dir; if (newIdx < 0 || newIdx >= data.categories.length) return; [data.categories[idx], data.categories[newIdx]] = [data.categories[newIdx], data.categories[idx]]; renderCategoriesTable(); renderCatFilterChips(); renderToolsTable(); }

// ==================== TOOL CRUD ====================
function openToolModal(id = null) {
  editToolId = id;
  const modal = document.getElementById('toolModal');
  document.getElementById('toolModalTitle').innerText = id ? '✏️ Araç Düzenle' : '+ Yeni Araç';
  const catSelect = document.getElementById('toolCat');
  catSelect.innerHTML = data.categories.map(c => `<option value="${c.id}">${c.icon || ''} ${c.label}</option>`).join('');
  if (id) {
    const t = data.tools.find(t => t.id === id);
    document.getElementById('toolId').value = t.id; document.getElementById('toolId').disabled = true;
    document.getElementById('toolName').value = t.name; document.getElementById('toolUrl').value = t.url;
    document.getElementById('toolCat').value = t.cat; document.getElementById('toolIcon').value = t.icon || 'logo.png';
    document.getElementById('toolEnabled').classList.toggle('on', t.isEnabled !== false);
    document.getElementById('toolIsNew').classList.toggle('on', !!t.isNew);
    document.getElementById('toolIsTest').classList.toggle('on', !!t.isTest);
    document.getElementById('toolIsBest').classList.toggle('on', !!t.isBest);
  } else {
    document.getElementById('toolId').disabled = false;
    ['toolId','toolName','toolUrl','toolIcon'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('toolEnabled').classList.add('on');
    document.getElementById('toolIsNew').classList.remove('on');
    document.getElementById('toolIsTest').classList.remove('on');
    document.getElementById('toolIsBest').classList.remove('on');
  }
  modal.classList.add('open');
}
function saveTool() {
  const id = document.getElementById('toolId').value.trim().toLowerCase().replace(/\s+/g, '-');
  const name = document.getElementById('toolName').value.trim();
  const url = document.getElementById('toolUrl').value.trim();
  const cat = document.getElementById('toolCat').value;
  const icon = document.getElementById('toolIcon').value.trim() || 'logo.png';
  const isEnabled = document.getElementById('toolEnabled').classList.contains('on');
  const isNew = document.getElementById('toolIsNew').classList.contains('on');
  const isTest = document.getElementById('toolIsTest').classList.contains('on');
  const isBest = document.getElementById('toolIsBest').classList.contains('on');
  if (!id || !name || !url) { alert('ID, Ad ve URL zorunludur'); return; }
  if (editToolId) {
    const tool = data.tools.find(t => t.id === editToolId);
    Object.assign(tool, { name, url, cat, icon, isEnabled, isNew, isTest, isBest });
  } else {
    if (data.tools.find(t => t.id === id)) { alert('Bu ID zaten var'); return; }
    data.tools.push({ id, name, icon, cat, isEnabled, isNew, isTest, isBest, url });
  }
  closeModal('toolModal'); renderToolsTable();
}
function deleteTool(id) { if (confirm(`"${id}" silinsin mi?`)) { data.tools = data.tools.filter(t => t.id !== id); renderToolsTable(); } }

// ==================== CATEGORY CRUD ====================
function openCategoryModal(id = null) {
  editCatId = id;
  const modal = document.getElementById('categoryModal');
  document.getElementById('categoryModalTitle').innerText = id ? '✏️ Kategori Düzenle' : '+ Yeni Kategori';
  if (id) {
    const c = data.categories.find(c => c.id === id);
    document.getElementById('catId').value = c.id; document.getElementById('catId').disabled = true;
    document.getElementById('catLabel').value = c.label; document.getElementById('catIcon').value = c.icon || '';
  } else {
    document.getElementById('catId').disabled = false;
    ['catId','catLabel','catIcon'].forEach(i => document.getElementById(i).value = '');
  }
  modal.classList.add('open');
}
function saveCategory() {
  const id = document.getElementById('catId').value.trim().toLowerCase().replace(/\s+/g, '-');
  const label = document.getElementById('catLabel').value.trim();
  const icon = document.getElementById('catIcon').value.trim();
  if (!id || !label) { alert('ID ve Etiket zorunludur'); return; }
  if (editCatId) {
    const cat = data.categories.find(c => c.id === editCatId);
    if (cat) { cat.label = label; cat.icon = icon; }
  } else {
    if (data.categories.find(c => c.id === id)) { alert('Bu ID zaten var'); return; }
    data.categories.push({ id, label, icon });
  }
  closeModal('categoryModal'); renderCategoriesTable(); renderCatFilterChips(); renderToolsTable();
}
function deleteCategory(id) {
  const cnt = data.tools.filter(t => t.cat === id).length;
  if (confirm(`"${id}" kategorisini sil? ${cnt} araç da silinecek!`)) {
    data.categories = data.categories.filter(c => c.id !== id);
    data.tools = data.tools.filter(t => t.cat !== id);
    renderCategoriesTable(); renderCatFilterChips(); renderToolsTable();
  }
}

// ==================== USER CRUD ====================
async function sha256(s) { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join(''); }
function genSalt() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function openUserModal(username = null) {
  editUsername = username;
  const modal = document.getElementById('userModal');
  document.getElementById('userModalTitle').innerText = username ? '✏️ Kullanıcı Düzenle' : '+ Yeni Kullanıcı';
  if (username) {
    const u = data.users.find(u => u.username === username);
    document.getElementById('userUsername').value = u.username; document.getElementById('userUsername').disabled = true;
    document.getElementById('userRole').value = u.role;
    document.getElementById('userPassword').value = ''; document.getElementById('userPassword2').value = '';
  } else {
    document.getElementById('userUsername').disabled = false;
    ['userUsername','userPassword','userPassword2'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('userRole').value = 'editor';
  }
  modal.classList.add('open');
}
async function saveUser() {
  const username = document.getElementById('userUsername').value.trim();
  const role = document.getElementById('userRole').value;
  const pass = document.getElementById('userPassword').value;
  const pass2 = document.getElementById('userPassword2').value;
  if (!username) { alert('Kullanıcı adı gerekli'); return; }
  if (editUsername) {
    const u = data.users.find(u => u.username === editUsername);
    u.role = role;
    if (pass) {
      if (pass !== pass2) { alert('Şifreler eşleşmiyor'); return; }
      if (pass.length < 6) { alert('Şifre en az 6 karakter'); return; }
      const salt = genSalt(); u.salt = salt; u.hash = await sha256(salt + pass);
    }
  } else {
    if (!pass || pass !== pass2 || pass.length < 6) { alert('Şifre zorunlu, eşleşmeli ve min 6 karakter'); return; }
    const salt = genSalt(); data.users.push({ username, salt, hash: await sha256(salt + pass), role });
  }
  closeModal('userModal'); renderUsersTable();
}
function deleteUser(username) { if (confirm(`${username} silinsin mi?`)) { data.users = data.users.filter(u => u.username !== username); renderUsersTable(); } }

// ==================== STATS ====================
function loadStats() {
  const stats = JSON.parse(localStorage.getItem('qa_stats') || '{}');
  const total = Object.values(stats).reduce((a,b)=>a+b,0);
  const unique = Object.keys(stats).length;
  const topToolId = Object.keys(stats).sort((a,b)=>stats[b]-stats[a])[0];
  const topTool = data.tools.find(t => t.id === topToolId);
  document.getElementById('statsCards').innerHTML = `
    <div class="stat-card"><div class="number">${total}</div><div>Toplam Açılış</div></div>
    <div class="stat-card"><div class="number">${unique}</div><div>Farklı Araç</div></div>
    <div class="stat-card"><div class="number">${topTool ? topTool.name.slice(0,15) : '—'}</div><div>En Çok Kullanılan</div></div>
    <div class="stat-card"><div class="number">${data.tools.filter(t=>t.isEnabled!==false).length}</div><div>Aktif Araç</div></div>
  `;
  const sorted = data.tools.map(t => ({ name: t.name, count: stats[t.id] || 0 })).filter(s => s.count > 0).sort((a,b)=>b.count-a.count);
  const max = sorted[0]?.count || 1;
  document.getElementById('statsDetails').innerHTML = sorted.length ? `
    <div class="panel"><h3>🔝 En Çok Kullanılan Araçlar</h3>
    ${sorted.map(s => `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="width:150px">${escapeHtml(s.name)}</div>
        <div style="flex:1;background:var(--border);height:8px;border-radius:4px">
          <div style="width:${(s.count/max)*100}%;height:100%;background:var(--accent2);border-radius:4px"></div>
        </div>
        <div style="width:40px">${s.count}</div>
      </div>
    `).join('')}</div>
  ` : '<div class="panel">Henüz istatistik yok</div>';
}
function clearStats() { if (confirm('İstatistikler sıfırlansın mı?')) { localStorage.removeItem('qa_stats'); loadStats(); toast('İstatistikler sıfırlandı'); } }

// ==================== CASE STATS (MODERN) ====================
async function loadCaseStats() {
  const cardsContainer = document.getElementById('caseStatsCards');
  const detailsContainer = document.getElementById('caseStatsDetails');
  if (!cardsContainer) return;
  cardsContainer.innerHTML = '<div class="loading-spinner" style="margin:20px auto;"></div>';
  detailsContainer.innerHTML = '';
  try {
    const snapshot = await caseDb.collection('cases').get();
    const cases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const total = cases.length;
    const open = cases.filter(c => c.status !== 'çözüldü' && c.status !== 'reddedildi').length;
    const resolved = cases.filter(c => c.status === 'çözüldü').length;
    const rejected = cases.filter(c => c.status === 'reddedildi').length;
    const inProgress = cases.filter(c => c.status === 'sürüyor').length;
    const pending = cases.filter(c => c.status === 'beklemede').length;
    let avgTime = 0;
    const times = cases.filter(c => c.resolutionTime).map(c => c.resolutionTime);
    if (times.length) avgTime = (times.reduce((a,b)=>a+b,0) / times.length).toFixed(1);
    cardsContainer.innerHTML = `
      <div class="stat-card"><div class="number">${total}</div><div>Toplam Case</div></div>
      <div class="stat-card"><div class="number">${open}</div><div>Açık Case</div></div>
      <div class="stat-card"><div class="number">${resolved}</div><div>Çözülen</div></div>
      <div class="stat-card"><div class="number">${avgTime}</div><div>Ort. Çözüm (gün)</div></div>
    `;
    // Son 7 gün trendi (bar chart)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0); last7Days.push(d); }
    const trend = last7Days.map(day => {
      const count = cases.filter(c => { const created = c.createdAt?.toDate(); if (!created) return false; const d = new Date(created); d.setHours(0,0,0,0); return d.getTime() === day.getTime(); }).length;
      return { date: day.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' }), count };
    });
    const maxCount = Math.max(...trend.map(t => t.count), 1);
    const trendHtml = `<div style="display: flex; gap: 12px; align-items: flex-end; justify-content: center; height: 180px; padding: 16px 0;">
      ${trend.map(t => `<div style="flex:1; text-align:center; display:flex; flex-direction:column; align-items:center;">
        <div style="flex:1; display:flex; align-items:flex-end; width:100%;">
          <div style="width:100%; background:linear-gradient(180deg, var(--accent2), var(--accent)); border-radius:8px 8px 0 0; height:${(t.count / maxCount) * 140}px; min-height:4px;"></div>
        </div>
        <div style="margin-top:8px; font-size:11px; color:var(--muted);">${t.date}</div>
        <div style="font-size:13px; font-weight:bold; color:var(--accent2);">${t.count}</div>
      </div>`).join('')}
    </div>`;
    const statusDistribution = `<div class="stats-grid" style="grid-template-columns: repeat(4,1fr); margin-top: 16px;">
      <div class="stat-card" style="background: rgba(156,39,176,0.1);"><div class="number" style="color:#ce93d8;">${pending}</div><div>Beklemede</div></div>
      <div class="stat-card" style="background: rgba(255,152,0,0.1);"><div class="number" style="color:#ffb74d;">${inProgress}</div><div>Sürüyor</div></div>
      <div class="stat-card" style="background: rgba(76,175,80,0.1);"><div class="number" style="color:#81c784;">${resolved}</div><div>Çözüldü</div></div>
      <div class="stat-card" style="background: rgba(158,158,158,0.1);"><div class="number" style="color:#bdbdbd;">${rejected}</div><div>Reddedildi</div></div>
    </div>`;
    detailsContainer.innerHTML = `<div class="panel"><h3>📈 Son 7 Günlük Case Trendi</h3>${trendHtml}</div><div class="panel"><h3>📊 Durum Dağılımı</h3>${statusDistribution}</div>`;
  } catch (err) { console.error(err); cardsContainer.innerHTML = '<div class="status-bar err">Case verileri yüklenemedi: ' + err.message + '</div>'; }
}

// ==================== UPLOAD ====================
function setupUpload() {
  const drop = document.getElementById('dropZone');
  const input = document.getElementById('fileInput');
  if (!drop) return;
  drop.onclick = () => input.click();
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('drag'); };
  drop.ondragleave = () => drop.classList.remove('drag');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('drag'); handleFiles(e.dataTransfer.files); };
  input.onchange = e => handleFiles(e.target.files);
}
function handleFiles(files) { for (let f of files) { const reader = new FileReader(); reader.onload = e => { uploadQueue.push({ name: f.name, b64: e.target.result.split(',')[1], type: f.type }); renderUploadPreview(); }; reader.readAsDataURL(f); } }
function renderUploadPreview() { const container = document.getElementById('uploadPreview'); if (!container) return; container.innerHTML = uploadQueue.map((f, i) => `<div class="upload-thumb"><img src="data:${f.type};base64,${f.b64}"><span>${f.name}</span><button class="btn btn-ghost btn-sm" onclick="removeUpload(${i})">✕</button></div>`).join(''); document.getElementById('uploadBtn').disabled = uploadQueue.length === 0; }
function removeUpload(i) { uploadQueue.splice(i, 1); renderUploadPreview(); }
async function uploadFiles() {
  if (!uploadQueue.length) return;
  const btn = document.getElementById('uploadBtn'); btn.disabled = true; btn.innerHTML = '⏳ Yükleniyor...';
  const statusDiv = document.getElementById('uploadStatus'); statusDiv.innerHTML = '';
  for (const f of uploadQueue) {
    try { let sha = null; try { const exist = await ghGet(`logos/${f.name}`); sha = exist.sha; } catch(e) {} await ghPut(`logos/${f.name}`, f.b64, sha, `Yeni ikon: ${f.name}`); statusDiv.innerHTML += `<p style="color:var(--accent)">✓ ${f.name} yüklendi</p>`; } catch(e) { statusDiv.innerHTML += `<p style="color:var(--accent3)">✕ ${f.name}: ${e.message}</p>`; }
  }
  uploadQueue = []; renderUploadPreview(); btn.disabled = false; btn.innerHTML = '⬆️ GitHub\'a Yükle'; toast('Yükleme tamamlandı');
}

// ==================== SAVE TO GITHUB ====================
async function saveToGitHub() {
  if (!data || !fileSha) { alert('Önce veri yükleyin'); return; }
  data.maintenance = document.getElementById('maintToggle').classList.contains('on');
  data.maintenanceMessage = document.getElementById('maintMsg').value;
  data.announcement = { active: document.getElementById('annToggle').classList.contains('on'), text: document.getElementById('annText').value, type: document.getElementById('annType').value };
  data.copyrightText = document.getElementById('copyrightInput').value;
  const btn = document.getElementById('saveBtn'); btn.disabled = true; btn.innerHTML = '⏳ Kaydediliyor...';
  try { const res = await ghPut('tools.json', b64Encode(JSON.stringify(data, null, 2)), fileSha, `Admin güncelleme ${new Date().toLocaleString('tr')}`); fileSha = res.content.sha; setStatus('ok', 'Kaydedildi!'); toast('✅ GitHub\'a kaydedildi.'); } catch(e) { setStatus('err', 'Hata: ' + e.message); toast('Kayıt başarısız: ' + e.message, 'error'); } finally { btn.disabled = false; btn.innerHTML = '💾 Kaydet & Yayınla'; }
}

// ==================== UI HELPERS ====================
function setStatus(type, msg) { const el = document.getElementById('statusMsg'); const dot = document.querySelector('#statusBar .dot'); el.textContent = msg; dot.style.background = type === 'ok' ? 'var(--accent2)' : type === 'err' ? 'var(--accent3)' : 'var(--accent4)'; }
function toast(msg, type = 'info') { const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = msg; document.body.appendChild(toast); setTimeout(() => toast.remove(), 4000); }
function escapeHtml(s) { return String(s).replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');
  btn.classList.add('active');
  if (tabId === 'caseStats') loadCaseStats();
}

// ==================== LOGIN ====================
document.getElementById('loginBtn').addEventListener('click', async () => {
  const token = document.getElementById('githubToken').value.trim();
  const errorDiv = document.getElementById('loginError');
  if (!token) { errorDiv.textContent = 'Lütfen bir GitHub token girin.'; return; }
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
    setupUpload();
    await loadData();
    document.querySelectorAll('.tab-btn').forEach(btn => { btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab'), btn)); });
    document.getElementById('searchTools').addEventListener('input', () => renderToolsTable());
  } catch (err) { errorDiv.textContent = 'Giriş başarısız: ' + err.message; sessionStorage.removeItem('gh_token'); }
});

document.addEventListener('DOMContentLoaded', () => {
  const token = sessionStorage.getItem('gh_token');
  if (token) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    currentUser = { username: 'admin', role: 'admin' };
    document.getElementById('roleBadge').innerHTML = 'ADMIN';
    setupUpload();
    loadData().catch(() => { document.getElementById('loginScreen').style.display = 'block'; document.getElementById('adminPanel').style.display = 'none'; sessionStorage.removeItem('gh_token'); });
    document.querySelectorAll('.tab-btn').forEach(btn => { btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab'), btn)); });
    document.getElementById('searchTools').addEventListener('input', () => renderToolsTable());
  } else {
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
  }
});
