import {
  Fn,
  cameraPosition,
  cos,
  dot,
  float,
  normalize,
  positionLocal,
  sin,
  smoothstep,
  vec2,
  vec3,
} from 'three/tsl';
import {
  OCEAN_DOMAIN_WARP,
  OCEAN_DOMAIN_VARIANTS,
  OCEAN_ENERGY_WAVES,
  OCEAN_WAVES,
} from './waves.js';

function sampleOceanDomain(basePosition, timeNode, variant) {
  const cosine = Math.cos(variant.rotation);
  const sine = Math.sin(variant.rotation);
  const warpedPosition = basePosition.toVar();
  const derivativeX = vec2(1, 0).toVar();
  const derivativeZ = vec2(0, 1).toVar();

  for (let index = 0; index < OCEAN_DOMAIN_WARP.length; index += 1) {
    const mode = OCEAN_DOMAIN_WARP[index];
    const displacementX = cosine * mode.displacement.x - sine * mode.displacement.y;
    const displacementY = sine * mode.displacement.x + cosine * mode.displacement.y;
    const displacement = vec2(displacementX, displacementY);
    const waveVector = vec2(mode.waveVector.x, mode.waveVector.y);
    const phase = dot(basePosition, waveVector)
      .sub(timeNode.mul(mode.speed))
      .add(mode.phase + variant.phaseBias * (0.73 + index * 0.58));
    const phaseCosine = cos(phase);
    warpedPosition.addAssign(displacement.mul(sin(phase)));
    derivativeX.addAssign(displacement.mul(phaseCosine).mul(waveVector.x));
    derivativeZ.addAssign(displacement.mul(phaseCosine).mul(waveVector.y));
  }

  const energy = float(0.82).toVar();
  const energyGradient = vec2(0).toVar();
  for (let index = 0; index < OCEAN_ENERGY_WAVES.length; index += 1) {
    const mode = OCEAN_ENERGY_WAVES[index];
    const waveVector = vec2(mode.waveVector.x, mode.waveVector.y);
    const phase = dot(basePosition, waveVector)
      .sub(timeNode.mul(mode.speed))
      .add(mode.phase + variant.phaseBias * (1.11 + index * 0.47));
    energy.addAssign(sin(phase).mul(mode.amplitude));
    energyGradient.addAssign(
      waveVector.mul(cos(phase)).mul(mode.amplitude),
    );
  }

  return {
    warpedPosition,
    derivativeX,
    derivativeZ,
    energy,
    energyGradient,
  };
}

export function createWebGpuWavePositionNode(
  timeNode,
  verticalOffset = 0,
  varyings = {},
) {
  return Fn(() => {
    const displaced = positionLocal.toVar();
    const basePosition = positionLocal.xz;
    const domains = OCEAN_DOMAIN_VARIANTS.map(
      (variant) => sampleOceanDomain(basePosition, timeNode, variant),
    );

    const cameraDistance = cameraPosition.sub(positionLocal).length();
    const gradient = vec2(0).toVar();
    for (let index = 0; index < OCEAN_WAVES.length; index += 1) {
      const wave = OCEAN_WAVES[index];
      const domain = domains[index % domains.length];
      const direction = vec2(wave.direction.x, wave.direction.y);
      const perpendicular = vec2(-wave.direction.y, wave.direction.x);
      const along = dot(direction, domain.warpedPosition);
      const across = dot(perpendicular, domain.warpedPosition);
      const alongGradient = vec2(
        dot(direction, domain.derivativeX),
        dot(direction, domain.derivativeZ),
      );
      const acrossGradient = vec2(
        dot(perpendicular, domain.derivativeX),
        dot(perpendicular, domain.derivativeZ),
      );
      const bendPhase = across.mul(wave.bendFrequency)
        .add(wave.phase * 1.71)
        .sub(timeNode.mul(0.055));
      const secondaryBendPhase = across.mul(wave.bendFrequency * 2.13)
        .sub(wave.phase * 0.73)
        .add(timeNode.mul(0.035));
      const bend = sin(bendPhase).add(sin(secondaryBendPhase).mul(0.27))
        .mul(wave.bendStrength);
      const packetPhase = along.mul(0.34).add(across)
        .mul(wave.packetFrequency)
        .add(wave.phase * 2.07);
      const secondaryPacketPhase = along.mul(-0.18).add(across.mul(1.83))
        .mul(wave.packetFrequency)
        .sub(wave.phase * 1.31);
      const packetEnvelope = float(1).add(
        sin(packetPhase).mul(0.68)
          .add(sin(secondaryPacketPhase).mul(0.32))
          .mul(wave.packetStrength),
      );
      const envelope = packetEnvelope.mul(domain.energy);
      const waveNumber = (Math.PI * 2) / wave.wavelength;
      const lod = float(1).sub(
        smoothstep(wave.lodStart, wave.lodEnd, cameraDistance),
      );
      const amplitude = lod.mul(wave.steepness / waveNumber);
      const phase = along.add(bend).sub(timeNode.mul(wave.speed))
        .mul(waveNumber)
        .add(wave.phase);
      const height = sin(phase).sub(
        cos(phase.mul(2)).mul(wave.crestSharpness),
      );
      const shapedDerivative = cos(phase).add(
        sin(phase.mul(2)).mul(wave.crestSharpness * 2),
      );
      const bendDerivative = cos(bendPhase).mul(wave.bendFrequency)
        .add(
          cos(secondaryBendPhase)
            .mul(wave.bendFrequency * 2.13 * 0.27),
        )
        .mul(wave.bendStrength);
      const phaseGradient = alongGradient.add(
        acrossGradient.mul(bendDerivative),
      ).mul(waveNumber);
      const packetGradient = alongGradient.mul(0.34).add(acrossGradient)
        .mul(cos(packetPhase).mul(0.68 * wave.packetFrequency))
        .add(
          alongGradient.mul(-0.18).add(acrossGradient.mul(1.83))
            .mul(
              cos(secondaryPacketPhase)
                .mul(0.32 * wave.packetFrequency),
            ),
        )
        .mul(wave.packetStrength);
      const envelopeGradient = packetGradient.mul(domain.energy)
        .add(domain.energyGradient.mul(packetEnvelope));

      displaced.xz.addAssign(
        direction.mul(amplitude).mul(envelope).mul(cos(phase)),
      );
      displaced.y.addAssign(amplitude.mul(envelope).mul(height));
      gradient.addAssign(
        envelopeGradient.mul(height)
          .add(phaseGradient.mul(envelope).mul(shapedDerivative))
          .mul(amplitude),
      );
    }

    varyings.normal?.assign(normalize(vec3(
      gradient.x.negate(),
      1,
      gradient.y.negate(),
    )));
    const averagedSurfacePosition = domains
      .slice(1)
      .reduce(
        (sum, domain) => sum.add(domain.warpedPosition),
        domains[0].warpedPosition,
      )
      .div(domains.length);
    varyings.surfacePosition?.assign(averagedSurfacePosition);
    varyings.waveHeight?.assign(displaced.y);
    varyings.waveSlope?.assign(gradient.length());
    displaced.y.addAssign(verticalOffset);
    return displaced;
  })();
}
