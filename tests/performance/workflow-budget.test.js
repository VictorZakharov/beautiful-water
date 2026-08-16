import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const pagesWorkflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
const previewWorkflow = readFileSync('.github/workflows/pr-preview.yml', 'utf8');

describe('automation wall-clock budgets', () => {
  test('caps every CI job at two minutes and keeps browser gates PR-only', () => {
    expect(ciWorkflow.match(/timeout-minutes: 2/g)).toHaveLength(3);
    expect(ciWorkflow).toContain('suite: ci-scene');
    expect(ciWorkflow).toContain('suite: fish-habituation');
    expect(ciWorkflow).toMatch(
      /visual-regression:[\s\S]*if: github\.event_name == 'pull_request'/,
    );
  });

  test('publishes Pages without rerunning the visual harness', () => {
    expect(pagesWorkflow).not.toContain('visual-smoke:');
    expect(pagesWorkflow).not.toContain('bun run visual:test');
    expect(pagesWorkflow).toContain('needs: build');
    expect(pagesWorkflow.match(/timeout-minutes: 2/g)).toHaveLength(2);
  });

  test('serializes production and PR preview publication', () => {
    expect(previewWorkflow).toContain('group: pages-publisher');
    expect(pagesWorkflow).toContain('group: pages-publisher');
    expect(previewWorkflow).toContain('pr-preview/pr-${PR_NUMBER}');
    expect(previewWorkflow).toContain('bunx vite build --base="${PREVIEW_BASE}"');
    expect(previewWorkflow.match(/timeout-minutes: 2/g)).toHaveLength(2);
    expect(pagesWorkflow).toContain('Stage production and retain open PR previews');
  });
});
