import { describe, expect, test } from 'bun:test';
import {
  createHistoryPath,
  createPresentationMonitor,
  formatPerformanceReport,
} from '../../src/core/presentation-monitor.js';

function recordDuration(monitor, startTime, durationMs, fps) {
  const frameTimeMs = 1000 / fps;
  const endTime = startTime + durationMs;
  let timestamp = startTime;
  while (timestamp + frameTimeMs <= endTime + 0.0001) {
    timestamp += frameTimeMs;
    monitor.recordFrame(timestamp);
    monitor.recordCpuFrame(timestamp, 1.5);
  }
  return timestamp;
}

describe('rolling presentation monitor', () => {
  test('reports a steady 144 Hz presentation window', () => {
    const monitor = createPresentationMonitor();
    monitor.recordFrame(0);
    const timestamp = recordDuration(monitor, 0, 16_000, 144);
    const state = monitor.getState(timestamp);

    expect(state.ready).toBe(true);
    expect(state.refreshRateFps).toBe(144);
    expect(state.averageFps).toBeCloseTo(144, 0);
    expect(state.p50FrameTimeMs).toBeCloseTo(1000 / 144, 3);
    expect(state.p95FrameTimeMs).toBeCloseTo(1000 / 144, 3);
    expect(state.onePercentLowFps).toBeCloseTo(144, 0);
    expect(state.worstOneSecondFps).toBeGreaterThan(140);
    expect(state.missedRefreshes).toBe(0);
    expect(state.cpuFrame).toMatchObject({
      p50Ms: 1.5,
      p95Ms: 1.5,
      worstMs: 1.5,
    });
    expect(state.series).toHaveLength(30);
  });

  test('preserves the detected refresh rate through a sustained slowdown', () => {
    const monitor = createPresentationMonitor();
    monitor.recordFrame(0);
    let timestamp = recordDuration(monitor, 0, 5_000, 144);
    timestamp = recordDuration(monitor, timestamp, 10_000, 15);
    const state = monitor.getState(timestamp);

    expect(state.refreshRateFps).toBe(144);
    expect(state.averageFps).toBeGreaterThan(40);
    expect(state.averageFps).toBeLessThan(60);
    expect(state.onePercentLowFps).toBeCloseTo(15, 0);
    expect(state.worstOneSecondFps).toBeLessThanOrEqual(16);
    expect(state.p95FrameTimeMs).toBeCloseTo(1000 / 15, 1);
    expect(state.missedRefreshes).toBeGreaterThan(1_000);
    expect(state.missedRefreshRate).toBeGreaterThan(0.5);
  });

  test('keeps a complete stall visible after frames resume', () => {
    const monitor = createPresentationMonitor();
    monitor.recordFrame(0);
    let timestamp = recordDuration(monitor, 0, 2_000, 144);
    timestamp += 10_000;
    monitor.recordFrame(timestamp);
    const state = monitor.getState(timestamp);

    expect(state.refreshRateFps).toBe(144);
    expect(state.worstFrameTimeMs).toBeGreaterThanOrEqual(10_000);
    expect(state.worstOneSecondFps).toBe(0);
    expect(state.missedRefreshes).toBeGreaterThan(1_400);
  });

  test('resets stale frame and refresh history after a visibility pause', () => {
    const monitor = createPresentationMonitor();
    monitor.recordFrame(0);
    const timestamp = recordDuration(monitor, 0, 1_000, 60);
    expect(monitor.getState(timestamp).refreshRateFps).toBe(60);

    monitor.reset();
    expect(monitor.getState(timestamp)).toMatchObject({
      ready: false,
      sampleCount: 0,
      refreshRateFps: null,
      averageFps: null,
    });
  });

  test('creates a bounded SVG path with gaps for unavailable history', () => {
    const path = createHistoryPath([
      { fps: null },
      { fps: 144 },
      { fps: 72 },
      { fps: 0 },
    ], {
      width: 120,
      height: 30,
      targetFps: 144,
    });

    expect(path).toBe('M40.00 0.00 L80.00 15.00 L120.00 30.00');
    expect(path).not.toContain('NaN');
  });

  test('formats a self-contained copyable diagnostic report', () => {
    const monitor = createPresentationMonitor();
    monitor.recordFrame(0);
    const timestamp = recordDuration(monitor, 0, 15_000, 60);
    const report = formatPerformanceReport({
      capturedAt: '2026-08-22T19:00:00.000Z',
      presentation: monitor.getState(timestamp),
      gpu: {
        ready: true,
        sampleCount: 12,
        windowDurationMs: 10_000,
        windowElapsedMs: 10_000,
        medianFrameTimeMs: 2.06,
        p95FrameTimeMs: 2.82,
      },
      renderer: {
        pipeline: 'webgpu',
        backend: 'webgpu',
        adapter: 'NVIDIA RTX 4070 Ti',
      },
      canvas: {
        drawingBufferWidth: 3840,
        drawingBufferHeight: 2160,
        cssWidth: 1920,
        cssHeight: 1080,
      },
      quality: {
        tier: 'high',
        renderScale: 1,
        captureResolution: 768,
        shadowMapResolution: 2048,
        shadowFrameInterval: 1,
        revision: 3,
      },
      scene: 'surface',
      drawCalls: 42,
      triangles: 123_456,
      pageState: {
        visibility: 'visible',
        focused: true,
        devicePixelRatio: 2,
      },
      pageUrl: 'https://example.test/',
      userAgent: 'Test Browser',
    });

    expect(report).toContain('Beautiful Water performance report');
    expect(report).toContain('Window: last 15.00 s of 15 s');
    expect(report).toContain('1% low');
    expect(report).toContain('CPU frame work: p50 1.50 ms');
    expect(report).toContain('p50 2.06 ms | p95 2.82 ms');
    expect(report).toContain('webgpu pipeline / webgpu backend');
    expect(report).toContain('3840x2160 drawing buffer');
    expect(report).toContain('NVIDIA RTX 4070 Ti');
    expect(report).toContain('Page state: visible | focused | DPR 2.00');
    expect(report).not.toContain('undefined');
    expect(report.split('\n').length).toBeGreaterThan(10);
  });
});
