// IT Rack Inventory - uses Firebase Firestore for sync across devices

const state = {
  models: [],
  // each device = {
  //   id, modelId, serial, prNumber, status: 'in' | 'out',
  //   department, createdAt, removedAt, reason, destination
  // }
  devices: [],
  // each history entry = {id, type: 'in' | 'out', modelId, serial, prNumber, at, reason, destination}
  history: [],
};

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
        } catch (_) {}
      }
    }
    if (parsed && typeof parsed === "object") {
      state.models = Array.isArray(parsed.models) ? parsed.models : [];
      state.devices = Array.isArray(parsed.devices) ? parsed.devices : [];
      state.history = Array.isArray(parsed.history) ? parsed.history : [];
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
      renderAll();
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
  };
  storage.save(payload).catch((e) => {
    console.error("Error saving inventory to Firestore", e);
    showToast("Could not sync to cloud. Check console.");
  });
}

function clearAllData() {
  if (!confirm("Delete all models, devices, and history? This cannot be undone.")) return;
  state.models = [];
  state.devices = [];
  state.history = [];
  writeToFirestore();
  if (typeof localStorage !== "undefined") localStorage.removeItem("rackInventoryData_v1");
  renderAll();
  showToast("All data cleared. Fresh start.");
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

function renderModelsTable() {
  const container = document.getElementById("models-table-container");
  if (!container) return;
  if (!state.models.length) {
    container.classList.add("empty-state");
    container.innerHTML =
      "<p>No models yet. Use New Models to create one.</p>";
    return;
  }
  container.classList.remove("empty-state");
  const rows = state.models
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => {
      const inCount = state.devices.filter(
        (d) => d.modelId === m.id && d.status === "in"
      ).length;
      const outCount = state.devices.filter(
        (d) => d.modelId === m.id && d.status === "out"
      ).length;
      return `
        <tr data-model-id="${m.id}" class="js-row-model">
          <td>${m.name}</td>
          <td>${m.notes ? m.notes : ""}</td>
          <td>${inCount}</td>
          <td>${outCount}</td>
          <td>${formatDateTime(m.createdAt)}</td>
        </tr>
      `;
    })
    .join("");
  container.innerHTML = `
    <table>
      <thead>
        <tr>
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
    row.addEventListener("click", () => {
      const id = row.getAttribute("data-model-id");
      openModelDetail(id);
    });
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
      return `
        <tr data-device-id="${d.id}">
          <td>${d.serial}</td>
          <td>${d.prNumber || ""}</td>
          <td>${d.department || ""}</td>
          <td>${formatDateTime(d.createdAt)}</td>
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
      return `
        <tr>
          <td><span class="status-chip ${statusClass}">${label}</span></td>
          <td>${h.serial}</td>
          <td>${h.prNumber || ""}</td>
          <td>${h.reason || ""}</td>
          <td>${h.destination || ""}</td>
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
          <th>Reason</th>
          <th>Destination / Person</th>
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
        return `
          <tr>
            <td>${model ? model.name : "Unknown model"}</td>
            <td>${d.department || ""}</td>
            <td>${d.serial}</td>
            <td>${d.prNumber || ""}</td>
            <td>${formatDateTime(d.createdAt)}</td>
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
            <th>Reason</th>
            <th>Destination / Person</th>
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
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .map((h) => {
      const model = state.models.find((m) => m.id === h.modelId);
      const statusClass = h.type === "in" ? "status-in" : "status-out";
      const label = h.type === "in" ? "Added to stock" : "Removed from stock";
      return `
        <tr>
          <td><span class="status-chip ${statusClass}">${label}</span></td>
          <td>${model ? model.name : "Unknown model"}</td>
          <td>${h.serial}</td>
          <td>${h.reason || ""}</td>
          <td>${h.destination || ""}</td>
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
          <th>Reason</th>
          <th>Destination / Person</th>
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
  document
    .getElementById("remove-serial-dialog")
    .classList.remove("hidden");
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

function addDeviceSerial(modelId, serial, department, prNumber) {
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
    at: now,
    reason: "Added to stock",
    destination: "",
  });
  writeToFirestore();
  renderAll();
  showToast(`Serial added to ${model.name}.`);
}

function removeDeviceFromStock(deviceId, reason, destination) {
  const device = state.devices.find((d) => d.id === deviceId);
  if (!device || device.status !== "in") return;
  const model = state.models.find((m) => m.id === device.modelId);
  const now = new Date().toISOString();

  device.status = "out";
  device.removedAt = now;
  device.reason = (reason || "").trim();
  device.destination = (destination || "").trim();

  state.history.push({
    id: uid(),
    type: "out",
    modelId: device.modelId,
    serial: device.serial,
    prNumber: device.prNumber || "",
    at: now,
    reason: device.reason,
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

  // Nav
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });

  // Quick add model on dashboard
  const quickForm = document.getElementById("quick-add-model-form");
  quickForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("quick-model-name").value;
    const notes = document.getElementById("quick-model-notes").value;
    const model = addModel(name, notes);
    if (model) {
      quickForm.reset();
    }
  });

  // Add model dialog
  document
    .getElementById("btn-open-add-model-dialog")
    .addEventListener("click", openAddModelDialog);
  document
    .getElementById("btn-cancel-add-model")
    .addEventListener("click", closeAddModelDialog);
  document
    .getElementById("add-model-form")
    .addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("model-name-input").value;
      const notes = document.getElementById("model-notes-input").value;
      const model = addModel(name, notes);
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
    const department = document.getElementById(
      "serial-department-select"
    ).value;
    const prNumber = document.getElementById("serial-pr-input").value;
    addDeviceSerial(currentModelId, serial, department, prNumber);
    addSerialForm.reset();
  });

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
      const destination = document.getElementById(
        "remove-destination-input"
      ).value;
      removeDeviceFromStock(pendingRemoveDeviceId, reason, destination);
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

  renderAll();
});
