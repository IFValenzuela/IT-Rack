// ============================================================
// state.js — Application state, state variables, data I/O,
//            and history derivation (rebuildHistory)
// Depends on: config.js, api.js, utils.js
// ============================================================

// ── Current logged-in user (set by ui/auth.js after verify) ──
let currentUser = null;

// ── Core data arrays ─────────────────────────────────────────
const state = {
  models: [],
  devices: [],
  history: [],
  technicians: [],
};

// ── Sort directions ───────────────────────────────────────────
let historySort = 'desc';
let devicesSort = 'desc';
let removedSort  = 'desc';

// ── Filter state ──────────────────────────────────────────────
let devicesRemovedDestFilter = '';
let removedTextFilter        = '';
let removedDeptFilter        = '';
let viewModeIn               = 'all';
let viewModeOut              = 'all';
let devicesCategoryFilter    = '';
let historyCategoryFilter    = '';
let removedCategoryFilter    = '';

// ── Pagination ────────────────────────────────────────────────
// (DEFAULT_LIMIT_* and INCREMENT_* constants live in config.js)
let visibleIn              = DEFAULT_LIMIT_ALL;
let visibleOut             = DEFAULT_LIMIT_ALL;
let previousVisibleIn      = 0;
let previousVisibleOut     = 0;
let visibleHistory         = DEFAULT_LIMIT_HISTORY;
let previousVisibleHistory = 0;

// ── Admin panel state ─────────────────────────────────────────
let adminUsers    = [];
let editingUserId = null;

// ── Models panel state ────────────────────────────────────────
let deleteMode          = false;
let selectedModelIds    = new Set();
let currentCategoryFilter = 'All';
let modelsVisible       = 8;
let currentModelId      = null;
let pendingRemoveDeviceId = null;
let modelHistoryVisible = 10;

// ── Kit (NHK) state ───────────────────────────────────────────
const nhkState = {
  step:           1,
  kitId:          '',
  selectedItems:  [],
  otherItemText:  '',
  otherNoSerial:  false,
  serialInputs:   {},
  prNumber:       '',
  department:     '',
  addedBy:        '',
};

// ── Data loading ──────────────────────────────────────────────

/**
 * Load models, devices, and technicians from the backend.
 * Populates state.models, state.devices, and state.technicians.
 * state.history is derived from devices by rebuildHistory() inside renderAll().
 */
async function loadFromBackend() {
  try {
    const [models, devices, technicians] = await Promise.all([
      apiCall('GET', '/models'),
      apiCall('GET', '/devices'),
      apiCall('GET', '/technicians'),
    ]);

    state.models      = Array.isArray(models)      ? models                        : [];
    state.devices     = Array.isArray(devices)     ? devices                       : [];
    state.technicians = Array.isArray(technicians) ? technicians.map(t => t.name) : [];
    // history is derived — call rebuildHistory() after loadFromBackend()
  } catch (e) {
    console.error('Error loading from backend:', e);
    showToast('Could not load data from server');
  }
}

/**
 * Derive history from the current devices array.
 * Each device contributes an "in" event and, if removed, an "out" event.
 * Result is sorted newest-first and stored in state.history.
 */
function rebuildHistory() {
  const history = [];
  state.devices.forEach(d => {
    history.push({
      id:         d.id + '-in',
      type:       'in',
      at:         d.createdAt,
      modelId:    d.modelId,
      serial:     d.serial,
      prNumber:   d.prNumber,
      department: d.department,
      addedBy:    d.addedBy,
    });
    if (d.status === 'out' && d.removedAt) {
      history.push({
        id:          d.id + '-out',
        type:        'out',
        at:          d.removedAt,
        modelId:     d.modelId,
        serial:      d.serial,
        prNumber:    d.prNumber,
        department:  d.department,
        addedBy:     d.addedBy,
        reason:      d.reason,
        deliveredBy: d.deliveredBy,
        destination: d.destination,
      });
    }
  });
  history.sort((a, b) => new Date(b.at) - new Date(a.at));
  state.history = history;
}

/**
 * Delete all models, devices, and history records (admin only).
 * The technicians list is preserved.
 */
async function clearAllData() {
  if (!confirm(
    'Delete all models, devices, and history? This cannot be undone.\n' +
    'Note: the people list will NOT be cleared.'
  )) return;
  try {
    await apiCall('DELETE', '/admin/clear-all');
    showToast('All data cleared. Fresh start.');
    // Reload the page so all state and renders start fresh from backend.
    setTimeout(() => location.reload(), 800);
  } catch (e) {
    showToast('Error clearing data: ' + e.message);
  }
}
