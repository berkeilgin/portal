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
const db = firebase.firestore();

// ==================== YARDIMCI FONKSİYONLAR ====================
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
window.closeModal = closeModal;

// ==================== VERİ YÜKLEME ====================
let topicsCache = null;
async function loadTopics() {
  if (topicsCache) return topicsCache;
  const snap = await db.collection('caseTopics').get();
  topicsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return topicsCache;
}

let usersCache = null;
async function loadUsers() {
  if (usersCache) return usersCache;
  const snap = await db.collection('caseUsers').get();
  usersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return usersCache;
}

// ==================== PHP İLE MAIL GÖNDERME ====================
window.sendMailWithPHP = async function(emailData) {
  try {
    const response = await fetch('https://seninsite.byethost.com/send_mail.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailData)
    });
    const result = await response.json();
    if (result.success) {
      console.log('✅ Mail gönderildi:', result.message);
    } else {
      console.error('❌ Mail hatası:', result.message);
    }
    return result;
  } catch (error) {
    console.error('🌐 Bağlantı hatası:', error);
    return { success: false, message: error.message };
  }
};

// ==================== TAB GÖSTERİMİ ====================
function showTab(tabName) {
  document.querySelectorAll('#casesTab, #topicsTab, #usersTab, #mailTab, #statsTab').forEach(t => t.style.display = 'none');
  document.getElementById(tabName + 'Tab').style.display = 'block';
  if (tabName === 'cases') renderCases();
  else if (tabName === 'topics') renderTopics();
  else if (tabName === 'users') renderUsers();
  else if (tabName === 'stats') renderStats();
  else if (tabName === 'mail') loadMailSettings();
}

// ==================== CASE LİSTESİ ====================
async function renderCases() {
  const statusFilter = document.getElementById('statusFilter').value;
  const topicFilter = document.getElementById('topicFilter').value;
  const searchTerm = document.getElementById('searchCase').value.toLowerCase();
  
  let query = db.collection('cases').orderBy('createdAt', 'desc');
  const snap = await query.get();
  let cases = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  if (statusFilter) cases = cases.filter(c => c.status === statusFilter);
  if (topicFilter) cases = cases.filter(c => c.topicId === topicFilter);
  if (searchTerm) {
    cases = cases.filter(c => 
      c.id.toLowerCase().includes(searchTerm) ||
      c.title.toLowerCase().includes(searchTerm) ||
      c.email.toLowerCase().includes(searchTerm)
    );
  }
  
  const topics = await loadTopics();
  const topicMap = Object.fromEntries(topics.map(t => [t.id, t]));
  
  const tbody = document.getElementById('casesTableBody');
  tbody.innerHTML = cases.map(c => `
    <tr>
      <td>${c.id}</td>
      <td>${topicMap[c.topicId]?.title || '-'}</td>
      <td>${escapeHtml(c.title)}</td>
      <td>${escapeHtml(c.fullname)}</td>
      <td>${c.email}</td>
      <td><span class="status-badge status-${c.status}">${c.status}</span></td>
      <td><span class="badge-case ${c.priority === 'yüksek' ? 'badge-high' : (c.priority === 'orta' ? 'badge-med' : 'badge-low')}">${c.priority}</span></td>
      <td>${c.createdAt?.toDate().toLocaleDateString() || '-'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openCaseDetail('${c.id}')">Detay</button></td>
    </tr>
  `).join('');
}

function filterCases() { renderCases(); }

