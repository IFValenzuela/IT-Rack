// ============================================================
// features/devices.js — Devices view: dashboard, in/out tables,
//                        add & remove device serial dialogs
// Depends on: config.js, api.js, state.js, utils.js,
//             ui/pills.js, features/models.js
// ============================================================

/** Update the three summary counters at the top of the dashboard. */
function renderDashboard() {
  const totalModels = state.models.length;
  const inStock     = state.devices.filter((d) => d.status === 'in').length;
  const removed     = state.devices.filter((d) => d.status === 'out').length;

  document.getElementById('summary-total-models').textContent = totalModels;
  document.getElementById('summary-in-stock').textContent     = inStock;
  document.getElementById('summary-removed').textContent      = removed;

  const list = document.getElementById('dashboard-models-list');
  if (!list) return;
  if (!state.models.length) {
    list.classList.add('empty-state');
    list.innerHTML = '<p>No models yet. Go to the Models tab to add your first one.</p>';
    return;
  }
  list.classList.remove('empty-state');
  list.innerHTML = '';
  state.models
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((m) => {
      const countIn  = state.devices.filter((d) => d.modelId === m.id && d.status === 'in').length;
      const countOut = state.devices.filter((d) => d.modelId === m.id && d.status === 'out').length;
      const card = document.createElement('button');
      card.className         = 'dash-model-card';
      card.dataset.modelId   = m.id;
      card.innerHTML = `
        <div class="dmc-body">
          <div class="dmc-name">${escHtml(m.name)}</div>
          <div class="dmc-counts">
            <span class="dmc-badge in">${countIn} in stock</span>
            <span class="dmc-badge out">${countOut} removed</span>
          </div>
        </div>
        <span class="dmc-arrow">→</span>
      `;
      card.addEventListener('click', () => {
        window.location.href = 'models.html?model=' + encodeURIComponent(m.id);
      });
      list.appendChild(card);
    });
}

/** Reset both in-stock and removed pagination to their defaults. */
function resetDevicesPagination() {
  visibleIn  = viewModeIn  === 'grouped' ? DEFAULT_LIMIT_GROUPED   : DEFAULT_LIMIT_INDIVIDUAL;
  visibleOut = viewModeOut === 'grouped' ? DEFAULT_LIMIT_GROUPED   : DEFAULT_LIMIT_INDIVIDUAL;
  previousVisibleIn  = visibleIn;
  previousVisibleOut = visibleOut;
}

