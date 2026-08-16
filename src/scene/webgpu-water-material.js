import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn,
  abs,
  cameraPosition,
  clamp,
  dot,
  exp,
  float,
  max,
  min,
  mix,
  normalize,
  positionWorld,
  pow,
  reflect,
  refract,
  reflector,
  screenUV,
  sin,
  smoothstep,
  uniform,
  varyingProperty,
  vec2,
  vec3,
  viewportSafeUV,
  viewportSharedTexture,
} from 'three/tsl';
import { OCEAN_WAVES } from './waves.js';
import {
  fbmNode,
  microGradientNode,
  valueNoiseNode,
} from './webgpu-water-functions.js';
import { createWebGpuWavePositionNode } from './webgpu-wave-nodes.js';

const dominantWave = OCEAN_WAVES[0];

export function createWebGpuWaterMaterial({
  mesh,
  timeNode,
  underwaterNode,
  noiseMap,
  sunDirection,
  reflectionScale,
}) {
  const material = new MeshBasicNodeMaterial();
  material.name = 'WebGPU shallow ocean';
  material.transparent = false;
  material.depthWrite = true;
  material.side = THREE.DoubleSide;
  material.forceSinglePass = true;

  const waveNormal = varyingProperty('vec3', 'webgpuWaveNormal');
  const surfacePosition = varyingProperty('vec2', 'webgpuSurfacePosition');
  const waveHeight = varyingProperty('float', 'webgpuWaveHeight');
  const waveSlope = varyingProperty('float', 'webgpuWaveSlope');
  material.positionNode = createWebGpuWavePositionNode(timeNode, 0, {
    normal: waveNormal,
    surfacePosition,
    waveHeight,
    waveSlope,
  });

  const reflectionSampler = reflector({ bounces: false, samples: 0 });
  reflectionSampler.reflector.resolutionScale = reflectionScale;
  // Geometry vertices are already rotated into XZ space, so the reflector
  // target itself must explicitly expose a +Y plane normal.
  reflectionSampler.target.rotation.x = -Math.PI / 2;
  mesh.add(reflectionSampler.target);

  material.colorNode = Fn(() => {
    const viewDirection = normalize(cameraPosition.sub(positionWorld));
    const distanceToCamera = cameraPosition.sub(positionWorld).length();
    const macroGradient = waveNormal.xz.negate().div(max(waveNormal.y, 0.24));
    const detailGradient = microGradientNode(
      surfacePosition,
      distanceToCamera,
      timeNode,
      noiseMap,
    );
    const combinedGradient = macroGradient.add(detailGradient);
    const surfaceUp = normalize(vec3(
      combinedGradient.x.negate(),
      1,
      combinedGradient.y.negate(),
    ));
    const interfaceNormal = normalize(mix(
      surfaceUp,
      surfaceUp.negate(),
      underwaterNode,
    ));
    const viewFacing = clamp(dot(interfaceNormal, viewDirection), 0, 1);
    const fresnel = float(0.025).add(
      pow(float(1).sub(viewFacing), 5).mul(0.975),
    );
    const nearField = float(1).sub(smoothstep(18, 115, distanceToCamera));

    const waterColumn = float(3.55).div(max(viewFacing, 0.28));
    const opticalDepth = clamp(
      float(1).sub(exp(waterColumn.mul(-0.052)))
        .add(smoothstep(100, 210, distanceToCamera).mul(0.12)),
      0,
      1,
    );
    const depthVariation = fbmNode(
      surfacePosition.mul(0.075)
        .add(vec2(timeNode.mul(0.012), timeNode.mul(-0.008))),
      noiseMap,
    );
    const secondaryVariation = fbmNode(
      surfacePosition.mul(0.17).add(vec2(-11, 7)),
      noiseMap,
    );
    const clearPatch = smoothstep(
      0.32,
      0.72,
      depthVariation.mul(0.72).add(secondaryVariation.mul(0.28)),
    );
    const shallowMix = clamp(
      float(1).sub(opticalDepth).mul(0.42)
        .add(clearPatch.mul(nearField).mul(0.20)),
      0,
      0.76,
    );
    const waterBody = mix(
      vec3(0.002, 0.023, 0.037),
      vec3(0.008, 0.45, 0.47),
      shallowMix,
    ).toVar();
    waterBody.mulAssign(mix(0.93, 1.03, secondaryVariation));

    const cloudUv = surfacePosition.mul(0.018)
      .add(vec2(timeNode.mul(0.0024), timeNode.mul(0.0010)));
    const cloudBroad = fbmNode(cloudUv, noiseMap).mul(0.77)
      .add(fbmNode(cloudUv.mul(2.17).sub(14.3), noiseMap).mul(0.23));
    const cloudEdge = fbmNode(cloudUv.mul(4.3).add(7.9), noiseMap);
    const cloudShadow = smoothstep(0.50, 0.66, cloudBroad)
      .mul(mix(0.64, 1, smoothstep(0.27, 0.68, cloudEdge)));
    waterBody.mulAssign(
      mix(1, 0.72, cloudShadow.mul(float(0.42).add(nearField.mul(0.30)))),
    );

    const facingLight = max(dot(surfaceUp, vec3(
      sunDirection.x,
      sunDirection.y,
      sunDirection.z,
    )), 0);
    waterBody.addAssign(
      vec3(0, 0.065, 0.075)
        .mul(pow(facingLight, 2))
        .mul(nearField),
    );

    const refractionUv = viewportSafeUV(
      screenUV.sub(combinedGradient.mul(mix(0.002, 0.006, viewFacing))),
    );
    const refractedScene = viewportSharedTexture(refractionUv).rgb;
    const transmissionTint = mix(
      vec3(0.58, 0.88, 0.82),
      vec3(0.20, 0.45, 0.52),
      opticalDepth,
    );
    const columnTransmittance = exp(waterColumn.mul(-0.045));
    const transmissionAmount = mix(0.40, 0.52, clearPatch)
      .mul(columnTransmittance)
      .mul(float(0.50).add(nearField.mul(0.50)));
    const sceneTransmission = mix(
      waterBody,
      refractedScene.mul(transmissionTint),
      clamp(transmissionAmount, 0, 0.66),
    );

    reflectionSampler.uvNode = reflectionSampler.uvNode.add(
      combinedGradient.mul(mix(0.003, 0.009, viewFacing)),
    );
    const reflectionDirection = reflect(viewDirection.negate(), interfaceNormal);
    const reflectedSky = mix(
      vec3(0.075, 0.23, 0.43),
      vec3(0.007, 0.045, 0.16),
      smoothstep(0, 0.82, max(reflectionDirection.y, 0)),
    );
    const reflectedCapture = clamp(
      reflectionSampler.rgb,
      vec3(0),
      vec3(1),
    );
    const reflectedScene = mix(reflectedSky, reflectedCapture, 0.48).toVar();
    const reflectionAzimuth = dot(
      normalize(reflectionDirection.xz.add(0.0001)),
      normalize(vec2(sunDirection.x, sunDirection.z)),
    ).mul(0.5).add(0.5);
    reflectedScene.mulAssign(mix(
      vec3(0.30, 0.50, 0.68),
      vec3(0.62, 0.76, 0.84),
      smoothstep(0.15, 0.85, reflectionAzimuth),
    ).mul(mix(0.74, 1, secondaryVariation)));
    reflectedScene.assign(mix(
      reflectedScene,
      vec3(0.002, 0.023, 0.037),
      0.08,
    ));
    const facetReflection = smoothstep(0.035, 0.16, detailGradient.length());
    const reflectionMix = clamp(
      float(0.085).add(fresnel.mul(0.89))
        .add(facetReflection.mul(nearField).mul(0.045)),
      0,
      0.97,
    );
    const surfaceColor = mix(
      sceneTransmission,
      reflectedScene,
      reflectionMix,
    ).toVar();
    surfaceColor.mulAssign(
      mix(1, 0.84, cloudShadow.mul(float(1).sub(fresnel)).mul(0.72)),
    );
    const localFacetLight = smoothstep(-0.06, 0.32, dot(surfaceUp, vec3(
      sunDirection.x,
      sunDirection.y,
      sunDirection.z,
    )));
    surfaceColor.mulAssign(mix(
      0.92,
      1.055,
      localFacetLight.mul(nearField),
    ));

    const distanceHue = smoothstep(24, 138, distanceToCamera);
    const nearGrade = surfaceColor.mul(vec3(0.74, 1.10, 1.06))
      .add(vec3(0, 0.032, 0.036).mul(nearField).mul(clearPatch));
    const farGrade = surfaceColor.mul(vec3(0.68, 0.84, 1.12));
    surfaceColor.assign(mix(nearGrade, farGrade, distanceHue));

    const lightDirection = vec3(sunDirection.x, sunDirection.y, sunDirection.z);
    const crestTransmission = smoothstep(
      0.12,
      0.72,
      waveHeight.add(min(waveSlope, 0.42).mul(0.24)),
    );
    const backLighting = pow(max(dot(viewDirection.negate(), lightDirection), 0), 2.4);
    const crestRim = pow(float(1).sub(viewFacing), 1.35);
    surfaceColor.addAssign(
      vec3(0.008, 0.20, 0.19)
        .mul(crestTransmission)
        .mul(crestRim)
        .mul(float(0.24).add(backLighting.mul(0.76))),
    );

    const halfDirection = normalize(viewDirection.add(lightDirection));
    const normalDotHalf = max(dot(surfaceUp, halfDirection), 0);
    const normalDotLight = max(dot(surfaceUp, lightDirection), 0);
    const glitterPosition = surfacePosition
      .sub(vec2(dominantWave.direction.x, dominantWave.direction.y)
        .mul(timeNode.mul(0.31)))
      .add(combinedGradient.mul(0.16));
    const glitterNoise = fbmNode(
      vec2(glitterPosition.x.mul(1.8), glitterPosition.y.mul(3.9))
        .add(vec2(7.3, -4.8)),
      noiseMap,
    );
    const glitterMask = smoothstep(0.51, 0.72, glitterNoise);
    const broadGlitter = pow(normalDotHalf, 34).mul(0.34);
    const sharpGlitter = pow(normalDotHalf, 145)
      .mul(glitterMask)
      .mul(1.35);
    surfaceColor.addAssign(
      vec3(1.0, 0.84, 0.61)
        .mul(broadGlitter.add(sharpGlitter))
        .mul(normalDotLight),
    );

    const windDirection = vec2(
      dominantWave.direction.x,
      dominantWave.direction.y,
    );
    const crestDirection = vec2(-dominantWave.direction.y, dominantWave.direction.x);
    const advectedFoam = surfacePosition
      .sub(windDirection.mul(timeNode.mul(dominantWave.speed)))
      .sub(crestDirection.mul(timeNode.mul(0.026)));
    const foamAlong = dot(advectedFoam, windDirection);
    const foamAcross = dot(advectedFoam, crestDirection);
    const breakingZoneField = float(0.50)
      .add(sin(foamAlong.mul(0.024).add(foamAcross.mul(0.010)).add(4.3)).mul(0.24))
      .add(sin(foamAlong.mul(0.047).sub(foamAcross.mul(0.017)).sub(11.6)).mul(0.15))
      .add(sin(foamAlong.mul(0.013).add(foamAcross.mul(0.029)).add(17.2)).mul(0.11));
    const breakingZone = smoothstep(0.36, 0.64, breakingZoneField);
    const foamUv = vec2(foamAlong.mul(1.55), foamAcross.mul(0.72));
    const foamContour = fbmNode(foamUv.mul(2.15).add(vec2(3.4, -6.2)), noiseMap);
    const filaments = float(1).sub(smoothstep(
      0.018,
      0.064,
      abs(foamContour.sub(0.565)),
    ));
    const tornMask = smoothstep(
      0.37,
      0.62,
      fbmNode(vec2(
        foamUv.x.mul(0.73).sub(foamUv.y.mul(0.68)),
        foamUv.x.mul(0.68).add(foamUv.y.mul(0.73)),
      ).mul(4.15).add(vec2(-7.6, 2.8)), noiseMap),
    );
    const foamMicro = valueNoiseNode(foamUv.mul(13.8).add(vec2(19.4, -11.7)), noiseMap);
    const porousRibbon = max(
      filaments.mul(tornMask).mul(smoothstep(0.32, 0.58, foamMicro)),
      smoothstep(0.78, 0.91, foamMicro).mul(0.16),
    );
    const foamThreshold = mix(
      0.075,
      0.170,
      valueNoiseNode(advectedFoam.mul(0.21).add(vec2(8.7, -4.1)), noiseMap),
    );
    const crestSignal = waveHeight.add(min(waveSlope, 0.34).mul(0.18));
    const breakingEnergy = smoothstep(
      foamThreshold.sub(0.15),
      foamThreshold.add(0.21),
      crestSignal,
    );
    const foam = breakingEnergy.mul(mix(breakingEnergy, 1, 0.22))
      .mul(mix(0.22, 1.35, breakingZone))
      .mul(porousRibbon)
      .mul(float(1).sub(smoothstep(105, 220, distanceToCamera).mul(0.36)));
    surfaceColor.assign(mix(
      surfaceColor,
      vec3(0.76, 0.87, 0.85),
      foam.mul(mix(0.34, 0.60, viewFacing)),
    ));

    const horizonFade = smoothstep(105, 205, distanceToCamera);
    const horizonAbsorption = mix(0.78, 0.52, smoothstep(0.15, 0.85, reflectionAzimuth));
    surfaceColor.assign(mix(
      surfaceColor,
      vec3(0.043, 0.204, 0.298),
      horizonFade.mul(horizonAbsorption),
    ));

    const ceilingTexture = smoothstep(
      0.42,
      0.83,
      fbmNode(
        surfacePosition.mul(0.46)
          .add(vec2(timeNode.mul(0.045), timeNode.mul(-0.032))),
        noiseMap,
      ),
    );
    const underwaterColor = mix(
      vec3(0.0015, 0.035, 0.060),
      vec3(0.008, 0.22, 0.27),
      viewFacing.mul(0.72).add(0.22),
    ).add(vec3(0.025, 0.16, 0.17).mul(ceilingTexture).mul(viewFacing)).toVar();
    const transmissionDirection = refract(
      viewDirection.negate(),
      interfaceNormal,
      1.333,
    );
    const transmissionAvailable = smoothstep(
      0.001,
      0.08,
      transmissionDirection.length(),
    );
    const transmissionSky = mix(
      vec3(0.075, 0.23, 0.43),
      vec3(0.007, 0.045, 0.16),
      smoothstep(0, 0.82, max(transmissionDirection.y, 0)),
    );
    underwaterColor.assign(mix(
      underwaterColor,
      transmissionSky.mul(vec3(0.42, 0.78, 0.75)),
      transmissionAvailable.mul(viewFacing).mul(0.48),
    ));
    const underwaterFog = float(1).sub(exp(distanceToCamera.mul(-0.034)));
    underwaterColor.assign(mix(
      underwaterColor,
      vec3(0.0015, 0.035, 0.060),
      underwaterFog.mul(0.70),
    ));
    return mix(surfaceColor, underwaterColor, underwaterNode);
  })();

  return { material, reflectionSampler };
}
