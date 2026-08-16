import * as THREE from 'three';
import { uniform } from 'three/tsl';
import { createNoiseTexture } from './noise-texture.js';
import { createWebGpuWaterMaterial } from './webgpu-water-material.js';

export function createWebGpuOcean({
  renderer,
  scene,
  sunDirection,
  captureResolution = 512,
  surfaceSegments = window.innerWidth < 720 ? 180 : 240,
}) {
  const noiseMap = createNoiseTexture();
  const timeNode = uniform(0);
  const underwaterNode = uniform(0);
  const geometry = new THREE.PlaneGeometry(
    420,
    420,
    surfaceSegments,
    surfaceSegments,
  );
  geometry.rotateX(-Math.PI / 2);

  const mesh = new THREE.Mesh(geometry);
  mesh.name = 'WebGPU ocean surface';
  const waterMaterial = createWebGpuWaterMaterial({
    mesh,
    timeNode,
    underwaterNode,
    noiseMap,
    sunDirection,
    reflectionScale: Math.min(captureResolution / 1536, 0.42),
  });
  mesh.material = waterMaterial.material;
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);

  let currentCaptureResolution = captureResolution;

  return {
    mesh,
    uniforms: {
      uTime: {
        get value() { return timeNode.value; },
        set value(value) { timeNode.value = value; },
      },
      uUnderwater: {
        get value() { return underwaterNode.value; },
        set value(value) { underwaterNode.value = value; },
      },
    },
    usesManualCaptures: false,
    compileCaptures: async () => {},
    renderReflectionCapture() {},
    renderRefractionCapture() {},
    renderCaptures() {},
    setCaptureResolution(resolution) {
      currentCaptureResolution = Math.max(256, Math.round(resolution));
      const drawingWidth = Math.max(
        renderer.domElement.width,
        renderer.domElement.height,
        1,
      );
      waterMaterial.reflectionSampler.reflector.resolutionScale = THREE.MathUtils.clamp(
        currentCaptureResolution / drawingWidth,
        0.14,
        0.42,
      );
    },
    getDiagnostics() {
      return {
        captureResolution: currentCaptureResolution,
        reflectionSize: null,
        refractionSize: null,
        surfaceSegments,
        captureStrategy: 'reflector-node',
      };
    },
    update(time, underwaterMix) {
      timeNode.value = time;
      underwaterNode.value = underwaterMix;
    },
  };
}
