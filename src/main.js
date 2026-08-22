import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  createAdaptiveQuality,
  inspectGpu,
  shouldUseAntialias,
} from './core/adaptive-quality.js';
import { createGpuFrameTimer } from './core/gpu-frame-timer.js';
import {
  createHistoryPath,
  createPresentationMonitor,
  formatPerformanceReport,
} from './core/presentation-monitor.js';
import { createRenderer, readRendererPreference } from './core/renderer.js';
import { createBuoy } from './scene/buoy.js';
import { createEnvironment, seabedHeight } from './scene/environment.js';
import { createFishSchools } from './scene/fish.js';
import { loadScenePipeline } from './scene/pipeline.js';
import { sampleOceanSurface } from './scene/waves.js';
import { createLoadingController } from './ui/loading.js';
import { createRendererToggle } from './ui/renderer-toggle.js';

const canvas = document.querySelector('#ocean-canvas');
const app = document.querySelector('#app');
const fpsValue = document.querySelector('[data-fps]');
const gpuP50Value = document.querySelector('[data-gpu-p50]');
const gpuP95Value = document.querySelector('[data-gpu-p95]');
const performancePanel = document.querySelector('[data-performance-panel]');
const fpsHistory = document.querySelector('[data-fps-history]');
const fpsHistoryLine = document.querySelector('[data-fps-history-line]');
const fpsAverageValue = document.querySelector('[data-fps-average]');
const fpsLowValue = document.querySelector('[data-fps-low]');
const performanceCopyLabel = document.querySelector('[data-performance-copy]');
const query = new URLSearchParams(window.location.search);
const harnessMode = query.has('harness');
const nativeSustainProfile = !harnessMode
  && query.get('sustain') === 'native-4k';
const loading = createLoadingController(app);
loading.setStage(0.10, 'Building ocean surface');
const preferredRenderer = readRendererPreference(query);

const requestedAntialias = shouldUseAntialias({
  width: window.innerWidth,
  height: window.innerHeight,
  devicePixelRatio: window.devicePixelRatio,
});
// The WebGPU screen-space refraction path samples the main color/depth target.
// Keeping that target single-sampled avoids an invalid multisampled depth bind
// and removes a costly full-resolution resolve on high-DPI integrated GPUs.
const antialias = preferredRenderer === 'webgl' && requestedAntialias;

await loading.paint(0.16, preferredRenderer === 'webgpu' ? 'Starting WebGPU' : 'Starting WebGL');
const rendererInfo = await createRenderer({
  canvas,
  antialias,
  preferredMode: preferredRenderer,
});
const renderer = rendererInfo.renderer;
createRendererToggle(document.querySelector('[data-renderer-toggle]'), rendererInfo);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.90;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Keep shadow refreshes on an explicit cadence so the capture and main passes
// reuse one atlas; the performance tier can safely refresh it every other frame.
if (rendererInfo.pipeline === 'webgl') renderer.shadowMap.autoUpdate = false;

const gpu = inspectGpu(renderer, {
  rendererName: rendererInfo.adapterName,
  deviceMemory: navigator.deviceMemory,
  hardwareConcurrency: navigator.hardwareConcurrency,
});
const harnessGpuClass = query.get('gpuClass');
const gpuClass = harnessMode
  && ['software', 'integrated', 'unknown', 'discrete'].includes(harnessGpuClass)
  ? harnessGpuClass
  : gpu.gpuClass;
const adaptiveQuality = createAdaptiveQuality({
  width: window.innerWidth,
  height: window.innerHeight,
  devicePixelRatio: window.devicePixelRatio,
  gpuClass,
  rendererName: gpu.renderer,
  lockedPixelRatio: nativeSustainProfile ? 1 : null,
});
const initialQuality = adaptiveQuality.getState();
const gpuFrameTimer = createGpuFrameTimer(renderer);
const presentationMonitor = createPresentationMonitor();

await loading.paint(0.24, 'Loading water pipeline');
const scenePipeline = await loadScenePipeline(rendererInfo.pipeline);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x063c48, 0.00001);
const underwaterBackground = new THREE.Color(0x063c48);
// Keep an opaque backdrop behind both skydomes. The sky owns the visible
// air-to-water blend; swapping Scene.background halfway through that blend
// exposed a solid strip at the finite ocean horizon.
scene.background = underwaterBackground;

