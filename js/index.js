// UTF-8 safe
function b64Dec(s){ return decodeURIComponent(escape(atob(s.replace(/\n/g,'')))); }

let DATA = null;
let activeFilter = 'all';
let LANG = localStorage.getItem('qa_lang') || 'tr';
let currentUser = null; // session bilgisi yoksa null

const STRINGS = {
  tr: {
    menu: 'Menü',
    dashboard: 'Dashboard',
    favTitle: '⭐ Favoriler',
    favClear: 'Temizle',
    recentTitle: '🕐 Son Kullanılan',
    loading: 'Portal yükleniyor…',
    disabled: 'Bu araç şu anda devre dışı.',
  },
  en: {
    menu: 'Menu',
    dashboard: 'Dashboard',
    favTitle: '⭐ Favorites',
    favClear: 'Clear',
    recentTitle: '🕐 Recently Used',
    loading: 'Loading portal…',
    disabled: 'This tool is currently disabled.',
  }
};

function applyLang() {
  const s = STRINGS[LANG];
  document.querySelector('.nav-label').textContent = s.menu;
  const dash = document.querySelector('.nav a[data-cat="all"]');
  if (dash) dash.innerHTML = '<span class="nav-icon">⊞</span> ' + s.dashboard;
  const favH4 = document.querySelector('#favList')?.closest('.sb-sec')?.querySelector('h4');
  if (favH4) favH4.textContent = s.favTitle;
  const clearBtn = document.getElementById('clearFavBtn');
  if (clearBtn) clearBtn.textContent = s.favClear;
  const recH4 = document.querySelector('#recentList')?.closest('.sb-sec')?.querySelector('h4');
  if (recH4) recH4.textContent = s.recentTitle;
  const loadTxt = document.querySelector('.load-txt');
  if (loadTxt) loadTxt.textContent = s.loading;
  const isEN = LANG === 'en';
  document.getElementById('langFlag').src = isEN ? 'logos/en.png' : 'logos/tr.png';
  document.getElementById('langLabel').textContent = LANG.toUpperCase();
  document.getElementById('langOther').textContent = isEN ? 'TR' : 'EN';
}

function trackOpen(id){
  const s = JSON.parse(localStorage.getItem('qa_stats')||'{}');
  s[id] = (s[id]||0)+1;
  localStorage.setItem('qa_stats', JSON.stringify(s));
}

function showToast(msg, type='info'){
  let wrap=document.getElementById('toastWrap');
  if(!wrap){wrap=document.createElement('div');wrap.id='toastWrap';
    Object.assign(wrap.style,{position:'fixed',bottom:'24px',right:'24px',display:'flex',flexDirection:'column',gap:'8px',zIndex:'1000'});
    document.body.appendChild(wrap);}
  const t=document.createElement('div');
  const colors={info:'var(--accent)',warn:'#ffd60a',error:'#ff4d6d',success:'#22c55e'};
  Object.assign(t.style,{background:'var(--surface)',border:`1px solid var(--border)`,borderLeft:`3px solid ${colors[type]||colors.info}`,borderRadius:'10px',padding:'11px 16px',fontSize:'13px',fontFamily:'var(--font)',color:'var(--text)',animation:'slideIn .25s ease'});
  t.textContent=msg;
  wrap.appendChild(t);
  setTimeout(()=>t.remove(),3500);
}

async function loadData(){
  try{
    const r = await fetch('tools.json?'+Date.now(),{cache:'no-store'});
    if(!r.ok) throw new Error(r.statusText);
    const j = await r.json();
    DATA = j;
    applyMaintenance();
    applyAnnouncement();
    buildNav();
    render();
    applyLang();
    hideLoading();
  }catch(e){
    document.querySelector('.load-txt').textContent='Veri yüklenemedi — sayfayı yenileyin.';
  }
}

function hideLoading(){
  const el = document.getElementById('loadingScreen');
  el.classList.add('hide');
  setTimeout(()=>el.remove(), 500);
}

setInterval(async()=>{
  try{
    const r = await fetch('tools.json?'+Date.now(),{cache:'no-store'});
    if(!r.ok) return;
    const fresh = await r.json();
    if(JSON.stringify(fresh)!==JSON.stringify(DATA)){
      DATA=fresh;
      applyMaintenance();
      applyAnnouncement();
      buildNav();
      render();
    }
  }catch(_){}
}, 30000);

function applyMaintenance(){
  const o = document.getElementById('maintOverlay');
  if(DATA?.maintenance){
    o.style.display='flex';
    document.getElementById('maintMsg').textContent = DATA.maintenanceMessage||'Portal şu anda bakımda.';
  }else{
    o.style.display='none';
  }
}

function applyAnnouncement(){
  const bar = document.getElementById('announceBar');
  const ann = DATA?.announcement;
  const dismissed = sessionStorage.getItem('ann_dismissed');
  if(ann?.active && !dismissed){
    document.getElementById('announceText').textContent = ann.text||'';
    bar.className = `announce ${ann.type||'info'}`;
    document.getElementById('mainEl').classList.add('has-announce');
  }else{
    bar.className = 'announce hide';
    document.getElementById('mainEl').classList.remove('has-announce');
  }
}
document.getElementById('announceClose')?.addEventListener('click',()=>{
  sessionStorage.setItem('ann_dismissed','1');
  document.getElementById('announceBar').classList.add('hide');
  document.getElementById('mainEl').classList.remove('has-announce');
});

