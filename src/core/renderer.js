import * as THREE from 'three';

export const RENDERER_PREFERENCE_KEY = 'beautiful-water-renderer';
export const RENDERER_MODES = Object.freeze(['webgpu', 'webgl']);

export function readRendererPreference(query = new URLSearchParams(window.location.search)) {
  const queryMode = query.get('renderer');
  if (RENDERER_MODES.includes(queryMode)) return queryMode;

  try {
    const storedMode = window.localStorage.getItem(RENDERER_PREFERENCE_KEY);
    if (RENDERER_MODES.includes(storedMode)) return storedMode;
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }

  return 'webgpu';
}

export function persistRendererPreference(mode) {
  if (!RENDERER_MODES.includes(mode)) return;
  try {
    window.localStorage.setItem(RENDERER_PREFERENCE_KEY, mode);
  } catch {
    // A reload with ?renderer= still works when storage is unavailable.
  }
}

function createWebGlRenderer(canvas, antialias) {
  return new THREE.WebGLRenderer({
    canvas,
    antialias,
    alpha: false,
    powerPreference: 'high-performance',
  });
}

async function describeWebGpuAdapter() {
  if (!navigator.gpu) return null;

  try {
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });
    if (!adapter) return null;
    const info = adapter.info ?? await adapter.requestAdapterInfo?.();
    const label = [
      info?.vendor,
      info?.architecture,
      info?.device,
      info?.description,
    ].filter(Boolean).join(' ');
    return label || 'WebGPU adapter';
  } catch {
    return null;
  }
}

export async function createRenderer({ canvas, antialias, preferredMode }) {
  if (preferredMode === 'webgl') {
    return {
      renderer: createWebGlRenderer(canvas, antialias),
      pipeline: 'webgl',
      backend: 'webgl2',
      adapterName: null,
      fallbackReason: null,
    };
  }

  const adapterNamePromise = describeWebGpuAdapter();
  let candidate;
  try {
    const { WebGPURenderer } = await import('three/webgpu');
    candidate = new WebGPURenderer({
      canvas,
      antialias,
      alpha: false,
      powerPreference: 'high-performance',
      // The half-float intermediate used by default costs substantial memory
      // bandwidth at 4K. The final display is 8-bit, so keep that format end
      // to end on the performance-oriented WebGPU path.
      outputBufferType: THREE.UnsignedByteType,
    });
    await candidate.init();
    const backend = candidate.backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';
    return {
      renderer: candidate,
      pipeline: 'webgpu',
      backend,
      adapterName: await adapterNamePromise,
      fallbackReason: backend === 'webgpu' ? null : 'WebGPU unavailable; using node renderer on WebGL 2',
    };
  } catch (error) {
    candidate?.dispose?.();
    console.warn('WebGPU renderer failed; falling back to legacy WebGL.', error);
    return {
      renderer: createWebGlRenderer(canvas, antialias),
      pipeline: 'webgl',
      backend: 'webgl2',
      adapterName: null,
      fallbackReason: error instanceof Error ? error.message : String(error),
    };
  }
}
