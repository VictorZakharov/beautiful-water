import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn,
  atan,
  clamp,
  cos,
  float,
  mix,
  pow,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { createNoiseTexture } from './noise-texture.js';
import { valueNoiseNode } from './webgpu-water-functions.js';

function turn(position) {
  return vec2(
    position.x.mul(0.80).sub(position.y.mul(0.60)),
    position.x.mul(0.60).add(position.y.mul(0.80)),
  ).mul(2.03).add(vec2(7.1));
}

function rayFbm(position, noiseMap) {
  let samplePosition = position;
  let value = valueNoiseNode(samplePosition, noiseMap).mul(0.5);
  samplePosition = turn(samplePosition);
  value = value.add(valueNoiseNode(samplePosition, noiseMap).mul(0.25));
  samplePosition = turn(samplePosition);
  value = value.add(valueNoiseNode(samplePosition, noiseMap).mul(0.125));
  samplePosition = turn(samplePosition);
  return value.add(valueNoiseNode(samplePosition, noiseMap).mul(0.0625));
}

export function createWebGpuUnderwaterRays(sunDirection) {
  const timeNode = uniform(0);
  const strengthNode = uniform(0);
  const sunPositionNode = uniform(new THREE.Vector2(0.5, 1.2));
  const aspectNode = uniform(1);
  const noiseMap = createNoiseTexture();

  const rayOutput = Fn(() => {
    const delta = uv().sub(sunPositionNode);
    const aspectDelta = vec2(delta.x.mul(aspectNode), delta.y);
    const radius = aspectDelta.length();
    const angle = atan(aspectDelta.y, aspectDelta.x);
    const warp = rayFbm(
      vec2(
        angle.mul(6.5),
        radius.mul(1.8).sub(timeNode.mul(0.012)),
      ),
      noiseMap,
    );
    const finePhase = angle.mul(57).add(warp.mul(6.2));
    const broadPhase = angle.mul(23).sub(warp.mul(3.4));
    const fineRays = pow(float(0.5).add(cos(finePhase).mul(0.5)), 10);
    const broadRays = pow(float(0.5).add(cos(broadPhase).mul(0.5)), 7);
    const rayDensity = fineRays.mul(0.62).add(broadRays.mul(0.38));
    const radialEnvelope = float(1).sub(smoothstep(0.06, 1.75, radius));
    const originFade = smoothstep(0.035, 0.16, radius);
    const breakup = float(0.42).add(
      rayFbm(
        vec2(
          angle.mul(3.1),
          radius.mul(4.2).add(timeNode.mul(0.009)),
        ),
        noiseMap,
      ).mul(0.58),
    );
    const alpha = clamp(
      rayDensity
        .mul(radialEnvelope)
        .mul(originFade)
        .mul(breakup)
        .mul(strengthNode)
        .mul(0.095),
      0,
      0.15,
    );
    const color = mix(
      vec3(0.035, 0.24, 0.25),
      vec3(0.10, 0.47, 0.45),
      rayDensity,
    );
    return vec4(color, alpha);
  })();

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.NormalBlending,
  });
  material.name = 'WebGPU underwater sun rays';
  material.colorNode = rayOutput.rgb;
  material.opacityNode = rayOutput.a;

  const overlayScene = new THREE.Scene();
  const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  overlayScene.add(quad);

  const eta = 1 / 1.333;
  const horizontal = new THREE.Vector2(sunDirection.x, sunDirection.z).multiplyScalar(eta);
  const refractedSun = new THREE.Vector3(
    horizontal.x,
    Math.sqrt(Math.max(1 - horizontal.lengthSq(), 0.001)),
    horizontal.y,
  ).normalize();
  const sunPoint = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  let strength = 0;

  return {
    resize(width, height) {
      aspectNode.value = width / Math.max(height, 1);
    },
    update(time, underwaterMix, camera) {
      camera.getWorldDirection(cameraForward);
      const facingSun = THREE.MathUtils.smoothstep(
        cameraForward.dot(refractedSun),
        -0.08,
        0.55,
      );
      sunPoint.copy(camera.position).addScaledVector(refractedSun, 60).project(camera);
      sunPositionNode.value.set(
        sunPoint.x * 0.5 + 0.5,
        sunPoint.y * 0.5 + 0.5,
      );
      timeNode.value = time;
      strength = underwaterMix * facingSun;
      strengthNode.value = strength;
    },
    render(renderer) {
      if (strength < 0.002) return;
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(overlayScene, overlayCamera);
      renderer.autoClear = autoClear;
    },
  };
}
