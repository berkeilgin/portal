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
  } catch(e) { console.warn('copyright yüklenemedi', e); }
}

document.addEventListener('DOMContentLoaded', () => {
  loadCommonData();
});