/** Render the full Devices view (in-stock table + removed table). */
function renderDevicesView() {
  const inContainer  = document.getElementById('devices-table-container');
  const outContainer = document.getElementById('devices-removed-table-container');
  const deptFilterEl = document.getElementById('filter-department');
  const textFilterEl = document.getElementById('filter-location-owner');
  const deptFilter   = deptFilterEl ? deptFilterEl.value : '';
  const textFilter   = textFilterEl ? textFilterEl.value.trim().toLowerCase() : '';

  let inDevices  = state.devices.filter((d) => d.status === 'in');
  let outDevices = state.devices.filter((d) => d.status === 'out');

  if (deptFilter) {
    inDevices = inDevices.filter((d) => (d.department || '') === deptFilter);
  }
  if (textFilter) {
    inDevices = inDevices.filter((d) => {
      const model = state.models.find((m) => m.id === d.modelId) || {};
      return (
        (model.name     || '').toLowerCase().includes(textFilter) ||
        (model.category || '').toLowerCase().includes(textFilter) ||
        (d.serial       || '').toLowerCase().includes(textFilter) ||
        (d.prNumber     || '').toLowerCase().includes(textFilter) ||
        (d.destination  || '').toLowerCase().includes(textFilter)
      );
    });
  }

  renderFilterPills('devices-cat-pills', inDevices, (d) => d.modelId, devicesCategoryFilter, (cat) => {
    devicesCategoryFilter = cat;
    resetDevicesPagination();
    renderDevicesView();
  });

  if (devicesCategoryFilter) {
    inDevices = inDevices.filter((d) => {
      const model = state.models.find((m) => m.id === d.modelId);
      return model && (model.category || '') === devicesCategoryFilter;
    });
  }

  if (removedDeptFilter) {
    outDevices = outDevices.filter((d) => (d.department || '') === removedDeptFilter);
  }
  if (removedTextFilter) {
    outDevices = outDevices.filter((d) => {
      const model = state.models.find((m) => m.id === d.modelId) || {};
      return (
        (model.name     || '').toLowerCase().includes(removedTextFilter) ||
        (model.category || '').toLowerCase().includes(removedTextFilter) ||
        (d.serial       || '').toLowerCase().includes(removedTextFilter) ||
        (d.prNumber     || '').toLowerCase().includes(removedTextFilter) ||
        (d.destination  || '').toLowerCase().includes(removedTextFilter) ||
        (d.reason       || '').toLowerCase().includes(removedTextFilter)
      );
    });
  }

  if (devicesRemovedDestFilter) {
    outDevices = outDevices.filter((d) => (d.destination || d.reason || '') === devicesRemovedDestFilter);
  }

  renderFilterPills('removed-cat-pills', outDevices, (d) => d.modelId, removedCategoryFilter, (cat) => {
    removedCategoryFilter = cat;
    resetDevicesPagination();
    renderDevicesView();
  });

  if (removedCategoryFilter) {
    outDevices = outDevices.filter((d) => {
      const model = state.models.find((m) => m.id === d.modelId);
      return model && (model.category || '') === removedCategoryFilter;
    });
  }

  const totalRemoved = state.devices.filter((d) => d.status === 'out').length;
  const toggleBtn    = document.getElementById('btn-toggle-removed');
  if (toggleBtn) toggleBtn.textContent = `View Removed (${totalRemoved})`;

  const countLabel = document.getElementById('removed-count-label');
  if (countLabel) countLabel.textContent = `${outDevices.length} record${outDevices.length !== 1 ? 's' : ''}`;

  renderDashboard();

  const increment = (viewMode) => viewMode === 'grouped' ? INCREMENT_GROUPED : INCREMENT_INDIVIDUAL;

  const renderList = (devices, container, isOut, viewMode, sortDir, visibleCount, previousVisibleCount, onShowMore) => {
    const dateField = isOut ? 'removedAt' : 'createdAt';
    if (!devices.length) {
      container.classList.add('empty-state');
      container.innerHTML = `<p>No ${isOut ? 'removed' : 'in-stock'} devices match the current filters.</p>`;
      return;
    }
    container.classList.remove('empty-state');

    if (viewMode === 'all' || viewMode === 'individual') {
      let listDevices = devices;
      if (viewMode === 'individual') listDevices = devices.filter(d => !d.kit_id);

      const sorted = listDevices.slice().sort((a, b) =>
        sortDir === 'desc'
          ? new Date(b[dateField]) - new Date(a[dateField])
          : new Date(a[dateField]) - new Date(b[dateField])
      );
      const total  = sorted.length;
      const toShow = sorted.slice(0, visibleCount);
      const rows   = toShow.map((d, idx) => {
        const revealClass = idx >= previousVisibleCount ? ' row-reveal' : '';
        const model = state.models.find((m) => m.id === d.modelId);
        if (!isOut) {
          const { rowClass, badge } = getStockAgeInfo(d.createdAt);
          return `<tr class="${rowClass}${revealClass} js-in-row" data-device-id="${d.id}" style="cursor:pointer;" title="Click to remove from stock">
            <td>${model ? escHtml(model.name) + ' ' + getCategoryBadge(model.category) : 'Unknown model'}</td>
            <td>${escHtml(d.department || '')}</td><td>${escHtml(d.serial)}</td>
            <td>${escHtml(d.prNumber || '')}</td><td>${escHtml(d.addedBy || '')}</td>
            <td>${formatDateTime(d.createdAt)}${badge}</td>
          </tr>`;
        } else {
          return `<tr class="${revealClass}">
            <td>${model ? escHtml(model.name) + ' ' + getCategoryBadge(model.category) : 'Unknown model'}</td>
            <td>${escHtml(d.department || '')}</td><td>${escHtml(d.serial)}</td>
            <td>${escHtml(d.prNumber || '')}</td><td>${escHtml(d.deliveredBy || '')}</td>
            <td>${escHtml(d.reason || '')}</td><td>${escHtml(d.destination || '')}</td>
            <td>${formatDateTime(d.removedAt)}</td>
          </tr>`;
        }
      }).join('');

      const headIn  = `<th>Model</th><th>Department</th><th>Serial</th><th>PR / Ticket</th><th>Added by</th><th>Added</th>`;
      const headOut = `<th>Model</th><th>Department</th><th>Serial</th><th>PR / Ticket</th><th>Delivered by</th><th>Reason</th><th>Destination</th><th>Removed at</th>`;
      const showMoreHtml = total > visibleCount
        ? `<div class="show-more-row"><button type="button" class="btn btn-show-more js-show-more" data-is-out="${isOut}">Show More</button></div>`
        : '';
      container.innerHTML = `<table><thead><tr>${isOut ? headOut : headIn}</tr></thead><tbody>${rows}</tbody></table>${showMoreHtml}`;

      if (!isOut) {
        container.querySelectorAll('tr.js-in-row').forEach((row) => {
          row.addEventListener('click', () => {
            const id = row.dataset.deviceId;
            if (id) openRemoveSerialDialog(id);
          });
        });
      }
      container.querySelectorAll('.js-show-more').forEach((btn) => {
        btn.addEventListener('click', () => onShowMore());
      });

    } else {
      // Grouped by Kit
      const kitDevices = devices.filter(d => d.kit_id);
      if (!kitDevices.length) {
        container.innerHTML = `<div class="empty-state" style="padding:32px;"><p>No kits found in current filters.<br>Switch to <strong>Individual</strong> to see all devices.</p></div>`;
        return;
      }

      const groups = new Map();
      kitDevices.forEach(d => {
        if (!groups.has(d.kit_id)) groups.set(d.kit_id, []);
        groups.get(d.kit_id).push(d);
      });

      const groupArr = [...groups.entries()].sort((a, b) => {
        const ta = Math.max(...a[1].map(d => +new Date(d[dateField]) || 0));
        const tb = Math.max(...b[1].map(d => +new Date(d[dateField]) || 0));
        return sortDir === 'desc' ? tb - ta : ta - tb;
      });

      const total    = groupArr.length;
      const toShow   = groupArr.slice(0, visibleCount);
      const colCount = isOut ? 6 : 5;
      const headIn   = `<th>Model</th><th>Department</th><th>Serial</th><th>Added by</th><th>Added</th>`;
      const headOut  = `<th>Model</th><th>Department</th><th>Serial</th><th>Delivered by</th><th>Reason</th><th>Removed at</th>`;

      const bodyRows = toShow.map(([kitId, items], groupIdx) => {
        items.sort((a, b) => sortDir === 'desc'
          ? +new Date(b[dateField]) - +new Date(a[dateField])
          : +new Date(a[dateField]) - +new Date(b[dateField]));

        const prNums      = [...new Set(items.map(d => d.prNumber).filter(Boolean))].join(', ');
        const itemCount   = `${items.length} item${items.length !== 1 ? 's' : ''}`;
        const revealClass = groupIdx >= previousVisibleCount ? ' row-reveal' : '';
        const prLabel     = prNums ? ` &mdash; PR / Ticket: <span style="opacity:.7">${escHtml(prNums)}</span>` : '';
        const subHeader   = `<tr class="kit-sub-header${revealClass}">
          <td colspan="${colCount}" class="kit-ticket-cell">Kit: <strong>${escHtml(kitId)}</strong>${prLabel} <span class="kit-count">${itemCount}</span></td>
        </tr>`;

        const deviceRows = items.map(d => {
          const model = state.models.find(m => m.id === d.modelId);
          if (!isOut) {
            const { rowClass, badge } = getStockAgeInfo(d.createdAt);
            return `<tr class="${rowClass} kit-device-row js-in-row" data-device-id="${d.id}" style="cursor:pointer;" title="Click to remove from stock">
              <td>${model ? escHtml(model.name) + ' ' + getCategoryBadge(model.category) : 'Unknown'}</td>
              <td>${escHtml(d.department || '')}</td>
              <td><strong>${escHtml(d.serial)}</strong></td>
              <td>${escHtml(d.addedBy || '')}</td>
              <td>${formatDateTime(d.createdAt)}${badge}</td>
            </tr>`;
          } else {
            return `<tr class="kit-device-row">
              <td>${model ? escHtml(model.name) + ' ' + getCategoryBadge(model.category) : 'Unknown'}</td>
              <td>${escHtml(d.department || '')}</td>
              <td><strong>${escHtml(d.serial)}</strong></td>
              <td>${escHtml(d.deliveredBy || '')}</td>
              <td>${escHtml(d.reason || '')}</td>
              <td>${formatDateTime(d.removedAt)}</td>
            </tr>`;
          }
        }).join('');

        const spacer = groupIdx < toShow.length - 1
          ? `<tr class="kit-spacer"><td colspan="${colCount}"></td></tr>`
          : '';

        return `${subHeader}${deviceRows}${spacer}`;
      }).join('');

      const showMoreHtml = total > visibleCount
        ? `<div class="show-more-row"><button type="button" class="btn btn-show-more js-show-more" data-is-out="${isOut}">Show More</button></div>`
        : '';
      container.innerHTML = `<table><thead><tr>${isOut ? headOut : headIn}</tr></thead><tbody>${bodyRows}</tbody></table>${showMoreHtml}`;

      if (!isOut) {
        container.querySelectorAll('tr.js-in-row').forEach((row) => {
          row.addEventListener('click', () => {
            const id = row.dataset.deviceId;
            if (id) openRemoveSerialDialog(id);
          });
        });
      }
      container.querySelectorAll('.js-show-more').forEach((btn) => {
        btn.addEventListener('click', () => onShowMore());
      });
    }
  };

  renderList(inDevices, inContainer, false, viewModeIn, devicesSort, visibleIn, previousVisibleIn, () => {
    previousVisibleIn = visibleIn;
    visibleIn += increment(viewModeIn);
    renderDevicesView();
  });
  renderList(outDevices, outContainer, true, viewModeOut, removedSort, visibleOut, previousVisibleOut, () => {
    previousVisibleOut = visibleOut;
    visibleOut += increment(viewModeOut);
    renderDevicesView();
  });

  previousVisibleIn  = visibleIn;
  previousVisibleOut = visibleOut;
}

