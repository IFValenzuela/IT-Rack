// ============================================================
// category-detail.js — Detail page for a specific category
// Renders dynamic charts and high-density inventory list
// ============================================================

let baseDevices = [];
let filteredDevices = [];
let currentCategory = '';
let charts = { models: null, status: null, location: null };
let filters = { month: 'all', year: 'all', building: 'all', status: 'all' };

Chart.register(ChartDataLabels);

document.addEventListener('DOMContentLoaded', () => {
  initPage();
});

async function initPage() {
  const urlParams = new URLSearchParams(window.location.search);
  currentCategory = urlParams.get('category');

  if (!currentCategory) {
    window.location.href = 'statistics.html';
    return;
  }

  document.getElementById('page-category-name').textContent = currentCategory;
  document.title = `${currentCategory} Details — IT Rack Inventory`;

  try {
    const data = await apiCall('GET', '/stats/devices-by-category');
    const categories = data.categories || [];
    const catData = categories.find(c => c.category === currentCategory);

    if (!catData) {
      document.getElementById('loading-view').innerHTML = `
        <div style="text-align:center; padding: 60px 20px;">
          <p style="font-size: 1rem; color: #636e72; margin-bottom: 20px;">No devices found for <strong>${escHtml(currentCategory)}</strong>.</p>
          <a href="statistics.html" style="display:inline-flex; align-items:center; gap:6px; padding:10px 20px; background:var(--blue, #007db8); color:#fff; border-radius:8px; text-decoration:none; font-weight:600; font-size:0.85rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Back to Statistics
          </a>
        </div>`;
      return;
    }

    // Flatten all devices for this category
    baseDevices = [];
    for (const model of catData.models) {
      for (const d of model.devices) {
        baseDevices.push({
          ...d,
          modelName: model.modelName
        });
      }
    }

    populateFilters();
    attachEvents();
    
    document.getElementById('loading-view').classList.add('hidden');
    document.getElementById('content-view').classList.remove('hidden');
    
    applyFilters(); // This triggers rendering
  } catch (err) {
    document.getElementById('loading-view').innerHTML = `<p style="color:red">Error loading data: ${escHtml(err.message)}</p>`;
  }
}

function populateFilters() {
  const months = new Set();
  const years = new Set();

  baseDevices.forEach(d => {
    if (d.createdAt) {
      const date = new Date(d.createdAt);
      if (!isNaN(date.getTime())) {
        months.add(date.getMonth() + 1);
        years.add(date.getFullYear());
      }
    }
  });

  const monthSelect = document.getElementById('filter-month');
  const yearSelect = document.getElementById('filter-year');

  const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  let monthHtml = '<option value="all">All Months</option>';
  Array.from(months).sort((a,b)=>a-b).forEach(m => {
    monthHtml += `<option value="${m}">${monthNames[m]}</option>`;
  });
  monthSelect.innerHTML = monthHtml;

  let yearHtml = '<option value="all">All Years</option>';
  Array.from(years).sort((a,b)=>b-a).forEach(y => {
    yearHtml += `<option value="${y}">${y}</option>`;
  });
  yearSelect.innerHTML = yearHtml;
}

function attachEvents() {
  document.getElementById('filter-month').addEventListener('change', e => { filters.month = e.target.value; applyFilters(); });
  document.getElementById('filter-year').addEventListener('change', e => { filters.year = e.target.value; applyFilters(); });
  document.getElementById('filter-building').addEventListener('change', e => { filters.building = e.target.value; applyFilters(); });
  document.getElementById('filter-status').addEventListener('change', e => { filters.status = e.target.value; applyFilters(); });
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
}

function applyFilters() {
  filteredDevices = baseDevices.filter(d => {
    let match = true;
    
    if (filters.building !== 'all') {
      if (d.department !== filters.building) match = false;
    }
    if (filters.status !== 'all') {
      if (d.status !== filters.status) match = false;
    }
    if (filters.year !== 'all') {
      if (!d.createdAt || new Date(d.createdAt).getFullYear().toString() !== filters.year) match = false;
    }
    if (filters.month !== 'all') {
      if (!d.createdAt || (new Date(d.createdAt).getMonth() + 1).toString() !== filters.month) match = false;
    }

    return match;
  });

  renderCharts();
  renderTable();
}

