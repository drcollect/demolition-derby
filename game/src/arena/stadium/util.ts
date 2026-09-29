import * as THREE from 'three';

/** Stable 32-bit hash of (seed, tag) so every sub-system gets its own deterministic stream. */
export function hashSeed(seed: number, tag: string): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < tag.length; i++) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

/** mulberry32 PRNG. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.min(b, Math.floor(this.range(a, b + 1)));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.min(arr.length - 1, Math.floor(this.next() * arr.length))];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
}

/** Collects disposables so dispose() is one call. */
export class Disposer {
  private items: { dispose(): void }[] = [];
  add<T extends { dispose(): void }>(x: T): T {
    this.items.push(x);
    return x;
  }
  dispose(): void {
    for (const i of this.items) i.dispose();
    this.items.length = 0;
  }
}

/** Uniforms shared by several stadium materials (crowd, flashes, flags, dust...). */
export interface SharedUniforms {
  uTime: { value: number };
  uExcite: { value: number };
  uCheer: { value: THREE.Vector4[] }; // xy = world xz, z = start time, w = strength
  uCheerR: { value: number[] }; // falloff radius (huge = global)
  uWaveAng: { value: number };
  uWaveAmp: { value: number };
}

export const MAX_CHEERS = 4;

export function createSharedUniforms(): SharedUniforms {
  const cheers: THREE.Vector4[] = [];
  const radii: number[] = [];
  for (let i = 0; i < MAX_CHEERS; i++) {
    cheers.push(new THREE.Vector4(0, 0, -1e4, 0));
    radii.push(1);
  }
  return {
    uTime: { value: 0 },
    uExcite: { value: 0 },
    uCheer: { value: cheers },
    uCheerR: { value: radii },
    uWaveAng: { value: 0 },
    uWaveAmp: { value: 0 },
  };
}

/** GLSL for the cheer field (needs uTime + the cheer uniforms declared). */
export const CHEER_GLSL = /* glsl */ `
uniform vec4 uCheer[${MAX_CHEERS}];
uniform float uCheerR[${MAX_CHEERS}];
float stadiumCheer(vec2 p, float delay) {
  float c = 0.0;
  for (int i = 0; i < ${MAX_CHEERS}; i++) {
    float a = uTime - uCheer[i].z - delay;
    if (a > 0.0 && a < 7.0) {
      vec2 dd = p - uCheer[i].xy;
      float r = uCheerR[i];
      c += uCheer[i].w * exp(-dot(dd, dd) / (r * r)) * smoothstep(0.0, 0.18, a) * exp(-a * 0.7);
    }
  }
  return c;
}
`;

export const HASH_GLSL = /* glsl */ `
float sHash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float sHash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sHash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float sNoise2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash12(i), sHash12(i + vec2(1.0, 0.0)), u.x), mix(sHash12(i + vec2(0.0, 1.0)), sHash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float sNoise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = sHash13(i), b = sHash13(i + vec3(1,0,0)), c = sHash13(i + vec3(0,1,0)), d = sHash13(i + vec3(1,1,0));
  float e = sHash13(i + vec3(0,0,1)), f1 = sHash13(i + vec3(1,0,1)), g = sHash13(i + vec3(0,1,1)), h = sHash13(i + vec3(1,1,1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
}
`;

export type V3 = THREE.Vector3;
export type Rgb = [number, number, number];

const _c = new THREE.Color();
/** sRGB hex -> linear working-space triple. */
export function lin(hex: number | string): Rgb {
  _c.set(hex);
  return [_c.r, _c.g, _c.b];
}
export function scaleRgb(c: Rgb, s: number): Rgb {
  return [c[0] * s, c[1] * s, c[2] * s];
}
export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _n = new THREE.Vector3();

/**
 * Accumulates flat-shaded quads/triangles/boxes into one indexed BufferGeometry
 * (position, normal, uv, color + optional extra float attributes).
 */
export class GeoBuilder {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly uvs: number[] = [];
  readonly col: number[] = [];
  readonly idx: number[] = [];
  private extras = new Map<string, { size: number; data: number[]; cur: number[] }>();

  defineExtra(name: string, size: number, init: number[]): void {
    this.extras.set(name, { size, data: [], cur: init.slice() });
  }
  setExtra(name: string, v: number[]): void {
    const e = this.extras.get(name);
    if (e) e.cur = v.slice();
  }
  get vertexCount(): number {
    return this.pos.length / 3;
  }

