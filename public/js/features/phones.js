// ============================================================
// features/phones.js — Phones register, signature capture,
//                      photo evidence, and printable receipts
// Depends on: config.js, api.js, state.js, utils.js, ui/auth.js
// ============================================================

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Global camera stream manager
let phoneVideoStream = null;

async function startPhoneCamera() {
  console.log('Starting phone camera...');
  const video = document.getElementById('phone-camera-video');
  const container = document.getElementById('camera-container');
  const photoActionsContainer = document.getElementById('photo-actions-container');
  
  console.log('Video element:', video, 'Container:', container, 'Actions container:', photoActionsContainer);
  
  if (!video || !container) {
    console.error('Missing video or container element');
    showToast('Camera UI elements not found.');
    return;
  }

  try {
    console.log('Requesting camera access...');
    phoneVideoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    console.log('Camera stream obtained:', phoneVideoStream);
    video.srcObject = phoneVideoStream;
    container.classList.remove('hidden');
    if (photoActionsContainer) photoActionsContainer.style.display = 'none';
    console.log('Camera UI shown');
  } catch (err) {
    console.error('Camera access error:', err);
    showToast('Camera access denied: ' + (err.message || 'Check permissions'));
  }
}

function closePhoneCamera() {
  if (phoneVideoStream) {
    phoneVideoStream.getTracks().forEach((track) => track.stop());
    phoneVideoStream = null;
  }
  const container = document.getElementById('camera-container');
  const video = document.getElementById('phone-camera-video');
  const photoActionsContainer = document.getElementById('photo-actions-container');
  
  if (container) container.classList.add('hidden');
  if (video) video.srcObject = null;
  if (photoActionsContainer) photoActionsContainer.style.display = 'flex';
}

function capturePhonePhoto() {
  const video = document.getElementById('phone-camera-video');
  const canvas = document.createElement('canvas');
  
  if (!video) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return;
  
  ctx.drawImage(video, 0, 0);
  phonePhotoDataUrl = canvas.toDataURL('image/jpeg', 0.85);
  
  const wrap = document.getElementById('phone-photo-preview-wrap');
  const img = document.getElementById('phone-photo-preview');
  if (img) img.src = phonePhotoDataUrl;
  if (wrap) wrap.classList.remove('hidden');
  
  closePhoneCamera();
  showToast('Photo captured successfully.');
}

function setupPhoneSignatureCanvas() {
  const canvas = document.getElementById('signature-canvas');
  if (!canvas || phoneSignaturePad) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Failed to get canvas context');
    return;
  }

  // Keep canvas at its natural dimensions for drawing
  let drawing = false;
  let hasDrawn = false;

  const getPoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    const point = event.touches ? event.touches[0] : event;
    
    // Scale coordinates to canvas resolution
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (point.clientX - rect.left) * scaleX,
      y: (point.clientY - rect.top) * scaleY,
    };
  };

  const start = (event) => {
    console.log('Drawing started');
    drawing = true;
    const { x, y } = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    event.preventDefault();
  };

  const move = (event) => {
    if (!drawing) return;
    const { x, y } = getPoint(event);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#102a43';
    ctx.lineTo(x, y);
    ctx.stroke();
    hasDrawn = true;
    event.preventDefault();
  };

  const end = (event) => {
    if (drawing) {
      console.log('Drawing ended, hasDrawn:', hasDrawn);
      drawing = false;
    }
    event.preventDefault();
  };

  // Set up event listeners
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', end, { passive: false });

  // Set white background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  phoneSignaturePad = {
    clear() {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      hasDrawn = false;
      console.log('Canvas cleared');
      document.getElementById('signature-data').value = '';
      document.getElementById('signature-name').value = '';
    },
    toDataURL() {
      const dataUrl = hasDrawn ? canvas.toDataURL('image/png') : '';
      console.log('toDataURL called, hasDrawn:', hasDrawn, 'dataUrl length:', dataUrl.length);
      return dataUrl;
    },
  };

  console.log('Signature canvas initialized, canvas size:', canvas.width, 'x', canvas.height);
}

async function loadPhones() {
  const rows = await apiCall('GET', '/phones');
  state.phones = Array.isArray(rows) ? rows : [];
  renderPhonesView();
}

