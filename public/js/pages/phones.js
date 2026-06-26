// ============================================================
// pages/phones.js — Init for phones.html
// Depends on: config.js, api.js, state.js, utils.js,
//             features/models.js, features/phones.js, ui/auth.js
// ============================================================

function renderAll() {
  renderPhonesView();
}

document.addEventListener('DOMContentLoaded', async () => {
  const activeTab = document.querySelector('.nav-tab[href="phones.html"]');
  if (activeTab) activeTab.classList.add('active');

  await loadFromBackend();
  populateTechnicianSelect();
  setupPhoneSignatureCanvas();

  const form = document.getElementById('phone-form');
  const printBtn = document.getElementById('btn-print-last');
  const clearSignatureBtn = document.getElementById('btn-clear-signature');
  const removePhotoBtn = document.getElementById('btn-remove-photo');

  if (clearSignatureBtn) {
    clearSignatureBtn.addEventListener('click', () => phoneSignaturePad?.clear());
  }

  if (removePhotoBtn) {
    removePhotoBtn.addEventListener('click', () => {
      phonePhotoDataUrl = '';
      const wrap = document.getElementById('phone-photo-preview-wrap');
      const img = document.getElementById('phone-photo-preview');
      if (wrap) wrap.classList.add('hidden');
      if (img) img.src = '';
    });
  }

  const startCameraBtn = document.getElementById('btn-start-camera');
  const capturePhotoBtn = document.getElementById('btn-capture-photo');
  const closeCameraBtn = document.getElementById('btn-close-camera');

  if (startCameraBtn) {
    startCameraBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Start camera clicked');
      startPhoneCamera();
    });
  }

  if (capturePhotoBtn) {
    capturePhotoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Capture photo clicked');
      capturePhonePhoto();
    });
  }

  if (closeCameraBtn) {
    closeCameraBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Close camera clicked');
      closePhoneCamera();
    });
  }

  if (printBtn) {
    printBtn.addEventListener('click', () => {
      if (!lastPhoneRecord) return;
      showPhoneReceipt(lastPhoneRecord);
    });
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const signatureImage = phoneSignaturePad?.toDataURL() || '';
      const signatureName = (document.getElementById('signature-name').value || document.getElementById('phone-received-by').value || '').trim();
      if (!signatureImage) {
        showToast('Please sign before saving the assignment.');
        return;
      }

      const payload = {
        assignedBy: document.getElementById('phone-assigned-by').value,
        receivedBy: document.getElementById('phone-received-by').value.trim(),
        employeeNumber: document.getElementById('phone-employee-number').value.trim(),
        phoneModel: document.getElementById('phone-model').value.trim(),
        imei: document.getElementById('phone-imei').value.trim(),
        phoneNumber: document.getElementById('phone-number').value.trim(),
        assignedAt: new Date().toISOString(),
        signatureName,
        signatureImage,
        photoImage: phonePhotoDataUrl || null,
        notes: document.getElementById('phone-notes').value.trim(),
      };

      try {
        await savePhoneAssignment(payload);
        showToast('Phone assignment saved.');
        resetPhoneForm();
        renderPhonesView();
        if (printBtn) printBtn.disabled = false;
      } catch (error) {
        showToast(error.message || 'Failed to save phone assignment.');
      }
    });
  }

  await loadPhones();
  renderAll();
  startAutoRefresh();
});