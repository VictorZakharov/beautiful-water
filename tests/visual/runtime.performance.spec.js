import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const SAMPLE_WINDOW_MS = 10_000;
const HUD_UPDATE_MARGIN_MS = 2_500;
const outputDirectory = path.resolve('visual-results');
const performanceProfileRequested = process.env.PERFORMANCE_PROFILE === '1'
  || process.env.npm_lifecycle_event === 'performance:profile';

test('profile live renderer timings', async ({ browser }, testInfo) => {
  test.skip(
    !performanceProfileRequested,
    'run explicitly with bun run performance:profile',
  );
  // The package profiler launches one isolated browser process per case.
  testInfo.setTimeout(90_000);
  const browserErrors = [];
  const requestedViewport = process.env.PERFORMANCE_VIEWPORT;
  const requestedRenderer = process.env.PERFORMANCE_RENDERER;
  const viewports = [
    { label: '1080p', width: 1920, height: 1080 },
    { label: '1440p', width: 2560, height: 1440 },
    { label: '4K', width: 3840, height: 2160 },
  ].filter(({ label }) => !requestedViewport || label === requestedViewport);
  const rendererModes = ['webgl', 'webgpu'].filter(
    (mode) => !requestedRenderer || mode === requestedRenderer,
  );
  const profileView = process.env.PERFORMANCE_VIEW === 'underwater'
    ? { label: 'underwater', query: '&profileView=underwater' }
    : { label: 'surface', query: '' };
  const reports = [];
  for (const viewport of viewports) {
    for (const mode of rendererModes) {
      console.log(`profiling ${viewport.label} ${mode}`);
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__BENCHMARK_FRAMES__ = [];
        const recordFrame = (time) => {
          window.__BENCHMARK_FRAMES__.push(time);
          if (window.__BENCHMARK_FRAMES__.length > 5_000) {
            window.__BENCHMARK_FRAMES__.shift();
          }
          requestAnimationFrame(recordFrame);
        };
        requestAnimationFrame(recordFrame);
      });
      page.on('console', (message) => {
        if (message.type() === 'error') {
          browserErrors.push(`${viewport.label} ${mode} console: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => {
        browserErrors.push(`${viewport.label} ${mode} page: ${error.message}`);
      });
      const startupStart = Date.now();
      try {
        await page.goto(`/?renderer=${mode}${profileView.query}`, {
          waitUntil: 'domcontentloaded',
          timeout: 20_000,
        });
        await page.waitForSelector('#app.is-ready', { timeout: 60_000 });
        const startupMs = Date.now() - startupStart;
        await page.waitForTimeout(SAMPLE_WINDOW_MS + HUD_UPDATE_MARGIN_MS);

        const report = await page.evaluate(({ measuredStartupMs, sampleWindowMs }) => {
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
          const recentFrames = frames.filter(
            (time) => time >= lastTimestamp - sampleWindowMs,
          );
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
            gpuPassP50Ms: Number(
              document.querySelector('[data-gpu-p50]')?.textContent ?? 0,
            ),
            gpuPassP95Ms: Number(
              document.querySelector('[data-gpu-p95]')?.textContent ?? 0,
            ),
            displayedFps: Number(
              document.querySelector('[data-fps]')?.textContent ?? 0,
            ),
            underwater: document.querySelector('#app')?.classList
              .contains('is-underwater') ?? false,
          };
        }, {
          measuredStartupMs: startupMs,
          sampleWindowMs: SAMPLE_WINDOW_MS,
        });
        report.label = viewport.label;
        report.view = profileView.label;
        reports.push(report);
        console.log(
          `completed ${viewport.label} ${mode}: p50 ${report.gpuPassP50Ms} ms, p95 ${report.gpuPassP95Ms} ms`,
        );
      } finally {
        // Navigating away releases the renderer and pending GPU queries before
        // context teardown. Closing a live 4K WebGPU document can otherwise
        // wait indefinitely in Chromium's GPU process.
        console.log(`releasing ${viewport.label} ${mode}`);
        await page.goto('about:blank', {
          waitUntil: 'commit',
          timeout: 5_000,
        }).catch(() => {});
        console.log(`navigated away from ${viewport.label} ${mode}`);
        await context.close();
        console.log(`closed ${viewport.label} ${mode}`);
      }
    }
  }

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, 'runtime-timings.json'),
    `${JSON.stringify({ sampleWindowMs: SAMPLE_WINDOW_MS, reports }, null, 2)}\n`,
  );
  for (const report of reports) {
    testInfo.annotations.push({
      type: `${report.label} ${report.view} GPU pass (${report.pipeline})`,
      description: `p50 ${report.gpuPassP50Ms.toFixed(2)} ms / p95 ${report.gpuPassP95Ms.toFixed(2)} ms`,
    });
    const viewport = viewports.find(({ label }) => label === report.label);
    expect(report.cssSize).toEqual([viewport.width, viewport.height]);
    expect(report.canvasSize[0] * report.canvasSize[1]).toBeLessThanOrEqual(
      viewport.width * viewport.height,
    );
    expect(report.sampleDuration).toBeGreaterThanOrEqual(SAMPLE_WINDOW_MS - 100);
    expect(report.measuredFps).toBeGreaterThan(0);
    expect(report.gpuPassP50Ms).toBeGreaterThan(0);
    expect(report.gpuPassP95Ms).toBeGreaterThanOrEqual(report.gpuPassP50Ms);
    expect(report.underwater).toBe(report.view === 'underwater');
  }
  expect(reports.map(({ pipeline }) => pipeline)).toEqual(
    viewports.flatMap(() => rendererModes),
  );
  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
});
