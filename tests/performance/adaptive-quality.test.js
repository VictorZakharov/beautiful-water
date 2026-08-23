import { describe, expect, test } from 'bun:test';
import {
  classifyGpu,
  createAdaptiveQuality,
  shouldUseAntialias,
} from '../../src/core/adaptive-quality.js';

describe('GPU classification', () => {
  test('recognizes common integrated, discrete, and software renderers', () => {
    expect(classifyGpu('ANGLE (Intel, Intel(R) UHD Graphics 630)')).toBe('integrated');
    expect(classifyGpu('Apple')).toBe('integrated');
    expect(classifyGpu('Apple M1 Pro')).toBe('integrated');
    expect(classifyGpu('Apple M1 Max')).toBe('discrete');
    expect(classifyGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Ti)')).toBe('discrete');
    expect(classifyGpu('nvidia lovelace')).toBe('discrete');
    expect(classifyGpu('ANGLE (Microsoft, Microsoft Basic Render Driver)')).toBe('software');
  });
});

describe('high-density framebuffer policy', () => {
  test('keeps antialiasing at ordinary resolutions', () => {
    expect(shouldUseAntialias({
      width: 1920,
      height: 1080,
      devicePixelRatio: 1,
    })).toBe(true);
  });

  test('uses browser upscaling instead of redundant MSAA at 4K', () => {
    expect(shouldUseAntialias({
      width: 3840,
      height: 2160,
      devicePixelRatio: 1,
    })).toBe(false);
    expect(shouldUseAntialias({
      width: 2560,
      height: 1440,
      devicePixelRatio: 1.5,
    })).toBe(false);
  });
});

