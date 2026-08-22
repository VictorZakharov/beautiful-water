import { describe, expect, test } from 'bun:test';
import {
  createGpuFrameTimer,
  summarizeFrameTimes,
} from '../../src/core/gpu-frame-timer.js';

async function finishTimestampResolution() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('rolling GPU render-pass timing', () => {
  test('reports median and p95 milliseconds without inventing an FPS ceiling', () => {
    const summary = summarizeFrameTimes([4, 1, 3, 2]);

    expect(summary.medianFrameTimeMs).toBe(2.5);
    expect(summary.p95FrameTimeMs).toBeCloseTo(3.85, 6);
  });

  test('rejects invalid timing samples', () => {
    expect(summarizeFrameTimes([0, Number.NaN, 1001])).toEqual({
      medianFrameTimeMs: null,
      p95FrameTimeMs: null,
    });
  });

  test('waits for a complete window and rolls old WebGPU samples out', async () => {
    let currentTime = 0;
    const resolvedTimes = [2, 4, 6, 8];
    const timer = createGpuFrameTimer({
      isWebGPURenderer: true,
      backend: { trackTimestamp: true },
      resolveTimestampsAsync: async () => resolvedTimes.shift(),
    }, {
      sampleInterval: 1,
      windowDurationMs: 10_000,
      now: () => currentTime,
    });

    timer.beginFrame();
    timer.endFrame();
    await finishTimestampResolution();
    expect(timer.getState()).toMatchObject({
      ready: false,
      sampleCount: 1,
      medianFrameTimeMs: 2,
      p95FrameTimeMs: 2,
    });

    currentTime = 5_000;
    timer.beginFrame();
    timer.endFrame();
    await finishTimestampResolution();
    currentTime = 10_000;
    timer.beginFrame();
    timer.endFrame();
    await finishTimestampResolution();
    expect(timer.getState()).toMatchObject({
      ready: true,
      sampleCount: 3,
      medianFrameTimeMs: 4,
      p95FrameTimeMs: 5.8,
    });

    currentTime = 10_001;
    timer.beginFrame();
    timer.endFrame();
    await finishTimestampResolution();
    expect(timer.getState()).toMatchObject({
      ready: true,
      sampleCount: 3,
      medianFrameTimeMs: 6,
      p95FrameTimeMs: 7.8,
    });
  });

  test('resets the measurement window after a pause', async () => {
    let currentTime = 0;
    const timer = createGpuFrameTimer({
      isWebGPURenderer: true,
      backend: { trackTimestamp: true },
      resolveTimestampsAsync: async () => 2.5,
    }, {
      sampleInterval: 1,
      windowDurationMs: 10_000,
      now: () => currentTime,
    });

    timer.beginFrame();
    timer.endFrame();
    await finishTimestampResolution();
    currentTime = 10_000;
    timer.beginFrame();
    timer.endFrame();
    await finishTimestampResolution();
    expect(timer.getState().ready).toBe(true);

    timer.reset();
    expect(timer.getState()).toMatchObject({
      ready: false,
      sampleCount: 0,
      medianFrameTimeMs: null,
      p95FrameTimeMs: null,
    });
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
    expect(timer.getState()).toMatchObject({
      ready: false,
      sampleCount: 1,
      medianFrameTimeMs: 4,
      p95FrameTimeMs: 4,
    });
    timer.dispose();
  });
});
