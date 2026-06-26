// ============================================================
// features/models.js — Models panel: CRUD, category pills,
//                      person-select helpers, model detail
// Depends on: config.js, api.js, state.js, utils.js, ui/pills.js
// ============================================================

// ── Person-select helpers ─────────────────────────────────────

/**
 * Populate a person-select <select> with the current technicians list.
 *  - Non-admin / non-delivery users see only their own name (locked).
 *  - Admin users also get a "+ Add new person…" sentinel (when showAddNew is true).
 *
 * @param {string} selectId
 * @param {{ showAddNew?: boolean }} [opts]
 */
function populatePersonSelect(selectId, { showAddNew = true } = {}) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const isPrivileged = currentUser &&
    (currentUser.role === 'admin' || currentUser.role === 'delivery');
  if (!isPrivileged) {
    const name = currentUser ? currentUser.username : 'Unknown';
    sel.innerHTML = `<option value="${escHtml(name)}">${escHtml(name)}</option>`;
    sel.value     = name;
    sel.disabled  = true;
    return;
  }
  sel.disabled = false;
  
  // Ensure the current user's name is always in the list (even if API excluded admins)
  const allNames = new Set(state.technicians || []);
  if (currentUser && currentUser.username) {
    allNames.add(currentUser.username);
  }

  sel.innerHTML  = '<option value="">Select person…</option>';
  
  Array.from(allNames)
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      const opt = document.createElement('option');
      opt.value       = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });

  if (currentUser && currentUser.username) {
    sel.value = currentUser.username;
  }
  if (showAddNew && currentUser.role === 'admin') {
    const addOpt = document.createElement('option');
    addOpt.value       = '__add_new__';
    addOpt.textContent = '+ Add new person…';
    sel.appendChild(addOpt);
  }
}

/** Thin wrappers kept so existing call-sites don't need to change. */
function populateTechnicianSelect()  { populatePersonSelect('serial-added-by-select'); }
function populateDeliveredBySelect() { populatePersonSelect('remove-delivered-by-select'); }

/**
 * Add a new technician by name, persist it to the backend, and refresh selects.
 * @param {string} name
 * @returns {Promise<boolean>}
 */
async function addTechnician(name) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (state.technicians.includes(trimmed)) {
    showToast('That person is already in the list.');
    return false;
  }
  try {
    await apiCall('POST', '/technicians', { name: trimmed });
    state.technicians.push(trimmed);
    populateTechnicianSelect();
    const sel = document.getElementById('serial-added-by-select');
    if (sel) sel.value = trimmed;
    showToast(`"${trimmed}" added to the team list.`);
    return true;
  } catch (e) {
    showToast(`Error adding technician: ${e.message}`);
    return false;
  }
}

// ── Models header ─────────────────────────────────────────────

/** Re-render the models panel header (filter input + action buttons). */
function updateModelsHeader() {
  const actions = document.getElementById('models-header-actions');
  if (!actions) return;
  const filterEl    = document.getElementById('filter-models-input');
  const filterValue = filterEl ? filterEl.value : '';
  const filterHtml  = `<input type="text" id="filter-models-input" class="filter-input" placeholder="Search models…" value="${(filterValue || '').replace(/"/g, '&quot;')}" aria-label="Search device models" />`;
  if (deleteMode) {
    actions.innerHTML = `
      ${filterHtml}
      <button class="btn danger" id="btn-confirm-delete-models">Delete Selected</button>
      <button class="btn ghost" id="btn-cancel-delete-mode">Cancel</button>
    `;
    document.getElementById('btn-confirm-delete-models').addEventListener('click', deleteSelectedModels);
    document.getElementById('btn-cancel-delete-mode').addEventListener('click', exitDeleteMode);
  } else {
    const isAdmin = currentUser && currentUser.role === 'admin';
    actions.innerHTML = `
      ${filterHtml}
      <button class="btn ghost" id="btn-prepare-kit">Prepare Kit</button>
      <button class="btn ghost" id="btn-open-deploy-kit">Remove a Kit</button>
      ${isAdmin ? '<button class="btn ghost" id="btn-enter-delete-mode">Delete</button>' : ''}
      <button class="btn primary" id="btn-open-add-model-dialog">+ New Model</button>
    `;
    document.getElementById('btn-prepare-kit').addEventListener('click', openNewHireKitDialog);
    document.getElementById('btn-open-deploy-kit').addEventListener('click', () => {
      const panel = document.getElementById('kit-deploy-panel');
      if (panel) panel.classList.toggle('hidden');
    });
    if (isAdmin) document.getElementById('btn-enter-delete-mode').addEventListener('click', enterDeleteMode);
    document.getElementById('btn-open-add-model-dialog').addEventListener('click', openAddModelDialog);
  }
  const newFilter = document.getElementById('filter-models-input');
  if (newFilter) {
    newFilter.addEventListener('input', () => { modelsVisible = 8; renderModelsTable(); });
  }
}

