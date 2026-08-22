import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const NATIVE_WIDTH = 3840;
const NATIVE_HEIGHT = 2160;
const WARMUP_MS = 10_000;
const MEASUREMENT_WINDOW_MS = 30_000;
const MEASUREMENT_MARGIN_MS = 500;
const outputDirectory = path.resolve('visual-results');
const sustainRequested = process.env.PERFORMANCE_SUSTAIN === '1';
const targetFps = Number(process.env.PERFORMANCE_TARGET_FPS ?? 144);
const frameBudgetMs = 1000 / targetFps;

function percentile(values, quantile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * quantile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  return sorted[lowerIndex]
    + (sorted[upperIndex] - sorted[lowerIndex]) * (index - lowerIndex);
}

function summarizeTimes(values) {
  return {
    samples: values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    worstMs: values.length > 0 ? Math.max(...values) : null,
  };
}

test('sustains native 4K at target refresh', async ({ browser }, testInfo) => {
  test.skip(
    !sustainRequested,
    'run explicitly with bun run performance:sustain-4k',
  );
  testInfo.setTimeout(90_000);
  const profileView = process.env.PERFORMANCE_VIEW === 'underwater'
    ? { label: 'underwater', query: '&profileView=underwater' }
    : { label: 'surface', query: '' };
  const context = await browser.newContext({
    viewport: { width: NATIVE_WIDTH, height: NATIVE_HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    browserErrors.push(`page: ${error.message}`);
  });
  await page.addInitScript(() => {
    window.__SUSTAIN_FRAME_TIMESTAMPS__ = [];
    const recordFrame = (time) => {
      window.__SUSTAIN_FRAME_TIMESTAMPS__.push(time);
      if (window.__SUSTAIN_FRAME_TIMESTAMPS__.length > 20_000) {
        window.__SUSTAIN_FRAME_TIMESTAMPS__.shift();
      }
      requestAnimationFrame(recordFrame);
    };
    requestAnimationFrame(recordFrame);
  });

  try {
    await page.goto(
      `/?renderer=webgpu&sustain=native-4k${profileView.query}`,
      { waitUntil: 'domcontentloaded', timeout: 20_000 },
    );
    await page.waitForSelector('#app.is-ready', { timeout: 60_000 });
    await page.waitForFunction(
      () => window.__WATER_PERFORMANCE__?.ready === true,
      null,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(WARMUP_MS);

    const baseline = await page.evaluate(() => {
      window.__SUSTAIN_FRAME_TIMESTAMPS__ = [];
      window.__SUSTAIN_CANVAS_CHANGES__ = [];
      window.__SUSTAIN_CANVAS_OBSERVER__?.disconnect();
      const canvas = document.querySelector('canvas');
      window.__SUSTAIN_CANVAS_OBSERVER__ = new MutationObserver(() => {
        window.__SUSTAIN_CANVAS_CHANGES__.push({
          time: performance.now(),
          size: [canvas.width, canvas.height],
        });
      });
      window.__SUSTAIN_CANVAS_OBSERVER__.observe(canvas, {
        attributes: true,
        attributeFilter: ['width', 'height'],
      });
      return window.__WATER_PERFORMANCE__.resetMeasurement();
    });

    await page.waitForTimeout(
      MEASUREMENT_WINDOW_MS + MEASUREMENT_MARGIN_MS,
    );
    const capture = await page.evaluate((windowMs) => {
      window.__SUSTAIN_CANVAS_OBSERVER__?.disconnect();
      const frames = window.__SUSTAIN_FRAME_TIMESTAMPS__;
      const lastTimestamp = frames.at(-1) ?? 0;
      return {
        frames: frames.filter((time) => time >= lastTimestamp - windowMs),
        canvasChanges: window.__SUSTAIN_CANVAS_CHANGES__,
        diagnostics: window.__WATER_PERFORMANCE__.getDiagnostics(),
        renderer: {
          pipeline: document.querySelector('[data-renderer-toggle]')
            ?.dataset.rendererPipeline,
          backend: document.querySelector('[data-renderer-toggle]')
            ?.dataset.rendererBackend,
        },
      };
    }, MEASUREMENT_WINDOW_MS);

    const intervals = capture.frames.slice(1).map(
      (timestamp, index) => timestamp - capture.frames[index],
    );
    const sampleDurationMs = capture.frames.length > 1
      ? capture.frames.at(-1) - capture.frames[0]
      : 0;
    const measuredFps = sampleDurationMs > 0
      ? (intervals.length * 1000) / sampleDurationMs
      : 0;
    const missedRefreshes = intervals.reduce((total, interval) => (
      total + Math.max(0, Math.round(interval / frameBudgetMs) - 1)
    ), 0);
    const expectedRefreshes = intervals.length + missedRefreshes;
    const missedRefreshRate = expectedRefreshes > 0
      ? missedRefreshes / expectedRefreshes
      : 1;
    const presentation = summarizeTimes(intervals);
    const cpuSubmit = summarizeTimes(
      capture.diagnostics.cpuFrameTimes.filter(
        (frameTimeMs) => Number.isFinite(frameTimeMs) && frameTimeMs > 0,
      ),
    );
    const gpuPass = capture.diagnostics.gpu;
    const finalQuality = capture.diagnostics.quality;
    const criteria = {
      nativeWebGpu: capture.renderer.pipeline === 'webgpu'
        && capture.renderer.backend === 'webgpu',
      nativeCanvas: baseline.canvasSize[0] === NATIVE_WIDTH
        && baseline.canvasSize[1] === NATIVE_HEIGHT
        && capture.diagnostics.canvasSize[0] === NATIVE_WIDTH
        && capture.diagnostics.canvasSize[1] === NATIVE_HEIGHT,
      stableCanvas: capture.canvasChanges.length === 0,
      lockedHighQuality: finalQuality.locked === true
        && finalQuality.tier === 'high'
        && finalQuality.pixelRatio === 1
        && finalQuality.renderScale === 1
        && finalQuality.drawingBufferWidth === NATIVE_WIDTH
        && finalQuality.drawingBufferHeight === NATIVE_HEIGHT
        && finalQuality.renderPixels === NATIVE_WIDTH * NATIVE_HEIGHT
        && finalQuality.captureResolution === 768
        && finalQuality.shadowMapResolution === 2048
        && finalQuality.shadowFrameInterval === 1,
      stableQuality: finalQuality.revision === baseline.quality.revision,
      completeWindow: sampleDurationMs >= MEASUREMENT_WINDOW_MS - 100,
      targetAverage: measuredFps >= targetFps * 0.995,
      missedRefreshBudget: missedRefreshRate <= 0.005,
      presentationP95Budget: Number.isFinite(presentation.p95Ms)
        && presentation.p95Ms <= frameBudgetMs * 1.10,
      presentationP99Budget: Number.isFinite(presentation.p99Ms)
        && presentation.p99Ms <= frameBudgetMs * 1.25,
      cpuSubmitBudget: Number.isFinite(cpuSubmit.p95Ms)
        && cpuSubmit.p95Ms <= frameBudgetMs,
      gpuPassBudget: gpuPass.ready === true
        && Number.isFinite(gpuPass.p95FrameTimeMs)
        && gpuPass.p95FrameTimeMs <= frameBudgetMs,
      noBrowserErrors: browserErrors.length === 0,
    };
    const report = {
      complete: true,
      passed: Object.values(criteria).every(Boolean),
      criteria,
      view: profileView.label,
      targetFps,
      frameBudgetMs,
      warmupMs: WARMUP_MS,
      measurementWindowMs: MEASUREMENT_WINDOW_MS,
      renderer: capture.renderer,
      viewport: [NATIVE_WIDTH, NATIVE_HEIGHT],
      baselineCanvasSize: baseline.canvasSize,
      finalCanvasSize: capture.diagnostics.canvasSize,
      canvasChanges: capture.canvasChanges,
      quality: {
        baseline: baseline.quality,
        final: capture.diagnostics.quality,
      },
      presentedFrames: intervals.length,
      sampleDurationMs,
      measuredFps,
      missedRefreshes,
      missedRefreshRate,
      presentation,
      cpuSubmit,
      gpuPass: {
        ready: gpuPass.ready,
        samples: gpuPass.sampleCount,
        p50Ms: gpuPass.medianFrameTimeMs,
        p95Ms: gpuPass.p95FrameTimeMs,
      },
      browserErrors,
    };

    const reportFile = process.env.PERFORMANCE_REPORT_FILE
      ?? 'native-4k-sustain.json';
    testInfo.annotations.push({
      type: `native 4K ${profileView.label} sustain`,
      description: `${measuredFps.toFixed(3)} FPS, ${(missedRefreshRate * 100).toFixed(3)}% missed, frame p99 ${presentation.p99Ms.toFixed(3)} ms`,
    });

    expect(capture.renderer).toEqual({
      pipeline: 'webgpu',
      backend: 'webgpu',
    });
    expect(baseline.canvasSize).toEqual([NATIVE_WIDTH, NATIVE_HEIGHT]);
    expect(capture.diagnostics.canvasSize).toEqual([
      NATIVE_WIDTH,
      NATIVE_HEIGHT,
    ]);
    expect(capture.canvasChanges).toEqual([]);
    expect(capture.diagnostics.quality).toMatchObject({
      locked: true,
      tier: 'high',
      pixelRatio: 1,
      renderScale: 1,
      drawingBufferWidth: NATIVE_WIDTH,
      drawingBufferHeight: NATIVE_HEIGHT,
      renderPixels: NATIVE_WIDTH * NATIVE_HEIGHT,
      captureResolution: 768,
      shadowMapResolution: 2048,
      shadowFrameInterval: 1,
    });
    expect(capture.diagnostics.quality.revision).toBe(
      baseline.quality.revision,
    );
    expect(sampleDurationMs).toBeGreaterThanOrEqual(
      MEASUREMENT_WINDOW_MS - 100,
    );
    expect(measuredFps).toBeGreaterThanOrEqual(targetFps * 0.995);
    expect(missedRefreshRate).toBeLessThanOrEqual(0.005);
    expect(presentation.p95Ms).toBeLessThanOrEqual(frameBudgetMs * 1.10);
    expect(presentation.p99Ms).toBeLessThanOrEqual(frameBudgetMs * 1.25);
    expect(cpuSubmit.p95Ms).toBeLessThanOrEqual(frameBudgetMs);
    expect(gpuPass.ready).toBe(true);
    expect(gpuPass.p95FrameTimeMs).toBeLessThanOrEqual(frameBudgetMs);
    expect(browserErrors, browserErrors.join('\n')).toEqual([]);
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      path.join(outputDirectory, reportFile),
      `${JSON.stringify({ reports: [report] }, null, 2)}\n`,
    );
    console.log(`wrote native-4K ${profileView.label} report`);
    console.log(`passed native-4K ${profileView.label} assertions`);
  } finally {
    console.log(`stopping native-4K ${profileView.label} renderer`);
    await page.evaluate(() => {
      window.__WATER_PERFORMANCE__?.dispose();
    }).catch(() => {});
    console.log(`stopped native-4K ${profileView.label} renderer`);
    await page.waitForTimeout(100).catch(() => {});
    await page.goto('about:blank', {
      waitUntil: 'commit',
      timeout: 5_000,
    }).catch(() => {});
    console.log(`navigated away from native-4K ${profileView.label}`);
    await context.close();
    console.log(`closed native-4K ${profileView.label} context`);
  }
});
