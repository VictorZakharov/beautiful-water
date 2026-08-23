import { describe, expect, test } from 'bun:test';
import {
  createRenderPacer,
  formatRenderCap,
  parseRenderCap,
  persistRenderCapPreference,
  readRenderCapPreference,
  RENDER_CAP_STORAGE_KEY,
} from '../../src/core/render-cap.js';

function createStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(RENDER_CAP_STORAGE_KEY, initialValue);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: () => values.get(RENDER_CAP_STORAGE_KEY) ?? null,
  };
}

function countRenderedFrames({ callbackFps, cap, durationMs }) {
  const pacer = createRenderPacer(cap);
  const callbackIntervalMs = 1000 / callbackFps;
  let renderedFrames = 0;
  for (let timestamp = 0; timestamp <= durationMs; timestamp += callbackIntervalMs) {
    if (pacer.shouldRender(timestamp)) renderedFrames += 1;
  }
  return renderedFrames;
}

describe('render cap preference', () => {
  test('accepts only supported caps and serializes uncapped mode', () => {
    expect(parseRenderCap('60')).toBe(60);
    expect(parseRenderCap(144)).toBe(144);
    expect(parseRenderCap('off')).toBeNull();
    expect(parseRenderCap('75')).toBeNull();
    expect(formatRenderCap(null)).toBe('off');
  });

  test('uses the query override and persists user selection', () => {
    const storage = createStorage('120');
    expect(readRenderCapPreference(new URLSearchParams(), storage)).toBe(120);
    expect(readRenderCapPreference(new URLSearchParams('renderCap=60'), storage)).toBe(60);
    expect(persistRenderCapPreference(240, storage)).toBe(240);
    expect(storage.value()).toBe('240');
    expect(persistRenderCapPreference(null, storage)).toBeNull();
    expect(storage.value()).toBe('off');
  });
});

describe('render pacer', () => {
  test('renders every browser callback while uncapped', () => {
    expect(countRenderedFrames({ callbackFps: 144, cap: null, durationMs: 10_000 }))
      .toBeGreaterThan(1_430);
  });

  test('paces a 144 callback stream to an average of 60 rendered FPS', () => {
    const renderedFrames = countRenderedFrames({
      callbackFps: 144,
      cap: 60,
      durationMs: 10_000,
    });
    expect(renderedFrames).toBeGreaterThanOrEqual(599);
    expect(renderedFrames).toBeLessThanOrEqual(602);
  });

  test('never invents frames when callbacks arrive below the selected cap', () => {
    const renderedFrames = countRenderedFrames({
      callbackFps: 60,
      cap: 144,
      durationMs: 10_000,
    });
    expect(renderedFrames).toBeGreaterThanOrEqual(599);
    expect(renderedFrames).toBeLessThanOrEqual(601);
  });

  test('resets pacing immediately when the cap changes or time jumps', () => {
    const pacer = createRenderPacer(30);
    expect(pacer.shouldRender(0)).toBe(true);
    expect(pacer.shouldRender(16.7)).toBe(false);
    expect(pacer.setCap(60)).toBe(60);
    expect(pacer.shouldRender(17)).toBe(true);
    expect(pacer.shouldRender(2_000)).toBe(true);
    expect(pacer.shouldRender(Number.NaN)).toBe(false);
  });
});
