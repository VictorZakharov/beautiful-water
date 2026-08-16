import { describe, expect, test } from 'bun:test';
import { readRendererPreference } from '../../src/core/renderer.js';

describe('renderer preference', () => {
  test('uses WebGPU by default', () => {
    expect(readRendererPreference(new URLSearchParams())).toBe('webgpu');
  });

  test('accepts either explicit renderer query', () => {
    expect(readRendererPreference(new URLSearchParams('renderer=webgpu'))).toBe('webgpu');
    expect(readRendererPreference(new URLSearchParams('renderer=webgl'))).toBe('webgl');
  });

  test('ignores unsupported query values', () => {
    expect(readRendererPreference(new URLSearchParams('renderer=canvas'))).toBe('webgpu');
  });
});
