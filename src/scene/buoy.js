import * as THREE from 'three';
import { seabedHeight } from './environment.js';
import { sampleOceanSurface } from './waves.js';

function createRadialTexture({ shadow = false } = {}) {
  const size = 256;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext('2d');
  context.clearRect(0, 0, size, size);

  if (shadow) {
    const gradient = context.createRadialGradient(128, 128, 4, 128, 128, 118);
    gradient.addColorStop(0, 'rgba(0,12,18,0.32)');
    gradient.addColorStop(0.45, 'rgba(0,12,18,0.20)');
    gradient.addColorStop(1, 'rgba(0,12,18,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  } else {
    context.strokeStyle = 'rgba(176,245,235,0.30)';
    for (const [radius, width, alpha] of [[36, 8, 0.34], [70, 5, 0.20], [108, 3, 0.10]]) {
      context.globalAlpha = alpha;
      context.lineWidth = width;
      context.beginPath();
      context.ellipse(128, 128, radius, radius * 0.76, 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.name = shadow ? 'Buoy surface shadow' : 'Buoy wake rings';
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createWake(scene, rendererMode) {
  const uniforms = { uTime: { value: 0 } };
  const webGlMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;

      uniform float uTime;
      varying vec2 vUv;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        vec2 centered = (vUv - 0.5) * vec2(1.0, 1.32);
        float radius = length(centered) * 2.0;
        float angleNoise = hash21(vec2(floor(atan(centered.y, centered.x) * 16.0), 2.0));
        float outward = fract(radius * 2.5 - uTime * 0.22);
        float ripple = 1.0 - smoothstep(0.0, 0.12, abs(outward - 0.16));
        float contact = (1.0 - smoothstep(0.17, 0.30, radius)) * 0.52;
        float edgeFade = 1.0 - smoothstep(0.28, 1.0, radius);
        float alpha = (ripple * 0.14 + contact) * edgeFade * (0.68 + angleNoise * 0.32);

        gl_FragColor = vec4(0.66, 0.94, 0.90, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const material = rendererMode === 'webgpu'
    ? new THREE.MeshBasicMaterial({
      map: createRadialTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
    })
    : webGlMaterial;
  const geometry = new THREE.PlaneGeometry(3.2, 3.2, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 7;
  scene.add(mesh);
  return { mesh, uniforms };
}

function createSurfaceShadow(scene, rendererMode) {
  const uniforms = { uTime: { value: 0 } };
  const webGlMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;

      uniform float uTime;
      varying vec2 vUv;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float edgeNoise = (hash21(floor((p + 1.0) * 12.0) + floor(uTime * 0.25)) - 0.5) * 0.045;
        float distanceFromCenter = length(p * vec2(0.82, 1.08));
        float softEdge = 1.0 - smoothstep(0.08, 1.0 + edgeNoise, distanceFromCenter);
        float core = 1.0 - smoothstep(0.0, 0.72, distanceFromCenter);
        float alpha = softEdge * (0.13 + core * 0.17);

        gl_FragColor = vec4(0.003, 0.020, 0.026, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const material = rendererMode === 'webgpu'
    ? new THREE.MeshBasicMaterial({
      map: createRadialTexture({ shadow: true }),
      color: 0x061820,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    })
    : webGlMaterial;
  const geometry = new THREE.PlaneGeometry(2.8, 1.35);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 6;
  scene.add(mesh);
  return { mesh, uniforms };
}

export function createBuoy(scene, sunDirection, { rendererMode = 'webgl' } = {}) {
  const buoy = new THREE.Group();
  const buoyBody = new THREE.Group();
  buoy.add(buoyBody);
  scene.add(buoy);

  const buoyRed = new THREE.MeshStandardMaterial({
    color: 0xff4d25,
    roughness: 0.28,
    metalness: 0.10,
  });
  const buoyRedDark = new THREE.MeshStandardMaterial({
    color: 0xd93419,
    roughness: 0.34,
    metalness: 0.14,
  });
  const buoyWhite = new THREE.MeshStandardMaterial({
    color: 0xf4eee2,
    roughness: 0.46,
    metalness: 0.02,
  });
  const buoyBlack = new THREE.MeshStandardMaterial({
    color: 0x12191c,
    roughness: 0.36,
    metalness: 0.58,
  });
  const lensMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd48a,
    emissive: 0xff7f24,
    emissiveIntensity: 1.7,
    roughness: 0.16,
    metalness: 0.08,
  });

  function addPart(geometry, material, positionY, parent = buoyBody) {
    const part = new THREE.Mesh(geometry, material);
    part.position.y = positionY;
    part.castShadow = true;
    part.receiveShadow = true;
    parent.add(part);
    return part;
  }

  addPart(new THREE.CylinderGeometry(0.48, 0.58, 0.55, 48), buoyRedDark, 0.02);
  addPart(new THREE.CylinderGeometry(0.46, 0.49, 0.46, 48), buoyRed, 0.49);
  addPart(new THREE.CylinderGeometry(0.468, 0.49, 0.16, 48), buoyWhite, 0.52);

  const collar = addPart(new THREE.TorusGeometry(0.54, 0.095, 18, 64), buoyBlack, -0.17);
  collar.rotation.x = Math.PI / 2;

  addPart(new THREE.ConeGeometry(0.455, 0.52, 48), buoyRed, 0.98);
  addPart(new THREE.CylinderGeometry(0.055, 0.072, 0.92, 20), buoyBlack, 1.61);
  addPart(new THREE.CylinderGeometry(0.18, 0.14, 0.075, 24), buoyBlack, 2.04);
  addPart(new THREE.CylinderGeometry(0.12, 0.12, 0.19, 24), lensMaterial, 2.17);
  addPart(new THREE.ConeGeometry(0.18, 0.13, 24), buoyBlack, 2.33);

  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2;
    const rail = addPart(
      new THREE.CylinderGeometry(0.012, 0.012, 0.30, 8),
      buoyBlack,
      2.17,
    );
    rail.position.x = Math.cos(angle) * 0.145;
    rail.position.z = Math.sin(angle) * 0.145;
  }

  const topRing = addPart(new THREE.TorusGeometry(0.11, 0.016, 8, 32), buoyBlack, 2.43);
  topRing.rotation.y = Math.PI / 2;

  const anchorFloor = seabedHeight(0, 0);
  const mooringAnchor = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.45, 1),
    new THREE.MeshStandardMaterial({ color: 0x182b2d, roughness: 0.94, metalness: 0.02 }),
  );
  mooringAnchor.position.set(0, anchorFloor + 0.20, 0);
  mooringAnchor.scale.set(1.05, 0.55, 0.88);
  mooringAnchor.castShadow = true;
  mooringAnchor.receiveShadow = true;
  scene.add(mooringAnchor);

  const mooringLine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.026, 1, 8),
    new THREE.MeshStandardMaterial({ color: 0x111c1e, roughness: 0.70, metalness: 0.34 }),
  );
  mooringLine.castShadow = true;
  scene.add(mooringLine);

  const wake = createWake(scene, rendererMode);
  const shadow = createSurfaceShadow(scene, rendererMode);
  const up = new THREE.Vector3(0, 1, 0);
  const targetBuoyQuaternion = new THREE.Quaternion();
  const targetWakeQuaternion = new THREE.Quaternion();
  const targetShadowQuaternion = new THREE.Quaternion();
  const shadowYawQuaternion = new THREE.Quaternion().setFromAxisAngle(
    up,
    Math.atan2(sunDirection.z, -sunDirection.x),
  );
  const buoyPosition = new THREE.Vector2(0, 0);
  const initialSurface = sampleOceanSurface(buoyPosition.x, buoyPosition.y, 0);
  buoy.position.set(buoyPosition.x, initialSurface.height - 0.02, buoyPosition.y);
  wake.mesh.position.set(buoyPosition.x, initialSurface.height + 0.018, buoyPosition.y);

  return {
    mesh: buoy,
    captureHiddenObjects: [wake.mesh, shadow.mesh],
    underwaterObjects: [mooringAnchor, mooringLine],
    update(time, underwaterMix) {
      wake.uniforms.uTime.value = time;
      shadow.uniforms.uTime.value = time;

      const surface = sampleOceanSurface(buoyPosition.x, buoyPosition.y, time);
      const targetHeight = surface.height - 0.02;
      buoy.position.y = THREE.MathUtils.lerp(buoy.position.y, targetHeight, 0.10);
      targetBuoyQuaternion.setFromUnitVectors(up, surface.normal);
      buoy.quaternion.slerp(targetBuoyQuaternion, 0.075);
      buoyBody.rotation.y = Math.sin(time * 0.21) * 0.055;

      wake.mesh.position.y = surface.height + 0.024;
      targetWakeQuaternion.setFromUnitVectors(up, surface.normal);
      wake.mesh.quaternion.slerp(targetWakeQuaternion, 0.12);

      const shadowX = buoyPosition.x - sunDirection.x * 1.25;
      const shadowZ = buoyPosition.y - sunDirection.z * 1.25;
      const shadowSurface = sampleOceanSurface(shadowX, shadowZ, time);
      shadow.mesh.position.set(shadowX, shadowSurface.height + 0.032, shadowZ);
      targetShadowQuaternion
        .setFromUnitVectors(up, shadowSurface.normal)
        .multiply(shadowYawQuaternion);
      shadow.mesh.quaternion.slerp(targetShadowQuaternion, 0.12);

      const lineTop = buoy.position.y - 0.22;
      const lineBottom = anchorFloor + 0.34;
      const lineHeight = Math.max(0.2, lineTop - lineBottom);
      mooringLine.position.set(0, lineBottom + lineHeight * 0.5, 0);
      mooringLine.scale.set(1, lineHeight, 1);

      wake.mesh.visible = underwaterMix < 0.72;
      shadow.mesh.visible = underwaterMix < 0.72;
    },
  };
}
