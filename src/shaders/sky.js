export const skyVertexShader = /* glsl */ `
  varying vec3 vWorldDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldDirection = worldPosition.xyz - cameraPosition;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const skyFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform float uUnderwater;
  uniform float uSunVisibility;
  varying vec3 vWorldDirection;

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

    for (int i = 0; i < 5; i++) {
      value += amplitude * valueNoise(p);
      p = rotation * p * 2.03 + 11.7;
      amplitude *= 0.5;
    }

    return value;
  }

  float directionalFbm(vec3 direction, float scale, vec3 offset) {
    vec3 weights = pow(abs(direction), vec3(4.0));
    weights /= max(weights.x + weights.y + weights.z, 0.0001);
    vec3 p = direction * scale + offset;
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 5; i++) {
      vec3 samples = vec3(
        valueNoise(p.yz + vec2(13.7, -4.1)),
        valueNoise(p.xz + vec2(-8.3, 17.2)),
        valueNoise(p.xy + vec2(5.9, 11.4))
      );
      value += dot(samples, weights) * amplitude;
      p = p * 2.03 + vec3(7.1, -9.4, 13.6);
      amplitude *= 0.5;
    }

    return value;
  }

  vec3 atmosphere(vec3 direction) {
    float elevation = max(direction.y, 0.0);
    float horizon = pow(1.0 - elevation, 4.0);
    vec3 horizonColor = vec3(0.075, 0.23, 0.43);
    vec3 midColor = vec3(0.022, 0.115, 0.30);
    vec3 zenithColor = vec3(0.005, 0.030, 0.105);
    vec3 color = mix(horizonColor, midColor, smoothstep(0.0, 0.38, elevation));
    color = mix(color, zenithColor, smoothstep(0.28, 1.0, elevation));
    color += vec3(0.025, 0.040, 0.052) * horizon;

    float sunAmount = max(dot(direction, uSunDirection), 0.0);
    float outerAureole = pow(sunAmount, 86.0);
    float innerAureole = pow(sunAmount, 520.0);
    float sunDisk = smoothstep(0.99994, 0.999985, sunAmount);
    color += vec3(1.0, 0.70, 0.40)
      * outerAureole * 0.065 * uSunVisibility;
    color += vec3(1.0, 0.86, 0.62)
      * innerAureole * 0.20 * uSunVisibility;
    color += vec3(1.0, 0.96, 0.82)
      * sunDisk * 2.55 * uSunVisibility;

    return color;
  }

  void main() {
    vec3 direction = normalize(vWorldDirection);
    vec3 color = atmosphere(direction);

    if (uUnderwater < 0.5) {
      float cloudFade = smoothstep(0.018, 0.12, direction.y) *
        (1.0 - smoothstep(0.84, 0.99, direction.y));
      // Smooth triplanar directional noise has no horizon singularity or
      // longitude seam, so a cloud keeps its shape through a full orbit.
      float cloudAngle = uTime * 0.0013;
      mat2 cloudWind = mat2(
        cos(cloudAngle), -sin(cloudAngle),
        sin(cloudAngle), cos(cloudAngle)
      );
      vec3 cloudDirection = direction;
      cloudDirection.xz = cloudWind * cloudDirection.xz;
      float broadCloud = directionalFbm(
        cloudDirection,
        3.4,
        vec3(0.0)
      ) * 0.78 + directionalFbm(
        cloudDirection,
        7.3,
        vec3(-8.7, 4.1, 12.8)
      ) * 0.22;
      float cloudErosion = directionalFbm(
        cloudDirection,
        12.6,
        vec3(19.2, -6.4, 3.7)
      );
      float cloud = smoothstep(0.515, 0.650, broadCloud);
      cloud *= mix(0.52, 1.0, smoothstep(0.30, 0.67, cloudErosion));
      cloud *= cloudFade * 0.84;
      float cloudLight = clamp(
        dot(direction, uSunDirection) * 0.90 + direction.y * 0.55 + 0.42,
        0.0,
        1.0
      );
      vec3 cloudColor = mix(
        vec3(0.18, 0.27, 0.36),
        vec3(0.92, 0.96, 0.98),
        cloudLight
      );
      color = mix(color, cloudColor, cloud);

      // Low-altitude sunlight becomes visible where aerosols scatter it
      // through uneven cloud gaps. Direction-space spokes stay attached
      // to the sun through a full camera orbit without a post-process.
      vec3 sunTangent = normalize(cross(
        vec3(0.0, 1.0, 0.0),
        uSunDirection
      ));
      vec3 sunBitangent = normalize(cross(uSunDirection, sunTangent));
      float sunForward = max(dot(direction, uSunDirection), 0.025);
      vec2 rayPlane = vec2(
        dot(direction, sunTangent),
        dot(direction, sunBitangent)
      ) / sunForward;
      float rayRadius = length(rayPlane);
      vec2 rayHeading = rayPlane / max(rayRadius, 0.001);
      float broadSpokes = valueNoise(
        rayHeading * 4.2 + vec2(uTime * 0.0007, -2.8)
      );
      float fineSpokes = valueNoise(
        rayHeading * 11.3 + vec2(-7.1, uTime * 0.0011)
      );
      float spokePattern = smoothstep(
        0.28,
        0.82,
        broadSpokes * 0.72 + fineSpokes * 0.28
      );
      float rayEnvelope = smoothstep(0.018, 0.065, rayRadius)
        * (1.0 - smoothstep(0.12, 0.44, rayRadius));
      float cloudEdge = smoothstep(0.48, 0.59, broadCloud)
        * (1.0 - smoothstep(0.62, 0.73, broadCloud));
      float cloudGap = mix(1.0, 0.24, cloud);
      float shafts = spokePattern * rayEnvelope * cloudGap
        * (0.035 + cloudEdge * 0.75);
      color += vec3(1.0, 0.74, 0.46)
        * shafts * 0.022 * uSunVisibility;
    } else {
      float upwardLight = smoothstep(-0.72, 0.88, direction.y);
      vec3 deepWater = vec3(0.0015, 0.035, 0.065);
      vec3 litWater = vec3(0.008, 0.19, 0.24);
      color = mix(deepWater, litWater, upwardLight);

      // Refract the solar direction at the air/water boundary. Soft
      // angular density gives volume without intersecting billboard cards.
      const float eta = 1.0 / 1.333;
      vec2 refractedHorizontal = uSunDirection.xz * eta;
      float refractedVertical = sqrt(max(
        1.0 - dot(refractedHorizontal, refractedHorizontal),
        0.001
      ));
      vec3 refractedSun = normalize(vec3(
        refractedHorizontal.x,
        refractedVertical,
        refractedHorizontal.y
      ));
      vec3 rayTangent = normalize(cross(refractedSun, vec3(0.0, 1.0, 0.0)));
      vec3 rayBitangent = normalize(cross(rayTangent, refractedSun));
      float alongRay = max(dot(direction, refractedSun), 0.001);
      vec2 rayUv = vec2(
        dot(direction, rayTangent),
        dot(direction, rayBitangent)
      ) / alongRay;
      float rayCone = pow(max(dot(direction, refractedSun), 0.0), 13.0);
      float rayWarp = fbm(rayUv * vec2(2.1, 1.2) + vec2(uTime * 0.006, -uTime * 0.003));
      float rayBands = pow(
        0.5 + 0.5 * sin(rayUv.x * 17.0 + rayWarp * 5.2),
        5.0
      );
      float suspendedHaze = fbm(rayUv * 3.2 + uTime * 0.007);
      float shafts = rayCone * mix(0.22, 1.0, rayBands);
      shafts *= 0.42 + suspendedHaze * 0.58;
      color += vec3(0.025, 0.16, 0.17) * shafts * 0.72;
    }

    float grain = hash21(gl_FragCoord.xy + uTime) - 0.5;
    color += grain / 420.0;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
