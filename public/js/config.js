// ============================================================
// config.js — App-wide constants
// Loaded first; no dependencies.
// ============================================================

const API_URL = '/api';

// Device categories (matches DB + HTML option lists)
const CATEGORIES = [
  "Laptop", "Desktop PC", "Keyboard", "Cellphone", "Mouse",
  "Headset", "Dock", "Monitor", "Cable", "Camera",
  "Printer", "Tablet", "Scanner", "Other",
];

// Kit-builder constants (overwritten at runtime by loadKitAccessories in kit.js)
let KIT_ACCESSORIES = [
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

// Items that never have a serial number (overwritten at runtime)
let NO_SERIAL_ITEMS = new Set([
  "DisplayPort to VGA Converter",
  "DVI-D to DisplayPort Converter",
  "HDMI to VGA Adapter",
]);

// Maps kit accessory names → device category (overwritten at runtime)
let KIT_ACCESSORY_CATEGORIES = {
  "Dell 24-Inch Monitor":          "Monitor",
  "Dell Optical Wired Mouse":      "Mouse",
  "Dell Wired Multi-Media Keyboard": "Keyboard",
  "DisplayPort to VGA Converter":  "Cable",
  "DVI-D to DisplayPort Converter":"Cable",
  "HDMI to VGA Adapter":           "Cable",
  "Laptop Docking Station":        "Dock",
  "Logitech C920 HD Pro Web Camera":"Camera",
  "USB Headset":                   "Headset",
  "Other":                         "Other",
};

// Role display labels for admin panel
const ROLE_LABELS = {
  admin:      { label: 'Admin',           cls: 'role-admin'    },
  technician: { label: 'Technician',      cls: 'role-tech'     },
  delivery:   { label: 'Delivery Window', cls: 'role-delivery' },
  viewer:     { label: 'Viewer',          cls: 'role-viewer'   },
};

// Pagination defaults
const DEFAULT_LIMIT_INDIVIDUAL = 10;
const DEFAULT_LIMIT_GROUPED    = 5;
const DEFAULT_LIMIT_ALL        = 5;
const INCREMENT_INDIVIDUAL     = 10;
const INCREMENT_GROUPED        = 5;
const INCREMENT_ALL            = 5;
const DEFAULT_LIMIT_HISTORY    = 20;
const INCREMENT_HISTORY        = 20;
