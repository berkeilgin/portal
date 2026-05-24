async function loadCommonData() {
  try {
    const res = await fetch('tools.json?' + Date.now());
    const data = await res.json();
    // Copyright
    document.querySelectorAll('.copyright-text').forEach(el => {
      el.textContent = data.copyrightText || '© 2025 QA Portal. Tüm hakları saklıdır.';
    });
    // Bakım modu
    if (data.maintenance === true) {
      const div = document.createElement('div');
      div.id = 'maintenance-overlay';
      div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;flex-direction:column;color:white;text-align:center;';
      div.innerHTML = `<div style="font-size:48px;margin-bottom:20px;">🔧</div><h2>Bakım Modu</h2><p>${data.maintenanceMessage || 'Portal şu anda bakımda.'}</p>`;
      document.body.prepend(div);
      document.body.style.overflow = 'hidden';
    }
    // Duyuru banner
    if (data.announcement?.active && data.announcement.text) {
      const banner = document.createElement('div');
      const colors = { info: '#2196f3', success: '#4caf50', warn: '#ff9800', danger: '#f44336' };
      banner.style.cssText = `position:fixed;top:0;left:0;width:100%;background:${colors[data.announcement.type] || '#2196f3'};color:white;padding:12px;text-align:center;z-index:9999;display:flex;justify-content:center;gap:16px;align-items:center;`;
      banner.innerHTML = `<span>${data.announcement.text}</span><button id="closeAnnouncement" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:4px 12px;border-radius:20px;cursor:pointer;">Kapat</button>`;
      document.body.prepend(banner);
      document.body.style.marginTop = '52px';
      document.getElementById('closeAnnouncement')?.addEventListener('click', () => {
        banner.remove();
        document.body.style.marginTop = '0';
      });
    }
  } catch(e) { console.warn('common veri yüklenemedi', e); }
}

document.addEventListener('DOMContentLoaded', () => {
  loadCommonData();
});
