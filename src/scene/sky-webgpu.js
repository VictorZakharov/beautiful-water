import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn,
  If,
  cameraPosition,
  clamp,
  dot,
  mix,
  normalize,
  positionWorld,
  smoothstep,
  texture,
  uniform,
  vec3,
} from 'three/tsl';

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
  const width = 768;
  const height = 384;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = width;
  textureCanvas.height = height;
  const context = textureCanvas.getContext('2d');
  const image = context.createImageData(width, height);

  const smootherStep = (value) => value * value * (3 - 2 * value);
  const smoothStep = (edge0, edge1, value) => {
    const normalized = Math.min(Math.max(
      (value - edge0) / (edge1 - edge0),
      0,
    ), 1);
    return smootherStep(normalized);
  };
  const fract = (value) => value - Math.floor(value);
  const hash = (x, y) => {
    let px = fract(x * 123.34);
    let py = fract(y * 456.21);
    const offset = px * (px + 45.32) + py * (py + 45.32);
    px += offset;
    py += offset;
    return fract(px * py);
  };
  const valueNoise = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const blendX = smootherStep(fract(x));
    const blendY = smootherStep(fract(y));
    const lower = THREE.MathUtils.lerp(
      hash(x0, y0),
      hash(x0 + 1, y0),
      blendX,
    );
    const upper = THREE.MathUtils.lerp(
      hash(x0, y0 + 1),
      hash(x0 + 1, y0 + 1),
      blendX,
    );
    return THREE.MathUtils.lerp(lower, upper, blendY);
  };
  const directionalFbm = (
    x, y, z,
    weightX, weightY, weightZ, weightTotal,
    scale, offsetX, offsetY, offsetZ,
  ) => {
    let px = x * scale + offsetX;
    let py = y * scale + offsetY;
    let pz = z * scale + offsetZ;
    let value = 0;
    let amplitude = 0.5;
    for (let octave = 0; octave < 5; octave += 1) {
      value += (
        valueNoise(py + 13.7, pz - 4.1) * weightX
        + valueNoise(px - 8.3, pz + 17.2) * weightY
        + valueNoise(px + 5.9, py + 11.4) * weightZ
      ) / weightTotal * amplitude;
      px = px * 2.03 + 7.1;
      py = py * 2.03 - 9.4;
      pz = pz * 2.03 + 13.6;
      amplitude *= 0.5;
    }
    return value;
  };
  const azimuthCos = new Float32Array(width);
  const azimuthSin = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    const azimuth = (x / (width - 1)) * Math.PI * 2;
    azimuthCos[x] = Math.cos(azimuth);
    azimuthSin[x] = Math.sin(azimuth);
  }

  // Bake a wrap-safe, multi-scale cloud field once. This mirrors the broad
  // field plus erosion used by the WebGL sky without paying for procedural
  // noise in every sky fragment and reflection pass.
  for (let y = 0; y < height; y += 1) {
    const canvasV = 1 - y / (height - 1);
    // Canvas uploads use opposite vertical conventions on the native WebGPU
    // and node-WebGL backends. Mirror the field around the equator so either
    // backend samples clouds on the visible upper skydome.
    const v = 0.5 + Math.abs(canvasV - 0.5);
    const elevation = (v - 0.5) * Math.PI;
    const directionY = Math.sin(elevation);
    const horizontal = Math.cos(elevation);
    const altitudeFade = smoothStep(0.018, 0.12, directionY)
      * (1 - smoothStep(0.84, 0.99, directionY));
    if (altitudeFade <= 0) continue;

    for (let x = 0; x < width; x += 1) {
      const directionX = azimuthCos[x] * horizontal;
      const directionZ = azimuthSin[x] * horizontal;
      const directionX2 = directionX * directionX;
      const directionY2 = directionY * directionY;
      const directionZ2 = directionZ * directionZ;
      const weightX = directionX2 * directionX2;
      const weightY = directionY2 * directionY2;
      const weightZ = directionZ2 * directionZ2;
      const weightTotal = Math.max(weightX + weightY + weightZ, 0.0001);
      const broad = directionalFbm(
        directionX, directionY, directionZ,
        weightX, weightY, weightZ, weightTotal,
        3.4, 0, 0, 0,
      ) * 0.78
        + directionalFbm(
          directionX, directionY, directionZ,
          weightX, weightY, weightZ, weightTotal,
          7.3, -8.7, 4.1, 12.8,
        ) * 0.22;
      const erosion = directionalFbm(
        directionX, directionY, directionZ,
        weightX, weightY, weightZ, weightTotal,
        12.6, 19.2, -6.4, 3.7,
      );
      // Offset the baked threshold slightly to compensate for bilinear
      // texture sampling, retaining the fuller, resolved banks of the live
      // WebGL shader instead of shrinking them into isolated wisps.
      const body = smoothStep(0.480, 0.610, broad);
      const edgeDetail = THREE.MathUtils.lerp(
        0.52,
        1,
        smoothStep(0.30, 0.67, erosion),
      );
      const alpha = Math.min(body * edgeDetail * altitudeFade * 0.84, 1);
      const offset = (y * width + x) * 4;
      image.data[offset] = Math.round(Math.min(erosion, 1) * 255);
      image.data[offset + 1] = 255;
      image.data[offset + 2] = 255;
      image.data[offset + 3] = Math.round(alpha * 255);
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.name = 'WebGPU procedural cloud field';
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function createWebGpuSky(scene, sunDirection) {
  const underwaterNode = uniform(0);
  const skyTexture = createSkyTexture();
  const cloudTexture = createCloudTexture();
  const skyMaterial = new MeshBasicNodeMaterial({
    side: THREE.FrontSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
  skyMaterial.colorNode = Fn(() => {
    const underwaterColor = vec3(0.0018, 0.045, 0.065);
    const outputColor = underwaterColor.toVar();
    If(underwaterNode.lessThan(0.98), () => {
      const direction = normalize(positionWorld.sub(cameraPosition));
      const cloudLight = clamp(
        dot(direction, vec3(
          sunDirection.x,
          sunDirection.y,
          sunDirection.z,
        )).mul(0.90).add(direction.y.mul(0.55)).add(0.42),
        0,
        1,
      );
      const cloudSample = texture(cloudTexture);
      const cloudColor = mix(
        vec3(0.14, 0.22, 0.30),
        vec3(1.0, 1.0, 1.0),
        cloudLight,
      );
      const surfaceColor = mix(
        texture(skyTexture).rgb,
        cloudColor,
        cloudSample.a,
      );
      outputColor.assign(mix(
        surfaceColor,
        underwaterColor,
        smoothstep(0.02, 0.98, underwaterNode),
      ));
    });
    return outputColor;
  })();
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
      sky.rotation.y = time * -0.0013;
      sun.position.copy(camera.position).addScaledVector(sunDirection, SUN_DISTANCE);
      sunMaterial.opacity = 0.82 * surfaceVisibility;
    },
  };
}
