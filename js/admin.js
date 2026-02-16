const S_URL = "https://wljgbmgpjqvmaphrlwyh.supabase.co";
const S_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsamdibWdwanF2bWFwaHJsd3loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzA5NTAsImV4cCI6MjA4MTkwNjk1MH0.V4N_0vDA6ZYWfwNVoUH-QWuHMsElQENBDORs-aON8Cg";
const sb = window.supabase.createClient(S_URL, S_KEY);

let userPermissions = { cat: false, usr: false, idx: false };
let menuDraft = [];
let editingMenuId = null;
let catalogCache = [];
let usersCache = [];
let historyCache = []; // Was implicit in loadHistory, making it explicit global

async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    const email = session.user.email.toLowerCase();
    userBadge.innerText = email;

    // Hardcoded super admins
    if (email === "eduardoignacio.g.h@gmail.com" || email === "gzrojas.mi@gmail.com") {
      userPermissions.cat = true;
      userPermissions.usr = true;
      userPermissions.idx = true;
    }

    const { data: dbUser } = await sb.from('user_permissions').select('*').eq('email', email).maybeSingle();
    if (dbUser) {
      userPermissions.cat = dbUser.can_manage_catalog || userPermissions.cat;
      userPermissions.usr = dbUser.can_manage_users || userPermissions.usr;
      userPermissions.idx = dbUser.can_access_index || userPermissions.idx;
    }

    loginOverlay.classList.add('hidden');
    if (userPermissions.cat) navC.classList.remove('hidden');
    if (userPermissions.usr) navU.classList.remove('hidden');

    loadCatalog();
    getStats();
  }
}

async function handleLogin() {
  const { error } = await sb.auth.signInWithPassword({
    email: lEmail.value.trim().toLowerCase(),
    password: lPass.value
  });
  if (error) {
    loginErr.innerText = "ERROR";
    loginErr.style.display = "block";
  } else {
    location.reload();
  }
}

function handleLogout() {
  sb.auth.signOut();
  localStorage.clear();
  location.reload();
}

async function getStats() {
  const { data } = await sb.from('visitor_stats').select('count').eq('id', 1).maybeSingle();
  if (data) vCount.innerText = data.count;
}

function switchView(viewName) {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.view-port .container > div').forEach(div => div.classList.add('hidden'));
  pickerSection.classList.toggle('hidden', viewName !== 'builder');

  const btnMap = { builder: 'navB', history: 'navH', catalog: 'navC', users: 'navU' };
  document.getElementById(btnMap[viewName]).classList.add('active');

  const viewId = 'view' + viewName.charAt(0).toUpperCase() + viewName.slice(1);
  document.getElementById(viewId).classList.remove('hidden');

  const titles = {
    builder: '🛠 INGRESO MENÚS',
    history: '📜 HISTORIAL',
    catalog: '📂 ALIMENTOS',
    users: '👥 USUARIOS'
  };
  viewTitle.innerText = titles[viewName];

  if (viewName === 'users') loadUsrTable();
  if (viewName === 'catalog') loadCatTable();
  if (viewName === 'history') loadHistory();
}

// --- GESTIÓN USUARIOS ---
async function loadUsrTable() {
  const { data } = await sb.from('user_permissions').select('*').order('email');
  usersCache = data || [];
  usrTableBody.innerHTML = usersCache.map(user => `
    <tr style="border-bottom:1px solid #eee;">
        <td style="text-transform:none;">${user.email}</td>
        <td>
            <span class="badge ${user.can_manage_catalog ? 'badge-admin' : 'badge-off'}">ADM.CAT</span>
            <span class="badge ${user.can_manage_users ? 'badge-admin' : 'badge-off'}">ADM.USR</span>
            <span class="badge ${user.can_access_index ? 'badge-viewer' : 'badge-off'}">INDEX</span>
        </td>
        <td style="text-align:right;">
            <button class="btn btn-warning" style="padding:6px 10px" onclick="editUsr(${user.id})">✏️</button>
            <button class="btn btn-danger" style="padding:6px 10px" onclick="delUsr(${user.id})">🗑️</button>
        </td>
    </tr>`).join('');
}