// ==================== CASE DETAY VE GÜNCELLEME ====================
window.openCaseDetail = async function(caseId) {
  const doc = await db.collection('cases').doc(caseId).get();
  if (!doc.exists) return;
  const c = doc.data();
  const topics = await loadTopics();
  const users = await loadUsers();
  const topic = topics.find(t => t.id === c.topicId);
  
  const notesHtml = (c.notes || []).map(n => `
    <div class="note-item">
      <div class="note-meta">${new Date(n.createdAt.toDate()).toLocaleString()} • ${escapeHtml(n.createdBy)}</div>
      <div>${escapeHtml(n.text)}</div>
    </div>
  `).join('') || '<div class="note-item">Henüz not eklenmemiş.</div>';
  
  const resolvedAtValue = c.resolvedAt ? new Date(c.resolvedAt.toDate()).toISOString().slice(0,10) : '';
  const resolutionMinutes = c.resolutionMinutes || '';
  
  document.getElementById('caseDetailContent').innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
      <div class="info-group"><label>Case ID</label><div class="info-value"><strong>${c.id}</strong></div></div>
      <div class="info-group"><label>Oluşturulma</label><div class="info-value">${new Date(c.createdAt.toDate()).toLocaleString('tr')}</div></div>
      <div class="info-group"><label>Kullanıcı</label><div class="info-value">${escapeHtml(c.fullname)} <span style="color:var(--muted);">(${c.email})</span></div></div>
      <div class="info-group"><label>Konu</label><div class="info-value">${topic ? escapeHtml(topic.title) : '-'}</div></div>
      <div class="info-group"><label>Başlık</label><div class="info-value">${escapeHtml(c.title)}</div></div>
      <div class="info-group"><label>Öncelik</label><div class="info-value">
        <span class="badge-case ${c.priority === 'yüksek' ? 'badge-high' : (c.priority === 'orta' ? 'badge-med' : 'badge-low')}">${c.priority}</span>
      </div></div>
      <div class="info-group"><label>Durum</label><div class="info-value">
        <span class="status-badge status-${c.status}">${c.status}</span>
      </div></div>
    </div>
    <div class="info-group full-width"><label>Açıklama</label><div class="info-value">${escapeHtml(c.description)}</div></div>
    
    <hr style="margin: 16px 0; border-color: var(--border);">
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
      <div class="info-group"><label>Durum Güncelle</label>
        <select id="detailStatus" class="form-input">
          <option value="beklemede" ${c.status==='beklemede'?'selected':''}>⏳ Beklemede</option>
          <option value="sürüyor" ${c.status==='sürüyor'?'selected':''}>🔄 Sürüyor</option>
          <option value="çözüldü" ${c.status==='çözüldü'?'selected':''}>✅ Çözüldü</option>
          <option value="reddedildi" ${c.status==='reddedildi'?'selected':''}>⛔ Reddedildi</option>
        </select>
      </div>
      <div class="info-group"><label>Öncelik Güncelle</label>
        <select id="detailPriority" class="form-input">
          <option value="düşük" ${c.priority==='düşük'?'selected':''}>🟢 Düşük</option>
          <option value="orta" ${c.priority==='orta'?'selected':''}>🟠 Orta</option>
          <option value="yüksek" ${c.priority==='yüksek'?'selected':''}>🔴 Yüksek</option>
        </select>
      </div>
      <div class="info-group"><label>Çözen Kişi</label>
        <select id="detailResolvedBy" class="form-input">
          <option value="">Seçiniz</option>${users.map(u => `<option value="${u.id}" ${c.resolvedBy===u.id ? 'selected' : ''}>${escapeHtml(u.username)} (${u.email})</option>`).join('')}
        </select>
      </div>
      <div class="info-group"><label>Çözülme Tarihi</label>
        <input type="date" id="detailResolvedAt" value="${resolvedAtValue}" class="form-input">
      </div>
      <div class="info-group"><label>Çözüm Süresi (Dakika)</label>
        <input type="number" id="detailResolutionMinutes" value="${resolutionMinutes}" class="form-input" placeholder="Manuel süre" step="1" min="0">
        <small style="color:var(--muted);">Doldurulursa otomatik hesaplama yerine bu değer kullanılır.</small>
      </div>
    </div>
    
    <hr style="margin: 16px 0; border-color: var(--border);">
    
    <div class="info-group full-width"><label>📝 Yeni Not Ekle</label>
      <textarea id="newNote" rows="2" class="form-input" placeholder="Notunuzu yazın..."></textarea>
      <button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="addNote('${caseId}')">+ Not Ekle</button>
    </div>
    
    <div class="info-group full-width"><label>📋 Not Geçmişi</label>
      <div id="notesArea" style="max-height: 200px; overflow-y: auto;">${notesHtml}</div>
    </div>
    
    <div class="btn-row" style="margin-top: 24px; justify-content: flex-end;">
      <button class="btn btn-primary" onclick="saveCaseDetail('${caseId}')">💾 Değişiklikleri Kaydet</button>
    </div>
  `;
  
  openModal('caseDetailModal');
};

window.addNote = async function(caseId) {
  const noteText = document.getElementById('newNote').value.trim();
  if (!noteText) return;
  const user = auth.currentUser;
  const note = {
    text: noteText,
    createdBy: user?.email || 'admin',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  await db.collection('cases').doc(caseId).update({
    notes: firebase.firestore.FieldValue.arrayUnion(note)
  });
  document.getElementById('newNote').value = '';
  openCaseDetail(caseId);
};

window.saveCaseDetail = async function(caseId) {
  const newStatus = document.getElementById('detailStatus').value;
  const newPriority = document.getElementById('detailPriority').value;
  const newResolvedBy = document.getElementById('detailResolvedBy').value || null;
  const newResolvedAt = document.getElementById('detailResolvedAt').value;
  const resolutionMinutes = document.getElementById('detailResolutionMinutes').value;
  
  const updateData = {
    status: newStatus,
    priority: newPriority,
    resolvedBy: newResolvedBy,
    resolutionMinutes: resolutionMinutes ? parseInt(resolutionMinutes) : null
  };
  if (newResolvedAt) updateData.resolvedAt = firebase.firestore.Timestamp.fromDate(new Date(newResolvedAt));
  else updateData.resolvedAt = null;
  
  await db.collection('cases').doc(caseId).update(updateData);
  
  // Eğer durum çözüldü veya reddedildi ise ve daha önce mail gönderilmemişse mail at
  const doc = await db.collection('cases').doc(caseId).get();
  const caseData = doc.data();
  if ((newStatus === 'çözüldü' || newStatus === 'reddedildi') && !caseData.notificationSent) {
    await sendStatusUpdateEmailPHP(caseId, caseData);
    await db.collection('cases').doc(caseId).update({ notificationSent: true });
  }
  
  closeModal('caseDetailModal');
  renderCases();
};

// ==================== KONU YÖNETİMİ ====================
async function renderTopics() {
  const topics = await loadTopics();
  const container = document.getElementById('topicsList');
  container.innerHTML = topics.map(t => `
    <div class="topic-item">
      <div><strong>${escapeHtml(t.title)}</strong><br><small>${escapeHtml(t.description || '')}</small><br><small>Sorumlu: ${escapeHtml(t.responsibleEmail || '-')}</small></div>
      <div><button class="btn btn-ghost btn-sm" onclick="editTopic('${t.id}')">✏️</button></div>
    </div>
  `).join('');
}

let editingTopicId = null;
function openTopicModal(topicId = null) {
  editingTopicId = topicId;
  if (topicId) {
    loadTopics().then(topics => {
      const t = topics.find(t => t.id === topicId);
      if (t) {
        document.getElementById('topicModalTitle').innerText = 'Konu Düzenle';
        document.getElementById('topicTitle').value = t.title;
        document.getElementById('topicDesc').value = t.description || '';
        document.getElementById('topicResponsibleEmail').value = t.responsibleEmail || '';
        document.getElementById('topicActive').checked = t.active !== false;
      }
    });
  } else {
    document.getElementById('topicModalTitle').innerText = 'Yeni Konu';
    document.getElementById('topicTitle').value = '';
    document.getElementById('topicDesc').value = '';
    document.getElementById('topicResponsibleEmail').value = '';
    document.getElementById('topicActive').checked = true;
  }
  openModal('topicModal');
}

document.getElementById('saveTopicBtn').onclick = async () => {
  const title = document.getElementById('topicTitle').value.trim();
  if (!title) return;
  const data = {
    title,
    description: document.getElementById('topicDesc').value.trim(),
    responsibleEmail: document.getElementById('topicResponsibleEmail').value.trim(),
    active: document.getElementById('topicActive').checked
  };
  if (editingTopicId) {
    await db.collection('caseTopics').doc(editingTopicId).update(data);
  } else {
    await db.collection('caseTopics').add(data);
  }
  closeModal('topicModal');
  renderTopics();
};

window.editTopic = (id) => openTopicModal(id);

// ==================== KULLANICI YÖNETİMİ ====================
async function renderUsers() {
  const users = await loadUsers();
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.id}</td>
      <td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.email)}</td>
      <td>${u.role || 'user'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="editUser('${u.id}')">✏️</button></td>
    </tr>
  `).join('');
}

