// ============================================================
// features/kit.js — New Hire Kit wizard + Kit Deploy panel
// Depends on: config.js, api.js, state.js, utils.js,
//             features/models.js (populatePersonSelect),
//             pages/[page].js (renderAll — defined per page)
// ============================================================

/**
 * Fetch kit accessories from the DB and refresh the three config arrays.
 * Falls back silently to the hardcoded defaults if the request fails.
 */
async function loadKitAccessories() {
  try {
    const rows = await apiCall('GET', '/kit-accessories');
    // Rebuild KIT_ACCESSORIES (always end with "Other" if present)
    KIT_ACCESSORIES = rows.map(r => r.name);
    if (!KIT_ACCESSORIES.includes('Other')) KIT_ACCESSORIES.push('Other');
    // Rebuild NO_SERIAL_ITEMS Set
    NO_SERIAL_ITEMS = new Set(rows.filter(r => r.no_serial).map(r => r.name));
    // Rebuild KIT_ACCESSORY_CATEGORIES map
    KIT_ACCESSORY_CATEGORIES = {};
    rows.forEach(r => { KIT_ACCESSORY_CATEGORIES[r.name] = r.category || 'Other'; });
    KIT_ACCESSORY_CATEGORIES['Other'] = KIT_ACCESSORY_CATEGORIES['Other'] || 'Other';
  } catch (e) {
    console.warn('loadKitAccessories: using defaults.', e);
  }
}

/** Open the New Hire Kit wizard and reset all wizard state. */
async function openNewHireKitDialog() {
  await loadKitAccessories();
  nhkState.step          = 1;
  nhkState.kitId         = '';
  nhkState.selectedItems = [];
  nhkState.otherItemText = '';
  nhkState.otherNoSerial = false;
  nhkState.serialInputs  = {};
  nhkState.prNumber      = '';
  nhkState.department    = (currentUser && currentUser.department) ? currentUser.department : '';
  nhkState.addedBy       = (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'delivery')
    ? currentUser.username
    : '';
  document.getElementById('new-hire-kit-dialog').classList.remove('hidden');
  nhkRenderStep();
}

/** Close the New Hire Kit wizard. */
function closeNewHireKitDialog() {
  document.getElementById('new-hire-kit-dialog').classList.add('hidden');
}

/** Update the step-indicator dots and connectors. */
function nhkUpdateStepper() {
  [1, 2, 3].forEach((n) => {
    const dot = document.getElementById(`nhk-step-dot-${n}`);
    if (!dot) return;
    dot.classList.remove('active', 'done');
    if (n < nhkState.step)      dot.classList.add('done');
    else if (n === nhkState.step) dot.classList.add('active');
  });
  document.querySelectorAll('.nhk-step-connector').forEach((c, i) => {
    c.classList.toggle('done', nhkState.step > i + 1);
  });
}

/** Dispatch to the correct step renderer. */
function nhkRenderStep() {
  nhkUpdateStepper();
  const content = document.getElementById('nhk-step-content');
  if (!content) return;
  if (nhkState.step === 1)      nhkRenderStep1(content);
  else if (nhkState.step === 2) nhkRenderStep2(content);
  else if (nhkState.step === 3) nhkRenderStep3(content);
}

// ── Step 1: Kit ID + accessory selection ─────────────────────

