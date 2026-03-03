// IT Rack Inventory - uses Firebase Firestore for sync across devices

const state = {
  models: [],
  devices: [],
  history: [],
  technicians: [],
};

let historySort = "desc";
let devicesSort = "desc";
let removedSort = "desc";
let devicesRemovedDestFilter = "";
let removedTextFilter = "";
let removedDeptFilter = "";
let viewModeIn = "all"; // 'all' | 'individual' | 'grouped'
let viewModeOut = "all";
let devicesCategoryFilter = "";
let historyCategoryFilter = "";
let removedCategoryFilter = "";
// Show More pagination: 10 for individual/all, 5 for grouped
const DEFAULT_LIMIT_INDIVIDUAL = 10;
const DEFAULT_LIMIT_GROUPED = 5;
const INCREMENT_INDIVIDUAL = 10;
const INCREMENT_GROUPED = 5;
let visibleIn = DEFAULT_LIMIT_INDIVIDUAL;
let visibleOut = DEFAULT_LIMIT_INDIVIDUAL;
let previousVisibleIn = 0;
let previousVisibleOut = 0;
const DEFAULT_LIMIT_HISTORY = 20;
const INCREMENT_HISTORY = 20;
let visibleHistory = DEFAULT_LIMIT_HISTORY;
let previousVisibleHistory = 0;

function uid() {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

async function loadFromFirestore() {
  try {
    const storage = window.__inventoryStorage;
    if (!storage) {
      console.warn("Firebase not ready, using empty state");
      return;
    }
    let parsed = await storage.load();
    // One-time migration from localStorage if Firestore is empty
    if (!parsed && typeof localStorage !== "undefined") {
      const raw = localStorage.getItem("rackInventoryData_v1");
      if (raw) {
        try {
          parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            await storage.save({
              models: parsed.models || [],
              devices: parsed.devices || [],
              history: parsed.history || [],
            });
          }
        } catch (_) { }
      }
    }
    if (parsed && typeof parsed === "object") {
      state.models = Array.isArray(parsed.models) ? parsed.models : [];
      state.devices = Array.isArray(parsed.devices) ? parsed.devices : [];
      state.history = Array.isArray(parsed.history) ? parsed.history : [];
      state.technicians = Array.isArray(parsed.technicians) ? parsed.technicians : [];
    }
  } catch (e) {
    console.error("Error loading inventory from Firestore", e);
  }
}

function subscribeToRealtimeChanges() {
  const storage = window.__inventoryStorage;
  if (!storage || !storage.subscribe) return;
  storage.subscribe((data) => {
    if (data && typeof data === "object") {
      state.models = Array.isArray(data.models) ? data.models : [];
      state.devices = Array.isArray(data.devices) ? data.devices : [];
      state.history = Array.isArray(data.history) ? data.history : [];
      state.technicians = Array.isArray(data.technicians) ? data.technicians : [];
      renderAll();
      populateTechnicianSelect();
    }
  });
}

function writeToFirestore() {
  const storage = window.__inventoryStorage;
  if (!storage) return;
  const payload = {
    models: state.models,
    devices: state.devices,
    history: state.history,
    technicians: state.technicians,
  };
  storage.save(payload).catch((e) => {
    console.error("Error saving inventory to Firestore", e);
    showToast("Could not sync to cloud. Check console.");
  });
}

function clearAllData() {
  if (!confirm("Delete all models, devices, and history? This cannot be undone.\nNote: the people list will NOT be cleared.")) return;
  state.models = [];
  state.devices = [];
  state.history = [];
  writeToFirestore();
  if (typeof localStorage !== "undefined") localStorage.removeItem("rackInventoryData_v1");
  renderAll();
  showToast("All data cleared. Fresh start.");
}

// ---- Technician helpers ----

function populateTechnicianSelect() {
  const sel = document.getElementById("serial-added-by-select");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Select person…</option>';
  state.technicians
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  // Always add the sentinel option at the bottom
  const addOpt = document.createElement("option");
  addOpt.value = "__add_new__";
  addOpt.textContent = "+ Add new person…";
  sel.appendChild(addOpt);
  if (current && state.technicians.includes(current)) sel.value = current;
}

function populateDeliveredBySelect() {
  const sel = document.getElementById("remove-delivered-by-select");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Select person…</option>';
  state.technicians
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  const addOpt = document.createElement("option");
  addOpt.value = "__add_new__";
  addOpt.textContent = "+ Add new person…";
  sel.appendChild(addOpt);
  if (current && state.technicians.includes(current)) sel.value = current;
}

function addTechnician(name) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (state.technicians.includes(trimmed)) {
    showToast("That person is already in the list.");
    return false;
  }
  state.technicians.push(trimmed);
  writeToFirestore();
  populateTechnicianSelect();
  // Auto-select the new person
  const sel = document.getElementById("serial-added-by-select");
  if (sel) sel.value = trimmed;
  showToast(`"${trimmed}" added to the team list.`);
  return true;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.classList.add("hidden"), 200);
  }, 2100);
}

function formatDateTime(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }) +
    " " +
    d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
}

// Returns stock age CSS class and badge label based on how long a device has been in stock
function getStockAgeInfo(createdAtIso) {
  const now = Date.now();
  const added = new Date(createdAtIso).getTime();
  if (Number.isNaN(added)) return { rowClass: "", badge: "" };
  const diffDays = (now - added) / (1000 * 60 * 60 * 24);
  if (diffDays >= 30) {
    return {
      rowClass: "stock-age-critical",
      badge: '<span class="stock-age-badge critical">1+ month</span>',
    };
  }
  if (diffDays >= 14) {
    return {
      rowClass: "stock-age-warning",
      badge: '<span class="stock-age-badge warning">2+ weeks</span>',
    };
  }
  return { rowClass: "", badge: "" };
}

/**
 * Generic pill bar renderer for device-type filtering on Devices and History tabs.
 * Uses the same .pill / .pill-count classes as the Models tab.
 */
function renderFilterPills(containerId, items, getModelId, activeCategory, onSelect) {
  const bar = document.getElementById(containerId);
  if (!bar) return;
  const counts = {};
  CATEGORIES.forEach((cat) => { counts[cat] = 0; });
  items.forEach((item) => {
    const model = state.models.find((m) => m.id === getModelId(item));
    const cat = (model && model.category) ? model.category : "";
    if (Object.prototype.hasOwnProperty.call(counts, cat)) counts[cat]++;
  });
  const pills = [
    { label: "All", value: "", count: items.length },
    ...CATEGORIES.map((cat) => ({ label: cat, value: cat, count: counts[cat] || 0 })),
  ];
  bar.innerHTML =
    `<span class="pill-bar-label">Type:</span>` +
    pills.map(({ label, value, count }) => {
      const isActive = value === activeCategory;
      const isEmpty = value !== "" && count === 0;
      return `<button type="button" class="pill${isActive ? " active" : ""}${isEmpty ? " empty" : ""}" data-cat="${value}">${label} <span class="pill-count">${count}</span></button>`;
    }).join("");
  bar.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", () => onSelect(btn.dataset.cat));
  });
}

function getCategoryBadge(category) {
  if (!category) return "";
  return `<span class="category-badge" title="${category}"><span class="cb-label">${category}</span></span>`;
}

// ---- Rendering helpers ----

function setEmptyOrTable(container, htmlTable) {
  if (!container) return;
  if (!htmlTable) {
    container.classList.add("empty-state");
    container.innerHTML =
      '<p style="margin:0;font-size:0.8rem;color:#6c7a96;">No data.</p>';
  } else {
    container.classList.remove("empty-state");
    container.innerHTML = htmlTable;
  }
}

function renderDashboard() {
  const totalModels = state.models.length;
  const inStock = state.devices.filter((d) => d.status === "in").length;
  const removed = state.devices.filter((d) => d.status === "out").length;

  document.getElementById("summary-total-models").textContent = totalModels;
  document.getElementById("summary-in-stock").textContent = inStock;
  document.getElementById("summary-removed").textContent = removed;

  const list = document.getElementById("dashboard-models-list");
  if (!list) return;
  if (!state.models.length) {
    list.classList.add("empty-state");
    list.innerHTML = "<p>No models yet. Go to the Models tab to add your first one.</p>";
    return;
  }
  list.classList.remove("empty-state");
  list.innerHTML = "";
  state.models
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((m) => {
      const countIn = state.devices.filter(
        (d) => d.modelId === m.id && d.status === "in"
      ).length;
      const countOut = state.devices.filter(
        (d) => d.modelId === m.id && d.status === "out"
      ).length;

      const card = document.createElement("button");
      card.className = "dash-model-card";
      card.dataset.modelId = m.id;
      card.innerHTML = `
        <div class="dmc-body">
          <div class="dmc-name">${m.name}</div>
          <div class="dmc-counts">
            <span class="dmc-badge in">${countIn} in stock</span>
            <span class="dmc-badge out">${countOut} removed</span>
          </div>
        </div>
        <span class="dmc-arrow">→</span>
      `;
      card.addEventListener("click", () => {
        switchView("models");
        openModelDetail(m.id);
      });
      list.appendChild(card);
    });
}

let deleteMode = false;
let selectedModelIds = new Set();

function updateModelsHeader() {
  const actions = document.getElementById("models-header-actions");
  if (!actions) return;
  const filterEl = document.getElementById("filter-models-input");
  const filterValue = filterEl ? filterEl.value : "";
  const filterHtml = `<input type="text" id="filter-models-input" class="filter-input" placeholder="Search models…" value="${(filterValue || "").replace(/"/g, "&quot;")}" aria-label="Search device models" />`;
  if (deleteMode) {
    actions.innerHTML = `
      ${filterHtml}
      <button class="btn danger" id="btn-confirm-delete-models">Delete Selected</button>
      <button class="btn ghost" id="btn-cancel-delete-mode">Cancel</button>
    `;
    document.getElementById("btn-confirm-delete-models").addEventListener("click", deleteSelectedModels);
    document.getElementById("btn-cancel-delete-mode").addEventListener("click", exitDeleteMode);
  } else {
    actions.innerHTML = `
      ${filterHtml}
      <button class="btn ghost" id="btn-prepare-kit">Prepare Kit</button>
      <button class="btn ghost" id="btn-open-deploy-kit">Remove a Kit</button>
      <button class="btn ghost" id="btn-enter-delete-mode">Delete</button>
      <button class="btn primary" id="btn-open-add-model-dialog">+ New Model</button>
    `;
    document.getElementById("btn-prepare-kit").addEventListener("click", openNewHireKitDialog);
    document.getElementById("btn-open-deploy-kit").addEventListener("click", () => {
      const panel = document.getElementById("kit-deploy-panel");
      if (panel) panel.classList.toggle("hidden");
    });
    document.getElementById("btn-enter-delete-mode").addEventListener("click", enterDeleteMode);
    document.getElementById("btn-open-add-model-dialog").addEventListener("click", openAddModelDialog);
  }
  const newFilter = document.getElementById("filter-models-input");
  if (newFilter) {
    newFilter.addEventListener("input", () => { modelsVisible = 8; renderModelsTable(); });
  }
}

