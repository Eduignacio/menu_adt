/* =========================
   SUPABASE
========================= */
const S_URL = "https://wljgbmgpjqvmaphrlwyh.supabase.co";
const S_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsamdibWdwanF2bWFwaHJsd3loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzA5NTAsImV4cCI6MjA4MTkwNjk1MH0.V4N_0vDA6ZYWfwNVoUH-QWuHMsElQENBDORs-aON8Cg";
const sb = window.supabase.createClient(S_URL, S_KEY);

let lastTypedUser = "";
let approveChannel = null;

/* =========================
   TEMA OSCURO / CLARO (🌙/☀️)
========================= */
const THEME_KEY = "menu_theme"; // dark | light
const htmlEl = document.documentElement;
const themeBtn = document.getElementById("themeToggleBtn");
const themeIcon = document.getElementById("themeIcon");
const themeLabel = document.getElementById("themeLabel");

function applyTheme(theme){
  const t = (theme === "light") ? "light" : "dark";
  htmlEl.setAttribute("data-theme", t);
  localStorage.setItem(THEME_KEY, t);
  // Emoji + etiqueta corta
  if(t === "light"){
    themeIcon.textContent = "☀️";
    themeLabel.textContent = "CL.";
  }else{
    themeIcon.textContent = "🌙";
    themeLabel.textContent = "OSC.";
  }
}

function toggleTheme(){
  const current = htmlEl.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}

(function initTheme(){
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(saved);
})();

/* =========================
   HELPERS
========================= */
function getToday(){
  const d = new Date();
  return d.getFullYear() + "-" +
         String(d.getMonth()+1).padStart(2,'0') + "-" +
         String(d.getDate()).padStart(2,'0');
}

function showErr(msg){
  loginErr.style.display = "block";
  loginErr.innerText = msg;
}

function hideErr(){
  loginErr.style.display = "none";
  loginErr.innerText = "";
}

function normUser(){
  return (viewerUser.value || "").trim().toUpperCase();
}

viewerUser.addEventListener('input', () => {
  lastTypedUser = normUser();
  reqBox.style.display = lastTypedUser ? "block" : "none";
  hideErr();
});

/* =========================
   SOLICITAR ACCESO (SIN LOGIN)
========================= */
async function requestAccess(){
  hideErr();

  const u = normUser();
  if(!u) return showErr("INGRESA USUARIO");

  await createAccessRequest(u, null);
  subscribeToApproval(u);

  showErr("SOLICITUD ENVIADA ✅ (PENDIENTE DE APROBACIÓN)");
}

/* =========================
   LOGIN VIEWER
========================= */
async function loginViewer(){
  hideErr();

  const u = normUser();
  if(!u) return showErr("INGRESA USUARIO");

  lastTypedUser = u;

  const { data, error } = await sb
    .from('viewer_users')
    .select('id, username, approved')
    .eq('username', u)
    .limit(1);

  if(error) return showErr("ERROR: " + error.message);

  // NO EXISTE -> genera solicitud y escucha aprobación
  if(!data || !data.length){
    reqBox.style.display = "block";
    await createAccessRequest(u, null);
    subscribeToApproval(u);
    return showErr("USUARIO NO REGISTRADO. SOLICITUD ENVIADA ✅ (PENDIENTE DE APROBACIÓN)");
  }

  const viewer = data[0];

  if(viewer.approved !== true){
    reqBox.style.display = "block";
    await createAccessRequest(u, viewer.id);
    subscribeToApproval(u);
    return showErr("ACCESO PENDIENTE DE APROBACIÓN ⏳");
  }

  // OK
  localStorage.setItem("viewer_user", viewer.username);
  localStorage.setItem("viewer_user_id", viewer.id);

  loginOverlay.style.display = "none";
  whoTxt.innerText = "USUARIO: " + viewer.username;

  loadMenusForDate(getToday());
}

async function createAccessRequest(username, viewerUserId=null){
  const { data: existing, error: exErr } = await sb
    .from('viewer_access_requests')
    .select('id, status')
    .eq('username', username)
    .eq('status', 'pending')
    .limit(1);

  if(exErr){ console.warn(exErr); return; }
  if(existing && existing.length) return;

  const payload = { username, status: 'pending' };
  if(viewerUserId) payload.viewer_user_id = viewerUserId;

  const { error } = await sb.from('viewer_access_requests').insert([payload]);
  if(error) console.warn(error);
}