function editUsr(id) {
  const user = usersCache.find(x => x.id === id);
  if (user.can_manage_catalog || user.can_manage_users) {
    editAdminId.value = user.id;
    aEmail.value = user.email;
    apCat.checked = user.can_manage_catalog;
    apUsr.checked = user.can_manage_users;
    aPassLabel.classList.add('hidden');
    aPass.classList.add('hidden');
    adminFormTitle.innerText = "✏️ EDITANDO ADMINISTRADOR";
    btnCancelAdmin.classList.remove('hidden');
  } else {
    editViewerId.value = user.id;
    vEmail.value = user.email;
    viewerFormTitle.innerText = "✏️ EDITANDO ACCESO INDEX";
    btnCancelViewer.classList.remove('hidden');
  }
}

function resetAdminForm() {
  editAdminId.value = "";
  aEmail.value = "";
  aPass.value = "";
  apCat.checked = false;
  apUsr.checked = false;
  aPassLabel.classList.remove('hidden');
  aPass.classList.remove('hidden');
  adminFormTitle.innerText = "🛡️ GESTIÓN ADMINISTRADORES";
}

function resetViewerForm() {
  editViewerId.value = "";
  vEmail.value = "";
  btnCancelViewer.classList.add('hidden');
  viewerFormTitle.innerText = "👁️ ACCESO AL INDEX";
}

async function saveAdmin() {
  const email = aEmail.value.trim().toLowerCase();
  if (!editAdminId.value) {
    await sb.auth.signUp({ email: email, password: aPass.value });
  }
  await sb.from('user_permissions').upsert({
    email: email,
    can_manage_catalog: apCat.checked,
    can_manage_users: apUsr.checked,
    can_access_index: true
  });
  resetAdminForm();
  loadUsrTable();
  alert("GUARDADO");
}

async function saveViewer() {
  const email = vEmail.value.trim().toLowerCase();
  await sb.from('user_permissions').upsert({ email: email, can_access_index: true });
  resetViewerForm();
  loadUsrTable();
  alert("HABILITADO");
}

async function delUsr(id) {
  if (confirm("¿ELIMINAR?")) {
    await sb.from('user_permissions').delete().eq('id', id);
    loadUsrTable();
  }
}

// --- CATALOGO & CONSTRUCTOR (SINCRONIZADOS) ---
async function loadCatalog() {
  const { data } = await sb.from('food_catalog').select('*').order('categoria');
  catalogCache = data || [];
  renderCatalog(catalogCache);
}

function renderCatalog(items) {
  const grouped = items.reduce((acc, item) => {
    (acc[item.categoria] = acc[item.categoria] || []).push(item);
    return acc;
  }, {});

  catalogList.innerHTML = Object.keys(grouped).map(cat => `
    <div class="cat-accordion">
      <button class="cat-trigger" onclick="this.parentElement.classList.toggle('active')">
        <span>${cat}</span> <span>▼</span>
      </button>
      <div class="cat-content">
        ${grouped[cat].map(item => `
          <div class="food-card">
            <b>${item.acompanamiento}</b>
            <div class="btn-grid-4">
              <button class="btn-quick" onclick="addToDraft('${item.acompanamiento.replace(/'/g,"\\'")}','${item.pollo}','${cat}')">${item.pollo || '-'}</button>
              <button class="btn-quick" onclick="addToDraft('${item.acompanamiento.replace(/'/g,"\\'")}','${item.cerdo}','${cat}')">${item.cerdo || '-'}</button>
              <button class="btn-quick" onclick="addToDraft('${item.acompanamiento.replace(/'/g,"\\'")}','${item.carne_roja}','${cat}')">${item.carne_roja || '-'}</button>
              <button class="btn-quick" onclick="addToDraft('${item.acompanamiento.replace(/'/g,"\\'")}','${item.opcion_4}','${cat}')">${item.opcion_4 || '-'}</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function addToDraft(name, option, category) {
  if (!option || option === '-' || option === 'null') return;
  menuDraft.push({ name: `${name} + ${option}`.toUpperCase(), category: category });
  renderDraft();
}

function renderDraft() {
  draftList.innerHTML = menuDraft.map((item, index) => `
    <div class="draft-item">
      <div>
        <b>${item.name}</b><br>
        <small style="color:var(--accent)">${item.category}</small>
      </div>
      <button class="btn btn-danger" onclick="menuDraft.splice(${index},1);renderDraft()">X</button>
    </div>
  `).join('');
  emptyMsg.classList.toggle('hidden', menuDraft.length > 0);
}

