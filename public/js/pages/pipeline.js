// ============================================================
// pages/pipeline.js — Pipeline kanban board controller
// Depends on: config.js, api.js, state.js, utils.js, ui/auth.js
// ============================================================
'use strict';

const PIPELINE_STATUSES = [
  'Ticket',
  'Manager Approval',
  'Requisition / Quote',
  'PR (Purchase Request)',
  'Approval',
  'Waiting on Purchasing',
  'Warehouse Delivery',
  'IT Pickup from Warehouse',
  'Add to Jira',
  'IT Preparation',
  'Final Delivery',
];

// Stages where inventory handoff button is shown
const HANDOFF_STAGES = ['IT Pickup from Warehouse', 'Add to Jira'];

// Colors for each status column
const STATUS_COLORS = [
  '#3b82f6', // Ticket
  '#8b5cf6', // Manager Approval
  '#f59e0b', // Requisition / Quote
  '#ef4444', // PR (Purchase Request)
  '#10b981', // Approval
  '#f97316', // Waiting on Purchasing
  '#6366f1', // Warehouse Delivery
  '#14b8a6', // IT Pickup from Warehouse
  '#ec4899', // Add to Jira
  '#0ea5e9', // IT Preparation
  '#22c55e', // Final Delivery
];

const CANCELLED_COLOR = '#94a3b8';
const CUSTOM_MODEL_VALUE = '__custom__';
const STANDARD_MODEL_CATEGORIES = ['Laptop', 'Desktop PC', 'Monitor', 'Cable', 'Headset', 'Other'];
const NON_SERIALIZED_KEYWORDS = [
  'cable', 'cables', 'headset', 'headsets', 'other', 'others',
  'accessory', 'accessories', 'adapter', 'adapters', 'peripheral', 'peripherals',
  'mouse', 'mice', 'keyboard', 'keyboards', 'dock', 'docking station',
  'n/a', 'none', 'jack', 'charger', 'power supply', 'cord'
];

function isNonSerializedItem(category, modelName) {
  const cat = String(category || '').trim().toLowerCase();
  const model = String(modelName || '').trim().toLowerCase();
  if (NON_SERIALIZED_KEYWORDS.some(kw => cat === kw || cat.includes(kw))) return true;
  if (NON_SERIALIZED_KEYWORDS.some(kw => model.includes(kw))) return true;
  return false;
}

let allRequests = [];
let showCancelled = false;
let searchFilter = '';
let pipelineChart = null;
let modelCatalog = [];
let modelCategories = [...STANDARD_MODEL_CATEGORIES];
let confirmAction = null;
let jiraActionContext = null;
let serialActionContext = null;

document.addEventListener('DOMContentLoaded', async () => {
  await window.authPromise;
  initBoard();
  attachPipelineListeners();
  renderCategorySelect();
  resetNewRequestSelections();
  await Promise.all([loadModelsForSelect(), loadTechniciansForSelect()]);
  await loadPipelineData();
});

// ── Board Initialization ─────────────────────────────────────

function initBoard() {
  const board = document.getElementById('pipeline-board');
  board.innerHTML = '';

  PIPELINE_STATUSES.forEach((status, idx) => {
    const col = createColumn(status, STATUS_COLORS[idx]);
    board.appendChild(col);
  });
}

function createColumn(status, color) {
  const col = document.createElement('div');
  col.className = 'pipeline-column';
  col.dataset.status = status;

  col.innerHTML = `
    <div class="col-header">
      <h3>${escHtml(status)}</h3>
      <span class="col-count" style="background:${color}22;color:${color};">0</span>
    </div>
    <div class="col-cards" data-status="${escHtml(status)}"></div>
  `;

  // Drag-and-drop target
  col.addEventListener('dragover', e => {
    e.preventDefault();
    col.classList.add('drag-over');
  });
  col.addEventListener('dragleave', () => {
    col.classList.remove('drag-over');
  });
  col.addEventListener('drop', async e => {
    e.preventDefault();
    col.classList.remove('drag-over');
    const ticketNumber = e.dataTransfer.getData('text/plain');
    if (!ticketNumber) return;
    const req = allRequests.find(r => r.ticket_number === ticketNumber);
    if (!req || req.current_status === status) return;

    try {
      await apiCall('PUT', `/pipeline/${ticketNumber}/advance`, { target_status: status });
      showToast(`${ticketNumber} → ${status}`);
      await loadPipelineData();
    } catch (err) {
      showToast(err.message || 'Failed to move ticket', 'error');
    }
  });

  return col;
}