function enterDeleteMode() {
  deleteMode = true;
  selectedModelIds.clear();
  renderModelsTable();
  updateModelsHeader();
}

function exitDeleteMode() {
  deleteMode = false;
  selectedModelIds.clear();
  renderModelsTable();
  updateModelsHeader();
}

function deleteSelectedModels() {
  if (selectedModelIds.size === 0) {
    showToast("Select at least one model to delete.");
    return;
  }
  const count = selectedModelIds.size;
  const names = state.models
    .filter((m) => selectedModelIds.has(m.id))
    .map((m) => `• ${m.name}`)
    .join("\n");
  if (!confirm(`Delete ${count} model${count > 1 ? "s" : ""}?\n${names}\n\nAll their devices and history will also be removed. This cannot be undone.`)) return;

  selectedModelIds.forEach((id) => {
    if (currentModelId === id) closeModelDetail();
    state.models = state.models.filter((m) => m.id !== id);
    state.devices = state.devices.filter((d) => d.modelId !== id);
    state.history = state.history.filter((h) => h.modelId !== id);
  });
  writeToFirestore();
  const deleted = count;
  exitDeleteMode();
  renderAll();
  showToast(`${deleted} model${deleted > 1 ? "s" : ""} deleted.`);
}

let currentCategoryFilter = "All";
let modelsVisible = 8;
const CATEGORIES = ["Laptop", "Desktop PC", "Keyboard", "Cellphone", "Mouse", "Headset", "Dock", "Monitor", "Cable", "Camera", "Printer", "Tablet", "Scanner", "Other"];

const KIT_ACCESSORIES = [
  "Dell 24-Inch Monitor",
  "Dell Optical Wired Mouse",
  "Dell Wired Multi-Media Keyboard",
  "DisplayPort to VGA Converter",
  "DVI-D to DisplayPort Converter",
  "HDMI to VGA Adapter",
  "Laptop Docking Station",
  "Logitech C920 HD Pro Web Camera",
  "USB Headset",
  "Other",
];

const NO_SERIAL_ITEMS = new Set([
  "DisplayPort to VGA Converter",
  "DVI-D to DisplayPort Converter",
  "HDMI to VGA Adapter",
]);

const KIT_ACCESSORY_CATEGORIES = {
  "Dell 24-Inch Monitor":          "Monitor",
  "Dell Optical Wired Mouse":       "Mouse",
  "Dell Wired Multi-Media Keyboard": "Keyboard",
  "DisplayPort to VGA Converter":   "Cable",
  "DVI-D to DisplayPort Converter": "Cable",
  "HDMI to VGA Adapter":            "Cable",
  "Laptop Docking Station":         "Dock",
  "Logitech C920 HD Pro Web Camera": "Camera",
  "USB Headset":                    "Headset",
  "Other":                          "Other",
};

function renderCategoryPills() {
  const container = document.getElementById("category-pills-container");
  if (!container) return;
  if (!state.models.length) {
    container.innerHTML = "";
    return;
  }

  const counts = { All: state.models.length };
  CATEGORIES.forEach(c => counts[c] = 0);
  state.models.forEach(m => {
    if (m.category && counts[m.category] !== undefined) {
      counts[m.category]++;
    }
  });

  const pills = ["All", ...CATEGORIES].map(cat => {
    const isActive = currentCategoryFilter === cat;
    const count = counts[cat] || 0;
    return `
      <button class="pill ${isActive ? 'active' : ''}" data-category="${cat}">
        ${cat} <span class="pill-count">${count}</span>
      </button>
    `;
  }).join("");

  container.innerHTML = pills;

  container.querySelectorAll(".pill").forEach(btn => {
    btn.addEventListener("click", () => {
      currentCategoryFilter = btn.dataset.category;
      modelsVisible = 8;
      renderModelsTable();
      renderCategoryPills(); // Update active state
    });
  });
}

function renderModelsTable() {
  renderCategoryPills();
  const container = document.getElementById("models-table-container");
  if (!container) return;
  if (!state.models.length) {
    container.classList.add("empty-state");
    container.innerHTML = "<p>No models yet. Use New Models to create one.</p>";
    return;
  }
  const filterEl = document.getElementById("filter-models-input");
  const filter = filterEl ? filterEl.value.trim().toLowerCase() : "";
  let modelsToShow = state.models.slice();

  if (currentCategoryFilter !== "All") {
    modelsToShow = modelsToShow.filter(m => m.category === currentCategoryFilter);
  }

  if (filter) {
    modelsToShow = modelsToShow.filter(
      (m) =>
        (m.name || "").toLowerCase().includes(filter) ||
        (m.category || "").toLowerCase().includes(filter)
    );
  }
  if (!modelsToShow.length) {
    container.classList.remove("empty-state");
    container.innerHTML = "<p>No models match your search.</p>";
    return;
  }
  container.classList.remove("empty-state");
  const sortedModels = modelsToShow.slice().sort((a, b) => a.name.localeCompare(b.name));
  const totalModels = sortedModels.length;
  const visibleModels = Math.min(modelsVisible, totalModels);
  const rows = sortedModels
    .slice(0, visibleModels)
    .map((m) => {
      const inCount = state.devices.filter(
        (d) => d.modelId === m.id && d.status === "in"
      ).length;
      const outCount = state.devices.filter(
        (d) => d.modelId === m.id && d.status === "out"
      ).length;
      const checkCell = deleteMode
        ? `<td style="width:36px;padding:7px 10px;"><input type="checkbox" class="js-model-checkbox" data-model-id="${m.id}" ${selectedModelIds.has(m.id) ? "checked" : ""} style="width:16px;height:16px;cursor:pointer;" /></td>`
        : "";
      return `
        <tr data-model-id="${m.id}" class="js-row-model${deleteMode ? " row-selectable" : ""}">
          ${checkCell}
          <td>${m.name} ${getCategoryBadge(m.category)}</td>
          <td>${inCount}</td>
          <td>${outCount}</td>
          <td>${formatDateTime(m.createdAt)}</td>
        </tr>
      `;
    })
    .join("");
  const checkHeader = deleteMode ? "<th></th>" : "";
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          ${checkHeader}
          <th>Model</th>
          <th>In stock</th>
          <th>Removed</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${totalModels > visibleModels ? `<div style="text-align:center;margin-top:10px;"><button type="button" class="btn ghost" id="btn-models-show-more">Show More</button></div>` : ""}
  `;

  const showMoreBtn = container.querySelector("#btn-models-show-more");
  if (showMoreBtn) {
    showMoreBtn.addEventListener("click", () => {
      modelsVisible += 8;
      renderModelsTable();
    });
  }

  container.querySelectorAll(".js-row-model").forEach((row) => {
    if (deleteMode) {
      // Clicking the row toggles the checkbox
      row.addEventListener("click", (e) => {
        const cb = row.querySelector(".js-model-checkbox");
        if (!cb) return;
        if (e.target === cb) return; // checkbox handles itself
        cb.checked = !cb.checked;
        const id = row.getAttribute("data-model-id");
        if (cb.checked) selectedModelIds.add(id);
        else selectedModelIds.delete(id);
      });
      const cb = row.querySelector(".js-model-checkbox");
      if (cb) {
        cb.addEventListener("change", () => {
          const id = row.getAttribute("data-model-id");
          if (cb.checked) selectedModelIds.add(id);
          else selectedModelIds.delete(id);
        });
      }
    } else {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-model-id");
        openModelDetail(id);
      });
    }
  });
}

let currentModelId = null;
let pendingRemoveDeviceId = null;
let modelHistoryVisible = 10;

function openModelDetail(modelId) {
  // ensure Models view is visible when opening detail
  switchView("models");
  const model = state.models.find((m) => m.id === modelId);
  if (!model) return;
  currentModelId = modelId;

  const detailSection = document.getElementById("model-detail");
  detailSection.classList.remove("hidden");

  document.getElementById("model-detail-title").textContent = model.name;
  document.getElementById("model-detail-subtitle").textContent =
    model.notes || "Manage serial numbers and deliveries for this model.";

  const inCount = state.devices.filter(
    (d) => d.modelId === model.id && d.status === "in"
  ).length;
  const outCount = state.devices.filter(
    (d) => d.modelId === model.id && d.status === "out"
  ).length;
  document.getElementById(
    "model-detail-counts"
  ).textContent = `${inCount} in stock - ${outCount} removed`;

  renderModelSerialsTable(model.id);
  modelHistoryVisible = 10;
  renderModelHistoryTable(model.id);
}

function closeModelDetail() {
  currentModelId = null;
  document.getElementById("model-detail").classList.add("hidden");
}

function renderModelSerialsTable(modelId) {
  const container = document.getElementById(
    "model-serials-table-container"
  );
  if (!container) return;
  const serials = state.devices.filter(
    (d) => d.modelId === modelId && d.status === "in"
  );
  if (!serials.length) {
    container.classList.add("empty-state");
    container.innerHTML = "<p>No serials yet for this model.</p>";
    return;
  }
  container.classList.remove("empty-state");
  const rows = serials
    .slice()
    .sort((a, b) => a.serial.localeCompare(b.serial))
    .map((d) => {
      const { rowClass, badge } = getStockAgeInfo(d.createdAt);
      return `
        <tr data-device-id="${d.id}" class="${rowClass}">
          <td>${d.serial}</td>
          <td>${d.prNumber || ""}</td>
          <td>${d.department || ""}</td>
          <td>${d.addedBy || ""}</td>
          <td>${formatDateTime(d.createdAt)}${badge}</td>
          <td style="text-align:right;">
            <button class="btn ghost js-remove-serial" type="button">
              Remove from stock
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Serial</th>
          <th>PR / Ticket</th>
          <th>Department</th>
          <th>Added by</th>
          <th>Added</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  container.querySelectorAll(".js-remove-serial").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest("tr");
      const id = row.getAttribute("data-device-id");
      openRemoveSerialDialog(id);
    });
  });
}