const camera = new THREE.PerspectiveCamera(51, 1, 0.08, 520);
camera.position.set(7.8, 3.65, 10.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.54, 0);
controls.enableDamping = !harnessMode;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.screenSpacePanning = false;
controls.minDistance = 2.7;
controls.maxDistance = 46;
controls.minPolarAngle = 0.055;
controls.maxPolarAngle = Math.PI - 0.055;
controls.zoomToCursor = false;
controls.update();

// Keep the live timing profiler on the animation loop while selecting a
// deterministic medium; harness mode renders only on explicit test calls.
if (!harnessMode && query.get('profileView') === 'underwater') {
  camera.position.set(7.5, -2.15, 9.8);
  controls.target.set(0, -1.75, 0);
  controls.update();
}

controls.addEventListener('start', () => app.classList.add('is-orbiting'));
controls.addEventListener('end', () => app.classList.remove('is-orbiting'));

const sunDirection = new THREE.Vector3(-0.58, 0.10, -0.81).normalize();
const surfaceSegments = gpuClass === 'discrete'
  ? 300
  : gpuClass === 'unknown'
    ? 240
    : rendererInfo.pipeline === 'webgpu' ? 180 : 210;
const sky = scenePipeline.createSky(scene, sunDirection);
const ocean = rendererInfo.pipeline === 'webgpu'
  ? scenePipeline.createOcean({
    renderer,
    scene,
    sunDirection,
    captureResolution: initialQuality.captureResolution,
    surfaceSegments,
  })
  : scenePipeline.createOcean({
    renderer,
    scene,
    camera,
    sunDirection,
    sky,
    sun: sky.sun,
    captureResolution: initialQuality.captureResolution,
    surfaceSegments,
  });
const environment = createEnvironment(scene, sunDirection, {
  shadowMapResolution: initialQuality.shadowMapResolution,
  rendererMode: rendererInfo.pipeline,
});
const fishSchools = createFishSchools(scene);
const buoy = createBuoy(scene, sunDirection, { rendererMode: rendererInfo.pipeline });
const underwaterRays = scenePipeline.createUnderwaterRays(sunDirection);
const underwaterWorld = [
  ...environment.underwaterObjects,
  ...fishSchools.underwaterObjects,
  ...buoy.underwaterObjects,
];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionScale = reducedMotion ? 0.35 : 1;
const timer = new THREE.Timer().setTimescale(motionScale);
timer.connect(document);

function applyRenderQuality() {
  const quality = adaptiveQuality.getState();
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(quality.width, quality.height, false);
  ocean.setCaptureResolution(quality.captureResolution);
  environment.setShadowMapResolution(quality.shadowMapResolution);
  renderer.shadowMap.needsUpdate = true;
  environment.requestShadowUpdate();
  underwaterRays.resize(quality.drawingBufferWidth, quality.drawingBufferHeight);
  camera.aspect = quality.width / quality.height;
  camera.updateProjectionMatrix();
}

function resize() {
  adaptiveQuality.resize(
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio,
  );
  applyRenderQuality();
}

window.addEventListener('resize', resize, { passive: true });
document.addEventListener('visibilitychange', () => {
  adaptiveQuality.resetFrameSampling();
  gpuFrameTimer.reset();
  presentationMonitor.reset();
  fpsFrames = 0;
  fpsSampleStart = performance.now();
  smoothedFps = null;
  fpsValue.textContent = '--';
  fpsHistoryLine.setAttribute('d', '');
});
let rendererDisposed = false;
function disposeRenderer() {
  if (rendererDisposed) return;
  rendererDisposed = true;
  renderer.setAnimationLoop(null);
  gpuFrameTimer.dispose();
  controls.dispose();
  // Native-4K WebGPU targets can block indefinitely in Three.js dispose()
  // while Chromium is already tearing down the document and GPU context.
  // Stop all producers here and let navigation release the WebGPU backend.
  if (!renderer.isWebGPURenderer) renderer.dispose();
}
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  disposeRenderer();
});
resize();

let underwaterMix = 0;
let fpsFrames = 0;
let fpsSampleStart = performance.now();
let smoothedFps = null;
let latestPresentation = presentationMonitor.getState();
let harnessTime = 11.75;
let harnessUnderwaterMix = null;
let harnessUnderwaterRaysEnabled = true;
let lastFrameDiagnostics = { drawCalls: 0, triangles: 0 };
let cameraIsUnderwater = false;
let renderedFrames = 0;
const sustainCpuFrameTimes = [];