function buildNav(){
  const nav = document.getElementById('nav');
  nav.querySelectorAll('.dyn').forEach(e=>e.remove());
  (DATA.categories||[]).forEach(cat=>{
    const a = document.createElement('a');
    a.className='dyn';
    a.dataset.cat=cat.id;
    a.onclick=()=>filterCat(cat.id,a);
    a.innerHTML=`<span class="nav-icon">${cat.icon||'▪'}</span> ${cat.label}`;
    nav.appendChild(a);
  });
}

function filterCat(id, el){
  activeFilter=id;
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.cat-section').forEach(s=>{
    s.style.display=(id==='all'||s.dataset.cat===id)?'':'none';
  });
}

function render(){
  const app=document.getElementById('app');
  app.innerHTML='';
  (DATA.categories||[]).forEach((cat,i)=>{
    const tools=(DATA.tools||[]).filter(t=>t.cat===cat.id);
    if(!tools.length) return;
    const sec=document.createElement('div');
    sec.className='cat-section';
    sec.dataset.cat=cat.id;
    sec.style.animationDelay=`${i*.07}s`;
    if(activeFilter!=='all'&&activeFilter!==cat.id) sec.style.display='none';
    sec.innerHTML=`
      <div class="cat-header">
        <div class="cat-title">${cat.icon||''} ${cat.label}</div>
        <div class="cat-line"></div>
        <div class="cat-count">${tools.length}</div>
      </div>
      <div class="grid">${tools.map(cardHTML).join('')}</div>`;
    app.appendChild(sec);
  });
  updateFav();
  updateRecent();
}

function cardHTML(t){
  const isFav=getFav().includes(t.id);
  const disabled=t.isEnabled===false;
  let ribbon='', cls='';
  if(t.isBest)      {ribbon='<div class="ribbon r-best">BEST</div>'; cls='is-best';}
  else if(t.isNew)  {ribbon='<div class="ribbon r-new">NEW</div>';   cls='is-new';}
  else if(t.isTest) {ribbon='<div class="ribbon r-test">TEST</div>';}
  if(disabled) cls+=' disabled';

  return `
  <div class="card ${cls}" data-id="${t.id}" data-enabled="${!disabled}">
    ${ribbon}
    <img class="card-icon" src="logos/${t.icon}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><text y=%2224%22 font-size=%2224%22>🔗</text></svg>'">
    <div class="card-name">${t.name}</div>
    <button class="fav-btn ${isFav?'on':''}" data-fav="${t.id}">
      ${isFav?'★ Favoride':'☆ Favori'}
    </button>
  </div>`;
}

document.getElementById('app').addEventListener('click', e=>{
  const favBtn = e.target.closest('[data-fav]');
  if(favBtn){
    e.stopPropagation();
    toggleFav(favBtn.dataset.fav, favBtn);
    return;
  }
  const card = e.target.closest('.card[data-id]');
  if(card && card.dataset.enabled!=='false'){
    openTool(card.dataset.id);
  }else if(card && card.dataset.enabled==='false'){
    showToast(STRINGS[LANG].disabled,'warn');
  }
});

document.getElementById('clearFavBtn')?.addEventListener('click',()=>{
  localStorage.removeItem('fav');
  render();
});

function openTool(id){
  const t=(DATA.tools||[]).find(x=>x.id===id);
  if(!t) return;
  trackOpen(id);
  let r=JSON.parse(localStorage.getItem('recent')||'[]');
  r=[id,...r.filter(x=>x!==id)].slice(0,5);
  localStorage.setItem('recent',JSON.stringify(r));
  updateRecent();
  t.url.endsWith('.html')?(window.location.href=t.url):window.open(t.url,'_blank');
}

function getFav(){return JSON.parse(localStorage.getItem('fav')||'[]');}

function toggleFav(id, btn){
  let fav=getFav();
  const add=!fav.includes(id);
  if(add) fav.push(id);
  else    fav=fav.filter(x=>x!==id);
  localStorage.setItem('fav',JSON.stringify(fav));
  btn.classList.toggle('on',add);
  btn.textContent=add?'★ Favoride':'☆ Favori';
  btn.classList.add('pop');
  setTimeout(()=>btn.classList.remove('pop'),300);
  updateFav();
}

function updateFav(){
  const tools=DATA?.tools||[];
  document.getElementById('favList').innerHTML=getFav().map(id=>{
    const t=tools.find(x=>x.id===id);
    return t?`<div class="sb-item" data-open="${t.id}">
      <img src="logos/${t.icon}" onerror="this.style.display='none'">${t.name}</div>`:'';
  }).join('');
  document.querySelectorAll('#favList [data-open]').forEach(el=>{
    el.addEventListener('click',()=>openTool(el.dataset.open));
  });
}

function updateRecent(){
  const tools=DATA?.tools||[];
  document.getElementById('recentList').innerHTML=
    JSON.parse(localStorage.getItem('recent')||'[]').map(id=>{
      const t=tools.find(x=>x.id===id);
      return t?`<div class="sb-item" data-open="${t.id}">
        <img src="logos/${t.icon}" onerror="this.style.display='none'">${t.name}</div>`:'';
    }).join('');
  document.querySelectorAll('#recentList [data-open]').forEach(el=>{
    el.addEventListener('click',()=>openTool(el.dataset.open));
  });
}

document.getElementById('langBtn')?.addEventListener('click', () => {
  LANG = LANG === 'tr' ? 'en' : 'tr';
  localStorage.setItem('qa_lang', LANG);
  applyLang();
  if (DATA) { updateFav(); updateRecent(); }
});

loadData();