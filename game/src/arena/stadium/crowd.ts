import * as THREE from 'three';
import { CHEER_GLSL, GeoBuilder, HASH_GLSL, Rng, lin, type Disposer, type Rgb, type SharedUniforms } from './util';
import type { Seat } from './stands';

/*
 Spectator figure (feet at origin, facing +Z, left = +X). Parts:
 0 legs, 1 torso, 2 head (skin), 3 hair/hat, 4 left arm, 5 right arm, 6 left hand, 7 right hand,
 8 flag stick, 9 flag cloth (right hand).
*/
function buildFigure(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.defineExtra('aPart', 1, [0]);
  b.defineExtra('aFlagUV', 2, [0, 0]);
  const I = new THREE.Matrix4();
  const white: Rgb = [1, 1, 1];
  const faces = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  const part = (
    min: [number, number, number],
    max: [number, number, number],
    parts: Partial<Record<string, number>>,
    skip: string[],
  ) => {
    for (const f of faces) {
      if (skip.includes(f)) continue;
      b.setExtra('aPart', [parts[f] ?? parts.all ?? 0]);
      b.box(I, min, max, white, faces.filter((x) => x !== f));
    }
  };
  part([-0.16, 0, -0.1], [0.16, 0.84, 0.1], { all: 0 }, ['py', 'ny']); // legs
  part([-0.21, 0.82, -0.125], [0.21, 1.42, 0.125], { all: 1 }, ['ny']); // torso
  part([-0.1, 1.42, -0.11], [0.1, 1.72, 0.11], { all: 2, py: 3, nz: 3 }, ['ny']); // head + hair
  part([0.21, 0.8, -0.055], [0.31, 1.4, 0.055], { all: 4, ny: 6 }, ['py']); // left arm (+x)
  part([-0.31, 0.8, -0.055], [-0.21, 1.4, 0.055], { all: 5, ny: 7 }, ['py']); // right arm (-x)
  // flag stick continuing down from the right hand (points up when the arm is raised)
  b.setExtra('aPart', [8]);
  const st0 = new THREE.Vector3(-0.275, 0.05, 0);
  const st1 = new THREE.Vector3(-0.245, 0.05, 0);
  const st2 = new THREE.Vector3(-0.245, 0.82, 0);
  const st3 = new THREE.Vector3(-0.275, 0.82, 0);
  b.quad(st0, st1, st2, st3, white, new THREE.Vector3(0, 0, 1));
  b.quad(st0, st1, st2, st3, white, new THREE.Vector3(0, 0, -1));
  // cloth: from the stick outward (-x), 2 segments so it can ripple; both sides
  b.setExtra('aPart', [9]);
  const segs = 2;
  for (let s = 0; s < segs; s++) {
    const u0 = s / segs;
    const u1 = (s + 1) / segs;
    const x0 = -0.26 - u0 * 0.58;
    const x1 = -0.26 - u1 * 0.58;
    const y0 = 0.08;
    const y1 = 0.44;
    for (const side of [1, -1]) {
      const n = new THREE.Vector3(0, 0, side);
      // per-vertex flag uv
      const pts: [THREE.Vector3, number, number][] = [
        [new THREE.Vector3(x0, y0, 0), u0, 0],
        [new THREE.Vector3(x1, y0, 0), u1, 0],
        [new THREE.Vector3(x1, y1, 0), u1, 1],
        [new THREE.Vector3(x0, y1, 0), u0, 1],
      ];
      const idx: number[] = [];
      for (const [p, u, v] of pts) {
        b.setExtra('aFlagUV', [u, v]);
        idx.push(b.vert(p, n, u, v, white));
      }
      if (side === 1) b.idx.push(idx[0], idx[2], idx[1], idx[0], idx[3], idx[2]);
      else b.idx.push(idx[0], idx[1], idx[2], idx[0], idx[2], idx[3]);
    }
  }
  const g = b.build();
  g.deleteAttribute('color');
  g.deleteAttribute('uv');
  return g;
}

