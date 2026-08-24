// ============================================================
// statistics.js — High-density corporate statistics dashboard
// Horizontal bar chart by category, slide-out drawer drill-down
// Client-side filtering by building, search, and sort
// Depends on: config.js, api.js, utils.js
// ============================================================

/* ── Lucide-style SVG icons (24x24 viewBox, stroke-based) ──── */
const IC = {
  laptop:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="12" x="3" y="4" rx="2"/><line x1="2" x2="22" y1="20" y2="20"/></svg>',
  monitor:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>',
  keyboard:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/></svg>',
  smartphone: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/></svg>',
  mouse:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="18" rx="6"/><line x1="12" x2="12" y1="3" y2="9"/></svg>',
  headset:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>',
  dock:       '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5M9 7V2M15 7V2"/><rect width="12" height="6" x="6" y="7" rx="1"/></svg>',
  cable:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  camera:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>',
  printer:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>',
  tablet:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="12" x2="12.01" y1="18" y2="18"/></svg>',
  scanner:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/></svg>',
  pkg:        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></svg>',
  // Utility icons
  search:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  download:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
  x:          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  chevRight:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  chevDown:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  sort:       '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8 4-4 4 4M7 4v16"/><path d="m21 16-4 4-4-4M17 20V4"/></svg>',
  building:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></svg>',
  hardDrive:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/></svg>',
  send:       '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  layers:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  barChart:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></svg>',
  wrench:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
};

const CAT_ICON_MAP = {
  'Laptop': IC.laptop, 'Desktop PC': IC.monitor, 'Keyboard': IC.keyboard,
  'Cellphone': IC.smartphone, 'Mouse': IC.mouse, 'Headset': IC.headset,
  'Dock': IC.dock, 'Monitor': IC.monitor, 'Cable': IC.cable,
  'Camera': IC.camera, 'Printer': IC.printer, 'Tablet': IC.tablet,
  'Scanner': IC.scanner, 'Other': IC.pkg,
};

const BAR_COLORS = {
  'Laptop': '#007db8', 'Desktop PC': '#005f8f', 'Keyboard': '#6c5ce7',
  'Cellphone': '#00b894', 'Mouse': '#e17055', 'Headset': '#d63031',
  'Dock': '#0984e3', 'Monitor': '#00cec9', 'Cable': '#636e72',
  'Camera': '#e84393', 'Printer': '#b8860b', 'Tablet': '#a29bfe',
  'Scanner': '#74b9ff', 'Other': '#b2bec3',
};

/* ── Master category list (canonical order) ────────────── */
const ALL_CATEGORIES = [
  'Laptop', 'Desktop PC', 'Keyboard', 'Cellphone', 'Mouse',
  'Headset', 'Dock', 'Monitor', 'Cable', 'Camera',
  'Printer', 'Tablet', 'Scanner', 'Other'
];

/* ── State ─────────────────────────────────────────────── */
let rawCategories   = [];
let flatDevices     = [];
let explorerChart     = null;
let explorerFiltered  = [];
let explorerState     = { categories: [], month: 'all', year: 'all', status: 'all', building: 'all' };
let filters         = { building: 'all', search: '', sort: 'high', month: 'all', year: 'all' };

/* ── Bootstrap ─────────────────────────────────────────── */
Chart.register(ChartDataLabels);

document.addEventListener('DOMContentLoaded', () => {
  attachToolbarEvents();
  loadStatistics();
  initPipelineSLA();
});

/* ── Data Loading ──────────────────────────────────────── */
async function loadStatistics() {
  show('stats-loading'); hide('stats-content'); hide('stats-empty');
  try {
    const data = await apiCall('GET', '/stats/devices-by-category');
    rawCategories = data.categories || [];
    flatDevices   = flattenAll(rawCategories);

    if (rawCategories.length === 0 || rawCategories.every(c => c.deviceCount === 0)) {
      hide('stats-loading'); show('stats-empty');
      return;
    }
    hide('stats-loading'); show('stats-content');
    populateDateDropdowns(flatDevices);
    initExplorer();
    renderDashboard();
  } catch (err) {
    document.getElementById('stats-loading').innerHTML =
      `<div class="stat-error"><p>⚠ Could not load statistics</p><p>${escHtml(err.message)}</p></div>`;
  }
}

function flattenAll(categories) {
  const out = [];
  for (const cat of categories) {
    for (const model of cat.models) {
      for (const dev of model.devices) {
        out.push({ ...dev, category: cat.category, modelName: model.modelName, modelId: model.modelId });
      }
    }
  }
  return out;
}

