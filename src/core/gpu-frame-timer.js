// Resolving WebGPU query buffers is asynchronous but not free. Once per
// 60 presented frames keeps the readout responsive without perturbing the
// presentation cadence that it is meant to explain.
const DEFAULT_SAMPLE_INTERVAL = 60;
const FRAME_TIME_SMOOTHING = 0.28;

export function frameTimeToCapacity(frameTimeMs) {
  if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0) return null;
  return 1000 / frameTimeMs;
}

export function createGpuFrameTimer(
  renderer,
  { sampleInterval = DEFAULT_SAMPLE_INTERVAL } = {},
) {
  const interval = Math.max(1, Math.round(sampleInterval));
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
  let smoothedFrameTimeMs = null;
  let revision = 0;
  const pendingQueries = [];

  function record(frameTimeMs) {
    if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0 || frameTimeMs > 1000) {
      return;
    }
    smoothedFrameTimeMs = smoothedFrameTimeMs === null
      ? frameTimeMs
      : smoothedFrameTimeMs
        + (frameTimeMs - smoothedFrameTimeMs) * FRAME_TIME_SMOOTHING;
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
    renderer.resolveTimestampsAsync('render')
      .then(record)
      .catch(() => {})
      .finally(() => {
        resolvePending = false;
      });
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
      return {
        supported,
        revision,
        frameTimeMs: smoothedFrameTimeMs,
        capacityFps: frameTimeToCapacity(smoothedFrameTimeMs),
      };
    },
    dispose() {
      if (!gl) return;
      if (activeQuery) gl.deleteQuery(activeQuery);
      pendingQueries.forEach((query) => gl.deleteQuery(query));
      pendingQueries.length = 0;
      activeQuery = null;
    },
  };
}
