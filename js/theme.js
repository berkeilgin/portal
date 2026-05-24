const DEFAULT_THEME = 'grey';
let themeButtonsRendered = false;

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

function initTheme() {
  const saved = localStorage.getItem('qa_theme');
  const theme = (saved && ['dark','light','tp','grey'].includes(saved)) ? saved : DEFAULT_THEME;
  setTheme(theme, false);
}

function renderThemeButtons(containerSelector = '.theme-switch') {
  // Eğer butonlar zaten render edilmişse tekrar yapma
  if (themeButtonsRendered) return;
  
  const container = document.querySelector(containerSelector);
  if (!container) return;
  
  // Container'da zaten buton var mı kontrol et
  if (container.children.length > 0) {
    themeButtonsRendered = true;
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
  
  themeButtonsRendered = true;
}

// Sayfa yüklendiğinde tema başlat
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  renderThemeButtons();
});
