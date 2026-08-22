import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const visualSuite = process.env.VISUAL_SUITE ?? 'all';
const hudTest = ['all', 'ci-scene'].includes(visualSuite) ? test : test.skip;

hudTest('graphs presentation history and copies a diagnostic report', async ({ page }) => {
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

  await page.goto('/?renderer=webgpu', {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForSelector('#app.is-ready', { timeout: 60_000 });
  await page.waitForFunction(() => (
    document.querySelector('[data-fps-history-line]')
      ?.getAttribute('d')?.includes('L')
  ));

  const panel = page.locator('[data-performance-panel]');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('type', 'button');
  await expect(page.locator('[data-fps-average]')).not.toHaveText('--');
  await expect(page.locator('[data-fps-low]')).not.toHaveText('--');
  await expect(page.locator('[data-fps-history]')).toHaveAttribute(
    'aria-label',
    /Presented FPS over the last/,
  );

  await panel.click();
  await page.waitForFunction(() => (
    typeof window.__COPIED_PERFORMANCE_REPORT__ === 'string'
  ));
  const report = await page.evaluate(
    () => window.__COPIED_PERFORMANCE_REPORT__,
  );
  expect(report).toContain('Beautiful Water performance report');
  expect(report).toContain('Presented FPS:');
  expect(report).toContain('1% low');
  expect(report).toContain('Frame time: p50');
  expect(report).toContain('CPU frame work: p50');
  expect(report).toContain('Estimated refresh:');
  expect(report).toContain('GPU pass (rolling 10 s):');
  expect(report).toContain('Renderer: webgpu pipeline');
  expect(report).toContain('Canvas:');
  expect(report).toContain('Quality:');
  expect(report).toContain('Scene: surface');
  expect(report).toContain('Page state: visible | focused | DPR 1.00');
  expect(report).toContain('User agent:');
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
  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
});