// ── Delete mode ───────────────────────────────────────────────

/** Enter multi-select delete mode. */
function enterDeleteMode() {
  deleteMode = true;
  selectedModelIds.clear();
  renderModelsTable();
  updateModelsHeader();
}

/** Exit multi-select delete mode without deleting. */
function exitDeleteMode() {
  deleteMode = false;
  selectedModelIds.clear();
  renderModelsTable();
  updateModelsHeader();
}

/** Delete all currently selected models (with their devices). */
async function deleteSelectedModels() {
  if (selectedModelIds.size === 0) {
    showToast('Select at least one model to delete.');
    return;
  }
  const count = selectedModelIds.size;
  const names = state.models
    .filter((m) => selectedModelIds.has(m.id))
    .map((m) => `• ${m.name}`)
    .join('\n');
  if (!confirm(`Delete ${count} model${count > 1 ? 's' : ''}?\n${names}\n\nAll their devices will also be removed.`)) return;

  try {
    for (const id of selectedModelIds) {
      await apiCall('DELETE', `/models/${id}`);
      if (currentModelId === id) closeModelDetail();
      state.models  = state.models.filter((m) => m.id !== id);
      state.devices = state.devices.filter((d) => d.modelId !== id);
    }
    exitDeleteMode();
    renderAll();
    showToast(`${count} model${count > 1 ? 's' : ''} deleted.`);
  } catch (e) {
    showToast(`Error deleting models: ${e.message}`);
  }
}

// ── Category pills ────────────────────────────────────────────

/** Render the category filter pills above the models table. */
function renderCategoryPills() {
  const container = document.getElementById('category-pills-container');
  if (!container) return;
  if (!state.models.length) { container.innerHTML = ''; return; }

  const counts = { All: state.models.length };
  CATEGORIES.forEach(c => { counts[c] = 0; });
  state.models.forEach(m => {
    if (m.category && counts[m.category] !== undefined) counts[m.category]++;
  });

  const pills = ['All', ...CATEGORIES].map(cat => {
    const isActive = currentCategoryFilter === cat;
    const count    = counts[cat] || 0;
    return `<button class="pill ${isActive ? 'active' : ''}" data-category="${cat}">${cat} <span class="pill-count">${count}</span></button>`;
  }).join('');

  container.innerHTML = pills;
  container.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCategoryFilter = btn.dataset.category;
      modelsVisible = 8;
      renderModelsTable();
      renderCategoryPills();
    });
  });
}

// ── Models table ──────────────────────────────────────────────