let editingUserId = null;
function openUserModal(userId = null) {
  editingUserId = userId;
  if (userId) {
    loadUsers().then(users => {
      const u = users.find(u => u.id === userId);
      if (u) {
        document.getElementById('userEditModalTitle').innerText = 'Kullanıcı Düzenle';
        document.getElementById('editUsername').value = u.username;
        document.getElementById('editUserEmail').value = u.email;
        document.getElementById('editUserRole').value = u.role || 'user';
        document.getElementById('editPassword').value = '';
      }
    });
  } else {
    document.getElementById('userEditModalTitle').innerText = 'Yeni Kullanıcı';
    document.getElementById('editUsername').value = '';
    document.getElementById('editUserEmail').value = '';
    document.getElementById('editUserRole').value = 'user';
    document.getElementById('editPassword').value = '';
  }
  openModal('userEditModal');
}

document.getElementById('saveUserEditBtn').onclick = async () => {
  const username = document.getElementById('editUsername').value.trim();
  const email = document.getElementById('editUserEmail').value.trim();
  const role = document.getElementById('editUserRole').value;
  const password = document.getElementById('editPassword').value;
  if (!username || !email) return;
  
  if (editingUserId) {
    await db.collection('caseUsers').doc(editingUserId).update({ username, email, role });
    if (password) {
      // Şifre değişimi için Firebase Auth kullanıcısının güncellenmesi gerekir.
      // Bu işlem için admin SDK gerektiğinden burada atlıyoruz.
      alert('Şifre değiştirmek için Firebase Console üzerinden yapınız.');
    }
  } else {
    // Yeni kullanıcı oluştur (Firebase Auth + Firestore)
    try {
      const userCred = await auth.createUserWithEmailAndPassword(email, password);
      await db.collection('caseUsers').doc(userCred.user.uid).set({ username, email, role });
    } catch(e) { alert('Kullanıcı oluşturulamadı: ' + e.message); }
  }
  closeModal('userEditModal');
  renderUsers();
};

