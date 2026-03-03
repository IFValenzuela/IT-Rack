const API_URL = 'http://localhost:3000/api';
let currentUser = null;

// Check authentication on page load
(async function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  try {
    const response = await fetch(`${API_URL}/auth/verify`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Invalid token');
    
    const data = await response.json();
    currentUser = data.user;
    addLogoutButton();
  } catch (e) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
  }
})();

// C) Logout functionality
function addLogoutButton() {
  const userMenu = document.getElementById('user-menu');
  if (!userMenu) return;
  userMenu.innerHTML = `
    <span class="user-name">👤 ${currentUser.username}</span>
    <span style="opacity:0.3">|</span>
    <button class="btn-logout" onclick="logout()">Logout</button>
  `;
  // Show admin-only elements only for admin role
  if (currentUser.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }
}

function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
  }
}

// ── Admin Panel ──────────────────────────────────────────────────
let adminUsers = [];
let editingUserId = null;

async function loadAdminUsers() {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/admin/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    adminUsers = await res.json();
    renderAdminUsers();
  } catch (e) {
    showToast('Failed to load users.');
  }
}

const ROLE_LABELS = {
  admin: { label: 'Admin', cls: 'role-admin' },
  technician: { label: 'Technician', cls: 'role-tech' },
  delivery: { label: 'Delivery Window', cls: 'role-delivery' },
  viewer: { label: 'Viewer', cls: 'role-viewer' },
};

function renderAdminUsers() {
  const container = document.getElementById('admin-users-table-container');
  if (!container) return;
  if (!adminUsers.length) {
    container.innerHTML = '<p>No users found.</p>';
    return;
  }
  container.classList.remove('empty-state');
  container.innerHTML = `
    <table class="inv-table">
      <thead>
        <tr>
          <th>Username</th>
          <th>Email</th>
          <th>Role</th>
          <th>Last Login</th>
          <th>Created</th>
          <th style="width:120px"></th>
        </tr>
      </thead>
      <tbody>
        ${adminUsers.map(u => `
          <tr>
            <td><strong>${u.username}</strong>${u.id === currentUser.id ? ' <span class="badge-you">you</span>' : ''}</td>
            <td style="color:var(--text-muted)">${u.email || '—'}</td>
            <td><span class="role-badge ${(ROLE_LABELS[u.role] || {}).cls || ''}">${(ROLE_LABELS[u.role] || {}).label || u.role}</span></td>
            <td style="color:var(--text-muted);font-size:.8rem">${u.lastLogin ? formatDateTime(u.lastLogin) : 'Never'}</td>
            <td style="color:var(--text-muted);font-size:.8rem">${u.createdAt ? formatDate(u.createdAt) : '—'}</td>
            <td class="row-actions">
              <span class="action-link" onclick="openEditUser(${u.id})">Edit</span>
              ${u.id !== currentUser.id ? `<span class="action-link action-link-danger" onclick="deleteUser(${u.id}, '${u.username}')">Delete</span>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function openAddUserDialog() {
  editingUserId = null;
  document.getElementById('add-user-dialog-title').textContent = 'New User';
  document.getElementById('btn-save-user').textContent = 'Create User';
  document.getElementById('add-user-form').reset();
  document.getElementById('edit-user-id').value = '';
  document.getElementById('new-user-username').disabled = false;
  document.getElementById('new-user-password').required = true;
  document.getElementById('password-field-label').innerHTML = 'Password <span style="color:var(--danger)">*</span>';
  document.getElementById('add-user-dialog').classList.remove('hidden');
}

function openEditUser(id) {
  const u = adminUsers.find(x => x.id === id);
  if (!u) return;
  editingUserId = id;
  document.getElementById('add-user-dialog-title').textContent = 'Edit User';
  document.getElementById('btn-save-user').textContent = 'Save Changes';
  document.getElementById('edit-user-id').value = id;
  document.getElementById('new-user-username').value = u.username;
  document.getElementById('new-user-username').disabled = true;
  document.getElementById('new-user-email').value = u.email || '';
  document.getElementById('new-user-password').value = '';
  document.getElementById('new-user-password').required = false;
  document.getElementById('password-field-label').innerHTML = 'New Password <span style="color:var(--text-muted);font-size:.8em">(leave blank to keep)</span>';
  document.getElementById('new-user-role').value = u.role;
  document.getElementById('add-user-dialog').classList.remove('hidden');
}

function closeAddUserDialog() {
  document.getElementById('add-user-dialog').classList.add('hidden');
  document.getElementById('add-user-form').reset();
  editingUserId = null;
}

async function saveUser(e) {
  e.preventDefault();
  const token = localStorage.getItem('token');
  const username = document.getElementById('new-user-username').value.trim();
  const email = document.getElementById('new-user-email').value.trim();
  const password = document.getElementById('new-user-password').value;
  const role = document.getElementById('new-user-role').value;

  try {
    if (editingUserId) {
      const body = { role, email };
      if (password) body.password = password;
      const res = await fetch(`${API_URL}/admin/users/${editingUserId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('User updated.');
    } else {
      if (password.length < 6) { showToast('Password must be at least 6 characters.'); return; }
      const res = await fetch(`${API_URL}/admin/users`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`User "${username}" created.`);
    }
    closeAddUserDialog();
    await loadAdminUsers();
  } catch (e) {
    showToast(e.message);
  }
}

async function deleteUser(id, username) {
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/admin/users/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(`"${username}" deleted.`);
    await loadAdminUsers();
  } catch (e) {
    showToast(e.message);
  }
}

const state = {
  models: [],
  devices: [],
  history: [],
  technicians: [],
};

let historySort = "desc";
let devicesSort = "desc";
let removedSort = "desc";
let devicesRemovedDestFilter = "";
let removedTextFilter = "";
let removedDeptFilter = "";
let viewModeIn = "all";
let viewModeOut = "all";
let devicesCategoryFilter = "";
let historyCategoryFilter = "";
let removedCategoryFilter = "";

const DEFAULT_LIMIT_INDIVIDUAL = 10;
const DEFAULT_LIMIT_GROUPED = 5;
const INCREMENT_INDIVIDUAL = 10;
const INCREMENT_GROUPED = 5;
let visibleIn = DEFAULT_LIMIT_INDIVIDUAL;
let visibleOut = DEFAULT_LIMIT_INDIVIDUAL;
let previousVisibleIn = 0;
let previousVisibleOut = 0;
const DEFAULT_LIMIT_HISTORY = 20;
const INCREMENT_HISTORY = 20;
let visibleHistory = DEFAULT_LIMIT_HISTORY;
let previousVisibleHistory = 0;

function uid() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// Get auth token
function getToken() {
  return localStorage.getItem('token');
}

// API helper
async function apiCall(method, endpoint, body = null) {
  const token = getToken();
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(`${API_URL}${endpoint}`, options);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || `API error: ${response.status}`);
  }
  return response.json();
}

// Load data from backend
async function loadFromBackend() {
  try {
    const [models, devices, technicians] = await Promise.all([
      apiCall('GET', '/models'),
      apiCall('GET', '/devices'),
      apiCall('GET', '/technicians')
    ]);
    
    state.models = Array.isArray(models) ? models : [];
    state.devices = Array.isArray(devices) ? devices : [];
    state.technicians = Array.isArray(technicians) ? technicians.map(t => t.name) : [];

    // Rebuild history from devices
    const history = [];
    state.devices.forEach(d => {
      // "Added to stock" entry
      history.push({
        id: d.id + '-in',
        type: 'in',
        at: d.createdAt,
        modelId: d.modelId,
        serial: d.serial,
        prNumber: d.prNumber,
        department: d.department,
        addedBy: d.addedBy,
      });
      // "Removed from stock" entry
      if (d.status === 'out' && d.removedAt) {
        history.push({
          id: d.id + '-out',
          type: 'out',
          at: d.removedAt,
          modelId: d.modelId,
          serial: d.serial,
          prNumber: d.prNumber,
          department: d.department,
          addedBy: d.addedBy,
          reason: d.reason,
          deliveredBy: d.deliveredBy,
          destination: d.destination,
        });
      }
    });
    // Sort newest first
    history.sort((a, b) => new Date(b.at) - new Date(a.at));
    state.history = history;

  } catch (e) {
    console.error("Error loading from backend:", e);
    showToast("Could not load data from server");
  }
}

// Write to backend (replaces Firestore write)
async function writeToBackend() {
  // Data is saved via individual API calls in add/update/delete functions
  // This function is kept for compatibility but doesn't do bulk writes
}

async function clearAllData() {
  if (!confirm("Delete all models, devices, and history? This cannot be undone.\nNote: the people list will NOT be cleared.")) return;
  try {
    await apiCall('DELETE', '/admin/clear-all');
    state.models = [];
    state.devices = [];
    state.history = [];
    renderAll();
    showToast("All data cleared. Fresh start.");
  } catch (e) {
    showToast("Error clearing data: " + e.message);
  }
}

// ---- Technician helpers ----

function populateTechnicianSelect() {
  const sel = document.getElementById("serial-added-by-select");
  if (!sel) return;
  if (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'delivery') {
    sel.innerHTML = `<option value="${currentUser.username}">${currentUser.username}</option>`;
    sel.value = currentUser.username;
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  const current = sel.value;
  sel.innerHTML = '<option value="">Select person…</option>';
  state.technicians
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  if (currentUser && currentUser.role === 'admin') {
    const addOpt = document.createElement("option");
    addOpt.value = "__add_new__";
    addOpt.textContent = "+ Add new person…";
    sel.appendChild(addOpt);
  }
  if (current && state.technicians.includes(current)) sel.value = current;
}

function populateDeliveredBySelect() {
  const sel = document.getElementById("remove-delivered-by-select");
  if (!sel) return;
  if (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'delivery') {
    sel.innerHTML = `<option value="${currentUser.username}">${currentUser.username}</option>`;
    sel.value = currentUser.username;
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  const current = sel.value;
  sel.innerHTML = '<option value="">Select person…</option>';
  state.technicians
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  if (currentUser && currentUser.role === 'admin') {
    const addOpt = document.createElement("option");
    addOpt.value = "__add_new__";
    addOpt.textContent = "+ Add new person…";
    sel.appendChild(addOpt);
  }
  if (current && state.technicians.includes(current)) sel.value = current;
}

async function addTechnician(name) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (state.technicians.includes(trimmed)) {
    showToast("That person is already in the list.");
    return false;
  }
  try {
    await apiCall('POST', '/technicians', { name: trimmed });
    state.technicians.push(trimmed);
    populateTechnicianSelect();
    const sel = document.getElementById("serial-added-by-select");
    if (sel) sel.value = trimmed;
    showToast(`"${trimmed}" added to the team list.`);
    return true;
  } catch (e) {
    showToast(`Error adding technician: ${e.message}`);
    return false;
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.classList.add("hidden"), 200);
  }, 2100);
}

