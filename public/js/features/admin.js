// ============================================================
// features/admin.js — Admin panel: user management
// Depends on: config.js, api.js, state.js, utils.js
// ============================================================

/** Fetch all users from the backend and re-render the admin table. */
async function loadAdminUsers() {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/admin/users`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    adminUsers = await res.json();
    renderAdminUsers();
  } catch (e) {
    showToast('Failed to load users.');
  }
}

/** Render the admin users table into #admin-users-table-container. */
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
          <th>Role</th>
          <th>Department</th>
          <th>Last Login</th>
          <th>Created</th>
          <th style="width:120px"></th>
        </tr>
      </thead>
      <tbody>
        ${adminUsers.map(u => `
          <tr>
            <td><strong>${escHtml(u.username)}</strong>${u.id === currentUser.id ? ' <span class="badge-you">you</span>' : ''}</td>
            <td><span class="role-badge ${(ROLE_LABELS[u.role] || {}).cls || ''}">${(ROLE_LABELS[u.role] || {}).label || escHtml(u.role)}</span></td>
            <td style="color:var(--text-muted)">${escHtml(u.department || '—')}</td>
            <td style="color:var(--text-muted);font-size:.8rem">${u.lastLogin ? formatDateTime(u.lastLogin) : 'Never'}</td>
            <td style="color:var(--text-muted);font-size:.8rem">${u.createdAt ? formatDate(u.createdAt) : '—'}</td>
            <td class="row-actions">
              <span class="action-link js-edit-user" data-id="${u.id}">Edit</span>
              ${u.id !== currentUser.id ? `<span class="action-link action-link-danger js-delete-user" data-id="${u.id}" data-username="${escHtml(u.username)}">Delete</span>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // Delegated click handler — avoids global onclick and handles special characters in usernames.
  container.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.js-edit-user');
    if (editBtn) { openEditUser(Number(editBtn.dataset.id)); return; }
    const delBtn = e.target.closest('.js-delete-user');
    if (delBtn) { deleteUser(Number(delBtn.dataset.id), delBtn.dataset.username); }
  });
}

/** Open the New User dialog. */
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

/** Open the Edit User dialog pre-filled with existing user data. */
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
  document.getElementById('new-user-role').value = u.role;  document.getElementById('new-user-department').value  = u.department || '';  document.getElementById('add-user-dialog').classList.remove('hidden');
}

/** Close (and reset) the add/edit user dialog. */
function closeAddUserDialog() {
  document.getElementById('add-user-dialog').classList.add('hidden');
  document.getElementById('add-user-form').reset();
  editingUserId = null;
}

/** Handle the Add/Edit user form submission. */
async function saveUser(e) {
  e.preventDefault();
  const token    = localStorage.getItem('token');
  const username   = document.getElementById('new-user-username').value.trim();
  const password   = document.getElementById('new-user-password').value;
  const role       = document.getElementById('new-user-role').value;
  const department = document.getElementById('new-user-department').value || null;

  try {
    if (editingUserId) {
      const body = { role, department };
      if (password) body.password = password;
      const res = await fetch(`${API_URL}/admin/users/${editingUserId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('User updated.');
    } else {
      if (password.length < 6) { showToast('Password must be at least 6 characters.'); return; }
      const res = await fetch(`${API_URL}/admin/users`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role, department }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`User "${username}" created.`);
    }
    closeAddUserDialog();
    await loadAdminUsers();
  } catch (err) {
    showToast(err.message);
  }
}

/** Delete a user by ID after confirmation. */
async function deleteUser(id, username) {
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/admin/users/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(`"${username}" deleted.`);
    await loadAdminUsers();
  } catch (err) {
    showToast(err.message);
  }
}

// ============================================================
// Kit Accessories Management
// ============================================================

let kitAccessories = [];

