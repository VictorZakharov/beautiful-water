import {
  cos,
  dFdx,
  dFdy,
  dot,
  float,
  floor,
  fract,
  max,
  pow,
  sqrt,
  smoothstep,
  texture,
  vec2,
} from 'three/tsl';
import { NOISE_TEXTURE_SIZE } from './noise-texture.js';

function turn(position, scale = 2.04, offset = 9.2) {
  // GLSL's mat2 constructor is column-major. Keep this orientation identical
  // to mat2(0.80, -0.60, 0.60, 0.80) * position in the WebGL shader.
  return vec2(
    position.x.mul(0.80).add(position.y.mul(0.60)),
    position.x.mul(-0.60).add(position.y.mul(0.80)),
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

export function distributionGgxNode(alpha, normalDotHalf) {
  const alphaSquared = alpha.mul(alpha);
  const denominator = normalDotHalf.mul(normalDotHalf)
    .mul(alphaSquared.sub(1))
    .add(1);
  return alphaSquared.div(max(
    denominator.mul(denominator).mul(Math.PI),
    0.00001,
  ));
}

export function visibilitySmithGgxCorrelatedNode(
  alpha,
  normalDotView,
  normalDotLight,
) {
  const alphaSquared = alpha.mul(alpha);
  const oneMinusAlphaSquared = float(1).sub(alphaSquared);
  const viewTerm = normalDotLight.mul(sqrt(
    alphaSquared.add(
      oneMinusAlphaSquared.mul(normalDotView).mul(normalDotView),
    ),
  ));
  const lightTerm = normalDotView.mul(sqrt(
    alphaSquared.add(
      oneMinusAlphaSquared.mul(normalDotLight).mul(normalDotLight),
    ),
  ));
  return float(0.5).div(max(viewTerm.add(lightTerm), 0.00001));
}

export function fresnelSchlickNode(viewDotHalf) {
  const waterF0 = 0.02037;
  return float(waterF0).add(
    pow(float(1).sub(viewDotHalf), 5).mul(1 - waterF0),
  );
}

function rippleGradient(position, direction, frequency, amplitude, speed, timeNode) {
  const phase = dot(position, vec2(direction[0], direction[1]))
    .mul(frequency)
    .add(timeNode.mul(speed));
  return vec2(direction[0], direction[1])
    .mul(amplitude * frequency)
    .mul(cos(phase));
}

function microHeightNode(position, timeNode, noiseMap) {
  const turned = vec2(
    position.x.mul(0.78).add(position.y.mul(0.63)),
    position.x.mul(-0.63).add(position.y.mul(0.78)),
  );
  const counterTurned = vec2(
    position.x.mul(0.58).sub(position.y.mul(0.81)),
    position.x.mul(0.81).add(position.y.mul(0.58)),
  );
  const drift = vec2(timeNode.mul(0.068), timeNode.mul(-0.047));
  const broad = valueNoiseNode(position.mul(1.65).add(drift), noiseMap);
  const middle = valueNoiseNode(
    turned.mul(3.7).sub(drift.mul(1.37)).add(vec2(13.7)),
    noiseMap,
  );
  const detail = valueNoiseNode(
    turned.mul(7.9).add(drift.mul(1.74)).sub(vec2(8.4)),
    noiseMap,
  );
  const fine = valueNoiseNode(
    counterTurned.mul(15.8).sub(drift.mul(2.1)).add(vec2(31.6)),
    noiseMap,
  );
  const sparkle = valueNoiseNode(
    turned.mul(31).add(drift.mul(2.8)).sub(vec2(21.9)),
    noiseMap,
  );
  return broad.mul(0.030)
    .add(middle.mul(0.015))
    .add(detail.mul(0.0065))
    .add(fine.mul(0.0026))
    .add(sparkle.mul(0.0009));
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
  // Recover the world-space height gradient from screen-space derivatives.
  // This evaluates the five-sample micro height once instead of four times
  // for central differences, removing 15 texture reads per water fragment.
  const positionDx = dFdx(position);
  const positionDy = dFdy(position);
  const microHeight = microHeightNode(position, timeNode, noiseMap);
  const heightDx = dFdx(microHeight);
  const heightDy = dFdy(microHeight);
  const determinant = positionDx.x.mul(positionDy.y)
    .sub(positionDx.y.mul(positionDy.x));
  const inverseDeterminant = determinant.div(max(
    determinant.mul(determinant),
    0.00000001,
  ));
  const noiseGradient = vec2(
    heightDx.mul(positionDy.y).sub(positionDx.y.mul(heightDy)),
    positionDx.x.mul(heightDy).sub(heightDx.mul(positionDy.x)),
  ).mul(inverseDeterminant);
  return coarse.mul(coarseFade)
    .add(medium.mul(mediumFade))
    .add(fine.mul(fineDistanceFade).mul(fineFootprintFade))
    .add(noiseGradient.mul(mediumFade).mul(fineFootprintFade));
}