const SHIRTS: [number, number][] = [
  [0xe9e6de, 3],
  [0xb3262b, 3],
  [0x1f2a4f, 2],
  [0x2a55b8, 2],
  [0x7fb2de, 1],
  [0xe07a2a, 2],
  [0xd9aa2a, 2],
  [0x2e7d4a, 1],
  [0x1f4d2e, 1],
  [0x6e1f2a, 1],
  [0x6b4a2e, 1],
  [0xb89a6a, 1],
  [0x1e1e1e, 2],
  [0x8a8a8a, 1],
  [0xe07aa0, 0.7],
  [0x2a8a8a, 1],
  [0xe8d23a, 1],
  [0x4a6a9a, 1.2],
  [0x5a3a8a, 0.5],
];
const TEAM: number[] = [0xb3262b, 0x2a55b8, 0xe07a2a, 0xe8d23a, 0x2e7d4a, 0xe9e6de, 0x1e1e1e];

const CROWD_VERT_DECL = /* glsl */ `
attribute float aPart;
attribute vec2 aFlagUV;
attribute vec4 aSeed;
uniform float uTime;
uniform float uExcite;
uniform float uWaveAng;
uniform float uWaveAmp;
varying vec2 vFlagUV;
varying float vPart;
varying float vFlagKind;
${CHEER_GLSL}
${HASH_GLSL}
vec3 cLin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 skinCol(float r) {
  vec3 c = vec3(0.96, 0.80, 0.69);
  if (r > 0.83) c = vec3(0.40, 0.26, 0.17);
  else if (r > 0.70) c = vec3(0.58, 0.39, 0.25);
  else if (r > 0.52) c = vec3(0.78, 0.58, 0.42);
  else if (r > 0.30) c = vec3(0.90, 0.71, 0.56);
  return cLin(c);
}
vec3 hairCol(float r) {
  vec3 c = vec3(0.10, 0.08, 0.07);
  if (r > 0.85) c = vec3(0.62, 0.62, 0.60);
  else if (r > 0.72) c = vec3(0.78, 0.63, 0.36);
  else if (r > 0.6) c = vec3(0.50, 0.24, 0.12);
  else if (r > 0.3) c = vec3(0.28, 0.18, 0.10);
  return cLin(c);
}
vec3 hatCol(float r) {
  vec3 c = vec3(0.75, 0.12, 0.12);
  if (r > 0.86) c = vec3(0.70, 0.55, 0.33);
  else if (r > 0.72) c = vec3(0.92, 0.92, 0.9);
  else if (r > 0.58) c = vec3(0.12, 0.25, 0.62);
  else if (r > 0.44) c = vec3(0.10, 0.10, 0.10);
  else if (r > 0.3) c = vec3(0.15, 0.45, 0.2);
  else if (r > 0.15) c = vec3(0.90, 0.50, 0.12);
  return cLin(c);
}
vec3 pantsCol(float r) {
  vec3 c = vec3(0.20, 0.29, 0.45);
  if (r > 0.85) c = vec3(0.62, 0.55, 0.40);
  else if (r > 0.72) c = vec3(0.13, 0.13, 0.14);
  else if (r > 0.6) c = vec3(0.36, 0.25, 0.18);
  else if (r > 0.45) c = vec3(0.42, 0.52, 0.68);
  else if (r > 0.25) c = vec3(0.13, 0.19, 0.30);
  return cLin(c);
}
`;

