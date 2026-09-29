import * as THREE from 'three';
import { clamp, hash3 } from '../core/math';

export type Zone = 'front' | 'rear' | 'left' | 'right';
export const ZONES: Zone[] = ['front', 'rear', 'left', 'right'];

/** A mesh the damage model can dent. Its geometry is in car space (transform baked). */
export class Deformable {
  readonly mesh: THREE.Mesh;
  readonly name: string;
  readonly orig: Float32Array;
  readonly off: Float32Array;
  readonly pos: THREE.BufferAttribute;
  readonly nrm: THREE.BufferAttribute;
  readonly dmg: THREE.BufferAttribute;
  readonly group: Int32Array;
  readonly center = new THREE.Vector3();
  radius = 0;
  dirty = false;
  /**
   * `source`: the template geometry this mesh was cloned from. The smoothing groups only depend on it,
   * so every car of the same model shares one copy (building them is the slow part of spawning a car).
   */
  constructor(mesh: THREE.Mesh, readonly maxDeform: number, readonly stiffness: number, source?: THREE.BufferGeometry) {
    this.mesh = mesh;
    this.name = mesh.name;
    const g = mesh.geometry;
    if (!g.index) {
      // decals come out non-indexed
      const n = g.getAttribute('position').count;
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    this.pos = g.getAttribute('position') as THREE.BufferAttribute;
    this.nrm = g.getAttribute('normal') as THREE.BufferAttribute;
    const n = this.pos.count;
    this.orig = new Float32Array(this.pos.array as Float32Array);
    this.off = new Float32Array(n * 3);
    let dmg = g.getAttribute('dmg') as THREE.BufferAttribute | undefined;
    if (!dmg) {
      dmg = new THREE.BufferAttribute(new Float32Array(n), 1);
      dmg.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('dmg', dmg);
    }
    this.dmg = dmg;
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.nrm.setUsage(THREE.DynamicDrawUsage);
    let grp = source ? groupCache.get(source) : undefined;
    if (!grp || grp.length !== n) {
      grp = buildSmoothGroups(this.orig, this.nrm.array as Float32Array);
      if (source) groupCache.set(source, grp);
    }
    this.group = grp;
    g.computeBoundingSphere();
    this.center.copy(g.boundingSphere!.center);
    this.radius = g.boundingSphere!.radius;
  }

  /** Recompute normals, keeping creases: vertices that share a position and roughly a normal are averaged. */
  recomputeNormals() {
    const g = this.mesh.geometry;
    const p = this.pos.array as Float32Array;
    const idx = g.index!.array;
    const n = this.pos.count;
    const acc = new Float32Array(n * 3);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
      const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      acc[a] += nx; acc[a + 1] += ny; acc[a + 2] += nz;
      acc[b] += nx; acc[b + 1] += ny; acc[b + 2] += nz;
      acc[c] += nx; acc[c + 1] += ny; acc[c + 2] += nz;
    }
    const grp = this.group;
    const sum = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = grp[i] * 3;
      sum[r] += acc[i * 3];
      sum[r + 1] += acc[i * 3 + 1];
      sum[r + 2] += acc[i * 3 + 2];
    }
    const out = this.nrm.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const r = grp[i] * 3;
      const x = sum[r], y = sum[r + 1], z = sum[r + 2];
      const l = Math.hypot(x, y, z) || 1;
      out[i * 3] = x / l;
      out[i * 3 + 1] = y / l;
      out[i * 3 + 2] = z / l;
    }
    this.nrm.needsUpdate = true;
  }

  flush() {
    if (!this.dirty) return;
    this.pos.needsUpdate = true;
    this.dmg.needsUpdate = true;
    this.recomputeNormals();
    this.mesh.geometry.computeBoundingSphere();
    this.dirty = false;
  }
}

const groupCache = new WeakMap<THREE.BufferGeometry, Int32Array>();

function buildSmoothGroups(pos: Float32Array, nrm: Float32Array): Int32Array {
  const n = pos.length / 3;
  const grp = new Int32Array(n);
  const buckets = new Map<string, number[]>();
  const COS = Math.cos(THREE.MathUtils.degToRad(40));
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos[i * 3] * 2000)},${Math.round(pos[i * 3 + 1] * 2000)},${Math.round(pos[i * 3 + 2] * 2000)}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    let rep = -1;
    for (const j of list) {
      const d = nrm[i * 3] * nrm[j * 3] + nrm[i * 3 + 1] * nrm[j * 3 + 1] + nrm[i * 3 + 2] * nrm[j * 3 + 2];
      if (d > COS) {
        rep = grp[j];
        break;
      }
    }
    grp[i] = rep >= 0 ? rep : i;
    list.push(i);
  }
  return grp;
}

const _u = new THREE.Vector3();
const _w = new THREE.Vector3();

