let commonData = null;
let copyrightText = '© 2025 QA Portal. Tüm hakları saklıdır.';

async function loadCommonData() {
  try {
    const res = await fetch('tools.json?' + Date.now());
    const data = await res.json();
    commonData = data;
    if (data.copyrightText) copyrightText = data.copyrightText;
    document.querySelectorAll('.copyright-text').forEach(el => {
      el.textContent = copyrightText;
    });
    
    // ========== BAKIM MODU KONTROLÜ ==========
    if (data.maintenance === true) {
      const maintDiv = document.createElement('div');
      maintDiv.id = 'maintenance-overlay';
      maintDiv.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.95); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        flex-direction: column; color: white; text-align: center;
        font-family: 'DM Sans', sans-serif;
      `;
      maintDiv.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 20px;">🔧</div>
        <h1 style="font-size: 24px; margin-bottom: 10px;">Bakım Modu</h1>
        <p style="font-size: 14px; max-width: 400px;">${data.maintenanceMessage || 'Portal şu anda bakımda. Lütfen daha sonra tekrar deneyin.'}</p>
      `;
      document.body.prepend(maintDiv);
      document.body.style.overflow = 'hidden';
    }
    
    // ========== DUYURU BANNER ==========
    if (data.announcement && data.announcement.active && data.announcement.text) {
      const annDiv = document.createElement('div');
      annDiv.id = 'announcement-banner';
      const typeColors = {
        info: '#2196f3', success: '#4caf50', warn: '#ff9800', danger: '#f44336'
      };
      annDiv.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%;
        background: ${typeColors[data.announcement.type] || '#2196f3'};
        color: white; text-align: center; padding: 12px;
        font-size: 14px; font-weight: 500; z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        gap: 16px; flex-wrap: wrap;
      `;
      annDiv.innerHTML = `
        <span>${data.announcement.text}</span>
        <button id="closeAnnouncement" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 12px; border-radius: 20px; cursor: pointer;">Kapat</button>
      `;
      document.body.prepend(annDiv);
      document.body.style.marginTop = '52px';
      document.getElementById('closeAnnouncement')?.addEventListener('click', () => {
        annDiv.remove();
        document.body.style.marginTop = '0';
      });
    }
  } catch(e) { console.warn('common veri yüklenemedi', e); }
}

document.addEventListener('DOMContentLoaded', () => {
  loadCommonData();
});