// ── Event Listeners ──────────────────────────────────────────

function attachPipelineListeners() {
  // New Request dialog
  document.getElementById('req-device-category').addEventListener('change', handleCategoryChange);
  document.getElementById('req-device-model').addEventListener('change', toggleCustomModelField);
  document.getElementById('btn-new-request').addEventListener('click', () => {
    document.getElementById('new-request-dialog').classList.remove('hidden');
    document.getElementById('new-request-form').reset();
    resetNewRequestSelections();
    document.getElementById('req-jira-ticket').focus();
  });
  document.getElementById('btn-cancel-request').addEventListener('click', () => {
    document.getElementById('new-request-dialog').classList.add('hidden');
    document.getElementById('new-request-form').reset();
    resetNewRequestSelections();
  });
  document.getElementById('new-request-form').addEventListener('submit', handleNewRequest);

  document.getElementById('btn-confirm-action-close').addEventListener('click', closeConfirmActionDialog);
  document.getElementById('btn-confirm-action').addEventListener('click', runConfirmAction);
  document.getElementById('confirm-action-dialog').addEventListener('click', e => {
    if (e.target.id === 'confirm-action-dialog') closeConfirmActionDialog();
  });

  document.getElementById('btn-jira-action-cancel').addEventListener('click', closeJiraActionDialog);
  document.getElementById('btn-jira-action-submit').addEventListener('click', submitJiraAction);
  document.getElementById('jira-action-dialog').addEventListener('click', e => {
    if (e.target.id === 'jira-action-dialog') closeJiraActionDialog();
  });

  document.getElementById('btn-serial-action-cancel').addEventListener('click', closeSerialActionDialog);
  document.getElementById('btn-serial-action-device').addEventListener('click', () => submitSerialAction('device'));
  document.getElementById('btn-serial-action-stock').addEventListener('click', () => submitSerialAction('stock'));
  document.getElementById('serial-action-dialog').addEventListener('click', e => {
    if (e.target.id === 'serial-action-dialog') closeSerialActionDialog();
  });

  // Search
  document.getElementById('pipeline-search').addEventListener('input', e => {
    searchFilter = e.target.value.trim().toLowerCase();
    renderBoard();
  });

  // Toggle cancelled
  document.getElementById('toggle-cancelled').addEventListener('change', e => {
    showCancelled = e.target.checked;
    renderBoard();
  });

  // Close timeline
  document.getElementById('btn-close-timeline').addEventListener('click', () => {
    document.getElementById('timeline-panel').classList.add('hidden');
  });

  // Close ticket detail modal on backdrop click or close button
  document.getElementById('ticket-detail-modal').addEventListener('click', e => {
    if (e.target.id === 'ticket-detail-modal') closeTicketDetailModal();
  });
  const btnCloseDetail = document.getElementById('btn-close-ticket-detail');
  if (btnCloseDetail) btnCloseDetail.addEventListener('click', closeTicketDetailModal);
}

// ── Data Loading ─────────────────────────────────────────────

async function loadModelsForSelect() {
  try {
    modelCatalog = await apiCall('GET', '/models');
    const discoveredCategories = [...new Set(modelCatalog.map(m => (m.category || 'Other').trim() || 'Other'))]
      .filter(cat => !STANDARD_MODEL_CATEGORIES.includes(cat))
      .sort((a, b) => a.localeCompare(b));
    modelCategories = [...STANDARD_MODEL_CATEGORIES, ...discoveredCategories];
    renderCategorySelect();
    resetNewRequestSelections();
  } catch (err) {
    console.error('Failed to load models:', err);
    modelCategories = [...STANDARD_MODEL_CATEGORIES];
    renderCategorySelect();
  }
}

async function loadTechniciansForSelect() {
  try {
    const techs = await apiCall('GET', '/technicians');
    const select = document.getElementById('req-assigned-to');
    select.innerHTML = '<option value="">Select technician…</option>';
    techs.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load technicians:', err);
  }
}

async function loadPipelineData() {
  try {
    const [requests, summary] = await Promise.all([
      apiCall('GET', '/pipeline'),
      apiCall('GET', '/pipeline/stats/summary'),
    ]);
    allRequests = requests;
    renderSummary(summary);
    renderBoard();
    renderChart();
  } catch (err) {
    console.error('Failed to load pipeline data:', err);
    showToast('Failed to load pipeline data');
  }
}

// ── Rendering ────────────────────────────────────────────────

