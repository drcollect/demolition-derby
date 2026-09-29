import * as THREE from 'three';
import { HASH_GLSL, Rng, type Disposer, type SharedUniforms } from '../../stadium/util';
import type { Lamp } from './stands';

/*
 Golden-hour air: big soft dust-haze billboards that glow when you look toward the sun (Henyey-Greenstein
 forward scattering), fine sunlit motes, and soft glows around the lamps that are just coming on.
 All additive, depth-tested, no depth writes; every term is clamped and every pow() base is positive.
*/

export interface DustResult {
  haze: THREE.Mesh;
  motes: THREE.Points;
  glows: THREE.Mesh;
  uniforms: { uWind: { value: THREE.Vector3 }; uDust: { value: number } };
}

function quadGeometry(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export function buildDust(
  box: { minX: number; maxX: number; minZ: number; maxZ: number },
  lamps: Lamp[],
  sunDir: THREE.Vector3,
  wind: THREE.Vector3,
  shared: SharedUniforms,
  rng: Rng,
  hi: boolean,
  disposer: Disposer,
): DustResult {
  const uniforms = { uWind: { value: wind.clone().multiplyScalar(0.9) }, uDust: { value: 1.0 } };
  const sun = { value: sunDir.clone().normalize() };
  const boxMin = new THREE.Vector3(box.minX, 0, box.minZ);
  const boxSize = new THREE.Vector3(box.maxX - box.minX, 1, box.maxZ - box.minZ);

  // ---- haze billboards -------------------------------------------------------------------------------------
  const n = hi ? 70 : 28;
  const hg = quadGeometry();
  const centers = new Float32Array(n * 3);
  const params = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const size = 12 + rng.next() * 22;
    centers[i * 3] = box.minX + rng.next() * boxSize.x;
    centers[i * 3 + 1] = size * 0.18 + rng.next() * 5;
    centers[i * 3 + 2] = box.minZ + rng.next() * boxSize.z;
    params[i * 4] = size;
    params[i * 4 + 1] = rng.next();
    params[i * 4 + 2] = 0.07 + rng.next() * 0.09;
    params[i * 4 + 3] = 0;
  }
  hg.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centers, 3));
  hg.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
  hg.instanceCount = n;
  disposer.add(hg);
  const hmat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uExcite: shared.uExcite, uSunDir: sun, uWind: uniforms.uWind, uDust: uniforms.uDust, uBoxMin: { value: boxMin }, uBoxSize: { value: boxSize } },
    vertexShader: /* glsl */ `
      attribute vec3 aCenter;
      attribute vec4 aParams;
      uniform float uTime;
      uniform float uExcite;
      uniform float uDust;
      uniform vec3 uSunDir;
      uniform vec3 uWind;
      uniform vec3 uBoxMin;
      uniform vec3 uBoxSize;
      varying vec2 vUv;
      varying float vA;
      varying vec3 vCol;
      varying float vSeed;
      varying float vY;
      void main() {
        vec3 c = aCenter + uWind * uTime * (0.6 + 0.8 * aParams.y);
        c.xz = uBoxMin.xz + mod(c.xz - uBoxMin.xz, max(uBoxSize.xz, vec2(1.0)));
        c.y += sin(uTime * 0.11 + aParams.y * 20.0) * 0.6;
        vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float size = aParams.x;
        vec3 wp = c + (camR * position.x + camU * position.y) * size;
        vec3 V = wp - cameraPosition;
        float dist = length(V);
        vec3 Vn = V / max(dist, 1e-3);
        float mu = clamp(dot(Vn, uSunDir), -1.0, 1.0);
        float g = 0.68;
        float hgp = (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * mu, 1e-3), 1.5) * 0.16;
        vCol = vec3(1.0, 0.58, 0.28) * min(hgp, 3.0) + vec3(0.36, 0.3, 0.3) * 0.32;
        float nearFade = smoothstep(size * 0.3, size * 1.2, dist);
        float farFade = 1.0 - smoothstep(240.0, 460.0, dist);
        // wrap-around pop: fade at the edges of the box
        vec2 e = min(c.xz - uBoxMin.xz, uBoxMin.xz + uBoxSize.xz - c.xz);
        float edge = smoothstep(0.0, 15.0, min(e.x, e.y));
        vA = aParams.z * nearFade * farFade * edge * (0.8 + 0.5 * clamp(uExcite, 0.0, 1.0)) * clamp(uDust, 0.0, 2.0);
        vUv = position.xy + 0.5;
        vSeed = aParams.y;
        vY = wp.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vA;
      varying vec3 vCol;
      varying float vSeed;
      varying float vY;
      ${HASH_GLSL}
      void main() {
        vec2 q = vUv - 0.5;
        float r2 = dot(q, q) * 4.0;
        float soft = clamp(1.0 - r2, 0.0, 1.0);
        soft *= soft;
        float nz = sNoise2(vUv * 2.6 + vSeed * 17.0 + uTime * 0.015) * 0.65 + sNoise2(vUv * 6.5 - vSeed * 5.0) * 0.35;
        float a = soft * smoothstep(0.22, 0.8, nz) * vA * smoothstep(0.15, 2.8, vY);
        gl_FragColor = vec4(clamp(vCol * a, vec3(0.0), vec3(2.0)), 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  disposer.add(hmat);
  const haze = new THREE.Mesh(hg, hmat);
  haze.name = 'F8DustHaze';
  haze.frustumCulled = false;
  haze.renderOrder = 4;

  // ---- sunlit motes ----------------------------------------------------------------------------------------------
  const nm = hi ? 2600 : 900;
  const mpos = new Float32Array(nm * 3);
  const mseed = new Float32Array(nm);
  for (let i = 0; i < nm; i++) {
    mpos[i * 3] = box.minX + rng.next() * boxSize.x;
    mpos[i * 3 + 1] = 0.3 + Math.pow(rng.next(), 1.8) * 14;
    mpos[i * 3 + 2] = box.minZ + rng.next() * boxSize.z;
    mseed[i] = rng.next();
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
  mg.setAttribute('aSeed', new THREE.BufferAttribute(mseed, 1));
  disposer.add(mg);
  const viewport = new THREE.Vector4();
  const mmat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uSunDir: sun, uWind: uniforms.uWind, uViewH: { value: 800 }, uBoxMin: { value: boxMin }, uBoxSize: { value: boxSize }, uDust: uniforms.uDust },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uWind;
      uniform float uViewH;
      uniform vec3 uBoxMin;
      uniform vec3 uBoxSize;
      uniform float uDust;
      varying float vB;
      void main() {
        vec3 p = position + uWind * uTime * (1.2 + aSeed);
        p.x += sin(uTime * (0.3 + aSeed) + aSeed * 40.0) * 0.8;
        p.y += sin(uTime * (0.2 + 0.3 * aSeed) + aSeed * 13.0) * 0.5;
        p.xz = uBoxMin.xz + mod(p.xz - uBoxMin.xz, max(uBoxSize.xz, vec2(1.0)));
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = max(-mv.z, 0.1);
        vec3 Vn = normalize(p - cameraPosition + vec3(0.0, 1e-4, 0.0));
        float mu = clamp(dot(Vn, uSunDir), -1.0, 1.0);
        float glint = pow(max(mu, 0.0), 6.0);
        float tw = 0.55 + 0.45 * sin(uTime * (2.0 + aSeed * 5.0) + aSeed * 60.0);
        vB = (0.05 + 0.9 * glint) * tw * (1.0 - smoothstep(25.0, 70.0, dist)) * smoothstep(1.5, 5.0, dist) * clamp(uDust, 0.0, 2.0);
        float px = 0.02 * projectionMatrix[1][1] * uViewH * 0.5 / dist;
        gl_PointSize = vB > 0.004 ? clamp(px, 1.0, 3.0) : 0.0;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vB;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = 1.0 - smoothstep(0.15, 0.5, length(c));
        gl_FragColor = vec4(vec3(1.0, 0.8, 0.55) * clamp(vB * a * 1.4, 0.0, 3.0), 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  disposer.add(mmat);
  const motes = new THREE.Points(mg, mmat);
  motes.name = 'F8DustMotes';
  motes.frustumCulled = false;
  motes.renderOrder = 4;
  motes.onBeforeRender = (renderer) => {
    renderer.getCurrentViewport(viewport);
    mmat.uniforms.uViewH.value = viewport.w;
  };

  // ---- lamp glows ---------------------------------------------------------------------------------------------------
  const nl = Math.max(1, lamps.length);
  const lg = quadGeometry();
  const lpos = new Float32Array(nl * 4);
  const lcol = new Float32Array(nl * 3);
  const ldir = new Float32Array(nl * 3);
  lamps.forEach((l, i) => {
    lpos[i * 4] = l.p.x;
    lpos[i * 4 + 1] = l.p.y;
    lpos[i * 4 + 2] = l.p.z;
    lpos[i * 4 + 3] = l.size;
    lcol[i * 3] = l.color.r;
    lcol[i * 3 + 1] = l.color.g;
    lcol[i * 3 + 2] = l.color.b;
    if (l.dir && l.dir.lengthSq() > 1e-8) {
      const d = l.dir.clone().normalize();
      ldir[i * 3] = d.x;
      ldir[i * 3 + 1] = d.y;
      ldir[i * 3 + 2] = d.z;
    }
  });
  lg.setAttribute('aLamp', new THREE.InstancedBufferAttribute(lpos, 4));
  lg.setAttribute('aColor', new THREE.InstancedBufferAttribute(lcol, 3));
  lg.setAttribute('aDir', new THREE.InstancedBufferAttribute(ldir, 3));
  lg.instanceCount = lamps.length;
  disposer.add(lg);
  const lmat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime },
    vertexShader: /* glsl */ `
      attribute vec4 aLamp;
      attribute vec3 aColor;
      attribute vec3 aDir;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vCol;
      void main() {
        vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 c = aLamp.xyz;
        vec3 toCam = cameraPosition - c;
        float dist = length(toCam);
        // directional lamps fade out when seen from behind (aDir = 0 for omni bulbs)
        float facing = dot(toCam / max(dist, 1e-3), aDir);
        float dirFade = dot(aDir, aDir) > 0.5 ? smoothstep(-0.15, 0.35, facing) : 1.0;
        // grow a little with distance (so far lamps still read), fade out when very close
        float size = aLamp.w * (1.0 + min(dist, 300.0) * 0.0015);
        vec3 wp = c + (camR * position.x + camU * position.y) * size;
        vCol = max(aColor, vec3(0.0)) * dirFade * smoothstep(1.5, 6.0, dist) * (0.96 + 0.04 * sin(uTime * 13.0 + c.x));
        vUv = position.xy;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        mv.xyz += normalize(-mv.xyz + vec3(0.0, 0.0, 1e-4)) * min(aLamp.w, dist * 0.5); // pull toward the camera so it isn't clipped by its fixture
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vCol;
      void main() {
        float r2 = dot(vUv, vUv) * 4.0;
        float g = exp(-r2 * 5.0) * 0.55 + exp(-r2 * 24.0) * 0.9;
        g *= clamp(1.0 - r2, 0.0, 1.0);
        gl_FragColor = vec4(clamp(vCol * g, vec3(0.0), vec3(3.0)), 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  disposer.add(lmat);
  const glows = new THREE.Mesh(lg, lmat);
  glows.name = 'F8LampGlows';
  glows.frustumCulled = false;
  glows.renderOrder = 5;
  return { haze, motes, glows, uniforms };
}