/* ── Filtering & Aggregation Pipeline ──────────────────── */
function populateDateDropdowns(devices) {
  const months = new Set();
  const years = new Set();
  
  devices.forEach(d => {
    if (d.createdAt) {
      const date = new Date(d.createdAt);
      if (!isNaN(date.getTime())) {
        months.add(date.getMonth() + 1); // 1-12
        years.add(date.getFullYear());
      }
    }
  });

  const monthSelect = document.getElementById('filter-month');
  const yearSelect = document.getElementById('filter-year');

  // Month names
  const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  let monthHtml = '<option value="all">All Months</option>';
  Array.from(months).sort((a,b)=>a-b).forEach(m => {
    monthHtml += `<option value="${m}">${monthNames[m]}</option>`;
  });
  monthSelect.innerHTML = monthHtml;
  monthSelect.value = filters.month;

  let yearHtml = '<option value="all">All Years</option>';
  Array.from(years).sort((a,b)=>b-a).forEach(y => {
    yearHtml += `<option value="${y}">${y}</option>`;
  });
  yearSelect.innerHTML = yearHtml;
  yearSelect.value = filters.year;
}

function computeFiltered() {
  let devices = flatDevices;

  // Building / department filter
  if (filters.building !== 'all') {
    devices = devices.filter(d => d.department === filters.building);
  }

  // Date filters
  if (filters.year !== 'all') {
    devices = devices.filter(d => d.createdAt && new Date(d.createdAt).getFullYear().toString() === filters.year);
  }
  if (filters.month !== 'all') {
    devices = devices.filter(d => d.createdAt && (new Date(d.createdAt).getMonth() + 1).toString() === filters.month);
  }

  // Search filter — match against serial, model name, device ID
  if (filters.search) {
    const q = filters.search.toLowerCase();
    devices = devices.filter(d =>
      (d.serial || '').toLowerCase().includes(q) ||
      (d.modelName || '').toLowerCase().includes(q) ||
      (d.id || '').toLowerCase().includes(q)
    );
  }

  // Seed catMap with ALL categories so none are missing
  const catMap = {};
  for (const name of ALL_CATEGORIES) {
    catMap[name] = { category: name, deviceCount: 0, models: {} };
  }

  // Reaggregate by category
  for (const d of devices) {
    const cat = d.category || 'Other';
    if (!catMap[cat]) catMap[cat] = { category: cat, deviceCount: 0, models: {} };
    catMap[cat].deviceCount++;
    if (!catMap[cat].models[d.modelId]) {
      catMap[cat].models[d.modelId] = { modelId: d.modelId, modelName: d.modelName, deviceCount: 0, devices: [] };
    }
    catMap[cat].models[d.modelId].deviceCount++;
    catMap[cat].models[d.modelId].devices.push(d);
  }

  // Preserve canonical order, then apply sort
  let categories = ALL_CATEGORIES
    .filter(name => catMap[name])
    .map(name => ({ ...catMap[name], models: Object.values(catMap[name].models) }));

  // Sort
  if (filters.sort === 'high') categories.sort((a, b) => b.deviceCount - a.deviceCount);
  else if (filters.sort === 'low') categories.sort((a, b) => a.deviceCount - b.deviceCount);
  else categories.sort((a, b) => a.category.localeCompare(b.category));

  // Status
  const status = {
    total:     devices.length,
    inStorage: devices.filter(d => d.status === 'in').length,
    deployed:  devices.filter(d => d.status === 'out').length,
    models:    new Set(devices.map(d => d.modelId)).size,
  };

  return { categories, status };
}

/* ── Main Render ───────────────────────────────────────── */
function renderDashboard() {
  const { categories, status } = computeFiltered();
  renderStatusCards(status);
  renderBarChart(categories, status.total);
}

/* ── Status Cards ──────────────────────────────────────── */
function renderStatusCards(s) {
  document.getElementById('status-cards').innerHTML = `
    <div class="metric-card">
      <div class="metric-icon total">${IC.layers}</div>
      <div class="metric-body"><div class="metric-value">${s.total}</div><div class="metric-label">Total Devices</div></div>
    </div>
    <div class="metric-card">
      <div class="metric-icon storage">${IC.hardDrive}</div>
      <div class="metric-body"><div class="metric-value">${s.inStorage}</div><div class="metric-label">In Storage</div></div>
    </div>
    <div class="metric-card">
      <div class="metric-icon deployed">${IC.send}</div>
      <div class="metric-body"><div class="metric-value">${s.deployed}</div><div class="metric-label">Deployed</div></div>
    </div>
    <div class="metric-card">
      <div class="metric-icon models">${IC.barChart}</div>
      <div class="metric-body"><div class="metric-value">${s.models}</div><div class="metric-label">Active Models</div></div>
    </div>`;
  staggerIn(document.getElementById('status-cards'), '.metric-card', 50);
}