/** Fetch all kit accessories from the backend and re-render. */
async function loadKitAccessoriesAdmin() {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/admin/kit-accessories`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    kitAccessories = await res.json();
    renderKitAccessories();
  } catch (e) {
    showToast('Failed to load kit accessories.');
  }
}

/** Render the kit accessories table with drag-and-drop reordering. */
function renderKitAccessories() {
  const container = document.getElementById('admin-kit-accessories-container');
  if (!container) return;
  if (!kitAccessories.length) {
    container.innerHTML = '<p>No kit accessories defined.</p>';
    return;
  }
  container.classList.remove('empty-state');

  // Pin "Other" to the bottom always
  const rest   = kitAccessories.filter(a => a.name !== 'Other');
  const pinned = kitAccessories.filter(a => a.name === 'Other');
  const sorted = [...rest, ...pinned];

  container.innerHTML = `
    <table class="inv-table">
      <thead>
        <tr>
          <th style="width:28px"></th>
          <th>Name</th>
          <th>Category</th>
          <th>No Serial</th>
          <th style="width:120px"></th>
        </tr>
      </thead>
      <tbody id="kit-acc-tbody">
        ${sorted.map(a => `
          <tr data-id="${a.id}" data-pinned="${a.name === 'Other' ? '1' : '0'}"
              draggable="${a.name !== 'Other'}" class="kit-acc-row">
            <td style="text-align:center;color:var(--text-muted);cursor:${a.name !== 'Other' ? 'grab' : 'default'};user-select:none;font-size:1.1rem">
              ${a.name !== 'Other' ? '⠿' : ''}
            </td>
            <td><strong>${escHtml(a.name)}</strong></td>
            <td style="color:var(--text-muted)">${escHtml(a.category)}</td>
            <td>${a.no_serial ? '<span class="role-badge role-viewer">N/A</span>' : '—'}</td>
            <td class="row-actions">
              <span class="action-link js-edit-accessory" data-id="${a.id}">Edit</span>
              ${a.name !== 'Other' ? `<span class="action-link action-link-danger js-delete-accessory" data-id="${a.id}" data-name="${escHtml(a.name)}">Delete</span>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // ── Drag-and-drop ────────────────────────────────────────
  const tbody = document.getElementById('kit-acc-tbody');
  let dragSrc = null;

  tbody.addEventListener('dragstart', (e) => {
    const row = e.target.closest('tr[draggable="true"]');
    if (!row) return;
    dragSrc = row;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => row.style.opacity = '0.4', 0);
  });

  tbody.addEventListener('dragend', (e) => {
    const row = e.target.closest('tr');
    if (row) row.style.opacity = '';
    dragSrc = null;
  });

  tbody.addEventListener('dragover', (e) => {
    e.preventDefault();
    const row = e.target.closest('tr.kit-acc-row');
    if (!row || row === dragSrc || row.dataset.pinned === '1') return;
    e.dataTransfer.dropEffect = 'move';
    const rect = row.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      tbody.insertBefore(dragSrc, row);
    } else {
      tbody.insertBefore(dragSrc, row.nextSibling);
    }
  });

  tbody.addEventListener('drop', async (e) => {
    e.preventDefault();
    // Ensure pinned rows stay at the bottom
    tbody.querySelectorAll('tr[data-pinned="1"]').forEach(r => tbody.appendChild(r));
    // Persist new order
    const order = [...tbody.querySelectorAll('tr[data-pinned="0"]')].map(r => Number(r.dataset.id));
    await reorderAccessories(order);
  });

  // ── Click handlers ───────────────────────────────────────
  container.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.js-edit-accessory');
    if (editBtn) { openEditAccessory(Number(editBtn.dataset.id)); return; }
    const delBtn = e.target.closest('.js-delete-accessory');
    if (delBtn) { deleteAccessory(Number(delBtn.dataset.id), delBtn.dataset.name); }
  });
}

