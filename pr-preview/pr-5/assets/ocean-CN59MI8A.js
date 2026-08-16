import{Ft as e,It as t,Nr as n,Ur as r,Wr as i,Z as a,cn as o,en as s,fr as c,h as l,nn as u,qr as d,tn as f}from"./three.core-BoMSk3Jx.js";import{i as p,n as m,r as h,t as g}from"./waves--ckGQqW5.js";import{t as _}from"./noise-texture-DdONTGRy.js";var v=class o extends t{constructor(t,s={}){super(t),this.isReflector=!0,this.type=`Reflector`,this.forceUpdate=!1,this._reflectionCameras=new WeakMap;let u=this,p=s.color===void 0?new l(8355711):new l(s.color),m=s.textureWidth||512,h=s.textureHeight||512,g=s.clipBias||0,_=s.shader||o.ReflectorShader,v=s.multisample===void 0?4:s.multisample,y=new f,b=new r,x=new r,S=new r,C=new e,w=new r(0,0,-1),T=new i,E=new r,D=new r,O=new i,k=new e,A=new d(m,h,{samples:v,type:a}),j=new c({name:_.name===void 0?`unspecified`:_.name,uniforms:n.clone(_.uniforms),fragmentShader:_.fragmentShader,vertexShader:_.vertexShader});j.uniforms.tDiffuse.value=A.texture,j.uniforms.color.value=p,j.uniforms.textureMatrix.value=k,this.material=j,this.onBeforeRender=function(e,t,n){let r=this.getReflectionCamera(n);if(x.setFromMatrixPosition(u.matrixWorld),S.setFromMatrixPosition(n.matrixWorld),C.extractRotation(u.matrixWorld),b.set(0,0,1),b.applyMatrix4(C),E.subVectors(x,S),E.dot(b)>0&&this.forceUpdate===!1)return;E.reflect(b).negate(),E.add(x),C.extractRotation(n.matrixWorld),w.set(0,0,-1),w.applyMatrix4(C),w.add(S),D.subVectors(x,w),D.reflect(b).negate(),D.add(x),r.position.copy(E),r.up.set(0,1,0),r.up.applyMatrix4(C),r.up.reflect(b),r.lookAt(D),r.far=n.far,r.updateMatrixWorld(),r.projectionMatrix.copy(n.projectionMatrix),k.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),k.multiply(r.projectionMatrix),k.multiply(r.matrixWorldInverse),k.multiply(u.matrixWorld),y.setFromNormalAndCoplanarPoint(b,x),y.applyMatrix4(r.matrixWorldInverse),T.set(y.normal.x,y.normal.y,y.normal.z,y.constant);let i=r.projectionMatrix;r.isOrthographicCamera?(O.x=(Math.sign(T.x)+i.elements[8])/i.elements[0],O.y=(Math.sign(T.y)+i.elements[9])/i.elements[5],O.z=-n.far,O.w=1):(O.x=(Math.sign(T.x)+i.elements[8])/i.elements[0],O.y=(Math.sign(T.y)+i.elements[9])/i.elements[5],O.z=-1,O.w=(1+i.elements[10])/i.elements[14]),T.multiplyScalar(2/T.dot(O)),i.elements[2]=T.x,i.elements[6]=T.y,r.isOrthographicCamera?(i.elements[10]=T.z-g,i.elements[14]=T.w-1):(i.elements[10]=T.z+1-g,i.elements[14]=T.w),u.visible=!1;let a=e.getRenderTarget(),o=e.xr.enabled,s=e.shadowMap.autoUpdate;e.xr.enabled=!1,e.shadowMap.autoUpdate=!1,e.setRenderTarget(A),e.state.buffers.depth.setMask(!0),e.autoClear===!1&&e.clear(),e.render(t,r),e.xr.enabled=o,e.shadowMap.autoUpdate=s,e.setRenderTarget(a);let c=n.viewport;c!==void 0&&e.state.viewport(c),u.visible=!0,this.forceUpdate=!1},this.getRenderTarget=function(){return A},this.dispose=function(){A.dispose(),u.material.dispose()},this.getReflectionCamera=function(e){let t=this._reflectionCameras.get(e);return t===void 0&&(t=e.clone(),this._reflectionCameras.set(e,t)),t}}};v.ReflectorShader={name:`ReflectorShader`,uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null}},vertexShader:`
		uniform mat4 textureMatrix;
		varying vec4 vUv;

		#include <common>
		#include <logdepthbuf_pars_vertex>

		void main() {

			vUv = textureMatrix * vec4( position, 1.0 );

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

			#include <logdepthbuf_vertex>

		}`,fragmentShader:`
		uniform vec3 color;
		uniform sampler2D tDiffuse;
		varying vec4 vUv;

		#include <logdepthbuf_pars_fragment>

		float blendOverlay( float base, float blend ) {

			return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );

		}

		vec3 blendOverlay( vec3 base, vec3 blend ) {

			return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );

		}

		void main() {

			#include <logdepthbuf_fragment>

			vec4 base = texture2DProj( tDiffuse, vUv );
			gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>

		}`};var y=class u extends t{constructor(t,p={}){super(t),this.isRefractor=!0,this.type=`Refractor`,this.camera=new s;let m=this,h=p.color===void 0?new l(8355711):new l(p.color),g=p.textureWidth||512,_=p.textureHeight||512,v=p.clipBias||0,y=p.shader||u.RefractorShader,b=p.multisample===void 0?4:p.multisample,x=this.camera;x.matrixAutoUpdate=!1,x.userData.refractor=!0;let S=new f,C=new e,w=new d(g,_,{samples:b,type:a});this.material=new c({name:y.name===void 0?`unspecified`:y.name,uniforms:n.clone(y.uniforms),vertexShader:y.vertexShader,fragmentShader:y.fragmentShader,transparent:!0}),this.material.uniforms.color.value=h,this.material.uniforms.tDiffuse.value=w.texture,this.material.uniforms.textureMatrix.value=C;let T=(function(){let t=new r,n=new r,i=new e,a=new r,o=new r;return function(e){return t.setFromMatrixPosition(m.matrixWorld),n.setFromMatrixPosition(e.matrixWorld),a.subVectors(t,n),i.extractRotation(m.matrixWorld),o.set(0,0,1),o.applyMatrix4(i),a.dot(o)<0}})(),E=(function(){let e=new r,t=new r,n=new o,i=new r;return function(){m.matrixWorld.decompose(t,n,i),e.set(0,0,1).applyQuaternion(n).normalize(),e.negate(),S.setFromNormalAndCoplanarPoint(e,t)}})(),D=(function(){let e=new f,t=new i,n=new i;return function(r){x.matrixWorld.copy(r.matrixWorld),x.matrixWorldInverse.copy(x.matrixWorld).invert(),x.projectionMatrix.copy(r.projectionMatrix),x.far=r.far,e.copy(S),e.applyMatrix4(x.matrixWorldInverse),t.set(e.normal.x,e.normal.y,e.normal.z,e.constant);let i=x.projectionMatrix;n.x=(Math.sign(t.x)+i.elements[8])/i.elements[0],n.y=(Math.sign(t.y)+i.elements[9])/i.elements[5],n.z=-1,n.w=(1+i.elements[10])/i.elements[14],t.multiplyScalar(2/t.dot(n)),i.elements[2]=t.x,i.elements[6]=t.y,i.elements[10]=t.z+1-v,i.elements[14]=t.w}})();function O(e){C.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),C.multiply(e.projectionMatrix),C.multiply(e.matrixWorldInverse),C.multiply(m.matrixWorld)}function k(e,t,n){m.visible=!1;let r=e.getRenderTarget(),i=e.xr.enabled,a=e.shadowMap.autoUpdate;e.xr.enabled=!1,e.shadowMap.autoUpdate=!1,e.setRenderTarget(w),e.autoClear===!1&&e.clear(),e.render(t,x),e.xr.enabled=i,e.shadowMap.autoUpdate=a,e.setRenderTarget(r);let o=n.viewport;o!==void 0&&e.state.viewport(o),m.visible=!0}this.onBeforeRender=function(e,t,n){n.userData.refractor!==!0&&T(n)&&(E(),O(n),D(n),k(e,t,n))},this.getRenderTarget=function(){return w},this.dispose=function(){w.dispose(),m.material.dispose()}}};y.RefractorShader={name:`RefractorShader`,uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null}},vertexShader:`

		uniform mat4 textureMatrix;

		varying vec4 vUv;

		void main() {

			vUv = textureMatrix * vec4( position, 1.0 );
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform vec3 color;
		uniform sampler2D tDiffuse;

		varying vec4 vUv;

		float blendOverlay( float base, float blend ) {

			return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );

		}

		vec3 blendOverlay( vec3 base, vec3 blend ) {

			return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );

		}

		void main() {

			vec4 base = texture2DProj( tDiffuse, vUv );
			gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>

		}`};var b=`
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  vec2 hash22(vec2 p) {
    return vec2(
      hash21(p + vec2(17.1, 3.7)),
      hash21(p + vec2(5.3, 29.9))
    );
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    // The texture stores deterministic random lattice values. Warping the
    // fractional coordinate before hardware bilinear filtering reproduces
    // smooth value noise without inlining four hash evaluations at every one
    // of the shader's many noise call sites.
    vec2 uv = (i + f + 0.5) / NOISE_TEXTURE_SIZE;
    // A small negative bias retains resolved foam/glitter filaments while the
    // mip chain still removes sub-pixel shimmer in distant views.
    return texture2D(tNoiseMap, uv, -0.65).r;
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);

    for (int i = 0; i < 4; i++) {
      value += amplitude * valueNoise(p);
      p = rotation * p * 2.04 + 9.2;
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

  float distributionGGX(float alpha, float normalDotHalf) {
    float alphaSquared = alpha * alpha;
    float denominator = normalDotHalf * normalDotHalf * (alphaSquared - 1.0) + 1.0;
    return alphaSquared / max(WATER_PI * denominator * denominator, 0.00001);
  }

  float visibilitySmithGGXCorrelated(
    float alpha,
    float normalDotView,
    float normalDotLight
  ) {
    float alphaSquared = alpha * alpha;
    float viewTerm = normalDotLight * sqrt(
      alphaSquared + (1.0 - alphaSquared) * normalDotView * normalDotView
    );
    float lightTerm = normalDotView * sqrt(
      alphaSquared + (1.0 - alphaSquared) * normalDotLight * normalDotLight
    );
    return 0.5 / max(viewTerm + lightTerm, 0.00001);
  }

  float fresnelSchlick(float viewDotHalf) {
    const float waterF0 = 0.02037;
    float grazing = pow(1.0 - viewDotHalf, 5.0);
    return waterF0 + (1.0 - waterF0) * grazing;
  }

  void addRipple(
    vec2 p,
    vec2 direction,
    float frequency,
    float amplitude,
    float speed,
    inout vec2 gradient
  ) {
    direction = normalize(direction);
    float phase = dot(p, direction) * frequency + uTime * speed;
    gradient += direction * (amplitude * frequency * cos(phase));
  }

  float microHeight(vec2 p) {
    mat2 turn = mat2(0.78, -0.63, 0.63, 0.78);
    vec2 drift = vec2(uTime * 0.068, -uTime * 0.047);
    float broad = valueNoise(p * 1.65 + drift);
    float middle = valueNoise(turn * p * 3.7 - drift * 1.37 + 13.7);
    float detail = valueNoise(turn * p * 7.9 + drift * 1.74 - 8.4);
    mat2 counterTurn = mat2(0.58, 0.81, -0.81, 0.58);
    float fine = valueNoise(counterTurn * p * 15.8 - drift * 2.1 + 31.6);
    float sparkle = valueNoise(turn * p * 31.0 + drift * 2.8 - 21.9);
    return broad * 0.030 + middle * 0.015 + detail * 0.0065
      + fine * 0.0026 + sparkle * 0.0009;
  }

  vec2 microGradient(vec2 p, float distanceToCamera) {
    vec2 warp = vec2(
      fbm(p * 0.16 + vec2(uTime * 0.018, -uTime * 0.011)),
      fbm(p * 0.16 + vec2(17.4, -9.2) + vec2(-uTime * 0.013, uTime * 0.016))
    ) - 0.5;
    p += warp * 1.55;

    vec2 coarseGradient = vec2(0.0);
    vec2 mediumGradient = vec2(0.0);
    vec2 fineGradient = vec2(0.0);
    addRipple(p, vec2(0.86, 0.51), 1.15, 0.0240, -0.78, coarseGradient);
    addRipple(p, vec2(-0.52, 0.85), 1.78, 0.0155, 1.02, coarseGradient);
    addRipple(p, vec2(0.97, -0.24), 2.75, 0.0095, -1.46, mediumGradient);
    addRipple(p, vec2(-0.31, 0.95), 4.65, 0.0053, 1.88, mediumGradient);
    addRipple(p, vec2(0.18, -0.98), 7.9, 0.00225, -2.43, fineGradient);
    addRipple(p, vec2(0.68, 0.73), 13.2, 0.00082, 3.10, fineGradient);

    // Each spatial band has a different distance cutoff. This preserves
    // irregular chop in wide views without shrinking capillary waves into
    // repeating screen-space stripes near the horizon.
    float coarseFade = 1.0 - smoothstep(120.0, 285.0, distanceToCamera);
    float mediumFade = 1.0 - smoothstep(55.0, 175.0, distanceToCamera);
    float fineDistanceFade = 1.0 - smoothstep(20.0, 92.0, distanceToCamera);
    float footprint = max(length(dFdx(p)), length(dFdy(p)));
    float fineFootprintFade = 1.0 - smoothstep(0.025, 0.19, footprint);
    float epsilon = 0.028;
    vec2 noiseGradient = vec2(
      microHeight(p + vec2(epsilon, 0.0)) - microHeight(p - vec2(epsilon, 0.0)),
      microHeight(p + vec2(0.0, epsilon)) - microHeight(p - vec2(0.0, epsilon))
    ) / (2.0 * epsilon);
    return coarseGradient * coarseFade
      + mediumGradient * mediumFade
      + fineGradient * fineDistanceFade * fineFootprintFade
      + noiseGradient * mediumFade * fineFootprintFade;
  }

  vec3 skyReflection(vec3 direction) {
    float elevation = max(direction.y, 0.0);
    vec3 horizonColor = vec3(0.075, 0.23, 0.43);
    vec3 zenithColor = vec3(0.007, 0.045, 0.16);
    vec3 color = mix(horizonColor, zenithColor, smoothstep(0.0, 0.82, elevation));

    float cloudAngle = uTime * 0.0013;
    mat2 cloudWind = mat2(
      cos(cloudAngle), -sin(cloudAngle),
      sin(cloudAngle), cos(cloudAngle)
    );
    vec3 cloudDirection = direction;
    cloudDirection.xz = cloudWind * cloudDirection.xz;
    float cloudBody = directionalFbm(
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
    float cloud = smoothstep(0.515, 0.650, cloudBody);
    cloud *= mix(0.52, 1.0, smoothstep(0.30, 0.67, cloudErosion));
    cloud *= smoothstep(0.02, 0.16, direction.y)
      * (1.0 - smoothstep(0.88, 0.99, direction.y)) * 0.78;
    float cloudLight = clamp(dot(direction, uSunDirection) * 0.9 + 0.55, 0.0, 1.0);
    vec3 cloudColor = mix(vec3(0.20, 0.30, 0.40), vec3(0.88, 0.93, 0.96), cloudLight);
    color = mix(color, cloudColor, cloud);

    return color;
  }

  float cloudShadowMask(vec2 surfacePosition) {
    vec2 shadowUv = surfacePosition * 0.018
      + vec2(uTime * 0.0024, uTime * 0.0010);
    float broad = fbm(shadowUv) * 0.77
      + fbm(shadowUv * 2.17 - 14.3) * 0.23;
    float edge = fbm(shadowUv * 4.3 + 7.9);
    float body = smoothstep(0.50, 0.66, broad);
    return body * mix(0.64, 1.0, smoothstep(0.27, 0.68, edge));
  }

  // A low-frequency stream function produces a divergence-free displacement
  // field. Sampling it in the shared advected frame curves every foam octave
  // together, preserving material motion without a ruler-straight wake.
  vec2 foamCurlDisplacement(vec2 p) {
    vec2 waveVectorA = vec2(0.044, 0.071);
    vec2 waveVectorB = vec2(-0.081, 0.036);
    vec2 waveVectorC = vec2(0.112, -0.096);
    vec2 waveVectorD = vec2(-0.214, -0.168);
    vec2 waveVectorE = vec2(0.310, 0.082);
    float phaseA = dot(p, waveVectorA) + uTime * 0.012 + 1.4;
    float phaseB = dot(p, waveVectorB) - uTime * 0.009 - 2.7;
    float phaseC = dot(p, waveVectorC) + uTime * 0.016 + 4.1;
    float phaseD = dot(p, waveVectorD) + uTime * 0.021 + 0.8;
    float phaseE = dot(p, waveVectorE) - uTime * 0.024 - 3.5;
    vec2 curl = vec2(waveVectorA.y, -waveVectorA.x)
      * cos(phaseA) * 23.0;
    curl += vec2(waveVectorB.y, -waveVectorB.x)
      * cos(phaseB) * 12.5;
    curl += vec2(waveVectorC.y, -waveVectorC.x)
      * cos(phaseC) * 5.2;
    curl += vec2(waveVectorD.y, -waveVectorD.x)
      * cos(phaseD) * 3.7;
    curl += vec2(waveVectorE.y, -waveVectorE.x)
      * cos(phaseE) * 1.35;
    return curl;
  }

  // Foam packets are born at staggered material-space emitters and spread
  // before breaking apart. The packet state controls spatial erosion later;
  // it must never be used as a packet-wide opacity or the foam visibly fades.
  vec2 foamLifecycle(vec2 flowUv) {
    vec2 packetPosition = flowUv * vec2(0.18, 0.26);
    vec2 baseCell = floor(packetPosition);
    vec2 localPosition = fract(packetPosition);
    vec2 strongestPacket = vec2(0.0, 1.0);

    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 cellOffset = vec2(float(x), float(y));
        vec2 cellId = baseCell + cellOffset;
        vec2 seed = hash22(cellId);
        vec2 packetOffset = cellOffset + seed - localPosition;
        float packetDistance = length(packetOffset * vec2(0.72, 1.18));
        float cycle = mix(
          9.5,
          14.5,
          hash21(cellId + vec2(9.4, -3.2))
        );
        float lifetime = mix(
          4.8,
          8.0,
          hash21(cellId + vec2(-6.8, 12.7))
        );
        float age = mod(
          uTime + hash21(cellId + vec2(2.1, 18.4)) * cycle,
          cycle
        );
        float normalizedAge = age / lifetime;
        float alive = 1.0 - step(lifetime, age);
        float packetRadius = mix(
          0.46,
          0.84,
          smoothstep(0.0, 0.76, normalizedAge)
        );
        float influence = 1.0 - smoothstep(
          packetRadius * 0.54,
          packetRadius,
          packetDistance
        );
        float visibility = alive * influence;
        if (visibility > strongestPacket.x) {
          strongestPacket = vec2(
            visibility,
            clamp(normalizedAge, 0.0, 1.0)
          );
        }
      }
    }

    return strongestPacket;
  }

  // Reveal and remove small spatial fragments instead of dimming a complete
  // packet. Surviving filaments remain full strength right up to breakup.
  float foamPacketMask(vec2 lifecycle, float breakupNoise) {
    float spatialAa = max(fwidth(lifecycle.x) * 1.15, 0.012);
    float spatialMask = smoothstep(
      0.035 - spatialAa,
      0.28 + spatialAa,
      lifecycle.x
    );
    // Each fragment has its own start time and takes a substantial fraction
    // of the packet lifetime to become opaque. This reads as froth forming,
    // not a binary mask switching on.
    float birthStart = breakupNoise * 0.24;
    float born = smoothstep(
      birthStart,
      birthStart + 0.22,
      lifecycle.y
    );
    float erosionProgress = smoothstep(0.70, 1.0, lifecycle.y);
    float breakupAa = max(fwidth(breakupNoise) * 1.5, 0.035);
    float surviving = smoothstep(
      erosionProgress - breakupAa,
      erosionProgress + breakupAa,
      breakupNoise
    );
    return spatialMask * born * surviving;
  }

  float projectiveValidity(float clipW) {
    return smoothstep(0.02, 0.20, clipW);
  }
`,x=p[0],S=`
  precision highp float;

  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uHorizonColor;
  uniform float uWaterDepth;
  uniform float uUnderwater;
  uniform sampler2D tReflectionMap;
  uniform sampler2D tRefractionMap;
  uniform sampler2D tNoiseMap;

  varying vec3 vWorldPosition;
  varying vec3 vMacroNormal;
  varying vec2 vSurfacePosition;
  varying float vWaveHeight;
  varying float vWaveSlope;
  varying vec4 vReflectionCoord;
  varying vec4 vRefractionCoord;

  const float WATER_PI = 3.141592653589793;
  const vec2 FOAM_WIND_DIRECTION = vec2(
    ${x.direction.x.toFixed(8)},
    ${x.direction.y.toFixed(8)}
  );
  const float FOAM_ADVECTION_SPEED = ${x.speed.toFixed(6)};
  const float NOISE_TEXTURE_SIZE = ${512 .toFixed(1)};

${b}

void main() {
    float distanceToCamera = length(cameraPosition - vWorldPosition);
    vec2 macroGradient = -vMacroNormal.xz / max(vMacroNormal.y, 0.24);
    vec2 detailGradient = microGradient(vSurfacePosition, distanceToCamera);
    vec2 combinedGradient = macroGradient + detailGradient;
    vec3 surfaceUp = normalize(vec3(-combinedGradient.x, 1.0, -combinedGradient.y));
    // Triangle winding changes on wave slopes near the horizon. Orient the
    // interface by the camera's medium instead of gl_FrontFacing so adjacent
    // triangles cannot suddenly shade with opposite normals.
    vec3 normal = uUnderwater < 0.5 ? surfaceUp : -surfaceUp;

    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float viewFacing = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float fresnel = 0.025 + 0.975 * pow(1.0 - viewFacing, 5.0);
    vec3 reflectionDirection = reflect(-viewDirection, normal);
    reflectionDirection.y = max(reflectionDirection.y, 0.015);
    float reflectionAzimuth = dot(
      normalize(reflectionDirection.xz + vec2(0.0001)),
      normalize(uSunDirection.xz)
    ) * 0.5 + 0.5;
    float sunwardReflection = smoothstep(0.15, 0.85, reflectionAzimuth);

    float waterColumn = uWaterDepth / max(viewFacing, 0.28);
    float opticalDepth = 1.0 - exp(-waterColumn * 0.052);
    opticalDepth = clamp(
      opticalDepth + smoothstep(100.0, 210.0, distanceToCamera) * 0.12,
      0.0,
      1.0
    );
    float depthVariation = fbm(
      vSurfacePosition * 0.075 + vec2(uTime * 0.012, -uTime * 0.008)
    );
    float secondaryVariation = fbm(vSurfacePosition * 0.17 + vec2(-11.0, 7.0));
    float clearPatch = smoothstep(0.32, 0.72,
      depthVariation * 0.72 + secondaryVariation * 0.28);
    float nearField = 1.0 - smoothstep(18.0, 115.0, distanceToCamera);
    float shallowMix = clamp(
      (1.0 - opticalDepth) * 0.42 + clearPatch * nearField * 0.20,
      0.0,
      0.76
    );
    vec3 waterBody = mix(uDeepColor, uShallowColor, shallowMix);
    waterBody *= mix(0.93, 1.03, secondaryVariation);
    float cloudShadow = cloudShadowMask(vSurfacePosition);
    waterBody *= mix(1.0, 0.72, cloudShadow * (0.42 + nearField * 0.30));

    float facingLight = max(dot(surfaceUp, uSunDirection), 0.0);
    waterBody += vec3(0.00, 0.065, 0.075) * pow(facingLight, 2.0) * nearField;

    vec3 reflectedSky = skyReflection(normalize(reflectionDirection));
    float detailSlope = length(detailGradient);
    float facetReflection = smoothstep(0.035, 0.16, detailSlope);
    float reflectionMix = clamp(
      0.085 + fresnel * 0.89 + facetReflection * nearField * 0.045,
      0.0,
      0.97
    );
    vec2 reflectionUv = vReflectionCoord.xy / max(vReflectionCoord.w, 0.001);
    vec2 refractionUv = vRefractionCoord.xy / max(vRefractionCoord.w, 0.001);
    float distortionStrength = mix(0.0025, 0.0080, viewFacing);
    vec2 reflectionSampleUv = reflectionUv + combinedGradient * distortionStrength;
    vec2 refractionSampleUv = refractionUv - combinedGradient * distortionStrength * 0.72;
    float reflectionCaptureFade = projectiveValidity(vReflectionCoord.w);
    float refractionCaptureFade = projectiveValidity(vRefractionCoord.w);
    vec3 reflectedCapture = texture2D(
      tReflectionMap,
      clamp(reflectionSampleUv, vec2(0.003), vec2(0.997))
    ).rgb;
    vec3 refractedCapture = texture2D(
      tRefractionMap,
      clamp(refractionSampleUv, vec2(0.003), vec2(0.997))
    ).rgb;
    vec3 reflectedScene = mix(reflectedSky, reflectedCapture, reflectionCaptureFade);
    vec3 refractedScene = mix(waterBody, refractedCapture, refractionCaptureFade);
    vec3 transmissionTint = mix(
      vec3(0.58, 0.88, 0.82),
      vec3(0.20, 0.45, 0.52),
      opticalDepth
    );
    float columnTransmittance = exp(-waterColumn * 0.045);
    float transmissionAmount = mix(0.40, 0.52, clearPatch) * columnTransmittance;
    transmissionAmount *= 0.50 + nearField * 0.50;
    vec3 sceneTransmission = mix(
      waterBody,
      refractedScene * transmissionTint,
      clamp(transmissionAmount, 0.0, 0.66)
    );
    // The capture preserves nearby object reflections; the procedural sky
    // path responds to the full fragment normal and therefore breaks cloud
    // silhouettes into the smaller facets seen on a choppy surface.
    vec3 sceneReflection = mix(reflectedSky, reflectedScene, 0.48);
    vec3 directionalReflectionTint = mix(
      vec3(0.30, 0.50, 0.68),
      vec3(0.62, 0.76, 0.84),
      sunwardReflection
    );
    sceneReflection *= directionalReflectionTint * mix(0.74, 1.0, secondaryVariation);
    sceneReflection = mix(sceneReflection, uDeepColor, 0.08);
    vec3 surfaceColor = mix(sceneTransmission, sceneReflection, reflectionMix);
    surfaceColor *= mix(1.0, 0.84, cloudShadow * (1.0 - fresnel) * 0.72);
    float localFacetLight = smoothstep(
      -0.06,
      0.32,
      dot(surfaceUp, uSunDirection)
    );
    surfaceColor *= mix(0.92, 1.055, localFacetLight * nearField);

    float distanceHue = smoothstep(24.0, 138.0, distanceToCamera);
    vec3 nearWaterGrade = surfaceColor * vec3(0.74, 1.10, 1.06);
    nearWaterGrade += vec3(0.0, 0.032, 0.036) * nearField * clearPatch;
    vec3 farWaterGrade = surfaceColor * vec3(0.68, 0.84, 1.12);
    surfaceColor = mix(nearWaterGrade, farWaterGrade, distanceHue);

    // Thin, wind-sculpted crests transmit cyan light before they fully break.
    // The back-light term makes the effect strongest while looking toward the
    // sun, while a smaller grazing component keeps off-axis crests readable.
    float crestTransmission = smoothstep(
      0.12,
      0.72,
      vWaveHeight + min(vWaveSlope, 0.42) * 0.24
    );
    float backLighting = pow(max(dot(-viewDirection, uSunDirection), 0.0), 2.4);
    float crestRim = pow(1.0 - viewFacing, 1.35);
    surfaceColor += vec3(0.008, 0.20, 0.19)
      * crestTransmission * crestRim * (0.24 + backLighting * 0.76);

    vec3 halfVector = normalize(viewDirection + uSunDirection);
    float normalDotView = max(dot(surfaceUp, viewDirection), 0.001);
    float normalDotLight = max(dot(surfaceUp, uSunDirection), 0.001);
    float normalDotHalf = max(dot(surfaceUp, halfVector), 0.0);
    float viewDotHalf = max(dot(viewDirection, halfVector), 0.0);
    vec3 normalDx = dFdx(surfaceUp);
    vec3 normalDy = dFdy(surfaceUp);
    float normalVariance = max(dot(normalDx, normalDx), dot(normalDy, normalDy));
    float baseRoughness = mix(
      0.040,
      0.105,
      smoothstep(22.0, 155.0, distanceToCamera)
    );
    // Screen-space variance widens only sub-pixel highlights. This preserves
    // small glints nearby without letting distant normals shimmer or pixelate.
    float microfacetAlpha = clamp(
      baseRoughness * baseRoughness + min(normalVariance * 0.32, 0.055),
      0.0012,
      0.052
    );
    float distribution = distributionGGX(microfacetAlpha, normalDotHalf);
    float visibility = visibilitySmithGGXCorrelated(
      microfacetAlpha,
      normalDotView,
      normalDotLight
    );
    float sunFresnel = fresnelSchlick(viewDotHalf);
    float sunSpecular = distribution * visibility * sunFresnel * normalDotLight;
    sunSpecular = sunSpecular / (1.0 + sunSpecular);
    sunSpecular = pow(sunSpecular, 1.22);

    // A wind-roughened ocean reflects the sun from a distribution of small
    // facet slopes rather than as one continuous mirror column. A wider GGX
    // lobe locates the glitter field; advected multi-scale occupancy breaks
    // it into resolved flashes without screen-space pixel noise.
    float broadAlpha = clamp(
      microfacetAlpha * 2.7 + 0.010,
      0.014,
      0.088
    );
    float broadDistribution = distributionGGX(broadAlpha, normalDotHalf);
    float broadVisibility = visibilitySmithGGXCorrelated(
      broadAlpha,
      normalDotView,
      normalDotLight
    );
    float broadSpecular = broadDistribution * broadVisibility
      * sunFresnel * normalDotLight;
    broadSpecular = broadSpecular / (1.0 + broadSpecular);

    vec2 glitterWind = normalize(FOAM_WIND_DIRECTION);
    vec2 glitterCross = vec2(-glitterWind.y, glitterWind.x);
    vec2 glitterPosition = vSurfacePosition
      - glitterWind * (uTime * 0.31)
      + glitterCross * (uTime * 0.047)
      + combinedGradient * 0.16;
    vec2 glitterUv = vec2(
      dot(glitterPosition, glitterWind) * 0.72,
      dot(glitterPosition, glitterCross) * 1.58
    );
    mat2 glitterTurn = mat2(0.61, -0.79, 0.79, 0.61);
    float glitterNoise = valueNoise(glitterUv * 2.5 + vec2(7.3, -4.8)) * 0.26;
    glitterNoise += valueNoise(
      glitterTurn * glitterUv * 8.8 + vec2(-13.2, 19.6)
    ) * 0.47;
    glitterNoise += valueNoise(
      glitterTurn * glitterUv * 21.5 + vec2(31.7, -9.1)
    ) * 0.27;
    float glitterAa = max(fwidth(glitterNoise) * 1.45, 0.022);
    float glitterOccupancy = smoothstep(
      0.50 - glitterAa,
      0.69 + glitterAa,
      glitterNoise
    );
    float glitterSparkles = smoothstep(
      0.67 - glitterAa,
      0.83 + glitterAa,
      glitterNoise
    );
    float resolvedGlitter = 1.0 - smoothstep(62.0, 175.0, distanceToCamera);
    glitterOccupancy = mix(0.18, glitterOccupancy, resolvedGlitter);
    float glitterEnergy = sunSpecular * mix(0.04, 0.92, glitterOccupancy);
    glitterEnergy += broadSpecular
      * (glitterOccupancy * 0.28 + glitterSparkles * 0.72) * 0.92;
    surfaceColor += vec3(1.0, 0.84, 0.61) * glitterEnergy * 2.85;

    // Foam is locked to the displaced crest field, then eroded into narrow
    // porous ribbons. It cannot float independently of a wave, while the two
    // noise scales prevent broad solid-white patches.
    vec2 windDirection = normalize(FOAM_WIND_DIRECTION);
    vec2 crestDirection = vec2(-windDirection.y, windDirection.x);
    // Keep every foam octave in one advected coordinate frame. Independent
    // time offsets make the mask morph in place while a crest passes through,
    // which reads as a scan-line reveal instead of surface transport.
    vec2 advectedFoamPosition = vSurfacePosition
      - windDirection * (uTime * FOAM_ADVECTION_SPEED)
      - crestDirection * (uTime * 0.026);
    float foamAlong = dot(advectedFoamPosition, windDirection);
    float foamAcross = dot(advectedFoamPosition, crestDirection);
    // Breaking happens in broad wind patches, not on every eligible crest.
    // These cells are deliberately much longer across a wave front than in
    // its travel direction, so the active regions read as interrupted swell
    // systems rather than a repeating checkerboard of identical white rows.
    float breakingZoneA = sin(
      foamAlong * 0.024 + foamAcross * 0.010 + 4.3
    );
    float breakingZoneB = sin(
      foamAlong * 0.047 - foamAcross * 0.017 - 11.6
    );
    float breakingZoneC = sin(
      foamAlong * 0.013 + foamAcross * 0.029 + 17.2
    );
    float breakingZoneField = 0.50 + breakingZoneA * 0.24
      + breakingZoneA * breakingZoneB * 0.15 + breakingZoneC * 0.11;
    float breakingZone = smoothstep(0.36, 0.64, breakingZoneField);
    float foamWarp = fbm(
      advectedFoamPosition * 0.105 + vec2(4.7, -2.9)
    ) - 0.5;
    vec2 foamCoordinates = advectedFoamPosition
      + foamCurlDisplacement(advectedFoamPosition)
      + vec2(foamWarp * 1.15, foamWarp * -0.72)
      + macroGradient * 0.72;
    vec2 foamUv = vec2(
      dot(foamCoordinates, windDirection) * 1.55,
      dot(foamCoordinates, crestDirection) * 0.72
    );
    mat2 foamTurn = mat2(0.73, -0.68, 0.68, 0.73);
    float foamContour = fbm(foamUv * 2.15 + vec2(3.4, -6.2));
    float contourDistance = abs(foamContour - 0.565);
    float contourAntialias = max(fwidth(foamContour) * 1.35, 0.006);
    float filaments = 1.0 - smoothstep(
      0.018 + contourAntialias,
      0.064 + contourAntialias,
      contourDistance
    );
    float tornMask = smoothstep(0.37, 0.62,
      fbm(foamTurn * foamUv * 4.15 + vec2(-7.6, 2.8)));
    float foamMicro = valueNoise(
      foamTurn * foamUv * 13.8 + vec2(19.4, -11.7)
    );
    vec2 lifecycleA = foamLifecycle(foamUv);
    vec2 turnoverUv = foamTurn * foamUv + vec2(31.7, -18.2);
    vec2 lifecycleB = foamLifecycle(turnoverUv);
    float breakupNoiseA = mix(
      valueNoise(foamUv * 5.6 + vec2(-9.4, 17.3)),
      valueNoise(foamTurn * foamUv * 13.1 + vec2(23.8, -4.7)),
      0.32
    );
    float breakupNoiseB = mix(
      valueNoise(turnoverUv * 6.2 + vec2(14.6, 8.1)),
      valueNoise(foamTurn * turnoverUv * 14.7 + vec2(-6.3, 28.5)),
      0.30
    );
    float lifecycleMask = max(
      foamPacketMask(lifecycleA, breakupNoiseA),
      foamPacketMask(lifecycleB, breakupNoiseB)
    );
    float edgeBreakup = smoothstep(0.32, 0.58, foamMicro);
    float flecks = smoothstep(0.78, 0.91, foamMicro) * 0.18;
    float porousRibbon = max(
      filaments * tornMask * edgeBreakup,
      flecks * tornMask
    );
    vec2 streakUv = vec2(foamUv.x * 0.44, foamUv.y * 1.72);
    float streakContour = fbm(streakUv * 1.32 + vec2(-5.1, 9.3));
    float streakDistance = abs(streakContour - 0.555);
    float streakAa = max(fwidth(streakContour) * 1.4, 0.005);
    float longFilaments = 1.0 - smoothstep(
      0.020 + streakAa,
      0.067 + streakAa,
      streakDistance
    );
    float streakBreakup = smoothstep(0.35, 0.61,
      fbm(foamTurn * streakUv * 3.7 + vec2(11.2, -3.6)));
    float streakContinuity = smoothstep(0.30, 0.61, fbm(
      vec2(streakUv.x * 0.24, streakUv.y * 0.43) + vec2(-2.8, 7.6)
    ));
    float curvedStreaks = longFilaments * streakBreakup
      * mix(0.16, 1.0, streakContinuity);

    // A weaker crossing family follows the same flow but prevents every
    // remnant from sharing one heading. Its broad blend avoids a second grid.
    mat2 crossTurn = mat2(0.94, -0.34, 0.34, 0.94);
    vec2 crossingUv = crossTurn * streakUv;
    float crossingContour = fbm(
      vec2(crossingUv.x * 0.42, crossingUv.y * 1.35) + vec2(6.7, -10.4)
    );
    float crossingAa = max(fwidth(crossingContour) * 1.35, 0.005);
    float crossingFilaments = 1.0 - smoothstep(
      0.021 + crossingAa,
      0.070 + crossingAa,
      abs(crossingContour - 0.56)
    );
    float crossingBreakup = smoothstep(0.38, 0.64, fbm(
      crossingUv * 3.1 + vec2(-13.2, 4.8)
    ));
    porousRibbon = max(
      porousRibbon,
      curvedStreaks * 0.58 + crossingFilaments * crossingBreakup * 0.22
    );

    float foamThreshold = mix(0.075, 0.170,
      valueNoise(advectedFoamPosition * 0.21 + vec2(8.7, -4.1)));
    float crestSignal = vWaveHeight + min(vWaveSlope, 0.34) * 0.18;
    float breakingEnergy = smoothstep(
      foamThreshold - 0.15,
      foamThreshold + 0.21,
      crestSignal
    );
    float formationVariation = mix(0.74, 1.08,
      fbm(advectedFoamPosition * 0.84 + vec2(-3.8, 12.1)));
    float breakingZoneGain = mix(0.22, 1.35, breakingZone);
    float crestFoam = breakingEnergy * mix(breakingEnergy, 1.0, 0.22)
      * formationVariation * breakingZoneGain;
    float breakingFace = mix(0.58, 1.0, smoothstep(0.075, 0.24, vWaveSlope));
    float foam = crestFoam * (porousRibbon + flecks * 0.18) * breakingFace;
    foam *= lifecycleMask;
    foam *= 1.0 - smoothstep(105.0, 220.0, distanceToCamera) * 0.36;
    float foamBlend = foam * mix(0.34, 0.60, viewFacing);
    surfaceColor = mix(surfaceColor, vec3(0.76, 0.87, 0.85), foamBlend);

    float horizonFade = smoothstep(105.0, 205.0, distanceToCamera);
    float horizonAbsorption = mix(0.78, 0.52, sunwardReflection);
    surfaceColor = mix(surfaceColor, uHorizonColor, horizonFade * horizonAbsorption);

    vec3 transmissionDirection = refract(-viewDirection, normal, 1.333);
    float transmissionAvailable = smoothstep(0.001, 0.08, length(transmissionDirection));
    vec3 transmissionSky = skyReflection(normalize(transmissionDirection + vec3(0.0, 0.0001, 0.0)));
    float ceilingTexture = smoothstep(0.42, 0.83,
      fbm(vSurfacePosition * 0.46 + vec2(uTime * 0.045, -uTime * 0.032)));
    vec3 underDeep = vec3(0.0015, 0.035, 0.060);
    vec3 underLit = vec3(0.008, 0.22, 0.27);
    vec3 underwaterColor = mix(underDeep, underLit, 0.22 + viewFacing * 0.72);
    underwaterColor += vec3(0.025, 0.16, 0.17) * ceilingTexture * viewFacing;
    underwaterColor = mix(
      underwaterColor,
      transmissionSky * vec3(0.42, 0.78, 0.75),
      transmissionAvailable * viewFacing * 0.48
    );
    float underwaterFog = 1.0 - exp(-distanceToCamera * 0.034);
    underwaterColor = mix(underwaterColor, underDeep, underwaterFog * 0.70);

    vec3 color = mix(surfaceColor, underwaterColor, uUnderwater);
    float grain = hash21(gl_FragCoord.xy + uTime * 17.0) - 0.5;
    color += grain / 420.0;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`,C=m.map((e,t)=>`
    addDomainWarp(
      basePosition,
      vec2(${e.waveVector.x.toFixed(8)}, ${e.waveVector.y.toFixed(8)}),
      domainTurn * vec2(
        ${e.displacement.x.toFixed(8)},
        ${e.displacement.y.toFixed(8)}
      ),
      ${e.speed.toFixed(6)},
      ${e.phase.toFixed(6)} + phaseBias * ${(.73+t*.58).toFixed(6)},
      warpedPosition,
      derivativeX,
      derivativeZ
    );
`).join(``),w=h.map((e,t)=>`
    addEnergyWave(
      basePosition,
      vec2(${e.waveVector.x.toFixed(8)}, ${e.waveVector.y.toFixed(8)}),
      ${e.amplitude.toFixed(6)},
      ${e.speed.toFixed(6)},
      ${e.phase.toFixed(6)} + phaseBias * ${(1.11+t*.47).toFixed(6)},
      energy,
      energyGradient
    );
`).join(``),T=g.map((e,t)=>{let n=Math.cos(e.rotation),r=Math.sin(e.rotation);return`
    vec2 wavePosition${t};
    vec2 domainDerivativeX${t};
    vec2 domainDerivativeZ${t};
    float domainEnergy${t};
    vec2 domainEnergyGradient${t};
    sampleOceanDomain(
      basePosition,
      ${e.phaseBias.toFixed(6)},
      mat2(
        ${n.toFixed(8)}, ${r.toFixed(8)},
        ${(-r).toFixed(8)}, ${n.toFixed(8)}
      ),
      wavePosition${t},
      domainDerivativeX${t},
      domainDerivativeZ${t},
      domainEnergy${t},
      domainEnergyGradient${t}
    );
`}).join(``),E=g.map((e,t)=>`wavePosition${t}`).join(` + `),D=`
  precision highp float;

  uniform float uTime;
  uniform mat4 uReflectionTextureMatrix;
  uniform mat4 uRefractionTextureMatrix;

  varying vec3 vWorldPosition;
  varying vec3 vMacroNormal;
  varying vec2 vSurfacePosition;
  varying float vWaveHeight;
  varying float vWaveSlope;
  varying vec4 vReflectionCoord;
  varying vec4 vRefractionCoord;

  const float PI = 3.141592653589793;

  void addDomainWarp(
    vec2 basePosition,
    vec2 waveVector,
    vec2 displacement,
    float speed,
    float phaseOffset,
    inout vec2 warpedPosition,
    inout vec2 derivativeX,
    inout vec2 derivativeZ
  ) {
    float phase = dot(basePosition, waveVector) - uTime * speed + phaseOffset;
    float sine = sin(phase);
    vec2 derivative = displacement * cos(phase);
    warpedPosition += displacement * sine;
    derivativeX += derivative * waveVector.x;
    derivativeZ += derivative * waveVector.y;
  }

  void addEnergyWave(
    vec2 basePosition,
    vec2 waveVector,
    float amplitude,
    float speed,
    float phaseOffset,
    inout float energy,
    inout vec2 energyGradient
  ) {
    float phase = dot(basePosition, waveVector) - uTime * speed + phaseOffset;
    energy += amplitude * sin(phase);
    energyGradient += amplitude * cos(phase) * waveVector;
  }

  void sampleOceanDomain(
    vec2 basePosition,
    float phaseBias,
    mat2 domainTurn,
    out vec2 warpedPosition,
    out vec2 derivativeX,
    out vec2 derivativeZ,
    out float energy,
    out vec2 energyGradient
  ) {
    warpedPosition = basePosition;
    derivativeX = vec2(1.0, 0.0);
    derivativeZ = vec2(0.0, 1.0);
    energy = 0.82;
    energyGradient = vec2(0.0);

${C}
${w}
  }

  void addWave(
    vec2 wavePosition,
    vec2 domainDerivativeX,
    vec2 domainDerivativeZ,
    float domainEnergy,
    vec2 domainEnergyGradient,
    vec2 direction,
    float steepness,
    float wavelength,
    float speed,
    float phaseOffset,
    float bendFrequency,
    float bendStrength,
    float packetFrequency,
    float packetStrength,
    float crestSharpness,
    float lodStart,
    float lodEnd,
    float cameraDistance,
    inout vec3 displaced,
    inout vec2 gradient
  ) {
    direction = normalize(direction);
    vec2 perpendicular = vec2(-direction.y, direction.x);
    float along = dot(direction, wavePosition);
    float across = dot(perpendicular, wavePosition);
    vec2 alongGradient = vec2(
      dot(direction, domainDerivativeX),
      dot(direction, domainDerivativeZ)
    );
    vec2 acrossGradient = vec2(
      dot(perpendicular, domainDerivativeX),
      dot(perpendicular, domainDerivativeZ)
    );

    float bendPhase = across * bendFrequency + phaseOffset * 1.71 - uTime * 0.055;
    float secondaryBendPhase = across * bendFrequency * 2.13
      - phaseOffset * 0.73 + uTime * 0.035;
    float bend = (
      sin(bendPhase) + sin(secondaryBendPhase) * 0.27
    ) * bendStrength;

    float packetPhase = (along * 0.34 + across) * packetFrequency
      + phaseOffset * 2.07;
    float secondaryPacketPhase = (along * -0.18 + across * 1.83)
      * packetFrequency - phaseOffset * 1.31;
    float packetEnvelope = 1.0 + packetStrength * (
      sin(packetPhase) * 0.68 + sin(secondaryPacketPhase) * 0.32
    );
    float envelope = packetEnvelope * domainEnergy;

    float waveNumber = 2.0 * PI / wavelength;
    float lod = 1.0 - smoothstep(lodStart, lodEnd, cameraDistance);
    float amplitude = steepness / waveNumber * lod;
    float phase = waveNumber * (along + bend - speed * uTime) + phaseOffset;
    float sine = sin(phase);
    float cosine = cos(phase);
    float shapedHeight = sine - crestSharpness * cos(phase * 2.0);
    float shapedDerivative = cosine + crestSharpness * 2.0 * sin(phase * 2.0);

    float bendDerivative = (
      cos(bendPhase) * bendFrequency
      + cos(secondaryBendPhase) * bendFrequency * 2.13 * 0.27
    ) * bendStrength;
    vec2 phaseGradient = waveNumber * (
      alongGradient + acrossGradient * bendDerivative
    );
    vec2 packetGradient = packetStrength * (
      cos(packetPhase) * 0.68 * packetFrequency
        * (alongGradient * 0.34 + acrossGradient)
      + cos(secondaryPacketPhase) * 0.32 * packetFrequency
        * (alongGradient * -0.18 + acrossGradient * 1.83)
    );
    vec2 envelopeGradient = packetGradient * domainEnergy
      + packetEnvelope * domainEnergyGradient;

    displaced.xz += direction * (amplitude * envelope * cosine);
    displaced.y += amplitude * envelope * shapedHeight;
    gradient += amplitude * (
      envelopeGradient * shapedHeight
      + envelope * shapedDerivative * phaseGradient
    );
  }

  void main() {
    vec3 displaced = position;
    vec2 basePosition = position.xz;
    vec2 gradient = vec2(0.0);
    vec3 meanWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    float cameraDistance = length(cameraPosition - meanWorldPosition);

${T}

${p.map((e,t)=>{let n=t%g.length;return`
    addWave(
      wavePosition${n},
      domainDerivativeX${n},
      domainDerivativeZ${n},
      domainEnergy${n},
      domainEnergyGradient${n},
      vec2(${e.direction.x.toFixed(8)}, ${e.direction.y.toFixed(8)}),
      ${e.steepness.toFixed(6)},
      ${e.wavelength.toFixed(6)},
      ${e.speed.toFixed(6)},
      ${e.phase.toFixed(6)},
      ${e.bendFrequency.toFixed(6)},
      ${e.bendStrength.toFixed(6)},
      ${e.packetFrequency.toFixed(6)},
      ${e.packetStrength.toFixed(6)},
      ${e.crestSharpness.toFixed(6)},
      ${e.lodStart.toFixed(6)},
      ${e.lodEnd.toFixed(6)},
      cameraDistance,
      displaced,
      gradient
    );
