import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createBuoy } from './scene/buoy.js';
import { createEnvironment, seabedHeight } from './scene/environment.js';
import { createFishSchools } from './scene/fish.js';
import { createOcean } from './scene/ocean.js';
import { createSky } from './scene/sky.js';
import { createUnderwaterRays } from './scene/underwater-rays.js';
import { sampleOceanSurface } from './scene/waves.js';
import { createLoadingController } from './ui/loading.js';

const canvas = document.querySelector('#ocean-canvas');
const app = document.querySelector('#app');
const fpsValue = document.querySelector('[data-fps]');
const harnessMode = new URLSearchParams(window.location.search).has('harness');
const loading = createLoadingController(app);
loading.setStage(0.10, 'Building ocean surface');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.90;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x063c48, 0.00001);

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

controls.addEventListener('start', () => app.classList.add('is-orbiting'));
controls.addEventListener('end', () => app.classList.remove('is-orbiting'));

const sunDirection = new THREE.Vector3(-0.58, 0.10, -0.81).normalize();
const sky = createSky(scene, sunDirection);
const ocean = createOcean({
  renderer,
  scene,
  camera,
  sunDirection,
  sky,
  sun: sky.sun,
});
const environment = createEnvironment(scene, sunDirection);
const fishSchools = createFishSchools(scene);
const buoy = createBuoy(scene, sunDirection);
const underwaterRays = createUnderwaterRays(sunDirection);
const underwaterWorld = [
  ...environment.underwaterObjects,
  ...fishSchools.underwaterObjects,
  ...buoy.underwaterObjects,
];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionScale = reducedMotion ? 0.35 : 1;
const timer = new THREE.Timer().setTimescale(motionScale);
timer.connect(document);

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const mobileRatio = width < 720 ? 1.35 : 1.7;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobileRatio));
  renderer.setSize(width, height, false);
  underwaterRays.resize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize, { passive: true });
resize();

let underwaterMix = 0;
let fpsFrames = 0;
let fpsSampleStart = performance.now();
let smoothedFps = 60;
let harnessTime = 11.75;
let lastFrameDiagnostics = { drawCalls: 0, triangles: 0 };
let cameraIsUnderwater = false;

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
    ? underwaterTarget
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
  underwaterRays.render(renderer);
}

function renderFrame(elapsed) {
  updateFrameState(elapsed);
  renderOceanCaptures();
  renderScene();
}

function updateFps() {
  fpsFrames += 1;
  const now = performance.now();
  const sampleDuration = now - fpsSampleStart;
  if (sampleDuration < 500) return;

  const measuredFps = (fpsFrames * 1000) / sampleDuration;
  smoothedFps = THREE.MathUtils.lerp(smoothedFps, measuredFps, 0.42);
  fpsValue.textContent = String(Math.round(smoothedFps));
  fpsFrames = 0;
  fpsSampleStart = now;
}

async function start() {
  await loading.paint(0.36, 'Compiling water and reflections');
  await Promise.all([
    renderer.compileAsync(scene, camera),
    ocean.compileCaptures(buoy.captureHiddenObjects),
  ]);
  const initialTime = harnessMode ? harnessTime : 0;
  updateFrameState(initialTime);
  await loading.paint(0.70, 'Warming reflection');
  renderOceanCaptures('reflection');
  await loading.paint(0.82, 'Warming refraction');
  renderOceanCaptures('refraction');
  await loading.paint(0.94, 'Opening water');
  renderScene();

  if (harnessMode) {
    window.__WATER_HARNESS__ = {
    ready: false,
    setView({ position, target, time = harnessTime }) {
      harnessTime = time;
      camera.position.fromArray(position);
      controls.target.fromArray(target);
      camera.updateMatrixWorld();
      controls.update();
      renderFrame(harnessTime);
      // A second pass guarantees that projective captures use the final camera.
      renderFrame(harnessTime);
      return this.getDiagnostics();
    },
    getDiagnostics() {
      return {
        camera: camera.position.toArray(),
        target: controls.target.toArray(),
        underwater: underwaterMix > 0.5,
        drawCalls: lastFrameDiagnostics.drawCalls,
        triangles: lastFrameDiagnostics.triangles,
        programs: renderer.info.programs?.length ?? 0,
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
        renderFrame(harnessTime);
      }
      return this.getDiagnostics();
    },
    };
    renderFrame(harnessTime);
    window.__WATER_HARNESS__.ready = true;
  } else {
    renderer.setAnimationLoop(() => {
      timer.update();
      renderFrame(timer.getElapsed());
      updateFps();
    });
  }

  await loading.reveal();
}

start().catch((error) => {
  console.error(error);
  loading.fail();
});
