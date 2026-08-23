const MEGAPIXEL = 1_000_000;
const DEFAULT_TARGET_FPS = 60;
// Timestamp queries resolve sparsely. Three fresh samples are enough to react
// within a few seconds while the repeated-sample rules reject a lone tail.
const GPU_TIMING_MIN_SAMPLES = 3;
// Leave compositor and non-render-pass work outside the measured GPU budget.
const GPU_P95_BUDGET_RATIO = 0.90;
const GPU_SEVERE_P95_RATIO = 1.35;
const GPU_SEVERE_MEDIAN_RATIO = 0.90;
const GPU_RECOVERY_P95_RATIO = 0.70;
const GPU_RECOVERY_MEDIAN_RATIO = 0.60;
const GPU_RECOVERY_SAMPLES = 3;

export const GPU_PIXEL_BUDGETS = Object.freeze({
  software: Object.freeze({ minimum: 0.85, initial: 1.45, maximum: 1.85 }),
  integrated: Object.freeze({ minimum: 0.85, initial: 2.20, maximum: 3.20 }),
  unknown: Object.freeze({ minimum: 1.50, initial: 4.20, maximum: 6.00 }),
  discrete: Object.freeze({ minimum: 2.00, initial: 6.00, maximum: 8.30 }),
});

const SOFTWARE_RENDERER = /basic render|llvmpipe|software|swiftshader|warp/i;
const DISCRETE_RENDERER = /\b(?:nvidia|geforce|quadro|rtx|gtx|radeon\s+(?:rx|pro)|intel\s+arc)\b/i;
const APPLE_HIGH_END_RENDERER = /\bapple\s+m\d+\s+(?:max|ultra)\b/i;
const INTEGRATED_RENDERER = /\b(?:intel|iris|uhd|hd graphics|vega|radeon\(tm\) graphics|amd radeon graphics|adreno|mali|powervr|apple)\b/i;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeTargetFrameRate(value) {
  return Number.isFinite(value) && value > 0
    ? clamp(value, 15, 240)
    : DEFAULT_TARGET_FPS;
}

function cappedDevicePixelRatio(width, devicePixelRatio) {
  const maximum = width < 720 ? 1.35 : 1.70;
  return clamp(devicePixelRatio || 1, 0.5, maximum);
}

