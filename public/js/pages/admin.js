// ============================================================
// pages/admin.js — Init for admin.html (User Management view)
// Depends on: config.js, api.js, state.js, utils.js,
//             features/admin.js, ui/auth.js
// ============================================================

/** Page-scoped renderAll: reload the admin users table. */
function renderAll() {
  loadAdminUsers();
}

document.addEventListener('DOMContentLoaded', async () => {
  // Mark active nav tab (admin tab has no hidden class on this page)
  const activeTab = document.querySelector('.nav-tab[href="admin.html"]');
  if (activeTab) activeTab.classList.add('active');

  // ── Add / Edit User dialog ────────────────────────────────
  const btnOpenAddUser   = document.getElementById('btn-open-add-user-dialog');
  const btnCancelAddUser = document.getElementById('btn-cancel-add-user');
  const addUserForm      = document.getElementById('add-user-form');
  if (btnOpenAddUser)   btnOpenAddUser.addEventListener('click', openAddUserDialog);
  if (btnCancelAddUser) btnCancelAddUser.addEventListener('click', closeAddUserDialog);
  if (addUserForm)      addUserForm.addEventListener('submit', saveUser);

  // ── Initial load ──────────────────────────────────────────
  renderAll();
});