function renderSummary(summary) {
  document.getElementById('stat-active').textContent = summary.active || 0;
  document.getElementById('stat-completed').textContent = summary.completed || 0;
  document.getElementById('stat-cancelled').textContent = summary.cancelled || 0;

  const cycleEl = document.getElementById('stat-cycle-time');
  if (summary.avgCycleHours != null) {
    cycleEl.textContent = summary.avgCycleHours < 1
      ? '<1'
      : Math.round(summary.avgCycleHours);
  } else {
    cycleEl.textContent = '—';
  }
}

function renderBoard() {
  // Clear all card containers
  document.querySelectorAll('.col-cards').forEach(c => { c.innerHTML = ''; });

  // Reset counts
  document.querySelectorAll('.col-count').forEach(c => { c.textContent = '0'; });

  // Remove cancelled column if present, re-add if needed
  const existingCancelledCol = document.querySelector('.pipeline-column.cancelled-col');
  if (existingCancelledCol) existingCancelledCol.remove();

  let filtered = allRequests;

  // Search filter
  if (searchFilter) {
    filtered = filtered.filter(r =>
      (r.ticket_number || '').toLowerCase().includes(searchFilter) ||
      (r.device_model || '').toLowerCase().includes(searchFilter) ||
      (r.requested_by || '').toLowerCase().includes(searchFilter) ||
      (r.assigned_to || '').toLowerCase().includes(searchFilter)
    );
  }

  // Separate cancelled
  const cancelled = filtered.filter(r => r.current_status === 'Cancelled');
  const active = filtered.filter(r => r.current_status !== 'Cancelled');

  // Place active cards into columns
  active.forEach(req => {
    const container = document.querySelector(`.col-cards[data-status="${req.current_status}"]`);
    if (!container) return;
    container.appendChild(createCard(req));
  });

  // Update counts
  PIPELINE_STATUSES.forEach((status, idx) => {
    const count = active.filter(r => r.current_status === status).length;
    const countEl = document.querySelector(`.pipeline-column[data-status="${status}"] .col-count`);
    if (countEl) {
      countEl.textContent = count;
    }
  });

  // Show cancelled column
  if (showCancelled && cancelled.length > 0) {
    const board = document.getElementById('pipeline-board');
    const cancelCol = document.createElement('div');
    cancelCol.className = 'pipeline-column cancelled-col';
    cancelCol.innerHTML = `
      <div class="col-header">
        <h3>Cancelled</h3>
        <span class="col-count" style="background:#94a3b822;color:#94a3b8;">${cancelled.length}</span>
      </div>
      <div class="col-cards"></div>
    `;
    const cardsContainer = cancelCol.querySelector('.col-cards');
    cancelled.forEach(req => {
      cardsContainer.appendChild(createCard(req));
    });
    board.appendChild(cancelCol);
  }
}

function createCard(req) {
  const card = document.createElement('div');
  card.className = 'pipeline-card' + (req.current_status === 'Cancelled' ? ' cancelled' : '');
  card.draggable = req.current_status !== 'Cancelled' && req.current_status !== 'Final Delivery';

  card.innerHTML = `
    <div class="card-ticket-num">${escHtml(req.jira_ticket || req.ticket_number)}</div>
    <div class="card-device">${escHtml(req.device_model)}</div>
  `;

  // Drag events
  card.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', req.ticket_number);
    setTimeout(() => card.style.opacity = '0.4', 0);
  });
  card.addEventListener('dragend', () => {
    card.style.opacity = '1';
  });

  // Click to open detail modal
  card.addEventListener('click', () => {
    openTicketDetailModal(req);
  });

  return card;
}

// ── Ticket Detail Modal ──────────────────────────────────────

let detailModalReq = null;

