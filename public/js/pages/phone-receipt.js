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

    // Photo evidence logic
    const evidenceSection = document.getElementById('photo-evidence-section');
    if (!record.photoImage && evidenceSection) {
      evidenceSection.classList.remove('hidden');
    }

    const startCameraBtn = document.getElementById('btn-start-camera');
    const capturePhotoBtn = document.getElementById('btn-capture-photo');
    const closeCameraBtn = document.getElementById('btn-close-camera');
    const savePhotoBtn = document.getElementById('btn-save-photo');
    const removePhotoBtn = document.getElementById('btn-remove-photo');

    if (startCameraBtn) {
      startCameraBtn.addEventListener('click', (e) => {
        e.preventDefault();
        startPhoneCamera();
      });
    }

    if (capturePhotoBtn) {
      capturePhotoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        capturePhonePhoto();
      });
    }

    if (closeCameraBtn) {
      closeCameraBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closePhoneCamera();
      });
    }

    if (removePhotoBtn) {
      removePhotoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        phonePhotoDataUrl = '';
        const wrap = document.getElementById('phone-photo-preview-wrap');
        const img = document.getElementById('phone-photo-preview');
        if (wrap) wrap.classList.add('hidden');
        if (img) img.src = '';
      });
    }

    if (savePhotoBtn) {
      savePhotoBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!phonePhotoDataUrl) return;

        savePhotoBtn.disabled = true;
        savePhotoBtn.textContent = 'Saving...';

        try {
          await apiCall('PUT', `/phones/${encodeURIComponent(phoneId)}`, { photoImage: phonePhotoDataUrl });
          showToast('Photo evidence saved successfully.');
          
          // Re-fetch and render to show the photo in the receipt
          const updatedRecord = await apiCall('GET', `/phones/${encodeURIComponent(phoneId)}`);
          renderPhoneReceiptPage(updatedRecord);
          
          if (evidenceSection) evidenceSection.classList.add('hidden');
        } catch (error) {
          showToast(error.message || 'Failed to save photo.');
          savePhotoBtn.disabled = false;
          savePhotoBtn.textContent = 'Save Photo to Receipt';
        }
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