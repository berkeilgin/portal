const DEFAULT_THEME = 'grey';

function setTheme(theme, save = true) {
  document.body.classList.remove('dark', 'light', 'tp', 'grey');
  document.body.classList.add(theme);
  if (save) localStorage.setItem('qa_theme', theme);
  updateThemeButtons(theme);
}

function getCurrentTheme() {
  if (document.body.classList.contains('dark')) return 'dark';
  if (document.body.classList.contains('light')) return 'light';
  if (document.body.classList.contains('tp')) return 'tp';
  return 'grey';
}

function updateThemeButtons(activeTheme) {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    const theme = btn.dataset.theme;
    btn.classList.toggle('active', theme === activeTheme);
  });
}

function renderThemeButtons(containerSelector = '.theme-switch') {
  // Daha önce render edilmiş mi kontrol et (global değişken)
  if (window.__themeButtonsRendered) return;
  
  const container = document.querySelector(containerSelector);
  if (!container) return;
  
  // Container'da zaten buton var mı?
  if (container.children.length > 0) {
    // Zaten butonlar varsa sadece aktiflikleri güncelle
    window.__themeButtonsRendered = true;
    updateThemeButtons(getCurrentTheme());
    return;
  }
  
  const themes = [
    { id: 'grey', label: '🌓 Gri', icon: '🌓' },
    { id: 'dark', label: '🌑 Siyah', icon: '🌑' },
    { id: 'light', label: '☀️ Beyaz', icon: '☀️' },
    { id: 'tp', label: '✦ TP', icon: '✦' }
  ];
  
  container.innerHTML = themes.map(t => `
    <button class="theme-btn ${getCurrentTheme() === t.id ? 'active' : ''}" data-theme="${t.id}">
      ${t.icon} ${t.label}
    </button>
  `).join('');
  
  container.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });
  
  window.__themeButtonsRendered = true;
}

// Sayfa yüklendiğinde tema başlat (sadece bir kez)
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('qa_theme');
  const theme = (saved && ['dark','light','tp','grey'].includes(saved)) ? saved : DEFAULT_THEME;
  document.body.classList.add(theme);
  renderThemeButtons();
});
