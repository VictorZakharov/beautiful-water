export const PRESENTATION_WINDOW_MS = 15_000;
export const PRESENTATION_BUCKET_MS = 500;

const COMMON_REFRESH_RATES = [
  24,
  30,
  48,
  50,
  60,
  72,
  75,
  90,
  100,
  120,
  144,
  165,
  180,
  200,
  240,
];

function percentile(sortedValues, quantile) {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (sortedValues.length - 1) * quantile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  return lower + (upper - lower) * (index - lowerIndex);
}

function summarizeFrameTimes(frameTimes) {
  const sortedTimes = frameTimes
    .filter((frameTimeMs) => Number.isFinite(frameTimeMs) && frameTimeMs > 0)
    .sort((left, right) => left - right);

  return {
    p50FrameTimeMs: percentile(sortedTimes, 0.5),
    p95FrameTimeMs: percentile(sortedTimes, 0.95),
    p99FrameTimeMs: percentile(sortedTimes, 0.99),
    worstFrameTimeMs: sortedTimes.length > 0
      ? sortedTimes.at(-1)
      : null,
  };
}

function snapRefreshRate(rawFps) {
  if (!Number.isFinite(rawFps) || rawFps <= 0) return null;
  const closest = COMMON_REFRESH_RATES.reduce((best, candidate) => (
    Math.abs(candidate - rawFps) < Math.abs(best - rawFps)
      ? candidate
      : best
  ));
  return Math.abs(closest - rawFps) <= Math.max(3, rawFps * 0.08)
    ? closest
    : Math.round(rawFps);
}

function estimateRefreshRate(timestamps, previousRefreshRate) {
  const intervals = [];
  const startIndex = Math.max(1, timestamps.length - 241);
  for (let index = startIndex; index < timestamps.length; index += 1) {
    const interval = timestamps[index] - timestamps[index - 1];
    if (interval >= 2 && interval <= 50) intervals.push(interval);
  }
  if (intervals.length < 12) return previousRefreshRate;

  intervals.sort((left, right) => left - right);
  const typicalFastInterval = percentile(intervals, 0.25);
  const candidate = snapRefreshRate(1000 / typicalFastInterval);
  if (!Number.isFinite(candidate)) return previousRefreshRate;
  return previousRefreshRate === null
    ? candidate
    : Math.max(previousRefreshRate, candidate);
}

function createRateSeries({
  timestamps,
  currentTime,
  windowDurationMs,
  bucketDurationMs,
}) {
  const bucketCount = Math.ceil(windowDurationMs / bucketDurationMs);
  const windowStart = currentTime - windowDurationMs;
  const firstTimestamp = timestamps[0] ?? currentTime;

  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = windowStart + index * bucketDurationMs;
    const bucketEnd = Math.min(
      currentTime,
      bucketStart + bucketDurationMs,
    );
    const observedStart = Math.max(bucketStart, firstTimestamp);
    if (bucketEnd <= observedStart) {
      return { offsetMs: bucketEnd - currentTime, fps: null };
    }

    let frames = 0;
    for (const timestamp of timestamps) {
      if (timestamp > observedStart && timestamp <= bucketEnd) frames += 1;
    }
    return {
      offsetMs: bucketEnd - currentTime,
      fps: (frames * 1000) / (bucketEnd - observedStart),
    };
  });
}