const COMMON_CHART_OPTIONS = {
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
        return pct > 4 ? pct + '%' : '';
      },
      textShadowBlur: 4,
      textShadowColor: 'rgba(0,0,0,0.4)'
    },
    tooltip: {
      callbacks: {
        label: function(ctx) {
          const total = ctx.dataset.data.reduce((a,b) => a + b, 0);
          const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : '0.0';
          return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
        }
      }
    }
  },
  cutout: '65%'
};

const CHART_COLORS = ['#007db8', '#00b894', '#6c5ce7', '#e17055', '#fdcb6e', '#d63031', '#0984e3', '#00cec9', '#e84393', '#55efc4'];

function renderCharts() {
  // 1. Models Distribution
  const modelsMap = {};
  filteredDevices.forEach(d => {
    modelsMap[d.modelName] = (modelsMap[d.modelName] || 0) + 1;
  });
  updateChart('models', Object.keys(modelsMap), Object.values(modelsMap));

  // 2. Status Breakdown
  const inCount = filteredDevices.filter(d => d.status === 'in').length;
  const outCount = filteredDevices.filter(d => d.status !== 'in').length;
  updateChart('status', ['In Storage', 'Deployed'], [inCount, outCount], ['#00b894', '#e17055']);

  // 3. Location Split
  const locMap = {};
  filteredDevices.forEach(d => {
    const loc = d.department || 'Unknown';
    locMap[loc] = (locMap[loc] || 0) + 1;
  });
  updateChart('location', Object.keys(locMap), Object.values(locMap));
}

function updateChart(chartKey, labels, data, colors = CHART_COLORS) {
  const ctx = document.getElementById(`chart-${chartKey}`).getContext('2d');
  const usedColors = colors.slice(0, labels.length);
  
  if (charts[chartKey]) {
    charts[chartKey].data.labels = labels;
    charts[chartKey].data.datasets[0].data = data;
    charts[chartKey].data.datasets[0].backgroundColor = usedColors;
    charts[chartKey].update();
  } else {
    charts[chartKey] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: usedColors,
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 8
        }]
      },
      options: COMMON_CHART_OPTIONS
    });
  }

  // Render custom legend
  renderChartLegend(chartKey, labels, data, usedColors);
}

function renderChartLegend(chartKey, labels, data, colors) {
  const legendEl = document.getElementById(`legend-${chartKey}`);
  if (!legendEl) return;

  const total = data.reduce((a, b) => a + b, 0);

  if (total === 0) {
    legendEl.innerHTML = '<li style="color: var(--text-muted); font-size: 0.8rem; padding: 8px;">No data</li>';
    return;
  }

  legendEl.innerHTML = labels.map((label, i) => {
    const count = data[i];
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    return `<li class="chart-legend-item">
      <span class="chart-legend-dot" style="background:${colors[i]}"></span>
      <span class="chart-legend-name" title="${escHtml(label)}">${escHtml(label)}</span>
      <span class="chart-legend-pct">${pct}%</span>
    </li>`;
  }).join('');
}

function renderTable() {
  const tbody = document.getElementById('table-body');
  document.getElementById('table-title').textContent = `Inventory List (${filteredDevices.length})`;

  if (filteredDevices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 30px; color: #888;">No devices match the current filters.</td></tr>';
    return;
  }

  // Sort by date desc
  const sorted = [...filteredDevices].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  tbody.innerHTML = sorted.map(d => {
    const statusText = d.status === 'in' ? 'Storage' : 'Deployed';
    const statusClass = d.status === 'in' ? 'in' : 'out';
    const dateStr = d.createdAt ? formatDate(d.createdAt) : '—';
    return `
      <tr>
        <td class="mono">${escHtml(d.serial || '—')}</td>
        <td><strong>${escHtml(d.modelName || '—')}</strong></td>
        <td>${escHtml(d.department || '—')}</td>
        <td><span class="status-pill ${statusClass}">${statusText}</span></td>
        <td>${dateStr}</td>
      </tr>
    `;
  }).join('');
}

function exportCSV() {
  if (filteredDevices.length === 0) {
    showToast('No data to export.');
    return;
  }

  const rows = [['Serial', 'Model', 'Building', 'Status', 'Added Date']];
  
  // Sort same as table
  const sorted = [...filteredDevices].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  sorted.forEach(d => {
    rows.push([
      d.serial || '',
      d.modelName || '',
      d.department || '',
      d.status === 'in' ? 'In Storage' : 'Deployed',
      d.createdAt || ''
    ]);
  });

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${currentCategory.replace(/\s+/g, '-').toLowerCase()}-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported successfully');
}