/** Re-render the full models list with optional filter + pagination. */
function renderModelsTable() {
  renderCategoryPills();
  const container = document.getElementById('models-table-container');
  if (!container) return;
  if (!state.models.length) {
    container.classList.add('empty-state');
    container.innerHTML = '<p>No models yet. Use New Models to create one.</p>';
    return;
  }
  const filterEl = document.getElementById('filter-models-input');
  const filter   = filterEl ? filterEl.value.trim().toLowerCase() : '';
  let modelsToShow = state.models.slice();
  if (currentCategoryFilter !== 'All') {
    modelsToShow = modelsToShow.filter(m => m.category === currentCategoryFilter);
  }
  if (filter) {
    modelsToShow = modelsToShow.filter(
      (m) => (m.name || '').toLowerCase().includes(filter) || (m.category || '').toLowerCase().includes(filter)
    );
  }
  if (!modelsToShow.length) {
    container.classList.remove('empty-state');
    container.innerHTML = '<p>No models match your search.</p>';
    return;
  }
  container.classList.remove('empty-state');
  const sortedModels  = modelsToShow.slice().sort((a, b) => a.name.localeCompare(b.name));
  const totalModels   = sortedModels.length;
  const visibleModels = Math.min(modelsVisible, totalModels);
  const rows = sortedModels
    .slice(0, visibleModels)
    .map((m) => {
      const inCount  = state.devices.filter((d) => d.modelId === m.id && d.status === 'in').length;
      const outCount = state.devices.filter((d) => d.modelId === m.id && d.status === 'out').length;
      const checkCell = deleteMode
        ? `<td style="width:36px;padding:7px 10px;"><input type="checkbox" class="js-model-checkbox" data-model-id="${m.id}" ${selectedModelIds.has(m.id) ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;" /></td>`
        : '';
      return `
        <tr data-model-id="${m.id}" class="js-row-model${deleteMode ? ' row-selectable' : ''}">
          ${checkCell}
          <td>${escHtml(m.name)} ${getCategoryBadge(m.category)}</td>
          <td>${inCount}</td>
          <td>${outCount}</td>
          <td>${formatDateTime(m.createdAt)}</td>
        </tr>
      `;
    })
    .join('');
  const checkHeader = deleteMode ? '<th></th>' : '';
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          ${checkHeader}
          <th>Model</th>
          <th>In stock</th>
          <th>Removed</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${totalModels > visibleModels ? `<div style="text-align:center;margin-top:10px;"><button type="button" class="btn ghost" id="btn-models-show-more">Show More</button></div>` : ''}
  `;
  const showMoreBtn = container.querySelector('#btn-models-show-more');
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', () => { modelsVisible += 8; renderModelsTable(); });
  }
  container.querySelectorAll('.js-row-model').forEach((row) => {
    if (deleteMode) {
      row.addEventListener('click', (e) => {
        const cb = row.querySelector('.js-model-checkbox');
        if (!cb) return;
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        const id = row.getAttribute('data-model-id');
        if (cb.checked) selectedModelIds.add(id);
        else selectedModelIds.delete(id);
      });
      const cb = row.querySelector('.js-model-checkbox');
      if (cb) {
        cb.addEventListener('change', () => {
          const id = row.getAttribute('data-model-id');
          if (cb.checked) selectedModelIds.add(id);
          else selectedModelIds.delete(id);
        });
      }
    } else {
      row.addEventListener('click', () => {
        openModelDetail(row.getAttribute('data-model-id'));
      });
    }
  });
}

// ── Model detail ──────────────────────────────────────────────

/** Open the model detail panel for the given modelId. */
function openModelDetail(modelId) {
  const model = state.models.find((m) => m.id === modelId);
  if (!model) return;
  currentModelId = modelId;
  const detailSection = document.getElementById('model-detail');
  detailSection.classList.remove('hidden');
  document.getElementById('model-detail-title').textContent    = model.name;
  document.getElementById('model-detail-subtitle').textContent = model.notes || 'Manage serial numbers and deliveries for this model.';
  const inCount  = state.devices.filter((d) => d.modelId === model.id && d.status === 'in').length;
  const outCount = state.devices.filter((d) => d.modelId === model.id && d.status === 'out').length;
  document.getElementById('model-detail-counts').textContent = `${inCount} in stock - ${outCount} removed`;

  // Hide/adjust serial input based on category
  const serialInput  = document.getElementById('serial-number-input');
  const serialWrap   = serialInput ? serialInput.closest('.form-field') : null;
  const serialNaWrap = document.getElementById('serial-na-wrap');
  const serialNaCheck = document.getElementById('serial-na-check');
  const isCable      = (model.category || '') === 'Cable';
  const isOther      = (model.category || '') === 'Other';
  if (serialInput) {
    if (isCable) {
      serialInput.value    = 'N/A';
      serialInput.readOnly = true;
      serialInput.disabled = false;
      serialInput.removeAttribute('required');
      if (serialWrap) serialWrap.style.display = 'none';
    } else {
      serialInput.value    = '';
      serialInput.readOnly = false;
      serialInput.disabled = false;
      serialInput.setAttribute('required', '');
      if (serialWrap) serialWrap.style.display = '';
    }
  }
  // Show N/A checkbox only for Other category; reset it
  if (serialNaWrap)  serialNaWrap.style.display  = isOther ? 'flex' : 'none';
  if (serialNaCheck) serialNaCheck.checked = false;

  renderModelSerialsTable(model.id);
  modelHistoryVisible = 10;
  renderModelHistoryTable(model.id);
}

/** Close the model detail panel. */
function closeModelDetail() {
  currentModelId = null;
  document.getElementById('model-detail').classList.add('hidden');
}

/** Render the in-stock serials table inside the model detail panel. */
function renderModelSerialsTable(modelId) {
  const container = document.getElementById('model-serials-table-container');
  if (!container) return;
  const serials = state.devices.filter((d) => d.modelId === modelId && d.status === 'in');
  if (!serials.length) {
    container.classList.add('empty-state');
    container.innerHTML = '<p>No serials yet for this model.</p>';
    return;
  }
  container.classList.remove('empty-state');
  const rows = serials
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((d) => {
      const { rowClass, badge } = getStockAgeInfo(d.createdAt);
      return `
        <tr data-device-id="${d.id}" class="${rowClass}">
          <td>${escHtml(d.serial)}</td>
          <td>${escHtml(d.prNumber || '')}</td>
          <td>${escHtml(d.department || '')}</td>
          <td>${escHtml(d.addedBy || '')}</td>
          <td>${formatDateTime(d.createdAt)}${badge}</td>
          <td style="text-align:right;">
            <button class="btn ghost js-remove-serial" type="button">Remove from stock</button>
          </td>
        </tr>
      `;
    })
    .join('');
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Serial</th>
          <th>PR / Ticket</th>
          <th>Department</th>
          <th>Added by</th>
          <th>Added</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  container.querySelectorAll('.js-remove-serial').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      const id  = row.getAttribute('data-device-id');
      openRemoveSerialDialog(id);
    });
  });
}

/** Render paginated history for the given model inside the model detail panel. */
function renderModelHistoryTable(modelId) {
  const container = document.getElementById('model-history-table-container');
  if (!container) return;
  const entries = state.history
    .filter((h) => h.modelId === modelId)
    .slice()
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  if (!entries.length) {
    container.classList.add('empty-state');
    container.innerHTML = '<p>No history yet. Add or remove serials to see activity.</p>';
    return;
  }
  container.classList.remove('empty-state');
  const total   = entries.length;
  const visible = Math.min(modelHistoryVisible, total);
  const rows = entries
    .slice(0, visible)
    .map((h) => {
      const statusClass  = h.type === 'in' ? 'status-in' : 'status-out';
      const label        = h.type === 'in' ? 'Added' : 'Removed';
      const technician   = h.addedBy || h.deliveredBy || '';
      const dash         = '<span style="color:var(--text-muted)">—</span>';
      const reason       = h.reason || (h.type === 'in' ? dash : '');
      const destination  = h.destination || (h.type === 'in' ? dash : '');
      let rowClass = '';
      if (h.type === 'in') {
        const device = state.devices.find((d) => d.serial === h.serial && d.modelId === h.modelId && d.status === 'in');
        if (device) rowClass = getStockAgeInfo(device.createdAt).rowClass;
      }
      return `
        <tr class="${rowClass}">
          <td><span class="status-chip ${statusClass}">${label}</span></td>
          <td>${escHtml(h.serial)}</td>
          <td>${escHtml(h.prNumber || '')}</td>
          <td>${escHtml(technician)}</td>
          <td>${reason}</td>
          <td>${destination}</td>
          <td>${formatDateTime(h.at)}</td>
        </tr>
      `;
    })
    .join('');
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Serial</th>
          <th>PR / Ticket</th>
          <th>Handled by</th>
          <th>Reason</th>
          <th>Destination</th>
          <th>At</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${total > visible ? `<div style="text-align:center;margin-top:10px;"><button type="button" class="btn ghost" id="btn-model-history-show-more">Show More</button></div>` : ''}
  `;
  const showMoreBtn = container.querySelector('#btn-model-history-show-more');
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', () => {
      modelHistoryVisible += 10;
      renderModelHistoryTable(modelId);
    });
  }
}