// computed once per vertex, before normals: all animation state
const CROWD_ANIM = /* glsl */ `
vec4 cInst = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
float cPhase = aSeed.x * 6.2831853;
float cEnergy = aSeed.w;
float cCheer = min(stadiumCheer(cInst.xz, aSeed.x * 0.45), 1.6);
float cAng = atan(cInst.z, cInst.x);
float cDA = mod(cAng - uWaveAng + 3.14159265, 6.2831853) - 3.14159265;
float cWave = uWaveAmp * exp(-cDA * cDA / 0.03);
float cStand = smoothstep(aSeed.y - 0.1, aSeed.y + 0.1, uExcite * 1.1 + 0.02);
cStand = clamp(max(cStand, max(cWave, cCheer * 1.5)), 0.0, 1.0);
float cBeat = uTime * (5.0 + 2.6 * cEnergy) + cPhase;
float cBounce = abs(sin(cBeat)) * (cStand * (0.012 + 0.11 * uExcite * cEnergy) + cCheer * (0.13 + 0.16 * cEnergy));
float cLift = mix(-0.42, 0.0, cStand) + cBounce + cWave * 0.32;
float cFlagger = step(fract(aSeed.z * 53.7), 0.07);
float cGest = smoothstep(0.93, 0.99, sin(uTime * 0.31 + cPhase * 7.0));
float cArmUp = clamp(uExcite * cEnergy * 0.72 + cCheer * 1.4 + cWave * 1.6 + cGest * 0.7, 0.0, 1.0);
float cSide = (abs(aPart - 4.0) < 0.5 || abs(aPart - 6.0) < 0.5) ? 1.0 : -1.0;
bool cIsArm = aPart > 3.5;
float cRaise = 0.08 + 0.05 * sin(uTime * 0.8 + cPhase * 2.0) + cArmUp * (2.35 + 0.35 * sin(uTime * (7.0 + 3.0 * cEnergy) + cPhase * 3.0 + cSide) * (1.0 - cWave)) + cWave * 0.45;
if (cSide > 0.0) cRaise *= mix(fract(aSeed.w * 31.0) > 0.35 ? 1.0 : 0.25, 1.0, cWave);
if (cSide < 0.0 && cFlagger > 0.5) cRaise = max(cRaise, 1.7 + 0.5 * cArmUp + 0.35 * sin(uTime * 6.0 + cPhase));
float cA = cSide * cRaise;
float cCo = cos(cA);
float cSi = sin(cA);
mat3 cRot = cIsArm ? mat3(cCo, cSi, 0.0, -cSi, cCo, 0.0, 0.0, 0.0, 1.0) : mat3(1.0);
vec3 cPivot = vec3(cSide * 0.26, 1.37, 0.0);
`;

const CROWD_POS = /* glsl */ `
if (cIsArm) {
  vec3 cp = transformed;
  if (aPart > 8.5) cp.z += sin(uTime * 12.0 + aFlagUV.x * 4.0 + cPhase) * 0.1 * aFlagUV.x;
  if (aPart > 7.5 && cFlagger < 0.5) cp = cPivot;
  transformed = cPivot + cRot * (cp - cPivot);
}
transformed.y += cLift;
transformed.z -= (1.0 - cStand) * 0.14;
transformed.x += sin(uTime * 1.3 + cPhase) * 0.035 * transformed.y * (0.3 + cStand);
`;

const CROWD_COLOR = /* glsl */ `
vColor = vec4(1.0);
{
  float r1 = sHash11(aSeed.z * 91.7 + 1.3);
  float r2 = sHash11(aSeed.z * 47.3 + 7.1);
  float r3 = sHash11(aSeed.z * 13.1 + 3.7);
  vec3 shirt = instanceColor.rgb;
  vec3 skin = skinCol(r1);
  vec3 cc = shirt;
  if (aPart < 0.5) cc = pantsCol(r2);
  else if (aPart < 1.5) cc = shirt;
  else if (aPart < 2.5) cc = skin;
  else if (aPart < 3.5) cc = r3 < 0.36 ? hatCol(fract(r3 * 7.31)) : hairCol(fract(r3 * 5.17));
  else if (aPart < 5.5) cc = fract(aSeed.z * 23.0) < 0.42 ? skin : shirt;
  else if (aPart < 7.5) cc = skin;
  else if (aPart < 8.5) cc = vec3(0.04);
  vColor = vec4(cc, 1.0);
}
vFlagUV = aFlagUV;
vPart = aPart;
vFlagKind = floor(fract(aSeed.z * 17.3) * 5.0);
`;

const CROWD_FRAG_DECL = /* glsl */ `
varying vec2 vFlagUV;
varying float vPart;
varying float vFlagKind;
`;

const CROWD_FRAG = /* glsl */ `
if (vPart > 8.5) {
  vec3 fc;
  vec2 fuv = vFlagUV;
  if (vFlagKind < 0.5) {
    fc = mix(vec3(0.62, 0.02, 0.04), vec3(0.85), step(0.5, fract(fuv.y * 3.5)));
    if (fuv.x < 0.42 && fuv.y > 0.5) fc = vec3(0.02, 0.04, 0.25);
  } else if (vFlagKind < 1.5) {
    fc = vec3(mod(floor(fuv.x * 5.0) + floor(fuv.y * 3.0), 2.0) * 0.82 + 0.02);
  } else if (vFlagKind < 2.5) fc = vec3(0.72, 0.04, 0.03);
  else if (vFlagKind < 3.5) fc = vec3(0.85, 0.62, 0.02);
  else fc = vec3(0.03, 0.4, 0.08);
  diffuseColor.rgb = fc;
}
`;