function getSustainDiagnostics() {
  return {
    ready: nativeSustainProfile
      && window.__WATER_PERFORMANCE__?.ready === true,
    canvasSize: [renderer.domElement.width, renderer.domElement.height],
    quality: adaptiveQuality.getState(),
    gpu: gpuFrameTimer.getState(),
    cpuFrameTimes: [...sustainCpuFrameTimes],
    renderedFrames,
  };
}

if (nativeSustainProfile) {
  window.__WATER_PERFORMANCE__ = {
    ready: false,
    resetMeasurement() {
      sustainCpuFrameTimes.length = 0;
      gpuFrameTimer.reset();
      return getSustainDiagnostics();
    },
    getDiagnostics: getSustainDiagnostics,
    dispose() {
      this.ready = false;
      disposeRenderer();
    },
  };
}

function updateFrameState(elapsed) {
  if (!harnessMode) {
    controls.target.set(
      buoy.mesh.position.x,
      buoy.mesh.position.y + 0.62,
      buoy.mesh.position.z,
    );
  }
  controls.update();

  const targetFloor = seabedHeight(controls.target.x, controls.target.z) + 0.22;
  controls.target.y = Math.max(controls.target.y, targetFloor);
  const cameraFloor = seabedHeight(camera.position.x, camera.position.z) + 0.30;
  if (camera.position.y < cameraFloor) {
    camera.position.y = cameraFloor;
    controls.update();
  }

  const cameraSurface = sampleOceanSurface(camera.position.x, camera.position.z, elapsed);
  const underwaterTarget = camera.position.y < cameraSurface.height ? 1 : 0;
  cameraIsUnderwater = underwaterTarget > 0.5;
  underwaterMix = harnessMode
    ? (harnessUnderwaterMix ?? underwaterTarget)
    : THREE.MathUtils.lerp(underwaterMix, underwaterTarget, 0.085);

  ocean.update(elapsed, underwaterMix);
  sky.update(elapsed, underwaterMix, camera);
  environment.update(elapsed, underwaterMix);
  fishSchools.update(elapsed, underwaterMix, camera);
  buoy.update(elapsed, underwaterMix);
  underwaterRays.update(elapsed, underwaterMix, camera);

  scene.fog.density = THREE.MathUtils.lerp(0.0017, 0.038, underwaterMix);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(0.90, 0.76, underwaterMix);
  app.classList.toggle('is-underwater', underwaterMix > 0.5);
}

function renderOceanCaptures(pass = 'both') {
  if (!ocean.usesManualCaptures) return;
  underwaterWorld.forEach((object) => { object.visible = true; });
  if (underwaterMix < 0.65) {
    if (pass === 'reflection') {
      ocean.renderReflectionCapture(buoy.captureHiddenObjects);
    } else if (pass === 'refraction') {
      ocean.renderRefractionCapture(buoy.captureHiddenObjects);
    } else {
      ocean.renderCaptures(buoy.captureHiddenObjects);
    }
  }
  if (!cameraIsUnderwater) {
    underwaterWorld.forEach((object) => { object.visible = false; });
  }
}

