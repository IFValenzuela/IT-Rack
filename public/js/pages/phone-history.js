// ============================================================
// pages/phone-history.js — Dedicated phone history page
// Depends on: config.js, api.js, state.js, utils.js,
//             features/phones.js, ui/auth.js
// ============================================================

// ── Filter / sort / pagination state ─────────────────────────
let phSortOrder   = 'desc';
let phVisible     = 25;
const PH_INCREMENT = 25;
let phFilterSearch = '';
let phFilterType   = '';
let phFilterYear   = '';
let phFilterMonth  = '';

function renderAll() {
  renderPhoneHistory();
}

function getFilteredPhones() {
  let list = state.phones.slice();

  // Text search across multiple fields
  if (phFilterSearch) {
    const q = phFilterSearch.toLowerCase();
    list = list.filter(p =>
      (p.receivedBy   || '').toLowerCase().includes(q) ||
      (p.assignedBy   || '').toLowerCase().includes(q) ||
      (p.phoneModel   || '').toLowerCase().includes(q) ||
      (p.imei         || '').toLowerCase().includes(q) ||
      (p.phoneNumber  || '').toLowerCase().includes(q) ||
      (p.employeeNumber || '').toLowerCase().includes(q) ||
      (p.notes        || '').toLowerCase().includes(q)
    );
  }

  // Type filter
  if (phFilterType) {
    list = list.filter(p => (p.transactionType || 'delivery') === phFilterType);
  }

  // Year filter
  if (phFilterYear) {
    const yr = Number(phFilterYear);
    list = list.filter(p => new Date(p.assignedAt).getFullYear() === yr);
  }

  // Month filter
  if (phFilterMonth) {
    const mo = Number(phFilterMonth);
    list = list.filter(p => new Date(p.assignedAt).getMonth() + 1 === mo);
  }

  // Sort
  list.sort((a, b) => {
    const da = new Date(a.assignedAt || a.createdAt);
    const db = new Date(b.assignedAt || b.createdAt);
    return phSortOrder === 'desc' ? db - da : da - db;
  });

  return list;
}

function renderPhoneHistory() {
  const container  = document.getElementById('ph-table-container');
  const pagination = document.getElementById('ph-pagination');
  const showLabel  = document.getElementById('ph-showing-label');
  const loadMore   = document.getElementById('btn-ph-load-more');
  const pageInfo   = document.getElementById('ph-page-info');

  // Stats
  const all = state.phones;
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('ph-stat-total',      all.length);
  el('ph-stat-deliveries', all.filter(p => (p.transactionType || 'delivery') === 'delivery').length);
  el('ph-stat-returns',    all.filter(p => p.transactionType === 'return').length);

  // Populate year filter
  populateYearFilter();

  const filtered = getFilteredPhones();
  const showing  = filtered.slice(0, phVisible);
  const hasMore  = filtered.length > phVisible;

  if (showLabel) {
    if (filtered.length === all.length) {
      showLabel.textContent = 'Showing ' + showing.length + ' of ' + all.length + ' total records';
    } else {
      showLabel.textContent = 'Showing ' + showing.length + ' of ' + filtered.length + ' filtered (' + all.length + ' total)';
    }
  }

  if (!showing.length) {
    container.classList.add('empty-state');
    container.innerHTML = '<p>No phone records match your filters.</p>';
    if (pagination) pagination.style.display = 'none';
    return;
  }

  container.classList.remove('empty-state');
  container.innerHTML = '<table class="inv-table"><thead><tr>' +
    '<th>Date</th>' +
    '<th>Type</th>' +
    '<th>Phone</th>' +
    '<th>Receiver</th>' +
    '<th>Emp #</th>' +
    '<th>IMEI</th>' +
    '<th>Phone #</th>' +
    '<th>Assigned By</th>' +
    '<th></th>' +
    '</tr></thead><tbody>' +
    showing.map(p => {
      const type    = p.transactionType || 'delivery';
      const typeCls = (type === 'return' || type === 'return_admin') ? 'badge-return' : 'badge-delivery';
      const typeLabel = type === 'return_admin' ? 'Admin Return' : (type === 'return' ? 'Return' : 'Delivery');
      return '<tr>' +
        '<td>' + formatDateTime(p.assignedAt) + '</td>' +
        '<td><span class="ph-type-badge ' + typeCls + '">' + typeLabel + '</span></td>' +
        '<td><strong>' + escHtml(p.phoneModel) + '</strong></td>' +
        '<td>' + escHtml(p.receivedBy) + '</td>' +
        '<td>' + escHtml(p.employeeNumber || '-') + '</td>' +
        '<td style="font-size:0.76rem;font-family:monospace;">' + escHtml(p.imei) + '</td>' +
        '<td>' + escHtml(p.phoneNumber) + '</td>' +
        '<td>' + escHtml(p.assignedBy) + '</td>' +
        '<td><button class="btn ghost btn-sm btn-ph-view" data-id="' + escHtml(p.id) + '">View</button></td>' +
        '</tr>';
    }).join('') +
    '</tbody></table>';

  // Pagination
  if (pagination) {
    pagination.style.display = hasMore ? 'flex' : 'none';
    if (pageInfo) pageInfo.textContent = showing.length + ' / ' + filtered.length;
  }

  // Wire up view buttons
  container.querySelectorAll('.btn-ph-view').forEach(btn => {
    btn.addEventListener('click', () => openPhoneDetail(btn.dataset.id));
  });
}

