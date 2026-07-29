'use strict';

const STATUSES = [
  'First Requirement',
  'Cotizacion',
  'Wait on Approval',
  'On Transit',
  'In Warehouse',
  'On Preparation',
  'Device is Ready',
  'Worker has the Device'
];

let allTickets = [];

document.addEventListener('DOMContentLoaded', async () => {
  await window.authPromise; // wait for auth check
  initKanbanBoard();
  attachEventListeners();
  loadDeviceModels();
  loadTickets();
});

function initKanbanBoard() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = '';
  
  STATUSES.forEach(status => {
    const col = document.createElement('div');
    col.className = 'kanban-column';
    col.dataset.status = status;
    
    col.innerHTML = `
      <h3>${status} <span class="ticket-count">0</span></h3>
      <div class="kanban-cards" data-status="${status}"></div>
    `;
    
    // Drag and drop events for column
    col.addEventListener('dragover', e => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    
    col.addEventListener('dragleave', e => {
      col.classList.remove('drag-over');
    });
    
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      
      const ticketId = e.dataTransfer.getData('text/plain');
      const newStatus = status;
      
      const ticket = allTickets.find(t => t.id === ticketId);
      if (ticket && ticket.status !== newStatus) {
        // Move in UI optimistically
        ticket.status = newStatus;
        renderTickets();
        
        // Save to backend
        try {
          await api.put(`/api/tickets/${ticketId}/status`, { status: newStatus });
          showToast(`Moved to ${newStatus}`);
        } catch (err) {
          console.error(err);
          showToast('Failed to update status', 'error');
          // Revert on failure
          loadTickets();
        }
      }
    });
    
    board.appendChild(col);
  });
}

function attachEventListeners() {
  document.getElementById('btn-new-ticket').addEventListener('click', () => {
    document.getElementById('new-ticket-dialog').classList.remove('hidden');
    document.getElementById('ticket-title').focus();
  });
  
  document.getElementById('btn-cancel-ticket').addEventListener('click', () => {
    document.getElementById('new-ticket-dialog').classList.add('hidden');
    document.getElementById('new-ticket-form').reset();
  });
  
  document.getElementById('new-ticket-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('ticket-title').value.trim();
    const requester = document.getElementById('ticket-requester').value.trim();
    const notes = document.getElementById('ticket-notes').value.trim();
    
    try {
      await api.post('/api/tickets', { title, requester, notes });
      showToast('Ticket created successfully');
      document.getElementById('new-ticket-dialog').classList.add('hidden');
      document.getElementById('new-ticket-form').reset();
      loadTickets();
    } catch (err) {
      console.error(err);
      showToast('Failed to create ticket', 'error');
    }
  });
}

async function loadDeviceModels() {
  try {
    const models = await api.get('/api/models');
    const select = document.getElementById('ticket-title');
    select.innerHTML = '<option value="">Select a device model...</option>';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load device models:', err);
    showToast('Failed to load device models', 'error');
  }
}

async function loadTickets() {
  try {
    const res = await api.get('/api/tickets');
    allTickets = res;
    renderTickets();
  } catch (err) {
    console.error(err);
    showToast('Failed to load tickets', 'error');
  }
}

function renderTickets() {
  // Clear all cards
  document.querySelectorAll('.kanban-cards').forEach(container => {
    container.innerHTML = '';
  });
  
  // Reset counts
  document.querySelectorAll('.ticket-count').forEach(span => {
    span.textContent = '0';
  });
  
  allTickets.forEach(ticket => {
    const container = document.querySelector(`.kanban-cards[data-status="${ticket.status}"]`);
    if (container) {
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.draggable = true;
      
      const date = new Date(ticket.createdAt).toLocaleDateString();
      
      card.innerHTML = `
        <h4 class="kanban-card-title">${escHtml(ticket.title)}</h4>
        ${ticket.requester ? `<div class="kanban-card-meta">👤 ${escHtml(ticket.requester)}</div>` : ''}
        <div class="kanban-card-meta">📅 ${date}</div>
        <div class="kanban-card-actions">
          <button type="button" class="btn ghost danger" onclick="deleteTicket('${ticket.id}')">Delete</button>
        </div>
      `;
      
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', ticket.id);
        setTimeout(() => card.style.opacity = '0.5', 0);
      });
      
      card.addEventListener('dragend', e => {
        card.style.opacity = '1';
      });
      
      container.appendChild(card);
    }
  });
  
  // Update counts
  STATUSES.forEach(status => {
    const colCount = document.querySelector(`.kanban-column[data-status="${status}"] .ticket-count`);
    const count = allTickets.filter(t => t.status === status).length;
    if (colCount) {
      colCount.textContent = count;
    }
  });
  
  renderChart();
}

function renderChart() {
  const counts = STATUSES.map(status => allTickets.filter(t => t.status === status).length);
  const colors = [
    '#3498db', // First Requirement
    '#f1c40f', // Cotizacion
    '#e67e22', // Wait on Approval
    '#9b59b6', // On Transit
    '#34495e', // In Warehouse
    '#e74c3c', // On Preparation
    '#2ecc71', // Device is Ready
    '#1abc9c'  // Worker has the Device
  ];

  const ctx = document.getElementById('tickets-pie-chart').getContext('2d');
  
  if (window.ticketsChart) {
    window.ticketsChart.data.datasets[0].data = counts;
    window.ticketsChart.update();
  } else {
    // Check if Chart is loaded, since script is deferred it should be ready, but just in case:
    if (typeof Chart === 'undefined') return;
    
    // Register datalabels if available globally
    if (typeof ChartDataLabels !== 'undefined') {
      Chart.register(ChartDataLabels);
    }
    
    window.ticketsChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: STATUSES,
        datasets: [{
          data: counts,
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
            formatter: (val) => val > 0 ? val : ''
          }
        }
      }
    });
  }
  
  // Render Custom Legend
  const legendContainer = document.getElementById('tickets-chart-legend');
  legendContainer.innerHTML = '';
  STATUSES.forEach((status, i) => {
    if (counts[i] > 0) {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.innerHTML = `
        <div style="width: 16px; height: 16px; border-radius: 4px; background-color: ${colors[i]}"></div>
        <span style="font-weight: 500; color: var(--text-main);">${status}</span>
        <span style="color: var(--text-muted); font-size: 0.9em;">(${counts[i]})</span>
      `;
      legendContainer.appendChild(item);
    }
  });
}

window.deleteTicket = async function(id) {
  if (!confirm('Are you sure you want to delete this ticket?')) return;
  try {
    await api.delete(`/api/tickets/${id}`);
    showToast('Ticket deleted');
    loadTickets();
  } catch (err) {
    console.error(err);
    showToast('Failed to delete ticket', 'error');
  }
};
