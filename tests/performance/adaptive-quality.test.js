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
});