function subscribeToApproval(username){
  try{
    if(approveChannel){
      sb.removeChannel(approveChannel);
      approveChannel = null;
    }
  }catch(_){}

  approveChannel = sb.channel('viewer-approval-' + username)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'viewer_users',
      filter: `username=eq.${username}`
    }, (payload) => {
      const row = payload?.new || {};
      if(row.approved === true){
        localStorage.setItem("viewer_user", row.username);
        localStorage.setItem("viewer_user_id", row.id);
        loginOverlay.style.display = "none";
        whoTxt.innerText = "USUARIO: " + row.username;
        loadMenusForDate(getToday());
      }
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'viewer_users',
      filter: `username=eq.${username}`
    }, (payload) => {
      const row = payload?.new || {};
      if(row.approved === true){
        localStorage.setItem("viewer_user", row.username);
        localStorage.setItem("viewer_user_id", row.id);
        loginOverlay.style.display = "none";
        whoTxt.innerText = "USUARIO: " + row.username;
        loadMenusForDate(getToday());
      }
    })
    .subscribe();
}

function checkViewerSession(){
  const u = localStorage.getItem("viewer_user");
  if(u){
    loginOverlay.style.display = "none";
    whoTxt.innerText = "USUARIO: " + u;
    loadMenusForDate(getToday());
  }
}

function logoutViewer(){
  localStorage.clear();
  location.reload();
}

/* =========================
   CARGA MENÚS DEL DÍA + COLAPSE
========================= */
async function loadMenusForDate(dateStr){
  menusGrid.innerHTML = "";

  const { data, error } = await sb
    .from('menus')
    .select('id, name, menu_date, menu_menu_items(menu_items(name, category, description))')
    .eq('menu_date', dateStr)
    .order('id', { ascending:true });

  if(error){
    menusGrid.innerHTML = `
      <div class="menu-card">
        <div class="items">
          <b>ERROR</b>
          <small>${error.message}</small>
        </div>
      </div>`;
    return;
  }

  const menus = data || [];

  if(!menus.length){
    menusGrid.innerHTML = `
      <div class="menu-card">
        <div class="menu-head" role="button" aria-expanded="false" tabindex="0">
          <div class="menu-title">
            <span class="chip">COLAPSADO</span>
            SIN MENÚ PUBLICADO
          </div>
          <div class="menu-date">${dateStr}</div>
        </div>
        <div class="items">
          <div class="item">
            <b>HOY NO HAY MENÚ</b>
            <small>CONSULTA MÁS TARDE</small>
          </div>
        </div>
      </div>`;
    // Activa el colapso en esta tarjeta también
    attachCollapseHandlers();
    return;
  }

  menusGrid.innerHTML = menus.map(m => {
    const items = (m.menu_menu_items || [])
      .map(rel => rel.menu_items)
      .filter(Boolean);

    const itemsHtml = items.length
      ? items.map(i => `
          <div class="item">
            <b>${(i.name||'').toUpperCase()}</b>
            <small>${(i.category||'').toUpperCase()}</small>
          </div>
        `).join('')
      : `<div class="item"><b>SIN PLATOS</b><small>MENÚ VACÍO</small></div>`;

    // Por defecto expandido (aria-expanded="true")
    return `
      <div class="menu-card" data-collapsible="true">
        <div class="menu-head" role="button" aria-expanded="true" tabindex="0">
          <div class="menu-title">
            <span class="chip">EXPANDIR / MINIMIZAR</span>
            ${(m.name||'MENÚ').toUpperCase()}
          </div>
          <div class="menu-date">${m.menu_date}</div>
        </div>
        <div class="items">${itemsHtml}</div>
      </div>`;
  }).join('');

  attachCollapseHandlers();
}

// Añade manejo de colapso/expandir a todas las tarjetas actuales
function attachCollapseHandlers(){
  const cards = document.querySelectorAll('.menu-card[data-collapsible="true"]');
  cards.forEach(card => {
    const head = card.querySelector('.menu-head');
    const chip = head.querySelector('.chip');

    function toggle(){
      const isCollapsed = card.classList.toggle('collapsed');
      head.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      if(chip) chip.textContent = isCollapsed ? 'EXPANDIR' : 'MINIMIZAR';
    }

    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        toggle();
      }
    });
  });
}

checkViewerSession();
