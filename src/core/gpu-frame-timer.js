// Resolving GPU query buffers is asynchronous but not free. Once per
// 60 presented frames provides enough samples for a useful 10-second
// distribution without perturbing the presentation cadence being measured.
const DEFAULT_SAMPLE_INTERVAL = 60;
export const GPU_TIMING_WINDOW_MS = 10_000;

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

export function summarizeFrameTimes(frameTimes) {
  const validTimes = frameTimes
    .filter((frameTimeMs) => (
      Number.isFinite(frameTimeMs)
      && frameTimeMs > 0
      && frameTimeMs <= 1000
    ))
    .sort((left, right) => left - right);

  return {
    medianFrameTimeMs: percentile(validTimes, 0.5),
    p95FrameTimeMs: percentile(validTimes, 0.95),
  };
}

export function createGpuFrameTimer(
  renderer,
  {
    sampleInterval = DEFAULT_SAMPLE_INTERVAL,
    windowDurationMs = GPU_TIMING_WINDOW_MS,
    now = () => performance.now(),
  } = {},
) {
  const interval = Math.max(1, Math.round(sampleInterval));
  const timingWindowMs = Number.isFinite(windowDurationMs)
    ? Math.max(1, windowDurationMs)
    : GPU_TIMING_WINDOW_MS;
  const isNodeRenderer = renderer.isWebGPURenderer === true;
  const supportsNodeTimestamps = isNodeRenderer
    && renderer.backend?.trackTimestamp === true;
  const gl = !isNodeRenderer ? renderer.getContext?.() : null;
  const timerExtension = gl?.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null;
  const supportsWebGlTimestamps = Boolean(
    timerExtension
    && gl?.beginQuery
    && gl?.endQuery
    && gl?.getQueryParameter,
  );
  const supported = supportsNodeTimestamps || supportsWebGlTimestamps;

  let renderedFrames = 0;
  let activeQuery = null;
  let resolvePending = false;
  let samplingStartedAt = null;
  let revision = 0;
  let generation = 0;
  const pendingQueries = [];
  const samples = [];

  function pruneSamples(currentTime) {
    const cutoff = currentTime - timingWindowMs;
    while (samples.length > 0 && samples[0].capturedAt < cutoff) {
      samples.shift();
    }
    if (samples.length === 0) samplingStartedAt = null;
  }

  function record(frameTimeMs) {
    if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0 || frameTimeMs > 1000) {
      return;
    }

    const capturedAt = now();
    pruneSamples(capturedAt);
    if (samplingStartedAt === null) samplingStartedAt = capturedAt;
    samples.push({ capturedAt, frameTimeMs });
    revision += 1;
  }

  function pollWebGlQueries() {
    while (pendingQueries.length > 0) {
      const query = pendingQueries[0];
      const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
      if (!available) break;

      pendingQueries.shift();
      const disjoint = gl.getParameter(timerExtension.GPU_DISJOINT_EXT);
      const elapsedNanoseconds = gl.getQueryParameter(query, gl.QUERY_RESULT);
      gl.deleteQuery(query);
      if (!disjoint) record(elapsedNanoseconds / 1_000_000);
    }
  }

  function requestNodeTimestamp() {
    if (resolvePending) return;
    resolvePending = true;
    const requestedGeneration = generation;
    renderer.resolveTimestampsAsync('render')
      .then((frameTimeMs) => {
        if (requestedGeneration === generation) record(frameTimeMs);
      })
      .catch(() => {})
      .finally(() => {
        resolvePending = false;
      });
  }

  function reset() {
    samples.length = 0;
    samplingStartedAt = null;
    generation += 1;
    revision += 1;
  }

  return {
    supported,
    beginFrame() {
      if (!supportsWebGlTimestamps) return;
      pollWebGlQueries();
      if (renderedFrames % interval !== 0 || pendingQueries.length >= 3) return;

      activeQuery = gl.createQuery();
      gl.beginQuery(timerExtension.TIME_ELAPSED_EXT, activeQuery);
    },
    endFrame() {
      if (activeQuery) {
        gl.endQuery(timerExtension.TIME_ELAPSED_EXT);
        pendingQueries.push(activeQuery);
        activeQuery = null;
      }

      renderedFrames += 1;
      if (supportsNodeTimestamps && renderedFrames % interval === 0) {
        requestNodeTimestamp();
      }
    },
    getState() {
      const currentTime = now();
      pruneSamples(currentTime);
      const windowElapsedMs = samplingStartedAt === null
        ? 0
        : Math.min(timingWindowMs, Math.max(0, currentTime - samplingStartedAt));
      const statistics = summarizeFrameTimes(
        samples.map(({ frameTimeMs }) => frameTimeMs),
      );

      return {
        supported,
        revision,
        ready: windowElapsedMs >= timingWindowMs && samples.length >= 2,
        sampleCount: samples.length,
        windowDurationMs: timingWindowMs,
        windowElapsedMs,
        ...statistics,
      };
    },
    reset,
    dispose() {
      generation += 1;
      if (!gl) return;
      if (activeQuery) gl.deleteQuery(activeQuery);
      pendingQueries.forEach((query) => gl.deleteQuery(query));
      pendingQueries.length = 0;
      activeQuery = null;
    },
  };
}
