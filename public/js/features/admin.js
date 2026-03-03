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
            <td><strong>${escHtml(u.username)}</strong>${u.id === currentUser.id ? ' <span class="badge-you">you</span>' : ''}</td>
            <td style="color:var(--text-muted)">${escHtml(u.email || '—')}</td>
            <td><span class="role-badge ${(ROLE_LABELS[u.role] || {}).cls || ''}">${(ROLE_LABELS[u.role] || {}).label || escHtml(u.role)}</span></td>
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
  document.getElementById('new-user-role').value = u.role;
  document.getElementById('add-user-dialog').classList.remove('hidden');
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
  const username = document.getElementById('new-user-username').value.trim();
  const email    = document.getElementById('new-user-email').value.trim();
  const password = document.getElementById('new-user-password').value;
  const role     = document.getElementById('new-user-role').value;

  try {
    if (editingUserId) {
      const body = { role, email };
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
        body: JSON.stringify({ username, email, password, role }),
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
