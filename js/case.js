// Firebase yapılandırması
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

let emailSettings = { adminEmail: '', ccEmails: [] };

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

// ==================== PHP İLE MAİL GÖNDERME ====================
async function sendMailWithPHP(emailData) {
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
}

async function sendNewCaseNotification(caseId, caseData) {
  if (!emailSettings.adminEmail) return;
  const mailData = {
    to_email: emailSettings.adminEmail,
    cc_emails: emailSettings.ccEmails,
    subject: `Yeni Case Oluşturuldu: ${caseId}`,
    message: `Kullanıcı: ${caseData.fullname} (${caseData.email})\nKonu ID: ${caseData.topicId}\nBaşlık: ${caseData.title}\nAçıklama: ${caseData.description}`
  };
  return sendMailWithPHP(mailData);
}

// ==================== KONULARI YÜKLE ====================
async function loadTopics() {
  const snap = await db.collection('caseTopics').where('active', '==', true).get();
  const topics = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const select = document.getElementById('caseTopic');
  select.innerHTML = '<option value="">Seçiniz</option>' + topics.map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
}

// ==================== MAİL AYARLARINI YÜKLE ====================
async function loadMailSettings() {
  const doc = await db.collection('settings').doc('emailConfig').get();
  if (doc.exists) {
    emailSettings = doc.data();
  }
}

// ==================== YENİ CASE OLUŞTUR ====================
window.createCase = async function() {
  const fullname = document.getElementById('userFullname').value.trim();
  const email = document.getElementById('userEmail').value.trim();
  const topicId = document.getElementById('caseTopic').value;
  const priority = document.getElementById('casePriority').value;
  const title = document.getElementById('caseTitle').value.trim();
  const description = document.getElementById('caseDesc').value.trim();
  
  if (!fullname || !email || !topicId || !title || !description) {
    document.getElementById('createStatus').innerHTML = '<div class="status-bar error">Lütfen tüm zorunlu alanları doldurun.</div>';
    return;
  }
  
  const caseData = {
    fullname, email, topicId, priority, title, description,
    status: 'beklemede',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    notes: [],
    resolvedBy: null,
    resolvedAt: null,
    resolutionMinutes: null,
    notificationSent: false
  };
  
  try {
    const docRef = await db.collection('cases').add(caseData);
    const caseId = docRef.id;
    await docRef.update({ id: caseId });
    
    // Mail gönderimi
    await sendNewCaseNotification(caseId, caseData);
    
    document.getElementById('createStatus').innerHTML = `<div class="status-bar success">✅ Case başarıyla oluşturuldu. Case ID: ${caseId}</div>`;
    document.getElementById('userFullname').value = '';
    document.getElementById('userEmail').value = '';
    document.getElementById('caseTopic').value = '';
    document.getElementById('caseTitle').value = '';
    document.getElementById('caseDesc').value = '';
  } catch(e) {
    document.getElementById('createStatus').innerHTML = `<div class="status-bar error">❌ Hata: ${e.message}</div>`;
  }
};

// ==================== CASE SORGULA ====================
window.queryCases = async function() {
  const caseId = document.getElementById('queryCaseId').value.trim();
  const email = document.getElementById('queryEmail').value.trim();
  if (!caseId && !email) {
    document.getElementById('queryStatus').innerHTML = '<div class="status-bar error">Lütfen Case ID veya E-posta girin.</div>';
    return;
  }
  
  let query = db.collection('cases');
  if (caseId) query = query.where('id', '==', caseId);
  else query = query.where('email', '==', email);
  
  const snap = await query.get();
  const cases = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const container = document.getElementById('casesListContainer');
  
  if (cases.length === 0) {
    container.innerHTML = '<div class="status-bar">Sonuç bulunamadı.</div>';
    return;
  }
  
  const topics = await loadTopicsStatic();
  const topicMap = Object.fromEntries(topics.map(t => [t.id, t]));
  
  container.innerHTML = cases.map(c => `
    <div class="case-card" data-status="${c.status}">
      <div class="case-title">${escapeHtml(c.title)}</div>
      <div class="case-meta">ID: ${c.id} • ${topicMap[c.topicId]?.title || '-'} • ${new Date(c.createdAt?.toDate()).toLocaleString()}</div>
      <div class="case-desc">${escapeHtml(c.description.substring(0, 100))}${c.description.length > 100 ? '…' : ''}</div>
      <div>
        <span class="badge-case badge-${c.priority === 'yüksek' ? 'high' : (c.priority === 'orta' ? 'med' : 'low')}">${c.priority}</span>
        <span class="badge-case ${c.status === 'beklemede' ? 'badge-pend' : (c.status === 'sürüyor' ? 'badge-prog' : (c.status === 'çözüldü' ? 'badge-done' : 'badge-rej'))}">${c.status}</span>
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top: 8px;" onclick="openCaseDetail('${c.id}')">Detay</button>
    </div>
  `).join('');
  document.getElementById('queryStatus').innerHTML = '';
};

async function loadTopicsStatic() {
  const snap = await db.collection('caseTopics').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ==================== CASE DETAY (MODAL) ====================
window.openCaseDetail = async function(caseId) {
  const doc = await db.collection('cases').doc(caseId).get();
  if (!doc.exists) return;
  const c = doc.data();
  const topics = await loadTopicsStatic();
  const topic = topics.find(t => t.id === c.topicId);
  
  const notesHtml = (c.notes || []).map(n => `
    <div class="note-item">
      <div class="note-meta">${new Date(n.createdAt.toDate()).toLocaleString()} • ${escapeHtml(n.createdBy)}</div>
      <div>${escapeHtml(n.text)}</div>
    </div>
  `).join('');
  
  document.getElementById('detailContent').innerHTML = `
    <div><strong>Durum:</strong> <span class="badge-case ${c.status === 'beklemede' ? 'badge-pend' : (c.status === 'sürüyor' ? 'badge-prog' : (c.status === 'çözüldü' ? 'badge-done' : 'badge-rej'))}">${c.status}</span></div>
    <div><strong>Konu:</strong> ${topic ? escapeHtml(topic.title) : '-'}</div>
    <div><strong>Başlık:</strong> ${escapeHtml(c.title)}</div>
    <div><strong>Açıklama:</strong> ${escapeHtml(c.description)}</div>
    <div><strong>Oluşturma:</strong> ${new Date(c.createdAt?.toDate()).toLocaleString()}</div>
    <hr>
    <strong>Notlar:</strong>
    <div id="detailNotes">${notesHtml || '<div>Henüz not yok.</div>'}</div>
  `;
  openModal('detailModal');
};

// Sayfa yüklendiğinde konuları ve mail ayarlarını getir
document.addEventListener('DOMContentLoaded', () => {
  loadTopics();
  loadMailSettings();
});
