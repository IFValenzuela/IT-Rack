// ============================================================
// utils.js — Pure utility functions (no DOM, no state)
// Depends on: config.js
// ============================================================

/**
 * Generate a short unique ID (collision-safe enough for client-side records).
 * @returns {string}
 */
function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/**
 * Escape a value for safe insertion into HTML attribute values and text nodes.
 * Prevents XSS when embedding user-controlled data inside innerHTML strings.
 * @param {unknown} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format an ISO date-time string to a human-readable locale date + time.
 * Returns an empty string for invalid/missing dates.
 * @param {string} isoString
 * @returns {string}
 */
function formatDateTime(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return (
    d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

/**
 * Format an ISO date string to a human-readable locale date (date only).
 * @param {string} isoString
 * @returns {string}
 */
function formatDate(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

/**
 * Calculate stock age CSS class and badge HTML for a device.
 * @param {string} createdAtIso  ISO timestamp when the device was added.
 * @returns {{ rowClass: string, badge: string }}
 */
function getStockAgeInfo(createdAtIso) {
  const now   = Date.now();
  const added = new Date(createdAtIso).getTime();
  if (Number.isNaN(added)) return { rowClass: '', badge: '' };

  const diffDays = (now - added) / (1000 * 60 * 60 * 24);

  if (diffDays >= 30) {
    return {
      rowClass: 'stock-age-critical',
      badge:    '<span class="stock-age-badge critical">1+ month</span>',
    };
  }
  if (diffDays >= 14) {
    return {
      rowClass: 'stock-age-warning',
      badge:    '<span class="stock-age-badge warning">2+ weeks</span>',
    };
  }
  return { rowClass: '', badge: '' };
}

/**
 * Show a non-blocking toast notification.
 * @param {string} message
 */
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.classList.add('hidden'), 200);
  }, 2100);
}

/**
 * Return an HTML category badge span, or '' if no category.
 * @param {string} category
 * @returns {string}
 */
function getCategoryBadge(category) {
  if (!category) return '';
  return `<span class="category-badge" title="${escHtml(category)}"><span class="cb-label">${escHtml(category)}</span></span>`;
}

/**
 * Update a container to either show an empty-state placeholder or inject HTML table markup.
 * @param {HTMLElement|null} container
 * @param {string|null} htmlTable  Pass null/empty to trigger the empty-state.
 */
function setEmptyOrTable(container, htmlTable) {
  if (!container) return;
  if (!htmlTable) {
    container.classList.add('empty-state');
    container.innerHTML = '<p style="margin:0;font-size:0.8rem;color:#6c7a96;">No data.</p>';
  } else {
    container.classList.remove('empty-state');
    container.innerHTML = htmlTable;
  }
}
