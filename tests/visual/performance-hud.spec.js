import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const visualSuite = process.env.VISUAL_SUITE ?? 'all';
const hudTest = ['all', 'ci-scene'].includes(visualSuite) ? test : test.skip;

hudTest('caps rendering, graphs rendered FPS, and copies a diagnostic report', async ({ page }) => {
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
    window.__COPIED_PERFORMANCE_REPORT__ = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__COPIED_PERFORMANCE_REPORT__ = text;
        },
      },
    });
  });

  await page.goto('/?renderer=webgpu&renderCap=30', {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForSelector('#app.is-ready', { timeout: 60_000 });
  await page.waitForFunction(() => (
    document.querySelector('[data-fps-history-line]')
      ?.getAttribute('d')?.includes('L')
  ));

  const panel = page.locator('[data-performance-panel]');
  const renderCap = page.locator('[data-render-cap-select]');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('type', 'button');
  await expect(renderCap).toBeVisible();
  await expect(renderCap).toHaveValue('30');
  await expect(page.locator('[data-fps-average]')).not.toHaveText('--');
  await expect(page.locator('[data-fps-low]')).not.toHaveText('--');
  await expect(page.locator('[data-fps-history]')).toHaveAttribute(
    'aria-label',
    /Rendered frames per second over the last/,
  );
  await expect(page.locator('[data-display-note]')).toContainText(
    'CAP 30',
  );

  await panel.click();
  await page.waitForFunction(() => (
    typeof window.__COPIED_PERFORMANCE_REPORT__ === 'string'
  ));
  const report = await page.evaluate(
    () => window.__COPIED_PERFORMANCE_REPORT__,
  );
  expect(report).toContain('Beautiful Water performance report');
  expect(report).toContain('Rendered FPS:');
  expect(report).toContain('Render interval: p50');
  expect(report).toContain('Render cap: 30 FPS maximum');
  const renderedAverage = Number(
    report.match(/Rendered FPS: ([\d.]+) average/)?.[1],
  );
  expect(renderedAverage).toBeGreaterThan(0);
  expect(renderedAverage).toBeLessThanOrEqual(32);
  expect(report).toContain('Browser animation callbacks:');
  expect(report).toContain('1% low');
  expect(report).toContain('Callback interval: p50');
  expect(report).toContain('CPU frame work: p50');
  expect(report).toContain('Browser callback cadence:');
  expect(report).toContain('missed callback slots:');
  expect(report).toContain('physical panel Hz unavailable to this page');
  expect(report).toContain(
    'rendered FPS and callback cadence are not physical panel measurements',
  );
  expect(report).toContain('GPU pass (rolling 10 s):');
  expect(report).toContain('Renderer: webgpu pipeline');
  expect(report).toContain('Canvas:');
  expect(report).toContain('Quality:');
  expect(report).toContain('Scene: surface | frame draw calls');
  const frameMetrics = report.match(
    /Scene: surface \| frame draw calls (\d+) \| frame triangles (\d+)/,
  );
  expect(frameMetrics).not.toBeNull();
  expect(Number(frameMetrics[1])).toBeGreaterThan(0);
  expect(Number(frameMetrics[1])).toBeLessThan(1_000);
  expect(Number(frameMetrics[2])).toBeGreaterThan(0);
  expect(report).toContain('Page state: visible | focused | DPR 1.00');
  expect(report).toContain('Runtime:');
  expect(report).not.toContain('Runtime: Unknown browser');
  expect(report).not.toContain('| Unknown platform');
  expect(report).toContain('exact OS version unavailable to this page');
  expect(report).toContain('User agent (raw):');
  expect(report).not.toContain('undefined');
  await expect(page.locator('[data-performance-copy]')).toHaveText(
    'COPIED 15S REPORT',
  );

  const outputDirectory = path.resolve('visual-results');
  await mkdir(outputDirectory, { recursive: true });
  await panel.screenshot({
    path: path.join(outputDirectory, 'performance-hud.png'),
    animations: 'disabled',
  });

  await renderCap.selectOption('60');
  await expect(renderCap).toHaveValue('60');
  await expect(page.locator('[data-display-note]')).toContainText('CAP 60');
  expect(new URL(page.url()).searchParams.get('renderCap')).toBe('60');
  expect(await page.evaluate(() => (
    localStorage.getItem('beautiful-water:render-cap')
  ))).toBe('60');
  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
});