function nhkRenderStep1(container) {
  const otherModelOptions = state.models
    .filter((m) => m.category === 'Other')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => `<option value="${escHtml(m.name)}"></option>`)
    .join('');

  const checkboxRows = KIT_ACCESSORIES.map((item) => {
    const isChecked = nhkState.selectedItems.includes(item);
    const isOther   = item === 'Other';
    return `
      <label class="nhk-model-card${isChecked ? ' selected' : ''}" data-item="${item}">
        <input type="checkbox" class="nhk-acc-cb" data-item="${item}" ${isChecked ? 'checked' : ''} />
        <div class="nhk-card-label">${escHtml(item)}</div>
      </label>
      ${isOther ? `
        <datalist id="nhk-other-datalist">${otherModelOptions}</datalist>
        <input type="text" id="nhk-other-text" class="nhk-other-input${isChecked ? '' : ' hidden'}" placeholder="Please specify…" value="${escHtml(nhkState.otherItemText)}" list="nhk-other-datalist" autocomplete="off" />
      ` : ''}
    `;
  }).join('');

  container.innerHTML = `
    <div class="nhk-hire-name-row">
      <label for="nhk-kit-id-input">Kit ID — Ticket # or New Hire Name <span style="color:var(--danger)">*</span></label>
      <input id="nhk-kit-id-input" type="text" placeholder="e.g. Jane-Smith-2026 or PR-20345" value="${escHtml(nhkState.kitId)}" autocomplete="off" />
      <p style="font-size:0.7rem;color:var(--text-muted);margin:3px 0 0;">This ID links all kit devices so you can deploy them all later with one click.</p>
    </div>
    <p style="font-size:0.78rem;color:var(--text-muted);margin:10px 0 6px;">Select the accessories to include in this kit:</p>
    <div class="nhk-model-list">${checkboxRows}</div>
    <div class="nhk-footer">
      <button class="btn ghost" id="nhk-btn-cancel-s1">Cancel</button>
      <button class="btn primary" id="nhk-btn-next-s1">Next: Add Serials →</button>
    </div>
  `;

  const kitIdInput    = document.getElementById('nhk-kit-id-input');
  const otherTextInput = document.getElementById('nhk-other-text');
  kitIdInput.focus();
  kitIdInput.addEventListener('input', () => { nhkState.kitId = kitIdInput.value; });
  if (otherTextInput) {
    otherTextInput.addEventListener('input', () => { nhkState.otherItemText = otherTextInput.value; });
  }

  container.querySelectorAll('.nhk-acc-cb').forEach((cb) => {
    cb.addEventListener('change', () => {
      const item = cb.dataset.item;
      const card = cb.closest('.nhk-model-card');
      if (cb.checked) {
        if (!nhkState.selectedItems.includes(item)) nhkState.selectedItems.push(item);
        if (card) card.classList.add('selected');
        if (item === 'Other' && otherTextInput) otherTextInput.classList.remove('hidden');
      } else {
        nhkState.selectedItems = nhkState.selectedItems.filter((x) => x !== item);
        if (card) card.classList.remove('selected');
        if (item === 'Other' && otherTextInput) otherTextInput.classList.add('hidden');
      }
    });
  });

  container.querySelectorAll('.nhk-model-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.type === 'checkbox' || e.target === otherTextInput) return;
      const cb = card.querySelector('input[type=checkbox]');
      if (!cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change'));
    });
  });

  document.getElementById('nhk-btn-cancel-s1').addEventListener('click', closeNewHireKitDialog);
  document.getElementById('nhk-btn-next-s1').addEventListener('click', () => {
    nhkState.kitId = document.getElementById('nhk-kit-id-input').value.trim();
    if (!nhkState.kitId) {
      showToast('Please enter a Kit ID (ticket # or hire name).');
      document.getElementById('nhk-kit-id-input').focus();
      return;
    }
    if (nhkState.selectedItems.length === 0) {
      showToast('Select at least one accessory for the kit.');
      return;
    }
    if (nhkState.selectedItems.includes('Other') && !nhkState.otherItemText.trim()) {
      showToast('Please specify what "Other" is.');
      document.getElementById('nhk-other-text')?.focus();
      return;
    }
    nhkState.step = 2;
    nhkRenderStep();
  });
}

// ── Step 2: Serial entry ──────────────────────────────────────

