const MEGAPIXEL = 1_000_000;

export const GPU_PIXEL_BUDGETS = Object.freeze({
  software: Object.freeze({ minimum: 0.85, initial: 1.45, maximum: 1.85 }),
  integrated: Object.freeze({ minimum: 0.85, initial: 2.20, maximum: 3.20 }),
  unknown: Object.freeze({ minimum: 1.50, initial: 4.20, maximum: 6.00 }),
  discrete: Object.freeze({ minimum: 2.00, initial: 6.00, maximum: 8.30 }),
});

const SOFTWARE_RENDERER = /basic render|llvmpipe|software|swiftshader|warp/i;
const DISCRETE_RENDERER = /\b(?:nvidia|geforce|quadro|rtx|gtx|radeon\s+(?:rx|pro)|intel\s+arc)\b/i;
const INTEGRATED_RENDERER = /\b(?:intel|iris|uhd|hd graphics|vega|radeon\(tm\) graphics|amd radeon graphics|adreno|mali|powervr)\b/i;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function cappedDevicePixelRatio(width, devicePixelRatio) {
  const maximum = width < 720 ? 1.35 : 1.70;
  return clamp(devicePixelRatio || 1, 0.5, maximum);
}

export function classifyGpu(rendererName = '', hints = {}) {
  if (SOFTWARE_RENDERER.test(rendererName)) return 'software';
  if (DISCRETE_RENDERER.test(rendererName)) return 'discrete';
  if (INTEGRATED_RENDERER.test(rendererName)) return 'integrated';
  if ((hints.deviceMemory ?? 8) <= 4 || (hints.hardwareConcurrency ?? 8) <= 4) {
    return 'integrated';
  }
  return 'unknown';
}

export function inspectGpu(renderer, hints = {}) {
  if (renderer.isWebGPURenderer) {
    const rendererName = hints.rendererName
      || (renderer.backend?.isWebGPUBackend ? 'WebGPU adapter' : 'WebGL 2 fallback');
    return {
      renderer: rendererName,
      gpuClass: classifyGpu(rendererName, hints),
    };
  }

  const context = renderer.getContext();
  const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debugInfo
    ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : context.getParameter(context.RENDERER);

  return {
    renderer: rendererName || 'Unknown WebGL renderer',
    gpuClass: classifyGpu(rendererName, hints),
  };
}

export function shouldUseAntialias({ width, height, devicePixelRatio = 1 }) {
  const pixelRatio = cappedDevicePixelRatio(width, devicePixelRatio);
  const nativePixels = width * height * pixelRatio * pixelRatio;
  // At this density browser upscaling already smooths the image, while MSAA
  // can multiply the default framebuffer's bandwidth and memory cost.
  return nativePixels <= 7.0 * MEGAPIXEL;
}

function qualityTier(renderScale) {
  if (renderScale >= 0.88) return 'high';
  if (renderScale >= 0.64) return 'balanced';
  return 'performance';
}

function captureResolutionFor(tier, gpuClass) {
  if (gpuClass === 'software') return 384;
  if (gpuClass === 'integrated' && tier === 'performance') return 384;
  if (tier === 'performance') return 512;
  if (tier === 'balanced') return 640;
  return 768;
}

function shadowResolutionFor(tier, gpuClass) {
  if (gpuClass === 'software') return 512;
  if (tier === 'performance') return 1024;
  if (tier === 'balanced') return 1536;
  return 2048;
}

