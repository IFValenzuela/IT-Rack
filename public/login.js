const API_URL = '/api';

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorDiv = document.getElementById('error-message');
  const form = document.getElementById('login-form');

  errorDiv.classList.remove('show');
  errorDiv.textContent = '';
  form.classList.add('loading');

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    window.location.href = '/index.html';

  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.classList.add('show');
  } finally {
    form.classList.remove('loading');
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  
  if (token) {
    try {
      const response = await fetch(`${API_URL}/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        window.location.href = '/index.html';
        return; // Don't fetch users if we're redirecting
      }
    } catch (e) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }

  // Fetch usernames for the dropdown
  try {
    const userSelect = document.getElementById('username');
    const res = await fetch(`${API_URL}/auth/users`);
    if (res.ok) {
      const users = await res.json();
      users.forEach(u => {
        const option = document.createElement('option');
        option.value = u.username;
        option.textContent = u.username;
        userSelect.appendChild(option);
      });
    }
  } catch (err) {
    console.error('Failed to load users:', err);
  }
});