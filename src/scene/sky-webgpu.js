import * as THREE from 'three';

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

  let state = 0x7ca21d43;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  // Draw wrap-safe, layered cloud banks. Keeping the pattern in a texture
  // removes five octaves of per-pixel sky noise from every reflection pass.
  context.save();
  context.filter = 'blur(10px)';
  for (let cluster = 0; cluster < 18; cluster += 1) {
    const centerX = random() * width;
    const centerY = height * (0.10 + random() * 0.31);
    const clusterWidth = 58 + random() * 120;
    const clusterHeight = 14 + random() * 30;
    const horizontalCopies = [centerX - width, centerX, centerX + width];
    // CanvasTexture's vertical upload convention differs between the WebGPU
    // and WebGL backends. Mirroring clouds around the equator keeps the upper
    // skydome populated on both without a runtime texture mutation.
    for (const copyY of [centerY, height - centerY]) {
      for (const copyX of horizontalCopies) {
        context.fillStyle = `rgba(36,62,84,${0.24 + random() * 0.12})`;
        context.beginPath();
        context.ellipse(copyX, copyY + clusterHeight * 0.30, clusterWidth, clusterHeight, 0, 0, Math.PI * 2);
        context.fill();
        for (let puff = 0; puff < 6; puff += 1) {
          const x = copyX + (random() - 0.5) * clusterWidth * 1.25;
          const y = copyY + (random() - 0.58) * clusterHeight;
          const radiusX = clusterWidth * (0.18 + random() * 0.23);
          const radiusY = clusterHeight * (0.36 + random() * 0.42);
          context.fillStyle = `rgba(229,238,242,${0.54 + random() * 0.25})`;
          context.beginPath();
          context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
  }
  context.restore();

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
  context.filter = 'blur(7px)';

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

  drawPuff(256, 171, 205, 46, 'rgba(68,91,108,0.48)');
  const puffs = [
    [75, 148, 68, 48], [138, 121, 83, 66], [211, 130, 92, 76],
    [282, 99, 108, 88], [359, 124, 94, 71], [432, 151, 72, 50],
    [252, 160, 130, 60],
  ];
  for (const [x, y, radiusX, radiusY] of puffs) {
    drawPuff(x, y, radiusX, radiusY, 'rgba(231,239,243,0.82)');
  }

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
    const halfWidth = 30 + random() * 32;
    const halfHeight = 11 + random() * 11;
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
  const skyMaterial = new THREE.MeshBasicMaterial({
    map: createSkyTexture(),
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(390, 48, 24),
    skyMaterial,
  );
  sky.name = 'WebGPU atmospheric sky';
  sky.renderOrder = -10;
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
      const surfaceVisibility = 1 - THREE.MathUtils.smoothstep(underwaterMix, 0.55, 0.98);
      visibility.value = surfaceVisibility;
      sky.visible = underwaterMix < 0.985;
      sky.position.copy(camera.position);
      sky.rotation.y = time * 0.00012;
      clouds.position.copy(camera.position);
      clouds.rotation.y = time * 0.00016;
      clouds.material.opacity = 0.78 * surfaceVisibility;
      clouds.visible = surfaceVisibility > 0.015;
      sun.position.copy(camera.position).addScaledVector(sunDirection, SUN_DISTANCE);
      sunMaterial.opacity = 0.82 * surfaceVisibility;
      sun.visible = surfaceVisibility > 0.015;
    },
  };
}
