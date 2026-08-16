import * as THREE from 'three';

export function seabedHeight(x, z) {
  return -3.55
    + Math.sin(x * 0.105 + z * 0.035) * 0.17
    + Math.sin(z * 0.17 - x * 0.045) * 0.10
    + Math.sin((x + z) * 0.29) * 0.035;
}

function createSeabedTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let state = 0x57f0c31d;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const broad = Math.sin(x * 0.071 + y * 0.043)
        + Math.sin(x * -0.039 + y * 0.097 + 2.3);
      const grain = random() - 0.5;
      const causticA = Math.abs(Math.sin(x * 0.105 + Math.sin(y * 0.047) * 2.2));
      const causticB = Math.abs(Math.sin(y * 0.128 + Math.sin(x * 0.061) * 2.0));
      const caustic = Math.pow(1 - Math.abs(causticA - causticB), 12);
      const light = THREE.MathUtils.clamp(
        0.43 + broad * 0.085 + grain * 0.10 + caustic * 0.34,
        0,
        1,
      );
      const offset = (y * size + x) * 4;
      data[offset] = Math.round(38 + light * 58);
      data[offset + 1] = Math.round(91 + light * 70);
      data[offset + 2] = Math.round(78 + light * 58);
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'Procedural shallow seabed';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(9, 9);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createParticleTexture() {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 32;
  textureCanvas.height = 32;

  const context = textureCanvas.getContext('2d');
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(210,255,250,0.95)');
  gradient.addColorStop(0.28, 'rgba(116,223,225,0.72)');
  gradient.addColorStop(1, 'rgba(80,190,205,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createEnvironment(
  scene,
  sunDirection,
  { shadowMapResolution = 2048, rendererMode = 'webgl' } = {},
) {
  const seabedUniforms = {
    uTime: { value: 0 },
    uSunDirection: { value: sunDirection },
    uUnderwater: { value: 0 },
  };

  const webGlSeabedMaterial = new THREE.ShaderMaterial({
    uniforms: seabedUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;

      uniform float uTime;
      uniform vec3 uSunDirection;
      uniform float uUnderwater;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x),
          f.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);
        for (int i = 0; i < 4; i++) {
          value += amplitude * valueNoise(p);
          p = rotation * p * 2.05 + 7.4;
          amplitude *= 0.5;
        }
        return value;
      }

      float voronoiEdge(vec2 p, float phase) {
        vec2 cell = floor(p);
        vec2 local = fract(p);
        float closest = 10.0;
        float secondClosest = 10.0;

        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y));
            vec2 cellId = cell + offset;
            vec2 seed = vec2(
              hash21(cellId + vec2(17.1, 3.7)),
              hash21(cellId + vec2(5.3, 29.9))
            );
            vec2 feature = 0.5 + 0.34 * sin(
              seed * 6.2831853 + vec2(phase, -phase * 0.83)
            );
            vec2 delta = offset + feature - local;
            float distanceSquared = dot(delta, delta);

            if (distanceSquared < closest) {
              secondClosest = closest;
              closest = distanceSquared;
            } else if (distanceSquared < secondClosest) {
              secondClosest = distanceSquared;
            }
          }
        }

        float edgeDistance = sqrt(secondClosest) - sqrt(closest);
        return 1.0 - smoothstep(0.018, 0.092, edgeDistance);
      }

      void main() {
        vec2 p = vWorldPosition.xz;
        float sandNoise = fbm(p * 0.22);
        float fineGrain = valueNoise(p * 2.8);
        vec3 sandDark = vec3(0.075, 0.24, 0.23);
        vec3 sandLight = vec3(0.27, 0.53, 0.46);
        vec3 color = mix(sandDark, sandLight, sandNoise * 0.72 + fineGrain * 0.12);

        vec2 warp = vec2(
          valueNoise(p * 0.31 + vec2(uTime * 0.055, -uTime * 0.036)),
          valueNoise(p * 0.29 + vec2(-uTime * 0.047, uTime * 0.031) + 8.3)
        ) - 0.5;
        vec2 causticUv = p * 2.12 + warp * 1.12;
        mat2 causticTurn = mat2(0.76, -0.65, 0.65, 0.76);
        float causticA = voronoiEdge(causticUv, uTime * 0.34);
        float causticB = voronoiEdge(
          causticTurn * causticUv * 1.27 + 9.4,
          -uTime * 0.27
        );
        float caustic = pow(causticA, 1.55) * mix(0.18, 1.0, causticB);
        float causticBreakup = 0.22 + smoothstep(0.43, 0.73, fbm(
          p * 0.63 + vec2(uTime * 0.024, -uTime * 0.019)
        )) * 0.78;
        caustic *= causticBreakup;
        float diffuse = 0.34 + max(dot(normalize(vWorldNormal), uSunDirection), 0.0) * 0.66;
        color *= diffuse;
        color += vec3(0.15, 0.40, 0.34) * caustic * 0.22;

        float distanceToCamera = length(cameraPosition - vWorldPosition);
        float fogAmount = (1.0 - exp(-distanceToCamera * 0.040)) * uUnderwater;
        color = mix(color, vec3(0.004, 0.085, 0.11), fogAmount * 0.78);

        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const seabedMaterial = rendererMode === 'webgpu'
    ? new THREE.MeshStandardMaterial({
      name: 'WebGPU textured seabed',
      map: createSeabedTexture(),
      color: 0x9ac3ac,
      roughness: 0.91,
      metalness: 0,
      emissive: 0x0a5451,
      emissiveIntensity: 0.22,
    })
    : webGlSeabedMaterial;

  const seabedGeometry = new THREE.PlaneGeometry(180, 180, 150, 150);
  seabedGeometry.rotateX(-Math.PI / 2);
  const seabedPositions = seabedGeometry.attributes.position;
  for (let index = 0; index < seabedPositions.count; index += 1) {
    const x = seabedPositions.getX(index);
    const z = seabedPositions.getZ(index);
    seabedPositions.setY(index, seabedHeight(x, z));
  }
  seabedPositions.needsUpdate = true;
  seabedGeometry.computeVertexNormals();

  const seabed = new THREE.Mesh(seabedGeometry, seabedMaterial);
  seabed.receiveShadow = true;
  scene.add(seabed);

  let randomState = 0x7f4a7c15;
  function seededRandom() {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  }

  const rockCount = 34;
  const rockGeometry = new THREE.DodecahedronGeometry(0.72, 1);
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.0,
    vertexColors: true,
  });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);
  const instanceTransform = new THREE.Object3D();
  const rockColor = new THREE.Color();
  for (let index = 0; index < rockCount; index += 1) {
    const angle = seededRandom() * Math.PI * 2;
    const radius = 4.0 + Math.sqrt(seededRandom()) * 34.0;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const scale = 0.28 + seededRandom() * 0.82;
    instanceTransform.position.set(x, seabedHeight(x, z) + scale * 0.34, z);
    instanceTransform.rotation.set(
      seededRandom() * 0.55,
      seededRandom() * Math.PI * 2,
      seededRandom() * 0.55,
    );
    instanceTransform.scale.set(
      scale * (0.75 + seededRandom() * 0.55),
      scale * (0.52 + seededRandom() * 0.42),
      scale * (0.76 + seededRandom() * 0.48),
    );
    instanceTransform.updateMatrix();
    rocks.setMatrixAt(index, instanceTransform.matrix);
    rockColor.setHSL(0.48 + seededRandom() * 0.05, 0.18, 0.16 + seededRandom() * 0.12);
    rocks.setColorAt(index, rockColor);
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.instanceColor.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  scene.add(rocks);

  const grassCount = 150;
  const grassGeometry = new THREE.ConeGeometry(0.075, 1, 5, 1, true);
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: 0x07534f,
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount);
  const grassClusters = [
    new THREE.Vector2(-7, -6),
    new THREE.Vector2(8, -4),
    new THREE.Vector2(-11, 8),
    new THREE.Vector2(13, 10),
    new THREE.Vector2(2, 14),
    new THREE.Vector2(18, -13),
    new THREE.Vector2(-20, -12),
  ];
  for (let index = 0; index < grassCount; index += 1) {
    const cluster = grassClusters[Math.floor(seededRandom() * grassClusters.length)];
    const angle = seededRandom() * Math.PI * 2;
    const radius = Math.pow(seededRandom(), 1.7) * 2.4;
    const x = cluster.x + Math.cos(angle) * radius;
    const z = cluster.y + Math.sin(angle) * radius;
    const height = 0.38 + seededRandom() * 1.18;
    instanceTransform.position.set(x, seabedHeight(x, z) + height * 0.5, z);
    instanceTransform.rotation.set(
      (seededRandom() - 0.5) * 0.16,
      seededRandom() * Math.PI * 2,
      (seededRandom() - 0.5) * 0.16,
    );
    instanceTransform.scale.set(0.68 + seededRandom() * 0.72, height, 0.68 + seededRandom() * 0.72);
    instanceTransform.updateMatrix();
    grass.setMatrixAt(index, instanceTransform.matrix);
  }
  grass.instanceMatrix.needsUpdate = true;
  grass.receiveShadow = true;
  scene.add(grass);

  const particleCount = 440;
  const particlePositions = new Float32Array(particleCount * 3);
  for (let index = 0; index < particleCount; index += 1) {
    const angle = seededRandom() * Math.PI * 2;
    const radius = Math.sqrt(seededRandom()) * 56;
    particlePositions[index * 3] = Math.cos(angle) * radius;
    particlePositions[index * 3 + 1] = -12 + seededRandom() * 13.2;
    particlePositions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  // WebGPU's mapped PointsMaterial validates a UV input even though pointUV
  // supplies the per-sprite coordinates. A neutral attribute keeps the
  // pipeline warning-free on both the main and reflection passes.
  particleGeometry.setAttribute(
    'uv',
    new THREE.BufferAttribute(new Float32Array(particleCount * 2).fill(0.5), 2),
  );
  const particleMaterial = new THREE.PointsMaterial({
    map: createParticleTexture(),
    color: 0x70d9dd,
    size: 0.065,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    alphaTest: 0.015,
    blending: THREE.AdditiveBlending,
  });
  const underwaterParticles = new THREE.Points(particleGeometry, particleMaterial);
  underwaterParticles.frustumCulled = false;
  underwaterParticles.renderOrder = 4;
  scene.add(underwaterParticles);

  const hemisphereLight = new THREE.HemisphereLight(0x9ad7ff, 0x06373f, 1.65);
  scene.add(hemisphereLight);

  const sunLight = new THREE.DirectionalLight(0xffe2bc, 3.6);
  sunLight.position.copy(sunDirection).multiplyScalar(36);
  sunLight.castShadow = true;
  if (rendererMode === 'webgpu') {
    // WebGPURenderer schedules shadows through each light's ShadowNode. Its
    // renderer.shadowMap object has no WebGL-style autoUpdate flag, so leaving
    // the LightShadow at its default would redraw this atlas for both the
    // reflector camera and the main camera on every frame.
    sunLight.shadow.autoUpdate = false;
    sunLight.shadow.needsUpdate = true;
  }
  let currentShadowMapResolution = shadowMapResolution;
  sunLight.shadow.mapSize.set(shadowMapResolution, shadowMapResolution);
  sunLight.shadow.camera.left = -20;
  sunLight.shadow.camera.right = 20;
  sunLight.shadow.camera.top = 20;
  sunLight.shadow.camera.bottom = -20;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 80;
  sunLight.shadow.bias = -0.00035;
  scene.add(sunLight);

  return {
    underwaterObjects: [seabed, rocks, grass],
    requestShadowUpdate() {
      if (rendererMode === 'webgpu') sunLight.shadow.needsUpdate = true;
    },
    setShadowMapResolution(resolution) {
      const nextResolution = Math.max(512, Math.round(resolution));
      if (nextResolution === currentShadowMapResolution) return;
      currentShadowMapResolution = nextResolution;
      sunLight.shadow.mapSize.set(nextResolution, nextResolution);
      sunLight.shadow.map?.dispose();
      sunLight.shadow.map = null;
      if (rendererMode === 'webgpu') sunLight.shadow.needsUpdate = true;
    },
    getDiagnostics() {
      return {
        shadowMapResolution: currentShadowMapResolution,
        shadowAutoUpdate: sunLight.shadow.autoUpdate,
      };
    },
    update(time, underwaterMix) {
      seabedUniforms.uTime.value = time;
      seabedUniforms.uUnderwater.value = underwaterMix;
      const underwaterHemisphere = rendererMode === 'webgpu' ? 1.18 : 0.68;
      const underwaterSun = rendererMode === 'webgpu' ? 1.05 : 0.72;
      hemisphereLight.intensity = THREE.MathUtils.lerp(
        1.65,
        underwaterHemisphere,
        underwaterMix,
      );
      sunLight.intensity = THREE.MathUtils.lerp(3.6, underwaterSun, underwaterMix);
      if (rendererMode === 'webgpu') {
        seabedMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.22, 0.96, underwaterMix);
      }
      particleMaterial.opacity = underwaterMix * 0.46;
      underwaterParticles.visible = underwaterMix > 0.015;
      underwaterParticles.rotation.y = time * 0.0025;
      underwaterParticles.position.y = Math.sin(time * 0.12) * 0.10;
    },
  };
}