function openTicketDetailModal(req) {
  detailModalReq = req;
  const modal = document.getElementById('ticket-detail-modal');

  // Populate header
  document.getElementById('td-ticket-num').textContent = req.jira_ticket || req.ticket_number;
  document.getElementById('td-device-model').textContent = req.device_model || '—';

  // Populate meta
  document.getElementById('td-current-stage').textContent = req.current_status || '—';
  document.getElementById('td-requester').textContent = req.requested_by || '—';
  document.getElementById('td-assignee').textContent = req.assigned_to || '—';

  const timeInStage = getTimeInStage(req.updated_at);
  const timeEl = document.getElementById('td-time-in-stage');
  timeEl.textContent = timeInStage.label || '—';
  timeEl.className = 'td-meta-value';

  // Build action buttons
  const actionsEl = document.getElementById('td-actions');
  actionsEl.innerHTML = '';

  const isCancelled = req.current_status === 'Cancelled';
  const isFinal = req.current_status === 'Final Delivery';
  const currentIdx = PIPELINE_STATUSES.indexOf(req.current_status);
  const serialCount = Number(req.serial_count || 0);
  const isHandoffStage = HANDOFF_STAGES.includes(req.current_status);

  if (!isCancelled && !isFinal) {
    const nextStage = currentIdx < PIPELINE_STATUSES.length - 1
      ? PIPELINE_STATUSES[currentIdx + 1]
      : null;

    if (nextStage) {
      const isJiraGate = req.current_status === 'Add to Jira';
      const isFinalGate = nextStage === 'Final Delivery' && serialCount === 0;
      const label = isJiraGate ? 'Add Jira ID & Continue'
        : (isFinalGate ? 'Add Serial & Continue' : `Next → ${nextStage}`);

      const advBtn = document.createElement('button');
      advBtn.type = 'button';
      advBtn.className = 'btn td-btn-advance';
      advBtn.textContent = label;
      advBtn.addEventListener('click', () => {
        closeTicketDetailModal();
        if (isJiraGate) {
          openJiraActionDialog(req.ticket_number, nextStage);
        } else if (isFinalGate) {
          openSerialActionDialog(req.ticket_number, nextStage);
        } else {
          advanceTicket(req.ticket_number, nextStage);
        }
      });
      actionsEl.appendChild(advBtn);
    }

    if (isHandoffStage) {
      const serialBtn = document.createElement('button');
      serialBtn.type = 'button';
      serialBtn.className = 'btn td-btn-serial';
      serialBtn.textContent = 'Add Serial';
      serialBtn.addEventListener('click', () => {
        closeTicketDetailModal();
        openInventoryHandoff(req.ticket_number);
      });
      actionsEl.appendChild(serialBtn);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn td-btn-cancel';
    cancelBtn.textContent = 'Cancel Ticket';
    cancelBtn.addEventListener('click', () => {
      closeTicketDetailModal();
      openConfirmActionDialog({
        title: 'Cancel Request',
        message: `Cancel request ${req.ticket_number}? This will move the ticket out of the active pipeline.`,
        confirmText: 'Confirm Cancel',
        confirmClass: 'danger',
        action: () => cancelTicket(req.ticket_number),
      });
    });
    actionsEl.appendChild(cancelBtn);
  }

  // Timeline button (always visible)
  const timelineBtn = document.createElement('button');
  timelineBtn.type = 'button';
  timelineBtn.className = 'btn td-btn-timeline';
  timelineBtn.textContent = 'View Timeline';
  timelineBtn.addEventListener('click', () => {
    closeTicketDetailModal();
    showTimeline(req.ticket_number);
  });
  actionsEl.appendChild(timelineBtn);

  // Admin delete
  if (currentUser && currentUser.username === 'admin') {
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn td-btn-delete';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      closeTicketDetailModal();
      openConfirmActionDialog({
        title: 'Delete Request',
        message: `Delete ${req.ticket_number} and all of its history? This cannot be undone.`,
        confirmText: 'Confirm Delete',
        confirmClass: 'danger',
        action: () => deleteTicket(req.ticket_number),
      });
    });
    actionsEl.appendChild(delBtn);
  }

  modal.classList.remove('hidden');
}

function closeTicketDetailModal() {
  document.getElementById('ticket-detail-modal').classList.add('hidden');
  detailModalReq = null;
}

function getTimeInStage(updatedAt) {
  const now = Date.now();
  const updated = new Date(updatedAt).getTime();
  if (isNaN(updated)) return { label: '', badgeClass: 'td-stage-badge' };

  const diffHours = (now - updated) / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  let label, badgeClass = 'td-stage-badge';
  if (diffDays >= 7) {
    label = `${Math.floor(diffDays)}d in stage`;
    badgeClass = 'td-stage-badge critical';
  } else if (diffDays >= 2) {
    label = `${Math.floor(diffDays)}d in stage`;
    badgeClass = 'td-stage-badge warning';
  } else if (diffHours >= 1) {
    label = `${Math.floor(diffHours)}h in stage`;
  } else {
    label = `< 1h in stage`;
  }

  return { label, badgeClass };
}

// ── Chart ────────────────────────────────────────────────────