function formatDateTime(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }) +
    " " +
    d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
}

function formatDate(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function getStockAgeInfo(createdAtIso) {
  const now = Date.now();
  const added = new Date(createdAtIso).getTime();
  if (Number.isNaN(added)) return { rowClass: "", badge: "" };
  const diffDays = (now - added) / (1000 * 60 * 60 * 24);
  if (diffDays >= 30) {
    return {
      rowClass: "stock-age-critical",
      badge: '<span class="stock-age-badge critical">1+ month</span>',
    };
  }
  if (diffDays >= 14) {
    return {
      rowClass: "stock-age-warning",
      badge: '<span class="stock-age-badge warning">2+ weeks</span>',
    };
  }
  return { rowClass: "", badge: "" };
}

function renderFilterPills(containerId, items, getModelId, activeCategory, onSelect) {
  const bar = document.getElementById(containerId);
  if (!bar) return;
  const counts = {};
  CATEGORIES.forEach((cat) => { counts[cat] = 0; });
  items.forEach((item) => {
    const model = state.models.find((m) => m.id === getModelId(item));
    const cat = (model && model.category) ? model.category : "";
    if (Object.prototype.hasOwnProperty.call(counts, cat)) counts[cat]++;
  });
  const pills = [
    { label: "All", value: "", count: items.length },
    ...CATEGORIES.map((cat) => ({ label: cat, value: cat, count: counts[cat] || 0 })),
  ];
  bar.innerHTML =
    `<span class="pill-bar-label">Type:</span>` +
    pills.map(({ label, value, count }) => {
      const isActive = value === activeCategory;
      const isEmpty = value !== "" && count === 0;
      return `<button type="button" class="pill${isActive ? " active" : ""}${isEmpty ? " empty" : ""}" data-cat="${value}">${label} <span class="pill-count">${count}</span></button>`;
    }).join("");
  bar.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", () => onSelect(btn.dataset.cat));
  });
}

function getCategoryBadge(category) {
  if (!category) return "";
  return `<span class="category-badge" title="${category}"><span class="cb-label">${category}</span></span>`;
}

function setEmptyOrTable(container, htmlTable) {
  if (!container) return;
  if (!htmlTable) {
    container.classList.add("empty-state");
    container.innerHTML = '<p style="margin:0;font-size:0.8rem;color:#6c7a96;">No data.</p>';
  } else {
    container.classList.remove("empty-state");
    container.innerHTML = htmlTable;
  }
}

function renderDashboard() {
  const totalModels = state.models.length;
  const inStock = state.devices.filter((d) => d.status === "in").length;
  const removed = state.devices.filter((d) => d.status === "out").length;

  document.getElementById("summary-total-models").textContent = totalModels;
  document.getElementById("summary-in-stock").textContent = inStock;
  document.getElementById("summary-removed").textContent = removed;

  const list = document.getElementById("dashboard-models-list");
  if (!list) return;
  if (!state.models.length) {
    list.classList.add("empty-state");
    list.innerHTML = "<p>No models yet. Go to the Models tab to add your first one.</p>";
    return;
  }
  list.classList.remove("empty-state");
  list.innerHTML = "";
  state.models
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((m) => {
      const countIn = state.devices.filter(
        (d) => d.modelId === m.id && d.status === "in"
      ).length;
      const countOut = state.devices.filter(
        (d) => d.modelId === m.id && d.status === "out"
      ).length;

      const card = document.createElement("button");
      card.className = "dash-model-card";
      card.dataset.modelId = m.id;
      card.innerHTML = `
        <div class="dmc-body">
          <div class="dmc-name">${m.name}</div>
          <div class="dmc-counts">
            <span class="dmc-badge in">${countIn} in stock</span>
            <span class="dmc-badge out">${countOut} removed</span>
          </div>
        </div>
        <span class="dmc-arrow">→</span>
      `;
      card.addEventListener("click", () => {
        switchView("models");
        openModelDetail(m.id);
      });
      list.appendChild(card);
    });
}

let deleteMode = false;
let selectedModelIds = new Set();

function updateModelsHeader() {
  const actions = document.getElementById("models-header-actions");
  if (!actions) return;
  const filterEl = document.getElementById("filter-models-input");
  const filterValue = filterEl ? filterEl.value : "";
  const filterHtml = `<input type="text" id="filter-models-input" class="filter-input" placeholder="Search models…" value="${(filterValue || "").replace(/"/g, "&quot;")}" aria-label="Search device models" />`;
  if (deleteMode) {
    actions.innerHTML = `
      ${filterHtml}
      <button class="btn danger" id="btn-confirm-delete-models">Delete Selected</button>
      <button class="btn ghost" id="btn-cancel-delete-mode">Cancel</button>
    `;
    document.getElementById("btn-confirm-delete-models").addEventListener("click", deleteSelectedModels);
    document.getElementById("btn-cancel-delete-mode").addEventListener("click", exitDeleteMode);
  } else {
    const isAdmin = currentUser && currentUser.role === 'admin';
    actions.innerHTML = `
      ${filterHtml}
      <button class="btn ghost" id="btn-prepare-kit">Prepare Kit</button>
      <button class="btn ghost" id="btn-open-deploy-kit">Remove a Kit</button>
      ${isAdmin ? '<button class="btn ghost" id="btn-enter-delete-mode">Delete</button>' : ''}
      <button class="btn primary" id="btn-open-add-model-dialog">+ New Model</button>
    `;
    document.getElementById("btn-prepare-kit").addEventListener("click", openNewHireKitDialog);
    document.getElementById("btn-open-deploy-kit").addEventListener("click", () => {
      const panel = document.getElementById("kit-deploy-panel");
      if (panel) panel.classList.toggle("hidden");
    });
    if (isAdmin) document.getElementById("btn-enter-delete-mode").addEventListener("click", enterDeleteMode);
    document.getElementById("btn-open-add-model-dialog").addEventListener("click", openAddModelDialog);
  }
  const newFilter = document.getElementById("filter-models-input");
  if (newFilter) {
    newFilter.addEventListener("input", () => { modelsVisible = 8; renderModelsTable(); });
  }
}

function enterDeleteMode() {
  deleteMode = true;
  selectedModelIds.clear();
  renderModelsTable();
  updateModelsHeader();
}

function exitDeleteMode() {
  deleteMode = false;
  selectedModelIds.clear();
  renderModelsTable();
  updateModelsHeader();
}

async function deleteSelectedModels() {
  if (selectedModelIds.size === 0) {
    showToast("Select at least one model to delete.");
    return;
  }
  const count = selectedModelIds.size;
  const names = state.models
    .filter((m) => selectedModelIds.has(m.id))
    .map((m) => `• ${m.name}`)
    .join("\n");
  if (!confirm(`Delete ${count} model${count > 1 ? "s" : ""}?\n${names}\n\nAll their devices will also be removed.`)) return;

  try {
    for (const id of selectedModelIds) {
      await apiCall('DELETE', `/models/${id}`);
      if (currentModelId === id) closeModelDetail();
      state.models = state.models.filter((m) => m.id !== id);
      state.devices = state.devices.filter((d) => d.modelId !== id);
    }
    exitDeleteMode();
    renderAll();
    showToast(`${count} model${count > 1 ? "s" : ""} deleted.`);
  } catch (e) {
    showToast(`Error deleting models: ${e.message}`);
  }
}

let currentCategoryFilter = "All";
let modelsVisible = 8;
const CATEGORIES = ["Laptop", "Desktop PC", "Keyboard", "Cellphone", "Mouse", "Headset", "Dock", "Monitor", "Cable", "Camera", "Printer", "Tablet", "Scanner", "Other"];
const KIT_ACCESSORIES = [
  "Dell 24-Inch Monitor",
  "Dell Optical Wired Mouse",
  "Dell Wired Multi-Media Keyboard",
  "DisplayPort to VGA Converter",
  "DVI-D to DisplayPort Converter",
  "HDMI to VGA Adapter",
  "Laptop Docking Station",
  "Logitech C920 HD Pro Web Camera",
  "USB Headset",
  "Other",
];
const NO_SERIAL_ITEMS = new Set([
  "DisplayPort to VGA Converter",
  "DVI-D to DisplayPort Converter",
  "HDMI to VGA Adapter",
]);
const KIT_ACCESSORY_CATEGORIES = {
  "Dell 24-Inch Monitor": "Monitor",
  "Dell Optical Wired Mouse": "Mouse",
  "Dell Wired Multi-Media Keyboard": "Keyboard",
  "DisplayPort to VGA Converter": "Cable",
  "DVI-D to DisplayPort Converter": "Cable",
  "HDMI to VGA Adapter": "Cable",
  "Laptop Docking Station": "Dock",
  "Logitech C920 HD Pro Web Camera": "Camera",
  "USB Headset": "Headset",
  "Other": "Other",
};

function renderCategoryPills() {
  const container = document.getElementById("category-pills-container");
  if (!container) return;
  if (!state.models.length) {
    container.innerHTML = "";
    return;
  }
  const counts = { All: state.models.length };
  CATEGORIES.forEach(c => counts[c] = 0);
  state.models.forEach(m => {
    if (m.category && counts[m.category] !== undefined) {
      counts[m.category]++;
    }
  });
  const pills = ["All", ...CATEGORIES].map(cat => {
    const isActive = currentCategoryFilter === cat;
    const count = counts[cat] || 0;
    return `
      <button class="pill ${isActive ? 'active' : ''}" data-category="${cat}">
        ${cat} <span class="pill-count">${count}</span>
      </button>
    `;
  }).join("");
  container.innerHTML = pills;
  container.querySelectorAll(".pill").forEach(btn => {
    btn.addEventListener("click", () => {
      currentCategoryFilter = btn.dataset.category;
      modelsVisible = 8;
      renderModelsTable();
      renderCategoryPills();
    });
  });
}