/**
 * Push vertices near `p` (car space) along `dir` (unit, into the car) by up to `depth` metres with a
 * smooth falloff over `radius`, plus position-hashed crumple so dents look like bent sheet metal.
 * `center` is the middle of the body: nothing is pushed more than about half-way to it.
 */
export function dent(defs: Deformable[], p: THREE.Vector3, dir: THREE.Vector3, depth: number, radius: number, center: THREE.Vector3): number {
  const R2 = radius * radius;
  _u.set(0, 1, 0);
  if (Math.abs(dir.y) > 0.8) _u.set(1, 0, 0);
  _u.cross(dir).normalize();
  _w.crossVectors(dir, _u).normalize();
  let moved = 0;
  for (const d of defs) {
    if (!d.mesh.visible && d.name !== 'Body') continue;
    if (d.center.distanceTo(p) > radius + d.radius) continue;
    const o = d.orig, off = d.off, pa = d.pos.array as Float32Array, da = d.dmg.array as Float32Array;
    const n = d.pos.count;
    const maxD = d.maxDeform;
    const k = d.stiffness;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const ox = o[i3], oy = o[i3 + 1], oz = o[i3 + 2];
      const dx = ox - p.x, dy = oy - p.y, dz = oz - p.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= R2) continue;
      const t2 = d2 / R2;
      let w = (1 - t2) * (1 - t2);
      const h1 = hash3(ox, oy, oz);
      const h2 = hash3(oy + 3.1, oz - 1.7, ox + 0.3);
      const h3 = hash3(oz - 2.3, ox + 5.9, oy - 0.8);
      w *= 0.72 + 0.28 * (h1 + 1);
      const push = depth * w * k;
      let nx = off[i3] + dir.x * push + (_u.x * h2 + _w.x * h3) * push * 0.32;
      let ny = off[i3 + 1] + dir.y * push + (_u.y * h2 + _w.y * h3) * push * 0.32;
      let nz = off[i3 + 2] + dir.z * push + (_u.z * h2 + _w.z * h3) * push * 0.32;
      // crush limit: along the hit direction, a vertex can't travel more than ~55% of its way to the centre
      const reach = -((ox - center.x) * dir.x + (oy - center.y) * dir.y + (oz - center.z) * dir.z);
      const along = nx * dir.x + ny * dir.y + nz * dir.z;
      const lim = Math.max(0.04, reach * 0.55);
      if (along > lim) {
        const ex = along - lim;
        nx -= dir.x * ex;
        ny -= dir.y * ex;
        nz -= dir.z * ex;
      }
      const len = Math.hypot(nx, ny, nz);
      if (len > maxD) {
        const s = maxD / len;
        nx *= s;
        ny *= s;
        nz *= s;
      }
      off[i3] = nx;
      off[i3 + 1] = ny;
      off[i3 + 2] = nz;
      pa[i3] = ox + nx;
      pa[i3 + 1] = oy + ny;
      pa[i3 + 2] = oz + nz;
      da[i] = Math.min(1, da[i] + w * depth * 5.5);
      moved++;
    }
    d.dirty = true;
  }
  return moved;
}

/** Scrape paint without denting (grinding along a wall or car). */
export function scuff(defs: Deformable[], p: THREE.Vector3, radius: number, amount: number) {
  const R2 = radius * radius;
  for (const d of defs) {
    if (d.center.distanceTo(p) > radius + d.radius) continue;
    const o = d.orig, da = d.dmg.array as Float32Array;
    let any = false;
    for (let i = 0; i < d.pos.count; i++) {
      const dx = o[i * 3] - p.x, dy = o[i * 3 + 1] - p.y, dz = o[i * 3 + 2] - p.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= R2) continue;
      da[i] = Math.min(0.55, da[i] + (1 - d2 / R2) * amount);
      any = true;
    }
    if (any) d.dmg.needsUpdate = true;
  }
}

/** Zone weights for a hit at car-space point p (x left, z forward) on a body with the given half extents. */
export function zoneWeights(p: THREE.Vector3, center: THREE.Vector3, half: THREE.Vector3): Record<Zone, number> {
  const nx = (p.x - center.x) / half.x;
  const nz = (p.z - center.z) / half.z;
  // stretch: the ends are "front/rear" only within ~1/3 of the length from each end
  const fz = clamp((nz - 0.25) / 0.75, 0, 1.4);
  const rz = clamp((-nz - 0.25) / 0.75, 0, 1.4);
  const lx = clamp(nx, 0, 1.4) * 0.9;
  const rx = clamp(-nx, 0, 1.4) * 0.9;
  let w = { front: fz * fz, rear: rz * rz, left: lx * lx, right: rx * rx };
  const s = w.front + w.rear + w.left + w.right;
  if (s < 1e-4) {
    // roof or floor: spread evenly
    w = { front: 0.25, rear: 0.25, left: 0.25, right: 0.25 };
  } else {
    w.front /= s;
    w.rear /= s;
    w.left /= s;
    w.right /= s;
  }
  return w;
}
