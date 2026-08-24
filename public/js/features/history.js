// ============================================================
// features/history.js — Global history view
// Depends on: config.js, state.js, utils.js, ui/pills.js
// ============================================================

/** Render the full History view with filtering, sorting, and pagination. */
function renderHistoryView() {
  const container = document.getElementById('history-table-container');
  if (!container) return;
  if (!state.history.length) {
    container.classList.add('empty-state');
    container.innerHTML = '<p>No activity yet. Add or remove devices to see history.</p>';
    return;
  }
  container.classList.remove('empty-state');

  // Populate year filter dynamically from history + model creation dates.
  const yearSelectEl = document.getElementById('filter-history-year');
  if (yearSelectEl) {
    const previousYear = yearSelectEl.value;
    const yearsSet     = new Set();
    state.history.forEach((h) => {
      const d = new Date(h.at);
      if (!Number.isNaN(d.getTime())) yearsSet.add(d.getFullYear());
    });
    state.models.forEach((m) => {
      const d = new Date(m.createdAt);
      if (!Number.isNaN(d.getTime())) yearsSet.add(d.getFullYear());
    });
    const years = Array.from(yearsSet).filter((y) => y >= 2020).sort((a, b) => b - a);
    let optionsHtml = '<option value="">All years</option>';
    years.forEach((y) => { optionsHtml += `<option value="${y}">${y}</option>`; });
    yearSelectEl.innerHTML = optionsHtml;
    if (previousYear && years.includes(Number(previousYear))) yearSelectEl.value = previousYear;
  }

  const typeFilterEl   = document.getElementById('filter-history-type');
  const yearFilterEl   = document.getElementById('filter-history-year');
  const monthFilterEl  = document.getElementById('filter-history-month');
  const deviceFilterEl = document.getElementById('filter-history-device');

  const typeFilter   = typeFilterEl   ? typeFilterEl.value               : '';
  const yearFilter   = yearFilterEl   ? yearFilterEl.value               : '';
  const monthFilter  = monthFilterEl  ? monthFilterEl.value              : '';
  const deviceFilter = deviceFilterEl ? deviceFilterEl.value.trim().toLowerCase() : '';

  let entries = state.history.slice();
  if (typeFilter === 'in' || typeFilter === 'out') {
    entries = entries.filter((h) => h.type === typeFilter);
  }
  if (yearFilter) {
    const yNum = Number(yearFilter);
    entries = entries.filter((h) => {
      const d = new Date(h.at);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === yNum;
    });
  }
  if (monthFilter) {
    const mNum = Number(monthFilter);
    entries = entries.filter((h) => {
      const d = new Date(h.at);
      return !Number.isNaN(d.getTime()) && d.getMonth() + 1 === mNum;
    });
  }
  if (deviceFilter) {
    entries = entries.filter((h) => {
      const model = state.models.find((m) => m.id === h.modelId);
      return (
        (model ? model.name.toLowerCase() : '').includes(deviceFilter) ||
        (h.serial || '').toLowerCase().includes(deviceFilter)
      );
    });
  }

  renderFilterPills('history-cat-pills', entries, (h) => h.modelId, historyCategoryFilter, (cat) => {
    historyCategoryFilter     = cat;
    visibleHistory            = DEFAULT_LIMIT_HISTORY;
    previousVisibleHistory    = 0;
    renderHistoryView();
  });

  if (historyCategoryFilter) {
    entries = entries.filter((h) => {
      const model = state.models.find((m) => m.id === h.modelId);
      return model && (model.category || '') === historyCategoryFilter;
    });
  }

  const sorted = entries.sort((a, b) =>
    historySort === 'asc'
      ? new Date(a.at) - new Date(b.at)
      : new Date(b.at) - new Date(a.at)
  );

  const total  = sorted.length;
  const toShow = sorted.slice(0, visibleHistory);

  const rows = toShow.map((h, idx) => {
    const model       = state.models.find((m) => m.id === h.modelId);
    const statusClass = h.type === 'in' ? 'status-in' : 'status-out';
    const label       = h.type === 'in' ? 'Added to stock' : 'Removed from stock';
    const technician  = h.addedBy || h.deliveredBy || '';
    const dash        = '<span style="color:var(--text-muted)">-</span>';
    const reason      = h.reason      || (h.type === 'in' ? dash : '');
    const destination = h.destination || (h.type === 'in' ? dash : '');
    let rowClass = '';
    if (h.type === 'in') {
      const device = state.devices.find((d) => d.serial === h.serial && d.modelId === h.modelId && d.status === 'in');
      if (device) rowClass = getStockAgeInfo(device.createdAt).rowClass;
    }
    const revealClass = idx >= previousVisibleHistory ? ' row-reveal' : '';
    return `
      <tr class="${rowClass}${revealClass}">
        <td><span class="status-chip ${statusClass}">${label}</span></td>
        <td>${model ? escHtml(model.name) + ' ' + getCategoryBadge(model.category) : 'Unknown model'}</td>
        <td>${escHtml(h.serial)}</td>
        <td>${escHtml(technician)}</td>
        <td>${reason}</td>
        <td>${destination}</td>
        <td>${formatDateTime(h.at)}</td>
      </tr>
    `;
  }).join('');

  const showMoreHtml = total > visibleHistory
    ? `<div class="show-more-row"><button type="button" class="btn btn-show-more js-history-show-more">Show More</button></div>`
    : '';

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Model</th>
          <th>Serial</th>
          <th>Handled by</th>
          <th>Reason</th>
          <th>Destination</th>
          <th>At</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${showMoreHtml}
  `;

  previousVisibleHistory = visibleHistory;

  container.querySelectorAll('.js-history-show-more').forEach((btn) => {
    btn.addEventListener('click', () => {
      previousVisibleHistory = visibleHistory;
      visibleHistory        += INCREMENT_HISTORY;
      renderHistoryView();
    });
  });
}