/* ── Horizontal Bar Chart ──────────────────────────────── */
function renderBarChart(categories, total) {
  const container = document.getElementById('bar-chart-container');
  if (categories.length === 0) {
    container.innerHTML = '<div class="bar-empty">No devices match the current filters.</div>';
    return;
  }

  container.innerHTML = categories.map((cat, i) => {
    const pct      = total > 0 ? ((cat.deviceCount / total) * 100) : 0;
    const barWidth = pct;
    const color    = BAR_COLORS[cat.category] || '#636e72';
    const icon     = CAT_ICON_MAP[cat.category] || IC.pkg;

    return `
      <button class="bar-row" data-cat="${escHtml(cat.category)}" onclick="window.location.href='category-detail.html?category=${encodeURIComponent(cat.category)}'">
        <span class="bar-icon" style="color:${color}">${icon}</span>
        <span class="bar-label">${escHtml(cat.category)}</span>
        <span class="bar-track">
          <span class="bar-fill" style="width:${barWidth}%; --bar-color:${color}"></span>
        </span>
        <span class="bar-value">${cat.deviceCount}</span>
        <span class="bar-pct">${pct.toFixed(1)}%</span>
        <span class="bar-arrow">${IC.chevRight}</span>
      </button>`;
  }).join('');
  staggerIn(container, '.bar-row', 35);
}

/* ── Toolbar Events ────────────────────────────────────── */
function attachToolbarEvents() {
  // Building toggle
  document.querySelectorAll('.bld-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if(btn.tagName === 'SELECT') return;
      document.querySelectorAll('.bld-btn:not(select)').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filters.building = btn.dataset.building;
      renderDashboard();
    });
  });

  // Date filters
  document.getElementById('filter-month').addEventListener('change', (e) => {
    filters.month = e.target.value;
    renderDashboard();
  });
  document.getElementById('filter-year').addEventListener('change', (e) => {
    filters.year = e.target.value;
    renderDashboard();
  });

  // Search
  const searchInput = document.getElementById('stats-search-input');
  let debounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { filters.search = searchInput.value.trim(); renderDashboard(); }, 200);
  });

  // Sort
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filters.sort = btn.dataset.sort;
      renderDashboard();
    });
  });

  // Export CSV (top toolbar — exports dashboard view)
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
}