  vert(p: V3, n: V3, u: number, v: number, c: Rgb): number {
    const i = this.pos.length / 3;
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uvs.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    for (const e of this.extras.values()) for (let k = 0; k < e.size; k++) e.data.push(e.cur[k] ?? 0);
    return i;
  }

  /**
   * Quad a-b-c-d (cyclic order). If `facing` is given the winding is flipped so the front face
   * points along it. Colours may be one colour or one per corner. uv: 8 numbers (per corner).
   */
  quad(a: V3, b: V3, c: V3, d: V3, color: Rgb | Rgb[], facing?: V3, uv?: number[]): void {
    _e1.subVectors(b, a);
    _e2.subVectors(c, a);
    _n.crossVectors(_e1, _e2);
    if (_n.lengthSq() < 1e-14) {
      _e1.subVectors(c, b);
      _e2.subVectors(d, b);
      _n.crossVectors(_e1, _e2);
    }
    _n.normalize();
    let flip = false;
    if (facing && _n.dot(facing) < 0) {
      flip = true;
      _n.negate();
    }
    const cols: Rgb[] = Array.isArray(color[0]) ? (color as Rgb[]) : [color as Rgb, color as Rgb, color as Rgb, color as Rgb];
    const u = uv ?? [0, 0, 1, 0, 1, 1, 0, 1];
    const n = _n.clone();
    const i0 = this.vert(a, n, u[0], u[1], cols[0]);
    const i1 = this.vert(b, n, u[2], u[3], cols[1]);
    const i2 = this.vert(c, n, u[4], u[5], cols[2]);
    const i3 = this.vert(d, n, u[6], u[7], cols[3]);
    if (flip) this.idx.push(i0, i2, i1, i0, i3, i2);
    else this.idx.push(i0, i1, i2, i0, i2, i3);
  }

  tri(a: V3, b: V3, c: V3, color: Rgb, facing?: V3, uv?: number[]): void {
    _e1.subVectors(b, a);
    _e2.subVectors(c, a);
    _n.crossVectors(_e1, _e2).normalize();
    let flip = false;
    if (facing && _n.dot(facing) < 0) {
      flip = true;
      _n.negate();
    }
    const u = uv ?? [0, 0, 1, 0, 0.5, 1];
    const n = _n.clone();
    const i0 = this.vert(a, n, u[0], u[1], color);
    const i1 = this.vert(b, n, u[2], u[3], color);
    const i2 = this.vert(c, n, u[4], u[5], color);
    if (flip) this.idx.push(i0, i2, i1);
    else this.idx.push(i0, i1, i2);
  }

  /**
   * Axis-aligned box [min,max] in local space transformed by m. `skip` lists faces to omit
   * ('px','nx','py','ny','pz','nz'). faceColor overrides per face.
   */
  box(
    m: THREE.Matrix4,
    min: [number, number, number],
    max: [number, number, number],
    color: Rgb,
    skip: string[] = [],
    faceColor: Partial<Record<string, Rgb>> = {},
  ): void {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const F = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix3(nm).normalize();
    const faces: [string, V3, V3, V3, V3, V3][] = [
      ['px', P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), F(1, 0, 0)],
      ['nx', P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), F(-1, 0, 0)],
      ['py', P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), F(0, 1, 0)],
      ['ny', P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), F(0, -1, 0)],
      ['pz', P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), F(0, 0, 1)],
      ['nz', P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0), F(0, 0, -1)],
    ];
    for (const [name, a, b, c, d, n] of faces) {
      if (skip.includes(name)) continue;
      this.quad(a, b, c, d, faceColor[name] ?? color, n);
    }
  }

  /** Box of square cross-section `t` spanning from p0 to p1 (a beam/strut). */
  beam(p0: V3, p1: V3, t: number, color: Rgb, tz?: number): void {
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const len = dir.length();
    if (len < 1e-6) return;
    dir.divideScalar(len);
    const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const xAxis = new THREE.Vector3().crossVectors(up, dir).normalize();
    const yAxis = new THREE.Vector3().crossVectors(dir, xAxis).normalize();
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, dir).setPosition(p0);
    const h = t / 2;
    const hz = (tz ?? t) / 2;
    this.box(m, [-h, -hz, 0], [h, hz, len], color, ['pz', 'nz']);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    for (const [name, e] of this.extras) g.setAttribute(name, new THREE.Float32BufferAttribute(e.data, e.size));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Point on the ring at angle a (radians, measured from +X towards +Z), radius r, height y. */
export function ringPoint(a: number, r: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
