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

  if (window.authPromise) await window.authPromise;
  await loadFromBackend();
  populatePersonSelect('phone-assigned-by');
  populateTechnicianSelect();
  setupPhoneSignatureCanvas();

  const form = document.getElementById('phone-form');
  const clearSignatureBtn = document.getElementById('btn-clear-signature');

  if (clearSignatureBtn) {
    clearSignatureBtn.addEventListener('click', () => phoneSignaturePad?.clear());
  }
  // --- Phone Model Modal Logic ---
  const modelInput = document.getElementById('phone-model');
  const modelModal = document.getElementById('model-modal');
  const btnModelCancel = document.getElementById('btn-model-modal-cancel');
  const btnModelDone = document.getElementById('btn-model-modal-done');
  const modelListContainer = document.getElementById('model-list');

  const iphoneModels = [
    { group: 'iPhone 17 Series', models: ['iPhone 17', 'iPhone 17 Plus', 'iPhone 17 Pro', 'iPhone 17 Pro Max'] },
    { group: 'iPhone 16 Series', models: ['iPhone 16', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max'] },
    { group: 'iPhone 15 Series', models: ['iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max'] },
    { group: 'iPhone 14 Series', models: ['iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max'] },
    { group: 'iPhone 13 Series', models: ['iPhone 13', 'iPhone 13 mini', 'iPhone 13 Pro', 'iPhone 13 Pro Max'] },
    { group: 'iPhone 12 Series', models: ['iPhone 12', 'iPhone 12 mini', 'iPhone 12 Pro', 'iPhone 12 Pro Max'] },
    { group: 'iPhone 11 Series', models: ['iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max'] },
    { group: 'Other', models: ['iPhone SE (3rd Gen)', 'iPhone SE (2nd Gen)'] }
  ];

  if (modelListContainer) {
    let listHtml = '';
    iphoneModels.forEach(group => {
      listHtml += `<div style="grid-column: 1 / -1; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-top: 12px; margin-bottom: 4px; text-transform: uppercase;">${group.group}</div>`;
      group.models.forEach(model => {
        listHtml += `
          <label style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); cursor: pointer; background: #fff; transition: border-color 0.15s;">
            <input type="radio" name="selected-model" value="${model}" style="margin: 0; width: 16px; height: 16px;" />
            <span style="font-size: 0.95rem;">${model}</span>
          </label>
        `;
      });
    });
    modelListContainer.innerHTML = listHtml;
  }

  if (modelInput && modelModal) {
    modelInput.addEventListener('click', () => {
      modelModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      // pre-select current value if exists
      if (modelInput.value) {
        const radio = modelModal.querySelector(`input[value="${modelInput.value}"]`);
        if (radio) radio.checked = true;
      }
    });

    const closeModal = () => {
      modelModal.classList.add('hidden');
      document.body.style.overflow = '';
    };

    btnModelCancel?.addEventListener('click', closeModal);
    btnModelDone?.addEventListener('click', () => {
      const selectedRadio = modelModal.querySelector('input[name="selected-model"]:checked');
      if (selectedRadio) {
        modelInput.value = selectedRadio.value;
      }
      closeModal();
    });
  }

  // --- Return Search Autofill Logic ---
  const typeRadios = document.querySelectorAll('input[name="transaction-type"]');
  const searchWrapper = document.getElementById('return-search-wrapper');
  const searchInput = document.getElementById('return-search-input');
  const searchResults = document.getElementById('return-search-results');

  typeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'return') {
        searchWrapper.classList.remove('hidden');
      } else {
        searchWrapper.classList.add('hidden');
        searchInput.value = '';
        searchResults.style.display = 'none';
      }
    });
  });

  if (searchInput && searchResults) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();
      if (!query) {
        searchResults.style.display = 'none';
        return;
      }

      // Find all phones that were delivered (so we can return them)
      const matches = (state.phones || []).filter(p => {
        if (p.transactionType === 'return') return false;
        
        const receivedBy = (p.receivedBy || '').toLowerCase();
        const employeeNumber = (p.employeeNumber || '').toLowerCase();
        const imei = (p.imei || '').toLowerCase();
        const phoneNumber = (p.phoneNumber || '').toLowerCase();
        
        return receivedBy.includes(query) || 
               employeeNumber.includes(query) || 
               imei.includes(query) || 
               phoneNumber.includes(query);
      });

      if (matches.length === 0) {
        searchResults.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 0.9rem;">No matching phones found.</div>';
        searchResults.style.display = 'flex';
        return;
      }

      searchResults.innerHTML = matches.map(p => `
        <div class="search-result-item" style="padding: 12px; border-bottom: 1px solid var(--border-subtle); cursor: pointer; display: flex; flex-direction: column; gap: 4px;" data-id="${p.id}">
          <div style="font-weight: 600; font-size: 0.95rem;">${escHtml(p.receivedBy)} <span style="font-weight: normal; color: var(--text-muted); font-size: 0.85rem;">(Emp: ${escHtml(p.employeeNumber || '—')})</span></div>
          <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; gap: 12px;">
            <span>${escHtml(p.phoneModel)}</span>
            <span>${escHtml(p.phoneNumber)}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">IMEI: ${escHtml(p.imei)}</div>
        </div>
      `).join('');
      searchResults.style.display = 'flex';

      // Add click handlers for autofill
      const items = searchResults.querySelectorAll('.search-result-item');
      items.forEach(item => {
        item.addEventListener('click', () => {
          const phoneId = item.getAttribute('data-id');
          const phone = matches.find(p => String(p.id) === String(phoneId));
          if (phone) {
            document.getElementById('phone-received-by').value = phone.receivedBy || '';
            document.getElementById('phone-employee-number').value = phone.employeeNumber || '';
            document.getElementById('phone-model').value = phone.phoneModel || '';
            document.getElementById('phone-imei').value = phone.imei || '';
            document.getElementById('phone-number').value = phone.phoneNumber || '';
            
            searchInput.value = '';
            searchResults.style.display = 'none';
            showToast('Form auto-filled from selected record.');
          }
        });
      });
    });

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
      if (!searchWrapper.contains(e.target)) {
        searchResults.style.display = 'none';
      }
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

      const typeRadio = document.querySelector('input[name="transaction-type"]:checked');
      const transactionType = typeRadio ? typeRadio.value : 'delivery';

      const payload = {
        assignedBy: document.getElementById('phone-assigned-by').value,
        receivedBy: document.getElementById('phone-received-by').value.trim(),
        employeeNumber: document.getElementById('phone-employee-number').value.trim(),
        phoneModel: document.getElementById('phone-model').value.trim(),
        imei: document.getElementById('phone-imei').value.trim(),
        phoneNumber: document.getElementById('phone-number').value.trim(),
        transactionType,
        assignedAt: new Date().toISOString(),
        signatureName,
        signatureImage,
        photoImage: null,
        notes: document.getElementById('phone-notes').value.trim(),
      };

      try {
        const record = await savePhoneAssignment(payload);
        showToast('Phone assignment saved. Redirecting to receipt...');
        window.location.href = 'phone-receipt.html?phone=' + record.id + '&print=1';

      } catch (error) {
        showToast(error.message || 'Failed to save phone assignment.');
      }
    });
  }

  await loadPhones();
  renderAll();
  startAutoRefresh();
});