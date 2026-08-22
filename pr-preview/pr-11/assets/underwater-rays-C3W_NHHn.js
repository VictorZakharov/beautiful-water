import{$t as e,Hr as t,It as n,Mt as r,Ur as i,dr as a,fr as o,nn as s}from"./three.core-BoMSk3Jx.js";function c(e,t,n){let i=r.clamp((n-e)/(t-e),0,1);return i*i*(3-2*i)}function l(r){let l={uTime:{value:0},uStrength:{value:0},uSunPosition:{value:new t(.5,1.2)},uAspect:{value:1}},u=new o({uniforms:l,transparent:!0,depthTest:!1,depthWrite:!1,toneMapped:!1,blending:1,vertexShader:`
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,fragmentShader:`
      precision highp float;

      uniform float uTime;
      uniform float uStrength;
      uniform vec2 uSunPosition;
      uniform float uAspect;
      varying vec2 vUv;

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
        mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);
        for (int octave = 0; octave < 4; octave++) {
          value += valueNoise(p) * amplitude;
          p = turn * p * 2.03 + 7.1;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 delta = vUv - uSunPosition;
        delta.x *= uAspect;
        float radius = length(delta);
        float angle = atan(delta.y, delta.x);

        float warp = fbm(vec2(angle * 6.5, radius * 1.8 - uTime * 0.012));
        float finePhase = angle * 57.0 + warp * 6.2;
        float broadPhase = angle * 23.0 - warp * 3.4;
        float fineRays = pow(0.5 + 0.5 * cos(finePhase), 10.0);
        float broadRays = pow(0.5 + 0.5 * cos(broadPhase), 7.0);
        float rayDensity = fineRays * 0.62 + broadRays * 0.38;

        float radialEnvelope = 1.0 - smoothstep(0.06, 1.75, radius);
        float originFade = smoothstep(0.035, 0.16, radius);
        float breakup = 0.42 + fbm(vec2(angle * 3.1, radius * 4.2 + uTime * 0.009)) * 0.58;
        float alpha = rayDensity * radialEnvelope * originFade * breakup;
        alpha *= uStrength * 0.095;

        vec3 color = mix(
          vec3(0.035, 0.24, 0.25),
          vec3(0.10, 0.47, 0.45),
          rayDensity
        );
        float dither = (hash21(gl_FragCoord.xy + uTime * 13.0) - 0.5) / 255.0;
        gl_FragColor = vec4(color + dither, alpha);
        #include <colorspace_fragment>
      }
    `}),d=new a,f=new e(-1,1,1,-1,0,1),p=new n(new s(2,2),u);p.frustumCulled=!1,d.add(p);let m=new t(r.x,r.z).multiplyScalar(1/1.333),h=new i(m.x,Math.sqrt(Math.max(1-m.lengthSq(),.001)),m.y).normalize(),g=new i,_=new i;return{resize(e,t){l.uAspect.value=e/Math.max(t,1)},update(e,t,n){n.getWorldDirection(_);let r=c(-.08,.55,_.dot(h));g.copy(n.position).addScaledVector(h,60).project(n),l.uSunPosition.value.set(g.x*.5+.5,g.y*.5+.5),l.uTime.value=e,l.uStrength.value=t*r},render(e){if(l.uStrength.value<.002)return;let t=e.autoClear;e.autoClear=!1,e.render(d,f),e.autoClear=t}}}export{l as createUnderwaterRays};