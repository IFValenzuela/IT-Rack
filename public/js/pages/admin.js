// ============================================================
// pages/admin.js — Init for admin.html (User Management view)
// Depends on: config.js, api.js, state.js, utils.js,
//             features/admin.js, ui/auth.js
// ============================================================

/** Page-scoped renderAll: reload the admin users table and kit accessories. */
function renderAll() {
  loadAdminUsers();
  loadKitAccessoriesAdmin();
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

  // ── Add / Edit Kit Accessory dialog ──────────────────────
  const btnOpenAddAcc   = document.getElementById('btn-open-add-accessory-dialog');
  const btnCancelAcc    = document.getElementById('btn-cancel-add-accessory');
  const addAccForm      = document.getElementById('add-accessory-form');
  if (btnOpenAddAcc)  btnOpenAddAcc.addEventListener('click', openAddAccessoryDialog);
  if (btnCancelAcc)   btnCancelAcc.addEventListener('click', closeAddAccessoryDialog);
  if (addAccForm)     addAccForm.addEventListener('submit', saveAccessory);

  // ── Demo Mode panel ───────────────────────────────────────
  initDemoModePanel();

  // ── Initial load ──────────────────────────────────────────
  renderAll();

  // Keep admin data current — poll every 30 s and on tab focus
  setInterval(renderAll, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderAll();
  });
});
