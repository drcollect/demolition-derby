import * as THREE from 'three';
import { HASH_GLSL, type Disposer } from '../../stadium/util';

/*
 Golden-hour sky: a camera-centred sphere (radius follows camera.far, never writes depth, drawn first).
 Linear HDR values; only the sun disc and a few degrees around it go above the bloom threshold.
 Every pow() base is clamped >= 0 and the output is clamped, so it can never feed NaN/negatives to bloom.
*/

type V3 = [number, number, number];
const g = (v: V3) => `vec3(${v.map((x) => x.toFixed(4)).join(', ')})`;

/** Palette (linear). Shared by the GLSL and the CPU mirror used for the suggested fog colour. */
export const SKY = {
  zenith: [0.018, 0.042, 0.15] as V3,
  upper: [0.075, 0.095, 0.23] as V3,
  horizonAway: [0.34, 0.2, 0.25] as V3,
  horizonMid: [0.62, 0.28, 0.17] as V3,
  horizonSun: [0.86, 0.38, 0.11] as V3,
};

/** GLSL: horizon colour for a view direction (needs `uniform vec3 uSunDir;` declared). */
export const SKY_HORIZON_GLSL = /* glsl */ `
vec3 f8SkyHorizon(vec3 d) {
  vec2 hd = d.xz / max(length(d.xz), 1e-4);
  vec2 hs = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
  float toward = clamp(0.5 + 0.5 * dot(hd, hs), 0.0, 1.0);
  vec3 c = mix(${g(SKY.horizonAway)}, ${g(SKY.horizonMid)}, smoothstep(0.0, 0.62, toward));
  c = mix(c, ${g(SKY.horizonSun)}, smoothstep(0.55, 1.0, toward));
  c += vec3(0.16, 0.06, 0.01) * pow(toward, 24.0);
  return c;
}
`;

/**
 * GLSL: aerial perspective toward the horizon colour of the view direction.
 * Needs uSunDir, uHaze (x = start distance, y = 1/scale, z = max amount) and a world-space position.
 */
export const HAZE_GLSL = /* glsl */ `
uniform vec3 uHaze;
vec3 f8ApplyHaze(vec3 col, vec3 wp) {
  vec3 v = wp - cameraPosition;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-3);
  float h = 1.0 - exp(-max(dist - uHaze.x, 0.0) * uHaze.y);
  // thinner haze when looking up at tall things
  h *= 1.0 - 0.6 * clamp(dir.y * 3.0, 0.0, 1.0);
  vec3 hz = f8SkyHorizon(normalize(vec3(dir.x, max(dir.y, 0.0) * 0.3, dir.z) + vec3(0.0, 1e-4, 0.0)));
  return mix(col, hz * 0.92, clamp(h * uHaze.z, 0.0, 1.0));
}
`;

/** CPU mirror of f8SkyHorizon (for the suggested fog colour). */
export function skyHorizonColor(dir: THREE.Vector3, sunDir: THREE.Vector3, out = new THREE.Color()): THREE.Color {
  const hl = Math.max(Math.hypot(dir.x, dir.z), 1e-4);
  const sl = Math.max(Math.hypot(sunDir.x, sunDir.z), 1e-4);
  const toward = Math.min(1, Math.max(0, 0.5 + 0.5 * ((dir.x / hl) * (sunDir.x / sl) + (dir.z / hl) * (sunDir.z / sl))));
  const ss = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  let c = mix(SKY.horizonAway, SKY.horizonMid, ss(0, 0.62, toward));
  c = mix(c, SKY.horizonSun, ss(0.55, 1, toward));
  const k = Math.pow(toward, 24);
  return out.setRGB(c[0] + 0.16 * k, c[1] + 0.06 * k, c[2] + 0.01 * k);
}

export interface SkyUniforms {
  uSunDir: { value: THREE.Vector3 };
  uTime: { value: number };
  uRadius: { value: number };
  uCloud: { value: number };
}

export interface SkyResult {
  mesh: THREE.Mesh;
  uniforms: SkyUniforms;
  update(time: number): void;
}