export function classifyGpu(rendererName = '', hints = {}) {
  if (SOFTWARE_RENDERER.test(rendererName)) return 'software';
  if (
    DISCRETE_RENDERER.test(rendererName)
    || APPLE_HIGH_END_RENDERER.test(rendererName)
  ) return 'discrete';
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
  lockedPixelRatio = null,
  gpuTimingEnabled = false,
  targetFrameRate = DEFAULT_TARGET_FPS,
} = {}) {
  const qualityLocked = Number.isFinite(lockedPixelRatio)
    && lockedPixelRatio > 0;
  const usesGpuTiming = Boolean(gpuTimingEnabled);
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
  let gpuTargetFps = normalizeTargetFrameRate(targetFrameRate);
  let gpuTimingStatus = usesGpuTiming ? 'collecting' : 'unavailable';
  let gpuMedianFrameTimeMs = null;
  let gpuP95FrameTimeMs = null;
  let lastGpuTimingRevision = null;
  let gpuSlowSamples = 0;
  let gpuFastSamples = 0;
  let learnedMaximumPixelBudget = Infinity;

  function minimumPixelBudget() {
    return Math.min(budgets.minimum * MEGAPIXEL, nativePixelCount());
  }

  function maximumPixelBudget() {
    return Math.min(
      budgets.maximum * MEGAPIXEL,
      nativePixelCount(),
      learnedMaximumPixelBudget,
    );
  }

  function resetGpuSampling({ forgetLearnedLimit = false } = {}) {
    gpuTimingStatus = usesGpuTiming ? 'collecting' : 'unavailable';
    gpuMedianFrameTimeMs = null;
    gpuP95FrameTimeMs = null;
    lastGpuTimingRevision = null;
    gpuSlowSamples = 0;
    gpuFastSamples = 0;
    if (forgetLearnedLimit) learnedMaximumPixelBudget = Infinity;
  }

  function state() {
    const nativePixelRatio = cappedDevicePixelRatio(
      viewportWidth,
      displayPixelRatio,
    );
    const cssPixels = viewportWidth * viewportHeight;
    const nativePixels = cssPixels * nativePixelRatio * nativePixelRatio;
    const budgetRatio = Math.sqrt(pixelBudget / cssPixels);
    const pixelRatio = qualityLocked
      ? clamp(lockedPixelRatio, 0.5, nativePixelRatio)
      : Math.min(nativePixelRatio, budgetRatio);
    const renderScale = pixelRatio / nativePixelRatio;
    const tier = qualityLocked ? 'high' : qualityTier(renderScale);
    // WebGLRenderer floors the physical canvas dimensions when applying DPR.
    const drawingBufferWidth = Math.max(1, Math.floor(viewportWidth * pixelRatio));
    const drawingBufferHeight = Math.max(1, Math.floor(viewportHeight * pixelRatio));

    return {
      revision,
      enabled,
      locked: qualityLocked,
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
      pixelBudget: qualityLocked
        ? drawingBufferWidth * drawingBufferHeight
        : pixelBudget,
      minimumPixelBudget: Math.min(budgets.minimum * MEGAPIXEL, nativePixels),
      maximumPixelBudget: Math.min(budgets.maximum * MEGAPIXEL, nativePixels),
      learnedMaximumPixelBudget: Math.min(
        budgets.maximum * MEGAPIXEL,
        nativePixels,
        learnedMaximumPixelBudget,
      ),
      captureResolution: captureResolutionFor(tier, gpuClass),
      shadowMapResolution: shadowResolutionFor(tier, gpuClass),
      shadowFrameInterval: tier === 'performance' ? 2 : 1,
      smoothedFps,
      gpuTimingEnabled: usesGpuTiming,
      gpuTargetFps,
      gpuFrameBudgetMs: 1000 / gpuTargetFps,
      gpuP95BudgetMs: (1000 / gpuTargetFps) * GPU_P95_BUDGET_RATIO,
      gpuTimingStatus,
      gpuMedianFrameTimeMs,
      gpuP95FrameTimeMs,
    };
  }

  function applyFrameRate(fps) {
    if (
      !enabled
      || qualityLocked
      || !Number.isFinite(fps)
      || fps <= 0
    ) return false;

    smoothedFps += (fps - smoothedFps) * 0.35;
    if (cooldownWindows > 0) cooldownWindows -= 1;

    if (smoothedFps < 39) {
      slowWindows += 1;
      fastWindows = 0;
    } else if (smoothedFps > 56 && !usesGpuTiming) {
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
      pixelBudget = Math.max(minimumPixelBudget(), pixelBudget * reduction);
      slowWindows = 0;
      cooldownWindows = 2;
      if (pixelBudget < previousBudget - 1) {
        revision += 1;
        return true;
      }
    }

    if (fastWindows >= 4 && cooldownWindows === 0) {
      const previousBudget = pixelBudget;
      pixelBudget = Math.min(maximumPixelBudget(), pixelBudget * 1.12);
      fastWindows = 0;
      cooldownWindows = 3;
      if (pixelBudget > previousBudget + 1) {
        revision += 1;
        return true;
      }
    }

    return false;
  }

  function applyGpuTiming(timing) {
    if (!enabled || qualityLocked || !usesGpuTiming) return false;

    const timingRevision = timing?.revision;
    const sampleCount = timing?.sampleCount;
    const medianFrameTimeMs = timing?.medianFrameTimeMs;
    const p95FrameTimeMs = timing?.p95FrameTimeMs;
    if (
      !Number.isFinite(timingRevision)
      || timingRevision === lastGpuTimingRevision
      || !Number.isFinite(sampleCount)
      || sampleCount < GPU_TIMING_MIN_SAMPLES
      || !Number.isFinite(medianFrameTimeMs)
      || medianFrameTimeMs <= 0
      || !Number.isFinite(p95FrameTimeMs)
      || p95FrameTimeMs <= 0
    ) return false;

    lastGpuTimingRevision = timingRevision;
    gpuMedianFrameTimeMs = medianFrameTimeMs;
    gpuP95FrameTimeMs = p95FrameTimeMs;

    const frameBudgetMs = 1000 / gpuTargetFps;
    const p95BudgetMs = frameBudgetMs * GPU_P95_BUDGET_RATIO;
    const overloaded = p95FrameTimeMs > p95BudgetMs;
    const severeOverload = p95FrameTimeMs > frameBudgetMs * GPU_SEVERE_P95_RATIO
      || medianFrameTimeMs > frameBudgetMs * GPU_SEVERE_MEDIAN_RATIO;
    const hasRecoveryHeadroom = p95FrameTimeMs <= frameBudgetMs * GPU_RECOVERY_P95_RATIO
      && medianFrameTimeMs <= frameBudgetMs * GPU_RECOVERY_MEDIAN_RATIO;

    if (overloaded) {
      gpuTimingStatus = 'overloaded';
      gpuSlowSamples += 1;
      gpuFastSamples = 0;
      if (!severeOverload && gpuSlowSamples < 2) return false;

      const previousBudget = pixelBudget;
      const minimumBudget = minimumPixelBudget();
      const reduction = severeOverload ? 0.72 : 0.84;
      // Remember that this budget was unsafe. The ceiling prevents recovery
      // from repeatedly crossing an expensive capture/shadow tier boundary.
      learnedMaximumPixelBudget = Math.min(
        learnedMaximumPixelBudget,
        Math.max(minimumBudget, previousBudget * 0.94),
      );
      pixelBudget = Math.max(minimumBudget, previousBudget * reduction);
      gpuSlowSamples = 0;
      cooldownWindows = 2;
      slowWindows = 0;
      fastWindows = 0;
      if (pixelBudget < previousBudget - 1) {
        revision += 1;
        return true;
      }
      return false;
    }

    gpuSlowSamples = 0;
    if (!hasRecoveryHeadroom) {
      gpuTimingStatus = 'within-budget';
      gpuFastSamples = 0;
      return false;
    }

    gpuTimingStatus = 'headroom';
    gpuFastSamples += 1;
    if (gpuFastSamples < GPU_RECOVERY_SAMPLES) return false;

    const previousBudget = pixelBudget;
    pixelBudget = Math.min(maximumPixelBudget(), previousBudget * 1.08);
    gpuFastSamples = 0;
    cooldownWindows = 3;
    if (pixelBudget > previousBudget + 1) {
      revision += 1;
      return true;
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
      resetGpuSampling({ forgetLearnedLimit: true });
      return state();
    },
    observeFrame(timestamp) {
      if (!enabled || qualityLocked) return false;
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
    sampleGpuTiming: applyGpuTiming,
    setTargetFrameRate(nextTargetFrameRate) {
      const normalizedTarget = normalizeTargetFrameRate(nextTargetFrameRate);
      if (normalizedTarget === gpuTargetFps) return gpuTargetFps;
      gpuTargetFps = normalizedTarget;
      resetGpuSampling({ forgetLearnedLimit: true });
      return gpuTargetFps;
    },
    resetFrameSampling() {
      lastTimestamp = null;
      sampleDuration = 0;
      sampleFrames = 0;
      slowWindows = 0;
      fastWindows = 0;
    },
    resetGpuSampling,
  };
}