async function saveMenu() {
  const date = menuDate.value;
  if (!date || !menuDraft.length) return alert("FALTA INFO");

  if (editingMenuId) {
    // UPDATE
    await sb.from('menus').update({ menu_date: date }).eq('id', editingMenuId);

    // Get old menu items to delete them
    const { data: oldRels } = await sb.from('menu_menu_items').select('menu_item_id').eq('menu_id', editingMenuId);
    const oldItemIds = oldRels ? oldRels.map(r => r.menu_item_id) : [];

    // Delete relationships
    await sb.from('menu_menu_items').delete().eq('menu_id', editingMenuId);

    // Delete orphan items
    if (oldItemIds.length > 0) {
      await sb.from('menu_items').delete().in('id', oldItemIds);
    }

    // Insert new
    for (const draftItem of menuDraft) {
      const { data: menuItem } = await sb.from('menu_items').insert([draftItem]).select().single();
      await sb.from('menu_menu_items').insert([{ menu_id: editingMenuId, menu_item_id: menuItem.id }]);
    }

    alert("ACTUALIZADO ✅");
  } else {
    // CREATE
    const { data: menu } = await sb.from('menus').insert([{ name: "MENÚ DEL DÍA", menu_date: date }]).select().single();

    for (const draftItem of menuDraft) {
      const { data: menuItem } = await sb.from('menu_items').insert([draftItem]).select().single();
      await sb.from('menu_menu_items').insert([{ menu_id: menu.id, menu_item_id: menuItem.id }]);
    }

    alert("PUBLICADO ✅");
  }

  menuDraft = [];
  editingMenuId = null;
  renderDraft();
  updateBuilderUI();
}

