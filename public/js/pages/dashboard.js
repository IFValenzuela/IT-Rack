// ============================================================
// pages/dashboard.js — Init for dashboard.html (All Devices view)
// Depends on: config.js, api.js, state.js, utils.js, ui/pills.js,
//             features/models.js, features/devices.js, ui/auth.js
// ============================================================

/** Page-scoped renderAll: rebuild history, then refresh both device panels. */
function renderAll() {
  rebuildHistory();
  renderDashboard();
  renderDevicesView();
}

document.addEventListener('DOMContentLoaded', async () => {
  // Mark active nav tab
  const activeTab = document.querySelector('.nav-tab[href="dashboard.html"]');
  if (activeTab) activeTab.classList.add('active');

  await loadFromBackend();

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

  // ── Device filters ────────────────────────────────────────
  const deptFilterEl    = document.getElementById('filter-department');
  const textFilterEl    = document.getElementById('filter-location-owner');
  const clearFiltersBtn = document.getElementById('btn-clear-filters');

  if (deptFilterEl) {
    deptFilterEl.addEventListener('change', () => { resetDevicesPagination(); renderDevicesView(); });
  }
  if (textFilterEl) {
    textFilterEl.addEventListener('input', () => { resetDevicesPagination(); renderDevicesView(); });
  }
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      if (deptFilterEl) deptFilterEl.value = '';
      if (textFilterEl) textFilterEl.value = '';
      devicesCategoryFilter = '';
      resetDevicesPagination();
      renderDevicesView();
    });
  }

  // ── View Removed toggle ───────────────────────────────────
  const btnToggleRemoved = document.getElementById('btn-toggle-removed');
  const btnCloseRemoved  = document.getElementById('btn-close-removed');
  const removedPanel     = document.getElementById('removed-devices-panel');
  if (btnToggleRemoved && removedPanel) {
    btnToggleRemoved.addEventListener('click', () => removedPanel.classList.remove('hidden'));
  }
  if (btnCloseRemoved && removedPanel) {
    btnCloseRemoved.addEventListener('click', () => removedPanel.classList.add('hidden'));
  }

  // ── Removed filters ───────────────────────────────────────
  const removedSearchInput = document.getElementById('filter-removed-search');
  const removedDeptSelect  = document.getElementById('filter-removed-dept');
  const btnClearRemoved    = document.getElementById('btn-clear-removed-filters');
  if (removedSearchInput) {
    removedSearchInput.addEventListener('input', () => {
      removedTextFilter = removedSearchInput.value.trim().toLowerCase();
      resetDevicesPagination();
      renderDevicesView();
    });
  }
  if (removedDeptSelect) {
    removedDeptSelect.addEventListener('change', () => {
      removedDeptFilter = removedDeptSelect.value;
      resetDevicesPagination();
      renderDevicesView();
    });
  }
  if (btnClearRemoved) {
    btnClearRemoved.addEventListener('click', () => {
      removedTextFilter        = '';
      removedDeptFilter        = '';
      devicesRemovedDestFilter = '';
      removedCategoryFilter    = '';
      viewModeOut              = 'all';
      if (removedSearchInput) removedSearchInput.value = '';
      if (removedDeptSelect)  removedDeptSelect.value  = '';
      const segOut = document.getElementById('seg-view-out');
      if (segOut) {
        segOut.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        const first = segOut.querySelector(".seg-btn[data-view='all']");
        if (first) first.classList.add('active');
      }
      resetDevicesPagination();
      renderDevicesView();
    });
  }

  // ── Sort buttons ──────────────────────────────────────────
  const devicesSortBtn = document.getElementById('btn-devices-sort');
  if (devicesSortBtn) {
    devicesSortBtn.addEventListener('click', () => {
      devicesSort = devicesSort === 'desc' ? 'asc' : 'desc';
      devicesSortBtn.dataset.order = devicesSort;
      devicesSortBtn.textContent   = devicesSort === 'desc' ? 'Newest First' : 'Oldest First';
      renderDevicesView();
    });
  }

  const btnRemovedSort = document.getElementById('btn-removed-sort');
  if (btnRemovedSort) {
    btnRemovedSort.addEventListener('click', () => {
      removedSort = removedSort === 'desc' ? 'asc' : 'desc';
      btnRemovedSort.textContent = removedSort === 'desc' ? 'Newest First' : 'Oldest First';
      renderDevicesView();
    });
  }

  // ── Segmented view controls ───────────────────────────────
  const setupSeg = (containerId, onSelect) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onSelect(btn.dataset.view);
      });
    });
  };
  setupSeg('seg-view-in',  (v) => { viewModeIn  = v; resetDevicesPagination(); renderDevicesView(); });
  setupSeg('seg-view-out', (v) => { viewModeOut = v; resetDevicesPagination(); renderDevicesView(); });

  // ── Initial render ────────────────────────────────────────
  renderAll();
  startAutoRefresh();
});
