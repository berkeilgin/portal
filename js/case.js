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

// ==================== GLOBAL STATE ====================
let currentUser = null;

// ==================== TABS ====================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(tabId + 'Tab').classList.add('active');
  });
});

// ==================== TOPICS ====================
async function loadTopics() {
  const snapshot = await db.collection('topics').where('active', '==', true).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function populateTopics() {
  const topics = await loadTopics();
  const select = document.getElementById('caseTopic');
  if (topics.length === 0) {
    select.innerHTML = '<option value="">— Konu bulunamadı —</option>';
  } else {
    select.innerHTML = '<option value="">— Konu Seçin —</option>' + 
      topics.map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
  }
}

async function ensureDefaultTopics() {
  const snapshot = await db.collection('topics').limit(1).get();
  if (snapshot.empty) {
    const defaultTopics = [
      { title: 'Teknik Destek', description: 'Yazılım, donanım, ağ sorunları', active: true, responsibleEmail: '', createdAt: new Date() },
      { title: 'Şikayet', description: 'Hizmet veya ürün şikayetleri', active: true, responsibleEmail: '', createdAt: new Date() },
      { title: 'Öneri', description: 'Geliştirme önerileri', active: true, responsibleEmail: '', createdAt: new Date() },
      { title: 'Bilgi Talebi', description: 'Ürün veya hizmet hakkında bilgi', active: true, responsibleEmail: '', createdAt: new Date() }
    ];
    for (const topic of defaultTopics) {
      await db.collection('topics').add(topic);
    }
  }
  populateTopics();
}

// ==================== MAIL SETTINGS ====================
function loadMailSettings() {
  return JSON.parse(localStorage.getItem('case_mail_settings') || '{}');
}

async function sendEmail(to, subject, body) {
  if (typeof window.Email === 'undefined') {
    console.error('SMTP.js yüklenemedi!');
    return false;
  }
  const s = loadMailSettings();
  if (!s.smtpEmail || !s.smtpPassword) {
    console.warn('SMTP ayarları yapılandırılmamış');
    return false;
  }
  try {
    await window.Email.send({
      Host: "smtp.gmail.com",
      Port: 587,
      Username: s.smtpEmail,
      Password: s.smtpPassword,
      To: to,
      From: s.smtpEmail,
      Subject: subject,
      Body: body,
      Secure: true
    });
    return true;
  } catch (e) {
    console.error('Mail hatası:', e);
    return false;
  }
}

// ==================== CREATE CASE ====================
async function createCase() {
  const fullname = document.getElementById('userFullname').value.trim();
  const email = document.getElementById('userEmail').value.trim();
  const topicId = document.getElementById('caseTopic').value;
  const title = document.getElementById('caseTitle').value.trim();
  const desc = document.getElementById('caseDesc').value.trim();
  const priority = document.getElementById('casePriority').value;
  const statusEl = document.getElementById('createStatus');

  if (!fullname || !email || !topicId || !title || !desc) {
    showStatus(statusEl, 'Lütfen tüm zorunlu alanları doldurun.', 'err');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showStatus(statusEl, 'Geçerli bir e-posta adresi girin.', 'err');
    return;
  }

  try {
    const caseData = {
      fullname, email, topicId, title,
      description: desc, priority, status: 'beklemede',
      createdAt: new Date(), updatedAt: new Date(), notes: []
    };
    const docRef = await db.collection('cases').add(caseData);
    const caseId = docRef.id;
    const shortId = caseId.slice(-6);

    // Kullanıcıya mail
    await sendEmail(email, `Case #${shortId} başarıyla oluşturuldu`,
      `Merhaba ${fullname},<br><br>Case #${shortId} (${caseId}) başarıyla alınmıştır.<br><br>Başlık: ${title}<br>Açıklama: ${desc}<br>Durum: Beklemede<br><br>Case ID: ${caseId}`);

    // Sorumlu kişiye mail
    const topicDoc = await db.collection('topics').doc(topicId).get();
    const responsibleEmail = topicDoc.exists ? topicDoc.data().responsibleEmail : null;
    if (responsibleEmail && responsibleEmail.trim()) {
      await sendEmail(responsibleEmail, `🔔 İlgilenmeniz Gereken Case Var - #${shortId}`,
        `Merhaba,<br><br>Yeni bir case oluşturuldu.<br><br><strong>Case ID:</strong> ${caseId}<br><strong>Başlık:</strong> ${title}<br><strong>Açıklama:</strong> ${desc}<br><strong>Kullanıcı:</strong> ${fullname} (${email})<br><strong>Öncelik:</strong> ${priority}`);
    }

    // Formu temizle
    document.getElementById('userFullname').value = '';
    document.getElementById('userEmail').value = '';
    document.getElementById('caseTitle').value = '';
    document.getElementById('caseDesc').value = '';
    document.getElementById('caseTopic').value = '';
    document.getElementById('casePriority').value = 'orta';

    showStatus(statusEl, `✅ Case #${shortId} başarıyla oluşturuldu. Onay maili gönderildi.`, 'ok');
    alert(`✅ Case #${shortId} oluşturuldu. Case ID: ${caseId}`);
  } catch (error) {
    console.error(error);
    showStatus(statusEl, '❌ Bir hata oluştu.', 'err');
  }
}

// ==================== QUERY CASES ====================
async function queryCases() {
  const caseId = document.getElementById('queryCaseId').value.trim();
  const email = document.getElementById('queryEmail').value.trim();
  const statusEl = document.getElementById('queryStatus');
  const container = document.getElementById('casesListContainer');

  if (!caseId && !email) {
    showStatus(statusEl, 'Lütfen Case ID veya E-posta adresi girin.', 'err');
    container.innerHTML = '';
    return;
  }

  try {
    let cases = [];
    if (caseId) {
      const doc = await db.collection('cases').doc(caseId).get();
      if (doc.exists) cases = [{ id: doc.id, ...doc.data() }];
    } else if (email) {
      const snapshot = await db.collection('cases').where('email', '==', email).orderBy('createdAt', 'desc').get();
      cases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    const topics = await loadTopics();
    const topicMap = Object.fromEntries(topics.map(t => [t.id, t]));

    container.innerHTML = '';
    if (cases.length === 0) {
      showStatus(statusEl, 'Kayıtlı case bulunamadı.', 'err');
      return;
    }

    showStatus(statusEl, `✅ ${cases.length} case bulundu.`, 'ok');
    container.innerHTML = cases.map(c => {
      const topic = topicMap[c.topicId];
      const shortId = c.id.slice(-6);
      const statusClass = {
        beklemede: 'badge-pend', sürüyor: 'badge-prog',
        çözüldü: 'badge-done', reddedildi: 'badge-rej'
      }[c.status] || 'badge-rej';
      const priorityClass = {
        yüksek: 'badge-high', orta: 'badge-med', düşük: 'badge-low'
      }[c.priority] || 'badge-med';
      return `
        <div class="case-card" data-status="${c.status}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
            <div class="case-title">#${shortId} — ${escapeHtml(c.title)}</div>
            <span class="badge-case ${statusClass}">${c.status}</span>
          </div>
          <div class="case-meta">${topic ? escapeHtml(topic.title) : '-'} · ${new Date(c.createdAt.toDate()).toLocaleDateString('tr')}</div>
          <div class="case-desc">${escapeHtml(c.description.substring(0, 100))}${c.description.length > 100 ? '…' : ''}</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="badge-case ${priorityClass}">${c.priority}</span>
            <button class="btn btn-ghost btn-sm" onclick="copyToClipboard('${c.id}', 'Case ID kopyalandı')">📋 Kopyala</button>
            <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="viewDetail('${c.id}')">Detay →</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error(error);
    if (error.message.includes('index')) {
      showStatus(statusEl, 'İndeks hatası: Konsoldaki linke tıklayarak indeksi oluşturun.', 'err');
      alert('Firestore indeksi gerekiyor. Konsoldaki linke tıklayarak oluşturun.');
    } else {
      showStatus(statusEl, 'Bir hata oluştu: ' + error.message, 'err');
    }
  }
}

// ==================== DETAIL MODAL ====================
async function viewDetail(caseId) {
  const doc = await db.collection('cases').doc(caseId).get();
  if (!doc.exists) return;
  const c = { id: doc.id, ...doc.data() };
  const topics = await loadTopics();
  const topic = topics.find(t => t.id === c.topicId);
  const statusClass = {
    beklemede: 'badge-pend', sürüyor: 'badge-prog',
    çözüldü: 'badge-done', reddedildi: 'badge-rej'
  }[c.status] || 'badge-rej';

  const notesHtml = c.notes && c.notes.length
    ? c.notes.map(n => `
      <div class="note-item">
        <div class="note-meta">${new Date(n.createdAt.toDate()).toLocaleString('tr')} · ${escapeHtml(n.createdBy)}</div>
        ${escapeHtml(n.text)}
      </div>
    `).join('')
    : '<div class="note-item">Henüz not yok.</div>';

  document.getElementById('detailContent').innerHTML = `
    <div class="form-group"><strong>Case ID</strong><br>${c.id} <button class="btn btn-ghost btn-sm" onclick="copyToClipboard('${c.id}','ID kopyalandı')">📋 Kopyala</button></div>
    <div class="form-group"><strong>Durum</strong><br><span class="badge-case ${statusClass}">${c.status}</span></div>
    <div class="form-group"><strong>Kullanıcı</strong><br>${escapeHtml(c.fullname)} (${c.email})</div>
    <div class="form-group"><strong>Konu</strong><br>${topic ? escapeHtml(topic.title) : '-'}</div>
    <div class="form-group"><strong>Başlık</strong><br>${escapeHtml(c.title)}</div>
    <div class="form-group"><strong>Açıklama</strong><br>${escapeHtml(c.description)}</div>
    <div class="form-group"><strong>Öncelik</strong><br>${c.priority}</div>
    <div class="form-group"><strong>Oluşturma</strong><br>${new Date(c.createdAt.toDate()).toLocaleString('tr')}</div>
    <div class="form-group"><strong>Son Güncelleme</strong><br>${new Date(c.updatedAt.toDate()).toLocaleString('tr')}</div>
    ${c.resolutionTime ? `<div class="form-group"><strong>Çözüm Süresi</strong><br>${c.resolutionTime} gün</div>` : ''}
    <div style="margin-top:16px"><strong>📝 Not Geçmişi</strong>${notesHtml}</div>
  `;
  openModal('detailModal');
}

// ==================== UTILITIES ====================
function showStatus(el, msg, type) {
  el.textContent = msg;
  el.className = 'status-bar ' + (type === 'ok' ? 'ok' : type === 'err' ? 'err' : '');
}
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}
function copyToClipboard(text, successMsg) {
  navigator.clipboard.writeText(text).then(() => {
    const toast = document.createElement('div');
    toast.textContent = successMsg || '✅ Kopyalandı';
    toast.style.cssText = 'position:fixed; bottom:20px; right:20px; background:var(--accent2); color:#fff; padding:8px 16px; border-radius:20px; font-size:12px; z-index:9999;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }).catch(err => console.error('Kopyalama hatası:', err));
}
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async () => {
  await ensureDefaultTopics();
});