function renderModelsTable() {
  renderCategoryPills();
  const container = document.getElementById("models-table-container");
  if (!container) return;
  if (!state.models.length) {
    container.classList.add("empty-state");
    container.innerHTML = "<p>No models yet. Use New Models to create one.</p>";
    return;
  }
  const filterEl = document.getElementById("filter-models-input");
  const filter = filterEl ? filterEl.value.trim().toLowerCase() : "";
  let modelsToShow = state.models.slice();
  if (currentCategoryFilter !== "All") {
    modelsToShow = modelsToShow.filter(m => m.category === currentCategoryFilter);
  }
  if (filter) {
    modelsToShow = modelsToShow.filter(
      (m) =>
        (m.name || "").toLowerCase().includes(filter) ||
        (m.category || "").toLowerCase().includes(filter)
    );
  }
  if (!modelsToShow.length) {
    container.classList.remove("empty-state");
    container.innerHTML = "<p>No models match your search.</p>";
    return;
  }
  container.classList.remove("empty-state");
  const sortedModels = modelsToShow.slice().sort((a, b) => a.name.localeCompare(b.name));
  const totalModels = sortedModels.length;
  const visibleModels = Math.min(modelsVisible, totalModels);
  const rows = sortedModels
    .slice(0, visibleModels)
    .map((m) => {
      const inCount = state.devices.filter(
        (d) => d.modelId === m.id && d.status === "in"
      ).length;
      const outCount = state.devices.filter(
        (d) => d.modelId === m.id && d.status === "out"
      ).length;
      const checkCell = deleteMode
        ? `<td style="width:36px;padding:7px 10px;"><input type="checkbox" class="js-model-checkbox" data-model-id="${m.id}" ${selectedModelIds.has(m.id) ? "checked" : ""} style="width:16px;height:16px;cursor:pointer;" /></td>`
        : "";
      return `
        <tr data-model-id="${m.id}" class="js-row-model${deleteMode ? " row-selectable" : ""}">
          ${checkCell}
          <td>${m.name} ${getCategoryBadge(m.category)}</td>
          <td>${inCount}</td>
          <td>${outCount}</td>
          <td>${formatDateTime(m.createdAt)}</td>
        </tr>
      `;
    })
    .join("");
  const checkHeader = deleteMode ? "<th></th>" : "";
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          ${checkHeader}
          <th>Model</th>
          <th>In stock</th>
          <th>Removed</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${totalModels > visibleModels ? `<div style="text-align:center;margin-top:10px;"><button type="button" class="btn ghost" id="btn-models-show-more">Show More</button></div>` : ""}
  `;
  const showMoreBtn = container.querySelector("#btn-models-show-more");
  if (showMoreBtn) {
    showMoreBtn.addEventListener("click", () => {
      modelsVisible += 8;
      renderModelsTable();
    });
  }
  container.querySelectorAll(".js-row-model").forEach((row) => {
    if (deleteMode) {
      row.addEventListener("click", (e) => {
        const cb = row.querySelector(".js-model-checkbox");
        if (!cb) return;
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        const id = row.getAttribute("data-model-id");
        if (cb.checked) selectedModelIds.add(id);
        else selectedModelIds.delete(id);
      });
      const cb = row.querySelector(".js-model-checkbox");
      if (cb) {
        cb.addEventListener("change", () => {
          const id = row.getAttribute("data-model-id");
          if (cb.checked) selectedModelIds.add(id);
          else selectedModelIds.delete(id);
        });
      }
    } else {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-model-id");
        openModelDetail(id);
      });
    }
  });
}

let currentModelId = null;
let pendingRemoveDeviceId = null;
let modelHistoryVisible = 10;

function openModelDetail(modelId) {
  switchView("models");
  const model = state.models.find((m) => m.id === modelId);
  if (!model) return;
  currentModelId = modelId;
  const detailSection = document.getElementById("model-detail");
  detailSection.classList.remove("hidden");
  document.getElementById("model-detail-title").textContent = model.name;
  document.getElementById("model-detail-subtitle").textContent = model.notes || "Manage serial numbers and deliveries for this model.";
  const inCount = state.devices.filter((d) => d.modelId === model.id && d.status === "in").length;
  const outCount = state.devices.filter((d) => d.modelId === model.id && d.status === "out").length;
  document.getElementById("model-detail-counts").textContent = `${inCount} in stock - ${outCount} removed`;
  renderModelSerialsTable(model.id);
  modelHistoryVisible = 10;
  renderModelHistoryTable(model.id);
}

function closeModelDetail() {
  currentModelId = null;
  document.getElementById("model-detail").classList.add("hidden");
}

function renderModelSerialsTable(modelId) {
  const container = document.getElementById("model-serials-table-container");
  if (!container) return;
  const serials = state.devices.filter((d) => d.modelId === modelId && d.status === "in");
  if (!serials.length) {
    container.classList.add("empty-state");
    container.innerHTML = "<p>No serials yet for this model.</p>";
    return;
  }
  container.classList.remove("empty-state");
  const rows = serials
    .slice()
    .sort((a, b) => a.serial.localeCompare(b.serial))
    .map((d) => {
      const { rowClass, badge } = getStockAgeInfo(d.createdAt);
      return `
        <tr data-device-id="${d.id}" class="${rowClass}">
          <td>${d.serial}</td>
          <td>${d.prNumber || ""}</td>
          <td>${d.department || ""}</td>
          <td>${d.addedBy || ""}</td>
          <td>${formatDateTime(d.createdAt)}${badge}</td>
          <td style="text-align:right;">
            <button class="btn ghost js-remove-serial" type="button">Remove from stock</button>
          </td>
        </tr>
      `;
    })
    .join("");
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Serial</th>
          <th>PR / Ticket</th>
          <th>Department</th>
          <th>Added by</th>
          <th>Added</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  container.querySelectorAll(".js-remove-serial").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest("tr");
      const id = row.getAttribute("data-device-id");
      openRemoveSerialDialog(id);
    });
  });
}

function renderModelHistoryTable(modelId) {
  const container = document.getElementById("model-history-table-container");
  if (!container) return;
  const entries = state.history
    .filter((h) => h.modelId === modelId)
    .slice()
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  if (!entries.length) {
    container.classList.add("empty-state");
    container.innerHTML = "<p>No history yet. Add or remove serials to see activity.</p>";
    return;
  }
  container.classList.remove("empty-state");
  const total = entries.length;
  const visible = Math.min(modelHistoryVisible, total);
  const rows = entries
    .slice(0, visible)
    .map((h) => {
      const statusClass = h.type === "in" ? "status-in" : "status-out";
      const label = h.type === "in" ? "Added" : "Removed";
      const technician = h.addedBy || h.deliveredBy || "";
      const dash = '<span style="color:var(--text-muted)">—</span>';
      const reason = h.reason || (h.type === "in" ? dash : "");
      const destination = h.destination || (h.type === "in" ? dash : "");
      let rowClass = "";
      if (h.type === "in") {
        const device = state.devices.find((d) => d.serial === h.serial && d.modelId === h.modelId && d.status === "in");
        if (device) {
          const info = getStockAgeInfo(device.createdAt);
          rowClass = info.rowClass;
        }
      }
      return `
        <tr class="${rowClass}">
          <td><span class="status-chip ${statusClass}">${label}</span></td>
          <td>${h.serial}</td>
          <td>${h.prNumber || ""}</td>
          <td>${technician}</td>
          <td>${reason}</td>
          <td>${destination}</td>
          <td>${formatDateTime(h.at)}</td>
        </tr>
      `;
    })
    .join("");
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Serial</th>
          <th>PR / Ticket</th>
          <th>Handled by</th>
          <th>Reason</th>
          <th>Destination</th>
          <th>At</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${total > visible ? `<div style="text-align:center;margin-top:10px;"><button type="button" class="btn ghost" id="btn-model-history-show-more">Show More</button></div>` : ""}
  `;
  const showMoreBtn = container.querySelector("#btn-model-history-show-more");
  if (showMoreBtn) {
    showMoreBtn.addEventListener("click", () => {
      modelHistoryVisible += 10;
      renderModelHistoryTable(modelId);
    });
  }
}

function getKitIds(devices) {
  const ids = new Set();
  devices.forEach((d) => { if (d.kit_id) ids.add(d.kit_id); });
  return ids;
}

function resetDevicesPagination() {
  visibleIn = viewModeIn === "grouped" ? DEFAULT_LIMIT_GROUPED : DEFAULT_LIMIT_INDIVIDUAL;
  visibleOut = viewModeOut === "grouped" ? DEFAULT_LIMIT_GROUPED : DEFAULT_LIMIT_INDIVIDUAL;
  previousVisibleIn = visibleIn;
  previousVisibleOut = visibleOut;
}

