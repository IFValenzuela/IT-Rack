// ============================================================
// ui/pills.js — Category filter pill bars
// Depends on: config.js, state.js, utils.js
// ============================================================

/**
 * Render a horizontal pill bar for category filtering.
 *
 * @param {string}   containerId   ID of the <div> that receives the pills.
 * @param {Array}    items         The data array being filtered (devices or history entries).
 * @param {Function} getModelId    Given an item, returns its modelId.
 * @param {string}   activeCategory Currently selected category value ('' = All).
 * @param {Function} onSelect      Callback invoked with the new category string.
 */
function renderFilterPills(containerId, items, getModelId, activeCategory, onSelect) {
  const bar = document.getElementById(containerId);
  if (!bar) return;

  const counts = {};
  CATEGORIES.forEach((cat) => { counts[cat] = 0; });
  items.forEach((item) => {
    const model = state.models.find((m) => m.id === getModelId(item));
    const cat   = (model && model.category) ? model.category : '';
    if (Object.prototype.hasOwnProperty.call(counts, cat)) counts[cat]++;
  });

  const pills = [
    { label: 'All', value: '', count: items.length },
    ...CATEGORIES.map((cat) => ({ label: cat, value: cat, count: counts[cat] || 0 })),
  ];

  bar.innerHTML =
    `<span class="pill-bar-label">Type:</span>` +
    pills.map(({ label, value, count }) => {
      const isActive = value === activeCategory;
      const isEmpty  = value !== '' && count === 0;
      return `<button type="button" class="pill${isActive ? ' active' : ''}${isEmpty ? ' empty' : ''}" data-cat="${value}">${label} <span class="pill-count">${count}</span></button>`;
    }).join('');

  bar.querySelectorAll('.pill').forEach((btn) => {
    btn.addEventListener('click', () => onSelect(btn.dataset.cat));
  });
}
