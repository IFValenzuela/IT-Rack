// ============================================================
// pages/models.js — Init for models.html (Models view)
// Depends on: config.js, api.js, state.js, utils.js, ui/pills.js,
//             features/models.js, features/devices.js,
//             features/kit.js, ui/auth.js
// ============================================================

/** Page-scoped renderAll: rebuild history, re-render models and kit dropdown. */
function renderAll() {
  rebuildHistory();
  renderModelsTable();
  renderKitDeployDropdown();
  if (currentModelId) openModelDetail(currentModelId);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Mark active nav tab
  const activeTab = document.querySelector('.nav-tab[href="models.html"]');
  if (activeTab) activeTab.classList.add('active');

  await loadFromBackend();
  populateTechnicianSelect();
  updateModelsHeader();

  // ── Close model detail ────────────────────────────────────
  document.getElementById('btn-close-model-detail').addEventListener('click', closeModelDetail);

  // ── Add serial form ───────────────────────────────────────
  const addSerialForm = document.getElementById('add-serial-form');
  addSerialForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentModelId) { showToast('Select a model first.'); return; }
    const serial     = document.getElementById('serial-number-input').value;
    const department = document.getElementById('serial-department-select').value;
    const prNumber   = document.getElementById('serial-pr-input').value;
    const addedBy    = document.getElementById('serial-added-by-select').value;
    addDeviceSerial(currentModelId, serial, department, prNumber, addedBy);
    addSerialForm.reset();
    // Preserve the selected person after form reset.
    const sel = document.getElementById('serial-added-by-select');
    if (sel && addedBy) sel.value = addedBy;
  });

  // ── Add technician sentinel ───────────────────────────────
  const addedBySelect = document.getElementById('serial-added-by-select');
  if (addedBySelect) {
    addedBySelect.addEventListener('change', () => {
      if (addedBySelect.value !== '__add_new__') return;
      const name = prompt("Enter the new person's name:");
      if (name && name.trim()) {
        addTechnician(name.trim());
      } else {
        addedBySelect.value = '';
      }
    });
  }

  // ── Add model dialog ──────────────────────────────────────
  document.getElementById('btn-cancel-add-model').addEventListener('click', closeAddModelDialog);
  document.getElementById('add-model-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name     = document.getElementById('model-name-input').value;
    const category = document.getElementById('model-category-input').value;
    const model    = addModel(name, '', category);
    if (model) closeAddModelDialog();
  });

  // ── Remove serial dialog ──────────────────────────────────
  document.getElementById('btn-cancel-remove-serial').addEventListener('click', closeRemoveSerialDialog);
  document.getElementById('remove-serial-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!pendingRemoveDeviceId) { closeRemoveSerialDialog(); return; }
    const reason      = document.getElementById('remove-reason-input').value;
    const deliveredBy = document.getElementById('remove-delivered-by-select').value;
    const destination = document.getElementById('remove-destination-input').value;
    removeDeviceFromStock(pendingRemoveDeviceId, reason, deliveredBy, destination);
    closeRemoveSerialDialog();
  });

  // ── New Hire Kit wizard ───────────────────────────────────
  const btnCloseNhk = document.getElementById('btn-close-nhk-dialog');
  if (btnCloseNhk) btnCloseNhk.addEventListener('click', closeNewHireKitDialog);

  // ── Kit Deploy panel ──────────────────────────────────────
  const kitDeploySelect = document.getElementById('kit-deploy-select');
  const btnDeployKit    = document.getElementById('btn-deploy-kit');
  if (kitDeploySelect) {
    kitDeploySelect.addEventListener('change', () => renderKitDeployResults(kitDeploySelect.value));
  }
  if (btnDeployKit) {
    btnDeployKit.addEventListener('click', () => {
      deployKit(kitDeploySelect ? kitDeploySelect.value : '');
    });
  }

  // ── Initial render ────────────────────────────────────────
  renderAll();

  // Auto-open model detail if URL contains ?model=<id>
  tryOpenDetailFromUrl();
});
