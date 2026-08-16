import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Refractor } from 'three/addons/objects/Refractor.js';
import { waterFragmentShader, waterVertexShader } from '../shaders/water.js';
import { createNoiseTexture } from './noise-texture.js';

export function createOcean({
  renderer,
  scene,
  camera,
  sunDirection,
  sky,
  sun,
  captureResolution = window.innerWidth < 720 ? 512 : 768,
  surfaceSegments = window.innerWidth < 720 ? 210 : 300,
}) {
  const noiseTexture = createNoiseTexture();
  const uniforms = {
    uTime: { value: 0 },
    uSunDirection: { value: sunDirection },
    uDeepColor: { value: new THREE.Color('#021725') },
    uShallowColor: { value: new THREE.Color('#08b4b8') },
    uHorizonColor: { value: new THREE.Color('#0b344c') },
    uWaterDepth: { value: 3.55 },
    uUnderwater: { value: 0 },
    uReflectionTextureMatrix: { value: new THREE.Matrix4() },
    uRefractionTextureMatrix: { value: new THREE.Matrix4() },
    tReflectionMap: { value: null },
    tRefractionMap: { value: null },
    tNoiseMap: { value: noiseTexture },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    vertexShader: waterVertexShader,
    fragmentShader: waterFragmentShader,
  });

  // The extra tessellation is reserved for desktop where the medium wave
  // bands are visible. Mobile keeps the lighter mesh and still receives all
  // fragment-level capillary detail.
  const geometry = new THREE.PlaneGeometry(
    420,
    420,
    surfaceSegments,
    surfaceSegments,
  );
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);

  const captureGeometry = new THREE.PlaneGeometry(420, 420);
  const reflector = new Reflector(captureGeometry, {
    textureWidth: captureResolution,
    textureHeight: captureResolution,
    clipBias: 0.0025,
    // The water shader immediately filters and distorts this texture, so
    // multisampling the offscreen target spends memory and startup time with
    // no visible gain. The main canvas remains antialiased.
    multisample: 0,
  });
  const refractor = new Refractor(captureGeometry, {
    textureWidth: captureResolution,
    textureHeight: captureResolution,
    clipBias: 0.0025,
    multisample: 0,
  });
  reflector.rotation.x = -Math.PI / 2;
  refractor.rotation.x = -Math.PI / 2;
  reflector.updateMatrixWorld(true);
  refractor.updateMatrixWorld(true);
  uniforms.tReflectionMap.value = reflector.getRenderTarget().texture;
  uniforms.tRefractionMap.value = refractor.getRenderTarget().texture;

  const reflectionCaptureInverse = new THREE.Matrix4();
  const refractionCaptureInverse = new THREE.Matrix4();
  let currentCaptureResolution = captureResolution;

  function updateReflectionTextureMatrix() {
    reflectionCaptureInverse.copy(reflector.matrixWorld).invert();
    uniforms.uReflectionTextureMatrix.value
      .copy(reflector.material.uniforms.textureMatrix.value)
      .multiply(reflectionCaptureInverse);
  }

  function updateRefractionTextureMatrix() {
    refractionCaptureInverse.copy(refractor.matrixWorld).invert();
    uniforms.uRefractionTextureMatrix.value
      .copy(refractor.material.uniforms.textureMatrix.value)
      .multiply(refractionCaptureInverse);
  }

  function hideCaptureScene(hiddenObjects) {
    camera.updateMatrixWorld();
    mesh.updateMatrixWorld();

    const oceanWasVisible = mesh.visible;
    const sunWasVisible = sun.visible;
    const sunVisibility = sky.uniforms.uSunVisibility.value;
    const hiddenVisibilities = hiddenObjects.map((object) => object.visible);

    mesh.visible = false;
    sun.visible = false;
    sky.uniforms.uSunVisibility.value = 0;
    hiddenObjects.forEach((object) => { object.visible = false; });

    return () => {
      mesh.visible = oceanWasVisible;
      sun.visible = sunWasVisible;
      sky.uniforms.uSunVisibility.value = sunVisibility;
      hiddenObjects.forEach((object, index) => {
        object.visible = hiddenVisibilities[index];
      });
    };
  }

  function withCaptureScene(hiddenObjects, renderCapture) {
    const restoreScene = hideCaptureScene(hiddenObjects);
    try {
      renderCapture();
    } finally {
      restoreScene();
    }
  }

  function compileCaptures(hiddenObjects = []) {
    const restoreScene = hideCaptureScene(hiddenObjects);
    const previousRenderTarget = renderer.getRenderTarget();

    try {
      // Offscreen targets use a different output-color shader variant than
      // the canvas. Compile those variants while KHR_parallel_shader_compile
      // can yield instead of discovering them in the first capture render.
      renderer.setRenderTarget(reflector.getRenderTarget());
      // Reflection and refraction share the same output variant, so one
      // capture-camera traversal primes both targets.
      return renderer.compileAsync(scene, reflector.getReflectionCamera(camera));
    } finally {
      renderer.setRenderTarget(previousRenderTarget);
      restoreScene();
    }
  }

  function renderReflectionCapture(hiddenObjects = []) {
    withCaptureScene(hiddenObjects, () => {
      reflector.onBeforeRender(renderer, scene, camera);
      updateReflectionTextureMatrix();
    });
  }

  function renderRefractionCapture(hiddenObjects = []) {
    withCaptureScene(hiddenObjects, () => {
      refractor.onBeforeRender(renderer, scene, camera);
      updateRefractionTextureMatrix();
    });
  }

  function renderCaptures(hiddenObjects = []) {
    withCaptureScene(hiddenObjects, () => {
      reflector.onBeforeRender(renderer, scene, camera);
      updateReflectionTextureMatrix();
      refractor.onBeforeRender(renderer, scene, camera);
      updateRefractionTextureMatrix();
    });
  }

  return {
    mesh,
    uniforms,
    usesManualCaptures: true,
    compileCaptures,
    renderReflectionCapture,
    renderRefractionCapture,
    renderCaptures,
    setCaptureResolution(resolution) {
      const nextResolution = Math.max(256, Math.round(resolution));
      if (nextResolution === currentCaptureResolution) return;
      currentCaptureResolution = nextResolution;
      reflector.getRenderTarget().setSize(nextResolution, nextResolution);
      refractor.getRenderTarget().setSize(nextResolution, nextResolution);
    },
    getDiagnostics() {
      const reflectionTarget = reflector.getRenderTarget();
      const refractionTarget = refractor.getRenderTarget();
      return {
        captureResolution: currentCaptureResolution,
        reflectionSize: [reflectionTarget.width, reflectionTarget.height],
        refractionSize: [refractionTarget.width, refractionTarget.height],
        surfaceSegments,
        captureStrategy: 'reflector-refractor',
      };
    },
    update(time, underwaterMix) {
      uniforms.uTime.value = time;
      uniforms.uUnderwater.value = underwaterMix;
    },
  };
}