describe('adaptive pixel budget', () => {
  test('starts an integrated GPU near 2.2 MP at either 4K display scale', () => {
    const native4k = createAdaptiveQuality({
      width: 3840,
      height: 2160,
      devicePixelRatio: 1,
      gpuClass: 'integrated',
    }).getState();
    const scaled4k = createAdaptiveQuality({
      width: 2560,
      height: 1440,
      devicePixelRatio: 1.5,
      gpuClass: 'integrated',
    }).getState();

    expect(native4k.renderPixels).toBeLessThanOrEqual(2_202_500);
    expect(native4k.renderPixels).toBeGreaterThanOrEqual(2_195_000);
    expect(scaled4k.renderPixels).toBeLessThanOrEqual(2_202_500);
    expect(scaled4k.renderPixels).toBeGreaterThanOrEqual(2_195_000);
    expect(native4k.tier).toBe('performance');
    expect(native4k.captureResolution).toBe(384);
  });

  test('leaves a standard-density 1080p canvas at native resolution', () => {
    const quality = createAdaptiveQuality({
      width: 1920,
      height: 1080,
      devicePixelRatio: 1,
      gpuClass: 'integrated',
    }).getState();

    expect(quality.pixelRatio).toBe(1);
    expect(quality.renderScale).toBe(1);
    expect([quality.drawingBufferWidth, quality.drawingBufferHeight]).toEqual([1920, 1080]);
  });

  test('locks a native 4K benchmark at the high quality tier', () => {
    const quality = createAdaptiveQuality({
      width: 3840,
      height: 2160,
      devicePixelRatio: 1,
      gpuClass: 'discrete',
      lockedPixelRatio: 1,
    });
    const initial = quality.getState();

    expect(initial).toMatchObject({
      locked: true,
      tier: 'high',
      pixelRatio: 1,
      renderScale: 1,
      drawingBufferWidth: 3840,
      drawingBufferHeight: 2160,
      renderPixels: 8_294_400,
      captureResolution: 768,
      shadowMapResolution: 2048,
      shadowFrameInterval: 1,
    });

    for (let sample = 0; sample < 12; sample += 1) {
      expect(quality.sampleFrameRate(8)).toBe(false);
    }
    expect(quality.getState()).toEqual(initial);
  });

  test('warms up 4K conservatively and raises quality only after fast samples', () => {
    const controller = createAdaptiveQuality({
      width: 3840,
      height: 2160,
      devicePixelRatio: 1,
      gpuClass: 'discrete',
    });

    expect(controller.getState().renderPixels).toBeLessThanOrEqual(2_602_500);
    for (let sample = 0; sample < 4; sample += 1) controller.sampleFrameRate(60);
    expect(controller.getState().renderPixels).toBeGreaterThan(2_900_000);
    expect(controller.getState().renderPixels).toBeLessThan(3_000_000);
  });

  test('steps down quickly under load and recovers conservatively', () => {
    const controller = createAdaptiveQuality({
      width: 3840,
      height: 2160,
      devicePixelRatio: 1,
      gpuClass: 'integrated',
    });
    const initial = controller.getState();

    for (let sample = 0; sample < 7; sample += 1) controller.sampleFrameRate(8);
    const reduced = controller.getState();
    expect(reduced.pixelBudget).toBeLessThan(initial.pixelBudget);
    expect(reduced.renderPixels).toBeLessThan(initial.renderPixels);
    expect(reduced.pixelBudget).toBe(reduced.minimumPixelBudget);
    expect(reduced.pixelBudget).toBe(850_000);

    for (let sample = 0; sample < 12; sample += 1) controller.sampleFrameRate(60);
    const recovering = controller.getState();
    expect(recovering.pixelBudget).toBeGreaterThan(reduced.pixelBudget);
    expect(recovering.pixelBudget).toBeLessThanOrEqual(recovering.maximumPixelBudget);
  });

  test('uses GPU timing instead of false callback headroom on the reported M1 Pro load', () => {
    const controller = createAdaptiveQuality({
      width: 1920,
      height: 1080,
      devicePixelRatio: 2,
      gpuClass: 'integrated',
      gpuTimingEnabled: true,
      targetFrameRate: 60,
    });
    const initial = controller.getState();

    for (let sample = 0; sample < 12; sample += 1) {
      expect(controller.sampleFrameRate(60)).toBe(false);
    }
    expect(controller.getState().pixelBudget).toBe(initial.pixelBudget);

    let timingRevision = 1;
    for (let recovery = 0; recovery < 5; recovery += 1) {
      let changed = false;
      for (let sample = 0; sample < 3; sample += 1) {
        changed = controller.sampleGpuTiming({
          revision: timingRevision,
          sampleCount: sample + 3,
          medianFrameTimeMs: 2,
          p95FrameTimeMs: 3,
        }) || changed;
        timingRevision += 1;
      }
      expect(changed).toBe(true);
      controller.resetGpuSampling();
    }
    const expanded = controller.getState();
    expect(expanded.pixelBudget).toBe(expanded.maximumPixelBudget);
    expect(expanded.pixelBudget).toBe(3_200_000);

    expect(controller.sampleGpuTiming({
      revision: timingRevision,
      sampleCount: 10,
      medianFrameTimeMs: 15.93,
      p95FrameTimeMs: 27.39,
    })).toBe(true);

    const reduced = controller.getState();
    expect(reduced.pixelBudget).toBe(expanded.pixelBudget * 0.72);
    expect(reduced.renderPixels).toBeLessThan(expanded.renderPixels);
    expect(reduced.gpuTimingStatus).toBe('overloaded');
    expect(reduced.gpuTargetFps).toBe(60);
    expect(reduced.gpuP95BudgetMs).toBeCloseTo(15, 5);
  });

  test('treats the render cap as a lower GPU quality target', () => {
    const controller = createAdaptiveQuality({
      width: 1920,
      height: 1080,
      devicePixelRatio: 2,
      gpuClass: 'integrated',
      gpuTimingEnabled: true,
      targetFrameRate: 60,
    });
    const initial = controller.getState();

    expect(controller.setTargetFrameRate(30)).toBe(30);
    expect(controller.sampleGpuTiming({
      revision: 1,
      sampleCount: 10,
      medianFrameTimeMs: 15.93,
      p95FrameTimeMs: 27.39,
    })).toBe(false);

    const stable = controller.getState();
    expect(stable.pixelBudget).toBe(initial.pixelBudget);
    expect(stable.gpuTimingStatus).toBe('within-budget');
    expect(stable.gpuP95BudgetMs).toBeCloseTo(30, 5);
  });

  test('requires repeated GPU headroom before recovering quality', () => {
    const controller = createAdaptiveQuality({
      width: 3840,
      height: 2160,
      devicePixelRatio: 1,
      gpuClass: 'discrete',
      gpuTimingEnabled: true,
    });
    const initial = controller.getState();
    const fastTiming = (revision) => ({
      revision,
      sampleCount: revision + 2,
      medianFrameTimeMs: 4,
      p95FrameTimeMs: 6,
    });

    expect(controller.sampleGpuTiming(fastTiming(1))).toBe(false);
    expect(controller.sampleGpuTiming(fastTiming(2))).toBe(false);
    expect(controller.sampleGpuTiming(fastTiming(3))).toBe(true);
    expect(controller.getState().pixelBudget).toBe(initial.pixelBudget * 1.08);
    expect(controller.sampleGpuTiming(fastTiming(3))).toBe(false);
  });

  test('filters one moderate tail sample and remembers the unsafe quality ceiling', () => {
    const controller = createAdaptiveQuality({
      width: 1920,
      height: 1080,
      devicePixelRatio: 2,
      gpuClass: 'integrated',
      gpuTimingEnabled: true,
    });
    const initial = controller.getState();
    const moderateOverload = (revision) => ({
      revision,
      sampleCount: revision + 2,
      medianFrameTimeMs: 10,
      p95FrameTimeMs: 16,
    });

    expect(controller.sampleGpuTiming(moderateOverload(1))).toBe(false);
    expect(controller.getState().pixelBudget).toBe(initial.pixelBudget);
    expect(controller.sampleGpuTiming(moderateOverload(2))).toBe(true);
    expect(controller.getState().pixelBudget).toBe(initial.pixelBudget * 0.84);

    let revision = 3;
    for (let recovery = 0; recovery < 4; recovery += 1) {
      let changed = false;
      for (let sample = 0; sample < 3; sample += 1) {
        changed = controller.sampleGpuTiming({
          revision,
          sampleCount: sample + 3,
          medianFrameTimeMs: 4,
          p95FrameTimeMs: 6,
        }) || changed;
        revision += 1;
      }
      if (changed) controller.resetGpuSampling();
    }

    const recovered = controller.getState();
    expect(recovered.pixelBudget).toBeLessThanOrEqual(initial.pixelBudget * 0.94);
    expect(recovered.learnedMaximumPixelBudget).toBe(initial.pixelBudget * 0.94);
  });
});