// ── Add / Edit model dialogs ──────────────────────────────────

/** Show the Add Model dialog. */
function openAddModelDialog() {
  document.getElementById('add-model-dialog').classList.remove('hidden');
  document.getElementById('model-name-input').focus();
}

/** Hide and reset the Add Model dialog. */
function closeAddModelDialog() {
  document.getElementById('add-model-dialog').classList.add('hidden');
  document.getElementById('add-model-form').reset();
  const catInput = document.getElementById('model-category-input');
  if (catInput) catInput.value = '';
}

/**
 * Create a new model via the backend and add it to local state.
 * @param {string} name
 * @param {string} notes
 * @param {string} category
 * @returns {Promise<object|undefined>}
 */
async function addModel(name, notes, category) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const cleanCategory = (category || '').trim();
  if (!cleanCategory) { showToast('Please select a category.'); return; }
  try {
    const newModelId = uid();
    const now        = new Date().toISOString();
    await apiCall('POST', '/models', {
      id:        newModelId,
      name:      trimmed,
      notes:     (notes || '').trim(),
      category:  cleanCategory,
      createdAt: now,
    });
    const model = { id: newModelId, name: trimmed, notes, category: cleanCategory, createdAt: now };
    state.models.push(model);
    renderAll();
    showToast(`Model ${model.name} created.`);
    return model;
  } catch (e) {
    showToast(`Error creating model: ${e.message}`);
  }
}

/**
 * If the URL contains ?model=<id>, auto-open that model's detail panel.
 * Call this after the initial renderModelsTable() on models.html.
 */
function tryOpenDetailFromUrl() {
  const params  = new URLSearchParams(location.search);
  const modelId = params.get('model');
  if (modelId) openModelDetail(decodeURIComponent(modelId));
}
