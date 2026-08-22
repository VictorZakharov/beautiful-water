import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const REPORT_TIMEOUT_MS = 75_000;
const GRACEFUL_EXIT_MS = 5_000;
const outputDirectory = path.resolve('visual-results');
const outputPath = path.join(outputDirectory, 'native-4k-sustain.json');
const playwrightExecutable = path.resolve(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'playwright.exe' : 'playwright',
);
const views = ['surface', 'underwater'].filter(
  (view) => !process.env.PERFORMANCE_VIEW
    || view === process.env.PERFORMANCE_VIEW,
);
const targetFps = Number(process.env.PERFORMANCE_TARGET_FPS ?? 144);

if (views.length === 0 || !Number.isFinite(targetFps) || targetFps <= 0) {
  throw new Error('Invalid native-4K sustain benchmark configuration');
}

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function waitForReport(reportPath, child) {
  const deadline = Date.now() + REPORT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const result = JSON.parse(await readFile(reportPath, 'utf8'));
      if (result.reports?.[0]?.complete === true) return result.reports[0];
    } catch {}
    if (child.exitCode !== null || child.signalCode !== null) return null;
    await delay(250);
  }
  return null;
}

async function terminateProcessTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn(
        'taskkill.exe',
        ['/PID', String(child.pid), '/T', '/F'],
        { stdio: 'ignore', windowsHide: true },
      );
      killer.once('error', () => {
        child.kill();
        resolve();
      });
      killer.once('exit', resolve);
    });
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await delay(500);
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {}
}

async function runSustainCase(view, reportFile, reportPath) {
  console.log(`\n=== native 4K ${view} at ${targetFps} Hz (fresh browser) ===`);
  await unlink(reportPath).catch(() => {});
  const child = spawn(
    playwrightExecutable,
    [
      'test',
      '--config=playwright.config.js',
      '--grep',
      'sustains native 4K at target refresh',
    ],
    {
      stdio: 'inherit',
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        PERFORMANCE_SUSTAIN: '1',
        PERFORMANCE_TARGET_FPS: String(targetFps),
        PERFORMANCE_VIEW: view,
        PERFORMANCE_REPORT_FILE: reportFile,
      },
    },
  );
  const exitPromise = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const report = await waitForReport(reportPath, child);
  if (report === null) {
    await terminateProcessTree(child);
    const outcome = await Promise.race([
      exitPromise,
      delay(2_000).then(() => ({ code: null, signal: 'forced' })),
    ]);
    return { report: null, outcome, forcedCleanup: true };
  }

  const gracefulOutcome = await Promise.race([
    exitPromise,
    delay(GRACEFUL_EXIT_MS).then(() => null),
  ]);
  if (gracefulOutcome !== null) {
    return { report, outcome: gracefulOutcome, forcedCleanup: false };
  }

  console.log(
    `Chrome completed ${view} evidence but stalled in worker shutdown; terminating its isolated process tree`,
  );
  await terminateProcessTree(child);
  const outcome = await Promise.race([
    exitPromise,
    delay(2_000).then(() => ({ code: null, signal: 'forced' })),
  ]);
  return { report, outcome, forcedCleanup: true };
}

const reports = [];
const failures = [];
await mkdir(outputDirectory, { recursive: true });
for (const view of views) {
  const reportFile = `native-4k-sustain-${process.pid}-${view}.json`;
  const caseOutputPath = path.join(outputDirectory, reportFile);
  const result = await runSustainCase(view, reportFile, caseOutputPath);
  if (result.report === null) {
    failures.push(
      `${view}: no completed report (${result.outcome.signal ?? `exit ${result.outcome.code}`})`,
    );
  } else {
    reports.push(result.report);
    if (!result.report.passed) {
      const failedCriteria = Object.entries(result.report.criteria)
        .filter(([, passed]) => !passed)
        .map(([criterion]) => criterion);
      failures.push(`${view}: failed ${failedCriteria.join(', ')}`);
    }
    if (!result.forcedCleanup && result.outcome.code !== 0) {
      failures.push(
        `${view}: ${result.outcome.signal ?? `exit ${result.outcome.code}`}`,
      );
    }
  }
  await unlink(caseOutputPath).catch(() => {});
}

await writeFile(
  outputPath,
  `${JSON.stringify({ targetFps, reports }, null, 2)}\n`,
);
console.log(`\nCombined ${reports.length} native-4K sustain reports in ${outputPath}`);

if (failures.length > 0) {
  throw new Error(`Native-4K sustain gate failed:\n${failures.join('\n')}`);
}
