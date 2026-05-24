async function loadCommonData() {
  try {
    const res = await fetch('tools.json?' + Date.now());
    const data = await res.json();

    // Eğer Firebase zaten initialize edilmişse tekrar initialize etme
if (!firebase.apps.length) {
  const firebaseConfig = {
    apiKey: "AIzaSyBDClqNyqtNL_h8Yovoe2r9RFAs8VjNef8",
    authDomain: "case-management-system-53f44.firebaseapp.com",
    projectId: "case-management-system-53f44",
    storageBucket: "case-management-system-53f44.firebasestorage.app",
    messagingSenderId: "381220130397",
    appId: "1:381220130397:web:97124d8836681bc62c07b4"
  };
  firebase.initializeApp(firebaseConfig);
}
    
    // Copyright
    document.querySelectorAll('.copyright-text').forEach(el => {
      el.textContent = data.copyrightText || '© 2025 QA Portal. Tüm hakları saklıdır.';
    });
    
    // Admin paneli mi kontrol et (URL'de admin.html var veya body'de admin-panel id'si)
    const isAdminPage = window.location.pathname.includes('admin.html') || 
                        document.getElementById('adminPanel') !== null;
    
    // Bakım modu sadece admin paneli DEĞİLSE göster
    if (data.maintenance === true && !isAdminPage) {
      // Eski overlay varsa kaldır
      const oldMaint = document.getElementById('maintenance-overlay');
      if (oldMaint) oldMaint.remove();
      
      const overlay = document.createElement('div');
      overlay.id = 'maintenance-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;flex-direction:column;color:white;text-align:center;font-family:sans-serif;';
      overlay.innerHTML = `<div style="font-size:48px;margin-bottom:20px;">🔧</div><h2>Bakım Modu</h2><p>${data.maintenanceMessage || 'Portal şu anda bakımda. Lütfen daha sonra tekrar deneyin.'}</p>`;
      document.body.prepend(overlay);
      document.body.style.overflow = 'hidden';
    } else {
      // Bakım modu kapalıysa veya admin panelindeysek overlay'i kaldır
      const oldMaint = document.getElementById('maintenance-overlay');
      if (oldMaint) oldMaint.remove();
      document.body.style.overflow = '';
    }
    
    // Duyuru banner'ı (tüm sayfalarda gösterilebilir, istenirse aynı kontrol eklenebilir)
    const oldBanner = document.getElementById('announcement-banner');
    if (oldBanner) oldBanner.remove();
    document.body.style.marginTop = '0';
    
    if (data.announcement && data.announcement.active === true && data.announcement.text) {
      const banner = document.createElement('div');
      banner.id = 'announcement-banner';
      const colors = { info: '#2196f3', success: '#4caf50', warn: '#ff9800', danger: '#f44336' };
      banner.style.cssText = `position:fixed;top:0;left:0;width:100%;background:${colors[data.announcement.type] || '#2196f3'};color:white;padding:12px;text-align:center;z-index:9999;display:flex;justify-content:center;gap:16px;flex-wrap:wrap;`;
      banner.innerHTML = `<span>${data.announcement.text}</span><button id="closeAnnouncementBtn" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:4px 12px;border-radius:20px;cursor:pointer;">Kapat</button>`;
      document.body.prepend(banner);
      document.body.style.marginTop = '52px';
      document.getElementById('closeAnnouncementBtn')?.addEventListener('click', () => {
        banner.remove();
        document.body.style.marginTop = '0';
      });
    }
  } catch(e) { console.warn('common veri yüklenemedi', e); }
}

document.addEventListener('DOMContentLoaded', loadCommonData);