function renderDevicesView() {
  const inContainer = document.getElementById("devices-table-container");
  const outContainer = document.getElementById("devices-removed-table-container");
  const deptFilterEl = document.getElementById("filter-department");
  const textFilterEl = document.getElementById("filter-location-owner");
  const deptFilter = deptFilterEl ? deptFilterEl.value : "";
  const textFilter = textFilterEl ? textFilterEl.value.trim().toLowerCase() : "";

  let inDevices = state.devices.filter((d) => d.status === "in");
  let outDevices = state.devices.filter((d) => d.status === "out");

  if (deptFilter) {
    inDevices = inDevices.filter((d) => (d.department || "") === deptFilter);
  }
  if (textFilter) {
    inDevices = inDevices.filter((d) => {
      const model = state.models.find((m) => m.id === d.modelId) || {};
      const modelName = (model.name || "").toLowerCase();
      const modelCategory = (model.category || "").toLowerCase();
      return (
        modelName.includes(textFilter) ||
        modelCategory.includes(textFilter) ||
        (d.serial || "").toLowerCase().includes(textFilter) ||
        (d.prNumber || "").toLowerCase().includes(textFilter) ||
        (d.destination || "").toLowerCase().includes(textFilter)
      );
    });
  }

  renderFilterPills("devices-cat-pills", inDevices, (d) => d.modelId, devicesCategoryFilter, (cat) => {
    devicesCategoryFilter = cat;
    resetDevicesPagination();
    renderDevicesView();
  });

  if (devicesCategoryFilter) {
    inDevices = inDevices.filter((d) => {
      const model = state.models.find((m) => m.id === d.modelId);
      return model && (model.category || "") === devicesCategoryFilter;
    });
  }

  if (removedDeptFilter) {
    outDevices = outDevices.filter((d) => (d.department || "") === removedDeptFilter);
  }
  if (removedTextFilter) {
    outDevices = outDevices.filter((d) => {
      const model = state.models.find((m) => m.id === d.modelId) || {};
      const modelName = (model.name || "").toLowerCase();
      const modelCategory = (model.category || "").toLowerCase();
      return (
        modelName.includes(removedTextFilter) ||
        modelCategory.includes(removedTextFilter) ||
        (d.serial || "").toLowerCase().includes(removedTextFilter) ||
        (d.prNumber || "").toLowerCase().includes(removedTextFilter) ||
        (d.destination || "").toLowerCase().includes(removedTextFilter) ||
        (d.reason || "").toLowerCase().includes(removedTextFilter)
      );
    });
  }

  if (devicesRemovedDestFilter) {
    outDevices = outDevices.filter((d) => (d.destination || d.reason || "") === devicesRemovedDestFilter);
  }

  renderFilterPills("removed-cat-pills", outDevices, (d) => d.modelId, removedCategoryFilter, (cat) => {
    removedCategoryFilter = cat;
    resetDevicesPagination();
    renderDevicesView();
  });

  if (removedCategoryFilter) {
    outDevices = outDevices.filter((d) => {
      const model = state.models.find((m) => m.id === d.modelId);
      return model && (model.category || "") === removedCategoryFilter;
    });
  }

  const totalRemoved = state.devices.filter((d) => d.status === "out").length;
  const toggleBtn = document.getElementById("btn-toggle-removed");
  if (toggleBtn) toggleBtn.textContent = `View Removed (${totalRemoved})`;

  const countLabel = document.getElementById("removed-count-label");
  if (countLabel) countLabel.textContent = `${outDevices.length} record${outDevices.length !== 1 ? "s" : ""}`;

  renderDashboard();

  const increment = (viewMode) => viewMode === "grouped" ? INCREMENT_GROUPED : INCREMENT_INDIVIDUAL;

  const renderList = (devices, container, isOut, viewMode, sortDir, visibleCount, previousVisibleCount, onShowMore) => {
    const dateField = isOut ? "removedAt" : "createdAt";
    const inc = increment(viewMode);

    if (!devices.length) {
      container.classList.add("empty-state");
      container.innerHTML = `<p>No ${isOut ? "removed" : "in-stock"} devices match the current filters.</p>`;
      return;
    }
    container.classList.remove("empty-state");

    if (viewMode === "all" || viewMode === "individual") {
      let listDevices = devices;
      if (viewMode === "individual") {
        listDevices = devices.filter(d => !d.kit_id);
      }
      const sorted = listDevices.slice().sort((a, b) =>
        sortDir === "desc"
          ? new Date(b[dateField]) - new Date(a[dateField])
          : new Date(a[dateField]) - new Date(b[dateField])
      );
      const total = sorted.length;
      const toShow = sorted.slice(0, visibleCount);
      const rows = toShow.map((d, idx) => {
        const revealClass = idx >= previousVisibleCount ? " row-reveal" : "";
        const model = state.models.find((m) => m.id === d.modelId);
        if (!isOut) {
          const { rowClass, badge } = getStockAgeInfo(d.createdAt);
          return `<tr class="${rowClass}${revealClass} js-in-row" data-device-id="${d.id}" style="cursor:pointer;" title="Click to remove from stock">
            <td>${model ? model.name + ' ' + getCategoryBadge(model.category) : "Unknown model"}</td>
            <td>${d.department || ""}</td><td>${d.serial}</td>
            <td>${d.prNumber || ""}</td><td>${d.addedBy || ""}</td>
            <td>${formatDateTime(d.createdAt)}${badge}</td>
          </tr>`;
        } else {
          return `<tr class="${revealClass}">
            <td>${model ? model.name + ' ' + getCategoryBadge(model.category) : "Unknown model"}</td>
            <td>${d.department || ""}</td><td>${d.serial}</td>
            <td>${d.prNumber || ""}</td><td>${d.deliveredBy || ""}</td>
            <td>${d.reason || ""}</td><td>${d.destination || ""}</td>
            <td>${formatDateTime(d.removedAt)}</td>
          </tr>`;
        }
      }).join("");

      const headIn = `<th>Model</th><th>Department</th><th>Serial</th><th>PR / Ticket</th><th>Added by</th><th>Added</th>`;
      const headOut = `<th>Model</th><th>Department</th><th>Serial</th><th>PR / Ticket</th><th>Delivered by</th><th>Reason</th><th>Destination</th><th>Removed at</th>`;
      const showMoreHtml = total > visibleCount
        ? `<div class="show-more-row"><button type="button" class="btn btn-show-more js-show-more" data-is-out="${isOut}">Show More</button></div>`
        : "";
      container.innerHTML = `<table><thead><tr>${isOut ? headOut : headIn}</tr></thead><tbody>${rows}</tbody></table>${showMoreHtml}`;

      if (!isOut) {
        container.querySelectorAll("tr.js-in-row").forEach((row) => {
          row.addEventListener("click", () => {
            const id = row.dataset.deviceId;
            if (id) openRemoveSerialDialog(id);
          });
        });
      }

      container.querySelectorAll(".js-show-more").forEach((btn) => {
        btn.addEventListener("click", () => onShowMore());
      });

    } else {
      // Grouped by Kit
      const kitDevices = devices.filter(d => d.kit_id);

      if (!kitDevices.length) {
        container.innerHTML = `<div class="empty-state" style="padding:32px;"><p>No kits found in current filters.<br>Switch to <strong>Individual</strong> to see all devices.</p></div>`;
        return;
      }

      const groups = new Map();
      kitDevices.forEach(d => {
        if (!groups.has(d.kit_id)) groups.set(d.kit_id, []);
        groups.get(d.kit_id).push(d);
      });

      const groupArr = [...groups.entries()].sort((a, b) => {
        const ta = Math.max(...a[1].map(d => +new Date(d[dateField]) || 0));
        const tb = Math.max(...b[1].map(d => +new Date(d[dateField]) || 0));
        return sortDir === "desc" ? tb - ta : ta - tb;
      });

      const total = groupArr.length;
      const toShow = groupArr.slice(0, visibleCount);
      const colCount = isOut ? 6 : 5;
      const headIn = `<th>Model</th><th>Department</th><th>Serial</th><th>Added by</th><th>Added</th>`;
      const headOut = `<th>Model</th><th>Department</th><th>Serial</th><th>Delivered by</th><th>Reason</th><th>Removed at</th>`;

      const bodyRows = toShow.map(([kitId, items], groupIdx) => {
        items.sort((a, b) => sortDir === "desc"
          ? +new Date(b[dateField]) - +new Date(a[dateField])
          : +new Date(a[dateField]) - +new Date(b[dateField]));

        const prNums = [...new Set(items.map(d => d.prNumber).filter(Boolean))].join(", ");
        const itemCount = `${items.length} item${items.length !== 1 ? "s" : ""}`;
        const revealClass = groupIdx >= previousVisibleCount ? " row-reveal" : "";

        const prLabel = prNums ? ` &mdash; PR / Ticket: <span style="opacity:.7">${prNums}</span>` : "";
        const subHeader = `<tr class="kit-sub-header${revealClass}">
            <td colspan="${colCount}" class="kit-ticket-cell">Kit: <strong>${kitId}</strong>${prLabel} <span class="kit-count">${itemCount}</span></td>
          </tr>`;

        const deviceRows = items.map(d => {
          const model = state.models.find(m => m.id === d.modelId);
          if (!isOut) {
            const { rowClass, badge } = getStockAgeInfo(d.createdAt);
            return `<tr class="${rowClass} kit-device-row js-in-row" data-device-id="${d.id}" style="cursor:pointer;" title="Click to remove from stock">
              <td>${model ? model.name + ' ' + getCategoryBadge(model.category) : "Unknown"}</td>
              <td>${d.department || ""}</td>
              <td><strong>${d.serial}</strong></td>
              <td>${d.addedBy || ""}</td>
              <td>${formatDateTime(d.createdAt)}${badge}</td>
            </tr>`;
          } else {
            return `<tr class="kit-device-row">
              <td>${model ? model.name + ' ' + getCategoryBadge(model.category) : "Unknown"}</td>
              <td>${d.department || ""}</td>
              <td><strong>${d.serial}</strong></td>
              <td>${d.deliveredBy || ""}</td>
              <td>${d.reason || ""}</td>
              <td>${formatDateTime(d.removedAt)}</td>
            </tr>`;
          }
        }).join("");

        const spacer = groupIdx < toShow.length - 1
          ? `<tr class="kit-spacer"><td colspan="${colCount}"></td></tr>`
          : "";

        return `${subHeader}${deviceRows}${spacer}`;
      }).join("");

      const showMoreHtml = total > visibleCount
        ? `<div class="show-more-row"><button type="button" class="btn btn-show-more js-show-more" data-is-out="${isOut}">Show More</button></div>`
        : "";
      container.innerHTML = `<table><thead><tr>${isOut ? headOut : headIn}</tr></thead><tbody>${bodyRows}</tbody></table>${showMoreHtml}`;

      if (!isOut) {
        container.querySelectorAll("tr.js-in-row").forEach((row) => {
          row.addEventListener("click", () => {
            const id = row.dataset.deviceId;
            if (id) openRemoveSerialDialog(id);
          });
        });
      }

      container.querySelectorAll(".js-show-more").forEach((btn) => {
        btn.addEventListener("click", () => onShowMore());
      });
    }
  };

  renderList(inDevices, inContainer, false, viewModeIn, devicesSort, visibleIn, previousVisibleIn, () => {
    previousVisibleIn = visibleIn;
    visibleIn += increment(viewModeIn);
    renderDevicesView();
  });
  renderList(outDevices, outContainer, true, viewModeOut, removedSort, visibleOut, previousVisibleOut, () => {
    previousVisibleOut = visibleOut;
    visibleOut += increment(viewModeOut);
    renderDevicesView();
  });

  previousVisibleIn = visibleIn;
  previousVisibleOut = visibleOut;
}