export interface CrowdResult {
  mesh: THREE.InstancedMesh;
  flashes: THREE.Points;
  count: number;
}

export function buildCrowd(
  seats: Seat[],
  target: number,
  flashCount: number,
  rng: Rng,
  shared: SharedUniforms,
  disposer: Disposer,
): CrowdResult {
  // ---- choose occupied spots ---------------------------------------------------------------
  const apron = seats.filter((s) => s.kind === 1);
  const cross = seats.filter((s) => s.kind === 2);
  const seated = seats.filter((s) => s.kind === 0);
  const nApron = Math.min(apron.length, Math.round(target * 0.07));
  const nCross = Math.min(cross.length, Math.round(target * 0.018));
  const nSeat = Math.min(seated.length, target - nApron - nCross);
  // section popularity + low-frequency clumping so empty seats come in patches
  const secPop = new Map<number, number>();
  // the emptier the stadium, the more strongly people prefer the good (lower, front) seats
  const fill = Math.min(1, target / Math.max(1, seats.length));
  const bias = 1 + 3 * (1 - fill);
  const pick = (list: Seat[], n: number, weightFn: (s: Seat) => number): Seat[] => {
    const keyed = list.map((s) => ({ s, k: Math.pow(rng.next(), 1 / Math.max(0.01, Math.pow(weightFn(s), bias))) }));
    keyed.sort((a, b) => b.k - a.k);
    return keyed.slice(0, n).map((x) => x.s);
  };
  const clumpPhase = rng.next() * 100;
  const chosen: Seat[] = [
    ...pick(seated, nSeat, (s) => {
      let p = secPop.get(s.section);
      if (p === undefined) {
        p = 0.72 + rng.next() * 0.28;
        secPop.set(s.section, p);
      }
      const clump = 0.75 + 0.25 * Math.sin(s.a * 23.0 + clumpPhase + s.row * 0.7) * Math.sin(s.a * 7.0 - clumpPhase);
      return s.weight * p * clump;
    }),
    ...pick(apron, nApron, () => 1),
    ...pick(cross, nCross, () => 1),
  ];
  const count = chosen.length;

  // per-section team colour (a block of the same shirts)
  const secTeam = new Map<number, number>();
  const totalW = SHIRTS.reduce((a, s) => a + s[1], 0);
  const shirt = (): number => {
    let x = rng.next() * totalW;
    for (const [c, w] of SHIRTS) {
      x -= w;
      if (x <= 0) return c;
    }
    return SHIRTS[0][0];
  };

  const geo = buildFigure();
  disposer.add(geo);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.0 });
  disposer.add(mat);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uExcite = shared.uExcite;
    shader.uniforms.uCheer = shared.uCheer;
    shader.uniforms.uCheerR = shared.uCheerR;
    shader.uniforms.uWaveAng = shared.uWaveAng;
    shader.uniforms.uWaveAmp = shared.uWaveAmp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + CROWD_VERT_DECL)
      .replace('#include <beginnormal_vertex>', CROWD_ANIM + '\n#include <beginnormal_vertex>\nobjectNormal = cRot * objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + CROWD_POS)
      .replace('#include <color_vertex>', CROWD_COLOR);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CROWD_FRAG_DECL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + CROWD_FRAG);
  };
  mat.customProgramCacheKey = () => 'stadium-crowd-v1';

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = 'StadiumCrowd';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const seed = new Float32Array(count * 4);
  const colors = new Float32Array(count * 3);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const s = chosen[i];
    // face the arena centre (+Z local -> towards origin), with a little jitter; some chat sideways
    let yaw = Math.atan2(-Math.cos(s.a), -Math.sin(s.a)) + (rng.next() - 0.5) * 0.35;
    if (rng.chance(s.kind === 2 ? 0.5 : 0.06)) yaw += (rng.next() < 0.5 ? -1 : 1) * (0.7 + rng.next() * 0.9);
    q.setFromAxisAngle(yAxis, yaw);
    const kid = rng.chance(0.07);
    const scale = kid ? 0.68 + rng.next() * 0.08 : 0.9 + rng.next() * 0.17;
    sc.set(scale * (0.92 + rng.next() * 0.16), scale, scale);
    pos.set(s.x, s.y, s.z);
    m.compose(pos, q, sc);
    mesh.setMatrixAt(i, m);
    // seeds: phase, stand threshold, appearance, energy
    let threshold: number;
    if (s.kind !== 0) threshold = -0.4;
    else threshold = rng.chance(0.13) ? -0.3 : 0.12 + rng.next() * 0.85;
    const energy = Math.pow(rng.next(), 0.8);
    seed[i * 4 + 0] = rng.next();
    seed[i * 4 + 1] = threshold;
    seed[i * 4 + 2] = rng.next();
    seed[i * 4 + 3] = energy;
    let hex = shirt();
    if (s.section >= 0) {
      let team = secTeam.get(s.section);
      if (team === undefined) {
        team = rng.pick(TEAM);
        secTeam.set(s.section, team);
      }
      if (rng.chance(0.3)) hex = team;
    }
    col.set(hex);
    const shade = 0.85 + rng.next() * 0.2;
    colors[i * 3 + 0] = col.r * shade;
    colors[i * 3 + 1] = col.g * shade;
    colors[i * 3 + 2] = col.b * shade;
  }
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  if (mesh.boundingSphere) mesh.boundingSphere.radius += 2;

  // ---- camera flashes --------------------------------------------------------------------------
  const nf = Math.min(flashCount, count);
  const fpos = new Float32Array(nf * 3);
  const fseed = new Float32Array(nf);
  for (let i = 0; i < nf; i++) {
    const s = chosen[Math.floor(rng.next() * chosen.length)];
    const inward = 0.35;
    fpos[i * 3 + 0] = s.x - Math.cos(s.a) * inward;
    fpos[i * 3 + 1] = s.y + 1.45 + rng.next() * 0.25;
    fpos[i * 3 + 2] = s.z - Math.sin(s.a) * inward;
    fseed[i] = rng.next();
  }
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  fgeo.setAttribute('aSeed', new THREE.BufferAttribute(fseed, 1));
  fgeo.computeBoundingSphere();
  disposer.add(fgeo);
  const viewport = new THREE.Vector4();
  const fmat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uExcite: shared.uExcite,
      uCheer: shared.uCheer,
      uCheerR: shared.uCheerR,
      uViewH: { value: 800 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uExcite;
      uniform float uViewH;
      varying float vI;
      ${CHEER_GLSL}
      ${HASH_GLSL}
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float cheer = stadiumCheer(wp.xz, aSeed * 0.3);
        float rate = 0.0022 + 0.02 * uExcite * uExcite + 0.30 * min(cheer, 1.5);
        float t = uTime * 7.0 + aSeed * 31.0;
        float slot = floor(t);
        float h = sHash12(vec2(slot, aSeed * 977.0));
        float f = fract(t);
        vI = step(h, rate) * exp(-f * 5.0) * (0.6 + 0.4 * sHash11(slot + aSeed * 13.0));
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        float px = 0.5 * projectionMatrix[1][1] * uViewH * 0.5 / max(0.1, -mv.z);
        gl_PointSize = vI > 0.002 ? clamp(px, 2.5, 28.0) : 0.0;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vI;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c) * 2.0;
        float core = exp(-d * d * 10.0);
        float halo = exp(-d * d * 2.5) * 0.25;
        vec3 col = vec3(0.92, 0.95, 1.0) * clamp(vI * (core * 30.0 + halo * 6.0), 0.0, 40.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  disposer.add(fmat);
  const flashes = new THREE.Points(fgeo, fmat);
  flashes.name = 'StadiumCameraFlashes';
  flashes.frustumCulled = false;
  flashes.renderOrder = 2;
  flashes.onBeforeRender = (renderer) => {
    renderer.getCurrentViewport(viewport);
    fmat.uniforms.uViewH.value = viewport.w;
  };

  return {
    mesh,
    flashes,
    count,
  };
}
