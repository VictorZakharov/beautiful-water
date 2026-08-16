import {
  cos,
  dFdx,
  dFdy,
  dot,
  float,
  floor,
  fract,
  max,
  smoothstep,
  texture,
  vec2,
} from 'three/tsl';
import { NOISE_TEXTURE_SIZE } from './noise-texture.js';

function turn(position, scale = 2.04, offset = 9.2) {
  return vec2(
    position.x.mul(0.80).sub(position.y.mul(0.60)),
    position.x.mul(0.60).add(position.y.mul(0.80)),
  ).mul(scale).add(vec2(offset));
}

export function valueNoiseNode(position, noiseMap) {
  const lattice = floor(position);
  const fractional = fract(position);
  const smoothFraction = fractional.mul(fractional)
    .mul(float(3).sub(fractional.mul(2)));
  const noiseUv = lattice.add(smoothFraction).add(0.5)
    .div(NOISE_TEXTURE_SIZE);
  return texture(noiseMap, noiseUv).r;
}

export function fbmNode(position, noiseMap) {
  let samplePosition = position;
  let value = valueNoiseNode(samplePosition, noiseMap).mul(0.5);
  samplePosition = turn(samplePosition);
  value = value.add(valueNoiseNode(samplePosition, noiseMap).mul(0.25));
  samplePosition = turn(samplePosition);
  value = value.add(valueNoiseNode(samplePosition, noiseMap).mul(0.125));
  samplePosition = turn(samplePosition);
  return value.add(valueNoiseNode(samplePosition, noiseMap).mul(0.0625));
}

function rippleGradient(position, direction, frequency, amplitude, speed, timeNode) {
  const phase = dot(position, vec2(direction[0], direction[1]))
    .mul(frequency)
    .add(timeNode.mul(speed));
  return vec2(direction[0], direction[1])
    .mul(amplitude * frequency)
    .mul(cos(phase));
}

export function microGradientNode(
  surfacePosition,
  distanceToCamera,
  timeNode,
  noiseMap,
) {
  const warp = vec2(
    fbmNode(
      surfacePosition.mul(0.16)
        .add(vec2(timeNode.mul(0.018), timeNode.mul(-0.011))),
      noiseMap,
    ),
    fbmNode(
      surfacePosition.mul(0.16)
        .add(vec2(17.4, -9.2))
        .add(vec2(timeNode.mul(-0.013), timeNode.mul(0.016))),
      noiseMap,
    ),
  ).sub(0.5);
  const position = surfacePosition.add(warp.mul(1.55));
  const coarse = rippleGradient(position, [0.86, 0.51], 1.15, 0.0240, -0.78, timeNode)
    .add(rippleGradient(position, [-0.52, 0.85], 1.78, 0.0155, 1.02, timeNode));
  const medium = rippleGradient(position, [0.97, -0.24], 2.75, 0.0095, -1.46, timeNode)
    .add(rippleGradient(position, [-0.31, 0.95], 4.65, 0.0053, 1.88, timeNode));
  const fine = rippleGradient(position, [0.18, -0.98], 7.9, 0.00225, -2.43, timeNode)
    .add(rippleGradient(position, [0.68, 0.73], 13.2, 0.00082, 3.10, timeNode));
  const coarseFade = float(1).sub(smoothstep(120, 285, distanceToCamera));
  const mediumFade = float(1).sub(smoothstep(55, 175, distanceToCamera));
  const fineDistanceFade = float(1).sub(smoothstep(20, 92, distanceToCamera));
  const footprint = max(dFdx(position).length(), dFdy(position).length());
  const fineFootprintFade = float(1).sub(smoothstep(0.025, 0.19, footprint));
  return coarse.mul(coarseFade)
    .add(medium.mul(mediumFade))
    .add(fine.mul(fineDistanceFade).mul(fineFootprintFade));
}
