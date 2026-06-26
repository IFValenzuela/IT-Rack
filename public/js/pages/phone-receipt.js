// ============================================================
// pages/phone-receipt.js — Dedicated phone receipt page
// Depends on: config.js, api.js, state.js, utils.js,
//             features/phones.js, ui/auth.js
// ============================================================

function renderPhoneReceiptPage(record) {
  const shell = document.getElementById('phone-receipt-shell');
  if (!shell) return;
  shell.classList.remove('empty-state');
  shell.innerHTML = getPhoneReceiptMarkup(record);
}

document.addEventListener('DOMContentLoaded', async () => {
  const activeTab = document.querySelector('.nav-tab[href="phones.html"]');
  if (activeTab) activeTab.classList.add('active');

  const params = new URLSearchParams(location.search);
  const phoneId = params.get('phone');
  const autoPrint = params.get('print') === '1';
  const titleEl = document.getElementById('phone-receipt-title');
  const metaEl = document.getElementById('phone-receipt-meta');
  const printBtn = document.getElementById('btn-print-receipt');

  if (!phoneId) {
    if (titleEl) titleEl.textContent = 'Receipt not found';
    if (metaEl) metaEl.textContent = 'No phone id was provided in the URL.';
    const shell = document.getElementById('phone-receipt-shell');
    if (shell) {
      shell.classList.add('empty-state');
      shell.innerHTML = '<p style="margin:0;">Open a receipt from the phone history or save a new assignment.</p>';
    }
    return;
  }

  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }

  try {
    const record = await apiCall('GET', `/phones/${encodeURIComponent(phoneId)}`);
    if (titleEl) titleEl.textContent = `Receipt: ${record.phoneModel || 'Phone assignment'}`;
    if (metaEl) metaEl.textContent = `Assigned ${formatDateTime(record.assignedAt) || 'recently'}`;
    renderPhoneReceiptPage(record);

    if (autoPrint) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.print());
      });
    }
  } catch (error) {
    if (titleEl) titleEl.textContent = 'Receipt not found';
    if (metaEl) metaEl.textContent = error.message || 'Unable to load receipt.';
    const shell = document.getElementById('phone-receipt-shell');
    if (shell) {
      shell.classList.add('empty-state');
      shell.innerHTML = `<p style="margin:0;">${escHtml(error.message || 'Unable to load receipt.')}</p>`;
    }
  }
});