import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const browserCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const isCI = process.env.CI === 'true' || process.env.CI === '1';
const executablePath = isCI
  ? undefined
  : browserCandidates.find((candidate) => existsSync(candidate));
const angleArguments = isCI || process.platform !== 'win32'
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--use-angle=d3d11'];
const viewport = isCI
  ? { width: 960, height: 540 }
  : { width: 1600, height: 900 };

export default defineConfig({
  testDir: './tests/visual',
  outputDir: './test-results',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--enable-webgl',
        '--enable-gpu',
        '--ignore-gpu-blocklist',
        ...angleArguments,
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