function populateYearFilter() {
  const sel = document.getElementById('ph-filter-year');
  if (!sel || sel.options.length > 1) return; // already populated
  const years = new Set();
  state.phones.forEach(p => {
    const y = new Date(p.assignedAt).getFullYear();
    if (!isNaN(y)) years.add(y);
  });
  [...years].sort((a, b) => b - a).forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
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

  const type = record.transactionType || 'delivery';

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
      '<button class="btn ghost btn-sm" id="btn-ph-detail-delete" data-id="' + escHtml(record.id) + '" style="color:var(--danger);">Delete Record</button>' +
      '<a class="btn ghost btn-sm" href="phone-receipt.html?phone=' + encodeURIComponent(record.id) + '" target="_blank">Print Receipt</a>' +
    '</div>';

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Delete handler
  const delBtn = document.getElementById('btn-ph-detail-delete');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this phone record? This cannot be undone.')) return;
      try {
        await apiCall('DELETE', '/phones/' + encodeURIComponent(delBtn.dataset.id));
        showToast('Record deleted.');
        closePhoneDetailModal();
        await loadPhones();
        renderPhoneHistory();
      } catch (e) {
        showToast('Error: ' + e.message);
      }
    });
  }
}

function closePhoneDetailModal() {
  const modal = document.getElementById('ph-detail-modal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const activeTab = document.querySelector('.nav-tab[href="phone-history.html"]');
  if (activeTab) activeTab.classList.add('active');

  if (window.authPromise) await window.authPromise;
  await loadFromBackend();
  await loadPhones();

  // Sort button
  const sortBtn = document.getElementById('btn-ph-sort');
  if (sortBtn) {
    sortBtn.addEventListener('click', () => {
      phSortOrder = phSortOrder === 'desc' ? 'asc' : 'desc';
      sortBtn.textContent = phSortOrder === 'desc' ? 'Newest First' : 'Oldest First';
      renderPhoneHistory();
    });
  }

  // Filter inputs
  const searchEl = document.getElementById('ph-filter-search');
  const typeEl   = document.getElementById('ph-filter-type');
  const yearEl   = document.getElementById('ph-filter-year');
  const monthEl  = document.getElementById('ph-filter-month');
  const clearBtn = document.getElementById('btn-ph-clear-filters');

  function applyFilters() {
    phFilterSearch = (searchEl ? searchEl.value : '').trim();
    phFilterType   = typeEl   ? typeEl.value   : '';
    phFilterYear   = yearEl   ? yearEl.value   : '';
    phFilterMonth  = monthEl  ? monthEl.value  : '';
    phVisible = 25; // reset pagination on filter change
    renderPhoneHistory();
  }

  if (searchEl) searchEl.addEventListener('input', applyFilters);
  if (typeEl)   typeEl.addEventListener('change', applyFilters);
  if (yearEl)   yearEl.addEventListener('change', applyFilters);
  if (monthEl)  monthEl.addEventListener('change', applyFilters);

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchEl) searchEl.value = '';
      if (typeEl)   typeEl.value   = '';
      if (yearEl)   yearEl.value   = '';
      if (monthEl)  monthEl.value  = '';
      applyFilters();
    });
  }

  // Load more button
  const loadMoreBtn = document.getElementById('btn-ph-load-more');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      phVisible += PH_INCREMENT;
      renderPhoneHistory();
    });
  }

  // Detail modal close
  const closeDetailBtn = document.getElementById('btn-ph-detail-close');
  if (closeDetailBtn) {
    closeDetailBtn.addEventListener('click', closePhoneDetailModal);
  }
  const detailModal = document.getElementById('ph-detail-modal');
  if (detailModal) {
    detailModal.addEventListener('click', e => {
      if (e.target === detailModal) closePhoneDetailModal();
    });
  }

  renderPhoneHistory();
  startAutoRefresh();
});