// ── Remove from stock dialog ──────────────────────────────────

/** Open the Remove Serial dialog, pre-loading the person select. */
function openRemoveSerialDialog(deviceId) {
  pendingRemoveDeviceId = deviceId;
  document.getElementById('remove-serial-dialog').classList.remove('hidden');
  populateDeliveredBySelect();
  document.getElementById('remove-reason-input').focus();
}

/** Close and reset the Remove Serial dialog. */
function closeRemoveSerialDialog() {
  pendingRemoveDeviceId = null;
  document.getElementById('remove-serial-dialog').classList.add('hidden');
  document.getElementById('remove-serial-form').reset();
}

// ── Add device serial ─────────────────────────────────────────

/**
 * Add a new serial to stock for the given model.
 * Validates all required fields and deduplicates against in-stock serials.
 */
async function addDeviceSerial(modelId, serial, department, prNumber, addedBy) {
  const model = state.models.find((m) => m.id === modelId);
  if (!model) return;
  // Categories that don't require a serial number get 'N/A' automatically
  const isCable   = (model.category || '') === 'Cable';
  const isNaOther = (model.category || '') === 'Other' && (serial || '').trim().toUpperCase() === 'N/A';
  const noSerial  = isCable || isNaOther;
  const cleanSerial = noSerial ? 'N/A' : serial.trim();
  if (!noSerial && !cleanSerial) return;
  const cleanDepartment = (department || '').trim();
  if (!cleanDepartment) { showToast('Please select a department.'); return; }
  const cleanPr = (prNumber || '').trim();
  if (!cleanPr) { showToast('Please enter a PR number or ticket.'); return; }
  const cleanAddedBy = (addedBy || '').trim();
  if (!cleanAddedBy) { showToast('Please select who is adding this device.'); return; }

  const existing = state.devices.find(
    (d) => d.modelId === modelId && d.serial.toLowerCase() === cleanSerial.toLowerCase() && d.status === 'in'
  );
  if (existing && !noSerial) { showToast('This serial is already in stock for this model.'); return; }

  // Generate ID and timestamp once so the API call and local state stay in sync.
  const newDeviceId        = uid();
  const newDeviceCreatedAt = new Date().toISOString();

  try {
    await apiCall('POST', '/devices', {
      id:         newDeviceId,
      modelId,
      serial:     cleanSerial,
      prNumber:   cleanPr,
      status:     'in',
      department: cleanDepartment,
      addedBy:    cleanAddedBy,
      createdAt:  newDeviceCreatedAt,
    });

    state.devices.push({
      id:          newDeviceId,
      modelId,
      serial:      cleanSerial,
      prNumber:    cleanPr,
      status:      'in',
      department:  cleanDepartment,
      addedBy:     cleanAddedBy,
      createdAt:   newDeviceCreatedAt,
      removedAt:   null,
      reason:      '',
      destination: '',
    });
    renderAll();
    showToast(`Serial added to ${model.name}.`);
  } catch (e) {
    showToast(`Error adding serial: ${e.message}`);
  }
}

// ── Remove device from stock ──────────────────────────────────

/**
 * Mark an in-stock device as removed.
 * Updates backend then local state.
 */
async function removeDeviceFromStock(deviceId, reason, deliveredBy, destination) {
  const device = state.devices.find((d) => d.id === deviceId);
  if (!device || device.status !== 'in') return;
  const model = state.models.find((m) => m.id === device.modelId);

  try {
    await apiCall('PUT', `/devices/${deviceId}`, {
      status:      'out',
      reason:      (reason      || '').trim(),
      deliveredBy: (deliveredBy || '').trim(),
      destination: (destination || '').trim(),
    });

    device.status      = 'out';
    device.removedAt   = new Date().toISOString();
    device.reason      = (reason      || '').trim();
    device.deliveredBy = (deliveredBy || '').trim();
    device.destination = (destination || '').trim();

    renderAll();
    showToast(`Serial removed from stock${model ? ' for ' + model.name : ''}.`);
  } catch (e) {
    showToast(`Error removing device: ${e.message}`);
  }
}
