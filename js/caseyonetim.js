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
  
  // Profesyonel modal içeriği
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