/* ── Top-level CSV Export ──────────────────────────────── */
function exportCSV() {
  const { categories } = computeFiltered();
  const rows = [['Category', 'Model', 'Serial', 'PR Number', 'Department', 'Status', 'Added By', 'Date Added']];

  for (const cat of categories) {
    for (const model of cat.models) {
      for (const d of model.devices) {
        rows.push([
          cat.category, model.modelName, d.serial || '', d.prNumber || '',
          d.department || '', d.status === 'in' ? 'In Storage' : 'Deployed',
          d.addedBy || '', d.createdAt || '',
        ]);
      }
      if (model.devices.length === 0) {
        rows.push([cat.category, model.modelName, '', '', '', '', '', '']);
      }
    }
  }

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `device-statistics-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported successfully');
}

/* ══════════════════════════════════════════════════════════
   INVENTORY EXPLORER — self-contained filters → pie → CSV
   ══════════════════════════════════════════════════════════ */

const EXPLORER_COLORS = [
  '#007db8', '#00b894', '#6c5ce7', '#e17055', '#fdcb6e',
  '#d63031', '#0984e3', '#00cec9', '#e84393', '#636e72',
  '#74b9ff', '#a29bfe', '#b8860b', '#b2bec3'
];

function initExplorer() {
  // Build category chips from the master list (preserves canonical order)
  const chipContainer = document.getElementById('explorer-cat-chips');
  const allCats = ALL_CATEGORIES;
  
  // Default to all categories selected
  explorerState.categories = [...ALL_CATEGORIES];

  chipContainer.innerHTML = `<button class="cat-chip selected" data-cat="__all" style="--cat-color:var(--blue); font-weight:700;">
      <span class="chip-dot"></span>All
    </button>` + allCats.map(cat => {
    const color = BAR_COLORS[cat] || '#636e72';
    return `<button class="cat-chip selected" data-cat="${escHtml(cat)}" style="--cat-color:${color}">
      <span class="chip-dot"></span>${escHtml(cat)}
    </button>`;
  }).join('');

  // "All" chip click — select or deselect everything
  const allChip = chipContainer.querySelector('[data-cat="__all"]');
  allChip.addEventListener('click', () => {
    const allSelected = explorerState.categories.length === ALL_CATEGORIES.length;
    chipContainer.querySelectorAll('.cat-chip').forEach(c => {
      if (allSelected) c.classList.remove('selected');
      else c.classList.add('selected');
    });
    explorerState.categories = allSelected ? [] : [...ALL_CATEGORIES];
    runExplorerQuery();
  });

  // Individual chip click — toggle selection and sync the "All" chip
  chipContainer.querySelectorAll('.cat-chip:not([data-cat="__all"])').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      const cat = chip.dataset.cat;
      const idx = explorerState.categories.indexOf(cat);
      if (idx === -1) explorerState.categories.push(cat);
      else explorerState.categories.splice(idx, 1);
      // Sync "All" chip state
      if (explorerState.categories.length === ALL_CATEGORIES.length) allChip.classList.add('selected');
      else allChip.classList.remove('selected');
      runExplorerQuery();
    });
  });

  // Populate explorer date dropdowns from the global flat devices
  const months = new Set();
  const years = new Set();
  flatDevices.forEach(d => {
    if (d.createdAt) {
      const dt = new Date(d.createdAt);
      if (!isNaN(dt.getTime())) {
        months.add(dt.getMonth() + 1);
        years.add(dt.getFullYear());
      }
    }
  });

  const monthNames = ["", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  const expMonth = document.getElementById('exp-month');
  let mh = '<option value="all">All Months</option>';
  Array.from(months).sort((a,b)=>a-b).forEach(m => { mh += `<option value="${m}">${monthNames[m]}</option>`; });
  expMonth.innerHTML = mh;

  const expYear = document.getElementById('exp-year');
  let yh = '<option value="all">All Years</option>';
  Array.from(years).sort((a,b)=>b-a).forEach(y => { yh += `<option value="${y}">${y}</option>`; });
  expYear.innerHTML = yh;

  // Attach filter change handlers
  document.getElementById('exp-month').addEventListener('change', e => { explorerState.month = e.target.value; runExplorerQuery(); });
  document.getElementById('exp-year').addEventListener('change', e => { explorerState.year = e.target.value; runExplorerQuery(); });
  document.getElementById('exp-status').addEventListener('change', e => { explorerState.status = e.target.value; runExplorerQuery(); });
  document.getElementById('exp-building').addEventListener('change', e => { explorerState.building = e.target.value; runExplorerQuery(); });

  // Attach explorer CSV export
  document.getElementById('btn-explorer-csv').addEventListener('click', exportExplorerCSV);
  
  // Initial query run with all categories selected
  runExplorerQuery();
}

function runExplorerQuery() {
  const st = explorerState;
  const summaryEl = document.getElementById('explorer-summary');
  const actionsEl = document.getElementById('explorer-actions');

  // If no categories selected, clear everything
  if (st.categories.length === 0) {
    summaryEl.innerHTML = '<p class="explorer-no-data">Select at least one category to see results</p>';
    actionsEl.style.display = 'none';
    if (explorerChart) { explorerChart.destroy(); explorerChart = null; }
    explorerFiltered = [];
    return;
  }

  // Filter from the global flat device array
  let devices = flatDevices.filter(d => st.categories.includes(d.category));

  if (st.building !== 'all') devices = devices.filter(d => d.department === st.building);
  if (st.status !== 'all')   devices = devices.filter(d => d.status === st.status);
  if (st.year !== 'all')     devices = devices.filter(d => d.createdAt && new Date(d.createdAt).getFullYear().toString() === st.year);
  if (st.month !== 'all')    devices = devices.filter(d => d.createdAt && (new Date(d.createdAt).getMonth() + 1).toString() === st.month);

  explorerFiltered = devices;

  // Aggregate per selected category
  const catCounts = {};
  devices.forEach(d => { catCounts[d.category] = (catCounts[d.category] || 0) + 1; });

  const labels = st.categories.filter(c => (catCounts[c] || 0) > 0);
  const data   = labels.map(c => catCounts[c]);
  const colors = labels.map(c => BAR_COLORS[c] || '#636e72');

  // Render pie chart
  const ctx = document.getElementById('explorer-pie-chart').getContext('2d');
  if (explorerChart) {
    explorerChart.data.labels = labels;
    explorerChart.data.datasets[0].data = data;
    explorerChart.data.datasets[0].backgroundColor = colors;
    explorerChart.update();
  } else {
    explorerChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            color: '#fff',
            font: { weight: 'bold', size: 12 },
            formatter: (value, ctx) => {
              const total = ctx.dataset.data.reduce((a,b) => a + b, 0);
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return pct > 4 ? pct + '%' : ''; // only show if > 4% to prevent crowding
            },
            textShadowBlur: 4,
            textShadowColor: 'rgba(0,0,0,0.4)'
          },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                const total = ctx.dataset.data.reduce((a,b) => a + b, 0);
                const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : '0.0';
                return ` ${ctx.label}: ${ctx.raw} devices (${pct}%)`;
              }
            }
          }
        },
        cutout: '65%'
      }
    });
  }

  // Render summary list
  const total = data.reduce((a,b) => a + b, 0);
  if (total === 0) {
    summaryEl.innerHTML = '<p class="explorer-no-data">No devices match these filters</p>';
  } else {
    summaryEl.innerHTML = `<ul class="explorer-stat-list">
      ${labels.map((label, i) => {
        const count = data[i];
        const pct = ((count / total) * 100).toFixed(1);
        return `<li class="explorer-stat-item">
          <span class="explorer-stat-dot" style="background:${colors[i]}"></span>
          <span class="explorer-stat-name">${escHtml(label)}</span>
          <span class="explorer-stat-count">${count}</span>
          <span class="explorer-stat-pct">${pct}%</span>
        </li>`;
      }).join('')}
    </ul>`;
  }

  // Show actions row
  actionsEl.style.display = 'flex';
  document.getElementById('explorer-count').textContent = `${devices.length} device${devices.length === 1 ? '' : 's'} found`;
}

function exportExplorerCSV() {
  if (explorerFiltered.length === 0) {
    showToast('No data to export. Adjust your filters.');
    return;
  }

  const rows = [['Category', 'Model', 'Serial', 'PR Number', 'Department', 'Status', 'Added By', 'Date Added']];
  for (const d of explorerFiltered) {
    rows.push([
      d.category || '', d.modelName || '', d.serial || '', d.prNumber || '',
      d.department || '', d.status === 'in' ? 'In Storage' : 'Deployed',
      d.addedBy || '', d.createdAt || ''
    ]);
  }

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `explorer-${explorerState.categories.join('-')}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${explorerFiltered.length} devices to CSV`);
}

/* ── Helpers ───────────────────────────────────────────── */
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

/* ── Pipeline SLA Analysis ─────────────────────────────── */

let slaAllTickets = [];
const SLA_TARGET_HOURS = 72;
const PIPELINE_STAGES = [
  'Ticket Created',
  'Manager Approval',
  'Requisition / Quote',
  'PR',
  'Awaiting Approval',
  'Awaiting Purchasing',
  'Warehouse Delivery',
  'IT Transit Time',
  'Add to Jira',
  'Equipment Preparation',
  'Delivery'
];

async function initPipelineSLA() {
  try {
    const [tickets, summary] = await Promise.all([
      apiCall('GET', '/pipeline'),
      apiCall('GET', '/pipeline/stats/summary')
    ]);
    slaAllTickets = tickets || [];
    
    // Setup Dept Filter Dropdown
    const deptSet = new Set();
    slaAllTickets.forEach(t => { if (t.department) deptSet.add(t.department); });
    const deptFilter = document.getElementById('sla-dept-filter');
    if (deptFilter) {
      deptFilter.innerHTML = '<option value="">All Departments</option>';
      Array.from(deptSet).sort().forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        deptFilter.appendChild(opt);
      });
      deptFilter.addEventListener('change', () => renderSLATable());
    }

    const searchInput = document.getElementById('sla-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => renderSLATable());
    }

    const exportBtn = document.getElementById('btn-export-sla');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportSLACsv);
    }

    renderSLAKPIs(summary);
    renderStageDwellTimes();
    renderSLATable();
    initPipelineExplorer();
  } catch (err) {
    console.error('Failed to init Pipeline SLA:', err);
  }
}

function getElapsedHours(fromDate, toDate = new Date()) {
  if (!fromDate) return 0;
  const ms = new Date(toDate).getTime() - new Date(fromDate).getTime();
  return ms > 0 ? ms / (1000 * 60 * 60) : 0;
}

function renderSLAKPIs(summary) {
  // 1. Avg Lead Time
  const avgLeadTime = summary.avgCycleHours ? `${summary.avgCycleHours}h` : 'N/A';

  // 2. Primary Bottleneck
  const stageTimes = {};
  PIPELINE_STAGES.forEach(s => stageTimes[s] = { total: 0, count: 0 });
  
  slaAllTickets.forEach(t => {
    if (t.current_status !== 'Cancelled' && PIPELINE_STAGES.includes(t.current_status)) {
      stageTimes[t.current_status].total += getElapsedHours(t.updated_at);
      stageTimes[t.current_status].count += 1;
    }
  });

  let bottleneckStage = 'None';
  let maxAvg = 0;
  PIPELINE_STAGES.forEach(s => {
    if (stageTimes[s].count > 0) {
      const avg = stageTimes[s].total / stageTimes[s].count;
      if (avg > maxAvg) {
        maxAvg = avg;
        bottleneckStage = s;
      }
    }
  });

  // 3. SLA On-Track Rate
  let onTrackCount = 0;
  let measurableCount = 0;
  slaAllTickets.forEach(t => {
    if (t.current_status !== 'Cancelled') {
      const totalElapsed = getElapsedHours(t.created_at, t.current_status === 'Delivery' ? t.updated_at : new Date());
      if (totalElapsed <= SLA_TARGET_HOURS) onTrackCount++;
      measurableCount++;
    }
  });
  const onTrackRate = measurableCount > 0 ? ((onTrackCount / measurableCount) * 100).toFixed(1) + '%' : 'N/A';

  // 4. Total Requests
  const totalReqs = summary.total || slaAllTickets.length;

  // DOM Updates
  const avgEl = document.getElementById('sla-avg-lead-time');
  if (avgEl) avgEl.textContent = avgLeadTime;

  const bneckEl = document.getElementById('sla-bottleneck-stage');
  if (bneckEl) bneckEl.textContent = bottleneckStage;

  const bneckSubEl = document.getElementById('sla-bottleneck-sub');
  if (bneckSubEl) bneckSubEl.textContent = `Avg: ${maxAvg.toFixed(1)}h in stage`;

  const trackEl = document.getElementById('sla-ontrack-rate');
  if (trackEl) trackEl.textContent = onTrackRate;

  const totalEl = document.getElementById('sla-total-requests');
  if (totalEl) totalEl.textContent = totalReqs;
}

function renderStageDwellTimes() {
  const listEl = document.getElementById('sla-breakdown-list');
  if (!listEl) return;

  const stageTimes = {};
  PIPELINE_STAGES.forEach(s => stageTimes[s] = { total: 0, count: 0 });
  
  slaAllTickets.forEach(t => {
    if (t.current_status !== 'Cancelled' && PIPELINE_STAGES.includes(t.current_status)) {
      stageTimes[t.current_status].total += getElapsedHours(t.updated_at);
      stageTimes[t.current_status].count += 1;
    }
  });

  let maxAvg = 0;
  let totalAvg = 0;
  const stageAvgs = PIPELINE_STAGES.map(s => {
    const avg = stageTimes[s].count > 0 ? stageTimes[s].total / stageTimes[s].count : 0;
    if (avg > maxAvg) maxAvg = avg;
    totalAvg += avg;
    return { stage: s, avg };
  });

  listEl.innerHTML = stageAvgs.map((s, idx) => {
    const isBottleneck = s.avg > 0 && s.avg === maxAvg;
    const pct = totalAvg > 0 ? ((s.avg / totalAvg) * 100).toFixed(1) : 0;
    const barWidth = maxAvg > 0 ? (s.avg / maxAvg) * 100 : 0;
    return `
      <div class="sla-stage-row">
        <span class="sla-stage-name">${idx + 1}. ${escHtml(s.stage)}</span>
        <div class="sla-stage-track">
          <div class="sla-stage-fill ${isBottleneck ? 'bottleneck' : ''}" style="width: ${barWidth}%;"></div>
        </div>
        <div class="sla-stage-metrics">
          <span>${s.avg.toFixed(1)}h</span>
          <span class="sla-stage-pct">(${pct}%)</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderSLATable() {
  const tbody = document.getElementById('sla-audit-tbody');
  const searchStr = (document.getElementById('sla-search')?.value || '').toLowerCase();
  const deptFilter = document.getElementById('sla-dept-filter')?.value || '';

  if (!tbody) return;

  const filtered = slaAllTickets.filter(t => {
    if (t.current_status === 'Cancelled') return false;
    if (deptFilter && t.department !== deptFilter) return false;
    if (searchStr) {
      const match = [t.ticket_number, t.jira_ticket, t.device_model, t.requested_by]
        .some(val => (val || '').toLowerCase().includes(searchStr));
      if (!match) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No matching requests found.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const totalElapsed = getElapsedHours(t.created_at, t.current_status === 'Delivery' ? t.updated_at : new Date());
    const timeInStage = getElapsedHours(t.updated_at);
    
    let slaPill = '';
    if (t.current_status === 'Delivery') {
      slaPill = '<span class="sla-badge-ontrack">Completed</span>';
    } else if (totalElapsed <= SLA_TARGET_HOURS) {
      slaPill = '<span class="sla-badge-ontrack">On Track</span>';
    } else {
      slaPill = '<span class="sla-badge-delayed">Delayed</span>';
    }

    const tId = t.jira_ticket || t.ticket_number;
    const deptStr = t.department || 'General';
    const reqStr = t.requested_by || 'Unknown';

    return `
      <tr>
        <td><span class="sla-mono-badge">${escHtml(tId)}</span></td>
        <td style="font-weight:600;">${escHtml(t.device_model)}</td>
        <td>${escHtml(reqStr)} &middot; ${escHtml(deptStr)}</td>
        <td>${escHtml(t.current_status)}</td>
        <td>${timeInStage.toFixed(1)}h</td>
        <td>${totalElapsed.toFixed(1)}h</td>
        <td>${slaPill}</td>
      </tr>
    `;
  }).join('');
}

function exportSLACsv() {
  const searchStr = (document.getElementById('sla-search')?.value || '').toLowerCase();
  const deptFilter = document.getElementById('sla-dept-filter')?.value || '';

  const filtered = slaAllTickets.filter(t => {
    if (t.current_status === 'Cancelled') return false;
    if (deptFilter && t.department !== deptFilter) return false;
    if (searchStr) {
      const match = [t.ticket_number, t.jira_ticket, t.device_model, t.requested_by]
        .some(val => (val || '').toLowerCase().includes(searchStr));
      if (!match) return false;
    }
    return true;
  });

  let csv = 'Ticket ID,Item,Requester,Department,Stage,Time In Stage (h),Total Elapsed (h),Status\n';
  filtered.forEach(t => {
    const totalElapsed = getElapsedHours(t.created_at, t.current_status === 'Delivery' ? t.updated_at : new Date());
    const timeInStage = getElapsedHours(t.updated_at);
    const status = totalElapsed <= SLA_TARGET_HOURS ? 'On Track' : 'Delayed';
    csv += `"${t.jira_ticket||t.ticket_number}","${t.device_model||''}","${t.requested_by||''}","${t.department||''}","${t.current_status}","${timeInStage.toFixed(1)}","${totalElapsed.toFixed(1)}","${t.current_status === 'Delivery' ? 'Completed' : status}"
`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pipeline_sla_audit_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
}


/* ── Pipeline Request Explorer ────────────────────────────── */

let slaExplorerState = {
  stages: ['all'],
  month: 'all',
  year: 'all',
  department: 'all',
  technician: 'all'
};

const SLA_STAGE_COLORS = {
  'Ticket Created': '#007db8',
  'Manager Approval': '#00b894',
  'Requisition / Quote': '#6c5ce7',
  'PR': '#e17055',
  'Awaiting Approval': '#fdcb6e',
  'Awaiting Purchasing': '#d63031',
  'Warehouse Delivery': '#0984e3',
  'IT Transit Time': '#00cec9',
  'Add to Jira': '#e84393',
  'Equipment Preparation': '#636e72',
  'Delivery': '#74b9ff'
};

let pipelineExplorerChartInstance = null;
let slaExplorerFiltered = [];

function initPipelineExplorer() {
  renderSLAExplorerFilters();
  computeSLAExplorer();

  // Bind Export CSV
  const exportBtn = document.getElementById('btn-sla-explorer-csv');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportSLAExplorerCSV);
  }
}

function renderSLAExplorerFilters() {
  const chipsContainer = document.getElementById('sla-explorer-stage-chips');
  if (!chipsContainer) return;

  // Render Stage Pills
  let chipsHtml = `<button class="cat-chip ${slaExplorerState.stages.includes('all') ? 'selected' : ''}" data-stage="all" style="--cat-color:var(--blue); font-weight:700;">
      <span class="chip-dot"></span>All
    </button>`;
  
  PIPELINE_STAGES.forEach(stage => {
    const isActive = slaExplorerState.stages.includes(stage) || slaExplorerState.stages.includes('all');
    const color = SLA_STAGE_COLORS[stage] || '#64748b';
    chipsHtml += `<button class="cat-chip ${isActive ? 'selected' : ''}" data-stage="${stage}" style="--cat-color:${color};">
      <span class="chip-dot"></span>${escHtml(stage)}
    </button>`;
  });
  chipsContainer.innerHTML = chipsHtml;

  // Bind chip clicks
  chipsContainer.querySelectorAll('.cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const stage = btn.getAttribute('data-stage');
      if (stage === 'all') {
        slaExplorerState.stages = ['all'];
      } else {
        if (slaExplorerState.stages.includes('all')) {
          slaExplorerState.stages = [stage];
        } else {
          if (slaExplorerState.stages.includes(stage)) {
            slaExplorerState.stages = slaExplorerState.stages.filter(s => s !== stage);
            if (slaExplorerState.stages.length === 0) slaExplorerState.stages = ['all'];
          } else {
            slaExplorerState.stages.push(stage);
            if (slaExplorerState.stages.length === PIPELINE_STAGES.length) slaExplorerState.stages = ['all'];
          }
        }
      }
      renderSLAExplorerFilters();
      computeSLAExplorer();
    });
  });

  // Populate Dropdowns
  const months = new Set();
  const years = new Set();
  const depts = new Set();
  const techs = new Set();

  slaAllTickets.forEach(t => {
    if (t.created_at) {
      const d = new Date(t.created_at);
      if (!isNaN(d.getTime())) {
        months.add(d.getMonth() + 1);
        years.add(d.getFullYear());
      }
    }
    if (t.department) depts.add(t.department);
    if (t.assigned_to) techs.add(t.assigned_to);
  });

  const mSelect = document.getElementById('sla-exp-month');
  const ySelect = document.getElementById('sla-exp-year');
  const dSelect = document.getElementById('sla-exp-department');
  const tSelect = document.getElementById('sla-exp-technician');

  const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  if (mSelect && mSelect.options.length <= 1) {
    let mHtml = '<option value="all">All Months</option>';
    Array.from(months).sort((a,b)=>a-b).forEach(m => mHtml += `<option value="${m}">${monthNames[m]}</option>`);
    mSelect.innerHTML = mHtml;
    mSelect.addEventListener('change', e => { slaExplorerState.month = e.target.value; computeSLAExplorer(); });
  }

  if (ySelect && ySelect.options.length <= 1) {
    let yHtml = '<option value="all">All Years</option>';
    Array.from(years).sort((a,b)=>b-a).forEach(y => yHtml += `<option value="${y}">${y}</option>`);
    ySelect.innerHTML = yHtml;
    ySelect.addEventListener('change', e => { slaExplorerState.year = e.target.value; computeSLAExplorer(); });
  }

  if (dSelect && dSelect.options.length <= 1) {
    let dHtml = '<option value="all">All Departments</option>';
    Array.from(depts).sort().forEach(d => dHtml += `<option value="${d}">${escHtml(d)}</option>`);
    dSelect.innerHTML = dHtml;
    dSelect.addEventListener('change', e => { slaExplorerState.department = e.target.value; computeSLAExplorer(); });
  }

  if (tSelect && tSelect.options.length <= 1) {
    let tHtml = '<option value="all">All Technicians</option>';
    Array.from(techs).sort().forEach(t => tHtml += `<option value="${t}">${escHtml(t)}</option>`);
    tSelect.innerHTML = tHtml;
    tSelect.addEventListener('change', e => { slaExplorerState.technician = e.target.value; computeSLAExplorer(); });
  }
}

