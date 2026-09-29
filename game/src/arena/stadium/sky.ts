import * as THREE from 'three';
import { HASH_GLSL, type Disposer } from './util';

export interface SkyResult {
  mesh: THREE.Mesh;
  update(time: number): void;
}

/**
 * Night sky drawn as a camera-centred sphere (radius follows camera.far) that never writes depth and
 * renders first (renderOrder -1000). Everything is procedural in the fragment shader.
 */
export function buildSky(moonDir: THREE.Vector3, townDir: THREE.Vector3, starDensity: number, disposer: Disposer): SkyResult {
  const geo = new THREE.SphereGeometry(1, 48, 24);
  disposer.add(geo);
  const md = moonDir.clone().normalize();
  const helper = Math.abs(md.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const t1 = new THREE.Vector3().crossVectors(md, helper).normalize();
  const t2 = new THREE.Vector3().crossVectors(t1, md).normalize();
  const uniforms = {
    uMoonT1: { value: t1 },
    uMoonT2: { value: t2 },
    uRadius: { value: 800 },
    uTime: { value: 0 },
    uMoonDir: { value: moonDir.clone().normalize() },
    uTownDir: { value: townDir.clone().setY(0).normalize() },
    uStarDensity: { value: starDensity },
    uCloud: { value: 1.0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uRadius;
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec3 wp = cameraPosition + position * uRadius;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uMoonDir;
      uniform vec3 uMoonT1;
      uniform vec3 uMoonT2;
      uniform vec3 uTownDir;
      uniform float uStarDensity;
      uniform float uCloud;
      varying vec3 vDir;
      ${HASH_GLSL}
      float fbm2(vec2 p) {
        float a = 0.5, s = 0.0;
        for (int i = 0; i < 5; i++) { s += a * sNoise2(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; }
        return s;
      }
      // stars on the 6 faces of a cube map (2D cells => no clipped stars)
      vec3 starLayer(vec3 d, float scale, float density, float pixAng, float seed) {
        vec3 a = abs(d);
        vec2 uv; float face;
        if (a.x > a.y && a.x > a.z) { uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
        else if (a.y > a.z) { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
        else { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
        vec2 g = uv * scale;
        vec2 cell = floor(g);
        vec2 f = fract(g);
        vec2 key = cell + vec2(face * 157.0 + seed, face * 311.0 - seed);
        float h = sHash12(key);
        if (h > density) return vec3(0.0);
        vec2 sp = 0.25 + 0.5 * vec2(sHash12(key + 19.19), sHash12(key + 47.3));
        float dist = length(f - sp);
        float pix = pixAng * scale;
        float rad = max(pix * 0.62, 0.03);
        float b = exp(-(dist * dist) / (rad * rad));
        float mag = sHash12(key + 7.7);
        float bright = 0.05 + mag * mag * mag * mag * mag * mag * mag * mag * 1.4;
        float tw = 0.78 + 0.22 * sin(uTime * (1.7 + 5.0 * mag) + h * 300.0);
        vec3 tint = mix(vec3(1.0, 0.82, 0.66), vec3(0.72, 0.83, 1.0), sHash12(key + 3.3));
        return tint * b * bright * tw;
      }
      void main() {
        vec3 d = normalize(vDir);
        float pixAng = length(fwidth(d));
        float el = d.y;
        float elp = max(el, 0.0);
        vec2 hd = normalize(d.xz + vec2(1e-5));
        float townAz = max(0.0, dot(hd, normalize(uTownDir.xz)));
        float az = atan(d.z, abs(d.x) + abs(d.z) < 1e-6 ? 1.0 : d.x);

        // base gradient (linear HDR values, deliberately dark)
        vec3 zen = vec3(0.0022, 0.0045, 0.020);
        vec3 mid = vec3(0.0045, 0.011, 0.042);
        vec3 hor = vec3(0.012, 0.024, 0.068);
        vec3 col = mix(mid, zen, smoothstep(0.15, 0.95, elp));
        col = mix(hor, col, smoothstep(0.0, 0.3, elp));
        // warm town glow + faint general light pollution
        float glowAz = 0.12 + 0.88 * pow(townAz, 4.0);
        col += vec3(0.34, 0.14, 0.035) * glowAz * exp(-elp * 6.0);
        col += vec3(0.02, 0.028, 0.05) * exp(-elp * 8.0);

        // moon
        float md = length(d - uMoonDir);
        float moonR = 0.021;
        float moonAA = pixAng * 1.2 + 1e-4;
        float disc = 1.0 - smoothstep(moonR - moonAA, moonR + moonAA, md);
        col += vec3(0.30, 0.34, 0.42) * 0.12 * exp(-md * 18.0) + vec3(0.25, 0.3, 0.4) * 0.03 * exp(-md * 4.0);

        // clouds (thin, drifting, lit by moon and from below by the town)
        float starMask = 1.0;
        if (el > -0.02) {
          vec2 cp = d.xz / (elp + 0.1) * 0.55 + vec2(uTime * 0.004, uTime * 0.0015);
          float c = fbm2(cp * 1.4);
          float cov = smoothstep(0.52, 0.82, c) * smoothstep(0.0, 0.18, el) * uCloud;
          vec2 mh = normalize(uMoonDir.xz + vec2(1e-5));
          float moonSide = pow(max(0.0, dot(hd, mh)), 2.0);
          vec3 cloudCol = vec3(0.016, 0.019, 0.03) + vec3(0.03, 0.034, 0.045) * moonSide * (1.0 - exp(-md * 2.0) * 0.0)
                        + vec3(0.22, 0.09, 0.035) * glowAz * exp(-elp * 4.0) * 0.6;
          cloudCol += vec3(0.35, 0.38, 0.45) * 0.25 * exp(-md * 7.0);
          col = mix(col, cloudCol, cov * 0.8);
          starMask = 1.0 - cov;
        }

        // stars
        if (el > 0.0) {
          vec3 s = starLayer(d, 150.0, 0.014 * uStarDensity, pixAng, 1.0) * 0.8
                 + starLayer(d, 60.0, 0.012 * uStarDensity, pixAng, 7.0);
          float horizonFade = smoothstep(0.02, 0.3, el);
          col += s * starMask * horizonFade * (1.0 - disc);
        }

        // moon disc on top (occluded a little by clouds)
        vec2 mp = vec2(dot(d - uMoonDir, uMoonT1), dot(d - uMoonDir, uMoonT2)) / moonR;
        float limb = sqrt(max(0.0, 1.0 - dot(mp, mp)));
        float maria = fbm2(mp * 1.8 + 4.0);
        vec3 moonCol = vec3(1.0, 0.96, 0.88) * (0.6 + 0.4 * limb) * (1.0 - 0.38 * smoothstep(0.42, 0.62, maria)) * 2.6;
        col = mix(col, moonCol, disc * mix(1.0, 0.55, 1.0 - starMask));

        // distant horizon: tree line, a few buildings and a water tower towards the town, lights below
        float hTree = 0.004 + 0.008 * sNoise2(vec2(az * 38.0, 1.3)) + 0.004 * sNoise2(vec2(az * 160.0, 7.1));
        float bId = floor(az * 160.0);
        float bh = step(0.45, sHash11(bId)) * (0.006 + 0.02 * sHash11(bId + 3.1)) * smoothstep(0.55, 0.95, townAz);
        float townAng = atan(uTownDir.z, uTownDir.x) + 0.12;
        float dAz = mod(az - townAng + 3.14159265, 6.2831853) - 3.14159265;
        float tank = step(abs(dAz), 0.012) * step(0.032, el) * step(el, 0.046);
        float legs = step(abs(abs(dAz) - 0.007), 0.0012) * step(el, 0.034);
        float sil = max(hTree, bh);
        if (el < sil || tank > 0.5 || legs > 0.5) {
          col = vec3(0.006, 0.0065, 0.009) + vec3(0.03, 0.013, 0.006) * glowAz * 0.4;
          // lit windows in the buildings
          if (bh > hTree && el < bh) {
            vec2 wc = floor(vec2(az * 2400.0, el * 1500.0));
            float lit = step(0.72, sHash12(wc + 5.0));
            col += vec3(1.0, 0.7, 0.35) * lit * 0.25 * step(0.3, fract(az * 2400.0)) * step(0.3, fract(el * 1500.0));
          }
          if (tank > 0.5 && abs(dAz) < 0.002 && el > 0.045) col += vec3(1.2, 0.05, 0.02); // aircraft warning light
        }
        if (el < 0.0) {
          float depth = -el;
          vec3 ground = vec3(0.004, 0.0045, 0.005) + vec3(0.02, 0.009, 0.004) * glowAz * exp(-depth * 40.0);
          // scattered town lights near the horizon
          vec2 lg = vec2(az * 900.0, depth * 2600.0);
          vec2 lc = floor(lg);
          float lh = sHash12(lc + 91.0);
          float dens = 0.04 + 0.35 * pow(townAz, 3.0);
          vec2 lf = fract(lg) - 0.5;
          float dot1 = step(lh, dens) * exp(-dot(lf, lf) * 18.0);
          vec3 lcol = mix(vec3(1.0, 0.55, 0.2), vec3(0.9, 0.9, 1.0), step(0.7, sHash12(lc + 3.0)));
          ground += lcol * dot1 * 0.8 * (1.0 - smoothstep(0.0, 0.08, depth));
          col = ground;
        }
        gl_FragColor = vec4(clamp(col, 0.0, 8.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  disposer.add(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'StadiumSky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.onBeforeRender = (_r, _s, camera) => {
    const far = (camera as THREE.PerspectiveCamera).far;
    const near = (camera as THREE.PerspectiveCamera).near;
    if (typeof far === 'number' && isFinite(far) && far > 0) uniforms.uRadius.value = Math.max((near ?? 0.1) * 4, far * 0.9);
  };
  return {
    mesh,
    update: (time: number) => {
      uniforms.uTime.value = time;
    },
  };
}
