import * as THREE from 'three';

export const NOISE_TEXTURE_SIZE = 512;

function nextRandom(state) {
  let value = state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

export function createNoiseTexture() {
  const texelCount = NOISE_TEXTURE_SIZE * NOISE_TEXTURE_SIZE;
  const data = new Uint8Array(texelCount * 4);
  let state = 0x9e3779b9;

  for (let index = 0; index < texelCount; index += 1) {
    state = nextRandom(state);
    const offset = index * 4;
    data[offset] = state & 0xff;
    data[offset + 1] = (state >>> 8) & 0xff;
    data[offset + 2] = (state >>> 16) & 0xff;
    data[offset + 3] = 255;
  }

  const texture = new THREE.DataTexture(
    data,
    NOISE_TEXTURE_SIZE,
    NOISE_TEXTURE_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = 'Ocean deterministic noise';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