function computeSLAExplorer() {
  let tickets = slaAllTickets;

  if (!slaExplorerState.stages.includes('all')) {
    tickets = tickets.filter(t => slaExplorerState.stages.includes(t.current_status));
  }

  if (slaExplorerState.month !== 'all') {
    tickets = tickets.filter(t => t.created_at && (new Date(t.created_at).getMonth() + 1).toString() === slaExplorerState.month);
  }
  if (slaExplorerState.year !== 'all') {
    tickets = tickets.filter(t => t.created_at && new Date(t.created_at).getFullYear().toString() === slaExplorerState.year);
  }
  if (slaExplorerState.department !== 'all') {
    tickets = tickets.filter(t => t.department === slaExplorerState.department);
  }
  if (slaExplorerState.technician !== 'all') {
    tickets = tickets.filter(t => t.assigned_to === slaExplorerState.technician);
  }

  slaExplorerFiltered = tickets;
  renderSLAExplorerResults();
}

function renderSLAExplorerResults() {
  const summaryEl = document.getElementById('sla-explorer-summary');
  const actionsEl = document.getElementById('sla-explorer-actions');
  const chartCanvas = document.getElementById('sla-explorer-pie-chart');

  if (!slaExplorerFiltered.length) {
    summaryEl.innerHTML = '<p class="explorer-no-data">No requests found for the selected filters</p>';
    actionsEl.style.display = 'none';
    if (pipelineExplorerChartInstance) pipelineExplorerChartInstance.destroy();
    pipelineExplorerChartInstance = null;
    return;
  }

  const stageCounts = {};
  PIPELINE_STAGES.forEach(s => stageCounts[s] = 0);
  slaExplorerFiltered.forEach(t => {
    if (stageCounts[t.current_status] !== undefined) stageCounts[t.current_status]++;
  });

  const total = slaExplorerFiltered.length;
  const activeStages = PIPELINE_STAGES.filter(s => stageCounts[s] > 0);

  const labels = activeStages.map(s => s);
  const data = activeStages.map(s => stageCounts[s]);
  const bgColors = activeStages.map(s => SLA_STAGE_COLORS[s] || '#ccc');

  if (pipelineExplorerChartInstance) {
    pipelineExplorerChartInstance.data.labels = labels;
    pipelineExplorerChartInstance.data.datasets[0].data = data;
    pipelineExplorerChartInstance.data.datasets[0].backgroundColor = bgColors;
    pipelineExplorerChartInstance.update();
  } else {
    if (typeof ChartDataLabels !== 'undefined') {
      Chart.register(ChartDataLabels);
    }
    pipelineExplorerChartInstance = new Chart(chartCanvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: bgColors,
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { display: false },
          datalabels: {
            color: '#ffffff',
            font: { weight: 'bold', size: 12 },
            formatter: (value, context) => {
              const chartTotal = context.dataset.data.reduce((sum, item) => sum + item, 0);
              const percentage = chartTotal ? Math.round((value / chartTotal) * 100) : 0;
              return percentage > 4 ? `${percentage}%` : '';
            },
            textShadowBlur: 4,
            textShadowColor: 'rgba(0, 0, 0, 0.45)',
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleFont: { size: 13 },
            bodyFont: { size: 12 },
            padding: 10,
            cornerRadius: 8,
            displayColors: true
          }
        }
      }
    });
  }

  summaryEl.innerHTML = `
    <ul class="explorer-stat-list">
      ${activeStages.map((s, idx) => {
        const pct = ((stageCounts[s] / total) * 100).toFixed(1);
        return `
        <li class="explorer-stat-item">
          <div class="explorer-stat-dot" style="background: ${SLA_STAGE_COLORS[s] || '#ccc'}"></div>
          <span class="explorer-stat-name">${idx + 1}. ${escHtml(s)}</span>
          <span class="explorer-stat-count">${stageCounts[s]}</span>
          <span class="explorer-stat-pct">${pct}%</span>
        </li>`;
      }).join('')}
    </ul>`;

  actionsEl.style.display = 'flex';
  document.getElementById('sla-explorer-count').textContent = `${total} request${total === 1 ? '' : 's'} found`;
}

function exportSLAExplorerCSV() {
  if (slaExplorerFiltered.length === 0) {
    showToast('No data to export.');
    return;
  }

  const rows = [['Ticket ID', 'Item / Description', 'Requester', 'Department', 'Assigned To', 'Current Stage', 'Created At', 'Updated At']];
  for (const t of slaExplorerFiltered) {
    rows.push([
      t.jira_ticket || t.ticket_number || '',
      t.device_model || '',
      t.requested_by || '',
      t.department || '',
      t.assigned_to || '',
      t.current_status || '',
      t.created_at || '',
      t.updated_at || ''
    ]);
  }

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pipeline-explorer-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${slaExplorerFiltered.length} requests to CSV`);
}
