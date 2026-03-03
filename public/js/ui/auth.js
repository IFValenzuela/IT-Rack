// ============================================================
// ui/auth.js — Authentication check, logout button, role UI
// Depends on: config.js, api.js, state.js
// NOTE: This IIFE runs immediately on script load (with defer,
//       that is after the DOM is parsed but before DOMContentLoaded).
// ============================================================

// Check authentication on page load — redirect to login if no valid token.
(async function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  try {
    const response = await fetch(`${API_URL}/auth/verify`, {
      headers: { 'Authorization': `Bearer ${token}` },
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

/** Inject the user name and logout button into the nav user-menu slot. */
function addLogoutButton() {
  const userMenu = document.getElementById('user-menu');
  if (!userMenu) return;
  userMenu.innerHTML = `
    <span class="user-name">👤 ${currentUser.username}</span>
    <span style="opacity:0.3">|</span>
    <button class="btn-logout" onclick="logout()">Logout</button>
  `;
  // Show admin-only elements only for admin role.
  if (currentUser.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }
}

/** Log the current user out after confirmation. */
function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
  }
}