window.editUser = (id) => openUserModal(id);

// ==================== İSTATİSTİKLER ====================
let statsChart = null;
async function renderStats() {
  const casesSnap = await db.collection('cases').get();
  const cases = casesSnap.docs.map(d => d.data());
  
  const resolverStats = {};
  cases.forEach(c => {
    if (c.resolvedBy && c.status === 'çözüldü') {
      if (!resolverStats[c.resolvedBy]) resolverStats[c.resolvedBy] = { count: 0, totalMinutes: 0 };
      resolverStats[c.resolvedBy].count++;
      const minutes = c.resolutionMinutes || 0;
      resolverStats[c.resolvedBy].totalMinutes += minutes;
    }
  });
  
  const statsArray = Object.entries(resolverStats).map(([id, stat]) => ({
    resolverId: id,
    count: stat.count,
    totalMinutes: stat.totalMinutes,
    avgMinutes: stat.count ? (stat.totalMinutes / stat.count).toFixed(1) : 0
  }));
  
  const tbody = document.getElementById('statsTableBody');
  tbody.innerHTML = statsArray.map(s => `
    <tr>
      <td>${s.resolverId}</td>
      <td>${s.count}</td>
      <td>${s.totalMinutes}</td>
      <td>${s.avgMinutes}</td>
    </tr>
  `).join('');
  
  const ctx = document.getElementById('statsChart').getContext('2d');
  if (statsChart) statsChart.destroy();
  statsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: statsArray.map(s => s.resolverId),
      datasets: [
        { label: 'Çözülen Case Sayısı', data: statsArray.map(s => s.count), backgroundColor: 'var(--accent2)' },
        { label: 'Ortalama Süre (dk)', data: statsArray.map(s => s.avgMinutes), backgroundColor: 'var(--accent)' }
      ]
    },
    options: { responsive: true, maintainAspectRatio: true }
  });
}

