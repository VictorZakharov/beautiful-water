import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { measureWaveFieldCorrelation } from './wave-field.js';

const outputDirectory = path.resolve('visual-results');
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
};
if (!Object.hasOwn(visualSuites, visualSuite)) {
  throw new Error(`Unknown visual suite: ${visualSuite}`);
}
const captureViews = visualSuites[visualSuite];
const fastCaptureSuite = visualSuite === 'ci-scene';
const requiredCiSuite = ['ci-scene', 'fish-habituation'].includes(visualSuite);

const fourKTest = ['all', 'scene-matrix'].includes(visualSuite) ? test : test.skip;
fourKTest('keeps a 4K display inside its adaptive render budget', async ({ page }, testInfo) => {
  testInfo.setTimeout(5 * 60_000);
  await page.setViewportSize({ width: 3840, height: 2160 });

  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));

  await page.goto('/?harness=1&gpuClass=integrated', {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForFunction(
    () => window.__WATER_HARNESS__?.ready === true,
    undefined,
    { timeout: 4 * 60_000 },
  );
  await page.addStyleTag({
    content: '.loader, .fps { display: none !important; }',
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
  expect(initial.quality.ocean.reflectionSize).toEqual(
    [initial.quality.ocean.captureResolution, initial.quality.ocean.captureResolution],
  );
  expect(initial.quality.ocean.refractionSize).toEqual(
    [initial.quality.ocean.captureResolution, initial.quality.ocean.captureResolution],
  );
  expect(initial.quality.environment.shadowMapResolution).toBeLessThanOrEqual(1024);

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

test('capture ocean regression views', async ({ page }, testInfo) => {
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

  await page.goto('/?harness=1', {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForFunction(
    () => window.__WATER_HARNESS__?.ready === true,
    undefined,
    { timeout: 20_000 },
  );

  const graphicsRenderer = await page.evaluate(() => {
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
    content: '.loader, .fps { display: none !important; }',
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
