// ============================================================
// api.js — Auth token helper and generic API fetch wrapper
// Depends on: config.js
// ============================================================

/** Return the stored JWT from localStorage. */
function getToken() {
  return localStorage.getItem('token');
}

/**
 * Generic fetch wrapper for JSON API calls.
 * Automatically attaches the Authorization header and Content-Type.
 * Throws an error (with the server's error message) on non-2xx responses.
 *
 * @param {string} method    HTTP method (GET, POST, PUT, DELETE)
 * @param {string} endpoint  Path relative to API_URL, e.g. '/models'
 * @param {object|null} body JSON payload (omit / pass null for GET/DELETE)
 * @returns {Promise<any>}   Parsed JSON response body
 */
async function apiCall(method, endpoint, body = null) {
  const token = getToken();
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${API_URL}${endpoint}`, options);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `API error: ${response.status}`);
  }
  return response.json();
}
