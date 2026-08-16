import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const outputDirectory = path.resolve('visual-results');

test('profile live 4K runtime', async ({ page }, testInfo) => {
  test.skip(
    process.env.PERFORMANCE_PROFILE !== '1',
    'run explicitly with bun run performance:profile',
  );
  testInfo.setTimeout(3 * 60_000);
  await page.setViewportSize({ width: 3840, height: 2160 });
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

  const startupStart = Date.now();
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForSelector('#app.is-ready', { timeout: 60_000 });
  const startupMs = Date.now() - startupStart;
  await page.waitForTimeout(8_000);

  const report = await page.evaluate((measuredStartupMs) => {
    const canvas = document.querySelector('canvas');
    const context = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    const debugInfo = context?.getExtension('WEBGL_debug_renderer_info');
    const renderer = context && debugInfo
      ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : context?.getParameter(context.RENDERER) ?? 'Unavailable WebGL renderer';
    const frames = window.__BENCHMARK_FRAMES__;
    const lastTimestamp = frames.at(-1) ?? 0;
    const recentFrames = frames.filter((time) => time >= lastTimestamp - 5_000);
    const sampleDuration = recentFrames.length > 1
      ? recentFrames.at(-1) - recentFrames[0]
      : 0;

    return {
      startupMs: measuredStartupMs,
      renderer,
      cssSize: [window.innerWidth, window.innerHeight],
      canvasSize: [canvas?.width ?? 0, canvas?.height ?? 0],
      antialias: context?.getContextAttributes().antialias ?? false,
      sampledFrames: recentFrames.length,
      sampleDuration,
      measuredFps: sampleDuration > 0
        ? ((recentFrames.length - 1) * 1000) / sampleDuration
        : 0,
      displayedFps: Number(document.querySelector('[data-fps]')?.textContent ?? 0),
    };
  }, startupMs);

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, 'runtime-4k.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  testInfo.annotations.push({
    type: '4K FPS',
    description: report.measuredFps.toFixed(1),
  });
  expect(report.cssSize).toEqual([3840, 2160]);
  expect(report.canvasSize[0] * report.canvasSize[1]).toBeLessThan(3840 * 2160);
  expect(report.measuredFps).toBeGreaterThan(0);
  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
});