async function loadCatTable() {
  const { data } = await sb.from('food_catalog').select('*').order('categoria');
  catalogCache = data || [];
  catTable.innerHTML = catalogCache.map(item => `
    <tr>
      <td><b>${item.categoria}</b></td>
      <td>${item.acompanamiento}</td>
      <td style="text-align:right;">
        <button class="btn btn-warning" onclick="editCat(${item.id})">✏️</button>
        <button class="btn btn-primary" onclick="dupCat(${item.id})">👯</button>
        <button class="btn btn-danger" onclick="delCat(${item.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function editCat(id) {
  const item = catalogCache.find(x => x.id === id);
  editCatId.value = item.id;
  cCat.value = item.categoria;
  cAcomp.value = item.acompanamiento;
  cO1.value = item.pollo;
  cO2.value = item.cerdo;
  cO3.value = item.carne_roja;
  cO4.value = item.opcion_4;
  btnCancelCat.classList.remove('hidden');
}

function dupCat(id) {
  const item = catalogCache.find(x => x.id === id);
  editCatId.value = "";
  cCat.value = item.categoria;
  cAcomp.value = item.acompanamiento + " (COPIA)";
  cO1.value = item.pollo;
  cO2.value = item.cerdo;
  cO3.value = item.carne_roja;
  cO4.value = item.opcion_4;
  btnCancelCat.classList.remove('hidden');
}

function resetCatForm() {
  editCatId.value = "";
  cCat.value = "";
  cAcomp.value = "";
  cO1.value = "";
  cO2.value = "";
  cO3.value = "";
  cO4.value = "";
  btnCancelCat.classList.add('hidden');
}

async function saveFood() {
  const payload = {
    categoria: cCat.value.toUpperCase(),
    acompanamiento: cAcomp.value.toUpperCase(),
    pollo: cO1.value.toUpperCase(),
    cerdo: cO2.value.toUpperCase(),
    carne_roja: cO3.value.toUpperCase(),
    opcion_4: cO4.value.toUpperCase()
  };

  if (editCatId.value) {
    await sb.from('food_catalog').update(payload).eq('id', editCatId.value);
  } else {
    await sb.from('food_catalog').insert([payload]);
  }
  resetCatForm();
  loadCatTable();
  loadCatalog();
}

async function delCat(id) {
  if (confirm("¿BORRAR?")) {
    await sb.from('food_catalog').delete().eq('id', id);
    loadCatTable();
    loadCatalog();
  }
}

async function loadHistory() {
  const container = document.getElementById('historyTable');
  const { data } = await sb.from('menus')
    .select('id, name, menu_date, menu_menu_items(menu_items(name, category, description))')
    .order('menu_date', { ascending: false });

  historyCache = data || [];

  container.innerHTML = historyCache.map(menu => {
    const itemsHtml = menu.menu_menu_items.map(rel =>
      rel.menu_items ? `<span style="display:block; font-size:10px; color:#64748b;">• ${rel.menu_items.category}: <b>${rel.menu_items.name}</b></span>` : ''
    ).join('');

    return `
      <tr>
        <td style="width:120px;"><b>${menu.menu_date}</b></td>
        <td>
          <b>${menu.name}</b><br>
          <div style="background:#f8fafc; padding:10px; border-radius:12px; border:1px solid #e2e8f0;">${itemsHtml}</div>
        </td>
        <td style="text-align:right;">
          <button class="btn btn-warning" onclick="editMenu(${menu.id})">EDITAR</button>
          <button class="btn btn-primary" onclick="reUseMenu(${menu.id})">REUTILIZAR</button>
          <button class="btn btn-danger" onclick="delMenu(${menu.id})">X</button>
        </td>
      </tr>
    `;
  }).join('');
}

function reUseMenu(id) {
  const menu = historyCache.find(x => x.id === id);
  menuDraft = menu.menu_menu_items.map(rel => ({
    name: rel.menu_items.name,
    category: rel.menu_items.category
  }));
  editingMenuId = null; // Ensure we are creating a new one
  switchView('builder');
  renderDraft();
  updateBuilderUI();
  alert("MENÚ CARGADO (COPIA) ✅");
}

function editMenu(id) {
  const menu = historyCache.find(x => x.id === id);
  menuDraft = menu.menu_menu_items.map(rel => ({
    name: rel.menu_items.name,
    category: rel.menu_items.category
  }));
  editingMenuId = id;
  menuDate.value = menu.menu_date;
  switchView('builder');
  renderDraft();
  updateBuilderUI();
}

function updateBuilderUI() {
  const publishBtn = document.getElementById('btnPublish');
  if (editingMenuId) {
    publishBtn.innerText = "ACTUALIZAR MENÚ";
    publishBtn.classList.remove('btn-primary');
    publishBtn.classList.add('btn-success');
    autoName.innerText = "EDITANDO MENÚ";
  } else {
    publishBtn.innerText = "PUBLICA MENÚ";
    publishBtn.classList.remove('btn-success');
    publishBtn.classList.add('btn-primary');
    autoName.innerText = "MENÚ DEL DÍA";
  }
}

async function delMenu(id) {
  if (confirm("¿BORRAR?")) {
    // Get menu items to delete them (orphan cleanup)
    const { data: rels } = await sb.from('menu_menu_items').select('menu_item_id').eq('menu_id', id);
    const itemIds = rels ? rels.map(r => r.menu_item_id) : [];

    await sb.from('menu_menu_items').delete().eq('menu_id', id);

    if (itemIds.length > 0) {
      await sb.from('menu_items').delete().in('id', itemIds);
    }

    await sb.from('menus').delete().eq('id', id);
    loadHistory();
  }
}

async function delAllMenus() {
  if (confirm("¿BORRAR TODO?")) {
    // Ideally we should delete all menu_items too, but it's heavier to fetch all.
    // For now, we will assume a bulk delete of relationships first.
    await sb.from('menu_menu_items').delete().neq('id', 0);
    // Then menus
    await sb.from('menus').delete().neq('id', 0);
    // Ideally we would also clear menu_items, but let's stick to safe relationship deletion.
    // To properly clean up we would need to delete all menu_items that were related.
    // Given 'delAllMenus' is likely a nuclear option, leaving orphans might be acceptable or we can just nuke menu_items table if it's only used for this.
    // Assuming menu_items are only for daily menus:
    await sb.from('menu_items').delete().neq('id', 0);

    loadHistory();
  }
}

function filterCatalog() {
  const query = catSearch.value.toUpperCase();
  renderCatalog(catalogCache.filter(item =>
    item.acompanamiento.includes(query) || item.categoria.includes(query)
  ));
  if (query) {
    document.querySelectorAll('.cat-accordion').forEach(acc => acc.classList.add('active'));
  }
}

document.addEventListener('input', e => {
  if (e.target.tagName === 'INPUT' && !['email', 'password', 'date'].includes(e.target.type)) {
    e.target.value = e.target.value.toUpperCase();
  }
});

menuDate.value = new Date().toLocaleString("en-CA", { timeZone: "America/Santiago" }).split(',')[0];
checkSession();
