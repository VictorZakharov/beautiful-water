import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { mix, smoothstep, texture, uniform, vec3 } from 'three/tsl';

const SUN_DISTANCE = 315;

function createSkyTexture() {
  const width = 1024;
  const height = 512;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = width;
  textureCanvas.height = height;
  const context = textureCanvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#06366d');
  gradient.addColorStop(0.28, '#0f5f9a');
  gradient.addColorStop(0.48, '#5b8faa');
  gradient.addColorStop(0.53, '#739bab');
  gradient.addColorStop(0.64, '#155b79');
  gradient.addColorStop(1, '#052f4c');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.name = 'WebGPU procedural sky';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function createSunTexture() {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 192;
  textureCanvas.height = 192;
  const context = textureCanvas.getContext('2d');
  const gradient = context.createRadialGradient(96, 96, 1, 96, 96, 96);
  gradient.addColorStop(0, 'rgba(255,254,239,1)');
  gradient.addColorStop(0.13, 'rgba(255,246,208,1)');
  gradient.addColorStop(0.24, 'rgba(255,213,139,0.42)');
  gradient.addColorStop(0.52, 'rgba(255,176,92,0.08)');
  gradient.addColorStop(1, 'rgba(255,160,70,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 192, 192);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.name = 'WebGPU sun disc';
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCloudTexture() {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 512;
  textureCanvas.height = 256;
  const context = textureCanvas.getContext('2d');
  context.clearRect(0, 0, 512, 256);

  const drawPuff = (x, y, radiusX, radiusY, color) => {
    const gradient = context.createRadialGradient(x, y, 1, x, y, radiusX);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.62, color);
    gradient.addColorStop(1, 'rgba(225,236,242,0)');
    context.save();
    context.translate(x, y);
    context.scale(1, radiusY / radiusX);
    context.translate(-x, -y);
    context.fillStyle = gradient;
    context.fillRect(x - radiusX, y - radiusX, radiusX * 2, radiusX * 2);
    context.restore();
  };

  drawPuff(256, 171, 205, 46, 'rgba(68,91,108,0.42)');
  const puffs = [
    [75, 148, 68, 48], [138, 121, 83, 66], [211, 130, 92, 76],
    [282, 99, 108, 88], [359, 124, 94, 71], [432, 151, 72, 50],
    [252, 160, 130, 60],
  ];
  for (const [x, y, radiusX, radiusY] of puffs) {
    drawPuff(x, y, radiusX, radiusY, 'rgba(231,239,243,0.82)');
  }

  // Small lobes and transparent erosion give the silhouette actual cloud
  // detail. The former whole-canvas blur turned these into giant soft blobs.
  let detailState = 0x48f2a31d;
  const random = () => {
    detailState = (Math.imul(detailState, 1664525) + 1013904223) >>> 0;
    return detailState / 4294967296;
  };
  for (let index = 0; index < 34; index += 1) {
    const x = 61 + random() * 390;
    const normalized = Math.abs(x - 256) / 195;
    const y = 103 + random() * 67 + normalized * 32;
    const radiusX = 10 + random() * 24;
    const radiusY = radiusX * (0.42 + random() * 0.34);
    drawPuff(x, y, radiusX, radiusY, `rgba(242,247,248,${0.48 + random() * 0.30})`);
  }

  context.save();
  context.globalCompositeOperation = 'destination-out';
  for (let index = 0; index < 12; index += 1) {
    const x = 52 + random() * 408;
    const y = 172 + random() * 28;
    const radiusX = 5 + random() * 12;
    const radiusY = 4 + random() * 7;
    drawPuff(x, y, radiusX, radiusY, `rgba(0,0,0,${0.26 + random() * 0.28})`);
  }
  context.restore();

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.name = 'WebGPU cloud bank';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function createCloudDeck() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const worldUp = new THREE.Vector3(0, 1, 0);
  let state = 0x23ca81f7;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  for (let index = 0; index < 15; index += 1) {
    const azimuth = (index / 15) * Math.PI * 2 + (random() - 0.5) * 0.24;
    const elevation = 0.12 + random() * 0.34;
    const direction = new THREE.Vector3(
      Math.cos(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.sin(azimuth) * Math.cos(elevation),
    );
    const center = direction.clone().multiplyScalar(330);
    const right = new THREE.Vector3().crossVectors(worldUp, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const halfWidth = 22 + random() * 28;
    const halfHeight = 8 + random() * 9;
    const vertexOffset = positions.length / 3;
    for (const [side, vertical] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const corner = center.clone()
        .addScaledVector(right, side * halfWidth)
        .addScaledVector(up, vertical * halfHeight);
      positions.push(corner.x, corner.y, corner.z);
    }
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(
      vertexOffset, vertexOffset + 1, vertexOffset + 2,
      vertexOffset, vertexOffset + 2, vertexOffset + 3,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({
    map: createCloudTexture(),
    color: 0xf2f7f8,
    transparent: true,
    opacity: 0.78,
    alphaTest: 0.012,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const clouds = new THREE.Mesh(geometry, material);
  clouds.name = 'WebGPU cloud deck';
  clouds.renderOrder = -6;
  clouds.frustumCulled = false;
  return clouds;
}

export function createWebGpuSky(scene, sunDirection) {
  const underwaterNode = uniform(0);
  const skyTexture = createSkyTexture();
  const skyMaterial = new MeshBasicNodeMaterial({
    side: THREE.FrontSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
  skyMaterial.colorNode = mix(
    texture(skyTexture).rgb,
    vec3(0.0018, 0.045, 0.065),
    smoothstep(0.02, 0.98, underwaterNode),
  );
  // Microsoft WARP can cull BackSide node materials inconsistently. Invert
  // the sphere once and render ordinary front faces so native adapters and
  // software WebGPU execute the same portable rasterization path.
  const skyGeometry = new THREE.SphereGeometry(390, 48, 24);
  skyGeometry.scale(-1, 1, 1);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.name = 'WebGPU atmospheric sky';
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  const clouds = createCloudDeck();
  scene.add(clouds);

  const visibility = { value: 1 };
  const sunMaterial = new THREE.SpriteMaterial({
    map: createSunTexture(),
    color: 0xfff0c8,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  const sun = new THREE.Sprite(sunMaterial);
  sun.name = 'WebGPU sun';
  sun.scale.set(24, 24, 1);
  sun.renderOrder = -5;
  scene.add(sun);

  return {
    sky,
    sun,
    uniforms: { uSunVisibility: visibility },
    update(time, underwaterMix, camera) {
      // Fade continuously into the underwater backdrop. A visibility toggle
      // near the end of the dive exposed a flat-color horizon for one frame.
      const surfaceVisibility = 1 - THREE.MathUtils.smoothstep(underwaterMix, 0.02, 0.98);
      visibility.value = surfaceVisibility;
      underwaterNode.value = underwaterMix;
      sky.position.copy(camera.position);
      sky.rotation.y = time * 0.00012;
      clouds.position.copy(camera.position);
      clouds.rotation.y = time * 0.00016;
      clouds.material.opacity = 0.78 * surfaceVisibility;
      sun.position.copy(camera.position).addScaledVector(sunDirection, SUN_DISTANCE);
      sunMaterial.opacity = 0.82 * surfaceVisibility;
    },
  };
}