export function createAdaptiveQuality({
  width,
  height,
  devicePixelRatio = 1,
  gpuClass = 'unknown',
  rendererName = 'Unknown WebGL renderer',
  enabled = true,
} = {}) {
  const budgets = GPU_PIXEL_BUDGETS[gpuClass] ?? GPU_PIXEL_BUDGETS.unknown;
  let viewportWidth = Math.max(1, width ?? 1);
  let viewportHeight = Math.max(1, height ?? 1);
  let displayPixelRatio = devicePixelRatio;

  function nativePixelCount() {
    const ratio = cappedDevicePixelRatio(viewportWidth, displayPixelRatio);
    return viewportWidth * viewportHeight * ratio * ratio;
  }

  function preferredInitialBudget() {
    const nativePixels = nativePixelCount();
    // First paint is deliberately conservative. It keeps shader compilation,
    // render-target allocation, and warm-up responsive even on a discrete GPU;
    // sustained fast frames can raise the budget after the scene is visible.
    const highDensityLimit = nativePixels > 7.0 * MEGAPIXEL
      ? 2.60 * MEGAPIXEL
      : Infinity;
    return Math.min(budgets.initial * MEGAPIXEL, nativePixels, highDensityLimit);
  }

  let pixelBudget = preferredInitialBudget();
  let lastTimestamp = null;
  let sampleDuration = 0;
  let sampleFrames = 0;
  let smoothedFps = 60;
  let slowWindows = 0;
  let fastWindows = 0;
  let cooldownWindows = 0;
  let revision = 0;

  function state() {
    const nativePixelRatio = cappedDevicePixelRatio(
      viewportWidth,
      displayPixelRatio,
    );
    const cssPixels = viewportWidth * viewportHeight;
    const nativePixels = cssPixels * nativePixelRatio * nativePixelRatio;
    const budgetRatio = Math.sqrt(pixelBudget / cssPixels);
    const pixelRatio = Math.min(nativePixelRatio, budgetRatio);
    const renderScale = pixelRatio / nativePixelRatio;
    const tier = qualityTier(renderScale);
    // WebGLRenderer floors the physical canvas dimensions when applying DPR.
    const drawingBufferWidth = Math.max(1, Math.floor(viewportWidth * pixelRatio));
    const drawingBufferHeight = Math.max(1, Math.floor(viewportHeight * pixelRatio));

    return {
      revision,
      enabled,
      gpuClass,
      renderer: rendererName,
      tier,
      width: viewportWidth,
      height: viewportHeight,
      devicePixelRatio: displayPixelRatio,
      nativePixelRatio,
      pixelRatio,
      renderScale,
      drawingBufferWidth,
      drawingBufferHeight,
      renderPixels: drawingBufferWidth * drawingBufferHeight,
      pixelBudget,
      minimumPixelBudget: Math.min(budgets.minimum * MEGAPIXEL, nativePixels),
      maximumPixelBudget: Math.min(budgets.maximum * MEGAPIXEL, nativePixels),
      captureResolution: captureResolutionFor(tier, gpuClass),
      shadowMapResolution: shadowResolutionFor(tier, gpuClass),
      shadowFrameInterval: tier === 'performance' ? 2 : 1,
      smoothedFps,
    };
  }

  function applyFrameRate(fps) {
    if (!enabled || !Number.isFinite(fps) || fps <= 0) return false;

    smoothedFps += (fps - smoothedFps) * 0.35;
    if (cooldownWindows > 0) cooldownWindows -= 1;

    if (smoothedFps < 39) {
      slowWindows += 1;
      fastWindows = 0;
    } else if (smoothedFps > 56) {
      fastWindows += 1;
      slowWindows = 0;
    } else {
      slowWindows = 0;
      fastWindows = 0;
    }

    const severeSlowdown = smoothedFps < 27;
    if ((severeSlowdown || slowWindows >= 2) && cooldownWindows === 0) {
      const previousBudget = pixelBudget;
      const reduction = severeSlowdown ? 0.72 : 0.84;
      const minimumBudget = Math.min(
        budgets.minimum * MEGAPIXEL,
        nativePixelCount(),
      );
      pixelBudget = Math.max(minimumBudget, pixelBudget * reduction);
      slowWindows = 0;
      cooldownWindows = 2;
      if (pixelBudget < previousBudget - 1) {
        revision += 1;
        return true;
      }
    }

    if (fastWindows >= 4 && cooldownWindows === 0) {
      const previousBudget = pixelBudget;
      const maximumBudget = Math.min(
        budgets.maximum * MEGAPIXEL,
        nativePixelCount(),
      );
      pixelBudget = Math.min(maximumBudget, pixelBudget * 1.12);
      fastWindows = 0;
      cooldownWindows = 3;
      if (pixelBudget > previousBudget + 1) {
        revision += 1;
        return true;
      }
    }

    return false;
  }

  return {
    getState: state,
    resize(nextWidth, nextHeight, nextDevicePixelRatio = displayPixelRatio) {
      viewportWidth = Math.max(1, nextWidth);
      viewportHeight = Math.max(1, nextHeight);
      displayPixelRatio = nextDevicePixelRatio;
      pixelBudget = preferredInitialBudget();
      revision += 1;
      lastTimestamp = null;
      sampleDuration = 0;
      sampleFrames = 0;
      return state();
    },
    observeFrame(timestamp) {
      if (!enabled) return false;
      if (lastTimestamp === null) {
        lastTimestamp = timestamp;
        return false;
      }

      const delta = timestamp - lastTimestamp;
      lastTimestamp = timestamp;
      if (delta <= 0 || delta > 1_000) {
        sampleDuration = 0;
        sampleFrames = 0;
        return false;
      }

      sampleDuration += delta;
      sampleFrames += 1;
      if (sampleDuration < 900) return false;

      const fps = (sampleFrames * 1000) / sampleDuration;
      sampleDuration = 0;
      sampleFrames = 0;
      return applyFrameRate(fps);
    },
    sampleFrameRate: applyFrameRate,
    resetFrameSampling() {
      lastTimestamp = null;
      sampleDuration = 0;
      sampleFrames = 0;
      slowWindows = 0;
      fastWindows = 0;
    },
  };
}