function renderScene() {
  renderer.render(scene, camera);
  lastFrameDiagnostics = {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
  if (!harnessMode || harnessUnderwaterRaysEnabled) {
    underwaterRays.render(renderer);
  }
}

function renderFrame(elapsed) {
  gpuFrameTimer.beginFrame();
  try {
    const quality = adaptiveQuality.getState();
    if (renderedFrames % quality.shadowFrameInterval === 0) {
      renderer.shadowMap.needsUpdate = true;
      environment.requestShadowUpdate();
    }
    updateFrameState(elapsed);
    renderOceanCaptures();
    renderScene();
  } finally {
    gpuFrameTimer.endFrame();
  }
  renderedFrames += 1;
}

function formatHudFps(fps) {
  if (!Number.isFinite(fps)) return '--';
  return fps < 20 ? fps.toFixed(1) : String(Math.round(fps));
}

function updatePresentationHud(presentation) {
  const targetFps = presentation.refreshRateFps
    ?? Math.max(60, presentation.averageFps ?? 0);
  fpsHistoryLine.setAttribute('d', createHistoryPath(
    presentation.series,
    { targetFps },
  ));
  fpsAverageValue.textContent = formatHudFps(presentation.averageFps);
  fpsLowValue.textContent = formatHudFps(presentation.onePercentLowFps);
  fpsHistory.setAttribute(
    'aria-label',
    `Presented FPS over the last ${(presentation.windowElapsedMs / 1000).toFixed(1)} seconds: ${formatHudFps(presentation.averageFps)} average, ${formatHudFps(presentation.onePercentLowFps)} one-percent low`,
  );
  const hasFrameDrop = presentation.windowElapsedMs >= 2_000
    && Number.isFinite(presentation.worstOneSecondFps)
    && Number.isFinite(presentation.refreshRateFps)
    && presentation.worstOneSecondFps < presentation.refreshRateFps * 0.75;
  performancePanel.classList.toggle('has-frame-drop', hasFrameDrop);
}

function updateFps(now = performance.now()) {
  fpsFrames += 1;
  const sampleDuration = now - fpsSampleStart;
  if (sampleDuration < 500) return;

  const measuredFps = (fpsFrames * 1000) / sampleDuration;
  smoothedFps = Number.isFinite(smoothedFps)
    ? THREE.MathUtils.lerp(smoothedFps, measuredFps, 0.42)
    : measuredFps;
  fpsValue.textContent = formatHudFps(smoothedFps);
  const gpuTiming = gpuFrameTimer.getState();
  const formatGpuTime = (frameTimeMs) => (
    Number.isFinite(frameTimeMs)
      ? frameTimeMs.toFixed(frameTimeMs < 10 ? 2 : 1)
      : '--'
  );
  gpuP50Value.textContent = gpuTiming.ready
    ? formatGpuTime(gpuTiming.medianFrameTimeMs)
    : '--';
  gpuP95Value.textContent = gpuTiming.ready
    ? formatGpuTime(gpuTiming.p95FrameTimeMs)
    : '--';
  latestPresentation = presentationMonitor.getState(now);
  updatePresentationHud(latestPresentation);
  fpsFrames = 0;
  fpsSampleStart = now;
}

function createClipboardFallback(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard copy was rejected');
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  createClipboardFallback(text);
}

function buildPerformanceReport() {
  latestPresentation = presentationMonitor.getState(performance.now());
  const quality = adaptiveQuality.getState();
  return formatPerformanceReport({
    capturedAt: new Date().toISOString(),
    presentation: latestPresentation,
    gpu: gpuFrameTimer.getState(),
    renderer: {
      pipeline: rendererInfo.pipeline,
      backend: rendererInfo.backend,
      adapter: rendererInfo.adapterName ?? gpu.renderer,
    },
    canvas: {
      drawingBufferWidth: renderer.domElement.width,
      drawingBufferHeight: renderer.domElement.height,
      cssWidth: window.innerWidth,
      cssHeight: window.innerHeight,
    },
    quality,
    scene: cameraIsUnderwater ? 'underwater' : 'surface',
    drawCalls: lastFrameDiagnostics.drawCalls,
    triangles: lastFrameDiagnostics.triangles,
    pageState: {
      visibility: document.visibilityState,
      focused: document.hasFocus(),
      devicePixelRatio: window.devicePixelRatio,
    },
    pageUrl: window.location.href,
    userAgent: navigator.userAgent,
  });
}

let copyFeedbackTimer = null;
performancePanel.addEventListener('click', async () => {
  try {
    await copyText(buildPerformanceReport());
    performancePanel.dataset.copyState = 'copied';
    performanceCopyLabel.textContent = 'COPIED 15S REPORT';
  } catch (error) {
    console.warn('Unable to copy performance report.', error);
    performancePanel.dataset.copyState = 'failed';
    performanceCopyLabel.textContent = 'COPY FAILED';
  }
  window.clearTimeout(copyFeedbackTimer);
  copyFeedbackTimer = window.setTimeout(() => {
    delete performancePanel.dataset.copyState;
    performanceCopyLabel.textContent = 'CLICK TO COPY 15S REPORT';
  }, 2_000);
});

async function start() {
  await loading.paint(0.36, 'Compiling water and reflections');
  await Promise.all([
    renderer.compileAsync(scene, camera),
    ocean.compileCaptures(buoy.captureHiddenObjects),
  ]);
  const initialTime = harnessMode ? harnessTime : 0;
  updateFrameState(initialTime);
  await loading.paint(0.70, 'Warming reflection');
  renderer.shadowMap.needsUpdate = true;
  environment.requestShadowUpdate();
  renderOceanCaptures('reflection');
  await loading.paint(0.82, 'Warming refraction');
  renderOceanCaptures('refraction');
  await loading.paint(0.94, 'Opening water');
  renderScene();

  if (harnessMode) {
    window.__WATER_HARNESS__ = {
    ready: false,
    setView({
      position,
      target,
      time = harnessTime,
      renderPasses = 2,
      underwaterBlend = null,
    }) {
      harnessTime = time;
      harnessUnderwaterMix = Number.isFinite(underwaterBlend)
        ? THREE.MathUtils.clamp(underwaterBlend, 0, 1)
        : null;
      camera.position.fromArray(position);
      controls.target.fromArray(target);
      camera.updateMatrixWorld();
      controls.update();
      const passes = THREE.MathUtils.clamp(Math.round(renderPasses), 1, 2);
      for (let pass = 0; pass < passes; pass += 1) {
        renderFrame(harnessTime);
      }
      return this.getDiagnostics();
    },
    getDiagnostics() {
      const quality = adaptiveQuality.getState();
      return {
        camera: camera.position.toArray(),
        target: controls.target.toArray(),
        underwater: underwaterMix > 0.5,
        underwaterMix,
        drawCalls: lastFrameDiagnostics.drawCalls,
        triangles: lastFrameDiagnostics.triangles,
        programs: renderer.info.programs?.length ?? (lastFrameDiagnostics.drawCalls > 0 ? 1 : 0),
        quality: {
          ...quality,
          antialias,
          canvasSize: [renderer.domElement.width, renderer.domElement.height],
          ocean: ocean.getDiagnostics(),
          environment: environment.getDiagnostics(),
        },
        renderer: {
          preferred: preferredRenderer,
          pipeline: rendererInfo.pipeline,
          backend: rendererInfo.backend,
          adapter: rendererInfo.adapterName,
          fallbackReason: rendererInfo.fallbackReason,
        },
        performance: gpuFrameTimer.getState(),
        controls: {
          orbitPivot: 'buoy',
          panEnabled: controls.enablePan,
          zoomToCursor: controls.zoomToCursor,
        },
        fish: fishSchools.getDiagnostics(camera),
      };
    },
    advance({ duration = 1, step = 1 / 30 } = {}) {
      const endTime = harnessTime + Math.max(0, duration);
      const frameStep = THREE.MathUtils.clamp(step, 1 / 120, 1 / 20);
      while (harnessTime + 0.0001 < endTime) {
        harnessTime = Math.min(harnessTime + frameStep, endTime);
        // Fish and buoy behavior need fixed simulation steps, but none of the
        // intermediate frames need GPU readback. Rendering only the settled
        // state keeps deterministic behavior checks fast on software WebGL.
        updateFrameState(harnessTime);
      }
      renderFrame(harnessTime);
      return this.getDiagnostics();
    },
    setUnderwaterRaysEnabled(enabled) {
      harnessUnderwaterRaysEnabled = Boolean(enabled);
      renderScene();
    },
    samplePerformance({ fps, samples = 1 }) {
      let changed = false;
      for (let index = 0; index < samples; index += 1) {
        changed = adaptiveQuality.sampleFrameRate(fps) || changed;
      }
      if (changed) applyRenderQuality();
      return this.getDiagnostics();
    },
    };
    renderFrame(harnessTime);
  }

  // Reveal at the conservative startup resolution before continuous 4K work
  // begins. Otherwise a costly first animation frame can starve this paint.
  await loading.reveal();
  if (harnessMode) {
    window.__WATER_HARNESS__.ready = true;
  } else {
    fpsFrames = 0;
    fpsSampleStart = performance.now();
    smoothedFps = null;
    presentationMonitor.reset();
    renderer.setAnimationLoop((timestamp) => {
      const cpuFrameStart = performance.now();
      presentationMonitor.recordFrame(timestamp);
      if (!document.hidden && adaptiveQuality.observeFrame(timestamp)) {
        applyRenderQuality();
      }
      timer.update();
      renderFrame(timer.getElapsed());
      updateFps(timestamp);
      const cpuFrameTime = performance.now() - cpuFrameStart;
      presentationMonitor.recordCpuFrame(timestamp, cpuFrameTime);
      if (nativeSustainProfile) {
        sustainCpuFrameTimes.push(cpuFrameTime);
        if (sustainCpuFrameTimes.length > 20_000) {
          sustainCpuFrameTimes.shift();
        }
      }
    });
    if (nativeSustainProfile) window.__WATER_PERFORMANCE__.ready = true;
  }
}

start().catch((error) => {
  console.error(error);
  loading.fail();
});