function renderChart() {
  const counts = PIPELINE_STATUSES.map(s =>
    allRequests.filter(r => r.current_status === s).length
  );
  const cancelledCount = allRequests.filter(r => r.current_status === 'Cancelled').length;

  const labels = [...PIPELINE_STATUSES];
  const data = [...counts];
  const colors = [...STATUS_COLORS];

  if (cancelledCount > 0) {
    labels.push('Cancelled');
    data.push(cancelledCount);
    colors.push(CANCELLED_COLOR);
  }

  const ctx = document.getElementById('pipeline-chart');
  if (!ctx) return;

  if (pipelineChart) {
    pipelineChart.data.labels = labels;
    pipelineChart.data.datasets[0].data = data;
    pipelineChart.data.datasets[0].backgroundColor = colors;
    pipelineChart.update();
  } else {
    if (typeof Chart === 'undefined') return;
    if (typeof ChartDataLabels !== 'undefined') {
      Chart.register(ChartDataLabels);
    }
    pipelineChart = new Chart(ctx.getContext('2d'), {
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
            font: { weight: 'bold', size: 11 },
            formatter: val => val > 0 ? val : ''
          }
        }
      }
    });
  }

  // Render legend
  const legendEl = document.getElementById('pipeline-chart-legend');
  legendEl.innerHTML = '';
  labels.forEach((label, i) => {
    if (data[i] > 0) {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <div class="legend-swatch" style="background:${colors[i]}"></div>
        <span class="legend-label">${escHtml(label)}</span>
        <span class="legend-count">(${data[i]})</span>
      `;
      legendEl.appendChild(item);
    }
  });
}

// ── Actions ──────────────────────────────────────────────────

async function advanceTicket(ticketNumber, targetStatus, notes) {
  const req = allRequests.find(r => r.ticket_number === ticketNumber);
  if (!req) return;
  const currentIdx = PIPELINE_STATUSES.indexOf(req.current_status);
  const nextStatus = targetStatus || PIPELINE_STATUSES[currentIdx + 1];
  if (!nextStatus) return;

  try {
    await apiCall('PUT', `/pipeline/${ticketNumber}/advance`, notes ? { target_status: nextStatus, notes } : { target_status: nextStatus });
    showToast(`${ticketNumber} moved to ${nextStatus}`);
    await loadPipelineData();
  } catch (err) {
    showToast(err.message || 'Failed to advance');
  }
}

async function cancelTicket(ticketNumber) {
  try {
    await apiCall('PUT', `/pipeline/${ticketNumber}/cancel`, {});
    showToast(`${ticketNumber} cancelled`);
    await loadPipelineData();
  } catch (err) {
    showToast(err.message || 'Failed to cancel');
  }
}

async function deleteTicket(ticketNumber) {
  try {
    await apiCall('DELETE', `/pipeline/${ticketNumber}`);
    showToast(`${ticketNumber} deleted`);
    await loadPipelineData();
  } catch (err) {
    showToast(err.message || 'Failed to delete');
  }
}

function openInventoryHandoff(ticketNumber) {
  openSerialActionDialog(ticketNumber);
}

function openJiraActionDialog(ticketNumber, nextStage) {
  const dialog = document.getElementById('jira-action-dialog');
  const input = document.getElementById('jira-action-input');
  jiraActionContext = { ticketNumber, nextStage };
  const req = allRequests.find(r => r.ticket_number === ticketNumber) || {};
  const existingJira = req.jira_ticket || '';
  const isAdminAccount = currentUser && (currentUser.username === 'admin' || currentUser.role === 'admin');
  input.value = existingJira;
  if (existingJira && !isAdminAccount) {
    input.disabled = true;
    input.readOnly = true;
    input.title = 'Only admin main account can edit ticket numbers once created';
  } else {
    input.disabled = false;
    input.readOnly = false;
    input.title = '';
  }
  dialog.classList.remove('hidden');
  setTimeout(() => input.focus(), 0);
}

function openSerialActionDialog(ticketNumber, nextStage) {
  const dialog = document.getElementById('serial-action-dialog');
  const req = allRequests.find(r => r.ticket_number === ticketNumber) || {};
  const summary = document.getElementById('serial-action-summary');
  const ticketInput = document.getElementById('serial-action-ticket');
  const serialInput = document.getElementById('serial-action-serial');
  const serialContainer = document.getElementById('serial-action-serial-container');
  const departmentInput = document.getElementById('serial-action-department');
  const receivedByInput = document.getElementById('serial-action-received-by');

  serialActionContext = { ticketNumber, nextStage, req };
  if (summary) {
    summary.innerHTML = `
      <strong>${escHtml(req.ticket_number || ticketNumber)}</strong> · ${escHtml(req.device_model || 'Device')}${req.requested_by ? ` · ${escHtml(req.requested_by)}` : ''}${req.assigned_to ? ` · ${escHtml(req.assigned_to)}` : ''}
    `;
  }
  const isAdminAccount = currentUser && (currentUser.username === 'admin' || currentUser.role === 'admin');
  if (ticketInput) {
    ticketInput.value = req.jira_ticket || req.ticket_number || ticketNumber || '';
    ticketInput.disabled = !isAdminAccount;
    ticketInput.readOnly = !isAdminAccount;
    if (!isAdminAccount) {
      ticketInput.title = 'Only admin main account can edit ticket numbers once created';
    } else {
      ticketInput.title = '';
    }
  }

  // Adaptive UI: check category of incoming device_model
  const model = modelCatalog.find(m => (m.name || '').toLowerCase() === String(req.device_model || '').toLowerCase());
  const category = (model && model.category) ? model.category : (req.device_model_category || req.category || 'Other');
  const isNonSerialized = isNonSerializedItem(category, req.device_model);

  if (serialContainer && serialInput) {
    if (isNonSerialized) {
      serialContainer.classList.add('hidden');
      serialInput.required = false;
      serialInput.value = 'N/A';
    } else {
      serialContainer.classList.remove('hidden');
      serialInput.required = true;
      serialInput.value = '';
    }
  } else if (serialInput) {
    serialInput.value = isNonSerialized ? 'N/A' : '';
    serialInput.required = !isNonSerialized;
  }

  if (departmentInput) {
    departmentInput.value = currentUser && currentUser.department ? currentUser.department : '';
  }
  if (receivedByInput) {
    receivedByInput.value = req.requested_by || req.assigned_to || '';
  }
  dialog.classList.remove('hidden');
  setTimeout(() => (isNonSerialized ? (ticketInput || departmentInput || receivedByInput) : (serialInput || ticketInput || departmentInput || receivedByInput))?.focus?.(), 0);
}

async function submitSerialAction(mode) {
  const serialInput = document.getElementById('serial-action-serial');
  const ticketInput = document.getElementById('serial-action-ticket');
  const departmentInput = document.getElementById('serial-action-department');
  const receivedByInput = document.getElementById('serial-action-received-by');
  const serialContainer = document.getElementById('serial-action-serial-container');

  const isSerialHidden = serialContainer ? serialContainer.classList.contains('hidden') : false;
  const isNAPattern = ['N/A', 'NA', 'NONE', 'N / A'].includes(String(serialInput?.value || '').trim().toUpperCase());
  const serial = (isSerialHidden || isNAPattern) ? 'N/A' : (serialInput?.value || '').trim();
  const ticketNumber = (ticketInput?.value || '').trim();
  let department = (departmentInput?.value || '').trim();
  const receivedBy = (receivedByInput?.value || '').trim();

  // Bypass serial number required validation specifically for hidden scenarios or N/A items
  if (!isSerialHidden && !serial && !isNAPattern) {
    showToast('Serial number is required');
    serialInput?.focus();
    return;
  }
  if (!ticketNumber) {
    showToast('Ticket number is required');
    ticketInput?.focus();
    return;
  }
  if (!department) {
    department = currentUser?.department || 'IT';
  }
  if (mode === 'device' && !receivedBy) {
    showToast('Person receiving device is required');
    receivedByInput?.focus();
    return;
  }

  const context = serialActionContext || {};
  const req = context.req || allRequests.find(r => r.ticket_number === context.ticketNumber) || {};
  let model = modelCatalog.find(m => (m.name || '').toLowerCase() === String(req.device_model || '').toLowerCase());
  if (!model) {
    await loadModelsForSelect();
    model = modelCatalog.find(m => (m.name || '').toLowerCase() === String(req.device_model || '').toLowerCase());
  }
  if (!model && req.device_model) {
    const newModel = {
      id: uid(),
      name: req.device_model.trim(),
      category: req.device_model_category || req.category || 'Other',
      notes: ''
    };
    try {
      await apiCall('POST', '/models', newModel);
      modelCatalog.push(newModel);
      model = newModel;
    } catch (e) {
      console.warn('Could not auto-create model:', e);
    }
  }
  if (!model) {
    showToast('Could not resolve the device model for this request');
    return;
  }

  const cleanSerial = serial.trim() || 'N/A';
  const cleanTicket = ticketNumber.trim();
  const now = new Date().toISOString();

  try {
    const isNA = ['N/A', 'NA', 'NONE', 'N / A'].includes(cleanSerial.toUpperCase());
    const existing = !isNA && state.devices.find(
      d => d.modelId === model.id && d.serial.toLowerCase() === cleanSerial.toLowerCase() && d.status === 'in'
    );
    if (mode === 'stock' && existing) {
      showToast('This serial is already in stock for this model.');
      return;
    }

    const payload = {
      id: uid(),
      modelId: model.id,
      serial: cleanSerial,
      prNumber: cleanTicket,
      status: mode === 'device' ? 'out' : 'in',
      department,
      addedBy: currentUser ? currentUser.username : '',
      receivedBy: mode === 'device' ? receivedBy : null,
      createdAt: now,
    };

    await apiCall('POST', '/devices', payload);
    state.devices.push({
      id: payload.id,
      modelId: payload.modelId,
      serial: payload.serial,
      prNumber: payload.prNumber,
      status: payload.status,
      department: payload.department,
      addedBy: payload.addedBy,
      receivedBy: payload.receivedBy,
      createdAt: payload.createdAt,
      removedAt: null,
      reason: '',
      destination: '',
    });

    showToast(mode === 'device' ? 'Device added.' : 'Serial added to stock.');
    closeSerialActionDialog();
    if (mode === 'device' && context.nextStage === 'Final Delivery') {
      await advanceTicket(context.ticketNumber, context.nextStage);
    } else {
      await loadPipelineData();
    }
  } catch (err) {
    showToast(err.message || 'Failed to save serial');
  }
}

function closeSerialActionDialog() {
  const dialog = document.getElementById('serial-action-dialog');
  dialog.classList.add('hidden');
  serialActionContext = null;
}

function closeJiraActionDialog() {
  const dialog = document.getElementById('jira-action-dialog');
  dialog.classList.add('hidden');
  jiraActionContext = null;
}

async function submitJiraAction() {
  const input = document.getElementById('jira-action-input');
  const jiraId = input.value.trim();
  if (!jiraId) {
    showToast('Jira ID is required to continue');
    input.focus();
    return;
  }

  if (!jiraActionContext) {
    closeJiraActionDialog();
    return;
  }

  const { ticketNumber, nextStage } = jiraActionContext;
  await advanceTicket(ticketNumber, nextStage, `Jira ID: ${jiraId}`);
  closeJiraActionDialog();
}

function renderCategorySelect() {
  const select = document.getElementById('req-device-category');
  if (!select) return;

  const allCategories = [...new Set([
    ...STANDARD_MODEL_CATEGORIES,
    ...modelCategories,
  ])].filter(Boolean);

  select.innerHTML = '<option value="">Select a category…</option>';
  allCategories.forEach(category => {
    const opt = document.createElement('option');
    opt.value = category;
    opt.textContent = category;
    select.appendChild(opt);
  });
}

function handleCategoryChange() {
  renderModelSelect();
}

function renderModelSelect() {
  const categorySelect = document.getElementById('req-device-category');
  const modelSelect = document.getElementById('req-device-model');
  const customWrap = document.getElementById('req-device-model-custom-wrap');
  const customInput = document.getElementById('req-device-model-custom');
  if (!categorySelect || !modelSelect || !customWrap || !customInput) return;

  const category = categorySelect.value;
  const modelsInCategory = category
    ? modelCatalog.filter(model => (model.category || 'Other') === category)
    : [];

  modelSelect.innerHTML = category
    ? '<option value="">Select a model…</option>'
    : '<option value="">Select a category first…</option>';
  modelSelect.disabled = !category;

  modelsInCategory
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(model => {
      const opt = document.createElement('option');
      opt.value = model.id;
      opt.textContent = model.name;
      modelSelect.appendChild(opt);
    });

  const customOpt = document.createElement('option');
  customOpt.value = CUSTOM_MODEL_VALUE;
  customOpt.textContent = '+ Add Unlisted Item';
  modelSelect.appendChild(customOpt);

  customWrap.classList.add('hidden');
  customInput.value = '';
  customInput.required = false;
}

function toggleCustomModelField() {
  const select = document.getElementById('req-device-model');
  const customWrap = document.getElementById('req-device-model-custom-wrap');
  const customInput = document.getElementById('req-device-model-custom');
  if (!select || !customWrap || !customInput) return;

  const isCustom = select.value === CUSTOM_MODEL_VALUE;
  customWrap.classList.toggle('hidden', !isCustom);
  customInput.required = isCustom;
  if (!isCustom) customInput.value = '';
}

function resetNewRequestSelections() {
  const categorySelect = document.getElementById('req-device-category');
  const modelSelect = document.getElementById('req-device-model');
  if (categorySelect) categorySelect.value = '';
  if (modelSelect) {
    modelSelect.value = '';
    modelSelect.innerHTML = '<option value="">Select a category first…</option>';
    modelSelect.disabled = true;
  }
  toggleCustomModelField();
}

function openConfirmActionDialog({ title, message, confirmText, confirmClass, action }) {
  const dialog = document.getElementById('confirm-action-dialog');
  const titleEl = document.getElementById('confirm-action-title');
  const messageEl = document.getElementById('confirm-action-message');
  const confirmBtn = document.getElementById('btn-confirm-action');

  confirmAction = typeof action === 'function' ? action : null;
  titleEl.textContent = title;
  messageEl.textContent = message;
  confirmBtn.textContent = confirmText;
  confirmBtn.className = `btn ${confirmClass === 'danger' ? 'danger' : 'primary'}`;
  dialog.classList.remove('hidden');
}

function closeConfirmActionDialog() {
  const dialog = document.getElementById('confirm-action-dialog');
  dialog.classList.add('hidden');
  confirmAction = null;
}

async function runConfirmAction() {
  const action = confirmAction;
  if (!action) {
    closeConfirmActionDialog();
    return;
  }

  try {
    await action();
  } finally {
    closeConfirmActionDialog();
  }
}

async function handleNewRequest(e) {
  e.preventDefault();
  const category = document.getElementById('req-device-category').value.trim();
  const select = document.getElementById('req-device-model');
  const deviceModelId = select.value.trim();
  const customModelInput = document.getElementById('req-device-model-custom');
  const requestedBy = document.getElementById('req-requested-by').value.trim();
  const assignedTo = document.getElementById('req-assigned-to').value.trim();
  const notes = document.getElementById('req-notes').value.trim();
  const jiraTicket = document.getElementById('req-jira-ticket').value.trim().toUpperCase();

  if (!category) {
    showToast('Please select a category');
    return;
  }

  if (!jiraTicket) {
    showToast('Please enter the Jira / ticket number');
    return;
  }

  if (!deviceModelId) {
    showToast('Please select a device model');
    return;
  }

  const isCustom = deviceModelId === CUSTOM_MODEL_VALUE;
  const customModelName = isCustom ? customModelInput.value.trim() : '';
  if (isCustom && !customModelName) {
    showToast('Please enter a custom item name');
    customModelInput.focus();
    return;
  }

  try {
    const result = await apiCall('POST', '/pipeline', {
      device_model_id: isCustom ? null : deviceModelId,
      device_model_custom: isCustom ? customModelName : null,
      device_model_category: category,
      jira_ticket: jiraTicket,
      requested_by: requestedBy || null,
      assigned_to: assignedTo || null,
      notes: notes || null,
    });
    showToast(`Created ${result.ticket_number}`);
    document.getElementById('new-request-dialog').classList.add('hidden');
    document.getElementById('new-request-form').reset();
    toggleCustomModelField();
    resetNewRequestSelections();
    await loadPipelineData();
  } catch (err) {
    showToast(err.message || 'Failed to create request');
  }
}

// ── Timeline Detail ──────────────────────────────────────────

async function showTimeline(ticketNumber) {
  try {
    const data = await apiCall('GET', `/pipeline/${ticketNumber}`);
    const panel = document.getElementById('timeline-panel');
    const title = document.getElementById('timeline-title');
    const list = document.getElementById('timeline-list');

    title.textContent = `${data.request.ticket_number} — ${data.request.device_model}`;

    list.innerHTML = data.history.map(h => `
      <li class="timeline-item">
        <div class="timeline-dot${h.status_name === 'Cancelled' ? ' cancelled' : ''}"></div>
        <div class="timeline-content">
          <div class="timeline-status">${escHtml(h.status_name)}</div>
          <div class="timeline-meta">
            ${formatDateTime(h.timestamp)}
            ${h.handled_by ? ` · ${escHtml(h.handled_by)}` : ''}
            ${h.notes ? ` · ${escHtml(h.notes)}` : ''}
          </div>
        </div>
      </li>
    `).join('');

    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showToast('Failed to load timeline');
  }
}
