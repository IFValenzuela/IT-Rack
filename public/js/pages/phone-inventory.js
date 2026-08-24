// ============================================================
// pages/phone-inventory.js — Phone Inventory Status page
// Derives current status (deployed vs in-stock) from history.
// Depends on: config.js, api.js, state.js, utils.js, ui/auth.js
// ============================================================

let currentTab = 'deployed'; // 'deployed', 'in-stock', 'all'
let piFilterSearch = '';
let piFilterModel = '';

// Data structures
let phoneStatusMap = new Map(); // IMEI -> Latest Record
let deployedPhones = [];
let inStockPhones = [];

function derivePhoneStatus() {
  phoneStatusMap.clear();

  // Sort by date ascending to process oldest to newest
  const sortedHistory = [...state.phones].sort((a, b) => {
    const da = new Date(a.assignedAt || a.createdAt);
    const db = new Date(b.assignedAt || b.createdAt);
    return da - db;
  });

  // The latest record per IMEI will overwrite older ones
  sortedHistory.forEach(record => {
    if (record.imei) {
      phoneStatusMap.set(record.imei, record);
    }
  });

  deployedPhones = [];
  inStockPhones = [];

  phoneStatusMap.forEach(record => {
    const type = record.transactionType || 'delivery';
    if (type === 'delivery') {
      deployedPhones.push(record);
    } else if (type === 'return' || type === 'return_admin') {
      inStockPhones.push(record);
    }
  });

  // Sort final arrays newest first
  const sortDesc = (a, b) => new Date(b.assignedAt) - new Date(a.assignedAt);
  deployedPhones.sort(sortDesc);
  inStockPhones.sort(sortDesc);
}

function getFilteredPhones(list) {
  let filtered = list.slice();

  if (piFilterSearch) {
    const q = piFilterSearch.toLowerCase();
    filtered = filtered.filter(p =>
      (p.receivedBy || '').toLowerCase().includes(q) ||
      (p.assignedBy || '').toLowerCase().includes(q) ||
      (p.phoneModel || '').toLowerCase().includes(q) ||
      (p.imei || '').toLowerCase().includes(q) ||
      (p.phoneNumber || '').toLowerCase().includes(q) ||
      (p.employeeNumber || '').toLowerCase().includes(q)
    );
  }

  if (piFilterModel) {
    filtered = filtered.filter(p => p.phoneModel === piFilterModel);
  }

  return filtered;
}

function renderAll() {
  derivePhoneStatus();
  updateSummaryCards();
  populateModelFilter();
  renderTable();
}

function updateSummaryCards() {
  const total = phoneStatusMap.size;
  const dep = deployedPhones.length;
  const stock = inStockPhones.length;

  const el = (id, txt) => { const e = document.getElementById(id); if(e) e.textContent = txt; };
  
  el('pi-total', total);
  el('pi-deployed', dep);
  el('pi-in-stock', stock);

  el('pi-tab-deployed-count', dep);
  el('pi-tab-stock-count', stock);
  el('pi-tab-all-count', total);
}

function populateModelFilter() {
  const sel = document.getElementById('pi-filter-model');
  if (!sel || sel.options.length > 1) return;

  const models = new Set();
  phoneStatusMap.forEach(p => {
    if (p.phoneModel) models.add(p.phoneModel);
  });

  [...models].sort().forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  });
}

