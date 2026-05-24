// ==================== FIREBASE KONFIG ====================
const firebaseConfig = {
  apiKey: "AIzaSyBDClqNyqtNL_h8Yovoe2r9RFAs8VjNef8",
  authDomain: "case-management-system-53f44.firebaseapp.com",
  projectId: "case-management-system-53f44",
  storageBucket: "case-management-system-53f44.firebasestorage.app",
  messagingSenderId: "381220130397",
  appId: "1:381220130397:web:97124d8836681bc62c07b4"
};
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ==================== STATE ====================
let currentUser = null;
let lastCaseCount = 0;
let editTopicId = null;
let editUserId = null;

// ==================== AUTH ====================
document.getElementById('adminLoginBtn').onclick = async () => {
  const email = document.getElementById('adminEmail').value;
  const pass = document.getElementById('adminPassword').value;
  const errorEl = document.getElementById('adminLoginError');
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    errorEl.textContent = '';
  } catch(e) {
    errorEl.textContent = e.message;
  }
};

document.getElementById('logoutBtn').onclick = async () => {
  await auth.signOut();
};

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('adminRoleBadge').textContent = user.email?.includes('admin') ? 'ADMIN' : 'EDITOR';
    await refreshDashboard();
    showTab('cases');
    if (window.autoRefresh) clearInterval(window.autoRefresh);
    window.autoRefresh = setInterval(refreshDashboard, 30000);
  } else {
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
  }
});

// ==================== DASHBOARD ====================
async function refreshDashboard() {
  try {
    await Promise.all([loadStats(), renderCasesTable(), populateTopicFilter(), checkNewCases()]);
  } catch(e) { console.error(e); }
}

async function loadStats() {
  const cases = await loadCases();
  const total = cases.length;
  const resolved = cases.filter(c => c.status === 'çözüldü').length;
  const open = cases.filter(c => c.status !== 'çözüldü' && c.status !== 'reddedildi').length;
  let avgTime = 0;
  const times = cases.filter(c => c.resolutionTime).map(c => c.resolutionTime);
  if (times.length) avgTime = (times.reduce((a,b)=>a+b,0)/times.length).toFixed(1);
  document.getElementById('statsContainer').innerHTML = `
    <div class="stat-card"><div class="stat-number">${total}</div><div>Toplam Case</div></div>
    <div class="stat-card"><div class="stat-number">${resolved}</div><div>Çözülen</div></div>
    <div class="stat-card"><div class="stat-number">${avgTime}</div><div>Ort. Çözüm (gün)</div></div>
    <div class="stat-card"><div class="stat-number">${open}</div><div>Aktif Case</div></div>
  `;
}

async function checkNewCases() {
  const current = (await loadCases()).length;
  if (current > lastCaseCount) {
    const diff = current - lastCaseCount;
    showToast(`✨ ${diff} yeni case eklendi!`);
    const alertDiv = document.getElementById('newCaseAlert');
    alertDiv.innerHTML = `<span class="notification-badge">+${diff}</span>`;
    setTimeout(() => alertDiv.innerHTML = '', 8000);
  }
  lastCaseCount = current;
}

