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
    
    // Son 7 gün trendi için modern bar chart (CSS grid + flex)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0,0,0,0);
      last7Days.push(d);
    }
    const trend = last7Days.map(day => {
      const count = cases.filter(c => {
        const created = c.createdAt?.toDate();
        if (!created) return false;
        const d = new Date(created);
        d.setHours(0,0,0,0);
        return d.getTime() === day.getTime();
      }).length;
      return { date: day.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' }), count };
    });
    const maxCount = Math.max(...trend.map(t => t.count), 1);
    
    const trendHtml = `
      <div style="display: flex; gap: 12px; align-items: flex-end; justify-content: center; height: 180px; padding: 16px 0;">
        ${trend.map(t => `
          <div style="flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center;">
            <div style="flex:1; display: flex; align-items: flex-end; width: 100%;">
              <div style="width: 100%; background: linear-gradient(180deg, var(--accent2), var(--accent)); border-radius: 8px 8px 0 0; transition: height 0.3s; height: ${(t.count / maxCount) * 140}px; min-height: 4px;"></div>
            </div>
            <div style="margin-top: 8px; font-size: 11px; color: var(--muted);">${t.date}</div>
            <div style="font-size: 13px; font-weight: bold; color: var(--accent2);">${t.count}</div>
          </div>
        `).join('')}
      </div>
    `;
    
    // Durum dağılımı için pasta benzeri kartlar
    const statusDistribution = `
      <div class="stats-grid" style="grid-template-columns: repeat(4,1fr); margin-top: 16px;">
        <div class="stat-card" style="background: rgba(156,39,176,0.1);"><div class="number" style="color:#ce93d8;">${pending}</div><div>Beklemede</div></div>
        <div class="stat-card" style="background: rgba(255,152,0,0.1);"><div class="number" style="color:#ffb74d;">${inProgress}</div><div>Sürüyor</div></div>
        <div class="stat-card" style="background: rgba(76,175,80,0.1);"><div class="number" style="color:#81c784;">${resolved}</div><div>Çözüldü</div></div>
        <div class="stat-card" style="background: rgba(158,158,158,0.1);"><div class="number" style="color:#bdbdbd;">${rejected}</div><div>Reddedildi</div></div>
      </div>
    `;
    
    detailsContainer.innerHTML = `
      <div class="panel">
        <h3>📈 Son 7 Günlük Case Trendi</h3>
        ${trendHtml}
      </div>
      <div class="panel">
        <h3>📊 Durum Dağılımı</h3>
        ${statusDistribution}
      </div>
    `;
  } catch (err) {
    console.error(err);
    cardsContainer.innerHTML = '<div class="status-bar err">Case verileri yüklenemedi: ' + err.message + '</div>';
  }
}