export function createPresentationMonitor({
  windowDurationMs = PRESENTATION_WINDOW_MS,
  bucketDurationMs = PRESENTATION_BUCKET_MS,
} = {}) {
  const timingWindowMs = Number.isFinite(windowDurationMs)
    ? Math.max(1_000, windowDurationMs)
    : PRESENTATION_WINDOW_MS;
  const historyBucketMs = Number.isFinite(bucketDurationMs)
    ? Math.max(100, bucketDurationMs)
    : PRESENTATION_BUCKET_MS;
  const timestamps = [];
  const cpuFrameSamples = [];
  let refreshRateFps = null;

  function prune(currentTime) {
    const cutoff = currentTime - timingWindowMs;
    let firstInsideWindow = timestamps.findIndex(
      (timestamp) => timestamp >= cutoff,
    );
    if (firstInsideWindow < 0) firstInsideWindow = timestamps.length;
    const removable = Math.max(0, firstInsideWindow - 1);
    if (removable > 0) timestamps.splice(0, removable);
    while (
      cpuFrameSamples.length > 0
      && cpuFrameSamples[0].capturedAt < cutoff
    ) {
      cpuFrameSamples.shift();
    }
  }

  function reset() {
    timestamps.length = 0;
    cpuFrameSamples.length = 0;
    refreshRateFps = null;
  }

  return {
    recordFrame(timestamp) {
      if (!Number.isFinite(timestamp) || timestamp < 0) return false;
      const previousTimestamp = timestamps.at(-1);
      if (Number.isFinite(previousTimestamp) && timestamp <= previousTimestamp) {
        reset();
      }
      timestamps.push(timestamp);
      return true;
    },
    recordCpuFrame(timestamp, frameTimeMs) {
      if (
        !Number.isFinite(timestamp)
        || !Number.isFinite(frameTimeMs)
        || frameTimeMs <= 0
        || frameTimeMs > 60_000
      ) return false;
      cpuFrameSamples.push({ capturedAt: timestamp, frameTimeMs });
      return true;
    },
    getState(currentTime = timestamps.at(-1) ?? 0) {
      const safeCurrentTime = Number.isFinite(currentTime)
        ? currentTime
        : timestamps.at(-1) ?? 0;
      prune(safeCurrentTime);
      refreshRateFps = estimateRefreshRate(timestamps, refreshRateFps);

      const cutoff = safeCurrentTime - timingWindowMs;
      const firstTimestamp = timestamps[0] ?? safeCurrentTime;
      const observedStart = Math.max(cutoff, firstTimestamp);
      const windowElapsedMs = Math.min(
        timingWindowMs,
        Math.max(0, safeCurrentTime - firstTimestamp),
      );
      const frameTimes = [];
      let presentedFrames = 0;
      for (let index = 1; index < timestamps.length; index += 1) {
        const frameTimestamp = timestamps[index];
        if (frameTimestamp < cutoff || frameTimestamp > safeCurrentTime) continue;
        const intervalStart = Math.max(timestamps[index - 1], cutoff);
        const frameTimeMs = frameTimestamp - intervalStart;
        if (frameTimeMs > 0) {
          frameTimes.push(frameTimeMs);
          presentedFrames += 1;
        }
      }
      const measuredDurationMs = Math.max(0, safeCurrentTime - observedStart);
      const averageFps = measuredDurationMs > 0
        ? (presentedFrames * 1000) / measuredDurationMs
        : null;
      const frameTimeSummary = summarizeFrameTimes(frameTimes);
      const cpuFrameTimeSummary = summarizeFrameTimes(
        cpuFrameSamples.map(({ frameTimeMs }) => frameTimeMs),
      );
      const onePercentLowFps = Number.isFinite(
        frameTimeSummary.p99FrameTimeMs,
      )
        ? 1000 / frameTimeSummary.p99FrameTimeMs
        : null;
      const series = createRateSeries({
        timestamps,
        currentTime: safeCurrentTime,
        windowDurationMs: timingWindowMs,
        bucketDurationMs: historyBucketMs,
      });
      const oneSecondSeries = createRateSeries({
        timestamps,
        currentTime: safeCurrentTime,
        windowDurationMs: timingWindowMs,
        bucketDurationMs: 1_000,
      });
      const observedOneSecondRates = oneSecondSeries
        .map(({ fps }) => fps)
        .filter(Number.isFinite);
      const worstOneSecondFps = observedOneSecondRates.length > 0
        ? Math.min(...observedOneSecondRates)
        : null;
      const currentFps = series.findLast(({ fps }) => Number.isFinite(fps))
        ?.fps ?? null;
      const targetFrameTimeMs = Number.isFinite(refreshRateFps)
        ? 1000 / refreshRateFps
        : null;
      const missedRefreshes = Number.isFinite(targetFrameTimeMs)
        ? frameTimes.reduce((total, frameTimeMs) => (
          total + Math.max(
            0,
            Math.round(frameTimeMs / targetFrameTimeMs) - 1,
          )
        ), 0)
        : null;
      const expectedRefreshes = Number.isFinite(missedRefreshes)
        ? presentedFrames + missedRefreshes
        : null;

      return {
        ready: windowElapsedMs >= timingWindowMs - 100,
        windowDurationMs: timingWindowMs,
        windowElapsedMs,
        sampleCount: frameTimes.length,
        presentedFrames,
        averageFps,
        currentFps,
        onePercentLowFps,
        worstOneSecondFps,
        refreshRateFps,
        targetFrameTimeMs,
        missedRefreshes,
        missedRefreshRate: Number.isFinite(expectedRefreshes)
          && expectedRefreshes > 0
          ? missedRefreshes / expectedRefreshes
          : null,
        cpuFrame: {
          sampleCount: cpuFrameSamples.length,
          p50Ms: cpuFrameTimeSummary.p50FrameTimeMs,
          p95Ms: cpuFrameTimeSummary.p95FrameTimeMs,
          p99Ms: cpuFrameTimeSummary.p99FrameTimeMs,
          worstMs: cpuFrameTimeSummary.worstFrameTimeMs,
        },
        series,
        ...frameTimeSummary,
      };
    },
    reset,
  };
}

