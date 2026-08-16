import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { measureNormalizedImageDifference } from './screenshot-metrics.js';
import { measureWaveFieldCorrelation } from './wave-field.js';

const rendererMode = process.env.RENDERER_MODE ?? 'webgpu';
if (!['webgpu', 'webgl'].includes(rendererMode)) {
  throw new Error(`Unknown renderer mode: ${rendererMode}`);
}
const outputDirectory = path.resolve('visual-results', rendererMode);
const fixedTime = 11.75;
const views = [
  {
    name: 'sun-facing',
    position: [8.4, 3.1, 11.7],
    target: [0, 0.35, 0],
  },
  {
    name: 'sun-facing-low',
    position: [8.4, 1.05, 11.7],
    target: [0, 0.18, 0],
  },
  {
    name: 'sun-glitter-offset',
    position: [10.6, 1.2, 13.3],
    target: [0, 0.18, 0],
  },
  {
    name: 'foam-detail',
    position: [5.3, 2.2, 7.4],
    target: [0, 0.12, 0],
  },
  {
    name: 'foam-detail-forming',
    position: [5.3, 2.2, 7.4],
    target: [0, 0.12, 0],
    time: 12.05,
  },
  {
    name: 'foam-detail-later',
    position: [5.3, 2.2, 7.4],
    target: [0, 0.12, 0],
    time: 12.35,
  },
  {
    name: 'foam-detail-transition',
    position: [5.3, 2.2, 7.4],
    target: [0, 0.12, 0],
    time: 15.25,
  },
  {
    name: 'foam-detail-replaced',
    position: [5.3, 2.2, 7.4],
    target: [0, 0.12, 0],
    time: 20.25,
  },
  {
    name: 'cross-sun-east',
    position: [11.7, 1.05, -8.4],
    target: [0, 0.18, 0],
  },
  {
    name: 'cross-sun-west',
    position: [-11.7, 1.05, 8.4],
    target: [0, 0.18, 0],
  },
  {
    name: 'opposite-sun',
    position: [-8.4, 2.7, -11.7],
    target: [0, 0.28, 0],
  },
  {
    name: 'top-down',
    position: [0.02, 18, 0.02],
    target: [0, 0, 0],
  },
  {
    name: 'wide-high',
    position: [28, 28, 26],
    target: [0, 0, 0],
  },
  {
    name: 'repetition-wide-wind',
    position: [0.4, 15.0, 42.5],
    target: [0, 0.12, 0],
  },
  {
    name: 'repetition-wide-crosswind',
    position: [36.5, 16.0, -21.5],
    target: [0, 0.12, 0],
  },
  {
    name: 'reference-medium',
    position: [10.5, 4.4, 15.5],
    target: [0, 0.22, 0],
  },
  {
    name: 'reference-wide',
    position: [24, 10.5, 30],
    target: [0, 0.15, 0],
  },
  {
    name: 'underwater',
    position: [7.5, -2.15, 9.8],
    target: [0, -1.75, 0],
  },
  {
    name: 'underwater-fish-calm',
    position: [4.2, -1.9, 8.0],
    target: [4.0, -1.8, 3.5],
    time: 11.9,
    settle: 5.8,
  },
  {
    name: 'underwater-fish-startled',
    position: [4.1, -1.8, 6.3],
    target: [4.0, -1.9, 3.4],
    time: 17.85,
    settle: 0.9,
  },
];

const visualSuite = process.env.VISUAL_SUITE ?? 'all';
const ciSceneNames = new Set([
  'sun-facing-low',
  'cross-sun-east',
  'opposite-sun',
  'top-down',
  'repetition-wide-crosswind',
  'underwater',
  'underwater-fish-startled',
]);
const visualSuites = {
  all: views,
  'ci-scene': views.filter((view) => ciSceneNames.has(view.name)),
  'scene-matrix': views.filter((view) => view.name !== 'underwater-fish-calm'),
  'fish-habituation': views.filter((view) => view.name === 'underwater-fish-calm'),
  'renderer-parity': [],
};
if (!Object.hasOwn(visualSuites, visualSuite)) {
  throw new Error(`Unknown visual suite: ${visualSuite}`);
}
const captureViews = visualSuites[visualSuite];
const fastCaptureSuite = visualSuite === 'ci-scene';
const requiredCiSuite = ['ci-scene', 'fish-habituation'].includes(visualSuite);
const rendererQuery = `renderer=${rendererMode}`;