function exportToExcel() {
  const table = document.getElementById('statsTableBody');
  const rows = Array.from(table.querySelectorAll('tr'));
  const data = rows.map(row => {
    const cells = Array.from(row.querySelectorAll('td'));
    return cells.map(cell => cell.innerText);
  });
  const ws = XLSX.utils.aoa_to_sheet([['Çözen Kişi', 'Çözülen Sayı', 'Toplam Süre (dk)', 'Ortalama Süre (dk)'], ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CasePerformans');
  XLSX.writeFile(wb, `case_performans_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ==================== MAIL AYARLARI ====================
let mailConfig = { adminEmail: '', ccEmails: [] };
async function loadMailSettings() {
  const doc = await db.collection('settings').doc('emailConfig').get();
  if (doc.exists) {
    mailConfig = doc.data();
    document.getElementById('emailjsPublicKey').value = mailConfig.publicKey || '';
    document.getElementById('emailjsServiceId').value = mailConfig.serviceId || '';
    document.getElementById('emailjsAdminTemplateId').value = mailConfig.adminTemplateId || '';
    document.getElementById('emailjsResponsibleTemplateId').value = mailConfig.responsibleTemplateId || '';
    document.getElementById('adminNotifyEmail').value = mailConfig.adminEmail || '';
    document.getElementById('ccEmail').value = (mailConfig.ccEmails || []).join(', ');
  }
}

async function saveMailSettings() {
  const config = {
    publicKey: document.getElementById('emailjsPublicKey').value.trim(),
    serviceId: document.getElementById('emailjsServiceId').value.trim(),
    adminTemplateId: document.getElementById('emailjsAdminTemplateId').value.trim(),
    responsibleTemplateId: document.getElementById('emailjsResponsibleTemplateId').value.trim(),
    adminEmail: document.getElementById('adminNotifyEmail').value.trim(),
    ccEmails: document.getElementById('ccEmail').value.split(',').map(e => e.trim()).filter(e => e)
  };
  await db.collection('settings').doc('emailConfig').set(config);
  mailConfig = config;
  document.getElementById('mailStatus').innerHTML = '<div class="status-bar success">✅ Ayarlar kaydedildi.</div>';
  setTimeout(() => document.getElementById('mailStatus').innerHTML = '', 3000);
}

async function testEmail() {
  if (!mailConfig.adminEmail) {
    document.getElementById('mailStatus').innerHTML = '<div class="status-bar error">❌ Lütfen önce alıcı e-posta adresini kaydedin.</div>';
    return;
  }
  const result = await window.sendMailWithPHP({
    to_email: mailConfig.adminEmail,
    subject: 'Test Maili',
    message: 'Bu bir test mesajıdır. PHP mail sistemi çalışıyor.'
  });
  if (result.success) {
    document.getElementById('mailStatus').innerHTML = '<div class="status-bar success">✅ Test maili gönderildi.</div>';
  } else {
    document.getElementById('mailStatus').innerHTML = `<div class="status-bar error">❌ Hata: ${result.message}</div>`;
  }
  setTimeout(() => document.getElementById('mailStatus').innerHTML = '', 3000);
}

// ==================== GİRİŞ KONTROLÜ ====================
auth.onAuthStateChanged(async (user) => {
  if (user) {
    const userDoc = await db.collection('caseUsers').doc(user.uid).get();
    if (userDoc.exists && userDoc.data().role === 'admin') {
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('adminPanel').style.display = 'block';
      document.getElementById('adminRoleBadge').innerText = 'ADMIN';
      await loadMailSettings();
      renderCases();
      // Topic filtrelerini doldur
      const topics = await loadTopics();
      const topicSelect = document.getElementById('topicFilter');
      topicSelect.innerHTML = '<option value="">Tüm Konular</option>' + topics.map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
      showTab('cases');
    } else {
      auth.signOut();
      location.reload();
    }
  } else {
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
  }
});

document.getElementById('adminLoginBtn').onclick = async () => {
  const email = document.getElementById('adminEmail').value;
  const password = document.getElementById('adminPassword').value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch(e) {
    document.getElementById('adminLoginError').innerText = e.message;
  }
};

document.getElementById('logoutBtn').onclick = () => auth.signOut();
document.getElementById('refreshBtn').onclick = () => renderCases();

// Global fonksiyonları window'a bağla
window.sendMailWithPHP = sendMailWithPHP;
window.showTab = showTab;
window.filterCases = filterCases;
window.openCaseDetail = openCaseDetail;
window.addNote = addNote;
window.saveCaseDetail = saveCaseDetail;
window.editTopic = editTopic;
window.editUser = editUser;
window.saveMailSettings = saveMailSettings;
window.testEmail = testEmail;
window.exportToExcel = exportToExcel;