function renderTable() {
  const tbody = document.getElementById('pi-tbody');
  const thead = document.getElementById('pi-thead');
  const showLabel = document.getElementById('pi-showing-label');

  if (!tbody || !thead) return;

  let baseList = [];
  if (currentTab === 'deployed') baseList = deployedPhones;
  else if (currentTab === 'in-stock') baseList = inStockPhones;
  else baseList = [...deployedPhones, ...inStockPhones].sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));

  const filteredList = getFilteredPhones(baseList);

  if (showLabel) {
    if (filteredList.length === baseList.length) {
      showLabel.textContent = `Showing all ${baseList.length} phones`;
    } else {
      showLabel.textContent = `Showing ${filteredList.length} of ${baseList.length} filtered phones`;
    }
  }

  if (filteredList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="pi-empty">No phones match the current filters.</td></tr>';
    thead.innerHTML = '';
    return;
  }

  if (currentTab === 'deployed') {
    thead.innerHTML = `
      <tr>
        <th>Phone Model</th>
        <th>Currently With</th>
        <th>Emp #</th>
        <th>IMEI</th>
        <th>Phone #</th>
        <th>Deployed Date</th>
        <th></th>
      </tr>
    `;
    tbody.innerHTML = filteredList.map(p => `
      <tr>
        <td><strong>${escHtml(p.phoneModel)}</strong></td>
        <td>${escHtml(p.receivedBy)}</td>
        <td>${escHtml(p.employeeNumber || '-')}</td>
        <td class="mono">${escHtml(p.imei)}</td>
        <td>${escHtml(p.phoneNumber)}</td>
        <td>${formatDate(p.assignedAt)}</td>
        <td><button class="pi-view-btn btn-view" data-id="${escHtml(p.id)}">Details</button></td>
      </tr>
    `).join('');
  } else if (currentTab === 'in-stock') {
    thead.innerHTML = `
      <tr>
        <th>Phone Model</th>
        <th>Last Held By</th>
        <th>Emp #</th>
        <th>IMEI</th>
        <th>Phone #</th>
        <th>Return Date</th>
        <th></th>
      </tr>
    `;
    tbody.innerHTML = filteredList.map(p => `
      <tr>
        <td><strong>${escHtml(p.phoneModel)}</strong></td>
        <td><span style="color:var(--text-muted)">${escHtml(p.receivedBy)}</span></td>
        <td><span style="color:var(--text-muted)">${escHtml(p.employeeNumber || '-')}</span></td>
        <td class="mono">${escHtml(p.imei)}</td>
        <td>${escHtml(p.phoneNumber)}</td>
        <td>${formatDate(p.assignedAt)}</td>
        <td><button class="pi-view-btn btn-view" data-id="${escHtml(p.id)}">Details</button></td>
      </tr>
    `).join('');
  } else {
    thead.innerHTML = `
      <tr>
        <th>Status</th>
        <th>Phone Model</th>
        <th>Person</th>
        <th>IMEI</th>
        <th>Phone #</th>
        <th>Date</th>
        <th></th>
      </tr>
    `;
    tbody.innerHTML = filteredList.map(p => {
      const type = p.transactionType || 'delivery';
      const isDep = type === 'delivery';
      const statHtml = isDep 
        ? '<span class="pi-status deployed"><span class="pi-status-dot"></span>Deployed</span>'
        : '<span class="pi-status in-stock"><span class="pi-status-dot"></span>In Stock</span>';
      return `
        <tr>
          <td>${statHtml}</td>
          <td><strong>${escHtml(p.phoneModel)}</strong></td>
          <td>${escHtml(p.receivedBy)}</td>
          <td class="mono">${escHtml(p.imei)}</td>
          <td>${escHtml(p.phoneNumber)}</td>
          <td>${formatDate(p.assignedAt)}</td>
          <td><button class="pi-view-btn btn-view" data-id="${escHtml(p.id)}">Details</button></td>
        </tr>
      `;
    }).join('');
  }

  // Bind view buttons
  tbody.querySelectorAll('.btn-view').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof openPhoneDetail === 'function') {
        openPhoneDetail(btn.dataset.id);
      }
    });
  });
}