function renderHistoryView() {
  const container = document.getElementById("history-table-container");
  if (!container) return;
  if (!state.history.length) {
    container.classList.add("empty-state");
    container.innerHTML = "<p>No activity yet. Add or remove devices to see history.</p>";
    return;
  }
  container.classList.remove("empty-state");

  const yearSelectEl = document.getElementById("filter-history-year");
  if (yearSelectEl) {
    const previousYear = yearSelectEl.value;
    const yearsSet = new Set();

    state.history.forEach((h) => {
      const d = new Date(h.at);
      if (!Number.isNaN(d.getTime())) {
        yearsSet.add(d.getFullYear());
      }
    });
    state.models.forEach((m) => {
      const d = new Date(m.createdAt);
      if (!Number.isNaN(d.getTime())) {
        yearsSet.add(d.getFullYear());
      }
    });

    const years = Array.from(yearsSet)
      .filter((y) => y >= 2026)
      .sort((a, b) => b - a);

    let optionsHtml = '<option value="">All years</option>';
    years.forEach((y) => {
      optionsHtml += `<option value="${y}">${y}</option>`;
    });
    yearSelectEl.innerHTML = optionsHtml;

    if (previousYear && years.includes(Number(previousYear))) {
      yearSelectEl.value = previousYear;
    }
  }

  const typeFilterEl = document.getElementById("filter-history-type");
  const yearFilterEl = document.getElementById("filter-history-year");
  const monthFilterEl = document.getElementById("filter-history-month");
  const deviceFilterEl = document.getElementById("filter-history-device");

  const typeFilter = typeFilterEl ? typeFilterEl.value : "";
  const yearFilter = yearFilterEl ? yearFilterEl.value : "";
  const monthFilter = monthFilterEl ? monthFilterEl.value : "";
  const deviceFilter = deviceFilterEl ? deviceFilterEl.value.trim().toLowerCase() : "";

  let entries = state.history.slice();
  if (typeFilter === "in" || typeFilter === "out") {
    entries = entries.filter((h) => h.type === typeFilter);
  }

  if (yearFilter) {
    const yFilterNum = Number(yearFilter);
    entries = entries.filter((h) => {
      const d = new Date(h.at);
      if (Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === yFilterNum;
    });
  }

  if (monthFilter) {
    const mFilterNum = Number(monthFilter);
    entries = entries.filter((h) => {
      const d = new Date(h.at);
      if (Number.isNaN(d.getTime())) return false;
      return d.getMonth() + 1 === mFilterNum;
    });
  }

  if (deviceFilter) {
    entries = entries.filter((h) => {
      const model = state.models.find((m) => m.id === h.modelId);
      const modelName = model ? model.name.toLowerCase() : "";
      const serial = (h.serial || "").toLowerCase();
      return modelName.includes(deviceFilter) || serial.includes(deviceFilter);
    });
  }

  renderFilterPills("history-cat-pills", entries, (h) => h.modelId, historyCategoryFilter, (cat) => {
    historyCategoryFilter = cat;
    visibleHistory = DEFAULT_LIMIT_HISTORY;
    previousVisibleHistory = 0;
    renderHistoryView();
  });

  if (historyCategoryFilter) {
    entries = entries.filter((h) => {
      const model = state.models.find((m) => m.id === h.modelId);
      return model && (model.category || "") === historyCategoryFilter;
    });
  }

  const sorted = entries.sort((a, b) =>
    historySort === "asc"
      ? new Date(a.at) - new Date(b.at)
      : new Date(b.at) - new Date(a.at)
  );

  const total = sorted.length;
  const toShow = sorted.slice(0, visibleHistory);

  const rows = toShow
    .map((h, idx) => {
      const model = state.models.find((m) => m.id === h.modelId);
      const statusClass = h.type === "in" ? "status-in" : "status-out";
      const label = h.type === "in" ? "Added to stock" : "Removed from stock";
      const technician = h.addedBy || h.deliveredBy || "";
      const dash = '<span style="color:var(--text-muted)">—</span>';
      const reason = h.reason || (h.type === "in" ? dash : "");
      const destination = h.destination || (h.type === "in" ? dash : "");
      let rowClass = "";
      if (h.type === "in") {
        const device = state.devices.find((d) => d.serial === h.serial && d.modelId === h.modelId && d.status === "in");
        if (device) {
          const info = getStockAgeInfo(device.createdAt);
          rowClass = info.rowClass;
        }
      }
      const revealClass = idx >= previousVisibleHistory ? " row-reveal" : "";
      return `
        <tr class="${rowClass}${revealClass}">
          <td><span class="status-chip ${statusClass}">${label}</span></td>
          <td>${model ? model.name + ' ' + getCategoryBadge(model.category) : "Unknown model"}</td>
          <td>${h.serial}</td>
          <td>${technician}</td>
          <td>${reason}</td>
          <td>${destination}</td>
          <td>${formatDateTime(h.at)}</td>
        </tr>
      `;
    })
    .join("");

  const showMoreHtml = total > visibleHistory
    ? `<div class="show-more-row"><button type="button" class="btn btn-show-more js-history-show-more">Show More</button></div>`
    : "";

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Model</th>
          <th>Serial</th>
          <th>Handled by</th>
          <th>Reason</th>
          <th>Destination</th>
          <th>At</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${showMoreHtml}
  `;

  previousVisibleHistory = visibleHistory;

  container.querySelectorAll(".js-history-show-more").forEach((btn) => {
    btn.addEventListener("click", () => {
      previousVisibleHistory = visibleHistory;
      visibleHistory += INCREMENT_HISTORY;
      renderHistoryView();
    });
  });
}

function openAddModelDialog() {
  document.getElementById("add-model-dialog").classList.remove("hidden");
  document.getElementById("model-name-input").focus();
}

function closeAddModelDialog() {
  document.getElementById("add-model-dialog").classList.add("hidden");
  document.getElementById("add-model-form").reset();
  const catInput = document.getElementById("model-category-input");
  if (catInput) catInput.value = "";
}

function openRemoveSerialDialog(deviceId) {
  pendingRemoveDeviceId = deviceId;
  document.getElementById("remove-serial-dialog").classList.remove("hidden");
  populateDeliveredBySelect();
  document.getElementById("remove-reason-input").focus();
}

function closeRemoveSerialDialog() {
  pendingRemoveDeviceId = null;
  document.getElementById("remove-serial-dialog").classList.add("hidden");
  document.getElementById("remove-serial-form").reset();
}

async function addModel(name, notes, category) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const cleanCategory = (category || "").trim();
  if (!cleanCategory) {
    showToast("Please select a category.");
    return;
  }
  try {
    const newModelId = uid();
    await apiCall('POST', '/models', {
      id: newModelId,
      name: trimmed,
      notes: (notes || "").trim(),
      category: cleanCategory,
      createdAt: new Date().toISOString()
    });
    const model = { id: newModelId, name: trimmed, notes, category: cleanCategory, createdAt: new Date().toISOString() };
    state.models.push(model);
    renderAll();
    showToast(`Model ${model.name} created.`);
    return model;
  } catch (e) {
    showToast(`Error creating model: ${e.message}`);
  }
}

async function addDeviceSerial(modelId, serial, department, prNumber, addedBy) {
  const model = state.models.find((m) => m.id === modelId);
  if (!model) return;
  const cleanSerial = serial.trim();
  if (!cleanSerial) return;
  const cleanDepartment = (department || "").trim();
  if (!cleanDepartment) {
    showToast("Please select a department.");
    return;
  }
  const cleanPr = (prNumber || "").trim();
  if (!cleanPr) {
    showToast("Please enter a PR number or ticket.");
    return;
  }
  const cleanAddedBy = (addedBy || "").trim();
  if (!cleanAddedBy) {
    showToast("Please select who is adding this device.");
    return;
  }

  const existing = state.devices.find(
    (d) => d.modelId === modelId && d.serial.toLowerCase() === cleanSerial.toLowerCase() && d.status === "in"
  );
  if (existing) {
    showToast("This serial is already in stock for this model.");
    return;
  }

  try {
    await apiCall('POST', '/devices', {
      id: uid(),
      modelId,
      serial: cleanSerial,
      prNumber: cleanPr,
      status: "in",
      department: cleanDepartment,
      addedBy: cleanAddedBy,
      createdAt: new Date().toISOString()
    });

    const device = {
      id: uid(),
      modelId,
      serial: cleanSerial,
      prNumber: cleanPr,
      status: "in",
      department: cleanDepartment,
      addedBy: cleanAddedBy,
      createdAt: new Date().toISOString(),
      removedAt: null,
      reason: "",
      destination: ""
    };
    state.devices.push(device);
    renderAll();
    showToast(`Serial added to ${model.name}.`);
  } catch (e) {
    showToast(`Error adding serial: ${e.message}`);
  }
}

async function removeDeviceFromStock(deviceId, reason, deliveredBy, destination) {
  const device = state.devices.find((d) => d.id === deviceId);
  if (!device || device.status !== "in") return;
  const model = state.models.find((m) => m.id === device.modelId);

  try {
    await apiCall('PUT', `/devices/${deviceId}`, {
      status: "out",
      reason: (reason || "").trim(),
      deliveredBy: (deliveredBy || "").trim(),
      destination: (destination || "").trim()
    });

    device.status = "out";
    device.removedAt = new Date().toISOString();
    device.reason = (reason || "").trim();
    device.deliveredBy = (deliveredBy || "").trim();
    device.destination = (destination || "").trim();

    renderAll();
    showToast(`Serial removed from stock${model ? " for " + model.name : ""}.`);
  } catch (e) {
    showToast(`Error removing device: ${e.message}`);
  }
}

const nhkState = {
  step: 1,
  kitId: "",
  selectedItems: [],
  otherItemText: "",
  otherNoSerial: false,
  serialInputs: {},
  prNumber: "",
  department: "",
  addedBy: "",
};

function openNewHireKitDialog() {
  nhkState.step = 1;
  nhkState.kitId = "";
  nhkState.selectedItems = [];
  nhkState.otherItemText = "";
  nhkState.otherNoSerial = false;
  nhkState.serialInputs = {};
  nhkState.prNumber = "";
  nhkState.department = "";
  nhkState.addedBy = (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'delivery') ? currentUser.username : "";
  document.getElementById("new-hire-kit-dialog").classList.remove("hidden");
  nhkRenderStep();
}

function closeNewHireKitDialog() {
  document.getElementById("new-hire-kit-dialog").classList.add("hidden");
}

function nhkUpdateStepper() {
  [1, 2, 3].forEach((n) => {
    const dot = document.getElementById(`nhk-step-dot-${n}`);
    if (!dot) return;
    dot.classList.remove("active", "done");
    if (n < nhkState.step) dot.classList.add("done");
    else if (n === nhkState.step) dot.classList.add("active");
  });
  const connectors = document.querySelectorAll(".nhk-step-connector");
  connectors.forEach((c, i) => {
    c.classList.toggle("done", nhkState.step > i + 1);
  });
}

function nhkRenderStep() {
  nhkUpdateStepper();
  const content = document.getElementById("nhk-step-content");
  if (!content) return;
  if (nhkState.step === 1) nhkRenderStep1(content);
  else if (nhkState.step === 2) nhkRenderStep2(content);
  else if (nhkState.step === 3) nhkRenderStep3(content);
}

function nhkRenderStep1(container) {
  const otherModelOptions = state.models
    .filter((m) => m.category === "Other")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => `<option value="${m.name.replace(/"/g, "&quot;")}"></option>`)
    .join("");

  const checkboxRows = KIT_ACCESSORIES.map((item) => {
    const isChecked = nhkState.selectedItems.includes(item);
    const isOther = item === "Other";
    return `
      <label class="nhk-model-card${isChecked ? " selected" : ""}" data-item="${item}">
        <input type="checkbox" class="nhk-acc-cb" data-item="${item}" ${isChecked ? "checked" : ""} />
        <div class="nhk-card-label">${item}</div>
      </label>
      ${isOther ? `
        <datalist id="nhk-other-datalist">${otherModelOptions}</datalist>
        <input type="text" id="nhk-other-text" class="nhk-other-input${isChecked ? "" : " hidden"}" placeholder="Please specify…" value="${nhkState.otherItemText.replace(/"/g, "&quot;")}" list="nhk-other-datalist" autocomplete="off" />
      ` : ""}
    `;
  }).join("");

  container.innerHTML = `
    <div class="nhk-hire-name-row">
      <label for="nhk-kit-id-input">Kit ID — Ticket # or New Hire Name <span style="color:var(--danger)">*</span></label>
      <input id="nhk-kit-id-input" type="text" placeholder="e.g. Jane-Smith-2026 or PR-20345" value="${nhkState.kitId.replace(/"/g, "&quot;")}" autocomplete="off" />
      <p style="font-size:0.7rem;color:var(--text-muted);margin:3px 0 0;">This ID links all kit devices so you can deploy them all later with one click.</p>
    </div>
    <p style="font-size:0.78rem;color:var(--text-muted);margin:10px 0 6px;">Select the accessories to include in this kit:</p>
    <div class="nhk-model-list">${checkboxRows}</div>
    <div class="nhk-footer">
      <button class="btn ghost" id="nhk-btn-cancel-s1">Cancel</button>
      <button class="btn primary" id="nhk-btn-next-s1">Next: Add Serials →</button>
    </div>
  `;

  const kitIdInput = document.getElementById("nhk-kit-id-input");
  kitIdInput.focus();
  kitIdInput.addEventListener("input", () => { nhkState.kitId = kitIdInput.value; });

  const otherTextInput = document.getElementById("nhk-other-text");
  if (otherTextInput) {
    otherTextInput.addEventListener("input", () => { nhkState.otherItemText = otherTextInput.value; });
  }

  container.querySelectorAll(".nhk-acc-cb").forEach((cb) => {
    cb.addEventListener("change", () => {
      const item = cb.dataset.item;
      const card = cb.closest(".nhk-model-card");
      if (cb.checked) {
        if (!nhkState.selectedItems.includes(item)) nhkState.selectedItems.push(item);
        if (card) card.classList.add("selected");
        if (item === "Other" && otherTextInput) otherTextInput.classList.remove("hidden");
      } else {
        nhkState.selectedItems = nhkState.selectedItems.filter((x) => x !== item);
        if (card) card.classList.remove("selected");
        if (item === "Other" && otherTextInput) otherTextInput.classList.add("hidden");
      }
    });
  });

  container.querySelectorAll(".nhk-model-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.type === "checkbox" || e.target === otherTextInput) return;
      const cb = card.querySelector("input[type=checkbox]");
      if (!cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event("change"));
    });
  });

  document.getElementById("nhk-btn-cancel-s1").addEventListener("click", closeNewHireKitDialog);
  document.getElementById("nhk-btn-next-s1").addEventListener("click", () => {
    nhkState.kitId = document.getElementById("nhk-kit-id-input").value.trim();
    if (!nhkState.kitId) {
      showToast("Please enter a Kit ID (ticket # or hire name).");
      document.getElementById("nhk-kit-id-input").focus();
      return;
    }
    if (nhkState.selectedItems.length === 0) {
      showToast("Select at least one accessory for the kit.");
      return;
    }
    if (nhkState.selectedItems.includes("Other") && !nhkState.otherItemText.trim()) {
      showToast('Please specify what "Other" is.');
      document.getElementById("nhk-other-text")?.focus();
      return;
    }
    nhkState.step = 2;
    nhkRenderStep();
  });
}