function renderPhonesView() {
  const tableContainer = document.getElementById('phones-table-container');
  const totalEl = document.getElementById('phones-count');
  const photoEl = document.getElementById('phones-photo-count');
  const signedEl = document.getElementById('phones-signed-count');
  const printBtn = document.getElementById('btn-print-last');

  if (totalEl) totalEl.textContent = String(state.phones.length);
  if (photoEl) photoEl.textContent = String(state.phones.filter((p) => p.photoImage).length);
  if (signedEl) signedEl.textContent = String(state.phones.filter((p) => p.signatureImage).length);
  if (printBtn) printBtn.disabled = !lastPhoneRecord;

  if (!tableContainer) return;
  if (!state.phones.length) {
    tableContainer.classList.add('empty-state');
    tableContainer.innerHTML = '<p>No phone assignments yet.</p>';
    return;
  }
  tableContainer.classList.remove('empty-state');
  tableContainer.innerHTML = `
    <table class="inv-table">
      <thead>
        <tr>
          <th>Assigned at</th>
          <th>Phone</th>
          <th>Receiver</th>
          <th>Employee #</th>
          <th>IMEI</th>
          <th>Phone #</th>
          <th>Signed</th>
          <th>Photo</th>
        </tr>
      </thead>
      <tbody>
        ${state.phones.map((p) => `
          <tr>
            <td>${formatDateTime(p.assignedAt)}</td>
            <td><strong>${escHtml(p.phoneModel)}</strong><div style="color:var(--text-muted);font-size:.72rem;">${escHtml(p.assignedBy)}</div></td>
            <td>${escHtml(p.receivedBy)}</td>
            <td>${escHtml(p.employeeNumber || '—')}</td>
            <td>${escHtml(p.imei)}</td>
            <td>${escHtml(p.phoneNumber)}</td>
            <td>${p.signatureImage ? 'Yes' : 'No'}</td>
            <td>${p.photoImage ? 'Yes' : 'No'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function showPhoneReceipt(record) {
  const receipt = document.getElementById('phone-print-template');
  if (!receipt) return;
  receipt.innerHTML = `
    <div class="phone-receipt">
      <div class="phone-receipt-header">
        <h2>Phone Assignment Receipt</h2>
        <p>IT Rack Inventory</p>
      </div>
      <div class="phone-receipt-grid">
        <div><span>Assigned by</span><strong>${escHtml(record.assignedBy)}</strong></div>
        <div><span>Received by</span><strong>${escHtml(record.receivedBy)}</strong></div>
        <div><span>Employee #</span><strong>${escHtml(record.employeeNumber || '—')}</strong></div>
        <div><span>Phone model</span><strong>${escHtml(record.phoneModel)}</strong></div>
        <div><span>IMEI</span><strong>${escHtml(record.imei)}</strong></div>
        <div><span>Phone number</span><strong>${escHtml(record.phoneNumber)}</strong></div>
        <div><span>Date</span><strong>${formatDateTime(record.assignedAt)}</strong></div>
      </div>
      <div class="phone-receipt-media">
        <div>
          <span>Signature</span>
          <img src="${record.signatureImage}" alt="Signature" />
          <strong>${escHtml(record.signatureName)}</strong>
        </div>
        <div>
          <span>Photo</span>
          ${record.photoImage ? `<img src="${record.photoImage}" alt="Recipient photo" />` : '<div class="phone-photo-placeholder">No photo attached</div>'}
        </div>
      </div>
      <div class="phone-receipt-notes">
        <span>Notes</span>
        <p>${escHtml(record.notes || '—')}</p>
      </div>
    </div>
  `;
  const popup = window.open('', '_blank', 'width=900,height=1200');
  if (!popup) return;
  popup.document.write(`
    <html>
      <head>
        <title>Phone Assignment Receipt</title>
        <link rel="stylesheet" href="style.css?v=2" />
      </head>
      <body class="phone-print-body">${receipt.innerHTML}</body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.onload = () => popup.print();
}

async function savePhoneAssignment(payload) {
  const record = await apiCall('POST', '/phones', payload);
  lastPhoneRecord = { ...payload, id: record.id };
  await loadPhones();
  return lastPhoneRecord;
}

function resetPhoneForm() {
  const form = document.getElementById('phone-form');
  if (form) form.reset();
  phonePhotoDataUrl = '';
  const photoWrap = document.getElementById('phone-photo-preview-wrap');
  const photoImg = document.getElementById('phone-photo-preview');
  if (photoWrap) photoWrap.classList.add('hidden');
  if (photoImg) photoImg.src = '';
  phoneSignaturePad?.clear();
}
