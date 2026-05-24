// ==================== FIREBASE KONFIG ====================
const firebaseConfig = {
  apiKey: "AIzaSyBDClqNyqtNL_h8Yovoe2r9RFAs8VjNef8",
  authDomain: "case-management-system-53f44.firebaseapp.com",
  projectId: "case-management-system-53f44",
  storageBucket: "case-management-system-53f44.firebasestorage.app",
  messagingSenderId: "381220130397",
  appId: "1:381220130397:web:97124d8836681bc62c07b4"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let currentUser = null, lastCaseCount = 0, editTopicId = null, editUserId = null;
let emailjsInitialized = false;
let statsChart = null;

// ==================== AUTH ====================
document.getElementById('adminLoginBtn').onclick = async () => {
  const email = document.getElementById('adminEmail').value;
  const pass = document.getElementById('adminPassword').value;
  const errorEl = document.getElementById('adminLoginError');
  try { await auth.signInWithEmailAndPassword(email, pass); errorEl.textContent = ''; }
  catch(e) { errorEl.textContent = e.message; }
};
document.getElementById('logoutBtn').onclick = async () => await auth.signOut();
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
  try { await Promise.all([loadStats(), renderCasesTable(), populateTopicFilter(), checkNewCases()]); }
  catch(e) { console.error(e); }
}
async function loadStats() {
  const cases = await loadCases();
  const total = cases.length;
  const resolved = cases.filter(c => c.status === 'çözüldü').length;
  const open = cases.filter(c => c.status !== 'çözüldü' && c.status !== 'reddedildi').length;
  let avgTime = 0;
  const times = cases.filter(c => c.resolutionMinutes).map(c => c.resolutionMinutes);
  if (times.length) avgTime = (times.reduce((a,b)=>a+b,0)/times.length).toFixed(1);
  document.getElementById('statsContainer').innerHTML = `<div class="stat-card"><div class="stat-number">${total}</div><div>Toplam Case</div></div><div class="stat-card"><div class="stat-number">${resolved}</div><div>Çözülen</div></div><div class="stat-card"><div class="stat-number">${avgTime}</div><div>Ort. Çözüm (dk)</div></div><div class="stat-card"><div class="stat-number">${open}</div><div>Aktif Case</div></div>`;
}
async function checkNewCases() {
  const current = (await loadCases()).length;
  if (current > lastCaseCount) {
    const diff = current - lastCaseCount;
    showToast(`✨ ${diff} yeni case eklendi!`);
    document.getElementById('newCaseAlert').innerHTML = `<span class="notification-badge">+${diff}</span>`;
    setTimeout(() => document.getElementById('newCaseAlert').innerHTML = '', 8000);
  }
  lastCaseCount = current;
}
async function loadCases() {
  const snapshot = await db.collection('cases').orderBy('createdAt', 'desc').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function loadTopics() {
  const snapshot = await db.collection('topics').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function loadUsers() {
  const snapshot = await db.collection('users').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function populateTopicFilter() {
  const topics = await loadTopics();
  const filter = document.getElementById('topicFilter');
  filter.innerHTML = '<option value="">Tüm Konular</option>' + topics.filter(t=>t.active).map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
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
  if (searchText) cases = cases.filter(c => c.id.toLowerCase().includes(searchText) || c.title.toLowerCase().includes(searchText) || (c.email && c.email.toLowerCase().includes(searchText)));
  const tbody = document.getElementById('casesTableBody');
  tbody.innerHTML = cases.map(c => {
    const topic = topicMap[c.topicId];
    const topicTitle = topic ? topic.title : 'Konu yok';
    const shortId = c.id.slice(-6);
    return `<tr><td>${shortId}</td><td>${escapeHtml(topicTitle)}</td><td>${escapeHtml(c.title)}</td><td>${escapeHtml(c.fullname)}</td><td>${c.email}</td><td><span class="status-badge status-${c.status}">${c.status}</span></td><td>${c.priority}</td><td>${new Date(c.createdAt.toDate()).toLocaleDateString('tr')}</td><td class="row-actions"><button class="btn btn-ghost btn-sm" onclick="openCaseDetail('${c.id}')">Detay</button><button class="btn btn-danger btn-sm" onclick="deleteCase('${c.id}')">Sil</button></td></tr>`;
  }).join('');
}

// ==================== CASE DETAY (MANUEL SÜRE + DATE) ====================
window.openCaseDetail = async function(caseId) {
  const doc = await db.collection('cases').doc(caseId).get();
  if (!doc.exists) return;
  const c = doc.data();
  const topics = await loadTopics();
  const users = await loadUsers();
  const topic = topics.find(t => t.id === c.topicId);
  const notesHtml = (c.notes || []).map(n => `<div class="note-item"><strong>${new Date(n.createdAt.toDate()).toLocaleString()}</strong> - ${escapeHtml(n.text)} (${n.createdBy})</div>`).join('') || 'Not yok';
  const resolvedAtValue = c.resolvedAt ? new Date(c.resolvedAt.toDate()).toISOString().slice(0,10) : '';
  const resolutionMinutes = c.resolutionMinutes || '';
  document.getElementById('caseDetailContent').innerHTML = `
    <div><strong>Case ID:</strong> ${c.id}</div>
    <div><strong>Kullanıcı:</strong> ${escapeHtml(c.fullname)} (${c.email})</div>
    <div><strong>Konu:</strong> ${topic ? escapeHtml(topic.title) : '-'}</div>
    <div><strong>Başlık:</strong> ${escapeHtml(c.title)}</div>
    <div><strong>Açıklama:</strong> ${escapeHtml(c.description)}</div>
    <div><strong>Durum:</strong> <select id="detailStatus"><option value="beklemede" ${c.status==='beklemede'?'selected':''}>Beklemede</option><option value="sürüyor" ${c.status==='sürüyor'?'selected':''}>Sürüyor</option><option value="çözüldü" ${c.status==='çözüldü'?'selected':''}>Çözüldü</option><option value="reddedildi" ${c.status==='reddedildi'?'selected':''}>Reddedildi</option></select></div>
    <div><strong>Öncelik:</strong> <select id="detailPriority"><option value="düşük" ${c.priority==='düşük'?'selected':''}>Düşük</option><option value="orta" ${c.priority==='orta'?'selected':''}>Orta</option><option value="yüksek" ${c.priority==='yüksek'?'selected':''}>Yüksek</option></select></div>
    <div><strong>Çözen Kişi:</strong> <select id="detailResolvedBy"><option value="">Seçiniz</option>${users.map(u => `<option value="${u.id}" ${c.resolvedBy===u.id ? 'selected' : ''}>${escapeHtml(u.username)} (${u.email})</option>`).join('')}</select></div>
    <div><strong>Çözülme Tarihi:</strong> <input type="date" id="detailResolvedAt" value="${resolvedAtValue}" class="form-input"></div>
    <div><strong>Çözüm Süresi (Dakika):</strong> <input type="number" id="detailResolutionMinutes" value="${resolutionMinutes}" class="form-input" placeholder="Manuel süre (dk)" step="1" min="0"><small class="muted">Not: Doldurulursa otomatik hesaplamayı geçersiz kılar.</small></div>
    <div><strong>Yeni Not:</strong> <textarea id="newNote" rows="2" class="form-input"></textarea><button class="btn btn-primary btn-sm" style="margin-top:5px" onclick="addNote('${caseId}')">Not Ekle</button></div>
    <div><strong>Notlar:</strong><div id="notesArea">${notesHtml}</div></div>
    <div class="btn-row" style="margin-top:15px;"><button class="btn btn-primary" onclick="saveCaseDetail('${caseId}')">Kaydet</button></div>
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
  const resolvedBy = document.getElementById('detailResolvedBy').value || null;
  let resolvedAtRaw = document.getElementById('detailResolvedAt').value;
  let resolvedAtTimestamp = resolvedAtRaw ? new Date(resolvedAtRaw) : null;
  let manualMinutes = parseInt(document.getElementById('detailResolutionMinutes').value);
  let resolutionMinutes = null;
  const ref = db.collection('cases').doc(caseId);
  const doc = await ref.get();
  const created = doc.data().createdAt.toDate();
  if (newStatus === 'çözüldü') {
    if (!isNaN(manualMinutes) && manualMinutes > 0) resolutionMinutes = manualMinutes;
    else if (resolvedAtTimestamp) resolutionMinutes = Math.round((resolvedAtTimestamp - created) / (1000 * 60));
    else resolutionMinutes = 0;
  }
  await ref.update({ status: newStatus, priority: newPriority, updatedAt: new Date(), resolvedBy, resolvedAt: resolvedAtTimestamp, resolutionMinutes });
  closeModal('caseDetailModal');
  refreshDashboard();
  if (document.getElementById('statsTab').style.display !== 'none') renderStats();
};
window.deleteCase = async function(caseId) { if (confirm('Silinsin mi?')) { await db.collection('cases').doc(caseId).delete(); refreshDashboard(); } };

// ==================== TOPIC MANAGEMENT ====================
async function renderTopicsList() {
  const topics = await loadTopics();
  document.getElementById('topicsList').innerHTML = topics.map(t => `<div class="topic-item"><div><strong>${escapeHtml(t.title)}</strong> ${t.active?'✅':'❌'}<br><small>${escapeHtml(t.description||'')}</small><br><small>Sorumlu: ${escapeHtml(t.responsibleEmail||'')}</small></div><div class="row-actions"><button class="btn btn-ghost btn-sm" onclick="editTopic('${t.id}')">✏️</button><button class="btn btn-danger btn-sm" onclick="deleteTopic('${t.id}')">🗑</button></div></div>`).join('');
}
window.openTopicModal = function(id=null) {
  editTopicId = id;
  document.getElementById('topicModalTitle').textContent = id ? 'Düzenle' : 'Yeni Konu';
  if (id) db.collection('topics').doc(id).get().then(doc => { if(doc.exists){ document.getElementById('topicTitle').value=doc.data().title; document.getElementById('topicDesc').value=doc.data().description||''; document.getElementById('topicResponsibleEmail').value=doc.data().responsibleEmail||''; document.getElementById('topicActive').checked=doc.data().active; } });
  else { document.getElementById('topicTitle').value=''; document.getElementById('topicDesc').value=''; document.getElementById('topicResponsibleEmail').value=''; document.getElementById('topicActive').checked=true; }
  openModal('topicModal');
};
document.getElementById('saveTopicBtn').onclick = async () => {
  const title = document.getElementById('topicTitle').value.trim();
  if(!title) return alert('Başlık gerekli');
  const data = { title, description: document.getElementById('topicDesc').value.trim(), responsibleEmail: document.getElementById('topicResponsibleEmail').value.trim(), active: document.getElementById('topicActive').checked };
  if(editTopicId) await db.collection('topics').doc(editTopicId).update(data);
  else await db.collection('topics').add({ ...data, createdAt: new Date() });
  closeModal('topicModal'); renderTopicsList(); populateTopicFilter();
};
window.editTopic = (id) => openTopicModal(id);
window.deleteTopic = async (id) => {
  if(!confirm('Silinsin mi?')) return;
  await db.collection('topics').doc(id).delete();
  const cases = await db.collection('cases').where('topicId','==',id).get();
  const batch = db.batch();
  cases.forEach(doc => batch.update(doc.ref, { topicId: null }));
  await batch.commit();
  renderTopicsList(); populateTopicFilter(); refreshDashboard();
};

// ==================== USER MANAGEMENT ====================
async function renderUsersTable() {
  const users = await loadUsers();
  document.getElementById('usersTableBody').innerHTML = users.map(u => `<tr><td>${u.id.slice(-6)}</td><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.email)}</td><td>${u.role}</td><td class="row-actions"><button class="btn btn-ghost btn-sm" onclick="editUser('${u.id}')">Düzenle</button>${u.role!=='admin'?`<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')">Sil</button>`:''}</td></tr>`).join('');
}
window.openUserModal = function(id=null) {
  editUserId = id;
  document.getElementById('userEditModalTitle').textContent = id ? 'Düzenle' : 'Yeni Kullanıcı';
  if(id) db.collection('users').doc(id).get().then(doc=>{ if(doc.exists){ document.getElementById('editUsername').value=doc.data().username; document.getElementById('editUserEmail').value=doc.data().email; document.getElementById('editUserRole').value=doc.data().role; document.getElementById('editPassword').value=''; } });
  else { document.getElementById('editUsername').value=''; document.getElementById('editUserEmail').value=''; document.getElementById('editUserRole').value='user'; document.getElementById('editPassword').value=''; }
  openModal('userEditModal');
};
document.getElementById('saveUserEditBtn').onclick = async () => {
  const username = document.getElementById('editUsername').value.trim();
  const email = document.getElementById('editUserEmail').value.trim();
  const role = document.getElementById('editUserRole').value;
  const pass = document.getElementById('editPassword').value;
  if(!username) return alert('Kullanıcı adı gerekli');
  if(editUserId){
    const update = { username, email, role };
    if(pass) update.password = pass;
    await db.collection('users').doc(editUserId).update(update);
  } else {
    if(!pass) return alert('Şifre gerekli');
    await db.collection('users').add({ username, email, role, password: pass, createdAt: new Date() });
  }
  closeModal('userEditModal'); renderUsersTable();
};
window.editUser = (id) => openUserModal(id);
window.deleteUser = async (id) => { if(confirm('Silinsin mi?')){ await db.collection('users').doc(id).delete(); renderUsersTable(); } };

// ==================== MAIL SETTINGS (EmailJS - 2 Template) ====================
function loadMailSettings() { return JSON.parse(localStorage.getItem('case_mail_settings_emailjs') || '{}'); }
function saveMailSettings() {
  const settings = {
    publicKey: document.getElementById('emailjsPublicKey').value,
    serviceId: document.getElementById('emailjsServiceId').value,
    adminTemplateId: document.getElementById('emailjsAdminTemplateId').value,
    responsibleTemplateId: document.getElementById('emailjsResponsibleTemplateId').value,
    adminEmail: document.getElementById('adminNotifyEmail').value,
    ccEmail: document.getElementById('ccEmail').value
  };
  localStorage.setItem('case_mail_settings_emailjs', JSON.stringify(settings));
  if(settings.publicKey && typeof emailjs !== 'undefined') { emailjs.init(settings.publicKey); emailjsInitialized = true; }
  document.getElementById('mailStatus').innerHTML = '<span style="color:var(--accent)">✅ Kaydedildi</span>';
}
function loadMailSettingsToForm() {
  const s = loadMailSettings();
  document.getElementById('emailjsPublicKey').value = s.publicKey || '';
  document.getElementById('emailjsServiceId').value = s.serviceId || '';
  document.getElementById('emailjsAdminTemplateId').value = s.adminTemplateId || '';
  document.getElementById('emailjsResponsibleTemplateId').value = s.responsibleTemplateId || '';
  document.getElementById('adminNotifyEmail').value = s.adminEmail || '';
  document.getElementById('ccEmail').value = s.ccEmail || '';
  if(s.publicKey && typeof emailjs !== 'undefined' && !emailjsInitialized) { emailjs.init(s.publicKey); emailjsInitialized = true; }
}
async function testEmail() {
  const s = loadMailSettings();
  if(!s.publicKey || !s.serviceId || !s.adminTemplateId) { document.getElementById('mailStatus').innerHTML = '<span style="color:var(--accent3)">❌ Eksik ayar (Admin Template ID gerekli)</span>'; return; }
  if(typeof emailjs === 'undefined') { document.getElementById('mailStatus').innerHTML = '<span style="color:var(--accent3)">❌ EmailJS yüklenmedi</span>'; return; }
  if(!emailjsInitialized) { emailjs.init(s.publicKey); emailjsInitialized = true; }
  try {
    await emailjs.send(s.serviceId, s.adminTemplateId, { to_email: s.adminEmail || currentUser?.email, message: "Test maili başarılı", caseId: "TEST-001", caseTitle: "Test", caseDescription: "Test", topicTitle: "Test", casePriorityText: "Orta", caseStatusText: "Beklemede", createdAt: new Date().toLocaleString('tr') });
    document.getElementById('mailStatus').innerHTML = '<span style="color:var(--accent)">✅ Test maili gönderildi</span>';
  } catch(err) { document.getElementById('mailStatus').innerHTML = `<span style="color:var(--accent3)">❌ Hata: ${err.text || err.message}</span>`; }
}

// ==================== İSTATİSTİKLER ve EXCEL EXPORT ====================
async function renderStats() {
  const cases = await loadCases();
  const users = await loadUsers();
  const userMap = Object.fromEntries(users.map(u => [u.id, u.username]));
  const resolvedCases = cases.filter(c => c.status === 'çözüldü' && c.resolvedBy && c.resolutionMinutes !== null);
  const stats = {};
  for (const c of resolvedCases) {
    if (!stats[c.resolvedBy]) stats[c.resolvedBy] = { count: 0, totalMinutes: 0 };
    stats[c.resolvedBy].count++;
    stats[c.resolvedBy].totalMinutes += c.resolutionMinutes;
  }
  const labels = [], counts = [], avgMinutes = [];
  for (const [userId, data] of Object.entries(stats)) {
    const name = userMap[userId] || userId.slice(-6);
    labels.push(name);
    counts.push(data.count);
    avgMinutes.push((data.totalMinutes / data.count).toFixed(1));
  }
  document.getElementById('statsTableBody').innerHTML = labels.map((name, i) => `<tr><td>${escapeHtml(name)}</td><td>${counts[i]}</td><td>${avgMinutes[i]}</td><td>${(avgMinutes[i]/60).toFixed(1)} saat</td></tr>`).join('');
  if (window.statsChart) window.statsChart.destroy();
  const ctx = document.getElementById('statsChart').getContext('2d');
  window.statsChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Çözülen Case Sayısı', data: counts, backgroundColor: '#7c3aed', yAxisID: 'y' }, { label: 'Ortalama Çözüm Süresi (dk)', data: avgMinutes, backgroundColor: '#f97316', yAxisID: 'y1' }] },
    options: { responsive: true, scales: { y: { beginAtZero: true, title: { display: true, text: 'Case Sayısı' } }, y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'Dakika' } } } }
  });
}
async function exportToExcel() {
  const cases = await loadCases();
  const users = await loadUsers();
  const userMap = Object.fromEntries(users.map(u => [u.id, u.username]));
  const topics = await loadTopics();
  const topicMap = Object.fromEntries(topics.map(t => [t.id, t.title]));
  const resolvedCases = cases.filter(c => c.status === 'çözüldü' && c.resolvedBy);
  const data = resolvedCases.map(c => ({ 'Case ID': c.id, 'Başlık': c.title, 'Açıklama': c.description, 'Konu': topicMap[c.topicId] || 'Belirtilmemiş', 'Öncelik': c.priority, 'Oluşturan Kullanıcı': c.fullname, 'Oluşturan E-posta': c.email, 'Çözen Kişi': userMap[c.resolvedBy] || c.resolvedBy, 'Çözülme Tarihi': c.resolvedAt ? new Date(c.resolvedAt.toDate()).toLocaleString('tr') : '', 'Çözüm Süresi (dk)': c.resolutionMinutes !== undefined ? c.resolutionMinutes : '', 'Oluşturulma Tarihi': new Date(c.createdAt.toDate()).toLocaleString('tr') }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Çözülen Case\'ler');
  XLSX.writeFile(wb, `case_cozum_raporu_${new Date().toISOString().slice(0,19)}.xlsx`);
}

// ==================== TAB MANAGEMENT ====================
function showTab(tab) {
  const tabs = ['cases', 'topics', 'users', 'mail', 'stats'];
  tabs.forEach(t => { const el = document.getElementById(t + 'Tab'); if(el) el.style.display = t === tab ? 'block' : 'none'; });
  if (tab === 'topics') renderTopicsList();
  if (tab === 'users') renderUsersTable();
  if (tab === 'mail') loadMailSettingsToForm();
  if (tab === 'stats') renderStats();
}
window.filterCases = () => renderCasesTable();

// ==================== URL'DEN CASE ID YAKALA VE DETAYI AÇ ====================
async function openCaseDetailFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const caseId = urlParams.get('caseId');
  const openDetail = urlParams.get('openDetail');
  if (caseId && openDetail === 'true') {
    const waitForAuth = setInterval(() => {
      if (currentUser) {
        clearInterval(waitForAuth);
        openCaseDetail(caseId);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }, 500);
    setTimeout(() => clearInterval(waitForAuth), 10000);
  }
}

// ==================== UTILITIES ====================
function escapeHtml(s) { if(!s) return ''; return String(s).replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])); }
function showToast(msg) { const toast = document.createElement('div'); toast.textContent = msg; toast.style.cssText = 'position:fixed; bottom:20px; right:20px; background:var(--accent2); color:#fff; padding:8px 16px; border-radius:20px; font-size:12px; z-index:9999;'; document.body.appendChild(toast); setTimeout(() => toast.remove(), 4000); }
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.getElementById('refreshBtn').onclick = async () => { await refreshDashboard(); showToast('Yenilendi'); };

// Sayfa yüklendiğinde URL'yi kontrol et
document.addEventListener('DOMContentLoaded', openCaseDetailFromUrl);