`}).join(``)}

    vec3 localNormal = normalize(vec3(-gradient.x, 1.0, -gradient.y));
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vec4 opticalPlanePosition = modelMatrix * vec4(position, 1.0);

    vWorldPosition = worldPosition.xyz;
    vMacroNormal = normalize(normalMatrix * localNormal);
    vSurfacePosition = (${E})
      / ${g.length.toFixed(1)};
    vWaveHeight = displaced.y;
    vWaveSlope = length(gradient);
    // The render captures are clipped against the mean water plane. Project
    // that same plane into each capture; projecting displaced crests makes the
    // homogeneous coordinate cross zero at grazing angles and exposes whole
    // triangles of invalid texture data.
    vReflectionCoord = uReflectionTextureMatrix * opticalPlanePosition;
    vRefractionCoord = uRefractionTextureMatrix * opticalPlanePosition;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;function O({renderer:n,scene:r,camera:i,sunDirection:a,sky:o,sun:s,captureResolution:d=window.innerWidth<720?512:768,surfaceSegments:f=window.innerWidth<720?210:300}){let p=_(),m={uTime:{value:0},uSunDirection:{value:a},uDeepColor:{value:new l(`#021725`)},uShallowColor:{value:new l(`#08b4b8`)},uHorizonColor:{value:new l(`#0b344c`)},uWaterDepth:{value:3.55},uUnderwater:{value:0},uReflectionTextureMatrix:{value:new e},uRefractionTextureMatrix:{value:new e},tReflectionMap:{value:null},tRefractionMap:{value:null},tNoiseMap:{value:p}},h=new c({uniforms:m,side:2,transparent:!1,depthWrite:!0,vertexShader:D,fragmentShader:S}),g=new u(420,420,f,f);g.rotateX(-Math.PI/2);let b=new t(g,h);b.frustumCulled=!1,b.renderOrder=5,r.add(b);let x=new u(420,420),C=new v(x,{textureWidth:d,textureHeight:d,clipBias:.0025,multisample:0}),w=new y(x,{textureWidth:d,textureHeight:d,clipBias:.0025,multisample:0});C.rotation.x=-Math.PI/2,w.rotation.x=-Math.PI/2,C.updateMatrixWorld(!0),w.updateMatrixWorld(!0),m.tReflectionMap.value=C.getRenderTarget().texture,m.tRefractionMap.value=w.getRenderTarget().texture;let T=new e,E=new e,O=d;function k(){T.copy(C.matrixWorld).invert(),m.uReflectionTextureMatrix.value.copy(C.material.uniforms.textureMatrix.value).multiply(T)}function A(){E.copy(w.matrixWorld).invert(),m.uRefractionTextureMatrix.value.copy(w.material.uniforms.textureMatrix.value).multiply(E)}function j(e){i.updateMatrixWorld(),b.updateMatrixWorld();let t=b.visible,n=s.visible,r=o.uniforms.uSunVisibility.value,a=e.map(e=>e.visible);return b.visible=!1,s.visible=!1,o.uniforms.uSunVisibility.value=0,e.forEach(e=>{e.visible=!1}),()=>{b.visible=t,s.visible=n,o.uniforms.uSunVisibility.value=r,e.forEach((e,t)=>{e.visible=a[t]})}}function M(e,t){let n=j(e);try{t()}finally{n()}}function N(e=[]){let t=j(e),a=n.getRenderTarget();try{return n.setRenderTarget(C.getRenderTarget()),n.compileAsync(r,C.getReflectionCamera(i))}finally{n.setRenderTarget(a),t()}}function P(e=[]){M(e,()=>{C.onBeforeRender(n,r,i),k()})}function F(e=[]){M(e,()=>{w.onBeforeRender(n,r,i),A()})}function I(e=[]){M(e,()=>{C.onBeforeRender(n,r,i),k(),w.onBeforeRender(n,r,i),A()})}return{mesh:b,uniforms:m,usesManualCaptures:!0,compileCaptures:N,renderReflectionCapture:P,renderRefractionCapture:F,renderCaptures:I,setCaptureResolution(e){let t=Math.max(256,Math.round(e));t!==O&&(O=t,C.getRenderTarget().setSize(t,t),w.getRenderTarget().setSize(t,t))},getDiagnostics(){let e=C.getRenderTarget(),t=w.getRenderTarget();return{captureResolution:O,reflectionSize:[e.width,e.height],refractionSize:[t.width,t.height],surfaceSegments:f,captureStrategy:`reflector-refractor`}},update(e,t){m.uTime.value=e,m.uUnderwater.value=t}}}export{O as createOcean};