function renderModelHistoryTable(modelId) {
  const container = document.getElementById("model-history-table-container");
  if (!container) return;
  const entries = state.history
    .filter((h) => h.modelId === modelId)
    .slice()
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  if (!entries.length) {
    container.classList.add("empty-state");
    container.innerHTML =
      "<p>No history yet. Add or remove serials to see activity.</p>";
    return;
  }
  container.classList.remove("empty-state");
  const total = entries.length;
  const visible = Math.min(modelHistoryVisible, total);
  const rows = entries
    .slice(0, visible)
    .map((h) => {
      const statusClass = h.type === "in" ? "status-in" : "status-out";
      const label = h.type === "in" ? "Added" : "Removed";
      const technician = h.addedBy || h.deliveredBy || "";
      const dash = '<span style="color:var(--text-muted)">—</span>';
      const reason = h.reason || (h.type === "in" ? dash : "");
      const destination = h.destination || (h.type === "in" ? dash : "");
      let rowClass = "";
      if (h.type === "in") {
        const device = state.devices.find((d) => d.serial === h.serial && d.modelId === h.modelId && d.status === "in");
        if (device) {
          const info = getStockAgeInfo(device.createdAt);
          rowClass = info.rowClass;
        }
      }
      return `
        <tr class="${rowClass}">
          <td><span class="status-chip ${statusClass}">${label}</span></td>
          <td>${h.serial}</td>
          <td>${h.prNumber || ""}</td>
          <td>${technician}</td>
          <td>${reason}</td>
          <td>${destination}</td>
          <td>${formatDateTime(h.at)}</td>
        </tr>
      `;
    })
    .join("");
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Serial</th>
          <th>PR / Ticket</th>
          <th>Handled by</th>
          <th>Reason</th>
          <th>Destination</th>
          <th>At</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${total > visible ? `<div style="text-align:center;margin-top:10px;"><button type="button" class="btn ghost" id="btn-model-history-show-more">Show More</button></div>` : ""}
  `;

  const showMoreBtn = container.querySelector("#btn-model-history-show-more");
  if (showMoreBtn) {
    showMoreBtn.addEventListener("click", () => {
      modelHistoryVisible += 10;
      renderModelHistoryTable(modelId);
    });
  }
}

/** Returns Set of prNumbers that appear ≥2 times in the device list. */
function getKitIds(devices) {
  const counts = {};
  devices.forEach((d) => { if (d.prNumber) counts[d.prNumber] = (counts[d.prNumber] || 0) + 1; });
  return new Set(Object.keys(counts).filter((k) => counts[k] > 1));
}

function resetDevicesPagination() {
  visibleIn = viewModeIn === "grouped" ? DEFAULT_LIMIT_GROUPED : DEFAULT_LIMIT_INDIVIDUAL;
  visibleOut = viewModeOut === "grouped" ? DEFAULT_LIMIT_GROUPED : DEFAULT_LIMIT_INDIVIDUAL;
  previousVisibleIn = visibleIn;
  previousVisibleOut = visibleOut;
}

function renderDevicesView() {
  const inContainer = document.getElementById("devices-table-container");
  const outContainer = document.getElementById(
    "devices-removed-table-container"
  );
  const deptFilterEl = document.getElementById("filter-department");
  const textFilterEl = document.getElementById("filter-location-owner");
  const deptFilter = deptFilterEl ? deptFilterEl.value : "";
  const textFilter = textFilterEl
    ? textFilterEl.value.trim().toLowerCase()
    : "";

  let inDevices = state.devices.filter((d) => d.status === "in");
  let outDevices = state.devices.filter((d) => d.status === "out");

  // In-stock filters only (main search bar is decoupled from removed table)
  if (deptFilter) {
    inDevices = inDevices.filter((d) => (d.department || "") === deptFilter);
  }
  if (textFilter) {
    inDevices = inDevices.filter((d) => {
      const model = state.models.find((m) => m.id === d.modelId) || {};
      const modelName = (model.name || "").toLowerCase();
      const modelCategory = (model.category || "").toLowerCase();
      return (
        modelName.includes(textFilter) ||
        modelCategory.includes(textFilter) ||
        (d.serial || "").toLowerCase().includes(textFilter) ||
        (d.prNumber || "").toLowerCase().includes(textFilter) ||
        (d.destination || "").toLowerCase().includes(textFilter)
      );
    });
  }

  // Render type pills (counts reflect dept+text filters above)
  renderFilterPills("devices-cat-pills", inDevices, (d) => d.modelId, devicesCategoryFilter, (cat) => {
    devicesCategoryFilter = cat;
    resetDevicesPagination();
    renderDevicesView();
  });

  // Apply category filter
  if (devicesCategoryFilter) {
    inDevices = inDevices.filter((d) => {
      const model = state.models.find((m) => m.id === d.modelId);
      return model && (model.category || "") === devicesCategoryFilter;
    });
  }

  // Removed table — independent filters
  if (removedDeptFilter) {
    outDevices = outDevices.filter((d) => (d.department || "") === removedDeptFilter);
  }
  if (removedTextFilter) {
    outDevices = outDevices.filter((d) => {
      const model = state.models.find((m) => m.id === d.modelId) || {};
      const modelName = (model.name || "").toLowerCase();
      const modelCategory = (model.category || "").toLowerCase();
      return (
        modelName.includes(removedTextFilter) ||
        modelCategory.includes(removedTextFilter) ||
        (d.serial || "").toLowerCase().includes(removedTextFilter) ||
        (d.prNumber || "").toLowerCase().includes(removedTextFilter) ||
        (d.destination || "").toLowerCase().includes(removedTextFilter) ||
        (d.reason || "").toLowerCase().includes(removedTextFilter)
      );
    });
  }

  // Apply destination filter to removed table
  if (devicesRemovedDestFilter) {
    outDevices = outDevices.filter(
      (d) => (d.destination || d.reason || "") === devicesRemovedDestFilter
    );
  }

  // Render type pills for removed section
  renderFilterPills("removed-cat-pills", outDevices, (d) => d.modelId, removedCategoryFilter, (cat) => {
    removedCategoryFilter = cat;
    resetDevicesPagination();
    renderDevicesView();
  });
  // Apply category filter to removed
  if (removedCategoryFilter) {
    outDevices = outDevices.filter((d) => {
      const model = state.models.find((m) => m.id === d.modelId);
      return model && (model.category || "") === removedCategoryFilter;
    });
  }

  // Update toggle button count
  const totalRemoved = state.devices.filter((d) => d.status === "out").length;
  const toggleBtn = document.getElementById("btn-toggle-removed");
  if (toggleBtn) toggleBtn.textContent = `View Removed (${totalRemoved})`;

  // Update archive record count
  const countLabel = document.getElementById("removed-count-label");
  if (countLabel) countLabel.textContent = `${outDevices.length} record${outDevices.length !== 1 ? "s" : ""}`;

  // Refresh stat cards
  renderDashboard();

  // ---- Unified render helper with Show More pagination ----
  const increment = (viewMode) => viewMode === "grouped" ? INCREMENT_GROUPED : INCREMENT_INDIVIDUAL;

  const renderList = (devices, container, isOut, viewMode, sortDir, visibleCount, previousVisibleCount, onShowMore) => {
    const dateField = isOut ? "removedAt" : "createdAt";
    const inc = increment(viewMode);

    if (!devices.length) {
      container.classList.add("empty-state");
      container.innerHTML = `<p>No ${isOut ? "removed" : "in-stock"} devices match the current filters.</p>`;
      return;
    }
    container.classList.remove("empty-state");

    if (viewMode === "all" || viewMode === "individual") {
      // 'individual': only solo devices (not in a kit); 'all': everything
      let listDevices = devices;
      if (viewMode === "individual") {
        const kitIds = getKitIds(devices);
        listDevices = devices.filter(d => !d.prNumber || !kitIds.has(d.prNumber));
      }
      // --- Flat sorted list ---
      const sorted = listDevices.slice().sort((a, b) =>
        sortDir === "desc"
          ? new Date(b[dateField]) - new Date(a[dateField])
          : new Date(a[dateField]) - new Date(b[dateField])
      );
      const total = sorted.length;
      const toShow = sorted.slice(0, visibleCount);
      const rows = toShow.map((d, idx) => {
        const revealClass = idx >= previousVisibleCount ? " row-reveal" : "";
        const model = state.models.find((m) => m.id === d.modelId);
        if (!isOut) {
          const { rowClass, badge } = getStockAgeInfo(d.createdAt);
          return `<tr class="${rowClass}${revealClass} js-in-row" data-device-id="${d.id}" style="cursor:pointer;" title="Click to remove from stock">
            <td>${model ? model.name + ' ' + getCategoryBadge(model.category) : "Unknown model"}</td>
            <td>${d.department || ""}</td><td>${d.serial}</td>
            <td>${d.prNumber || ""}</td><td>${d.addedBy || ""}</td>
            <td>${formatDateTime(d.createdAt)}${badge}</td>
          </tr>`;
        } else {
          return `<tr class="${revealClass}">
            <td>${model ? model.name + ' ' + getCategoryBadge(model.category) : "Unknown model"}</td>
            <td>${d.department || ""}</td><td>${d.serial}</td>
            <td>${d.prNumber || ""}</td><td>${d.deliveredBy || ""}</td>
            <td>${d.reason || ""}</td><td>${d.destination || ""}</td>
            <td>${formatDateTime(d.removedAt)}</td>
          </tr>`;
        }
      }).join("");

      const headIn = `<th>Model</th><th>Department</th><th>Serial</th><th>PR / Ticket</th><th>Added by</th><th>Added</th>`;
      const headOut = `<th>Model</th><th>Department</th><th>Serial</th><th>PR / Ticket</th><th>Delivered by</th><th>Reason</th><th>Destination</th><th>Removed at</th>`;
      const showMoreHtml = total > visibleCount
        ? `<div class="show-more-row"><button type="button" class="btn btn-show-more js-show-more" data-is-out="${isOut}">Show More</button></div>`
        : "";
      container.innerHTML = `<table><thead><tr>${isOut ? headOut : headIn}</tr></thead><tbody>${rows}</tbody></table>${showMoreHtml}`;

      if (!isOut) {
        container.querySelectorAll("tr.js-in-row").forEach((row) => {
          row.addEventListener("click", () => {
            const id = row.dataset.deviceId;
            if (id) openRemoveSerialDialog(id);
          });
        });
      }

      container.querySelectorAll(".js-show-more").forEach((btn) => {
        btn.addEventListener("click", () => onShowMore());
      });

    } else {
      // --- Grouped by Kit (structural cards) ---
      const kitIds = getKitIds(devices);
      const kitDevices = devices.filter(d => d.prNumber && kitIds.has(d.prNumber));

      if (!kitDevices.length) {
        container.innerHTML = `<div class="empty-state" style="padding:32px;"><p>No complete kits found in current filters.<br>Switch to <strong>Individual</strong> to see all devices.</p></div>`;
        return;
      }

      // Build group Map
      const groups = new Map();
      kitDevices.forEach(d => {
        if (!groups.has(d.prNumber)) groups.set(d.prNumber, []);
        groups.get(d.prNumber).push(d);
      });

      // Sort groups by most-recent item in group
      const groupArr = [...groups.entries()].sort((a, b) => {
        const ta = Math.max(...a[1].map(d => +new Date(d[dateField]) || 0));
        const tb = Math.max(...b[1].map(d => +new Date(d[dateField]) || 0));
        return sortDir === "desc" ? tb - ta : ta - tb;
      });

      const total = groupArr.length;
      const toShow = groupArr.slice(0, visibleCount);

      // Number of columns in grouped mode
      const colCount = isOut ? 6 : 5; // grouped removes PR/Ticket col; archive has 6 cols
      const headIn = `<th>Model</th><th>Department</th><th>Serial</th><th>Added by</th><th>Added</th>`;
      const headOut = `<th>Model</th><th>Department</th><th>Serial</th><th>Delivered by</th><th>Reason</th><th>Removed at</th>`;

      const bodyRows = toShow.map(([prId, items], groupIdx) => {
        // Sort items within group
        items.sort((a, b) => sortDir === "desc"
          ? +new Date(b[dateField]) - +new Date(a[dateField])
          : +new Date(a[dateField]) - +new Date(b[dateField]));

        const dest = isOut
          ? (items[0].destination || items[0].reason || "")
          : (items[0].kit_id || items[0].destination || "");

        const itemCount = `${items.length} item${items.length !== 1 ? "s" : ""}`;
        const revealClass = groupIdx >= previousVisibleCount ? " row-reveal" : "";

        // Sub-header: full-span cell, exact format: Ticket / PR: [ID] — Assigned to: [Name] [Count] items
        const assignedTo = dest ? ` &mdash; Assigned to: <strong class="assigned-name">${dest}</strong>` : "";
        const subHeader = `<tr class="kit-sub-header${revealClass}">
            <td colspan="${colCount}" class="kit-ticket-cell">Ticket / PR: <strong>${prId}</strong>${assignedTo} <span class="kit-count">${itemCount}</span></td>
          </tr>`;

        const deviceRows = items.map(d => {
          const model = state.models.find(m => m.id === d.modelId);
          if (!isOut) {
            const { rowClass, badge } = getStockAgeInfo(d.createdAt);
            return `<tr class="${rowClass} kit-device-row js-in-row" data-device-id="${d.id}" style="cursor:pointer;" title="Click to remove from stock">
              <td>${model ? model.name + ' ' + getCategoryBadge(model.category) : "Unknown"}</td>
              <td>${d.department || ""}</td>
              <td><strong>${d.serial}</strong></td>
              <td>${d.addedBy || ""}</td>
              <td>${formatDateTime(d.createdAt)}${badge}</td>
            </tr>`;
          } else {
            return `<tr class="kit-device-row">
              <td>${model ? model.name + ' ' + getCategoryBadge(model.category) : "Unknown"}</td>
              <td>${d.department || ""}</td>
              <td><strong>${d.serial}</strong></td>
              <td>${d.deliveredBy || ""}</td>
              <td>${d.reason || ""}</td>
              <td>${formatDateTime(d.removedAt)}</td>
            </tr>`;
          }
        }).join("");

        // Spacer row between groups (not after last)
        const spacer = groupIdx < toShow.length - 1
          ? `<tr class="kit-spacer"><td colspan="${colCount}"></td></tr>`
          : "";

        return `${subHeader}${deviceRows}${spacer}`;
      }).join("");

      const showMoreHtml = total > visibleCount
        ? `<div class="show-more-row"><button type="button" class="btn btn-show-more js-show-more" data-is-out="${isOut}">Show More</button></div>`
        : "";
      container.innerHTML = `<table><thead><tr>${isOut ? headOut : headIn}</tr></thead><tbody>${bodyRows}</tbody></table>${showMoreHtml}`;

      if (!isOut) {
        container.querySelectorAll("tr.js-in-row").forEach((row) => {
          row.addEventListener("click", () => {
            const id = row.dataset.deviceId;
            if (id) openRemoveSerialDialog(id);
          });
        });
      }

      container.querySelectorAll(".js-show-more").forEach((btn) => {
        btn.addEventListener("click", () => onShowMore());
      });
    }
  };

  renderList(inDevices, inContainer, false, viewModeIn, devicesSort, visibleIn, previousVisibleIn, () => {
    previousVisibleIn = visibleIn;
    visibleIn += increment(viewModeIn);
    renderDevicesView();
  });
  renderList(outDevices, outContainer, true, viewModeOut, removedSort, visibleOut, previousVisibleOut, () => {
    previousVisibleOut = visibleOut;
    visibleOut += increment(viewModeOut);
    renderDevicesView();
  });

  previousVisibleIn = visibleIn;
  previousVisibleOut = visibleOut;
}

function renderHistoryView() {
  const container = document.getElementById("history-table-container");
  if (!container) return;
  if (!state.history.length) {
    container.classList.add("empty-state");
    container.innerHTML =
      "<p>No activity yet. Add or remove devices to see history.</p>";
    return;
  }
  container.classList.remove("empty-state");

  const yearSelectEl = document.getElementById("filter-history-year");
  if (yearSelectEl) {
    const previousYear = yearSelectEl.value;
    const yearsSet = new Set();

    state.history.forEach((h) => {
      const d = new Date(h.at);
      if (!Number.isNaN(d.getTime())) {
        yearsSet.add(d.getFullYear());
      }
    });
    state.models.forEach((m) => {
      const d = new Date(m.createdAt);
      if (!Number.isNaN(d.getTime())) {
        yearsSet.add(d.getFullYear());
      }
    });

    const years = Array.from(yearsSet)
      .filter((y) => y >= 2026)
      .sort((a, b) => b - a);

    let optionsHtml = '<option value="">All years</option>';
    years.forEach((y) => {
      optionsHtml += `<option value="${y}">${y}</option>`;
    });
    yearSelectEl.innerHTML = optionsHtml;

    if (previousYear && years.includes(Number(previousYear))) {
      yearSelectEl.value = previousYear;
    }
  }

  const typeFilterEl = document.getElementById("filter-history-type");
  const yearFilterEl = document.getElementById("filter-history-year");
  const monthFilterEl = document.getElementById("filter-history-month");
  const deviceFilterEl = document.getElementById("filter-history-device");

  const typeFilter = typeFilterEl ? typeFilterEl.value : "";
  const yearFilter = yearFilterEl ? yearFilterEl.value : "";
  const monthFilter = monthFilterEl ? monthFilterEl.value : "";
  const deviceFilter = deviceFilterEl ? deviceFilterEl.value.trim().toLowerCase() : "";

  let entries = state.history.slice();
  if (typeFilter === "in" || typeFilter === "out") {
    entries = entries.filter((h) => h.type === typeFilter);
  }

  if (yearFilter) {
    const yFilterNum = Number(yearFilter);
    entries = entries.filter((h) => {
      const d = new Date(h.at);
      if (Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === yFilterNum;
    });
  }

  if (monthFilter) {
    const mFilterNum = Number(monthFilter);
    entries = entries.filter((h) => {
      const d = new Date(h.at);
      if (Number.isNaN(d.getTime())) return false;
      return d.getMonth() + 1 === mFilterNum;
    });
  }

  if (deviceFilter) {
    entries = entries.filter((h) => {
      const model = state.models.find((m) => m.id === h.modelId);
      const modelName = model ? model.name.toLowerCase() : "";
      const serial = (h.serial || "").toLowerCase();
      return modelName.includes(deviceFilter) || serial.includes(deviceFilter);
    });
  }

  // Render type pills (counts reflect all filters above)
  renderFilterPills("history-cat-pills", entries, (h) => h.modelId, historyCategoryFilter, (cat) => {
    historyCategoryFilter = cat;
    visibleHistory = DEFAULT_LIMIT_HISTORY;
    previousVisibleHistory = 0;
    renderHistoryView();
  });

  // Apply category filter
  if (historyCategoryFilter) {
    entries = entries.filter((h) => {
      const model = state.models.find((m) => m.id === h.modelId);
      return model && (model.category || "") === historyCategoryFilter;
    });
  }

  const sorted = entries.sort((a, b) =>
    historySort === "asc"
      ? new Date(a.at) - new Date(b.at)
      : new Date(b.at) - new Date(a.at)
  );

  const total = sorted.length;
  const toShow = sorted.slice(0, visibleHistory);

  const rows = toShow
    .map((h, idx) => {
      const model = state.models.find((m) => m.id === h.modelId);
      const statusClass = h.type === "in" ? "status-in" : "status-out";
      const label = h.type === "in" ? "Added to stock" : "Removed from stock";
      const technician = h.addedBy || h.deliveredBy || "";
      const dash = '<span style="color:var(--text-muted)">—</span>';
      const reason = h.reason || (h.type === "in" ? dash : "");
      const destination = h.destination || (h.type === "in" ? dash : "");
      let rowClass = "";
      if (h.type === "in") {
        const device = state.devices.find((d) => d.serial === h.serial && d.modelId === h.modelId && d.status === "in");
        if (device) {
          const info = getStockAgeInfo(device.createdAt);
          rowClass = info.rowClass;
        }
      }
      const revealClass = idx >= previousVisibleHistory ? " row-reveal" : "";
      return `
        <tr class="${rowClass}${revealClass}">
          <td><span class="status-chip ${statusClass}">${label}</span></td>
          <td>${model ? model.name + ' ' + getCategoryBadge(model.category) : "Unknown model"}</td>
          <td>${h.serial}</td>
          <td>${technician}</td>
          <td>${reason}</td>
          <td>${destination}</td>
          <td>${formatDateTime(h.at)}</td>
        </tr>
      `;
    })
    .join("");

  const showMoreHtml = total > visibleHistory
    ? `<div class="show-more-row"><button type="button" class="btn btn-show-more js-history-show-more">Show More</button></div>`
    : "";

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

  container.querySelectorAll(".js-history-show-more").forEach((btn) => {
    btn.addEventListener("click", () => {
      previousVisibleHistory = visibleHistory;
      visibleHistory += INCREMENT_HISTORY;
      renderHistoryView();
    });
  });
}

// ---- Dialogs ----

function openAddModelDialog() {
  document.getElementById("add-model-dialog").classList.remove("hidden");
  document.getElementById("model-name-input").focus();
}

function closeAddModelDialog() {
  document.getElementById("add-model-dialog").classList.add("hidden");
  document.getElementById("add-model-form").reset();
  const catInput = document.getElementById("model-category-input");
  if (catInput) catInput.value = "";
}

function openRemoveSerialDialog(deviceId) {
  pendingRemoveDeviceId = deviceId;
  document.getElementById("remove-serial-dialog").classList.remove("hidden");
  populateDeliveredBySelect();
  // Wire the add-new sentinel for the delivered-by select
  const sel = document.getElementById("remove-delivered-by-select");
  if (sel) {
    sel.addEventListener("change", function handler() {
      if (sel.value !== "__add_new__") return;
      const name = prompt("Enter the new person's name:");
      if (name && name.trim()) {
        addTechnician(name.trim());
        populateDeliveredBySelect();
      } else {
        sel.value = "";
      }
    });
  }
  document.getElementById("remove-reason-input").focus();
}

function closeRemoveSerialDialog() {
  pendingRemoveDeviceId = null;
  document.getElementById("remove-serial-dialog").classList.add("hidden");
  document.getElementById("remove-serial-form").reset();
}

// ---- Data operations ----

function addModel(name, notes, category) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const cleanCategory = (category || "").trim();
  if (!cleanCategory) {
    showToast("Please select a category.");
    return;
  }
  const model = {
    id: uid(),
    name: trimmed,
    notes: (notes || "").trim(),
    category: cleanCategory,
    createdAt: new Date().toISOString(),
  };
  state.models.push(model);
  writeToFirestore();
  renderAll();
  showToast(`Model ${model.name} created.`);
  return model;
}

function addDeviceSerial(modelId, serial, department, prNumber, addedBy) {
  const model = state.models.find((m) => m.id === modelId);
  if (!model) return;
  const cleanSerial = serial.trim();
  if (!cleanSerial) return;
  const cleanDepartment = (department || "").trim();
  if (!cleanDepartment) {
    showToast("Please select a department.");
    return;
  }
  const cleanPr = (prNumber || "").trim();
  if (!cleanPr) {
    showToast("Please enter a PR number or ticket.");
    return;
  }
  const cleanAddedBy = (addedBy || "").trim();
  if (!cleanAddedBy) {
    showToast("Please select who is adding this device.");
    return;
  }

  const existing = state.devices.find(
    (d) =>
      d.modelId === modelId &&
      d.serial.toLowerCase() === cleanSerial.toLowerCase() &&
      d.status === "in"
  );
  if (existing) {
    showToast("This serial is already in stock for this model.");
    return;
  }

  const now = new Date().toISOString();
  const device = {
    id: uid(),
    modelId,
    serial: cleanSerial,
    prNumber: cleanPr,
    status: "in",
    department: cleanDepartment,
    addedBy: cleanAddedBy,
    createdAt: now,
    removedAt: null,
    reason: "",
    destination: "",
  };
  state.devices.push(device);
  state.history.push({
    id: uid(),
    type: "in",
    modelId,
    serial: cleanSerial,
    prNumber: cleanPr,
    addedBy: cleanAddedBy,
    at: now,
    reason: "Added to stock",
    destination: "",
  });
  writeToFirestore();
  renderAll();
  showToast(`Serial added to ${model.name}.`);
}

function removeDeviceFromStock(deviceId, reason, deliveredBy, destination) {
  const device = state.devices.find((d) => d.id === deviceId);
  if (!device || device.status !== "in") return;
  const model = state.models.find((m) => m.id === device.modelId);
  const now = new Date().toISOString();

  device.status = "out";
  device.removedAt = now;
  device.reason = (reason || "").trim();
  device.deliveredBy = (deliveredBy || "").trim();
  device.destination = (destination || "").trim();

  state.history.push({
    id: uid(),
    type: "out",
    modelId: device.modelId,
    serial: device.serial,
    prNumber: device.prNumber || "",
    at: now,
    reason: device.reason,
    deliveredBy: device.deliveredBy,
    destination: device.destination,
  });

  writeToFirestore();
  renderAll();
  showToast(
    `Serial removed from stock${model ? " for " + model.name + "" : ""}.`
  );
}

// ---- New Hire Kit — Models-First (Phase 1: Add to Stock | Phase 2: Deploy) ----

const nhkState = {
  step: 1,
  kitId: "",            // Ticket # or New Hire Name — used as kit_id tag
  selectedItems: [],    // Array of selected accessory names from KIT_ACCESSORIES
  otherItemText: "",    // Text entered when "Other" is selected
  otherNoSerial: false, // true = user chose N/A for "Other"
  serialInputs: {},     // item name -> new serial string entered by user
  prNumber: "",
  department: "",
  addedBy: "",
};

function openNewHireKitDialog() {
  nhkState.step = 1;
  nhkState.kitId = "";
  nhkState.selectedItems = [];
  nhkState.otherItemText = "";
  nhkState.otherNoSerial = false;
  nhkState.serialInputs = {};
  nhkState.prNumber = "";
  nhkState.department = "";
  nhkState.addedBy = "";
  document.getElementById("new-hire-kit-dialog").classList.remove("hidden");
  nhkRenderStep();
}

function closeNewHireKitDialog() {
  document.getElementById("new-hire-kit-dialog").classList.add("hidden");
}

function nhkUpdateStepper() {
  [1, 2, 3].forEach((n) => {
    const dot = document.getElementById(`nhk-step-dot-${n}`);
    if (!dot) return;
    dot.classList.remove("active", "done");
    if (n < nhkState.step) dot.classList.add("done");
    else if (n === nhkState.step) dot.classList.add("active");
  });
  const connectors = document.querySelectorAll(".nhk-step-connector");
  connectors.forEach((c, i) => {
    c.classList.toggle("done", nhkState.step > i + 1);
  });
}

function nhkRenderStep() {
  nhkUpdateStepper();
  const content = document.getElementById("nhk-step-content");
  if (!content) return;
  if (nhkState.step === 1) nhkRenderStep1(content);
  else if (nhkState.step === 2) nhkRenderStep2(content);
  else if (nhkState.step === 3) nhkRenderStep3(content);
}

// Step 1: Kit ID + fixed accessory checklist
function nhkRenderStep1(container) {
  const otherModelOptions = state.models
    .filter((m) => m.category === "Other")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => `<option value="${m.name.replace(/"/g, "&quot;")}"></option>`)
    .join("");

  const checkboxRows = KIT_ACCESSORIES.map((item) => {
    const isChecked = nhkState.selectedItems.includes(item);
    const isOther = item === "Other";
    return `
      <label class="nhk-model-card${isChecked ? " selected" : ""}" data-item="${item}">
        <input type="checkbox" class="nhk-acc-cb" data-item="${item}" ${isChecked ? "checked" : ""} />
        <div class="nhk-card-label">${item}</div>
      </label>
      ${isOther ? `
        <datalist id="nhk-other-datalist">${otherModelOptions}</datalist>
        <input type="text" id="nhk-other-text" class="nhk-other-input${isChecked ? "" : " hidden"}" placeholder="Please specify…" value="${nhkState.otherItemText.replace(/"/g, "&quot;")}" list="nhk-other-datalist" autocomplete="off" />
      ` : ""}
    `;
  }).join("");

  container.innerHTML = `
    <div class="nhk-hire-name-row">
      <label for="nhk-kit-id-input">Kit ID — Ticket # or New Hire Name <span style="color:var(--danger)">*</span></label>
      <input
        id="nhk-kit-id-input"
        type="text"
        placeholder="e.g. Jane-Smith-2026 or PR-20345"
        value="${nhkState.kitId.replace(/"/g, "&quot;")}"
        autocomplete="off"
      />
      <p style="font-size:0.7rem;color:var(--text-muted);margin:3px 0 0;">This ID links all kit devices so you can deploy them all later with one click.</p>
    </div>
    <p style="font-size:0.78rem;color:var(--text-muted);margin:10px 0 6px;">Select the accessories to include in this kit:</p>
    <div class="nhk-model-list">${checkboxRows}</div>
    <div class="nhk-footer">
      <button class="btn ghost" id="nhk-btn-cancel-s1">Cancel</button>
      <button class="btn primary" id="nhk-btn-next-s1">Next: Add Serials →</button>
    </div>
  `;

  const kitIdInput = document.getElementById("nhk-kit-id-input");
  kitIdInput.focus();
  kitIdInput.addEventListener("input", () => { nhkState.kitId = kitIdInput.value; });

  const otherTextInput = document.getElementById("nhk-other-text");
  if (otherTextInput) {
    otherTextInput.addEventListener("input", () => { nhkState.otherItemText = otherTextInput.value; });
  }

  container.querySelectorAll(".nhk-acc-cb").forEach((cb) => {
    cb.addEventListener("change", () => {
      const item = cb.dataset.item;
      const card = cb.closest(".nhk-model-card");
      if (cb.checked) {
        if (!nhkState.selectedItems.includes(item)) nhkState.selectedItems.push(item);
        if (card) card.classList.add("selected");
        if (item === "Other" && otherTextInput) otherTextInput.classList.remove("hidden");
      } else {
        nhkState.selectedItems = nhkState.selectedItems.filter((x) => x !== item);
        if (card) card.classList.remove("selected");
        if (item === "Other" && otherTextInput) otherTextInput.classList.add("hidden");
      }
    });
  });

  container.querySelectorAll(".nhk-model-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.type === "checkbox" || e.target === otherTextInput) return;
      const cb = card.querySelector("input[type=checkbox]");
      if (!cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event("change"));
    });
  });

  document.getElementById("nhk-btn-cancel-s1").addEventListener("click", closeNewHireKitDialog);
  document.getElementById("nhk-btn-next-s1").addEventListener("click", () => {
    nhkState.kitId = document.getElementById("nhk-kit-id-input").value.trim();
    if (!nhkState.kitId) {
      showToast("Please enter a Kit ID (ticket # or hire name).");
      document.getElementById("nhk-kit-id-input").focus();
      return;
    }
    if (nhkState.selectedItems.length === 0) {
      showToast("Select at least one accessory for the kit.");
      return;
    }
    if (nhkState.selectedItems.includes("Other") && !nhkState.otherItemText.trim()) {
      showToast('Please specify what "Other" is.');
      document.getElementById("nhk-other-text")?.focus();
      return;
    }
    nhkState.step = 2;
    nhkRenderStep();
  });
}

