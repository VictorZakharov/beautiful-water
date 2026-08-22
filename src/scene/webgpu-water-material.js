import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  cameraPosition,
  clamp,
  dFdx,
  dFdy,
  dot,
  exp,
  float,
  fwidth,
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
  distributionGgxNode,
  fbmNode,
  fresnelSchlickNode,
  microGradientNode,
  valueNoiseNode,
  visibilitySmithGgxCorrelatedNode,
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
    // An interpolated normal and its exact opposite collapse to zero at a
    // 50% medium blend. Keep stable normals for both sides of the interface
    // and blend the shaded colors instead.
    const undersideNormal = surfaceUp.negate();
    const viewFacing = clamp(abs(dot(surfaceUp, viewDirection)), 0, 1);
    const fresnel = float(0.025).add(
      pow(float(1).sub(viewFacing), 5).mul(0.975),
    );
    const nearField = float(1).sub(smoothstep(18, 115, distanceToCamera));

    // The medium blend eases for several frames when crossing the waterline.
    // Shade both sides only during that transition; settled frames otherwise
    // spent most of their fragment work on a color that was blended away.
    const surfaceOutput = vec3(0).toVar();
    If(underwaterNode.lessThan(0.98), () => {
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
    const reflectionDirection = reflect(viewDirection.negate(), surfaceUp);
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

    // Match the WebGL sun path exactly. A derivative-widened GGX lobe keeps
    // reflected energy visible as individual wave facets become sub-pixel.
    const halfDirection = normalize(viewDirection.add(lightDirection));
    const normalDotView = max(dot(surfaceUp, viewDirection), 0.001);
    const normalDotLight = max(dot(surfaceUp, lightDirection), 0.001);
    const normalDotHalf = max(dot(surfaceUp, halfDirection), 0);
    const viewDotHalf = max(dot(viewDirection, halfDirection), 0);
    const normalDx = dFdx(surfaceUp);
    const normalDy = dFdy(surfaceUp);
    const normalVariance = max(
      dot(normalDx, normalDx),
      dot(normalDy, normalDy),
    );
    const baseRoughness = mix(
      0.040,
      0.105,
      smoothstep(22, 155, distanceToCamera),
    );
    const microfacetAlpha = clamp(
      baseRoughness.mul(baseRoughness)
        .add(min(normalVariance.mul(0.32), 0.055)),
      0.0012,
      0.052,
    );
    const sunFresnel = fresnelSchlickNode(viewDotHalf);
    const distribution = distributionGgxNode(microfacetAlpha, normalDotHalf);
    const visibility = visibilitySmithGgxCorrelatedNode(
      microfacetAlpha,
      normalDotView,
      normalDotLight,
    );
    const rawSunSpecular = distribution
      .mul(visibility)
      .mul(sunFresnel)
      .mul(normalDotLight);
    const sunSpecular = pow(
      rawSunSpecular.div(float(1).add(rawSunSpecular)),
      1.22,
    );

    // The broad lobe locates a continuous reflection path; the advected
    // multi-scale mask resolves it into wind-oriented sparkles.
    const grazingAmount = float(1).sub(smoothstep(
      1.20,
      3.00,
      max(cameraPosition.y, 0),
    ));
    const broadAlpha = clamp(
      microfacetAlpha.mul(mix(2.7, 3.70, grazingAmount))
        .add(mix(0.010, 0.016, grazingAmount)),
      0.014,
      mix(0.088, 0.122, grazingAmount),
    );
    const broadDistribution = distributionGgxNode(broadAlpha, normalDotHalf);
    const broadVisibility = visibilitySmithGgxCorrelatedNode(
      broadAlpha,
      normalDotView,
      normalDotLight,
    );
    const rawBroadSpecular = broadDistribution
      .mul(broadVisibility)
      .mul(sunFresnel)
      .mul(normalDotLight);
    const broadSpecular = rawBroadSpecular.div(
      float(1).add(rawBroadSpecular),
    );

    const glitterWind = vec2(
      dominantWave.direction.x,
      dominantWave.direction.y,
    );
    const glitterCross = vec2(-dominantWave.direction.y, dominantWave.direction.x);
    const glitterPosition = surfacePosition
      .sub(glitterWind.mul(timeNode.mul(0.31)))
      .add(glitterCross.mul(timeNode.mul(0.047)))
      .add(combinedGradient.mul(0.16));
    const glitterUv = vec2(
      dot(glitterPosition, glitterWind).mul(0.72),
      dot(glitterPosition, glitterCross).mul(1.58),
    );
    // GLSL matrices are column-major. This mirrors
    // mat2(0.61, -0.79, 0.79, 0.61) * glitterUv in the WebGL shader.
    const turnedGlitterUv = vec2(
      glitterUv.x.mul(0.61).add(glitterUv.y.mul(0.79)),
      glitterUv.x.mul(-0.79).add(glitterUv.y.mul(0.61)),
    );
    const glitterNoise = valueNoiseNode(
      glitterUv.mul(2.5).add(vec2(7.3, -4.8)),
      noiseMap,
    ).mul(0.26)
      .add(valueNoiseNode(
        turnedGlitterUv.mul(8.8).add(vec2(-13.2, 19.6)),
        noiseMap,
      ).mul(0.47))
      .add(valueNoiseNode(
        turnedGlitterUv.mul(21.5).add(vec2(31.7, -9.1)),
        noiseMap,
      ).mul(0.27));
    const glitterAa = max(fwidth(glitterNoise).mul(1.45), 0.022);
    const resolvedOccupancy = smoothstep(
      float(0.50).sub(glitterAa),
      float(0.69).add(glitterAa),
      glitterNoise,
    );
    const glitterSparkles = smoothstep(
      float(0.67).sub(glitterAa),
      float(0.83).add(glitterAa),
      glitterNoise,
    );
    const resolvedGlitter = float(1).sub(
      smoothstep(62, 175, distanceToCamera),
    );
    const glitterOccupancy = mix(0.18, resolvedOccupancy, resolvedGlitter);
    const glitterEnergy = sunSpecular
      .mul(mix(0.04, 0.92, glitterOccupancy))
      .add(
        broadSpecular
          .mul(glitterOccupancy.mul(0.28).add(glitterSparkles.mul(0.72)))
          .mul(0.92),
      );
    // WebGL's MSAA retains more sub-pixel solar facets when the camera skims
    // the mean plane. Key this correction to camera height (not per-fragment
    // NdotV, which stays high on sun-facing facets) so medium/top-down views
    // use the unmodified shared BRDF.
    const grazingResolutionCompensation = mix(1, 4.20, grazingAmount);
    surfaceColor.addAssign(
      vec3(1.0, 0.84, 0.61)
        .mul(glitterEnergy)
        .mul(2.85)
        .mul(grazingResolutionCompensation),
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
    surfaceOutput.assign(surfaceColor);
    });

    const underwaterOutput = vec3(0).toVar();
    If(underwaterNode.greaterThan(0.02), () => {
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
      undersideNormal,
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
    underwaterOutput.assign(underwaterColor);
    });

    const mediumBlend = clamp(underwaterNode.sub(0.02).div(0.96), 0, 1);
    return mix(surfaceOutput, underwaterOutput, mediumBlend);
  })();

  return { material, reflectionSampler };
}