function openPhoneDetail(id) {
  const record = state.phones.find(p => p.id === id);
  if (!record) return;

  const modal   = document.getElementById('ph-detail-modal');
  const title   = document.getElementById('ph-detail-title');
  const body    = document.getElementById('ph-detail-body');

  const typeLabel = record.transactionType === 'return_admin' ? 'Admin Return' : (record.transactionType === 'return' ? 'Return' : 'Delivery');
  if (title) title.textContent = record.phoneModel + ' - ' + typeLabel;

  body.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 20px;margin-bottom:18px;">' +
      '<div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Assigned By</span><div style="font-weight:600;">' + escHtml(record.assignedBy) + '</div></div>' +
      '<div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Received By</span><div style="font-weight:600;">' + escHtml(record.receivedBy) + '</div></div>' +
      '<div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Employee #</span><div style="font-weight:600;">' + escHtml(record.employeeNumber || '-') + '</div></div>' +
      '<div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Phone Model</span><div style="font-weight:600;">' + escHtml(record.phoneModel) + '</div></div>' +
      '<div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">IMEI</span><div style="font-weight:600;font-family:monospace;">' + escHtml(record.imei) + '</div></div>' +
      '<div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Phone #</span><div style="font-weight:600;">' + escHtml(record.phoneNumber) + '</div></div>' +
      '<div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Date</span><div style="font-weight:600;">' + formatDateTime(record.assignedAt) + '</div></div>' +
      '<div><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Type</span><div style="font-weight:600;">' + typeLabel + '</div></div>' +
    '</div>' +
    (record.notes ? '<div style="margin-bottom:14px;"><span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Notes</span><div style="background:#f8f9fc;border-left:3px solid var(--border-subtle);border-radius:0 6px 6px 0;padding:8px 12px;margin-top:4px;font-size:0.88rem;">' + escHtml(record.notes) + '</div></div>' : '') +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
      '<div>' +
        '<span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Signature</span>' +
        (record.signatureImage
          ? '<div style="margin-top:6px;border:1px solid var(--border-subtle);border-radius:10px;overflow:hidden;background:#fff;"><img src="' + record.signatureImage + '" style="width:100%;height:auto;display:block;" alt="Signature" /></div><div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">' + escHtml(record.signatureName) + '</div>'
          : '<div style="margin-top:6px;color:var(--text-muted);font-size:0.85rem;">No signature</div>') +
      '</div>' +
      '<div>' +
        '<span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Photo</span>' +
        (record.photoImage
          ? '<div style="margin-top:6px;border:1px solid var(--border-subtle);border-radius:10px;overflow:hidden;background:#fff;"><img src="' + record.photoImage + '" style="width:100%;height:auto;display:block;" alt="Photo" /></div>'
          : '<div style="margin-top:6px;color:var(--text-muted);font-size:0.85rem;">No photo</div>') +
      '</div>' +
    '</div>' +
    '<div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end;">' +
      '<a class="btn ghost btn-sm" href="phone-history.html" target="_blank">View History</a>' +
      '<a class="btn ghost btn-sm" href="phone-receipt.html?phone=' + encodeURIComponent(record.id) + '" target="_blank">Print Receipt</a>' +
    '</div>';

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closePhoneDetailModal() {
  const modal = document.getElementById('ph-detail-modal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function exportCSV() {
  let baseList = [];
  if (currentTab === 'deployed') baseList = deployedPhones;
  else if (currentTab === 'in-stock') baseList = inStockPhones;
  else baseList = [...deployedPhones, ...inStockPhones].sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));

  const filtered = getFilteredPhones(baseList);

  if (filtered.length === 0) {
    showToast('No data to export.');
    return;
  }

  const rows = [['Status', 'Phone Model', 'Person', 'Employee #', 'IMEI', 'Phone #', 'Date', 'Type']];
  
  filtered.forEach(p => {
    const type = p.transactionType || 'delivery';
    const isDep = type === 'delivery';
    const status = isDep ? 'Deployed' : 'In Stock';
    rows.push([
      status,
      p.phoneModel || '',
      p.receivedBy || '',
      p.employeeNumber || '',
      p.imei || '',
      p.phoneNumber || '',
      p.assignedAt || '',
      type
    ]);
  });

  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `phone-inventory-${currentTab}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported successfully');
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (window.authPromise) await window.authPromise;
  await loadFromBackend();
  // `loadPhones` is technically in features/phones.js which is loaded before this script in HTML,
  // but just in case it isn't defined or we already loaded phones in loadFromBackend (which we do)
  // state.phones should be populated by loadFromBackend().

  document.getElementById('pi-loading').classList.add('hidden');
  document.getElementById('pi-content').classList.remove('hidden');

  // Tabs
  document.querySelectorAll('.pi-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.pi-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      renderTable();
    });
  });

  // Filters
  const searchEl = document.getElementById('pi-search');
  const modelEl = document.getElementById('pi-filter-model');

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      piFilterSearch = searchEl.value.trim();
      renderTable();
    });
  }

  if (modelEl) {
    modelEl.addEventListener('change', () => {
      piFilterModel = modelEl.value;
      renderTable();
    });
  }

  // Export
  const exportBtn = document.getElementById('btn-pi-export');
  if (exportBtn) exportBtn.addEventListener('click', exportCSV);

  // Detail Modal Close
  const closeDetailBtn = document.getElementById('btn-ph-detail-close');
  if (closeDetailBtn) closeDetailBtn.addEventListener('click', closePhoneDetailModal);
  
  const detailModal = document.getElementById('ph-detail-modal');
  if (detailModal) {
    detailModal.addEventListener('click', e => {
      if (e.target === detailModal) closePhoneDetailModal();
    });
  }

  renderAll(); // Initial render
  startAutoRefresh();
});
