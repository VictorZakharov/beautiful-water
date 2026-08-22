import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const outputDirectory = path.resolve('visual-results');

test('profile live renderer capacity', async ({ page }, testInfo) => {
  test.skip(
    process.env.PERFORMANCE_PROFILE !== '1',
    'run explicitly with bun run performance:profile',
  );
  testInfo.setTimeout(3 * 60_000);
  await page.addInitScript(() => {
    window.__BENCHMARK_FRAMES__ = [];
    const recordFrame = (time) => {
      window.__BENCHMARK_FRAMES__.push(time);
      if (window.__BENCHMARK_FRAMES__.length > 900) {
        window.__BENCHMARK_FRAMES__.shift();
      }
      requestAnimationFrame(recordFrame);
    };
    requestAnimationFrame(recordFrame);
  });

  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));

  const viewports = [
    { label: '1080p', width: 1920, height: 1080 },
    { label: '1440p', width: 2560, height: 1440 },
    { label: '4K', width: 3840, height: 2160 },
  ];
  const profileView = process.env.PERFORMANCE_VIEW === 'underwater'
    ? { label: 'underwater', query: '&profileView=underwater' }
    : { label: 'surface', query: '' };
  const reports = [];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const mode of ['webgl', 'webgpu']) {
      const startupStart = Date.now();
      await page.goto(`/?renderer=${mode}${profileView.query}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      await page.waitForSelector('#app.is-ready', { timeout: 60_000 });
      const startupMs = Date.now() - startupStart;
      await page.waitForTimeout(4_000);

      const report = await page.evaluate((measuredStartupMs) => {
        const canvas = document.querySelector('canvas');
        const rendererRoot = document.querySelector('[data-renderer-toggle]');
        const context = rendererRoot?.dataset.rendererPipeline === 'webgl'
          ? canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
          : null;
        const debugInfo = context?.getExtension('WEBGL_debug_renderer_info');
        const renderer = context && debugInfo
          ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          : rendererRoot?.dataset.rendererAdapter || rendererRoot?.dataset.rendererBackend;
        const frames = window.__BENCHMARK_FRAMES__;
        const lastTimestamp = frames.at(-1) ?? 0;
        const recentFrames = frames.filter((time) => time >= lastTimestamp - 3_000);
        const sampleDuration = recentFrames.length > 1
          ? recentFrames.at(-1) - recentFrames[0]
          : 0;

        return {
          startupMs: measuredStartupMs,
          pipeline: rendererRoot?.dataset.rendererPipeline,
          backend: rendererRoot?.dataset.rendererBackend,
          renderer,
          cssSize: [window.innerWidth, window.innerHeight],
          canvasSize: [canvas?.width ?? 0, canvas?.height ?? 0],
          antialias: context?.getContextAttributes().antialias ?? false,
          sampledFrames: recentFrames.length,
          sampleDuration,
          measuredFps: sampleDuration > 0
            ? ((recentFrames.length - 1) * 1000) / sampleDuration
            : 0,
          gpuCapacityFps: Number(
            document.querySelector('[data-gpu-fps]')?.textContent ?? 0,
          ),
          displayedFps: Number(
            document.querySelector('[data-fps]')?.textContent ?? 0,
          ),
          underwater: document.querySelector('#app')?.classList
            .contains('is-underwater') ?? false,
        };
      }, startupMs);
      report.label = viewport.label;
      report.view = profileView.label;
      reports.push(report);
    }
  }

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, 'runtime-capacity.json'),
    `${JSON.stringify({ reports }, null, 2)}\n`,
  );
  for (const report of reports) {
    testInfo.annotations.push({
      type: `${report.label} ${report.view} GPU capacity (${report.pipeline})`,
      description: `${report.gpuCapacityFps.toFixed(0)} FPS`,
    });
    const viewport = viewports.find(({ label }) => label === report.label);
    expect(report.cssSize).toEqual([viewport.width, viewport.height]);
    expect(report.canvasSize[0] * report.canvasSize[1]).toBeLessThanOrEqual(
      viewport.width * viewport.height,
    );
    expect(report.measuredFps).toBeGreaterThan(0);
    expect(report.gpuCapacityFps).toBeGreaterThan(0);
    expect(report.underwater).toBe(report.view === 'underwater');
  }
  expect(reports.map(({ pipeline }) => pipeline)).toEqual([
    'webgl', 'webgpu',
    'webgl', 'webgpu',
    'webgl', 'webgpu',
  ]);
  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
});
