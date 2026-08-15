import * as THREE from 'three';
import { seabedHeight } from './environment.js';
import { sampleOceanSurface } from './waves.js';

const FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const SCHOOL_RADIUS = 3.4;
const SEPARATION_RADIUS = 0.72;
const CAMERA_NOTICE_RADIUS = 9.0;

const SCHOOL_PRESETS = [
  { center: new THREE.Vector3(4.2, -1.75, 3.8), count: 17, tint: 0x69c5ba },
  { center: new THREE.Vector3(-6.4, -2.15, -3.2), count: 15, tint: 0x8abcb5 },
  { center: new THREE.Vector3(1.3, -1.45, -8.0), count: 13, tint: 0xd0bc7b },
];

function createTailGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -0.28,
    0, 0.18, -0.62,
    0, 0, -0.51,
    0, -0.18, -0.62,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function clampVectorLength(vector, maximum) {
  const lengthSquared = vector.lengthSq();
  if (lengthSquared > maximum * maximum) vector.setLength(maximum);
  return vector;
}

export function createFishSchools(scene) {
  let randomState = 0x5eaf00d;
  function seededRandom() {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  }

  const fishCount = SCHOOL_PRESETS.reduce((sum, school) => sum + school.count, 0);
  const bodyGeometry = new THREE.SphereGeometry(0.5, 10, 6);
  const tailGeometry = createTailGeometry();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.48,
    metalness: 0.12,
    emissive: 0x2c7772,
    emissiveIntensity: 0.82,
    vertexColors: true,
  });
  const tailMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.58,
    metalness: 0.04,
    emissive: 0x1c5351,
    emissiveIntensity: 0.72,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const bodies = new THREE.InstancedMesh(
    bodyGeometry,
    bodyMaterial,
    fishCount,
  );
  const tails = new THREE.InstancedMesh(
    tailGeometry,
    tailMaterial,
    fishCount,
  );
  bodies.frustumCulled = false;
  tails.frustumCulled = false;
  bodies.renderOrder = 2;
  tails.renderOrder = 2;
  scene.add(bodies, tails);

  const fish = [];
  const color = new THREE.Color();
  let fishIndex = 0;
  SCHOOL_PRESETS.forEach((school, schoolIndex) => {
    for (let localIndex = 0; localIndex < school.count; localIndex += 1) {
      const angle = seededRandom() * Math.PI * 2;
      const radius = Math.sqrt(seededRandom()) * SCHOOL_RADIUS;
      const position = school.center.clone().add(new THREE.Vector3(
        Math.cos(angle) * radius,
        (seededRandom() - 0.5) * 1.25,
        Math.sin(angle) * radius,
      ));
      const heading = seededRandom() * Math.PI * 2;
      const cruisingSpeed = 0.68 + seededRandom() * 0.34;
      const velocity = new THREE.Vector3(
        Math.cos(heading),
        (seededRandom() - 0.5) * 0.12,
        Math.sin(heading),
      ).normalize().multiplyScalar(cruisingSpeed);
      const scale = 0.46 + seededRandom() * 0.34;
      const isCurious = seededRandom() < 0.16;
      const individual = {
        index: fishIndex,
        school: schoolIndex,
        position,
        velocity,
        acceleration: new THREE.Vector3(),
        scale,
        cruisingSpeed,
        phase: seededRandom() * Math.PI * 2,
        curiosity: isCurious ? 0.72 + seededRandom() * 0.28 : 0,
      };
      fish.push(individual);

      color.setHex(school.tint);
      color.offsetHSL(
        (seededRandom() - 0.5) * 0.045,
        (seededRandom() - 0.5) * 0.12,
        (seededRandom() - 0.5) * 0.16,
      );
      bodies.setColorAt(fishIndex, color);
      tails.setColorAt(fishIndex, color.clone().multiplyScalar(0.72));
      fishIndex += 1;
    }
  });
  bodies.instanceColor.needsUpdate = true;
  tails.instanceColor.needsUpdate = true;

  const bodyTransform = new THREE.Object3D();
  const tailTransform = new THREE.Object3D();
  const bodyQuaternion = new THREE.Quaternion();
  const tailWagQuaternion = new THREE.Quaternion();
  const tailQuaternion = new THREE.Quaternion();
  const direction = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const separation = new THREE.Vector3();
  const alignment = new THREE.Vector3();
  const cohesion = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const schoolCenter = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3();
  const cameraVelocity = new THREE.Vector3();
  const previousCameraPosition = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  let hasCameraPosition = false;
  let lastTime = null;
  let cameraStillTime = 0;
  let lastCameraSpeed = 0;

  function getSchoolCenter(schoolIndex, time, target) {
    const preset = SCHOOL_PRESETS[schoolIndex];
    const phase = schoolIndex * 2.17;
    return target.copy(preset.center).add(new THREE.Vector3(
      Math.sin(time * 0.075 + phase) * 2.2,
      Math.sin(time * 0.11 + phase * 1.7) * 0.28,
      Math.cos(time * 0.061 + phase) * 2.5,
    ));
  }

  function updateMatrices(time) {
    for (const individual of fish) {
      direction.copy(individual.velocity).normalize();
      bodyQuaternion.setFromUnitVectors(FORWARD, direction);
      bodyTransform.position.copy(individual.position);
      bodyTransform.quaternion.copy(bodyQuaternion);
      bodyTransform.scale.set(
        individual.scale * 0.36,
        individual.scale * 0.21,
        individual.scale * 0.74,
      );
      bodyTransform.updateMatrix();
      bodies.setMatrixAt(individual.index, bodyTransform.matrix);

      const fishSpeed = individual.velocity.length();
      const tailFrequency = 3.2 + fishSpeed * 1.35;
      const tailEffort = THREE.MathUtils.smoothstep(
        fishSpeed,
        individual.cruisingSpeed * 0.72,
        individual.cruisingSpeed + 1.8,
      );
      const tailAngle = Math.sin(time * tailFrequency + individual.phase)
        * THREE.MathUtils.lerp(0.14, 0.31, tailEffort);
      tailWagQuaternion.setFromAxisAngle(UP, tailAngle);
      tailQuaternion.copy(bodyQuaternion).multiply(tailWagQuaternion);
      tailTransform.position.copy(individual.position);
      tailTransform.quaternion.copy(tailQuaternion);
      tailTransform.scale.setScalar(individual.scale);
      tailTransform.updateMatrix();
      tails.setMatrixAt(individual.index, tailTransform.matrix);
    }
    bodies.instanceMatrix.needsUpdate = true;
    tails.instanceMatrix.needsUpdate = true;
  }

  function update(time, underwaterMix, camera) {
    const rawDelta = lastTime === null ? 0 : time - lastTime;
    const delta = THREE.MathUtils.clamp(rawDelta, 0, 1 / 20);
    lastTime = time;

    if (!hasCameraPosition) {
      previousCameraPosition.copy(camera.position);
      hasCameraPosition = true;
    }
    if (delta > 0) {
      cameraVelocity.copy(camera.position).sub(previousCameraPosition).divideScalar(delta);
      clampVectorLength(cameraVelocity, 8);
    } else {
      cameraVelocity.set(0, 0, 0);
    }
    previousCameraPosition.copy(camera.position);
    lastCameraSpeed = cameraVelocity.length();
    const cameraIsUnderwater = underwaterMix > 0.5;
    if (cameraIsUnderwater && lastCameraSpeed < 0.075) {
      cameraStillTime += delta;
    } else if (lastCameraSpeed > 0.65) {
      cameraStillTime = 0;
    } else {
      cameraStillTime = Math.max(0, cameraStillTime - delta * 2.8);
    }
    const calmness = THREE.MathUtils.smoothstep(cameraStillTime, 1.6, 5.2);
    const curiosityCalmness = THREE.MathUtils.smoothstep(
      cameraStillTime,
      0.7,
      2.6,
    );

    if (delta > 0) {
      for (const individual of fish) {
        separation.set(0, 0, 0);
        alignment.set(0, 0, 0);
        cohesion.set(0, 0, 0);
        let separationCount = 0;
        let neighborCount = 0;

        for (const neighbor of fish) {
          if (neighbor === individual || neighbor.school !== individual.school) continue;
          offset.copy(neighbor.position).sub(individual.position);
          const distanceSquared = offset.lengthSq();
          if (distanceSquared < 10.5) {
            alignment.add(neighbor.velocity);
            cohesion.add(neighbor.position);
            neighborCount += 1;
          }
          if (distanceSquared > 0.0001
            && distanceSquared < SEPARATION_RADIUS * SEPARATION_RADIUS) {
            separation.addScaledVector(offset, -1 / distanceSquared);
            separationCount += 1;
          }
        }

        individual.acceleration.set(0, 0, 0);
        if (separationCount > 0) {
          separation.divideScalar(separationCount);
          clampVectorLength(separation, 1.8);
          individual.acceleration.addScaledVector(separation, 1.55);
        }
        if (neighborCount > 0) {
          alignment.divideScalar(neighborCount).sub(individual.velocity);
          cohesion.divideScalar(neighborCount).sub(individual.position);
          cohesion.y *= 0.42;
          individual.acceleration.addScaledVector(alignment, 0.68);
          individual.acceleration.addScaledVector(cohesion, 0.23);
        }

        getSchoolCenter(individual.school, time, schoolCenter);
        desired.copy(schoolCenter).sub(individual.position);
        desired.y *= 0.55;
        if (desired.lengthSq() > 12.0) {
          desired.normalize().multiplyScalar(individual.cruisingSpeed);
          individual.acceleration.addScaledVector(
            desired.sub(individual.velocity),
            0.58,
          );
        }

        const wanderPhase = time * 0.31 + individual.phase;
        individual.acceleration.x += Math.sin(wanderPhase * 1.17) * 0.055;
        individual.acceleration.y += Math.sin(wanderPhase * 0.73) * 0.022;
        individual.acceleration.z += Math.cos(wanderPhase * 0.91) * 0.055;

        desired.copy(camera.position).addScaledVector(cameraVelocity, 0.18);
        cameraOffset.copy(individual.position).sub(desired);
        const cameraDistance = cameraOffset.length();
        let panic = 0;
        if (cameraIsUnderwater) {
          const noticeRadius = CAMERA_NOTICE_RADIUS
            + Math.min(lastCameraSpeed * 0.45, 3.0);
          if (cameraDistance < noticeRadius) {
            panic = Math.sqrt(1 - THREE.MathUtils.smoothstep(
              cameraDistance,
              1.05,
              noticeRadius,
            ));
            const habituation = individual.curiosity > 0
              ? curiosityCalmness * 0.97
              : calmness * 0.72;
            const personalSpace = 1 - THREE.MathUtils.smoothstep(
              cameraDistance,
              0.9,
              2.7,
            );
            const fear = Math.max(personalSpace, panic * (1 - habituation));
            cameraOffset.normalize();
            individual.acceleration.addScaledVector(
              cameraOffset,
              fear * (4.4 + Math.min(lastCameraSpeed * 0.48, 2.1)),
            );
            if (lastCameraSpeed > 0.2) {
              individual.acceleration.addScaledVector(
                cameraVelocity,
                -fear * 0.20,
              );
            }
          }
        }

        if (cameraIsUnderwater
          && individual.curiosity > 0
          && curiosityCalmness > 0.10) {
          cameraOffset.copy(camera.position).sub(individual.position);
          const distanceToCamera = cameraOffset.length();
          if (distanceToCamera < 11.5 && distanceToCamera > 1.55) {
            direction.copy(cameraOffset).normalize();
            tangent.crossVectors(UP, direction).normalize();
            const orbitRadius = 2.8 + individual.curiosity * 1.5;
            desired.copy(direction).multiplyScalar((distanceToCamera - orbitRadius) * 0.42);
            desired.addScaledVector(tangent, individual.cruisingSpeed * 1.05);
            desired.y += (camera.position.y - 0.15 - individual.position.y) * 0.20;
            individual.acceleration.addScaledVector(
              desired,
              curiosityCalmness * individual.curiosity * 1.05,
            );
          }
        }

        const surface = sampleOceanSurface(
          individual.position.x,
          individual.position.z,
          time,
        ).height;
        const floor = seabedHeight(individual.position.x, individual.position.z);
        const ceilingDistance = surface - 0.48 - individual.position.y;
        const floorDistance = individual.position.y - floor - 0.38;
        if (ceilingDistance < 0.62) individual.acceleration.y -= (0.62 - ceilingDistance) * 1.6;
        if (floorDistance < 0.52) individual.acceleration.y += (0.52 - floorDistance) * 1.8;

        individual.acceleration.y *= 0.62;
        clampVectorLength(individual.acceleration, 5.8);
        individual.velocity.addScaledVector(individual.acceleration, delta);
        individual.velocity.y = THREE.MathUtils.clamp(
          individual.velocity.y,
          -0.17,
          0.17,
        );
        const panicSpeed = panic * 2.05
          + Math.min(lastCameraSpeed * panic * 0.15, 0.85);
        const maximumSpeed = individual.cruisingSpeed + 0.38 + panicSpeed;
        clampVectorLength(individual.velocity, maximumSpeed);
        if (individual.velocity.length() < individual.cruisingSpeed * 0.72) {
          individual.velocity.setLength(individual.cruisingSpeed * 0.72);
        }
        individual.position.addScaledVector(individual.velocity, delta);
      }
    }

    updateMatrices(time);
  }

  function getDiagnostics(camera) {
    let nearbyCount = 0;
    let fleeingCount = 0;
    let curiousNearby = 0;
    let radialVelocity = 0;
    let totalSpeed = 0;
    for (const individual of fish) {
      totalSpeed += individual.velocity.length();
      cameraOffset.copy(individual.position).sub(camera.position);
      const distance = cameraOffset.length();
      if (distance < CAMERA_NOTICE_RADIUS) {
        nearbyCount += 1;
        const radial = individual.velocity.dot(cameraOffset.normalize());
        radialVelocity += radial;
        if (radial > 0.16) fleeingCount += 1;
        if (individual.curiosity > 0) curiousNearby += 1;
      }
    }
    return {
      count: fishCount,
      nearbyCount,
      fleeingCount,
      curiousNearby,
      averageRadialVelocity: nearbyCount > 0 ? radialVelocity / nearbyCount : 0,
      averageSpeed: totalSpeed / fishCount,
      averageTailHz: (3.2 + (totalSpeed / fishCount) * 1.35)
        / (Math.PI * 2),
      cameraSpeed: lastCameraSpeed,
      calmness: THREE.MathUtils.smoothstep(cameraStillTime, 1.6, 5.2),
    };
  }

  updateMatrices(0);

  return {
    underwaterObjects: [bodies, tails],
    update,
    getDiagnostics,
  };
}
