// ============================================================
// pages/history.js — Init for history.html (Activity Log view)
// Depends on: config.js, api.js, state.js, utils.js, ui/pills.js,
//             features/history.js, features/export.js, ui/auth.js
// ============================================================

/** Page-scoped renderAll: rebuild history, then re-render the log. */
function renderAll() {
  rebuildHistory();
  renderHistoryView();
}

document.addEventListener('DOMContentLoaded', async () => {
  // Mark active nav tab
  const activeTab = document.querySelector('.nav-tab[href="history.html"]');
  if (activeTab) activeTab.classList.add('active');

  await loadFromBackend();

  // ── History filters ───────────────────────────────────────
  const historyTypeFilterEl = document.getElementById('filter-history-type');
  const historyYearSelect   = document.getElementById('filter-history-year');
  const historyMonthSelect  = document.getElementById('filter-history-month');
  const historyDeviceFilter = document.getElementById('filter-history-device');
  const btnClearHistory     = document.getElementById('btn-clear-history-filters');

  const resetHistory = () => {
    visibleHistory         = DEFAULT_LIMIT_HISTORY;
    previousVisibleHistory = 0;
    renderHistoryView();
  };
  if (historyTypeFilterEl) historyTypeFilterEl.addEventListener('change', resetHistory);
  if (historyYearSelect)   historyYearSelect.addEventListener('change', resetHistory);
  if (historyMonthSelect)  historyMonthSelect.addEventListener('change', resetHistory);
  if (historyDeviceFilter) historyDeviceFilter.addEventListener('input', resetHistory);
  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', () => {
      if (historyTypeFilterEl) historyTypeFilterEl.value = '';
      if (historyYearSelect)   historyYearSelect.value   = '';
      if (historyMonthSelect)  historyMonthSelect.value  = '';
      if (historyDeviceFilter) historyDeviceFilter.value = '';
      historyCategoryFilter = '';
      resetHistory();
    });
  }

  // ── History sort ──────────────────────────────────────────
  const sortBtn = document.getElementById('btn-history-sort');
  if (sortBtn) {
    sortBtn.addEventListener('click', () => {
      historySort = historySort === 'desc' ? 'asc' : 'desc';
      sortBtn.dataset.order = historySort;
      sortBtn.textContent   = historySort === 'desc' ? 'Newest First' : 'Oldest First';
      visibleHistory         = DEFAULT_LIMIT_HISTORY;
      previousVisibleHistory = 0;
      renderHistoryView();
    });
  }

  // ── Export / Import / Clear-all ───────────────────────────
  document.getElementById('btn-export-data').addEventListener('click', exportData);
  document.getElementById('file-import-data').addEventListener('change', (e) => {
    const file = e.target.files[0];
    importDataFromFile(file);
    e.target.value = '';
  });
  document.getElementById('btn-clear-all-data').addEventListener('click', clearAllData);

  // ── Initial render ────────────────────────────────────────
  renderAll();
  startAutoRefresh();
});