// Step 2: Enter new serial numbers + shared PR/Dept/AddedBy fields
function nhkRenderStep2(container) {
  const techOptions = state.technicians
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map((t) => `<option value="${t}" ${t === nhkState.addedBy ? "selected" : ""}>${t}</option>`)
    .join("");

  const serialCards = nhkState.selectedItems.map((item) => {
    const displayName = item === "Other" ? (nhkState.otherItemText || "Other") : item;
    const noSerial = NO_SERIAL_ITEMS.has(item);
    const isOther = item === "Other";
    const currentSerial = nhkState.serialInputs[item] || "";
    const otherNa = isOther && nhkState.otherNoSerial;

    if (noSerial) {
      return `
        <div class="nhk-assign-card">
          <div>
            <div class="nhk-assign-model-name">${displayName}</div>
            <div class="nhk-assign-model-count">No serial required</div>
          </div>
          <span class="nhk-no-serial-label">N/A</span>
        </div>
      `;
    }

    if (isOther) {
      return `
        <div class="nhk-assign-card nhk-assign-card--other" data-item="Other">
          <div style="flex:1;min-width:0;">
            <div class="nhk-assign-model-name">${displayName}</div>
            <div class="nhk-assign-model-count" style="margin-bottom:6px;">Serial number</div>
            <div class="nhk-other-serial-toggle" style="display:flex;gap:8px;margin-bottom:6px;">
              <button type="button" class="btn ${!otherNa ? "primary" : "ghost"} btn-sm nhk-other-toggle-serial" style="font-size:0.75rem;padding:3px 10px;">Add Serial</button>
              <button type="button" class="btn ${otherNa ? "primary" : "ghost"} btn-sm nhk-other-toggle-na" style="font-size:0.75rem;padding:3px 10px;">N/A</button>
            </div>
            ${!otherNa
              ? `<input type="text" class="nhk-new-serial-input" data-item-name="Other" placeholder="e.g. SN-ABC123" value="${currentSerial.replace(/"/g, "&quot;")}" autocomplete="off" style="width:100%;box-sizing:border-box;" />`
              : `<span class="nhk-no-serial-label">N/A — no serial</span>`
            }
          </div>
        </div>
      `;
    }

    return `
      <div class="nhk-assign-card">
        <div>
          <div class="nhk-assign-model-name">${displayName}</div>
          <div class="nhk-assign-model-count">New serial</div>
        </div>
        <input
          type="text"
          class="nhk-new-serial-input"
          data-item-name="${item}"
          placeholder="e.g. SN-ABC123"
          value="${currentSerial.replace(/"/g, "&quot;")}"
          autocomplete="off"
        />
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 8px;">
      Enter new serial numbers to add to stock under Kit ID <strong>${nhkState.kitId}</strong>:
    </p>
    <div class="nhk-assign-grid">${serialCards}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-top:12px;">
      <div class="form-field">
        <label>PR Number / Ticket <span style="color:var(--danger)">*</span></label>
        <input type="text" id="nhk-pr-input" placeholder="e.g. PR-12345" value="${nhkState.prNumber.replace(/"/g, "&quot;")}" />
      </div>
      <div class="form-field">
        <label>Department <span style="color:var(--danger)">*</span></label>
        <select id="nhk-dept-select">
          <option value="">Select department…</option>
          <option value="Planta Oeste" ${nhkState.department === "Planta Oeste" ? "selected" : ""}>Planta Oeste</option>
          <option value="Planta Este" ${nhkState.department === "Planta Este" ? "selected" : ""}>Planta Este</option>
        </select>
      </div>
      <div class="form-field">
        <label>Added by <span style="color:var(--danger)">*</span></label>
        <select id="nhk-addedby-select">
          <option value="">Select person…</option>
          ${techOptions}
        </select>
      </div>
    </div>
    <div class="nhk-footer">
      <button class="btn ghost" id="nhk-btn-back-s2">← Back</button>
      <button class="btn primary" id="nhk-btn-next-s2">Review Entry →</button>
    </div>
  `;

  container.querySelectorAll(".nhk-new-serial-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      nhkState.serialInputs[inp.dataset.itemName] = inp.value;
    });
  });

  // Other item toggle buttons
  const toggleSerial = container.querySelector(".nhk-other-toggle-serial");
  const toggleNa = container.querySelector(".nhk-other-toggle-na");
  if (toggleSerial && toggleNa) {
    toggleSerial.addEventListener("click", () => {
      nhkState.otherNoSerial = false;
      _nhkCollectStep2Fields(container);
      nhkRenderStep2(container);
    });
    toggleNa.addEventListener("click", () => {
      nhkState.otherNoSerial = true;
      _nhkCollectStep2Fields(container);
      nhkRenderStep2(container);
    });
  }

  document.getElementById("nhk-btn-back-s2").addEventListener("click", () => {
    _nhkCollectStep2Fields(container);
    nhkState.step = 1;
    nhkRenderStep();
  });

  document.getElementById("nhk-btn-next-s2").addEventListener("click", () => {
    _nhkCollectStep2Fields(container);
    const missingSerials = nhkState.selectedItems.filter(
      (item) => !NO_SERIAL_ITEMS.has(item)
        && !(item === "Other" && nhkState.otherNoSerial)
        && !(nhkState.serialInputs[item] || "").trim()
    );
    if (missingSerials.length > 0) {
      const names = missingSerials.map((item) => item === "Other" ? (nhkState.otherItemText || "Other") : item).join(", ");
      showToast(`Enter a serial number for: ${names}`);
      return;
    }
    if (!nhkState.prNumber.trim()) { showToast("Please enter a PR Number / Ticket."); return; }
    if (!nhkState.department) { showToast("Please select a department."); return; }
    if (!nhkState.addedBy) { showToast("Please select who is adding these devices."); return; }
    // Duplicate serial check within the kit (only items that need serials)
    const serialItems = nhkState.selectedItems.filter(
      (item) => !NO_SERIAL_ITEMS.has(item) && !(item === "Other" && nhkState.otherNoSerial)
    );
    const serials = serialItems.map((item) => nhkState.serialInputs[item].trim().toLowerCase());
    if (new Set(serials).size !== serials.length) {
      showToast("Each serial number must be unique within the kit.");
      return;
    }
    nhkState.step = 3;
    nhkRenderStep();
  });
}

function _nhkCollectStep2Fields(container) {
  container.querySelectorAll(".nhk-new-serial-input").forEach((inp) => {
    nhkState.serialInputs[inp.dataset.itemName] = inp.value;
  });
  const pr = document.getElementById("nhk-pr-input");
  const dept = document.getElementById("nhk-dept-select");
  const by = document.getElementById("nhk-addedby-select");
  if (pr) nhkState.prNumber = pr.value;
  if (dept) nhkState.department = dept.value;
  if (by) nhkState.addedBy = by.value;
}

// Step 3: Confirm and add to stock
function nhkRenderStep3(container) {
  const items = nhkState.selectedItems.map((item) => {
    const displayName = item === "Other" ? (nhkState.otherItemText || "Other") : item;
    const serial = nhkState.serialInputs[item] || "—";
    return `
      <div class="nhk-confirm-item">
        <span class="nhk-ci-model">${displayName}</span>
        <span class="nhk-ci-serial">${serial}</span>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="nhk-confirm-header">
      <span class="nhk-hire-label">Kit ID (Ticket / New Hire Name):</span>
      <span class="nhk-hire-value">${nhkState.kitId}</span>
    </div>
    <div style="display:flex;gap:14px;font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;flex-wrap:wrap;">
      <span>PR: <strong style="color:var(--text-main)">${nhkState.prNumber}</strong></span>
      <span>Dept: <strong style="color:var(--text-main)">${nhkState.department}</strong></span>
      <span>Added by: <strong style="color:var(--text-main)">${nhkState.addedBy}</strong></span>
    </div>
    <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 8px;">
      The following serials will be <strong>added to stock</strong> and tagged with this Kit ID:
    </p>
    <div class="nhk-confirm-list">${items}</div>
    <div class="nhk-footer">
      <button class="btn ghost" id="nhk-btn-back-s3">← Back</button>
      <button class="btn primary" id="nhk-btn-submit">Add to Stock</button>
    </div>
  `;

  document.getElementById("nhk-btn-back-s3").addEventListener("click", () => {
    nhkState.step = 2;
    nhkRenderStep();
  });
  document.getElementById("nhk-btn-submit").addEventListener("click", submitNewHireKit);
}

// Submit: bulk add to stock with kit_id tag
function submitNewHireKit() {
  const kitId = nhkState.kitId.trim();
  if (!kitId) { showToast("Kit ID is missing."); return; }

  const now = new Date().toISOString();
  let addedCount = 0;

  nhkState.selectedItems.forEach((item) => {
    const itemName = item === "Other" ? (nhkState.otherItemText.trim() || "Other") : item;
    const noSerial = NO_SERIAL_ITEMS.has(item) || (item === "Other" && nhkState.otherNoSerial);
    const cleanSerial = noSerial ? "N/A" : (nhkState.serialInputs[item] || "").trim();
    if (!noSerial && !cleanSerial) return;

    // Find existing model by name or create one
    let model = state.models.find((m) => m.name.toLowerCase() === itemName.toLowerCase());
    if (!model) {
      const category = KIT_ACCESSORY_CATEGORIES[item] || "Other";
      model = { id: uid(), name: itemName, category, description: "", createdAt: now };
      state.models.push(model);
    }
    const modelId = model.id;

    // Skip duplicate check for no-serial items
    if (!noSerial) {
      const duplicate = state.devices.find(
        (d) => d.modelId === modelId && d.serial.toLowerCase() === cleanSerial.toLowerCase() && d.status === "in"
      );
      if (duplicate) {
        showToast(`"${cleanSerial}" already in stock for ${itemName}. Skipped.`);
        return;
      }
    }

    state.devices.push({
      id: uid(),
      modelId,
      serial: cleanSerial,
      prNumber: nhkState.prNumber.trim(),
      status: "in",
      department: nhkState.department,
      addedBy: nhkState.addedBy,
      kit_id: kitId,
      createdAt: now,
      removedAt: null,
      reason: "",
      destination: "",
    });

    state.history.push({
      id: uid(),
      type: "in",
      modelId,
      serial: cleanSerial,
      prNumber: nhkState.prNumber.trim(),
      addedBy: nhkState.addedBy,
      kit_id: kitId,
      at: now,
      reason: `Kit: ${kitId}`,
      destination: "",
    });

    addedCount++;
  });

  if (addedCount === 0) {
    showToast("No devices were added. Check for duplicate serials.");
    return;
  }

  writeToFirestore();
  renderAll();
  closeNewHireKitDialog();
  showToast(`${addedCount} device${addedCount > 1 ? "s" : ""} added to stock under Kit "${kitId}".`);
}

// ---- Kit Deploy — Phase 2: Search & Bulk Remove ----

/**
 * Returns all in-stock devices tagged with a given kit_id.
 * @param {string} kitId
 */
function getKitItems(kitId) {
  return state.devices.filter(
    (d) => d.kit_id === kitId && d.status === "in"
  );
}

function renderKitDeployResults(kitId) {
  const resultsEl = document.getElementById("kit-deploy-results");
  const deployBtn = document.getElementById("btn-deploy-kit");
  if (!resultsEl) return;

  if (!kitId) {
    resultsEl.classList.add("empty-state");
    resultsEl.innerHTML = "<p>Enter a Kit ID and click Search.</p>";
    if (deployBtn) deployBtn.classList.add("hidden");
    return;
  }

  const items = getKitItems(kitId);
  if (!items.length) {
    resultsEl.classList.add("empty-state");
    resultsEl.innerHTML = `<p>No in-stock devices found for kit <strong>"${kitId}"</strong>.</p>`;
    if (deployBtn) deployBtn.classList.add("hidden");
    return;
  }

  resultsEl.classList.remove("empty-state");
  const rows = items
    .sort((a, b) => a.serial.localeCompare(b.serial))
    .map((d) => {
      const model = state.models.find((m) => m.id === d.modelId);
      return `
        <tr>
          <td>${model ? model.name + ' ' + getCategoryBadge(model.category) : "Unknown"}</td>
          <td>${d.serial}</td>
          <td>${d.prNumber || ""}</td>
          <td>${d.department || ""}</td>
          <td>${d.addedBy || ""}</td>
          <td>${formatDateTime(d.createdAt)}</td>
        </tr>
      `;
    }).join("");

  resultsEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Model</th><th>Serial</th><th>PR / Ticket</th><th>Department</th><th>Added by</th><th>Added</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  if (deployBtn) {
    deployBtn.classList.remove("hidden");
    deployBtn.textContent = `Remove All (${items.length} device${items.length > 1 ? "s" : ""})`;
  }
}

function deployKit(kitId) {
  const deliveredBy = (document.getElementById("kit-deploy-delivered-by")?.value || "").trim();
  if (!deliveredBy) {
    showToast("Please select who is removing this kit.");
    document.getElementById("kit-deploy-delivered-by")?.focus();
    return;
  }
  const items = getKitItems(kitId);
  if (!items.length) {
    showToast("No in-stock devices found for this kit.");
    return;
  }
  if (!confirm(`Remove all ${items.length} device${items.length > 1 ? "s" : ""} in kit "${kitId}"?\n\nThey will be marked as Removed from stock.`)) return;

  const now = new Date().toISOString();
  items.forEach((device) => {
    device.status = "out";
    device.removedAt = now;
    device.reason = "New Hire Kit Deployment";
    device.deliveredBy = deliveredBy;
    device.destination = kitId;

    state.history.push({
      id: uid(),
      type: "out",
      modelId: device.modelId,
      serial: device.serial,
      prNumber: device.prNumber || "",
      at: now,
      reason: "New Hire Kit Deployment",
      deliveredBy: deliveredBy,
      destination: kitId,
      kit_id: kitId,
    });
  });

  writeToFirestore();
  renderAll();

  // Clear the results panel
  const resultsEl = document.getElementById("kit-deploy-results");
  const deployBtn = document.getElementById("btn-deploy-kit");
  if (resultsEl) {
    resultsEl.classList.add("empty-state");
    resultsEl.innerHTML = `<p>Kit "${kitId}" deployed by ${deliveredBy}. ${items.length} device${items.length > 1 ? "s" : ""} removed from stock.</p>`;
  }
  if (deployBtn) deployBtn.classList.add("hidden");
  showToast(`Kit "${kitId}" deployed by ${deliveredBy} — ${items.length} device${items.length > 1 ? "s" : ""} removed.`);
}

// ---- Import / Export ----

function exportData() {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          data: {
            models: state.models,
            devices: state.devices,
            history: state.history,
          },
        },
        null,
        2
      ),
    ],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rack-inventory-backup.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importDataFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const text = event.target.result;
      const parsed = JSON.parse(text);
      const payload = parsed.data || parsed;
      if (
        !payload ||
        !Array.isArray(payload.models) ||
        !Array.isArray(payload.devices) ||
        !Array.isArray(payload.history)
      ) {
        showToast("Invalid backup file.");
        return;
      }
      state.models = payload.models;
      state.devices = payload.devices;
      state.history = payload.history;
      writeToFirestore();
      renderAll();
      showToast("Inventory imported.");
    } catch (e) {
      console.error("Import error", e);
      showToast("Failed to import file.");
    }
  };
  reader.readAsText(file);
}

// ---- Navigation ----

function switchView(viewId) {
  document
    .querySelectorAll(".view")
    .forEach((el) => el.classList.remove("active"));
  const selected = document.getElementById("view-" + viewId);
  if (selected) {
    selected.classList.add("active");
  }

  document.querySelectorAll(".nav-tab").forEach((btn) => {
    if (btn.dataset.view === viewId) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

/** Populates the kit-deploy select with all kit_ids that have at least one device in stock. */
function renderKitDeployDropdown() {
  const sel = document.getElementById("kit-deploy-select");
  if (!sel) return;
  const prevVal = sel.value;

  // All unique kit_ids with at least one in-stock device
  const kitIds = [...new Set(
    state.devices
      .filter((d) => d.kit_id && d.status === "in")
      .map((d) => d.kit_id)
  )].sort((a, b) => a.localeCompare(b));

  sel.innerHTML = kitIds.length
    ? '<option value="">— Select a kit —</option>'
    : '<option value="">— No kits in stock —</option>';

  kitIds.forEach((id) => {
    const count = state.devices.filter((d) => d.kit_id === id && d.status === "in").length;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = `${id}  (${count} device${count > 1 ? "s" : ""})`;
    sel.appendChild(opt);
  });

  // Restore previous selection if still valid
  if (prevVal && kitIds.includes(prevVal)) {
    sel.value = prevVal;
  } else if (prevVal) {
    // Kit was deployed — clear results
    const resultsEl = document.getElementById("kit-deploy-results");
    const deployBtn = document.getElementById("btn-deploy-kit");
    if (resultsEl) {
      resultsEl.classList.add("empty-state");
      resultsEl.innerHTML = "<p>Select a kit from the dropdown above.</p>";
    }
    if (deployBtn) deployBtn.classList.add("hidden");
  }

  // Also populate the Deployed-by technician select
  const bySelect = document.getElementById("kit-deploy-delivered-by");
  if (bySelect) {
    const prevBy = bySelect.value;
    bySelect.innerHTML = '<option value="">Select person\u2026</option>';
    state.technicians
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        bySelect.appendChild(opt);
      });
    if (prevBy && state.technicians.includes(prevBy)) bySelect.value = prevBy;
  }
}

function renderAll() {
  renderDashboard();
  renderModelsTable();
  renderDevicesView();
  renderHistoryView();
  renderKitDeployDropdown();
  if (currentModelId) {
    openModelDetail(currentModelId);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Wait for Firebase to be ready
  while (!window.__inventoryStorage) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await loadFromFirestore();
  subscribeToRealtimeChanges();

  // One-time migration: reset technicians list to canonical names
  const CANONICAL_TECHNICIANS = [
    "Hector Morales",
    "Rodolfo Magaña",
    "Ian Valenzuela",
    "Jahaziel Gerardo",
    "Alejandro Villa",
  ];
  if (!localStorage.getItem("tech_migration_v1")) {
    state.technicians = [...CANONICAL_TECHNICIANS];
    writeToFirestore();
    populateTechnicianSelect();
    localStorage.setItem("tech_migration_v1", "done");
  }

  // Hidden testing feature: click "All Devices" text specifically 5 times to inject old test stock
  let testClickCount = 0;
  let testClickTimeout;
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    if (btn.dataset.view === "devices") {
      btn.addEventListener("click", () => {
        testClickCount++;
        clearTimeout(testClickTimeout);
        testClickTimeout = setTimeout(() => { testClickCount = 0; }, 2000);
        if (testClickCount >= 5) {
          testClickCount = 0;
          injectTestStock();
        }
      });
    }
  });

  // Nav
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });

  const logoArea = document.getElementById("app-logo-area");
  if (logoArea) {
    logoArea.addEventListener("click", () => {
      switchView("devices");
    });
  }

  // Quick-add form removed from dashboard — Models tab is now the sole write point.

  // Models header (Delete / New Model buttons — managed dynamically)
  updateModelsHeader();
  document
    .getElementById("btn-cancel-add-model")
    .addEventListener("click", closeAddModelDialog);
  document
    .getElementById("add-model-form")
    .addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("model-name-input").value;
      const category = document.getElementById("model-category-input").value;
      const model = addModel(name, "", category);
      if (model) {
        closeAddModelDialog();
      }
    });

  // Close model detail
  document
    .getElementById("btn-close-model-detail")
    .addEventListener("click", closeModelDetail);

  // Add serial to current model
  const addSerialForm = document.getElementById("add-serial-form");
  addSerialForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!currentModelId) {
      showToast("Select a model first.");
      return;
    }
    const serial = document.getElementById("serial-number-input").value;
    const department = document.getElementById("serial-department-select").value;
    const prNumber = document.getElementById("serial-pr-input").value;
    const addedBy = document.getElementById("serial-added-by-select").value;
    addDeviceSerial(currentModelId, serial, department, prNumber, addedBy);
    addSerialForm.reset();
    // Re-select the person after form reset so they don't have to pick again
    const sel = document.getElementById("serial-added-by-select");
    if (sel && addedBy) sel.value = addedBy;
  });

  // Add person to team list
  const addedBySelect = document.getElementById("serial-added-by-select");
  if (addedBySelect) {
    addedBySelect.addEventListener("change", () => {
      if (addedBySelect.value !== "__add_new__") return;
      const name = prompt("Enter the new person's name:");
      if (name && name.trim()) {
        addTechnician(name.trim());
      } else {
        // Revert to empty if cancelled
        addedBySelect.value = "";
      }
    });
  }

  // Remove serial dialog
  document
    .getElementById("btn-cancel-remove-serial")
    .addEventListener("click", closeRemoveSerialDialog);

  document
    .getElementById("remove-serial-form")
    .addEventListener("submit", (e) => {
      e.preventDefault();
      if (!pendingRemoveDeviceId) {
        closeRemoveSerialDialog();
        return;
      }
      const reason = document.getElementById("remove-reason-input").value;
      const deliveredBy = document.getElementById("remove-delivered-by-select").value;
      const destination = document.getElementById("remove-destination-input").value;
      removeDeviceFromStock(pendingRemoveDeviceId, reason, deliveredBy, destination);
      closeRemoveSerialDialog();
    });

  // Export / Import
  document
    .getElementById("btn-export-data")
    .addEventListener("click", exportData);
  document
    .getElementById("file-import-data")
    .addEventListener("change", (e) => {
      const file = e.target.files[0];
      importDataFromFile(file);
      e.target.value = "";
    });
  document
    .getElementById("btn-clear-all-data")
    .addEventListener("click", clearAllData);

  // Device filters
  const deptFilterEl = document.getElementById("filter-department");
  const textFilterEl = document.getElementById("filter-location-owner");
  const clearFiltersBtn = document.getElementById("btn-clear-filters");
  const historyTypeFilterEl = document.getElementById("filter-history-type");
  const historyYearSelect = document.getElementById("filter-history-year");
  const historyMonthSelect = document.getElementById("filter-history-month");

  if (deptFilterEl) {
    deptFilterEl.addEventListener("change", () => { resetDevicesPagination(); renderDevicesView(); });
  }
  if (textFilterEl) {
    textFilterEl.addEventListener("input", () => { resetDevicesPagination(); renderDevicesView(); });
  }
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      if (deptFilterEl) deptFilterEl.value = "";
      if (textFilterEl) textFilterEl.value = "";
      devicesCategoryFilter = "";
      resetDevicesPagination();
      renderDevicesView();
    });
  }

  if (historyTypeFilterEl) {
    historyTypeFilterEl.addEventListener("change", () => { visibleHistory = DEFAULT_LIMIT_HISTORY; previousVisibleHistory = 0; renderHistoryView(); });
  }
  if (historyYearSelect) {
    historyYearSelect.addEventListener("change", () => { visibleHistory = DEFAULT_LIMIT_HISTORY; previousVisibleHistory = 0; renderHistoryView(); });
  }
  if (historyMonthSelect) {
    historyMonthSelect.addEventListener("change", () => { visibleHistory = DEFAULT_LIMIT_HISTORY; previousVisibleHistory = 0; renderHistoryView(); });
  }

  const historyDeviceFilter = document.getElementById("filter-history-device");
  if (historyDeviceFilter) {
    historyDeviceFilter.addEventListener("input", () => { visibleHistory = DEFAULT_LIMIT_HISTORY; previousVisibleHistory = 0; renderHistoryView(); });
  }

  const btnClearHistory = document.getElementById("btn-clear-history-filters");
  if (btnClearHistory) {
    btnClearHistory.addEventListener("click", () => {
      if (historyTypeFilterEl) historyTypeFilterEl.value = "";
      if (historyYearSelect) historyYearSelect.value = "";
      if (historyMonthSelect) historyMonthSelect.value = "";
      if (historyDeviceFilter) historyDeviceFilter.value = "";
      historyCategoryFilter = "";
      visibleHistory = DEFAULT_LIMIT_HISTORY;
      previousVisibleHistory = 0;
      renderHistoryView();
    });
  }

  // Sort button for history
  const sortBtn = document.getElementById("btn-history-sort");
  if (sortBtn) {
    sortBtn.addEventListener("click", () => {
      historySort = historySort === "desc" ? "asc" : "desc";
      sortBtn.dataset.order = historySort;
      sortBtn.textContent =
        historySort === "desc" ? "Newest First" : "Oldest First";
      visibleHistory = DEFAULT_LIMIT_HISTORY;
      previousVisibleHistory = 0;
      renderHistoryView();
    });
  }

  // Sort button for devices
  const devicesSortBtn = document.getElementById("btn-devices-sort");
  if (devicesSortBtn) {
    devicesSortBtn.addEventListener("click", () => {
      devicesSort = devicesSort === "desc" ? "asc" : "desc";
      devicesSortBtn.dataset.order = devicesSort;
      devicesSortBtn.textContent =
        devicesSort === "desc" ? "Newest First" : "Oldest First";
      renderDevicesView();
    });
  }

  // View Removed toggle (opens) + Close Archive (closes)
  const btnToggleRemoved = document.getElementById("btn-toggle-removed");
  const btnCloseRemoved = document.getElementById("btn-close-removed");
  const removedPanel = document.getElementById("removed-devices-panel");
  if (btnToggleRemoved && removedPanel) {
    btnToggleRemoved.addEventListener("click", () => {
      removedPanel.classList.remove("hidden");
    });
  }
  if (btnCloseRemoved && removedPanel) {
    btnCloseRemoved.addEventListener("click", () => {
      removedPanel.classList.add("hidden");
    });
  }

  // Removed section independent filters
  const removedSearchInput = document.getElementById("filter-removed-search");
  const removedDeptSelect = document.getElementById("filter-removed-dept");
  const removedDestSelect2 = document.getElementById("filter-removed-destination");
  const btnClearRemoved = document.getElementById("btn-clear-removed-filters");
  if (removedSearchInput) {
    removedSearchInput.addEventListener("input", () => {
      removedTextFilter = removedSearchInput.value.trim().toLowerCase();
      resetDevicesPagination();
      renderDevicesView();
    });
  }
  if (removedDeptSelect) {
    removedDeptSelect.addEventListener("change", () => {
      removedDeptFilter = removedDeptSelect.value;
      resetDevicesPagination();
      renderDevicesView();
    });
  }
  // Segmented controls (View Mode)
  const setupSeg = (containerId, onSelect) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.querySelectorAll(".seg-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        el.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        onSelect(btn.dataset.view);
      });
    });
  };
  setupSeg("seg-view-in", (v) => { viewModeIn = v; resetDevicesPagination(); renderDevicesView(); });
  setupSeg("seg-view-out", (v) => { viewModeOut = v; resetDevicesPagination(); renderDevicesView(); });

  // Removed Date Sort toggle
  const btnRemovedSort = document.getElementById("btn-removed-sort");
  if (btnRemovedSort) {
    btnRemovedSort.addEventListener("click", () => {
      removedSort = removedSort === "desc" ? "asc" : "desc";
      btnRemovedSort.textContent = removedSort === "desc" ? "Newest First" : "Oldest First";
      renderDevicesView();
    });
  }

  if (btnClearRemoved) {
    btnClearRemoved.addEventListener("click", () => {
      removedTextFilter = "";
      removedDeptFilter = "";
      devicesRemovedDestFilter = "";
      removedCategoryFilter = "";
      viewModeOut = "all";
      if (removedSearchInput) removedSearchInput.value = "";
      if (removedDeptSelect) removedDeptSelect.value = "";
      // Reset seg-view-out to All
      const segOut = document.getElementById("seg-view-out");
      if (segOut) {
        segOut.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
        const first = segOut.querySelector(".seg-btn[data-view='all']");
        if (first) first.classList.add("active");
      }
      resetDevicesPagination();
      renderDevicesView();
    });
  }

  // New Hire Kit — close button
  const btnCloseNhk = document.getElementById("btn-close-nhk-dialog");
  if (btnCloseNhk) {
    btnCloseNhk.addEventListener("click", closeNewHireKitDialog);
  }

  // Kit Deploy — dropdown
  const kitDeploySelect = document.getElementById("kit-deploy-select");
  const btnDeployKit = document.getElementById("btn-deploy-kit");
  if (kitDeploySelect) {
    kitDeploySelect.addEventListener("change", () => {
      renderKitDeployResults(kitDeploySelect.value);
    });
  }
  if (btnDeployKit) {
    btnDeployKit.addEventListener("click", () => {
      deployKit(kitDeploySelect ? kitDeploySelect.value : "");
    });
  }

  renderAll();
  populateTechnicianSelect();
  switchView("devices");
});

function injectTestStock() {
  if (!state.models.length) {
    showToast("Add at least one model first to run this test.");
    return;
  }
  const modelId = state.models[0].id;
  const now = Date.now();

  // Device 1: 15 days old (Yellow)
  const dateYellow = new Date(now - (15 * 24 * 60 * 60 * 1000)).toISOString();
  state.devices.push({
    id: uid(),
    modelId,
    serial: "TEST-YELLOW-14D",
    prNumber: "PR-TEST-1",
    status: "in",
    department: "Planta Oeste",
    addedBy: "System Test",
    createdAt: dateYellow,
    removedAt: null,
    reason: "",
    destination: "",
  });
  state.history.push({
    id: uid(),
    type: "in",
    modelId,
    serial: "TEST-YELLOW-14D",
    prNumber: "PR-TEST-1",
    addedBy: "System Test",
    at: dateYellow,
    reason: "Added to stock",
    destination: "",
  });

  // Device 2: 35 days old (Red)
  const dateRed = new Date(now - (35 * 24 * 60 * 60 * 1000)).toISOString();
  state.devices.push({
    id: uid(),
    modelId,
    serial: "TEST-RED-30D",
    prNumber: "PR-TEST-2",
    status: "in",
    department: "Planta Este",
    addedBy: "System Test",
    createdAt: dateRed,
    removedAt: null,
    reason: "",
    destination: "",
  });
  state.history.push({
    id: uid(),
    type: "in",
    modelId,
    serial: "TEST-RED-30D",
    prNumber: "PR-TEST-2",
    addedBy: "System Test",
    at: dateRed,
    reason: "Added to stock",
    destination: "",
  });

  writeToFirestore();
  renderAll();
  showToast("Test devices injected! Check All Devices view.");
}
