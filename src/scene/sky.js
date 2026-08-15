import * as THREE from 'three';
import { skyFragmentShader, skyVertexShader } from '../shaders/sky.js';

const SUN_DISTANCE = 315;

function createSunTexture() {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 256;
  textureCanvas.height = 256;

  const context = textureCanvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 2, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255,253,238,1)');
  gradient.addColorStop(0.08, 'rgba(255,248,220,1)');
  gradient.addColorStop(0.20, 'rgba(255,221,154,0.50)');
  gradient.addColorStop(0.50, 'rgba(255,181,92,0.12)');
  gradient.addColorStop(1, 'rgba(255,160,65,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createSky(scene, sunDirection) {
  const uniforms = {
    uTime: { value: 0 },
    uSunDirection: { value: sunDirection },
    uUnderwater: { value: 0 },
    uSunVisibility: { value: 1 },
  };

  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(390, 48, 24), material);
  sky.renderOrder = -10;
  scene.add(sky);

  const sunMaterial = new THREE.SpriteMaterial({
    map: createSunTexture(),
    color: 0xfff1cf,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  const sun = new THREE.Sprite(sunMaterial);
  sun.scale.set(14, 14, 1);
  sun.renderOrder = -5;
  scene.add(sun);

  return {
    sky,
    sun,
    uniforms,
    update(time, underwaterMix, camera) {
      uniforms.uTime.value = time;
      uniforms.uUnderwater.value = underwaterMix;
      sunMaterial.opacity = THREE.MathUtils.lerp(0.78, 0.04, underwaterMix);
      sky.position.copy(camera.position);
      sun.position.copy(camera.position).addScaledVector(sunDirection, SUN_DISTANCE);
    },
  };
}