function nhkRenderStep2(container) {
  const isNhkAdmin  = currentUser && (currentUser.role === 'admin' || currentUser.role === 'delivery');
  const techOptions = isNhkAdmin
    ? state.technicians.slice().sort((a, b) => a.localeCompare(b))
        .map((t) => `<option value="${escHtml(t)}" ${t === nhkState.addedBy ? 'selected' : ''}>${escHtml(t)}</option>`).join('')
    : `<option value="${escHtml(currentUser.username)}" selected>${escHtml(currentUser.username)}</option>`;

  const serialCards = nhkState.selectedItems.map((item) => {
    const displayName  = item === 'Other' ? (nhkState.otherItemText || 'Other') : item;
    const noSerial     = NO_SERIAL_ITEMS.has(item);
    const isOther      = item === 'Other';
    const currentSerial = nhkState.serialInputs[item] || '';
    const otherNa      = isOther && nhkState.otherNoSerial;

    if (noSerial) {
      return `
        <div class="nhk-assign-card">
          <div>
            <div class="nhk-assign-model-name">${escHtml(displayName)}</div>
            <div class="nhk-assign-model-count">No serial required</div>
          </div>
          <span class="nhk-no-serial-label">N/A</span>
        </div>
      `;
    }

    if (isOther) {
      return `
        <div class="nhk-assign-card nhk-assign-card--other" data-item="Other">
          <div style="flex:1;min-width:0;">
            <div class="nhk-assign-model-name">${escHtml(displayName)}</div>
            <div class="nhk-assign-model-count" style="margin-bottom:6px;">Serial number</div>
            <div class="nhk-other-serial-toggle" style="display:flex;gap:8px;margin-bottom:6px;">
              <button type="button" class="btn ${!otherNa ? 'primary' : 'ghost'} btn-sm nhk-other-toggle-serial" style="font-size:0.75rem;padding:3px 10px;">Add Serial</button>
              <button type="button" class="btn ${otherNa ? 'primary' : 'ghost'} btn-sm nhk-other-toggle-na"     style="font-size:0.75rem;padding:3px 10px;">N/A</button>
            </div>
            ${!otherNa
              ? `<input type="text" class="nhk-new-serial-input" data-item-name="Other" placeholder="e.g. SN-ABC123" value="${escHtml(currentSerial)}" autocomplete="off" style="width:100%;box-sizing:border-box;" />`
              : `<span class="nhk-no-serial-label">N/A — no serial</span>`
            }
          </div>
        </div>
      `;
    }

    return `
      <div class="nhk-assign-card">
        <div>
          <div class="nhk-assign-model-name">${escHtml(displayName)}</div>
          <div class="nhk-assign-model-count">New serial</div>
        </div>
        <input type="text" class="nhk-new-serial-input" data-item-name="${escHtml(item)}" placeholder="e.g. SN-ABC123" value="${escHtml(currentSerial)}" autocomplete="off" />
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 8px;">
      Enter new serial numbers to add to stock under Kit ID <strong>${escHtml(nhkState.kitId)}</strong>:
    </p>
    <div class="nhk-assign-grid">${serialCards}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-top:12px;">
      <div class="form-field">
        <label>PR Number / Ticket <span style="color:var(--danger)">*</span></label>
        <input type="text" id="nhk-pr-input" placeholder="e.g. PR-12345" value="${escHtml(nhkState.prNumber)}" />
      </div>
      <div class="form-field">
        <label>Department <span style="color:var(--danger)">*</span></label>
        <select id="nhk-dept-select" ${isNhkAdmin ? '' : 'disabled'}>
          <option value="">Select department…</option>
          <option value="Planta Oeste" ${nhkState.department === 'Planta Oeste' ? 'selected' : ''}>Planta Oeste</option>
          <option value="Planta Este"  ${nhkState.department === 'Planta Este'  ? 'selected' : ''}>Planta Este</option>
        </select>
      </div>
      <div class="form-field">
        <label>Added by <span style="color:var(--danger)">*</span></label>
        <select id="nhk-addedby-select" ${isNhkAdmin ? '' : 'disabled'}>
          ${isNhkAdmin ? '<option value="">Select person…</option>' : ''}
          ${techOptions}
        </select>
      </div>
    </div>
    <div class="nhk-footer">
      <button class="btn ghost" id="nhk-btn-back-s2">← Back</button>
      <button class="btn primary" id="nhk-btn-next-s2">Review Entry →</button>
    </div>
  `;

  container.querySelectorAll('.nhk-new-serial-input').forEach((inp) => {
    inp.addEventListener('input', () => { nhkState.serialInputs[inp.dataset.itemName] = inp.value; });
  });

  const toggleSerial = container.querySelector('.nhk-other-toggle-serial');
  const toggleNa     = container.querySelector('.nhk-other-toggle-na');
  if (toggleSerial && toggleNa) {
    toggleSerial.addEventListener('click', () => {
      nhkState.otherNoSerial = false;
      _nhkCollectStep2Fields(container);
      nhkRenderStep2(container);
    });
    toggleNa.addEventListener('click', () => {
      nhkState.otherNoSerial = true;
      _nhkCollectStep2Fields(container);
      nhkRenderStep2(container);
    });
  }

  document.getElementById('nhk-btn-back-s2').addEventListener('click', () => {
    _nhkCollectStep2Fields(container);
    nhkState.step = 1;
    nhkRenderStep();
  });

  document.getElementById('nhk-btn-next-s2').addEventListener('click', () => {
    _nhkCollectStep2Fields(container);
    const missingSerials = nhkState.selectedItems.filter(
      (item) =>
        !NO_SERIAL_ITEMS.has(item) &&
        !(item === 'Other' && nhkState.otherNoSerial) &&
        !(nhkState.serialInputs[item] || '').trim()
    );
    if (missingSerials.length > 0) {
      const names = missingSerials.map((item) => item === 'Other' ? (nhkState.otherItemText || 'Other') : item).join(', ');
      showToast(`Enter a serial number for: ${names}`);
      return;
    }
    if (!nhkState.prNumber.trim())  { showToast('Please enter a PR Number / Ticket.'); return; }
    if (!nhkState.department)       { showToast('Please select a department.'); return; }
    if (!nhkState.addedBy)          { showToast('Please select who is adding these devices.'); return; }
    const serialItems = nhkState.selectedItems.filter(
      (item) => !NO_SERIAL_ITEMS.has(item) && !(item === 'Other' && nhkState.otherNoSerial)
    );
    const serials = serialItems.map((item) => nhkState.serialInputs[item].trim().toLowerCase());
    if (new Set(serials).size !== serials.length) {
      showToast('Each serial number must be unique within the kit.');
      return;
    }
    nhkState.step = 3;
    nhkRenderStep();
  });
}

/** Collect current step-2 field values back into nhkState. */
function _nhkCollectStep2Fields(container) {
  container.querySelectorAll('.nhk-new-serial-input').forEach((inp) => {
    nhkState.serialInputs[inp.dataset.itemName] = inp.value;
  });
  const pr   = document.getElementById('nhk-pr-input');
  const dept = document.getElementById('nhk-dept-select');
  const by   = document.getElementById('nhk-addedby-select');
  if (pr)   nhkState.prNumber   = pr.value;
  if (dept) nhkState.department = dept.value;
  if (by)   nhkState.addedBy    = by.value;
}

// ── Step 3: Confirmation ──────────────────────────────────────

function nhkRenderStep3(container) {
  const items = nhkState.selectedItems.map((item) => {
    const displayName = item === 'Other' ? (nhkState.otherItemText || 'Other') : item;
    const serial      = nhkState.serialInputs[item] || '—';
    return `
      <div class="nhk-confirm-item">
        <span class="nhk-ci-model">${escHtml(displayName)}</span>
        <span class="nhk-ci-serial">${escHtml(serial)}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="nhk-confirm-header">
      <span class="nhk-hire-label">Kit ID (Ticket / New Hire Name):</span>
      <span class="nhk-hire-value">${escHtml(nhkState.kitId)}</span>
    </div>
    <div style="display:flex;gap:14px;font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;flex-wrap:wrap;">
      <span>PR: <strong style="color:var(--text-main)">${escHtml(nhkState.prNumber)}</strong></span>
      <span>Dept: <strong style="color:var(--text-main)">${escHtml(nhkState.department)}</strong></span>
      <span>Added by: <strong style="color:var(--text-main)">${escHtml(nhkState.addedBy)}</strong></span>
    </div>
    <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 8px;">
      The following serials will be <strong>added to stock</strong> and tagged with this Kit ID:
    </p>
    <div class="nhk-confirm-list">${items}</div>
    <div class="nhk-footer">
      <button class="btn ghost" id="nhk-btn-back-s3">← Back</button>
      <button class="btn primary" id="nhk-btn-submit">Add to Stock</button>
    </div>
  `;

  document.getElementById('nhk-btn-back-s3').addEventListener('click', () => {
    nhkState.step = 2;
    nhkRenderStep();
  });
  document.getElementById('nhk-btn-submit').addEventListener('click', submitNewHireKit);
}

// ── Submit ────────────────────────────────────────────────────

/** Persist all kit items to the backend, then update local state. */
async function submitNewHireKit() {
  const kitId = nhkState.kitId.trim();
  if (!kitId) { showToast('Kit ID is missing.'); return; }

  const now       = new Date().toISOString();
  let addedCount  = 0;

  for (const item of nhkState.selectedItems) {
    const itemName = item === 'Other' ? (nhkState.otherItemText.trim() || 'Other') : item;
    const noSerial = NO_SERIAL_ITEMS.has(item) || (item === 'Other' && nhkState.otherNoSerial);
    const cleanSerial = noSerial ? 'N/A' : (nhkState.serialInputs[item] || '').trim();
    if (!noSerial && !cleanSerial) continue;

    let model = state.models.find((m) => m.name.toLowerCase() === itemName.toLowerCase());
    if (!model) {
      const category = KIT_ACCESSORY_CATEGORIES[item] || 'Other';
      try {
        const newModelId = uid();
        await apiCall('POST', '/models', { id: newModelId, name: itemName, category, notes: '', createdAt: now });
        model = { id: newModelId, name: itemName, category, createdAt: now };
        state.models.push(model);
      } catch (e) {
        console.error('Error creating model:', e);
        continue;
      }
    }

    if (!noSerial) {
      const duplicate = state.devices.find(
        (d) => d.modelId === model.id && d.serial.toLowerCase() === cleanSerial.toLowerCase() && d.status === 'in'
      );
      if (duplicate) { showToast(`"${cleanSerial}" already in stock for ${itemName}. Skipped.`); continue; }
    }

    try {
      const newDeviceId = uid();
      await apiCall('POST', '/devices', {
        id:         newDeviceId,
        modelId:    model.id,
        serial:     cleanSerial,
        prNumber:   nhkState.prNumber.trim(),
        status:     'in',
        department: nhkState.department,
        addedBy:    nhkState.addedBy,
        kit_id:     kitId,
        createdAt:  now,
      });
      state.devices.push({
        id:          newDeviceId,
        modelId:     model.id,
        serial:      cleanSerial,
        prNumber:    nhkState.prNumber.trim(),
        status:      'in',
        department:  nhkState.department,
        addedBy:     nhkState.addedBy,
        kit_id:      kitId,
        createdAt:   now,
        removedAt:   null,
        reason:      '',
        destination: '',
      });
      addedCount++;
    } catch (e) {
      console.error('Error adding device:', e);
    }
  }

  if (addedCount === 0) { showToast('No devices were added. Check for duplicate serials.'); return; }

  renderAll();
  closeNewHireKitDialog();
  showToast(`${addedCount} device${addedCount > 1 ? 's' : ''} added to stock under Kit "${kitId}".`);
}

// ── Kit Deploy panel ──────────────────────────────────────────

/**
 * Return all in-stock devices belonging to a given kit.
 * @param {string} kitId
 * @returns {Array}
 */
function getKitItems(kitId) {
  return state.devices.filter((d) => d.kit_id === kitId && d.status === 'in');
}

/**
 * Render the kit-deploy results table for the given kit ID.
 * Hides or shows the Deploy button accordingly.
 * @param {string} kitId
 */
function renderKitDeployResults(kitId) {
  const resultsEl = document.getElementById('kit-deploy-results');
  const deployBtn = document.getElementById('btn-deploy-kit');
  if (!resultsEl) return;

  if (!kitId) {
    resultsEl.classList.add('empty-state');
    resultsEl.innerHTML = '<p>Enter a Kit ID and click Search.</p>';
    if (deployBtn) deployBtn.classList.add('hidden');
    return;
  }

  const items = getKitItems(kitId);
  if (!items.length) {
    resultsEl.classList.add('empty-state');
    resultsEl.innerHTML = `<p>No in-stock devices found for kit <strong>"${escHtml(kitId)}"</strong>.</p>`;
    if (deployBtn) deployBtn.classList.add('hidden');
    return;
  }

  resultsEl.classList.remove('empty-state');
  const rows = items.slice().sort((a, b) => a.serial.localeCompare(b.serial)).map((d) => {
    const model = state.models.find((m) => m.id === d.modelId);
    return `
      <tr>
        <td>${model ? escHtml(model.name) + ' ' + getCategoryBadge(model.category) : 'Unknown'}</td>
        <td>${escHtml(d.serial)}</td>
        <td>${escHtml(d.prNumber || '')}</td>
        <td>${escHtml(d.department || '')}</td>
        <td>${escHtml(d.addedBy || '')}</td>
        <td>${formatDateTime(d.createdAt)}</td>
      </tr>
    `;
  }).join('');

  resultsEl.innerHTML = `
    <table>
      <thead>
        <tr><th>Model</th><th>Serial</th><th>PR / Ticket</th><th>Department</th><th>Added by</th><th>Added</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  if (deployBtn) {
    deployBtn.classList.remove('hidden');
    deployBtn.textContent = `Remove All (${items.length} device${items.length > 1 ? 's' : ''})`;
  }
}

/**
 * Deploy (remove from stock) all devices in the given kit.
 * @param {string} kitId
 */
async function deployKit(kitId) {
  const deliveredBy = (document.getElementById('kit-deploy-delivered-by')?.value || '').trim();
  if (!deliveredBy) {
    showToast('Please select who is removing this kit.');
    document.getElementById('kit-deploy-delivered-by')?.focus();
    return;
  }
  const items = getKitItems(kitId);
  if (!items.length) { showToast('No in-stock devices found for this kit.'); return; }
  if (!confirm(`Remove all ${items.length} device${items.length > 1 ? 's' : ''} in kit "${kitId}"?\n\nThey will be marked as Removed from stock.`)) return;

  const now = new Date().toISOString();
  for (const device of items) {
    try {
      await apiCall('PUT', `/devices/${device.id}`, {
        status:      'out',
        reason:      'New Hire Kit Deployment',
        deliveredBy: deliveredBy,
        destination: kitId,
      });
      device.status      = 'out';
      device.removedAt   = now;
      device.reason      = 'New Hire Kit Deployment';
      device.deliveredBy = deliveredBy;
      device.destination = kitId;
    } catch (e) {
      console.error('Error removing device:', e);
    }
  }

  renderAll();

  const resultsEl = document.getElementById('kit-deploy-results');
  const deployBtn = document.getElementById('btn-deploy-kit');
  if (resultsEl) {
    resultsEl.classList.add('empty-state');
    resultsEl.innerHTML = `<p>Kit "${escHtml(kitId)}" deployed by ${escHtml(deliveredBy)}. ${items.length} device${items.length > 1 ? 's' : ''} removed from stock.</p>`;
  }
  if (deployBtn) deployBtn.classList.add('hidden');
  showToast(`Kit "${kitId}" deployed by ${deliveredBy} — ${items.length} device${items.length > 1 ? 's' : ''} removed.`);
}

/** Rebuild the Kit Deploy dropdown to reflect current in-stock kits. */
function renderKitDeployDropdown() {
  const sel = document.getElementById('kit-deploy-select');
  if (!sel) return;
  const prevVal = sel.value;

  const kitIds = [...new Set(
    state.devices.filter((d) => d.kit_id && d.status === 'in').map((d) => d.kit_id)
  )].sort((a, b) => a.localeCompare(b));

  sel.innerHTML = kitIds.length
    ? '<option value="">— Select a kit —</option>'
    : '<option value="">— No kits in stock —</option>';

  kitIds.forEach((id) => {
    const count = state.devices.filter((d) => d.kit_id === id && d.status === 'in').length;
    const opt   = document.createElement('option');
    opt.value       = id;
    opt.textContent = `${id}  (${count} device${count > 1 ? 's' : ''})`;
    sel.appendChild(opt);
  });

  if (prevVal && kitIds.includes(prevVal)) {
    sel.value = prevVal;
  } else if (prevVal) {
    const resultsEl = document.getElementById('kit-deploy-results');
    const deployBtn = document.getElementById('btn-deploy-kit');
    if (resultsEl) {
      resultsEl.classList.add('empty-state');
      resultsEl.innerHTML = '<p>Select a kit from the dropdown above.</p>';
    }
    if (deployBtn) deployBtn.classList.add('hidden');
  }

  populatePersonSelect('kit-deploy-delivered-by', { showAddNew: false });
}