export function buildSky(sunDir: THREE.Vector3, seed: number, cloudiness: number, disposer: Disposer): SkyResult {
  const geo = disposer.add(new THREE.SphereGeometry(1, 64, 32));
  const uniforms: SkyUniforms = {
    uSunDir: { value: sunDir.clone().normalize() },
    uTime: { value: 0 },
    uRadius: { value: 1000 },
    uCloud: { value: cloudiness },
  };
  const seedOff = ((seed * 0.6180339) % 1) * 97.0;
  const mat = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
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
      uniform vec3 uSunDir;
      uniform float uTime;
      uniform float uCloud;
      varying vec3 vDir;
      ${HASH_GLSL}
      ${SKY_HORIZON_GLSL}
      float fbm2(vec2 p) {
        float a = 0.5, s = 0.0;
        for (int i = 0; i < 5; i++) { s += a * sNoise2(p); p = p * 2.07 + vec2(13.7, 7.3); a *= 0.5; }
        return s;
      }
      float fbm1(float x) { return sNoise2(vec2(x, 0.37)) * 0.6 + sNoise2(vec2(x * 2.3, 5.1)) * 0.3 + sNoise2(vec2(x * 5.1, 9.7)) * 0.1; }
      // pixel-AA'd step: 1 below edge
      float below(float el, float edge, float aa) { return 1.0 - smoothstep(edge - aa, edge + aa, el); }
      float box1(float x, float c, float hw, float aa) { return 1.0 - smoothstep(hw - aa, hw + aa, abs(x - c)); }

      void main() {
        vec3 d = vDir / max(length(vDir), 1e-5);
        float pix = max(length(fwidth(d)), 1e-5);
        float el = d.y;
        float e = clamp(el, 0.0, 1.0);
        float mu = clamp(dot(d, uSunDir), -1.0, 1.0);
        float m = max(mu, 0.0);
        vec3 hor = f8SkyHorizon(d);

        // ---- gradient: warm horizon -> lavender -> deep blue zenith
        vec3 col = mix(hor, ${g(SKY.upper)}, smoothstep(0.0, 0.34, pow(e, 0.8)));
        col = mix(col, ${g(SKY.zenith)}, smoothstep(0.22, 0.95, e));
        // pink "belt" low in the sky away from the sun
        float away = clamp(0.5 - 0.5 * mu, 0.0, 1.0);
        col += vec3(0.10, 0.035, 0.05) * away * exp(-abs(el - 0.06) * 18.0);
        // sun glow (kept < ~1 except within a few degrees of the disc)
        col += vec3(0.30, 0.13, 0.03) * pow(m, 8.0) * (1.0 - 0.6 * e);
        col += vec3(0.34, 0.17, 0.05) * pow(m, 90.0);
        col += vec3(0.80, 0.50, 0.22) * pow(m, 2600.0);

        // ---- clouds: a few drifting cumulus/stratus streaks, lit orange/pink from below
        if (el > 0.0 && uCloud > 0.0) {
          vec2 cp = d.xz / (el + 0.07) * 0.75 + vec2(uTime * 0.0022 + ${seedOff.toFixed(3)}, uTime * 0.0009);
          float n = fbm2(cp * 0.55);
          float n2 = fbm2(cp * 1.9 + 11.0);
          float dens = n * 0.8 + n2 * 0.25;
          float th = mix(0.82, 0.6, clamp(uCloud, 0.0, 1.0));
          float cov = smoothstep(th, th + 0.12, dens) * smoothstep(0.012, 0.09, el) * (1.0 - smoothstep(0.45, 0.8, el));
          float core = smoothstep(th + 0.05, th + 0.28, dens);
          float fwd = pow(m, 3.0);
          vec3 lit = mix(vec3(0.78, 0.36, 0.34), vec3(1.15, 0.58, 0.24), fwd);
          vec3 shade = mix(vec3(0.24, 0.16, 0.24), vec3(0.22, 0.11, 0.09), fwd);
          float litAmt = mix(0.78 - 0.3 * core, 0.95 - 0.75 * core, fwd);
          vec3 cc = mix(shade, lit, clamp(litAmt, 0.0, 1.0)) * (0.75 + 0.35 * (1.0 - e));
          // silver lining close to the sun
          cc += vec3(0.9, 0.55, 0.22) * pow(m, 40.0) * (1.0 - core) * 0.8;
          col = mix(col, cc, cov * 0.92);
        }

        // ---- sun disc (slightly flattened by refraction near the horizon), limb darkened
        {
          vec3 sd = d - uSunDir;
          float r = 0.0095;
          float dd = length(vec3(sd.x, sd.y * 1.12, sd.z));
          float disc = 1.0 - smoothstep(r - pix, r + pix, dd);
          float limb = sqrt(max(0.0, 1.0 - (dd * dd) / (r * r)));
          vec3 sunCol = vec3(5.2, 2.8, 1.0) * (0.66 + 0.34 * limb);
          col = mix(col, sunCol, disc);
        }

        // ---- far horizon: tree lines, a small town (water tower, steeple, grain elevator), farm silos
        float hdl = length(d.xz);
        if (el < 0.09 && hdl > 1e-3) {
          float az = atan(d.z, d.x);
          float aa = pix * 0.8;
          float toward = clamp(0.5 + 0.5 * dot(d.xz / hdl, uSunDir.xz / max(length(uSunDir.xz), 1e-4)), 0.0, 1.0);
          // tree line with gaps (open fields reaching the horizon)
          float trees = 0.0045 + 0.0075 * fbm1(az * 9.0 + 3.0) + 0.0022 * sNoise2(vec2(az * 150.0, 1.7)) + 0.0012 * sNoise2(vec2(az * 420.0, 4.2));
          trees *= mix(0.2, 1.0, smoothstep(0.32, 0.55, fbm1(az * 3.1 + 17.0)));
          float sil = below(el, trees, aa);
          // town toward -z
          float ta = atan(-1.0, 0.0);
          float dz = mod(az - ta + 3.14159265, 6.2831853) - 3.14159265;
          if (abs(dz) < 0.34) {
            float bid = floor(dz * 260.0);
            float bh = step(0.35, sHash11(bid + 7.0)) * (0.004 + 0.012 * sHash11(bid + 3.1)) * (1.0 - smoothstep(0.18, 0.34, abs(dz)));
            sil = max(sil, below(el, bh, aa));
            // water tower
            float wt = box1(dz, 0.07, 0.0085, aa) * (1.0 - smoothstep(0.0, aa * 2.0, abs(el - 0.029) - 0.0055));
            float legs = (box1(dz, 0.064, 0.0007, aa) + box1(dz, 0.076, 0.0007, aa)) * below(el, 0.026, aa);
            float ball = box1(dz, 0.07, 0.0012, aa) * below(el, 0.038, aa);
            sil = max(sil, max(wt, max(legs, ball)));
            // church steeple
            float st = box1(dz, -0.11, 0.0035, aa) * below(el, 0.016, aa);
            float spire = below(el, 0.016 + 0.018 * (1.0 - clamp(abs(dz + 0.11) / 0.0035, 0.0, 1.0)), aa) * box1(dz, -0.11, 0.0035, aa);
            sil = max(sil, max(st, spire));
          }
          // grain elevator + silos toward +x
          float ga = mod(az - 0.32 + 3.14159265, 6.2831853) - 3.14159265;
          if (abs(ga) < 0.06) {
            float body = box1(ga, 0.0, 0.009, aa) * below(el, 0.033, aa);
            float head = box1(ga, -0.002, 0.0035, aa) * below(el, 0.043, aa);
            float s1 = box1(ga, 0.017, 0.0045, aa) * below(el, 0.022 + 0.004 * sqrt(max(0.0, 1.0 - pow(abs(ga - 0.017) / 0.0045, 2.0))), aa);
            float s2 = box1(ga, 0.027, 0.0045, aa) * below(el, 0.02 + 0.004 * sqrt(max(0.0, 1.0 - pow(abs(ga - 0.027) / 0.0045, 2.0))), aa);
            sil = max(sil, max(max(body, head), max(s1, s2)));
          }
          // silhouettes are hazy: lighter and bluer away from the sun, dark warm-grey toward it
          vec3 silCol = mix(hor * vec3(0.62, 0.6, 0.72), hor * vec3(0.30, 0.25, 0.26), smoothstep(0.35, 1.0, toward));
          // little lights coming on in town
          if (abs(dz) < 0.3 && el < 0.012) {
            vec2 lc = floor(vec2(dz * 1400.0, el * 2200.0));
            float lh = sHash12(lc + 31.0);
            vec2 lf = fract(vec2(dz * 1400.0, el * 2200.0)) - 0.5;
            silCol += vec3(1.6, 0.9, 0.4) * step(0.93, lh) * exp(-dot(lf, lf) * 10.0) * 0.5 * (1.0 - smoothstep(0.15, 0.3, abs(dz)));
          }
          // below the horizon: distant hazy fields
          vec3 groundCol = hor * mix(vec3(0.74, 0.7, 0.72), vec3(0.62, 0.56, 0.52), smoothstep(0.4, 1.0, toward));
          float gnd = below(el, 0.0, aa);
          col = mix(col, silCol, sil);
          col = mix(col, groundCol, gnd * (1.0 - sil * 0.5));
        } else if (el < 0.0) {
          col = hor * 0.7;
        }

        gl_FragColor = vec4(clamp(col, vec3(0.0), vec3(24.0)), 1.0);
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
  mesh.name = 'F8Sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.onBeforeRender = (_r, _s, camera) => {
    const cam = camera as THREE.PerspectiveCamera;
    const far = cam.far;
    if (typeof far === 'number' && isFinite(far) && far > 0) uniforms.uRadius.value = Math.max((cam.near ?? 0.1) * 4, far * 0.9);
  };
  return {
    mesh,
    uniforms,
    update: (time: number) => {
      uniforms.uTime.value = time;
    },
  };
}

/** Pre-filtered environment map rendered from this sky (optional, for scene.environment). */
export function skyEnvironment(renderer: THREE.WebGLRenderer, sky: SkyResult): THREE.Texture {
  const scene = new THREE.Scene();
  const clone = new THREE.Mesh(sky.mesh.geometry, sky.mesh.material);
  clone.frustumCulled = false;
  clone.onBeforeRender = () => {
    sky.uniforms.uRadius.value = 50;
  };
  scene.add(clone);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.03, 0.1, 100).texture;
  pm.dispose();
  return tex;
}
