import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const outputPath = path.resolve('visual-results/runtime-timings.json');
const playwrightExecutable = path.resolve(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'playwright.exe' : 'playwright',
);
const viewports = ['1080p', '1440p', '4K'].filter(
  (viewport) => (
    !process.env.PERFORMANCE_VIEWPORT
    || viewport === process.env.PERFORMANCE_VIEWPORT
  ),
);
const renderers = ['webgl', 'webgpu'].filter(
  (renderer) => (
    !process.env.PERFORMANCE_RENDERER
    || renderer === process.env.PERFORMANCE_RENDERER
  ),
);
const profileCases = viewports.flatMap(
  (viewport) => renderers.map((renderer) => ({ viewport, renderer })),
);

if (profileCases.length === 0) {
  throw new Error('No performance cases match the requested filters');
}

function runProfileCase({ viewport, renderer }) {
  console.log(`\n=== ${viewport} ${renderer} (fresh browser) ===`);
  return new Promise((resolve, reject) => {
    const child = spawn(
      playwrightExecutable,
      [
        'test',
        '--config=playwright.config.js',
        '--grep',
        'profile live renderer timings',
      ],
      {
        stdio: 'inherit',
        windowsHide: true,
        env: {
          ...process.env,
          PERFORMANCE_PROFILE: '1',
          PERFORMANCE_VIEWPORT: viewport,
          PERFORMANCE_RENDERER: renderer,
        },
      },
    );
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(
        `${viewport} ${renderer} profile failed (${signal ?? `exit ${code}`})`,
      ));
    });
  });
}

const reports = [];
for (const profileCase of profileCases) {
  await runProfileCase(profileCase);
  const result = JSON.parse(await readFile(outputPath, 'utf8'));
  if (result.reports?.length !== 1) {
    throw new Error(
      `${profileCase.viewport} ${profileCase.renderer} produced an invalid report`,
    );
  }
  reports.push(result.reports[0]);
}

await writeFile(
  outputPath,
  `${JSON.stringify({ sampleWindowMs: 10_000, reports }, null, 2)}\n`,
);
console.log(`\nCombined ${reports.length} isolated timing reports in ${outputPath}`);
