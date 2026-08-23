export const RENDER_CAP_OPTIONS = Object.freeze([30, 60, 120, 144, 240]);
export const RENDER_CAP_QUERY = 'renderCap';
export const RENDER_CAP_STORAGE_KEY = 'beautiful-water:render-cap';

export function parseRenderCap(value) {
  if (value === null || value === undefined || value === '' || value === 'off' || value === 0) {
    return null;
  }

  const numericValue = Number(value);
  return RENDER_CAP_OPTIONS.includes(numericValue) ? numericValue : null;
}

export function formatRenderCap(value) {
  return parseRenderCap(value) ?? 'off';
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readRenderCapPreference(searchParams, storage = browserStorage()) {
  if (searchParams?.has?.(RENDER_CAP_QUERY)) {
    return parseRenderCap(searchParams.get(RENDER_CAP_QUERY));
  }

  try {
    return parseRenderCap(storage?.getItem?.(RENDER_CAP_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function persistRenderCapPreference(value, storage = browserStorage()) {
  const serialized = String(formatRenderCap(value));
  try {
    storage?.setItem?.(RENDER_CAP_STORAGE_KEY, serialized);
  } catch {}
  return parseRenderCap(serialized);
}

export function createRenderPacer(initialCap = null) {
  let cap = parseRenderCap(initialCap);
  let lastTimestamp = null;
  let nextRenderAt = null;

  function reset() {
    lastTimestamp = null;
    nextRenderAt = null;
  }

  return {
    getCap() {
      return cap;
    },
    setCap(nextCap) {
      cap = parseRenderCap(nextCap);
      reset();
      return cap;
    },
    reset,
    shouldRender(timestamp) {
      if (!Number.isFinite(timestamp)) return false;

      if (cap === null) {
        lastTimestamp = timestamp;
        nextRenderAt = null;
        return true;
      }

      const intervalMs = 1000 / cap;
      if (
        lastTimestamp === null
        || timestamp <= lastTimestamp
        || timestamp - lastTimestamp > 1000
      ) {
        lastTimestamp = timestamp;
        nextRenderAt = timestamp + intervalMs;
        return true;
      }

      lastTimestamp = timestamp;
      const toleranceMs = Math.min(0.5, intervalMs * 0.05);
      if (timestamp + toleranceMs < nextRenderAt) return false;

      const elapsedSlots = Math.floor(
        (timestamp + toleranceMs - nextRenderAt) / intervalMs,
      ) + 1;
      nextRenderAt += elapsedSlots * intervalMs;
      return true;
    },
  };
}