// ==================== CASE OPERATIONS ====================
async function loadCases() {
  const snapshot = await db.collection('cases').orderBy('createdAt', 'desc').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function loadTopics() {
  const snapshot = await db.collection('topics').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function populateTopicFilter() {
  const topics = await loadTopics();
  const filter = document.getElementById('topicFilter');
  filter.innerHTML = '<option value="">Tüm Konular</option>' + 
    topics.filter(t=>t.active).map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
}

async function renderCasesTable() {
  let cases = await loadCases();
  const topics = await loadTopics();
  const topicMap = Object.fromEntries(topics.map(t => [t.id, t]));
  const filterStatus = document.getElementById('statusFilter').value;
  const searchText = document.getElementById('searchCase').value.toLowerCase();
  const filterTopic = document.getElementById('topicFilter').value;
  
  if (filterStatus) cases = cases.filter(c => c.status === filterStatus);
  if (filterTopic) cases = cases.filter(c => c.topicId === filterTopic);
  if (searchText) cases = cases.filter(c => 
    c.id.toLowerCase().includes(searchText) || 
    c.title.toLowerCase().includes(searchText) || 
    (c.email && c.email.toLowerCase().includes(searchText))
  );
  
  const tbody = document.getElementById('casesTableBody');
  tbody.innerHTML = cases.map(c => {
    const topic = topicMap[c.topicId];
    const topicTitle = topic ? topic.title : 'Konu yok';
    const shortId = c.id.slice(-6);
    return `
      <tr>
        <td>${shortId}</td>
        <td>${escapeHtml(topicTitle)}</td>
        <td>${escapeHtml(c.title)}</td>
        <td>${escapeHtml(c.fullname)}</td>
        <td>${c.email}</td>
        <td><span class="status-badge status-${c.status}">${c.status}</span></td>
        <td><span class="status-badge status-${c.priority === 'yüksek' ? 'beklemede' : 'sürüyor'}">${c.priority}</span></td>
        <td>${new Date(c.createdAt.toDate()).toLocaleDateString('tr')}</td>
        <td class="row-actions">
          <button class="btn btn-ghost btn-sm" onclick="openCaseDetail('${c.id}')">Detay</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCase('${c.id}')">Sil</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.openCaseDetail = async function(caseId) {
  const doc = await db.collection('cases').doc(caseId).get();
  if (!doc.exists) return;
  const c = doc.data();
  const topics = await loadTopics();
  const topic = topics.find(t => t.id === c.topicId);
  
  const notesHtml = (c.notes || []).map(n => `
    <div class="note-item">
      <strong>${new Date(n.createdAt.toDate()).toLocaleString()}</strong> - ${escapeHtml(n.text)} (${n.createdBy})
    </div>
  `).join('') || 'Not yok';
  
  document.getElementById('caseDetailContent').innerHTML = `
    <div class="form-group"><strong>Case ID:</strong> ${c.id}</div>
    <div class="form-group"><strong>Kullanıcı:</strong> ${escapeHtml(c.fullname)} (${c.email})</div>
    <div class="form-group"><strong>Konu:</strong> ${topic ? escapeHtml(topic.title) : '-'}</div>
    <div class="form-group"><strong>Başlık:</strong> ${escapeHtml(c.title)}</div>
    <div class="form-group"><strong>Açıklama:</strong> ${escapeHtml(c.description)}</div>
    <div class="form-group">
      <strong>Durum:</strong>
      <select id="detailStatus" class="form-input">
        <option value="beklemede" ${c.status==='beklemede' ? 'selected' : ''}>Beklemede</option>
        <option value="sürüyor" ${c.status==='sürüyor' ? 'selected' : ''}>Sürüyor</option>
        <option value="çözüldü" ${c.status==='çözüldü' ? 'selected' : ''}>Çözüldü</option>
        <option value="reddedildi" ${c.status==='reddedildi' ? 'selected' : ''}>Reddedildi</option>
      </select>
    </div>
    <div class="form-group">
      <strong>Öncelik:</strong>
      <select id="detailPriority" class="form-input">
        <option value="düşük" ${c.priority==='düşük' ? 'selected' : ''}>Düşük</option>
        <option value="orta" ${c.priority==='orta' ? 'selected' : ''}>Orta</option>
        <option value="yüksek" ${c.priority==='yüksek' ? 'selected' : ''}>Yüksek</option>
      </select>
    </div>
    <div class="form-group">
      <strong>Yeni Not:</strong>
      <textarea id="newNote" rows="2" class="form-input"></textarea>
      <button class="btn btn-primary btn-sm" style="margin-top:5px" onclick="addNote('${caseId}')">Not Ekle</button>
    </div>
    <div><strong>Notlar:</strong><div id="notesArea">${notesHtml}</div></div>
    <div class="btn-row" style="margin-top:15px; justify-content:flex-end;">
      <button class="btn btn-primary" onclick="saveCaseDetail('${caseId}')">Kaydet</button>
    </div>
  `;
  openModal('caseDetailModal');
};

window.addNote = async function(caseId) {
  const text = document.getElementById('newNote').value.trim();
  if (!text) return;
  const note = { text, createdAt: new Date(), createdBy: currentUser?.email || 'Admin' };
  const ref = db.collection('cases').doc(caseId);
  const doc = await ref.get();
  const notes = doc.data().notes || [];
  notes.push(note);
  await ref.update({ notes, updatedAt: new Date() });
  closeModal('caseDetailModal');
  openCaseDetail(caseId);
};

window.saveCaseDetail = async function(caseId) {
  const newStatus = document.getElementById('detailStatus').value;
  const newPriority = document.getElementById('detailPriority').value;
  const ref = db.collection('cases').doc(caseId);
  const update = { status: newStatus, priority: newPriority, updatedAt: new Date() };
  if (newStatus === 'çözüldü') {
    const doc = await ref.get();
    const created = doc.data().createdAt.toDate();
    update.resolutionTime = Math.ceil((new Date() - created) / (86400000));
  }
  await ref.update(update);
  closeModal('caseDetailModal');
  refreshDashboard();
};

window.deleteCase = async function(caseId) {
  if (confirm('Bu case silinsin mi?')) {
    await db.collection('cases').doc(caseId).delete();
    refreshDashboard();
  }
};

// ==================== TOPIC MANAGEMENT ====================
async function renderTopicsList() {
  const topics = await loadTopics();
  document.getElementById('topicsList').innerHTML = topics.map(t => `
    <div class="topic-item">
      <div>
        <strong>${escapeHtml(t.title)}</strong> ${t.active ? '✅' : '❌'}<br>
        <small>${escapeHtml(t.description || '')}</small><br>
        <small>Sorumlu: ${escapeHtml(t.responsibleEmail || 'Belirtilmemiş')}</small>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" onclick="editTopic('${t.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteTopic('${t.id}')">🗑</button>
      </div>
    </div>
  `).join('');
}

window.openTopicModal = function(id = null) {
  editTopicId = id;
  const modal = document.getElementById('topicModal');
  document.getElementById('topicModalTitle').textContent = id ? '✏️ Konu Düzenle' : '+ Yeni Konu';
  if (id) {
    db.collection('topics').doc(id).get().then(doc => {
      if (doc.exists) {
        document.getElementById('topicTitle').value = doc.data().title;
        document.getElementById('topicDesc').value = doc.data().description || '';
        document.getElementById('topicResponsibleEmail').value = doc.data().responsibleEmail || '';
        document.getElementById('topicActive').checked = doc.data().active;
      }
    });
  } else {
    document.getElementById('topicTitle').value = '';
    document.getElementById('topicDesc').value = '';
    document.getElementById('topicResponsibleEmail').value = '';
    document.getElementById('topicActive').checked = true;
  }
  modal.classList.add('open');
};

document.getElementById('saveTopicBtn').onclick = async () => {
  const title = document.getElementById('topicTitle').value.trim();
  if (!title) return alert('Başlık gerekli');
  const data = {
    title,
    description: document.getElementById('topicDesc').value.trim(),
    responsibleEmail: document.getElementById('topicResponsibleEmail').value.trim(),
    active: document.getElementById('topicActive').checked
  };
  if (editTopicId) {
    await db.collection('topics').doc(editTopicId).update(data);
  } else {
    await db.collection('topics').add({ ...data, createdAt: new Date() });
  }
  closeModal('topicModal');
  renderTopicsList();
  populateTopicFilter();
};

window.editTopic = (id) => openTopicModal(id);

window.deleteTopic = async (id) => {
  if (confirm('Bu konu silinsin mi?')) {
    await db.collection('topics').doc(id).delete();
    const cases = await db.collection('cases').where('topicId', '==', id).get();
    const batch = db.batch();
    cases.forEach(doc => batch.update(doc.ref, { topicId: null }));
    await batch.commit();
    renderTopicsList();
    populateTopicFilter();
    refreshDashboard();
  }
};

// ==================== USER MANAGEMENT ====================
async function loadUsers() {
  const snapshot = await db.collection('users').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function renderUsersTable() {
  const users = await loadUsers();
  document.getElementById('usersTableBody').innerHTML = users.map(u => `
    <tr>
      <td>${u.id.slice(-6)}</td>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="status-badge">${u.role}</span></td>
      <td class="row-actions">
        <button class="btn btn-ghost btn-sm" onclick="editUser('${u.id}')">Düzenle</button>
        ${u.role !== 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')">Sil</button>` : ''}
      </td>
    </tr>
  `).join('');
}

window.openUserModal = function(id = null) {
  editUserId = id;
  const modal = document.getElementById('userEditModal');
  document.getElementById('userEditModalTitle').textContent = id ? '✏️ Kullanıcı Düzenle' : '+ Yeni Kullanıcı';
  if (id) {
    db.collection('users').doc(id).get().then(doc => {
      if (doc.exists) {
        document.getElementById('editUsername').value = doc.data().username;
        document.getElementById('editUserEmail').value = doc.data().email;
        document.getElementById('editUserRole').value = doc.data().role;
        document.getElementById('editPassword').value = '';
      }
    });
  } else {
    document.getElementById('editUsername').value = '';
    document.getElementById('editUserEmail').value = '';
    document.getElementById('editUserRole').value = 'user';
    document.getElementById('editPassword').value = '';
  }
  modal.classList.add('open');
};

document.getElementById('saveUserEditBtn').onclick = async () => {
  const username = document.getElementById('editUsername').value.trim();
  const email = document.getElementById('editUserEmail').value.trim();
  const role = document.getElementById('editUserRole').value;
  const pass = document.getElementById('editPassword').value;
  if (!username) return alert('Kullanıcı adı gerekli');
  if (editUserId) {
    const update = { username, email, role };
    if (pass) update.password = pass;
    await db.collection('users').doc(editUserId).update(update);
  } else {
    if (!pass) return alert('Şifre gerekli');
    await db.collection('users').add({ username, email, role, password: pass, createdAt: new Date() });
  }
  closeModal('userEditModal');
  renderUsersTable();
};

window.editUser = (id) => openUserModal(id);

window.deleteUser = async (id) => {
  if (confirm('Bu kullanıcı silinsin mi?')) {
    await db.collection('users').doc(id).delete();
    renderUsersTable();
  }
};

// ==================== MAIL SETTINGS ====================
function loadMailSettings() {
  return JSON.parse(localStorage.getItem('case_mail_settings') || '{}');
}

function saveMailSettings() {
  const settings = {
    smtpEmail: document.getElementById('smtpEmail').value,
    smtpPassword: document.getElementById('smtpPassword').value,
    adminEmail: document.getElementById('adminNotifyEmail').value,
    ccEmail: document.getElementById('ccEmail').value
  };
  localStorage.setItem('case_mail_settings', JSON.stringify(settings));
  document.getElementById('mailStatus').innerHTML = '<span style="color:var(--accent)">Kaydedildi</span>';
}

function loadMailSettingsToForm() {
  const s = loadMailSettings();
  document.getElementById('smtpEmail').value = s.smtpEmail || '';
  document.getElementById('smtpPassword').value = s.smtpPassword || '';
  document.getElementById('adminNotifyEmail').value = s.adminEmail || '';
  document.getElementById('ccEmail').value = s.ccEmail || '';
}

async function testEmail() {
  const s = loadMailSettings();
  if (!s.smtpEmail || !s.smtpPassword) {
    document.getElementById('mailStatus').innerHTML = '<span style="color:var(--accent3)">SMTP ayarları eksik</span>';
    return;
  }
  if (typeof window.Email === 'undefined') {
    document.getElementById('mailStatus').innerHTML = '<span style="color:var(--accent3)">SMTP.js yüklenemedi</span>';
    return;
  }
  try {
    await window.Email.send({
      Host: "smtp.gmail.com", Port: 587,
      Username: s.smtpEmail, Password: s.smtpPassword,
      To: s.adminEmail || s.smtpEmail, From: s.smtpEmail,
      Subject: "Test", Body: "Test maili başarıyla gönderildi.", Secure: true
    });
    document.getElementById('mailStatus').innerHTML = '<span style="color:var(--accent)">Test maili gönderildi</span>';
  } catch(e) {
    document.getElementById('mailStatus').innerHTML = `<span style="color:var(--accent3)">Hata: ${e.message}</span>`;
  }
}

// ==================== TAB MANAGEMENT ====================
function showTab(tab) {
  const tabs = ['cases', 'topics', 'users', 'mail'];
  tabs.forEach(t => {
    const el = document.getElementById(t + 'Tab');
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'topics') renderTopicsList();
  if (tab === 'users') renderUsersTable();
  if (tab === 'mail') loadMailSettingsToForm();
}

window.filterCases = () => renderCasesTable();

// ==================== UTILITIES ====================
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = 'position:fixed; bottom:20px; right:20px; background:var(--accent2); color:#fff; padding:8px 16px; border-radius:20px; font-size:12px; z-index:9999;';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Refresh butonu
document.getElementById('refreshBtn').onclick = async () => {
  await refreshDashboard();
  showToast('Yenilendi');
};