/** Persist a new drag-and-drop order to the backend. */
async function reorderAccessories(order) {
  const token = localStorage.getItem('token');
  try {
    await fetch(`${API_URL}/admin/kit-accessories/reorder`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    // Update local sort_order values
    order.forEach((id, idx) => {
      const item = kitAccessories.find(a => a.id === id);
      if (item) item.sort_order = (idx + 1) * 10;
    });
  } catch (err) {
    showToast('Failed to save order.');
  }
}

/** Open the New Accessory dialog. */
function openAddAccessoryDialog() {
  document.getElementById('add-accessory-dialog-title').textContent = 'New Kit Item';
  document.getElementById('btn-save-accessory').textContent = 'Add Item';
  document.getElementById('add-accessory-form').reset();
  document.getElementById('edit-accessory-id').value = '';
  document.getElementById('add-accessory-dialog').classList.remove('hidden');
}

/** Open the Edit Accessory dialog pre-filled. */
function openEditAccessory(id) {
  const a = kitAccessories.find(x => x.id === id);
  if (!a) return;
  document.getElementById('add-accessory-dialog-title').textContent = 'Edit Kit Item';
  document.getElementById('btn-save-accessory').textContent = 'Save Changes';
  document.getElementById('edit-accessory-id').value = id;
  document.getElementById('acc-name').value = a.name;
  document.getElementById('acc-category').value = a.category;
  document.getElementById('acc-no-serial').checked = !!a.no_serial;
  document.getElementById('add-accessory-dialog').classList.remove('hidden');
}

/** Close the Accessory dialog. */
function closeAddAccessoryDialog() {
  document.getElementById('add-accessory-dialog').classList.add('hidden');
  document.getElementById('add-accessory-form').reset();
}

/** Save (create or update) a kit accessory. */
async function saveAccessory(e) {
  e.preventDefault();
  const token      = localStorage.getItem('token');
  const editId     = document.getElementById('edit-accessory-id').value;
  const name      = document.getElementById('acc-name').value.trim();
  const category  = document.getElementById('acc-category').value;
  const no_serial = document.getElementById('acc-no-serial').checked ? 1 : 0;

  try {
    if (editId) {
      const res = await fetch(`${API_URL}/admin/kit-accessories/${editId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, no_serial }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('Kit item updated.');
    } else {
      const res = await fetch(`${API_URL}/admin/kit-accessories`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, no_serial }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`"${name}" added to kit accessories.`);
    }
    closeAddAccessoryDialog();
    await loadKitAccessoriesAdmin();
  } catch (err) {
    showToast(err.message);
  }
}

/** Delete a kit accessory by ID. */
async function deleteAccessory(id, name) {
  if (!confirm(`Remove "${name}" from the kit accessories list?`)) return;
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/admin/kit-accessories/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(`"${name}" removed.`);
    await loadKitAccessoriesAdmin();
  } catch (err) {
    showToast(err.message);
  }
}

// ── Demo Mode ────────────────────────────────────────────────

/** Toggle demo mode panel open/closed. */
function initDemoModePanel() {
  const toggle = document.getElementById('demo-mode-toggle');
  const body   = document.getElementById('demo-mode-body');
  const icon   = document.getElementById('demo-toggle-icon');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    icon.textContent   = open ? '▶' : '▼';
  });

  document.getElementById('btn-demo-seed').addEventListener('click', seedDemoData);
  document.getElementById('btn-demo-cleanup').addEventListener('click', cleanupDemoData);
}

/** Inject backdated demo devices (for presentation). */
async function seedDemoData() {
  const btn = document.getElementById('btn-demo-seed');
  btn.disabled = true;
  btn.textContent = 'Injecting…';
  const token = localStorage.getItem('token');
  try {
    const res  = await fetch(`${API_URL}/admin/demo/seed`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(`✓ 9 demo devices injected. Go to All Devices to see the badges.`);
  } catch (err) {
    showToast(err.message || 'Failed to inject demo data.');
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Inject Demo Devices';
  }
}

/** Remove all demo devices (serials starting with DEMO-). */
async function cleanupDemoData() {
  if (!confirm('Remove all demo devices (DEMO-*) from the inventory?')) return;
  const btn = document.getElementById('btn-demo-cleanup');
  btn.disabled = true;
  btn.textContent = 'Removing…';
  const token = localStorage.getItem('token');
  try {
    const res  = await fetch(`${API_URL}/admin/demo/cleanup`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(`✓ ${data.removed} demo device${data.removed !== 1 ? 's' : ''} removed.`);
  } catch (err) {
    showToast(err.message || 'Failed to remove demo data.');
  } finally {
    btn.disabled = false;
    btn.textContent = '✕ Remove Demo Devices';
  }
}
