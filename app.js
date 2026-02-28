// IT Rack Inventory - uses Firebase Firestore for sync across devices

const state = {
  models: [],
  devices: [],
  history: [],
  technicians: [],
};

let historySort = "desc"; // 'desc' = newest first, 'asc' = oldest first

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
  addOpt.textContent = "＋ Add new person…";
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
  addOpt.textContent = "＋ Add new person…";
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
    list.innerHTML = "<p>No models yet. Add your first model above.</p>";
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
      const pill = document.createElement("button");
      pill.className = "pill";
      pill.dataset.modelId = m.id;
      pill.innerHTML = `
        <span>${m.name}</span>
        <span class="pill-count">${countIn} in stock</span>
      `;
      pill.addEventListener("click", () => openModelDetail(m.id));
      list.appendChild(pill);
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
      <button class="btn ghost" id="btn-enter-delete-mode">Delete</button>
      <button class="btn primary" id="btn-open-add-model-dialog">+ New Model</button>
    `;
    document.getElementById("btn-enter-delete-mode").addEventListener("click", enterDeleteMode);
    document.getElementById("btn-open-add-model-dialog").addEventListener("click", openAddModelDialog);
  }
  const newFilter = document.getElementById("filter-models-input");
  if (newFilter) {
    newFilter.addEventListener("input", () => renderModelsTable());
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

function renderModelsTable() {
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
  if (filter) {
    modelsToShow = modelsToShow.filter(
      (m) =>
        (m.name || "").toLowerCase().includes(filter) ||
        (m.notes || "").toLowerCase().includes(filter)
    );
  }
  if (!modelsToShow.length) {
    container.classList.remove("empty-state");
    container.innerHTML = "<p>No models match your search.</p>";
    return;
  }
  container.classList.remove("empty-state");
  const rows = modelsToShow
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
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
          <td>${m.name}</td>
          <td>${m.notes ? m.notes : ""}</td>
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
          <th>Notes</th>
          <th>In stock</th>
          <th>Removed</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

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
  const entries = state.history.filter((h) => h.modelId === modelId);
  if (!entries.length) {
    container.classList.add("empty-state");
    container.innerHTML =
      "<p>No history yet. Add or remove serials to see activity.</p>";
    return;
  }
  container.classList.remove("empty-state");
  const rows = entries
    .slice()
    .sort((a, b) => new Date(b.at) - new Date(a.at))
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
  `;
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

  if (deptFilter) {
    inDevices = inDevices.filter(
      (d) => (d.department || "") === deptFilter
    );
    outDevices = outDevices.filter(
      (d) => (d.department || "") === deptFilter
    );
  }

  if (textFilter) {
    inDevices = inDevices.filter((d) => {
      const modelName = (
        state.models.find((m) => m.id === d.modelId)?.name || ""
      ).toLowerCase();
      const serial = (d.serial || "").toLowerCase();
      const dest = (d.destination || "").toLowerCase();
      return (
        modelName.includes(textFilter) ||
        serial.includes(textFilter) ||
        (d.prNumber || "").toLowerCase().includes(textFilter) ||
        dest.includes(textFilter)
      );
    });
    outDevices = outDevices.filter((d) => {
      const modelName = (
        state.models.find((m) => m.id === d.modelId)?.name || ""
      ).toLowerCase();
      const serial = (d.serial || "").toLowerCase();
      const dest = (d.destination || "").toLowerCase();
      return (
        modelName.includes(textFilter) ||
        serial.includes(textFilter) ||
        (d.prNumber || "").toLowerCase().includes(textFilter) ||
        dest.includes(textFilter)
      );
    });
  }

  if (!inDevices.length) {
    inContainer.classList.add("empty-state");
    inContainer.innerHTML = "<p>No devices in stock yet.</p>";
  } else {
    inContainer.classList.remove("empty-state");
    const rows = inDevices
      .slice()
      .sort((a, b) => a.serial.localeCompare(b.serial))
      .map((d) => {
        const model = state.models.find((m) => m.id === d.modelId);
        const { rowClass, badge } = getStockAgeInfo(d.createdAt);
        return `
          <tr class="${rowClass}">
            <td>${model ? model.name : "Unknown model"}</td>
            <td>${d.department || ""}</td>
            <td>${d.serial}</td>
            <td>${d.prNumber || ""}</td>
            <td>${d.addedBy || ""}</td>
            <td>${formatDateTime(d.createdAt)}${badge}</td>
          </tr>
        `;
      })
      .join("");
    inContainer.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th>Department</th>
            <th>Serial</th>
            <th>PR / Ticket</th>
            <th>Added by</th>
            <th>Added</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  if (!outDevices.length) {
    outContainer.classList.add("empty-state");
    outContainer.innerHTML = "<p>No removed devices yet.</p>";
  } else {
    outContainer.classList.remove("empty-state");
    const rows = outDevices
      .slice()
      .sort((a, b) => new Date(b.removedAt) - new Date(a.removedAt))
      .map((d) => {
        const model = state.models.find((m) => m.id === d.modelId);
        return `
          <tr>
            <td>${model ? model.name : "Unknown model"}</td>
            <td>${d.department || ""}</td>
            <td>${d.serial}</td>
            <td>${d.prNumber || ""}</td>
            <td>${d.deliveredBy || ""}</td>
            <td>${d.reason || ""}</td>
            <td>${d.destination || ""}</td>
            <td>${formatDateTime(d.removedAt)}</td>
          </tr>
        `;
      })
      .join("");
    outContainer.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th>Department</th>
            <th>Serial</th>
            <th>PR / Ticket</th>
            <th>Delivered by</th>
            <th>Reason</th>
            <th>Destination</th>
            <th>Removed at</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }
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

  const typeFilter = typeFilterEl ? typeFilterEl.value : "";
  const yearFilter = yearFilterEl ? yearFilterEl.value : "";
  const monthFilter = monthFilterEl ? monthFilterEl.value : "";

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

  const rows = entries
    .sort((a, b) =>
      historySort === "asc"
        ? new Date(a.at) - new Date(b.at)
        : new Date(b.at) - new Date(a.at)
    )
    .map((h) => {
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
      return `
        <tr class="${rowClass}">
          <td><span class="status-chip ${statusClass}">${label}</span></td>
          <td>${model ? model.name : "Unknown model"}</td>
          <td>${h.serial}</td>
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
  `;
}

// ---- Dialogs ----

function openAddModelDialog() {
  document.getElementById("add-model-dialog").classList.remove("hidden");
  document.getElementById("model-name-input").focus();
}

function closeAddModelDialog() {
  document.getElementById("add-model-dialog").classList.add("hidden");
  document.getElementById("add-model-form").reset();
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

function addModel(name, notes) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const model = {
    id: uid(),
    name: trimmed,
    notes: (notes || "").trim(),
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

function renderAll() {
  renderDashboard();
  renderModelsTable();
  renderDevicesView();
  renderHistoryView();
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
      switchView("history");
    });
  }

  // Quick add model on dashboard
  const quickForm = document.getElementById("quick-add-model-form");
  quickForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("quick-model-name").value;
    const model = addModel(name, "");
    if (model) {
      quickForm.reset();
    }
  });

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
      const model = addModel(name, "");
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
    deptFilterEl.addEventListener("change", renderDevicesView);
  }
  if (textFilterEl) {
    textFilterEl.addEventListener("input", renderDevicesView);
  }
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      if (deptFilterEl) deptFilterEl.value = "";
      if (textFilterEl) textFilterEl.value = "";
      renderDevicesView();
    });
  }

  if (historyTypeFilterEl) {
    historyTypeFilterEl.addEventListener("change", renderHistoryView);
  }
  if (historyYearSelect) {
    historyYearSelect.addEventListener("change", renderHistoryView);
  }
  if (historyMonthSelect) {
    historyMonthSelect.addEventListener("change", renderHistoryView);
  }

  // Sort button for history
  const sortBtn = document.getElementById("btn-history-sort");
  if (sortBtn) {
    sortBtn.addEventListener("click", () => {
      historySort = historySort === "desc" ? "asc" : "desc";
      sortBtn.dataset.order = historySort;
      sortBtn.textContent =
        historySort === "desc" ? "⬇ Newest first" : "⬆ Oldest first";
      renderHistoryView();
    });
  }

  renderAll();
  populateTechnicianSelect();
  switchView("history");
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