function nhkRenderStep2(container) {
  const isNhkAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'delivery');
  const techOptions = isNhkAdmin
    ? state.technicians
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .map((t) => `<option value="${t}" ${t === nhkState.addedBy ? "selected" : ""}>${t}</option>`)
        .join("")
    : `<option value="${currentUser.username}" selected>${currentUser.username}</option>`;

  const serialCards = nhkState.selectedItems.map((item) => {
    const displayName = item === "Other" ? (nhkState.otherItemText || "Other") : item;
    const noSerial = NO_SERIAL_ITEMS.has(item);
    const isOther = item === "Other";
    const currentSerial = nhkState.serialInputs[item] || "";
    const otherNa = isOther && nhkState.otherNoSerial;

    if (noSerial) {
      return `
        <div class="nhk-assign-card">
          <div>
            <div class="nhk-assign-model-name">${displayName}</div>
            <div class="nhk-assign-model-count">No serial required</div>
          </div>
          <span class="nhk-no-serial-label">N/A</span>
        </div>
      `;
    }

    if (isOther) {
      return `
        <div class="nhk-assign-card nhk-assign-card--other" data-item="Other">
          <div style="flex:1;min-width:0;">
            <div class="nhk-assign-model-name">${displayName}</div>
            <div class="nhk-assign-model-count" style="margin-bottom:6px;">Serial number</div>
            <div class="nhk-other-serial-toggle" style="display:flex;gap:8px;margin-bottom:6px;">
              <button type="button" class="btn ${!otherNa ? "primary" : "ghost"} btn-sm nhk-other-toggle-serial" style="font-size:0.75rem;padding:3px 10px;">Add Serial</button>
              <button type="button" class="btn ${otherNa ? "primary" : "ghost"} btn-sm nhk-other-toggle-na" style="font-size:0.75rem;padding:3px 10px;">N/A</button>
            </div>
            ${!otherNa
              ? `<input type="text" class="nhk-new-serial-input" data-item-name="Other" placeholder="e.g. SN-ABC123" value="${currentSerial.replace(/"/g, "&quot;")}" autocomplete="off" style="width:100%;box-sizing:border-box;" />`
              : `<span class="nhk-no-serial-label">N/A — no serial</span>`
            }
          </div>
        </div>
      `;
    }

    return `
      <div class="nhk-assign-card">
        <div>
          <div class="nhk-assign-model-name">${displayName}</div>
          <div class="nhk-assign-model-count">New serial</div>
        </div>
        <input
          type="text"
          class="nhk-new-serial-input"
          data-item-name="${item}"
          placeholder="e.g. SN-ABC123"
          value="${currentSerial.replace(/"/g, "&quot;")}"
          autocomplete="off"
        />
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 8px;">
      Enter new serial numbers to add to stock under Kit ID <strong>${nhkState.kitId}</strong>:
    </p>
    <div class="nhk-assign-grid">${serialCards}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-top:12px;">
      <div class="form-field">
        <label>PR Number / Ticket <span style="color:var(--danger)">*</span></label>
        <input type="text" id="nhk-pr-input" placeholder="e.g. PR-12345" value="${nhkState.prNumber.replace(/"/g, "&quot;")}" />
      </div>
      <div class="form-field">
        <label>Department <span style="color:var(--danger)">*</span></label>
        <select id="nhk-dept-select">
          <option value="">Select department…</option>
          <option value="Planta Oeste" ${nhkState.department === "Planta Oeste" ? "selected" : ""}>Planta Oeste</option>
          <option value="Planta Este" ${nhkState.department === "Planta Este" ? "selected" : ""}>Planta Este</option>
        </select>
      </div>
      <div class="form-field">
        <label>Added by <span style="color:var(--danger)">*</span></label>
        <select id="nhk-addedby-select" ${isNhkAdmin ? '' : 'disabled'}>
          ${isNhkAdmin ? '<option value="">Select person…</option>' : ''}
          ${techOptions}
        </select>
      </div>
    </div>
    <div class="nhk-footer">
      <button class="btn ghost" id="nhk-btn-back-s2">← Back</button>
      <button class="btn primary" id="nhk-btn-next-s2">Review Entry →</button>
    </div>
  `;

  container.querySelectorAll(".nhk-new-serial-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      nhkState.serialInputs[inp.dataset.itemName] = inp.value;
    });
  });

  const toggleSerial = container.querySelector(".nhk-other-toggle-serial");
  const toggleNa = container.querySelector(".nhk-other-toggle-na");
  if (toggleSerial && toggleNa) {
    toggleSerial.addEventListener("click", () => {
      nhkState.otherNoSerial = false;
      _nhkCollectStep2Fields(container);
      nhkRenderStep2(container);
    });
    toggleNa.addEventListener("click", () => {
      nhkState.otherNoSerial = true;
      _nhkCollectStep2Fields(container);
      nhkRenderStep2(container);
    });
  }

  document.getElementById("nhk-btn-back-s2").addEventListener("click", () => {
    _nhkCollectStep2Fields(container);
    nhkState.step = 1;
    nhkRenderStep();
  });

  document.getElementById("nhk-btn-next-s2").addEventListener("click", () => {
    _nhkCollectStep2Fields(container);
    const missingSerials = nhkState.selectedItems.filter(
      (item) => !NO_SERIAL_ITEMS.has(item)
        && !(item === "Other" && nhkState.otherNoSerial)
        && !(nhkState.serialInputs[item] || "").trim()
    );
    if (missingSerials.length > 0) {
      const names = missingSerials.map((item) => item === "Other" ? (nhkState.otherItemText || "Other") : item).join(", ");
      showToast(`Enter a serial number for: ${names}`);
      return;
    }
    if (!nhkState.prNumber.trim()) { showToast("Please enter a PR Number / Ticket."); return; }
    if (!nhkState.department) { showToast("Please select a department."); return; }
    if (!nhkState.addedBy) { showToast("Please select who is adding these devices."); return; }
    const serialItems = nhkState.selectedItems.filter(
      (item) => !NO_SERIAL_ITEMS.has(item) && !(item === "Other" && nhkState.otherNoSerial)
    );
    const serials = serialItems.map((item) => nhkState.serialInputs[item].trim().toLowerCase());
    if (new Set(serials).size !== serials.length) {
      showToast("Each serial number must be unique within the kit.");
      return;
    }
    nhkState.step = 3;
    nhkRenderStep();
  });
}

function _nhkCollectStep2Fields(container) {
  container.querySelectorAll(".nhk-new-serial-input").forEach((inp) => {
    nhkState.serialInputs[inp.dataset.itemName] = inp.value;
  });
  const pr = document.getElementById("nhk-pr-input");
  const dept = document.getElementById("nhk-dept-select");
  const by = document.getElementById("nhk-addedby-select");
  if (pr) nhkState.prNumber = pr.value;
  if (dept) nhkState.department = dept.value;
  if (by) nhkState.addedBy = by.value;
}

function nhkRenderStep3(container) {
  const items = nhkState.selectedItems.map((item) => {
    const displayName = item === "Other" ? (nhkState.otherItemText || "Other") : item;
    const serial = nhkState.serialInputs[item] || "—";
    return `
      <div class="nhk-confirm-item">
        <span class="nhk-ci-model">${displayName}</span>
        <span class="nhk-ci-serial">${serial}</span>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="nhk-confirm-header">
      <span class="nhk-hire-label">Kit ID (Ticket / New Hire Name):</span>
      <span class="nhk-hire-value">${nhkState.kitId}</span>
    </div>
    <div style="display:flex;gap:14px;font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;flex-wrap:wrap;">
      <span>PR: <strong style="color:var(--text-main)">${nhkState.prNumber}</strong></span>
      <span>Dept: <strong style="color:var(--text-main)">${nhkState.department}</strong></span>
      <span>Added by: <strong style="color:var(--text-main)">${nhkState.addedBy}</strong></span>
    </div>
    <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 8px;">
      The following serials will be <strong>added to stock</strong> and tagged with this Kit ID:
    </p>
    <div class="nhk-confirm-list">${items}</div>
    <div class="nhk-footer">
      <button class="btn ghost" id="nhk-btn-back-s3">← Back</button>
      <button class="btn primary" id="nhk-btn-submit">Add to Stock</button>
    </div>
  `;

  document.getElementById("nhk-btn-back-s3").addEventListener("click", () => {
    nhkState.step = 2;
    nhkRenderStep();
  });
  document.getElementById("nhk-btn-submit").addEventListener("click", submitNewHireKit);
}

async function submitNewHireKit() {
  const kitId = nhkState.kitId.trim();
  if (!kitId) { showToast("Kit ID is missing."); return; }

  const now = new Date().toISOString();
  let addedCount = 0;

  for (const item of nhkState.selectedItems) {
    const itemName = item === "Other" ? (nhkState.otherItemText.trim() || "Other") : item;
    const noSerial = NO_SERIAL_ITEMS.has(item) || (item === "Other" && nhkState.otherNoSerial);
    const cleanSerial = noSerial ? "N/A" : (nhkState.serialInputs[item] || "").trim();
    if (!noSerial && !cleanSerial) continue;

    let model = state.models.find((m) => m.name.toLowerCase() === itemName.toLowerCase());
    if (!model) {
      const category = KIT_ACCESSORY_CATEGORIES[item] || "Other";
      try {
        const newModelId = uid();
        await apiCall('POST', '/models', {
          id: newModelId,
          name: itemName,
          category,
          notes: "",
          createdAt: now
        });
        model = { id: newModelId, name: itemName, category, createdAt: now };
        state.models.push(model);
      } catch (e) {
        console.error("Error creating model:", e);
        continue;
      }
    }
    const modelId = model.id;

    if (!noSerial) {
      const duplicate = state.devices.find(
        (d) => d.modelId === modelId && d.serial.toLowerCase() === cleanSerial.toLowerCase() && d.status === "in"
      );
      if (duplicate) {
        showToast(`"${cleanSerial}" already in stock for ${itemName}. Skipped.`);
        continue;
      }
    }

    try {
      const newDeviceId = uid();
      await apiCall('POST', '/devices', {
        id: newDeviceId,
        modelId,
        serial: cleanSerial,
        prNumber: nhkState.prNumber.trim(),
        status: "in",
        department: nhkState.department,
        addedBy: nhkState.addedBy,
        kit_id: kitId,
        createdAt: now
      });

      state.devices.push({
        id: newDeviceId,
        modelId,
        serial: cleanSerial,
        prNumber: nhkState.prNumber.trim(),
        status: "in",
        department: nhkState.department,
        addedBy: nhkState.addedBy,
        kit_id: kitId,
        createdAt: now,
        removedAt: null,
        reason: "",
        destination: "",
      });

      addedCount++;
    } catch (e) {
      console.error("Error adding device:", e);
    }
  }

  if (addedCount === 0) {
    showToast("No devices were added. Check for duplicate serials.");
    return;
  }

  renderAll();
  closeNewHireKitDialog();
  showToast(`${addedCount} device${addedCount > 1 ? "s" : ""} added to stock under Kit "${kitId}".`);
}

function getKitItems(kitId) {
  return state.devices.filter((d) => d.kit_id === kitId && d.status === "in");
}

function renderKitDeployResults(kitId) {
  const resultsEl = document.getElementById("kit-deploy-results");
  const deployBtn = document.getElementById("btn-deploy-kit");
  if (!resultsEl) return;

  if (!kitId) {
    resultsEl.classList.add("empty-state");
    resultsEl.innerHTML = "<p>Enter a Kit ID and click Search.</p>";
    if (deployBtn) deployBtn.classList.add("hidden");
    return;
  }

  const items = getKitItems(kitId);
  if (!items.length) {
    resultsEl.classList.add("empty-state");
    resultsEl.innerHTML = `<p>No in-stock devices found for kit <strong>"${kitId}"</strong>.</p>`;
    if (deployBtn) deployBtn.classList.add("hidden");
    return;
  }

  resultsEl.classList.remove("empty-state");
  const rows = items
    .sort((a, b) => a.serial.localeCompare(b.serial))
    .map((d) => {
      const model = state.models.find((m) => m.id === d.modelId);
      return `
        <tr>
          <td>${model ? model.name + ' ' + getCategoryBadge(model.category) : "Unknown"}</td>
          <td>${d.serial}</td>
          <td>${d.prNumber || ""}</td>
          <td>${d.department || ""}</td>
          <td>${d.addedBy || ""}</td>
          <td>${formatDateTime(d.createdAt)}</td>
        </tr>
      `;
    }).join("");

  resultsEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Model</th><th>Serial</th><th>PR / Ticket</th><th>Department</th><th>Added by</th><th>Added</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  if (deployBtn) {
    deployBtn.classList.remove("hidden");
    deployBtn.textContent = `Remove All (${items.length} device${items.length > 1 ? "s" : ""})`;
  }
}

async function deployKit(kitId) {
  const deliveredBy = (document.getElementById("kit-deploy-delivered-by")?.value || "").trim();
  if (!deliveredBy) {
    showToast("Please select who is removing this kit.");
    document.getElementById("kit-deploy-delivered-by")?.focus();
    return;
  }
  const items = getKitItems(kitId);
  if (!items.length) {
    showToast("No in-stock devices found for this kit.");
    return;
  }
  if (!confirm(`Remove all ${items.length} device${items.length > 1 ? "s" : ""} in kit "${kitId}"?\n\nThey will be marked as Removed from stock.`)) return;

  const now = new Date().toISOString();
  
  for (const device of items) {
    try {
      await apiCall('PUT', `/devices/${device.id}`, {
        status: "out",
        reason: "New Hire Kit Deployment",
        deliveredBy: deliveredBy,
        destination: kitId
      });

      device.status = "out";
      device.removedAt = now;
      device.reason = "New Hire Kit Deployment";
      device.deliveredBy = deliveredBy;
      device.destination = kitId;
    } catch (e) {
      console.error("Error removing device:", e);
    }
  }

  renderAll();

  const resultsEl = document.getElementById("kit-deploy-results");
  const deployBtn = document.getElementById("btn-deploy-kit");
  if (resultsEl) {
    resultsEl.classList.add("empty-state");
    resultsEl.innerHTML = `<p>Kit "${kitId}" deployed by ${deliveredBy}. ${items.length} device${items.length > 1 ? "s" : ""} removed from stock.</p>`;
  }
  if (deployBtn) deployBtn.classList.add("hidden");
  showToast(`Kit "${kitId}" deployed by ${deliveredBy} — ${items.length} device${items.length > 1 ? "s" : ""} removed.`);
}

function exportData() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data: { models: state.models, devices: state.devices, history: state.history } }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rack-inventory-backup.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importDataFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const text = event.target.result;
      const parsed = JSON.parse(text);
      const payload = parsed.data || parsed;
      if (!payload || !Array.isArray(payload.models) || !Array.isArray(payload.devices) || !Array.isArray(payload.history)) {
        showToast("Invalid backup file.");
        return;
      }
      state.models = payload.models;
      state.devices = payload.devices;
      state.history = payload.history;
      renderAll();
      showToast("Inventory imported.");
    } catch (e) {
      console.error("Import error", e);
      showToast("Failed to import file.");
    }
  };
  reader.readAsText(file);
}

function switchView(viewId) {
  document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
  const selected = document.getElementById("view-" + viewId);
  if (selected) {
    selected.classList.add("active");
  }
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    if (btn.dataset.view === viewId) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  if (viewId === 'admin') loadAdminUsers();
}

function renderKitDeployDropdown() {
  const sel = document.getElementById("kit-deploy-select");
  if (!sel) return;
  const prevVal = sel.value;

  const kitIds = [...new Set(
    state.devices
      .filter((d) => d.kit_id && d.status === "in")
      .map((d) => d.kit_id)
  )].sort((a, b) => a.localeCompare(b));

  sel.innerHTML = kitIds.length
    ? '<option value="">— Select a kit —</option>'
    : '<option value="">— No kits in stock —</option>';

  kitIds.forEach((id) => {
    const count = state.devices.filter((d) => d.kit_id === id && d.status === "in").length;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = `${id}  (${count} device${count > 1 ? "s" : ""})`;
    sel.appendChild(opt);
  });

  if (prevVal && kitIds.includes(prevVal)) {
    sel.value = prevVal;
  } else if (prevVal) {
    const resultsEl = document.getElementById("kit-deploy-results");
    const deployBtn = document.getElementById("btn-deploy-kit");
    if (resultsEl) {
      resultsEl.classList.add("empty-state");
      resultsEl.innerHTML = "<p>Select a kit from the dropdown above.</p>";
    }
    if (deployBtn) deployBtn.classList.add("hidden");
  }

  const bySelect = document.getElementById("kit-deploy-delivered-by");
  if (bySelect) {
    if (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'delivery') {
      bySelect.innerHTML = `<option value="${currentUser.username}">${currentUser.username}</option>`;
      bySelect.value = currentUser.username;
      bySelect.disabled = true;
    } else {
      bySelect.disabled = false;
      const prevBy = bySelect.value;
      bySelect.innerHTML = '<option value="">Select person…</option>';
      state.technicians
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .forEach((name) => {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          bySelect.appendChild(opt);
        });
      if (prevBy && state.technicians.includes(prevBy)) bySelect.value = prevBy;
    }
  }
}

function rebuildHistory() {
  const history = [];
  state.devices.forEach(d => {
    history.push({
      id: d.id + '-in', type: 'in', at: d.createdAt,
      modelId: d.modelId, serial: d.serial, prNumber: d.prNumber,
      department: d.department, addedBy: d.addedBy,
    });
    if (d.status === 'out' && d.removedAt) {
      history.push({
        id: d.id + '-out', type: 'out', at: d.removedAt,
        modelId: d.modelId, serial: d.serial, prNumber: d.prNumber,
        department: d.department, addedBy: d.addedBy,
        reason: d.reason, deliveredBy: d.deliveredBy, destination: d.destination,
      });
    }
  });
  history.sort((a, b) => new Date(b.at) - new Date(a.at));
  state.history = history;
}

function renderAll() {
  rebuildHistory();
  renderDashboard();
  renderModelsTable();
  renderDevicesView();
  renderHistoryView();
  renderKitDeployDropdown();
  if (currentModelId) {
    openModelDetail(currentModelId);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadFromBackend();

  // Populate initial selects
  populateTechnicianSelect();

  // Nav
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });

  const logoArea = document.getElementById("app-logo-area");
  if (logoArea) {
    logoArea.addEventListener("click", () => {
      switchView("devices");
    });
  }

  // Models
  updateModelsHeader();
  document.getElementById("btn-cancel-add-model").addEventListener("click", closeAddModelDialog);

  // Admin panel
  const btnOpenAddUser = document.getElementById('btn-open-add-user-dialog');
  if (btnOpenAddUser) btnOpenAddUser.addEventListener('click', openAddUserDialog);
  const btnCloseAddUser = document.getElementById('btn-close-add-user-dialog');
  if (btnCloseAddUser) btnCloseAddUser.addEventListener('click', closeAddUserDialog);
  const btnCancelAddUser = document.getElementById('btn-cancel-add-user');
  if (btnCancelAddUser) btnCancelAddUser.addEventListener('click', closeAddUserDialog);
  const addUserForm = document.getElementById('add-user-form');
  if (addUserForm) addUserForm.addEventListener('submit', saveUser);
  document.getElementById("add-model-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("model-name-input").value;
    const category = document.getElementById("model-category-input").value;
    const model = addModel(name, "", category);
    if (model) {
      closeAddModelDialog();
    }
  });

  // Close model detail
  document.getElementById("btn-close-model-detail").addEventListener("click", closeModelDetail);

  // Add serial form
  const addSerialForm = document.getElementById("add-serial-form");
  addSerialForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!currentModelId) {
      showToast("Select a model first.");
      return;
    }
    const serial = document.getElementById("serial-number-input").value;
    const department = document.getElementById("serial-department-select").value;
    const prNumber = document.getElementById("serial-pr-input").value;
    const addedBy = document.getElementById("serial-added-by-select").value;
    addDeviceSerial(currentModelId, serial, department, prNumber, addedBy);
    addSerialForm.reset();
    const sel = document.getElementById("serial-added-by-select");
    if (sel && addedBy) sel.value = addedBy;
  });

  // Add technician
  const addedBySelect = document.getElementById("serial-added-by-select");
  if (addedBySelect) {
    addedBySelect.addEventListener("change", () => {
      if (addedBySelect.value !== "__add_new__") return;
      const name = prompt("Enter the new person's name:");
      if (name && name.trim()) {
        addTechnician(name.trim());
      } else {
        addedBySelect.value = "";
      }
    });
  }

  // Remove serial dialog
  document.getElementById("btn-cancel-remove-serial").addEventListener("click", closeRemoveSerialDialog);
  document.getElementById("remove-serial-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!pendingRemoveDeviceId) {
      closeRemoveSerialDialog();
      return;
    }
    const reason = document.getElementById("remove-reason-input").value;
    const deliveredBy = document.getElementById("remove-delivered-by-select").value;
    const destination = document.getElementById("remove-destination-input").value;
    removeDeviceFromStock(pendingRemoveDeviceId, reason, deliveredBy, destination);
    closeRemoveSerialDialog();
  });

  // Export / Import
  document.getElementById("btn-export-data").addEventListener("click", exportData);
  document.getElementById("file-import-data").addEventListener("change", (e) => {
    const file = e.target.files[0];
    importDataFromFile(file);
    e.target.value = "";
  });
  document.getElementById("btn-clear-all-data").addEventListener("click", clearAllData);

  // Device filters
  const deptFilterEl = document.getElementById("filter-department");
  const textFilterEl = document.getElementById("filter-location-owner");
  const clearFiltersBtn = document.getElementById("btn-clear-filters");
  const historyTypeFilterEl = document.getElementById("filter-history-type");
  const historyYearSelect = document.getElementById("filter-history-year");
  const historyMonthSelect = document.getElementById("filter-history-month");

  if (deptFilterEl) {
    deptFilterEl.addEventListener("change", () => { resetDevicesPagination(); renderDevicesView(); });
  }
  if (textFilterEl) {
    textFilterEl.addEventListener("input", () => { resetDevicesPagination(); renderDevicesView(); });
  }
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      if (deptFilterEl) deptFilterEl.value = "";
      if (textFilterEl) textFilterEl.value = "";
      devicesCategoryFilter = "";
      resetDevicesPagination();
      renderDevicesView();
    });
  }

  if (historyTypeFilterEl) {
    historyTypeFilterEl.addEventListener("change", () => { visibleHistory = DEFAULT_LIMIT_HISTORY; previousVisibleHistory = 0; renderHistoryView(); });
  }
  if (historyYearSelect) {
    historyYearSelect.addEventListener("change", () => { visibleHistory = DEFAULT_LIMIT_HISTORY; previousVisibleHistory = 0; renderHistoryView(); });
  }
  if (historyMonthSelect) {
    historyMonthSelect.addEventListener("change", () => { visibleHistory = DEFAULT_LIMIT_HISTORY; previousVisibleHistory = 0; renderHistoryView(); });
  }

  const historyDeviceFilter = document.getElementById("filter-history-device");
  if (historyDeviceFilter) {
    historyDeviceFilter.addEventListener("input", () => { visibleHistory = DEFAULT_LIMIT_HISTORY; previousVisibleHistory = 0; renderHistoryView(); });
  }

  const btnClearHistory = document.getElementById("btn-clear-history-filters");
  if (btnClearHistory) {
    btnClearHistory.addEventListener("click", () => {
      if (historyTypeFilterEl) historyTypeFilterEl.value = "";
      if (historyYearSelect) historyYearSelect.value = "";
      if (historyMonthSelect) historyMonthSelect.value = "";
      if (historyDeviceFilter) historyDeviceFilter.value = "";
      historyCategoryFilter = "";
      visibleHistory = DEFAULT_LIMIT_HISTORY;
      previousVisibleHistory = 0;
      renderHistoryView();
    });
  }

  // Sort buttons
  const sortBtn = document.getElementById("btn-history-sort");
  if (sortBtn) {
    sortBtn.addEventListener("click", () => {
      historySort = historySort === "desc" ? "asc" : "desc";
      sortBtn.dataset.order = historySort;
      sortBtn.textContent = historySort === "desc" ? "Newest First" : "Oldest First";
      visibleHistory = DEFAULT_LIMIT_HISTORY;
      previousVisibleHistory = 0;
      renderHistoryView();
    });
  }

  const devicesSortBtn = document.getElementById("btn-devices-sort");
  if (devicesSortBtn) {
    devicesSortBtn.addEventListener("click", () => {
      devicesSort = devicesSort === "desc" ? "asc" : "desc";
      devicesSortBtn.dataset.order = devicesSort;
      devicesSortBtn.textContent = devicesSort === "desc" ? "Newest First" : "Oldest First";
      renderDevicesView();
    });
  }

  // View Removed toggle
  const btnToggleRemoved = document.getElementById("btn-toggle-removed");
  const btnCloseRemoved = document.getElementById("btn-close-removed");
  const removedPanel = document.getElementById("removed-devices-panel");
  if (btnToggleRemoved && removedPanel) {
    btnToggleRemoved.addEventListener("click", () => {
      removedPanel.classList.remove("hidden");
    });
  }
  if (btnCloseRemoved && removedPanel) {
    btnCloseRemoved.addEventListener("click", () => {
      removedPanel.classList.add("hidden");
    });
  }

  // Removed filters
  const removedSearchInput = document.getElementById("filter-removed-search");
  const removedDeptSelect = document.getElementById("filter-removed-dept");
  const btnClearRemoved = document.getElementById("btn-clear-removed-filters");
  if (removedSearchInput) {
    removedSearchInput.addEventListener("input", () => {
      removedTextFilter = removedSearchInput.value.trim().toLowerCase();
      resetDevicesPagination();
      renderDevicesView();
    });
  }
  if (removedDeptSelect) {
    removedDeptSelect.addEventListener("change", () => {
      removedDeptFilter = removedDeptSelect.value;
      resetDevicesPagination();
      renderDevicesView();
    });
  }

  // Segmented controls
  const setupSeg = (containerId, onSelect) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.querySelectorAll(".seg-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        el.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        onSelect(btn.dataset.view);
      });
    });
  };
  setupSeg("seg-view-in", (v) => { viewModeIn = v; resetDevicesPagination(); renderDevicesView(); });
  setupSeg("seg-view-out", (v) => { viewModeOut = v; resetDevicesPagination(); renderDevicesView(); });

  // Removed Date Sort
  const btnRemovedSort = document.getElementById("btn-removed-sort");
  if (btnRemovedSort) {
    btnRemovedSort.addEventListener("click", () => {
      removedSort = removedSort === "desc" ? "asc" : "desc";
      btnRemovedSort.textContent = removedSort === "desc" ? "Newest First" : "Oldest First";
      renderDevicesView();
    });
  }

  if (btnClearRemoved) {
    btnClearRemoved.addEventListener("click", () => {
      removedTextFilter = "";
      removedDeptFilter = "";
      devicesRemovedDestFilter = "";
      removedCategoryFilter = "";
      viewModeOut = "all";
      if (removedSearchInput) removedSearchInput.value = "";
      if (removedDeptSelect) removedDeptSelect.value = "";
      const segOut = document.getElementById("seg-view-out");
      if (segOut) {
        segOut.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
        const first = segOut.querySelector(".seg-btn[data-view='all']");
        if (first) first.classList.add("active");
      }
      resetDevicesPagination();
      renderDevicesView();
    });
  }

  // NHK
  const btnCloseNhk = document.getElementById("btn-close-nhk-dialog");
  if (btnCloseNhk) {
    btnCloseNhk.addEventListener("click", closeNewHireKitDialog);
  }

  // Kit Deploy
  const kitDeploySelect = document.getElementById("kit-deploy-select");
  const btnDeployKit = document.getElementById("btn-deploy-kit");
  if (kitDeploySelect) {
    kitDeploySelect.addEventListener("change", () => {
      renderKitDeployResults(kitDeploySelect.value);
    });
  }
  if (btnDeployKit) {
    btnDeployKit.addEventListener("click", () => {
      deployKit(kitDeploySelect ? kitDeploySelect.value : "");
    });
  }

  renderAll();
  switchView("devices");
});