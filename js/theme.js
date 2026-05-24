const DEFAULT_THEME = 'grey';

if (typeof window.__themeRendered === 'undefined') {
  window.__themeRendered = false;
}

function setTheme(theme, save = true) {
  document.body.classList.remove('dark', 'light', 'tp', 'grey');
  document.body.classList.add(theme);
  if (save) localStorage.setItem('qa_theme', theme);
  updateActiveButtons(theme);
}

function getCurrentTheme() {
  if (document.body.classList.contains('dark')) return 'dark';
  if (document.body.classList.contains('light')) return 'light';
  if (document.body.classList.contains('tp')) return 'tp';
  return 'grey';
}

function updateActiveButtons(activeTheme) {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === activeTheme);
  });
}

function renderThemeButtons() {
  if (window.__themeRendered) return;
  
  // Önce ID'li konteynırı dene, yoksa class'lıyı kullan
  let container = document.querySelector('#themeSwitchContainer');
  if (!container) container = document.querySelector('.theme-switch');
  if (!container) return;
  
  // Zaten buton varsa sadece aktiflik güncelle
  if (container.children.length > 0) {
    window.__themeRendered = true;
    updateActiveButtons(getCurrentTheme());
    return;
  }
  
  const themes = [
    { id: 'grey', label: 'Gri', icon: '🌓' },
    { id: 'dark', label: 'Siyah', icon: '🌑' },
    { id: 'light', label: 'Beyaz', icon: '☀️' },
    { id: 'tp', label: 'TP', icon: '✦' }
  ];
  
  container.innerHTML = themes.map(t => `
    <button class="theme-btn ${getCurrentTheme() === t.id ? 'active' : ''}" data-theme="${t.id}">
      ${t.icon} ${t.label}
    </button>
  `).join('');
  
  container.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });
  
  window.__themeRendered = true;
}

document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('qa_theme');
  const theme = (saved && ['dark','light','tp','grey'].includes(saved)) ? saved : DEFAULT_THEME;
  document.body.classList.add(theme);
  renderThemeButtons();
});
