import {
  formatRenderCap,
  parseRenderCap,
  persistRenderCapPreference,
} from '../core/render-cap.js';

export function createRenderCapControl(root, {
  initialCap = null,
  onChange,
} = {}) {
  const select = root?.querySelector('[data-render-cap-select]');
  if (!root || !select) return null;

  let currentCap = parseRenderCap(initialCap);
  const updateControl = () => {
    const serialized = String(formatRenderCap(currentCap));
    select.value = serialized;
    root.dataset.renderCap = serialized;
  };

  updateControl();
  select.addEventListener('change', () => {
    currentCap = persistRenderCapPreference(select.value);
    updateControl();
    onChange?.(currentCap);
  });
  root.hidden = false;

  return {
    getCap() {
      return currentCap;
    },
    setCap(nextCap) {
      currentCap = parseRenderCap(nextCap);
      updateControl();
      return currentCap;
    },
  };
}
