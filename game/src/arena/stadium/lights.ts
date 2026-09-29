import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder, HASH_GLSL, Rng, lin, ringPoint, scaleRgb, type Disposer, type Rgb, type SharedUniforms } from './util';
import type { Layout } from './layout';

export interface Floodlight {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** Suggested SpotLight.angle (radians) and penumbra for the real light. */
  angle: number;
  penumbra: number;
  color: THREE.Color;
}

export interface LightsResult {
  floodlights: Floodlight[];
  cones: THREE.Mesh;
  dust: THREE.Points;
  setIntensity(k: number): void;
}

const LAMP_RGB: Rgb = [1.0, 0.93, 0.8];
export const LAMP_EMISSIVE = 14;

/**
 * Towers + lamp heads go into the shared `metal` / `lamps` builders; the light cones and dust are
 * their own (additive) draw calls.
 */
export function buildLights(
  L: Layout,
  metal: GeoBuilder,
  lamps: GeoBuilder,
  rng: Rng,
  shared: SharedUniforms,
  dustCount: number,
  disposer: Disposer,
): LightsResult {
  const floodlights: Floodlight[] = [];
  const steel = lin(0x9aa1a8);
  const steelDark = lin(0x4a4f55);
  const housing = lin(0x2a2d31);
  const up = new THREE.Vector3(0, 1, 0);
  const coneGeos: THREE.BufferGeometry[] = [];
  const beamHalfAngle = 0.24;

  L.towerAngles.forEach((ang, ti) => {
    const radial = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const tang = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
    const base = radial.clone().multiplyScalar(L.towerR);
    const topY = L.lampY - 2.6;
    // --- lattice tower (tapered square) ---
    const levels = Math.max(6, Math.round(topY / 3.4));
    const corner = (k: number, j: number) => {
      const y = (topY * k) / levels;
      const hw = 1.8 + (0.85 - 1.8) * (y / topY);
      const sr = j === 0 || j === 3 ? -1 : 1;
      const st = j < 2 ? -1 : 1;
      return base.clone().addScaledVector(radial, sr * hw).addScaledVector(tang, st * hw).setY(y);
    };
    for (let j = 0; j < 4; j++) metal.beam(corner(0, j), corner(levels, j), 0.3, steel);
    for (let k = 0; k <= levels; k++) {
      for (let j = 0; j < 4; j++) {
        const a = corner(k, j);
        const b = corner(k, (j + 1) % 4);
        metal.beam(a, b, 0.12, steel);
        if (k < levels) {
          metal.beam(a, corner(k + 1, (j + 1) % 4), 0.09, steel);
          metal.beam(b, corner(k + 1, j), 0.09, steel);
        }
      }
    }
    // concrete footing
    const fm = new THREE.Matrix4().makeRotationY(-ang).setPosition(base);
    metal.box(fm, [-2.3, 0, -2.3], [2.3, 0.6, 2.3], lin(0x8a867d), ['ny']);

    // --- lamp head, aimed at a point past the arena centre ---
    const aimA = ang + Math.PI + 0.38 * (ti % 2 === 0 ? 1 : -1);
    const target = ringPoint(aimA, 9 + (ti % 3) * 2.5, 0);
    const head = base.clone().addScaledVector(radial, -1.2).setY(L.lampY);
    const D = target.clone().sub(head).normalize();
    const X = new THREE.Vector3().crossVectors(up, D).normalize();
    const Y = new THREE.Vector3().crossVectors(D, X).normalize();
    const hm = new THREE.Matrix4().makeBasis(X, Y, D).setPosition(head);
    const cols = 5;
    const rows = 3;
    const sx = 1.3;
    const sy = 1.25;
    const W = (cols - 1) * sx + 1.3;
    const H = (rows - 1) * sy + 1.3;
    // frame
    metal.box(hm, [-W / 2 - 0.1, -H / 2 - 0.1, -0.9], [W / 2 + 0.1, -H / 2 + 0.05, -0.75], steelDark);
    metal.box(hm, [-W / 2 - 0.1, H / 2 - 0.05, -0.9], [W / 2 + 0.1, H / 2 + 0.1, -0.75], steelDark);
    metal.box(hm, [-W / 2 - 0.1, -H / 2, -0.9], [-W / 2 + 0.05, H / 2, -0.75], steelDark);
    metal.box(hm, [W / 2 - 0.05, -H / 2, -0.9], [W / 2 + 0.1, H / 2, -0.75], steelDark);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * sx;
        const y = (r - (rows - 1) / 2) * sy;
        // housing (open front)
        metal.box(hm, [x - 0.5, y - 0.5, -0.8], [x + 0.5, y + 0.5, 0.05], housing, ['pz']);
        // glowing lens (disc)
        const segs = 12;
        const cen = new THREE.Vector3(x, y, 0.02).applyMatrix4(hm);
        const k = 0.85 + rng.next() * 0.3;
        const c0 = scaleRgb(LAMP_RGB, LAMP_EMISSIVE * k);
        const c1 = scaleRgb(LAMP_RGB, LAMP_EMISSIVE * k * 0.55);
        for (let s = 0; s < segs; s++) {
          const a0 = (s / segs) * Math.PI * 2;
          const a1 = ((s + 1) / segs) * Math.PI * 2;
          const p0 = new THREE.Vector3(x + Math.cos(a0) * 0.44, y + Math.sin(a0) * 0.44, 0.02).applyMatrix4(hm);
          const p1 = new THREE.Vector3(x + Math.cos(a1) * 0.44, y + Math.sin(a1) * 0.44, 0.02).applyMatrix4(hm);
          const ia = lamps.vert(cen, D, 0.5, 0.5, c0);
          const ib = lamps.vert(p0, D, 0, 0, c1);
          const ic = lamps.vert(p1, D, 1, 0, c1);
          lamps.idx.push(ia, ib, ic);
        }
      }
    }
    // back struts from the tower top to the head
    const tTop = base.clone().setY(topY);
    for (const [cx, cy] of [[-W / 2, -H / 2], [W / 2, -H / 2], [-W / 2, H / 2], [W / 2, H / 2]] as [number, number][]) {
      const p = new THREE.Vector3(cx * 0.8, cy * 0.8, -0.85).applyMatrix4(hm);
      metal.beam(tTop, p, 0.14, steel);
    }
    // catwalk under the head
    const cm = new THREE.Matrix4().makeRotationY(-ang + Math.PI / 2).setPosition(tTop);
    metal.box(cm, [-W / 2, -0.1, -1.4], [W / 2, 0.0, 1.4], steelDark);

    // --- fake volumetric cone ---
    const len = head.distanceTo(target) * 0.97;
    const r0 = 2.6;
    const r1 = r0 + Math.tan(beamHalfAngle) * len;
    const cg = new THREE.CylinderGeometry(r0, r1, len, 28, 1, true);
    // local: y from +len/2 (lamp) to -len/2 (far end). Map to head + D*(len/2 - y)
    const perpA = X.clone();
    const perpB = new THREE.Vector3().crossVectors(perpA, D.clone().negate()).normalize();
    const cmx = new THREE.Matrix4().makeBasis(perpA, D.clone().negate(), perpB);
    cmx.setPosition(head.clone().addScaledVector(D, len / 2 + 0.6));
    cg.applyMatrix4(cmx);
    coneGeos.push(cg);

    floodlights.push({
      position: head.clone().addScaledVector(D, 0.8),
      target: target.clone(),
      angle: 0.5,
      penumbra: 0.55,
      color: new THREE.Color(1.0, 0.95, 0.86),
    });
  });

  // ---- cones mesh (additive) ----------------------------------------------------------------
  const coneGeo = mergeGeometries(coneGeos);
  for (const g of coneGeos) g.dispose();
  disposer.add(coneGeo);
  const coneUniforms = {
    uTime: shared.uTime,
    uIntensity: { value: 1.0 },
    uColor: { value: new THREE.Color(1.0, 0.9, 0.74) },
  };
  const coneMat = new THREE.ShaderMaterial({
    uniforms: coneUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vAlong;
      void main() {
        vAlong = 1.0 - uv.y;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColor;
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vAlong;
      ${HASH_GLSL}
      void main() {
        // NB: every op guarded - a single NaN/Inf here would be smeared over the frame by the bloom blur
        vec3 toCam = cameraPosition - vWorld;
        float camDist = length(toCam);
        vec3 V = toCam / max(camDist, 1e-3);
        vec3 N = vN / max(length(vN), 1e-4);
        float facing = clamp(abs(dot(V, N)), 0.0, 1.0);
        float edge = facing * sqrt(facing);
        float a = clamp(vAlong, 0.0, 1.0);
        float ia = 1.0 - a;
        float fall = ia * ia * ia * smoothstep(0.0, 0.04, a);
        float ground = smoothstep(0.5, 9.0, vWorld.y);
        float camFade = smoothstep(4.0, 26.0, camDist);
        float n = sNoise3(vWorld * 0.12 + vec3(0.0, -uTime * 0.15, uTime * 0.05));
        float n2 = sNoise3(vWorld * 0.37 + vec3(uTime * 0.1, 0.0, 0.0));
        float dusty = 0.55 + 0.45 * n * (0.7 + 0.6 * n2);
        float v = clamp(edge * fall * ground * camFade * dusty * uIntensity * 0.15, 0.0, 2.0);
        gl_FragColor = vec4(uColor * v, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  coneMat.forceSinglePass = true;
  disposer.add(coneMat);
  const cones = new THREE.Mesh(coneGeo, coneMat);
  cones.name = 'StadiumLightCones';
  cones.renderOrder = 3;
  cones.castShadow = false;
  cones.receiveShadow = false;

  // ---- dust motes lit by the beams ------------------------------------------------------------
  const n = dustCount;
  const pos = new Float32Array(n * 3);
  const seeds = new Float32Array(n * 4);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (rng.next() < 0.6) {
      // inside a beam
      const f = floodlights[Math.floor(rng.next() * floodlights.length)];
      const D = tmp.subVectors(f.target, f.position).normalize().clone();
      const len = f.position.distanceTo(f.target);
      const t = 0.08 + Math.pow(rng.next(), 0.8) * 0.85;
      const rad = (2.4 + Math.tan(beamHalfAngle) * len * t) * Math.sqrt(rng.next());
      const ang = rng.next() * Math.PI * 2;
      const X = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), D).normalize();
      const Y = new THREE.Vector3().crossVectors(D, X).normalize();
      const p = f.position.clone().addScaledVector(D, len * t).addScaledVector(X, Math.cos(ang) * rad).addScaledVector(Y, Math.sin(ang) * rad);
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = Math.max(0.3, p.y);
      pos[i * 3 + 2] = p.z;
    } else {
      const rr = Math.sqrt(rng.next()) * (L.wallR + 2);
      const a = rng.next() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * rr;
      pos[i * 3 + 1] = 0.4 + Math.pow(rng.next(), 1.6) * 22;
      pos[i * 3 + 2] = Math.sin(a) * rr;
    }
    seeds[i * 4] = rng.next();
    seeds[i * 4 + 1] = rng.next();
    seeds[i * 4 + 2] = rng.next();
    seeds[i * 4 + 3] = rng.next();
  }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dgeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  disposer.add(dgeo);
  const lampPos = floodlights.map((f) => f.position.clone());
  const lampDir = floodlights.map((f) => f.target.clone().sub(f.position).normalize());
  const viewport = new THREE.Vector4();
  const dmat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uExcite: shared.uExcite,
      uLampPos: { value: lampPos },
      uLampDir: { value: lampDir },
      uCosOuter: { value: Math.cos(beamHalfAngle * 1.1) },
      uCosInner: { value: Math.cos(beamHalfAngle * 0.5) },
      uViewH: { value: 800 },
      uIntensity: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uExcite;
      uniform vec3 uLampPos[${floodlights.length}];
      uniform vec3 uLampDir[${floodlights.length}];
      uniform float uCosOuter;
      uniform float uCosInner;
      uniform float uViewH;
      uniform float uIntensity;
      varying float vB;
      void main() {
        vec3 p = position;
        float t = uTime;
        p.x += sin(t * (0.07 + 0.05 * aSeed.x) + aSeed.y * 6.283) * 1.6;
        p.z += cos(t * (0.06 + 0.05 * aSeed.z) + aSeed.w * 6.283) * 1.6;
        p.y += sin(t * (0.09 + 0.06 * aSeed.w) + aSeed.x * 6.283) * 0.9 + t * 0.03 * (aSeed.z - 0.3);
        p.y = 0.3 + mod(p.y - 0.3, 40.0);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        float lit = 0.0;
        for (int i = 0; i < ${floodlights.length}; i++) {
          vec3 d = wp.xyz - uLampPos[i];
          float dist = length(d);
          float c = dot(d / max(dist, 0.001), uLampDir[i]);
          lit += smoothstep(uCosOuter, uCosInner, c) * (1.0 / (1.0 + dist * dist * 0.0006));
        }
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        float px = 0.03 * (0.6 + aSeed.y * 0.8) * projectionMatrix[1][1] * uViewH * 0.5 / max(dist, 0.1);
        float size = clamp(px, 1.0, 2.5);
        float energy = min((px * px) / (size * size), 1.5);
        float near = smoothstep(3.0, 12.0, dist);
        float tw = 0.65 + 0.35 * sin(t * (1.5 + aSeed.x * 3.0) + aSeed.z * 20.0);
        vB = min(lit, 1.5) * energy * near * tw * uIntensity * (0.16 + 0.1 * uExcite);
        gl_PointSize = vB > 0.003 ? size : 0.0;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vB;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = 1.0 - smoothstep(0.1, 0.5, length(c));
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.8) * clamp(vB * a * 1.6, 0.0, 6.0), 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  disposer.add(dmat);
  const dust = new THREE.Points(dgeo, dmat);
  dust.name = 'StadiumDust';
  dust.frustumCulled = false;
  dust.renderOrder = 3;
  dust.onBeforeRender = (renderer) => {
    renderer.getCurrentViewport(viewport);
    dmat.uniforms.uViewH.value = viewport.w;
  };

  return {
    floodlights,
    cones,
    dust,
    setIntensity: (k: number) => {
      coneUniforms.uIntensity.value = k;
      dmat.uniforms.uIntensity.value = k;
    },
  };
}