const fourKTest = ['all', 'scene-matrix'].includes(visualSuite) ? test : test.skip;
fourKTest('keeps a 4K display inside its adaptive render budget', async ({ page }, testInfo) => {
  testInfo.setTimeout(5 * 60_000);
  await page.setViewportSize({ width: 3840, height: 2160 });

  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));

  await page.goto(`/?harness=1&gpuClass=integrated&${rendererQuery}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForFunction(
    () => window.__WATER_HARNESS__?.ready === true,
    undefined,
    { timeout: 4 * 60_000 },
  );
  await page.addStyleTag({
    content: '.loader, .fps, .renderer-toggle { display: none !important; }',
  });

  const initial = await page.evaluate(() => window.__WATER_HARNESS__.getDiagnostics());
  expect([initial.quality.width, initial.quality.height]).toEqual([3840, 2160]);
  expect(initial.quality.gpuClass).toBe('integrated');
  expect(initial.quality.renderPixels).toBeLessThanOrEqual(
    initial.quality.pixelBudget * 1.002,
  );
  expect(initial.quality.renderPixels).toBeLessThan(3840 * 2160);
  expect(initial.quality.canvasSize).toEqual([
    initial.quality.drawingBufferWidth,
    initial.quality.drawingBufferHeight,
  ]);
  expect(initial.quality.antialias).toBe(false);
  expect(initial.quality.ocean.captureResolution).toBeLessThanOrEqual(640);
  if (rendererMode === 'webgl') {
    expect(initial.quality.ocean.reflectionSize).toEqual(
      [initial.quality.ocean.captureResolution, initial.quality.ocean.captureResolution],
    );
    expect(initial.quality.ocean.refractionSize).toEqual(
      [initial.quality.ocean.captureResolution, initial.quality.ocean.captureResolution],
    );
  } else {
    expect(initial.quality.ocean.captureStrategy).toBe('reflector-node');
  }
  expect(initial.quality.environment.shadowMapResolution).toBeLessThanOrEqual(1024);
  if (rendererMode === 'webgpu') {
    expect(initial.quality.environment.shadowAutoUpdate).toBe(false);
  }

  const screenshotPath = path.join(outputDirectory, 'adaptive-4k.png');
  await mkdir(outputDirectory, { recursive: true });
  await page.screenshot({ path: screenshotPath, animations: 'disabled' });
  await testInfo.attach('adaptive-4k', {
    path: screenshotPath,
    contentType: 'image/png',
  });

  const reduced = await page.evaluate(
    () => window.__WATER_HARNESS__.samplePerformance({ fps: 8, samples: 7 }),
  );
  expect(reduced.quality.renderPixels).toBeLessThan(initial.quality.renderPixels);
  expect(reduced.quality.pixelBudget).toBe(reduced.quality.minimumPixelBudget);
  const recovering = await page.evaluate(
    () => window.__WATER_HARNESS__.samplePerformance({ fps: 60, samples: 12 }),
  );
  expect(recovering.quality.renderPixels).toBeGreaterThan(reduced.quality.renderPixels);
  expect(recovering.quality.renderPixels).toBeLessThanOrEqual(
    recovering.quality.maximumPixelBudget * 1.002,
  );

  await writeFile(
    path.join(outputDirectory, 'adaptive-4k.json'),
    `${JSON.stringify({ initial, reduced, recovering }, null, 2)}\n`,
  );
  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
});

const captureTest = visualSuite === 'renderer-parity' ? test.skip : test;
captureTest('capture ocean regression views', async ({ page }, testInfo) => {
  const waveCorrelations = [0, fixedTime, 29.5].map((time) => ({
    time,
    ...measureWaveFieldCorrelation({ time }),
  }));
  for (const waveCorrelation of waveCorrelations) {
    expect(
      waveCorrelation.correlation,
      `wave field at ${waveCorrelation.time}s repeats after ${waveCorrelation.distance.toFixed(1)} m`,
    ).toBeLessThan(0.48);
  }

  await page.addInitScript(() => {
    window.__LOADER_TRACE__ = [];
    window.__LOADER_FRAMES__ = [];
    document.addEventListener('DOMContentLoaded', () => {
      const app = document.querySelector('#app');
      const loader = app?.querySelector('.loader');
      const status = loader?.querySelector('.loader__status');
      if (!app || !loader || !status) return;

      const record = () => {
        const entry = {
          time: performance.now(),
          progress: Number(loader.style.getPropertyValue('--loader-progress') || 0),
          status: status.textContent,
          ready: app.classList.contains('is-ready'),
        };
        const previous = window.__LOADER_TRACE__.at(-1);
        if (
          !previous
          || previous.progress !== entry.progress
          || previous.status !== entry.status
          || previous.ready !== entry.ready
        ) {
          window.__LOADER_TRACE__.push(entry);
        }
      };

      record();
      const recordFrame = (time) => {
        window.__LOADER_FRAMES__.push(time);
        if (!app.classList.contains('is-ready')) requestAnimationFrame(recordFrame);
      };
      requestAnimationFrame(recordFrame);
      new MutationObserver(record).observe(app, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
    });
  });

  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));

  await page.goto(`/?harness=1&${rendererQuery}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForFunction(
    () => window.__WATER_HARNESS__?.ready === true,
    undefined,
    // Native adapters are usually ready in a few seconds. Windows CI uses
    // Microsoft WARP, where first-time TSL compilation can exceed 20 seconds.
    { timeout: 35_000 },
  );

  const graphicsRenderer = await page.evaluate(() => {
    const diagnostics = window.__WATER_HARNESS__.getDiagnostics();
    if (diagnostics.renderer.backend === 'webgpu') {
      return diagnostics.renderer.adapter || 'WebGPU adapter';
    }
    const canvas = document.querySelector('canvas');
    const context = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!context) return 'Unavailable WebGL renderer';
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
    return debugInfo
      ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : context.getParameter(context.RENDERER);
  });
  const softwareRenderer = /basic render|llvmpipe|software|swiftshader|warp/i
    .test(graphicsRenderer);
  if (softwareRenderer && !requiredCiSuite) testInfo.setTimeout(8 * 60_000);
  // Hosted runners can rasterize the first ocean frame on the CPU. The full
  // local harness permits that deterministic warm-up, while required CI
  // suites retain the default one-minute test cap inside their two-minute job.
  const loaderFrameGapBudget = softwareRenderer ? 6_000 : 500;
  const loaderRuntime = await page.evaluate(() => ({
    trace: window.__LOADER_TRACE__,
    frames: window.__LOADER_FRAMES__,
  }));
  const loaderTrace = loaderRuntime.trace;
  const loaderFrameGaps = loaderRuntime.frames.slice(1).map((time, index) => ({
    duration: time - loaderRuntime.frames[index],
    start: loaderRuntime.frames[index],
    end: time,
  }));
  const worstLoaderGap = loaderFrameGaps.reduce((worst, gap) => (
    gap.duration > worst.duration ? gap : worst
  ), { duration: 0, start: 0, end: 0 });
  const stageAtWorstGap = loaderTrace.findLast(
    (entry) => entry.time <= worstLoaderGap.start,
  )?.status ?? 'Before loader trace';
  const maxLoaderFrameGap = worstLoaderGap.duration;
  const loaderDuration = loaderTrace.at(-1).time - loaderTrace[0].time;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, 'startup.json'),
    `${JSON.stringify({
      trace: loaderTrace,
      frameCount: loaderRuntime.frames.length,
      graphicsRenderer,
      frameGapBudget: loaderFrameGapBudget,
      suite: visualSuite,
      maxFrameGap: maxLoaderFrameGap,
      worstFrameGap: { ...worstLoaderGap, stage: stageAtWorstGap },
    }, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDirectory, 'wave-field.json'),
    `${JSON.stringify(waveCorrelations, null, 2)}\n`,
  );
  const observedStages = loaderTrace.map((entry) => entry.status);
  let previousStage = -1;
  for (const stage of [
    'Preparing simulation',
    'Compiling water and reflections',
    'Warming reflection',
    'Warming refraction',
    'Opening water',
    'Open water ready',
  ]) {
    const stageIndex = observedStages.indexOf(stage);
    expect(stageIndex, `loader stage: ${stage}`).toBeGreaterThan(previousStage);
    previousStage = stageIndex;
  }
  expect(loaderTrace[0].ready, 'loader starts before the scene is revealed').toBe(false);
  expect(loaderTrace.at(-1).ready, 'scene is revealed after warmup').toBe(true);
  expect(loaderTrace.at(-1).progress, 'loader reaches completion').toBe(1);
  expect(
    loaderTrace.every((entry, index) => (
      index === 0 || entry.progress >= loaderTrace[index - 1].progress
    )),
    'loader progress is monotonic',
  ).toBe(true);
  expect(
    loaderDuration,
    'startup yields enough time for the loader to paint',
  ).toBeGreaterThan(16);
  expect(loaderRuntime.frames.length, 'loader paints during async compilation')
    .toBeGreaterThanOrEqual(3);
  expect(
    maxLoaderFrameGap,
    `capture warm-up exceeded ${loaderFrameGapBudget}ms on ${graphicsRenderer}`,
  ).toBeLessThan(loaderFrameGapBudget);

  await page.addStyleTag({
    content: '.loader, .fps, .renderer-toggle { display: none !important; }',
  });

  const manifest = [];
  for (const view of captureViews) {
    testInfo.annotations.push({ type: 'capture', description: view.name });
    const captureTime = view.time ?? fixedTime;
    let diagnostics = await page.evaluate(
      (preset) => window.__WATER_HARNESS__.setView(preset),
      {
        ...view,
        time: captureTime,
        renderPasses: fastCaptureSuite ? 1 : 2,
      },
    );
    if (view.settle) {
      diagnostics = await page.evaluate(
        (duration) => window.__WATER_HARNESS__.advance({ duration }),
        view.settle,
      );
    }
    expect(diagnostics.underwater, `${view.name} medium`).toBe(
      view.name.startsWith('underwater'),
    );
    expect(diagnostics.programs, `${view.name} shader programs`).toBeGreaterThan(0);
    expect(diagnostics.triangles, `${view.name} rendered triangles`).toBeGreaterThan(0);
    expect(diagnostics.controls, `${view.name} buoy-centered controls`).toEqual({
      orbitPivot: 'buoy',
      panEnabled: false,
      zoomToCursor: false,
    });
    expect(diagnostics.fish.count, `${view.name} fish count`).toBe(45);
    expect(diagnostics.renderer.preferred, `${view.name} renderer preference`).toBe(rendererMode);
    expect(diagnostics.renderer.pipeline, `${view.name} renderer pipeline`).toBe(rendererMode);
    if (view.name === 'underwater-fish-calm') {
      expect(diagnostics.fish.calmness, 'fish habituate to a still camera').toBeGreaterThan(0.75);
      expect(diagnostics.fish.curiousNearby, 'curious fish remain nearby').toBeGreaterThan(0);
      expect(diagnostics.fish.averageSpeed, 'fish visibly cruise').toBeGreaterThan(0.55);
      expect(diagnostics.fish.averageTailHz, 'tail cadence stays measured').toBeLessThan(1.15);
    }
    if (view.name === 'underwater-fish-startled') {
      expect(diagnostics.fish.nearbyCount, 'fish notice the arriving camera').toBeGreaterThan(0);
      expect(
        diagnostics.fish.fleeingCount / diagnostics.fish.nearbyCount,
        'most nearby fish swim away',
      ).toBeGreaterThan(0.5);
      expect(
        diagnostics.fish.averageRadialVelocity,
        'the escape burst is visibly faster than cruising drift',
      ).toBeGreaterThan(0.55);
      expect(diagnostics.fish.calmness, 'a fast approach resets habituation').toBeLessThan(0.1);
    }
    const screenshotPath = path.join(outputDirectory, `${view.name}.png`);
    await page.screenshot({
      path: screenshotPath,
      animations: 'disabled',
      fullPage: false,
    });
    await testInfo.attach(view.name, {
      path: screenshotPath,
      contentType: 'image/png',
    });
    manifest.push({ ...view, time: captureTime, diagnostics });
  }

  await writeFile(
    path.join(outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
});

const parityTest = visualSuite === 'renderer-parity' ? test : test.skip;
// The renderer preference has fast unit coverage in CI, while this integration
// probe remains available locally. Booting a second full software-rendered
// scene consumed roughly a quarter of the two-minute visual-job budget.
const fallbackIntegrationTest = visualSuite === 'renderer-parity' && !process.env.CI
  ? test
  : test.skip;
fallbackIntegrationTest('defaults to WebGPU and falls back through the node pipeline', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'gpu', {
      configurable: true,
      get: () => undefined,
    });
  });
  await page.goto('/?harness=1&gpuClass=integrated', {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForFunction(
    () => window.__WATER_HARNESS__?.ready === true,
    undefined,
    { timeout: 20_000 },
  );
  const diagnostics = await page.evaluate(
    () => window.__WATER_HARNESS__.getDiagnostics(),
  );
  expect(diagnostics.renderer.preferred).toBe('webgpu');
  expect(diagnostics.renderer.pipeline).toBe('webgpu');
  expect(diagnostics.renderer.backend).toBe('webgl2');
  expect(diagnostics.renderer.fallbackReason).toContain('WebGPU unavailable');
});

parityTest('captures WebGL and WebGPU side by side', async ({ page }, testInfo) => {
  testInfo.setTimeout(80_000);
  const parityDirectory = path.resolve('visual-results', 'parity');
  const parityViews = views.filter(({ name }) => [
    'sun-facing-low',
    'reference-medium',
    'top-down',
    'underwater',
  ].includes(name));
  const captures = new Map();
  const transitionCaptures = new Map();
  const diagnosticsByMode = {};
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));

  await mkdir(parityDirectory, { recursive: true });
  for (const mode of ['webgl', 'webgpu']) {
    await page.goto(`/?harness=1&gpuClass=discrete&renderer=${mode}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    await page.waitForFunction(
      () => window.__WATER_HARNESS__?.ready === true,
      undefined,
      { timeout: 20_000 },
    );
    await page.addStyleTag({
      content: '.loader, .fps, .renderer-toggle { display: none !important; }',
    });

    diagnosticsByMode[mode] = await page.evaluate(
      () => window.__WATER_HARNESS__.getDiagnostics(),
    );
    expect(diagnosticsByMode[mode].renderer.pipeline).toBe(mode);
    for (const view of parityViews) {
      const captureTime = view.time ?? fixedTime;
      await page.evaluate(
        (preset) => window.__WATER_HARNESS__.setView(preset),
        { ...view, time: captureTime, renderPasses: 2 },
      );
      const screenshot = await page.screenshot({
        animations: 'disabled',
        fullPage: false,
      });
      captures.set(`${mode}:${view.name}`, screenshot);
      await writeFile(
        path.join(parityDirectory, `${view.name}-${mode}.png`),
        screenshot,
      );
    }

    for (const underwaterBlend of [0.49, 0.51]) {
      const diagnostics = await page.evaluate(
        (preset) => window.__WATER_HARNESS__.setView(preset),
        {
          position: [8.4, -0.14, 11.7],
          target: [0, -0.14, 0],
          time: fixedTime,
          renderPasses: 1,
          underwaterBlend,
        },
      );
      expect(diagnostics.underwaterMix).toBeCloseTo(underwaterBlend, 5);
      const screenshot = await page.screenshot({
        animations: 'disabled',
        fullPage: false,
      });
      const key = `${mode}:${underwaterBlend.toFixed(2)}`;
      transitionCaptures.set(key, screenshot);
      const transitionPath = path.join(
        parityDirectory,
        `waterline-transition-${underwaterBlend.toFixed(2)}-${mode}.png`,
      );
      await writeFile(transitionPath, screenshot);
      await testInfo.attach(`${mode} waterline ${underwaterBlend.toFixed(2)}`, {
        path: transitionPath,
        contentType: 'image/png',
      });
    }
  }

  const transitionMetrics = {};
  for (const mode of ['webgl', 'webgpu']) {
    const crossing = await measureNormalizedImageDifference(
      page,
      transitionCaptures.get(`${mode}:0.49`),
      transitionCaptures.get(`${mode}:0.51`),
    );
    transitionMetrics[mode] = { crossing };
    expect(
      crossing,
      `${mode} crosses the waterline without a frame-sized visual discontinuity`,
    ).toBeLessThan(0.045);
  }

  const metrics = [];
  for (const view of parityViews) {
    const webGl = captures.get(`webgl:${view.name}`).toString('base64');
    const webGpu = captures.get(`webgpu:${view.name}`).toString('base64');
    const comparison = await page.evaluate(async ({ webGlBase64, webGpuBase64, name }) => {
      const loadImage = (source) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = source;
      });
      const [left, right] = await Promise.all([
        loadImage(`data:image/png;base64,${webGlBase64}`),
        loadImage(`data:image/png;base64,${webGpuBase64}`),
      ]);
      const width = left.naturalWidth;
      const height = left.naturalHeight;
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = width;
      sampleCanvas.height = height;
      const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
      sampleContext.drawImage(left, 0, 0);
      const leftPixels = sampleContext.getImageData(0, 0, width, height).data;
      sampleContext.clearRect(0, 0, width, height);
      sampleContext.drawImage(right, 0, 0);
      const rightPixels = sampleContext.getImageData(0, 0, width, height).data;

      const measureSunPath = (pixels) => {
        if (!['sun-facing-low', 'reference-medium'].includes(name)) return null;
        const luminanceAt = (x, y) => {
          const offset = (y * width + x) * 4;
          return pixels[offset] * 0.2126
            + pixels[offset + 1] * 0.7152
            + pixels[offset + 2] * 0.0722;
        };
        const startY = Math.floor(height * 0.31);
        const endY = Math.floor(height * 0.72);
        const centerStart = Math.floor(width * 0.44);
        const centerEnd = Math.floor(width * 0.56);
        const sideRanges = [
          [Math.floor(width * 0.25), Math.floor(width * 0.37)],
          [Math.floor(width * 0.63), Math.floor(width * 0.75)],
        ];
        let contrastSum = 0;
        let highlighted = 0;
        let samples = 0;
        const positiveContrasts = [];
        for (let y = startY; y < endY; y += 3) {
          let sideLuminance = 0;
          let sideSamples = 0;
          for (const [startX, endX] of sideRanges) {
            for (let x = startX; x < endX; x += 3) {
              sideLuminance += luminanceAt(x, y);
              sideSamples += 1;
            }
          }
          const rowBaseline = sideLuminance / sideSamples;
          for (let x = centerStart; x < centerEnd; x += 3) {
            const contrast = Math.max(luminanceAt(x, y) - rowBaseline, 0);
            contrastSum += contrast;
            positiveContrasts.push(contrast);
            if (contrast > 15) highlighted += 1;
            samples += 1;
          }
        }
        positiveContrasts.sort((a, b) => a - b);
        return {
          meanContrast: contrastSum / samples / 255,
          highlightCoverage: highlighted / samples,
          upperDecileContrast: positiveContrasts[
            Math.floor(positiveContrasts.length * 0.9)
          ] / 255,
        };
      };
      const webGlSunPath = measureSunPath(leftPixels);
      const webGpuSunPath = measureSunPath(rightPixels);

      const measureSkyDetail = (pixels) => {
        if (!['sun-facing-low', 'reference-medium'].includes(name)) return null;
        const luminanceAt = (x, y) => {
          const offset = (y * width + x) * 4;
          return pixels[offset] * 0.2126
            + pixels[offset + 1] * 0.7152
            + pixels[offset + 2] * 0.0722;
        };
        const startX = Math.floor(width * 0.03);
        const endX = Math.floor(width * 0.97);
        const startY = Math.floor(height * 0.03);
        const endY = Math.floor(height * 0.36);
        let detailSum = 0;
        let detailedPixels = 0;
        let samples = 0;
        for (let y = startY + 2; y < endY - 2; y += 2) {
          for (let x = startX + 2; x < endX - 2; x += 2) {
            const center = luminanceAt(x, y);
            const neighborMean = (
              luminanceAt(x - 2, y)
              + luminanceAt(x + 2, y)
              + luminanceAt(x, y - 2)
              + luminanceAt(x, y + 2)
            ) * 0.25;
            const detail = Math.abs(center - neighborMean);
            detailSum += detail;
            if (detail > 2.0) detailedPixels += 1;
            samples += 1;
          }
        }
        return {
          meanLaplacian: detailSum / samples / 255,
          edgeCoverage: detailedPixels / samples,
        };
      };
      const webGlSkyDetail = measureSkyDetail(leftPixels);
      const webGpuSkyDetail = measureSkyDetail(rightPixels);

      let absoluteError = 0;
      let luminanceError = 0;
      let similarPixels = 0;
      const pixelCount = width * height;
      for (let offset = 0; offset < leftPixels.length; offset += 4) {
        const red = Math.abs(leftPixels[offset] - rightPixels[offset]);
        const green = Math.abs(leftPixels[offset + 1] - rightPixels[offset + 1]);
        const blue = Math.abs(leftPixels[offset + 2] - rightPixels[offset + 2]);
        absoluteError += (red + green + blue) / 3;
        luminanceError += Math.abs(
          leftPixels[offset] * 0.2126
          + leftPixels[offset + 1] * 0.7152
          + leftPixels[offset + 2] * 0.0722
          - rightPixels[offset] * 0.2126
          - rightPixels[offset + 1] * 0.7152
          - rightPixels[offset + 2] * 0.0722,
        );
        if (Math.max(red, green, blue) <= 32) similarPixels += 1;
      }

      const labelHeight = 38;
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = width * 2;
      outputCanvas.height = height + labelHeight;
      const output = outputCanvas.getContext('2d');
      output.fillStyle = '#061923';
      output.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
      output.drawImage(left, 0, labelHeight);
      output.drawImage(right, width, labelHeight);
      output.fillStyle = '#b8f3e4';
      output.font = '600 18px system-ui, sans-serif';
      output.fillText(`WebGL reference - ${name}`, 14, 25);
      const normalizedError = absoluteError / pixelCount / 255;
      output.fillText(
        `WebGPU candidate - MAE ${(normalizedError * 100).toFixed(2)}%`,
        width + 14,
        25,
      );
      if (webGlSunPath && webGpuSunPath) {
        output.font = '500 13px system-ui, sans-serif';
        output.fillText(
          `sun-path contrast ${(webGpuSunPath.meanContrast * 100).toFixed(2)}%`
            + ` (WebGL ${(webGlSunPath.meanContrast * 100).toFixed(2)}%)`,
          width + 350,
          25,
        );
      }
      output.fillStyle = '#62d8c7';
      output.fillRect(width - 1, 0, 2, outputCanvas.height);

      return {
        image: outputCanvas.toDataURL('image/png').split(',')[1],
        meanAbsoluteError: normalizedError,
        meanLuminanceError: luminanceError / pixelCount / 255,
        similarPixelRatio: similarPixels / pixelCount,
        sunPath: webGlSunPath && webGpuSunPath
          ? { webgl: webGlSunPath, webgpu: webGpuSunPath }
          : null,
        skyDetail: webGlSkyDetail && webGpuSkyDetail
          ? { webgl: webGlSkyDetail, webgpu: webGpuSkyDetail }
          : null,
      };
    }, { webGlBase64: webGl, webGpuBase64: webGpu, name: view.name });

    const comparisonPath = path.join(parityDirectory, `${view.name}-comparison.png`);
    await writeFile(comparisonPath, Buffer.from(comparison.image, 'base64'));
    await testInfo.attach(`${view.name} renderer parity`, {
      path: comparisonPath,
      contentType: 'image/png',
    });
    metrics.push({
      view: view.name,
      meanAbsoluteError: comparison.meanAbsoluteError,
      meanLuminanceError: comparison.meanLuminanceError,
      similarPixelRatio: comparison.similarPixelRatio,
      sunPath: comparison.sunPath,
      skyDetail: comparison.skyDetail,
    });
  }

  await writeFile(
    path.join(parityDirectory, 'metrics.json'),
    `${JSON.stringify({ diagnosticsByMode, metrics, transitionMetrics }, null, 2)}\n`,
  );
  const meanAbsoluteError = metrics.reduce(
    (sum, metric) => sum + metric.meanAbsoluteError,
    0,
  ) / metrics.length;
  const meanSimilarPixelRatio = metrics.reduce(
    (sum, metric) => sum + metric.similarPixelRatio,
    0,
  ) / metrics.length;
  expect(
    meanAbsoluteError,
    'average WebGPU/WebGL normalized pixel error',
  ).toBeLessThan(0.065);
  expect(
    Math.max(...metrics.map(({ meanAbsoluteError: error }) => error)),
    'no individual parity view may diverge substantially',
  ).toBeLessThan(0.085);
  expect(
    meanSimilarPixelRatio,
    'most pixels should remain within 32 RGB levels of the WebGL reference',
  ).toBeGreaterThan(0.72);
  expect(
    Math.min(...metrics.map(({ similarPixelRatio }) => similarPixelRatio)),
    'every parity view retains a majority of perceptually similar pixels',
  ).toBeGreaterThan(0.62);
  for (const metric of metrics.filter(({ sunPath }) => sunPath)) {
    expect(
      metric.sunPath.webgpu.meanContrast,
      `${metric.view} keeps at least 70% of the WebGL sun-path contrast`,
    ).toBeGreaterThan(metric.sunPath.webgl.meanContrast * 0.70);
    expect(
      metric.sunPath.webgpu.highlightCoverage,
      `${metric.view} keeps at least 60% of the WebGL sun-path coverage`,
    ).toBeGreaterThan(metric.sunPath.webgl.highlightCoverage * 0.60);
    expect(
      metric.sunPath.webgpu.upperDecileContrast,
      `${metric.view} keeps at least 70% of the resolved WebGL glint intensity`,
    ).toBeGreaterThan(metric.sunPath.webgl.upperDecileContrast * 0.70);
  }
  for (const metric of metrics.filter(({ skyDetail }) => skyDetail)) {
    expect(
      metric.skyDetail.webgpu.meanLaplacian,
      `${metric.view} WebGPU sky retains resolved cloud edges`,
    ).toBeGreaterThan(metric.skyDetail.webgl.meanLaplacian * 0.65);
    expect(
      metric.skyDetail.webgpu.edgeCoverage,
      `${metric.view} WebGPU sky does not collapse into broad blurred blobs`,
    ).toBeGreaterThan(metric.skyDetail.webgl.edgeCoverage * 0.65);
  }
  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
});
