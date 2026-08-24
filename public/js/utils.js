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
 * Pauses auto-dismiss timer when the browser tab is hidden (Apple principle:
 * invisible feedback is wasted — the user should see the full toast duration).
 * @param {string} message
 */
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  // Clear any pending dismiss from a previous toast
  if (showToast._timer) { clearTimeout(showToast._timer); showToast._timer = null; }
  if (showToast._hideTimer) { clearTimeout(showToast._hideTimer); showToast._hideTimer = null; }
  if (showToast._visHandler) { document.removeEventListener('visibilitychange', showToast._visHandler); }

  toast.textContent = message;
  toast.classList.remove('hidden');
  // Double-rAF ensures the browser has painted the un-hidden state before adding the transition class
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('visible')));

  const DISPLAY_MS = 2400;
  let remaining = DISPLAY_MS;
  let startedAt = Date.now();

  function scheduleDismiss() {
    startedAt = Date.now();
    showToast._timer = setTimeout(() => {
      toast.classList.remove('visible');
      showToast._hideTimer = setTimeout(() => toast.classList.add('hidden'), 280);
      cleanup();
    }, remaining);
  }

  function onVisChange() {
    if (document.hidden) {
      // Pause: save how much time is left
      clearTimeout(showToast._timer);
      remaining -= (Date.now() - startedAt);
      if (remaining <= 0) remaining = 100;
    } else {
      // Resume after tab returns
      scheduleDismiss();
    }
  }

  function cleanup() {
    document.removeEventListener('visibilitychange', onVisChange);
    showToast._visHandler = null;
  }

  showToast._visHandler = onVisChange;
  document.addEventListener('visibilitychange', onVisChange);
  scheduleDismiss();
}

/**
 * Open a dialog/modal backdrop with animated entrance.
 * @param {string|HTMLElement} el  ID string or element
 */
function openDialog(el) {
  const dlg = typeof el === 'string' ? document.getElementById(el) : el;
  if (!dlg) return;
  dlg.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

/**
 * Close a dialog/modal backdrop with an animated exit.
 * Plays a reverse scale+opacity animation before hiding, so the
 * disappearance isn't a jarring instant cut (Apple: spatial consistency).
 * @param {string|HTMLElement} el  ID string or element
 */
function closeDialog(el) {
  const dlg = typeof el === 'string' ? document.getElementById(el) : el;
  if (!dlg || dlg.classList.contains('hidden')) return;
  const panel = dlg.querySelector('.dialog') || dlg.querySelector('.slide-over-drawer');

  // If the browser supports animate(), play an exit; otherwise just hide.
  if (panel && panel.animate) {
    const anim = panel.animate(
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.97)' }
      ],
      { duration: 150, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' }
    );
    // Fade the backdrop in parallel
    dlg.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 150, easing: 'ease-out', fill: 'forwards' }
    );
    anim.onfinish = () => {
      dlg.classList.add('hidden');
      document.body.style.overflow = '';
      // Reset so re-opening plays the CSS entrance animation fresh
      panel.getAnimations().forEach(a => a.cancel());
      dlg.getAnimations().forEach(a => a.cancel());
    };
  } else {
    dlg.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

/**
 * Apply staggered fade-in to child elements of a container.
 * Each child gets a small delay so content cascades in naturally
 * instead of all appearing at once (Apple: hint direction of gesture).
 * @param {HTMLElement} container
 * @param {string} [selector='> *']  Children to stagger
 * @param {number} [delayMs=40]  Delay between each child
 */
function staggerIn(container, selector, delayMs) {
  if (!container) return;
  const sel = selector || '> *';
  const delay = delayMs || 40;
  const children = container.querySelectorAll(':scope ' + sel);
  children.forEach((child, i) => {
    child.style.opacity = '0';
    child.style.transform = 'translateY(6px)';
    child.style.transition = 'none';
    requestAnimationFrame(() => {
      child.style.transition = 'opacity 0.3s cubic-bezier(0.23,1,0.32,1), transform 0.3s cubic-bezier(0.23,1,0.32,1)';
      child.style.transitionDelay = (i * delay) + 'ms';
      child.style.opacity = '1';
      child.style.transform = 'translateY(0)';
    });
    // Clean up inline styles after animation settles
    setTimeout(() => {
      child.style.transition = '';
      child.style.transitionDelay = '';
      child.style.opacity = '';
      child.style.transform = '';
    }, 300 + (i * delay) + 50);
  });
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