export function createHistoryPath(
  series,
  {
    width = 160,
    height = 34,
    targetFps = null,
  } = {},
) {
  const validRates = series
    .map(({ fps }) => fps)
    .filter(Number.isFinite);
  const ceiling = Number.isFinite(targetFps) && targetFps > 0
    ? targetFps
    : Math.max(60, ...validRates);
  let drawing = false;

  return series.map(({ fps }, index) => {
    if (!Number.isFinite(fps)) {
      drawing = false;
      return '';
    }
    const x = series.length > 1
      ? (index / (series.length - 1)) * width
      : width;
    const y = height - Math.min(1, Math.max(0, fps / ceiling)) * height;
    const command = drawing ? 'L' : 'M';
    drawing = true;
    return `${command}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).filter(Boolean).join(' ');
}

function formatMetric(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'unavailable';
}

export function formatPerformanceReport({
  capturedAt,
  presentation,
  gpu,
  renderer,
  canvas,
  quality,
  scene,
  drawCalls,
  triangles,
  pageState,
  pageUrl,
  userAgent,
}) {
  const measuredSeconds = presentation.windowElapsedMs / 1000;
  const gpuWindowSeconds = gpu.windowDurationMs / 1000;
  const gpuSummary = gpu.ready
    ? `p50 ${formatMetric(gpu.medianFrameTimeMs)} ms | p95 ${formatMetric(gpu.p95FrameTimeMs)} ms | ${gpu.sampleCount} samples`
    : `collecting ${gpu.sampleCount} samples (${formatMetric(gpu.windowElapsedMs / 1000, 1)} / ${formatMetric(gpuWindowSeconds, 1)} s)`;
  const missedSummary = Number.isFinite(presentation.missedRefreshes)
    ? `${presentation.missedRefreshes} estimated (${formatMetric(presentation.missedRefreshRate * 100, 2)}%)`
    : 'unavailable until refresh rate is detected';

  return [
    'Beautiful Water performance report',
    `Captured: ${capturedAt}`,
    `Window: last ${formatMetric(measuredSeconds, 2)} s of ${formatMetric(presentation.windowDurationMs / 1000, 0)} s`,
    `Presented FPS: ${formatMetric(presentation.averageFps, 2)} average | ${formatMetric(presentation.currentFps, 2)} current | ${formatMetric(presentation.onePercentLowFps, 2)} 1% low | ${formatMetric(presentation.worstOneSecondFps, 2)} worst 1 s`,
    `Frame time: p50 ${formatMetric(presentation.p50FrameTimeMs)} ms | p95 ${formatMetric(presentation.p95FrameTimeMs)} ms | p99 ${formatMetric(presentation.p99FrameTimeMs)} ms | worst ${formatMetric(presentation.worstFrameTimeMs)} ms`,
    `CPU frame work: p50 ${formatMetric(presentation.cpuFrame.p50Ms)} ms | p95 ${formatMetric(presentation.cpuFrame.p95Ms)} ms | p99 ${formatMetric(presentation.cpuFrame.p99Ms)} ms | worst ${formatMetric(presentation.cpuFrame.worstMs)} ms | ${presentation.cpuFrame.sampleCount} samples`,
    `Estimated refresh: ${formatMetric(presentation.refreshRateFps, 0)} Hz | missed refreshes: ${missedSummary}`,
    `GPU pass (rolling ${formatMetric(gpuWindowSeconds, 0)} s): ${gpuSummary}`,
    `Renderer: ${renderer.pipeline} pipeline / ${renderer.backend} backend / ${renderer.adapter || 'unknown adapter'}`,
    `Canvas: ${canvas.drawingBufferWidth}x${canvas.drawingBufferHeight} drawing buffer / ${canvas.cssWidth}x${canvas.cssHeight} CSS px`,
    `Quality: ${quality.tier} tier | ${formatMetric(quality.renderScale, 3)} render scale | ${quality.captureResolution} capture | ${quality.shadowMapResolution} shadow map | every ${quality.shadowFrameInterval} frame(s) | revision ${quality.revision}`,
    `Scene: ${scene} | draw calls ${drawCalls} | triangles ${triangles}`,
    `Page state: ${pageState.visibility} | ${pageState.focused ? 'focused' : 'not focused'} | DPR ${formatMetric(pageState.devicePixelRatio, 2)}`,
    `Page: ${pageUrl}`,
    `User agent: ${userAgent}`,
  ].join('\n');
}
