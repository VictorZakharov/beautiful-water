import { sampleOceanSurface } from '../../src/scene/waves.js';

export function measureWaveFieldCorrelation({
  time,
  gridSize = 81,
  step = 3,
  minShiftDistance = 18,
  maxShiftDistance = 60,
} = {}) {
  const center = (gridSize - 1) * 0.5;
  const samples = Array.from({ length: gridSize }, (_, z) => (
    Array.from({ length: gridSize }, (_, x) => (
      sampleOceanSurface((x - center) * step, (z - center) * step, time).height
    ))
  ));
  const maxShift = Math.floor(maxShiftDistance / step);
  let strongest = { correlation: -1, dx: 0, dz: 0, distance: 0 };

  for (let dz = -maxShift; dz <= maxShift; dz += 1) {
    for (let dx = -maxShift; dx <= maxShift; dx += 1) {
      const distance = Math.hypot(dx, dz) * step;
      if (distance < minShiftDistance || distance > maxShiftDistance) continue;

      const startX = Math.max(0, -dx);
      const endX = Math.min(gridSize, gridSize - dx);
      const startZ = Math.max(0, -dz);
      const endZ = Math.min(gridSize, gridSize - dz);
      const count = (endX - startX) * (endZ - startZ);
      let sumA = 0;
      let sumB = 0;

      for (let z = startZ; z < endZ; z += 1) {
        for (let x = startX; x < endX; x += 1) {
          sumA += samples[z][x];
          sumB += samples[z + dz][x + dx];
        }
      }

      const meanA = sumA / count;
      const meanB = sumB / count;
      let covariance = 0;
      let varianceA = 0;
      let varianceB = 0;

      for (let z = startZ; z < endZ; z += 1) {
        for (let x = startX; x < endX; x += 1) {
          const a = samples[z][x] - meanA;
          const b = samples[z + dz][x + dx] - meanB;
          covariance += a * b;
          varianceA += a * a;
          varianceB += b * b;
        }
      }

      const correlation = covariance / Math.sqrt(varianceA * varianceB);
      if (correlation > strongest.correlation) {
        strongest = { correlation, dx, dz, distance };
      }
    }
  }

  return strongest;
}
