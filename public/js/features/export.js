// ============================================================
// features/export.js — JSON export and import
// Depends on: state.js, utils.js
// ============================================================

/** Download the current inventory as a JSON backup file. */
function exportData() {
  const blob = new Blob(
    [JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        data: { models: state.models, devices: state.devices, phones: state.phones, history: state.history },
      },
      null,
      2
    )],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = 'rack-inventory-backup.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import inventory from a JSON backup file selected by the user.
 * Replaces local state; does NOT persist to the backend.
 * @param {File} file
 */
function importDataFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed  = JSON.parse(event.target.result);
      const payload = parsed.data || parsed;
      if (
        !payload ||
        !Array.isArray(payload.models)  ||
        !Array.isArray(payload.devices) ||
        !Array.isArray(payload.phones)   ||
        !Array.isArray(payload.history)
      ) {
        showToast('Invalid backup file.');
        return;
      }
      state.models  = payload.models;
      state.devices = payload.devices;
      state.phones  = payload.phones;
      state.history = payload.history;
      renderAll();
      showToast('Inventory imported.');
    } catch (e) {
      console.error('Import error', e);
      showToast('Failed to import file.');
    }
  };
  reader.readAsText(file);
}
