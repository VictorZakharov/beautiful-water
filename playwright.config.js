import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const browserCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const executablePath = browserCandidates.find((candidate) => existsSync(candidate));

export default defineConfig({
  testDir: './tests/visual',
  outputDir: './test-results',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--enable-webgl',
        '--enable-gpu',
        '--ignore-gpu-blocklist',
        '--use-angle=d3d11',
      ],
    },
  },
  webServer: {
    command: 'bun run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
