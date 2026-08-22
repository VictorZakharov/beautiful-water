import { describe, expect, test } from 'bun:test';
import {
  createGpuFrameTimer,
  frameTimeToCapacity,
} from '../../src/core/gpu-frame-timer.js';

describe('GPU frame capacity', () => {
  test('converts hardware frame time without a display refresh cap', () => {
    expect(frameTimeToCapacity(1000 / 240)).toBeCloseTo(240, 6);
    expect(frameTimeToCapacity(1000 / 66)).toBeCloseTo(66, 6);
  });

  test('rejects unavailable timings', () => {
    expect(frameTimeToCapacity(0)).toBeNull();
    expect(frameTimeToCapacity(Number.NaN)).toBeNull();
  });

  test('resolves WebGPU renderer timestamps asynchronously', async () => {
    const timer = createGpuFrameTimer({
      isWebGPURenderer: true,
      backend: { trackTimestamp: true },
      resolveTimestampsAsync: async () => 2.5,
    }, { sampleInterval: 1 });

    timer.beginFrame();
    timer.endFrame();
    await Promise.resolve();
    await Promise.resolve();

    expect(timer.supported).toBe(true);
    expect(timer.getState().frameTimeMs).toBe(2.5);
    expect(timer.getState().capacityFps).toBe(400);
  });

  test('polls non-blocking WebGL timer queries', () => {
    const query = {};
    const extension = {
      TIME_ELAPSED_EXT: 0x88bf,
      GPU_DISJOINT_EXT: 0x8fbb,
    };
    const gl = {
      QUERY_RESULT_AVAILABLE: 0x8867,
      QUERY_RESULT: 0x8866,
      getExtension: () => extension,
      createQuery: () => query,
      beginQuery: () => {},
      endQuery: () => {},
      deleteQuery: () => {},
      getParameter: () => false,
      getQueryParameter: (_query, parameter) => (
        parameter === 0x8867 ? true : 4_000_000
      ),
    };
    const timer = createGpuFrameTimer({
      isWebGPURenderer: false,
      getContext: () => gl,
    });

    timer.beginFrame();
    timer.endFrame();
    timer.beginFrame();

    expect(timer.supported).toBe(true);
    expect(timer.getState().frameTimeMs).toBe(4);
    expect(timer.getState().capacityFps).toBe(250);
    timer.dispose();
  });
});
