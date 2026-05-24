// Firebase config (mevcut proje)
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

// ==================== Mail Ayarlarını localStorage'dan al ====================
function loadMailSettings() {
  return JSON.parse(localStorage.getItem('case_mail_settings_emailjs') || '{}');
}

// ==================== Konuları yükle ====================
async function loadTopics() {
  const snapshot = await db.collection('topics').where('active', '==', true).get();
  const topics = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const select = document.getElementById('caseTopic');
  if (select) {
    select.innerHTML = '<option value="">Seçiniz</option>' + topics.map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
  }
  return topics;
}

// ==================== Case Oluştur + Mail Gönder ====================
window.createCase = async function() {
  const fullname = document.getElementById('userFullname').value.trim();
  const email = document.getElementById('userEmail').value.trim();
  const topicId = document.getElementById('caseTopic').value;
  const priority = document.getElementById('casePriority').value;
  const title = document.getElementById('caseTitle').value.trim();
  const description = document.getElementById('caseDesc').value.trim();
  const statusEl = document.getElementById('createStatus');

  if (!fullname || !email || !topicId || !title || !description) {
    statusEl.innerHTML = '<span style="color:#e53e3e">Lütfen tüm zorunlu alanları doldurun.</span>';
    return;
  }
  if (!email.includes('@')) {
    statusEl.innerHTML = '<span style="color:#e53e3e">Geçerli bir e-posta girin.</span>';
    return;
  }

  try {
    const newCaseRef = db.collection('cases').doc();
    const caseData = {
      id: newCaseRef.id,
      fullname, email, topicId, priority, title, description,
      status: 'beklemede',
      createdAt: new Date(),
      notes: [],
      resolutionMinutes: null,
      resolvedBy: null,
      resolvedAt: null
    };
    await newCaseRef.set(caseData);

    // --- EmailJS ile bildirim gönder ---
    const mailSettings = loadMailSettings();
    if (mailSettings.publicKey && mailSettings.serviceId && mailSettings.templateId && typeof emailjs !== 'undefined') {
      emailjs.init(mailSettings.publicKey);
      const templateParams = {
        to_email: mailSettings.adminEmail || 'admin@example.com',
        cc: mailSettings.ccEmail || '',
        caseId: newCaseRef.id,
        caseTitle: title,
        caseDescription: description,
        topicTitle: document.querySelector('#caseTopic option:checked')?.text || 'Belirtilmemiş',
        topicDescription: '',
        casePriorityText: priority === 'yüksek' ? 'Yüksek' : (priority === 'orta' ? 'Orta' : 'Düşük'),
        caseStatusText: 'Beklemede',
        createdAt: new Date().toLocaleString('tr'),
        message: `Yeni bir case oluşturuldu. Detaylar için admin panele bakın.`
      };
      // CC'yi düzgün iletmek için (EmailJS birden fazla CC'yi virgülle kabul eder)
      if (mailSettings.ccEmail) templateParams.cc = mailSettings.ccEmail;
      
      await emailjs.send(mailSettings.serviceId, mailSettings.templateId, templateParams);
      console.log('Bildirim maili gönderildi.');
    } else {
      console.warn('EmailJS ayarları eksik, mail gönderilmedi.');
    }

    statusEl.innerHTML = '<span style="color:#2e7d32">✅ Case başarıyla oluşturuldu. Case ID: ' + newCaseRef.id.slice(-6) + '</span>';
    document.getElementById('userFullname').value = '';
    document.getElementById('userEmail').value = '';
    document.getElementById('caseTitle').value = '';
    document.getElementById('caseDesc').value = '';
    document.getElementById('caseTopic').value = '';
  } catch (error) {
    console.error(error);
    statusEl.innerHTML = '<span style="color:#e53e3e">Hata oluştu: ' + error.message + '</span>';
  }
};

// ==================== Case Sorgulama ====================
window.queryCases = async function() {
  const caseId = document.getElementById('queryCaseId').value.trim();
  const email = document.getElementById('queryEmail').value.trim();
  const container = document.getElementById('casesListContainer');
  const statusEl = document.getElementById('queryStatus');

  if (!caseId && !email) {
    statusEl.innerHTML = '<span style="color:#e53e3e">Lütfen Case ID veya E-posta girin.</span>';
    return;
  }

  try {
    let query = db.collection('cases');
    if (caseId) query = query.where('id', '==', caseId);
    else if (email) query = query.where('email', '==', email);
    const snapshot = await query.get();
    const cases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (cases.length === 0) {
      container.innerHTML = '<div class="status-badge-ent">Case bulunamadı.</div>';
      statusEl.innerHTML = '';
      return;
    }

    container.innerHTML = cases.map(c => `
      <div class="case-card" data-status="${c.status}">
        <div class="case-title">${escapeHtml(c.title)}</div>
        <div class="case-meta">ID: ${c.id.slice(-6)} • ${new Date(c.createdAt.toDate()).toLocaleString('tr')}</div>
        <div class="case-desc">${escapeHtml(c.description.substring(0, 120))}${c.description.length>120?'…':''}</div>
        <div><span class="badge-case badge-${c.status === 'beklemede' ? 'pend' : (c.status === 'sürüyor' ? 'prog' : (c.status === 'çözüldü' ? 'done' : 'rej'))}">${c.status}</span>
        <span class="badge-case ${c.priority === 'yüksek' ? 'badge-high' : (c.priority === 'orta' ? 'badge-med' : 'badge-low')}">${c.priority}</span></div>
        <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="viewCaseDetail('${c.id}')">Detay</button>
      </div>
    `).join('');
    statusEl.innerHTML = '';
  } catch (err) {
    statusEl.innerHTML = '<span style="color:#e53e3e">Sorgulama hatası: ' + err.message + '</span>';
  }
};

window.viewCaseDetail = async function(caseId) {
  const doc = await db.collection('cases').doc(caseId).get();
  if (!doc.exists) return;
  const c = doc.data();
  alert(`Case ID: ${c.id}\nBaşlık: ${c.title}\nAçıklama: ${c.description}\nDurum: ${c.status}\nÖncelik: ${c.priority}\nOluşturma: ${new Date(c.createdAt.toDate()).toLocaleString()}`);
};

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// Sayfa yüklenince konuları getir
document.addEventListener('DOMContentLoaded', () => {
  loadTopics();
});
