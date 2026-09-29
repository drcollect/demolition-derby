import * as THREE from 'three';
import { RAPIER, GROUPS_ARENA, GROUPS_WALL, type ColliderTag } from '../../physics/world';
import { makeDirt } from '../../render/textures';
import { clamp, smoothstep } from '../../core/math';

/**
 * A figure-eight dirt track: two banked loops joined by two straights that cross at a 90° X in the
 * middle, so the field runs through its own traffic every lap. Each straight has a tabletop jump right
 * after the crossing. Terrain visuals and the physics heightfield come from one height function.
 *
 * Coordinates: metres, y up, the crossing at the origin, loops centred on the X axis.
 */

export interface Figure8Options {
  loopRadius: number; // centreline radius of each loop
  width: number; // drivable width
  bankDeg: number; // loop banking
  jumpHeight: number;
}

export const DEFAULT_FIGURE8: Figure8Options = { loopRadius: 24, width: 13, bankDeg: 7, jumpHeight: 0.62 };

export interface TrackSample {
  s: number;
  p: THREE.Vector3; // centreline point (y = surface height)
  t: THREE.Vector3; // unit tangent (direction of travel), horizontal
  n: THREE.Vector3; // unit left normal, horizontal
  out: number; // +1 when "left" points away from the loop centre (for banking), -1 otherwise, 0 on straights
  bank: number; // 0..1 how much of the loop banking applies here
  kappa: number; // curvature (1/m)
  straight: 0 | 1 | 2; // which straight (0 = on a loop)
}

export interface BarrierSegment {
  a: THREE.Vector3;
  b: THREE.Vector3;
  side: 'left' | 'right';
  kind: 'jersey' | 'tires';
}

export interface Jump {
  s0: number; // start of the ramp (arc length)
  s1: number; // end of the landing
  height: number;
}

const DS = 0.5; // centreline sample spacing (m)
const BARRIER_OFFSET = 1.4; // barrier centre line, outside the drivable edge

export class Figure8Track {
  readonly kind = 'figure8' as const;
  readonly opts: Figure8Options;
  readonly group = new THREE.Group();
  readonly colliders: RAPIER.Collider[] = [];
  readonly tags = new Map<number, ColliderTag>();
  readonly samples: TrackSample[] = [];
  readonly length: number;
  readonly barriers: BarrierSegment[] = [];
  readonly jumps: Jump[] = [];
  /** arc length where each straight passes the crossing */
  readonly crossingS: [number, number];
  /** start/finish line */
  readonly startS = 3;
  /** barrier centre line, measured outward from the drivable edge */
  readonly barrierOffset = BARRIER_OFFSET;
  readonly bounds = { minX: -74, maxX: 74, minZ: -42, maxZ: 42 };
  readonly loopCenters: [THREE.Vector3, THREE.Vector3];
  private grid: { cols: number; rows: number; dx: number; dz: number; h: Float32Array };
  private buckets = new Map<string, number[]>();

  constructor(world: RAPIER.World, opts: Partial<Figure8Options> = {}) {
    this.opts = { ...DEFAULT_FIGURE8, ...opts };
    this.group.name = 'Figure8';
    const r = this.opts.loopRadius;
    const phi = Math.PI / 4; // 90° crossing
    const d = r / Math.sin(phi);
    const ls = Math.sqrt(d * d - r * r);
    const cA = new THREE.Vector3(-d, 0, 0);
    const cB = new THREE.Vector3(d, 0, 0);
    this.loopCenters = [cA, cB];
    const tA = (sz: number) => new THREE.Vector3(-ls * Math.cos(phi), 0, sz * ls * Math.sin(phi));
    const tB = (sz: number) => new THREE.Vector3(ls * Math.cos(phi), 0, sz * ls * Math.sin(phi));

    // --- centreline: straight 1 (A+ → B−), loop B (a right-hander), straight 2 (B+ → A−), loop A (a left-hander)
    const pts: { p: THREE.Vector3; straight: 0 | 1 | 2; out: number; loop: 0 | 1 | 2 }[] = [];
    const addLine = (a: THREE.Vector3, b: THREE.Vector3, straight: 1 | 2) => {
      const len = a.distanceTo(b);
      const n = Math.round(len / DS);
      for (let i = 0; i < n; i++) pts.push({ p: a.clone().lerp(b, i / n), straight, out: 0, loop: 0 });
    };
    const addArc = (c: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3, ccw: boolean, loop: 1 | 2) => {
      const a0 = Math.atan2(from.z - c.z, from.x - c.x);
      let a1 = Math.atan2(to.z - c.z, to.x - c.x);
      if (ccw && a1 <= a0) a1 += Math.PI * 2;
      if (!ccw && a1 >= a0) a1 -= Math.PI * 2;
      const len = Math.abs(a1 - a0) * r;
      const n = Math.round(len / DS);
      for (let i = 0; i < n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        // `ccw` is in atan2(z, x) terms, which is clockwise seen from above (+y): a right-hander, so the
        // car's left points away from the centre
        pts.push({ p: new THREE.Vector3(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r), straight: 0, out: ccw ? 1 : -1, loop });
      }
    };
    addLine(tA(1), tB(-1), 1);
    addArc(cB, tB(-1), tB(1), true, 2);
    addLine(tB(1), tA(-1), 2);
    addArc(cA, tA(-1), tA(1), false, 1);

    const n = pts.length;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i].p;
      const next = pts[(i + 1) % n].p;
      const prev = pts[(i - 1 + n) % n].p;
      const t = next.clone().sub(prev).setY(0).normalize();
      const left = new THREE.Vector3(t.z, 0, -t.x); // up × t: the left of the direction of travel
      const kappa = pts[i].straight ? 0 : 1 / r;
      this.samples.push({ s, p: p.clone(), t, n: left, out: pts[i].out, bank: pts[i].straight ? 0 : 1, kappa, straight: pts[i].straight });
      s += p.distanceTo(next);
    }
    this.length = s;

    // banking eases in and out over 9 m at the ends of each loop
    const ease = 9;
    for (const smp of this.samples) {
      if (smp.straight) continue;
      let dEnd = Infinity;
      for (const other of [this.firstStraightS(1), this.firstStraightS(2), this.lastStraightS(1), this.lastStraightS(2)]) {
        dEnd = Math.min(dEnd, this.arcDistance(smp.s, other));
      }
      smp.bank = smoothstep(0, ease, dEnd);
    }

    // crossing: where each straight passes the origin
    const s1 = this.samples.filter((x) => x.straight === 1);
    const s2 = this.samples.filter((x) => x.straight === 2);
    const closest = (arr: TrackSample[]) => arr.reduce((a, b) => (a.p.lengthSq() < b.p.lengthSq() ? a : b)).s;
    this.crossingS = [closest(s1), closest(s2)];

    // a roller jump just after the crossing on both straights: long, gentle faces so a car at race
    // speed gets a short hop and lands before the loop (the straights are only 24 m past the X)
    for (const cs of this.crossingS) this.jumps.push({ s0: cs + 6.5, s1: cs + 19.5, height: this.opts.jumpHeight });

    // surface heights along the centreline
    for (const smp of this.samples) smp.p.y = this.profile(smp.s);

    for (let i = 0; i < this.samples.length; i++) {
      const p = this.samples[i].p;
      const key = this.bucketKey(p.x, p.z);
      if (!this.buckets.has(key)) this.buckets.set(key, []);
      this.buckets.get(key)!.push(i);
    }

    this.grid = this.buildHeightGrid();
    this.buildBarriers();
    this.buildPhysics(world);
    this.buildGroundMesh();
  }

  // ------------------------------------------------------------------------------------------------
  private firstStraightS(which: 1 | 2) {
    return this.samples.find((x) => x.straight === which)!.s;
  }
  private lastStraightS(which: 1 | 2) {
    const arr = this.samples.filter((x) => x.straight === which);
    return arr[arr.length - 1].s;
  }

  /** shortest distance along the loop between two arc lengths */
  arcDistance(a: number, b: number) {
    const d = Math.abs(a - b) % this.length;
    return Math.min(d, this.length - d);
  }

  /** forward distance from a to b (0..length) */
  ahead(a: number, b: number) {
    return (((b - a) % this.length) + this.length) % this.length;
  }

  /** centreline height (jumps) at arc length s */
  profile(s: number): number {
    let h = 0;
    for (const j of this.jumps) {
      const d = this.ahead(j.s0, s);
      const len = j.s1 - j.s0;
      if (d > len) continue;
      const up = len * 0.46, top = len * 0.05;
      if (d < up) h = Math.max(h, j.height * smoothstep(0, 1, d / up));
      else if (d < up + top) h = Math.max(h, j.height);
      else h = Math.max(h, j.height * (1 - smoothstep(0, 1, (d - up - top) / (len - up - top))));
    }
    return h;
  }

  sampleAt(s: number): TrackSample {
    const i = Math.floor(((((s % this.length) + this.length) % this.length) / this.length) * this.samples.length);
    return this.samples[Math.min(this.samples.length - 1, i)];
  }

  private bucketKey(x: number, z: number) {
    return `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
  }

  /**
   * Nearest centreline sample. With `hint` (a previous sample index) only samples within `window` of it
   * are considered, which keeps a car on its own straight through the crossing.
   */
  nearest(x: number, z: number, hint = -1, window = 60): { index: number; dist: number; lateral: number } {
    let best = -1, bestD = Infinity;
    const N = this.samples.length;
    if (hint >= 0) {
      const w = Math.round(window / DS);
      for (let k = -w; k <= w; k++) {
        const i = (hint + k + N) % N;
        const p = this.samples[i].p;
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    } else {
      const bx = Math.floor(x / 4), bz = Math.floor(z / 4);
      for (let rr = 0; rr <= 6 && best < 0; rr++) {
        for (let ix = bx - rr; ix <= bx + rr; ix++) {
          for (let iz = bz - rr; iz <= bz + rr; iz++) {
            const list = this.buckets.get(`${ix},${iz}`);
            if (!list) continue;
            for (const i of list) {
              const p = this.samples[i].p;
              const d = (p.x - x) ** 2 + (p.z - z) ** 2;
              if (d < bestD) {
                bestD = d;
                best = i;
              }
            }
          }
        }
      }
      if (best < 0) {
        for (let i = 0; i < N; i++) {
          const p = this.samples[i].p;
          const d = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    const smp = this.samples[best];
    const lateral = (x - smp.p.x) * smp.n.x + (z - smp.p.z) * smp.n.z;
    return { index: best, dist: Math.sqrt(bestD), lateral };
  }

  /**
   * Terrain heights: every centreline sample stamps its cross-section (jump profile, loop banking, then
   * shoulders falling off to the field) into the grid; overlapping stamps keep the highest surface.
   */
  private buildHeightGrid() {
    const b = this.bounds;
    const dx = 0.5, dz = 0.5;
    const cols = Math.round((b.maxX - b.minX) / dx);
    const rows = Math.round((b.maxZ - b.minZ) / dz);
    const h = new Float32Array((cols + 1) * (rows + 1));
    const W = this.opts.width / 2;
    const flat = W + BARRIER_OFFSET + 0.9; // road height carries on under the barrier
    const reach = flat + 3.5; // then the embankment falls away to the field
    const tanBank = Math.tan(THREE.MathUtils.degToRad(this.opts.bankDeg));
    for (const smp of this.samples) {
      const c0 = Math.max(0, Math.floor((smp.p.x - reach - 1 - b.minX) / dx));
      const c1 = Math.min(cols, Math.ceil((smp.p.x + reach + 1 - b.minX) / dx));
      const r0 = Math.max(0, Math.floor((smp.p.z - reach - 1 - b.minZ) / dz));
      const r1 = Math.min(rows, Math.ceil((smp.p.z + reach + 1 - b.minZ) / dz));
      const base = smp.p.y;
      for (let c = c0; c <= c1; c++) {
        const x = b.minX + c * dx - smp.p.x;
        for (let r = r0; r <= r1; r++) {
          const z = b.minZ + r * dz - smp.p.z;
          const along = x * smp.t.x + z * smp.t.z;
          const o = x * smp.n.x + z * smp.n.z;
          const ao = Math.abs(o);
          if (ao > reach) continue;
          // this sample owns a slice 0.5 m long (a bit more on the outside of a curve)
          if (Math.abs(along) > 0.3 + ao * smp.kappa * 0.5) continue;
          let surf = base;
          if (smp.bank > 0) surf += smp.bank * tanBank * clamp(smp.out * o + W, 0, 2 * W);
          const v = surf * (1 - smoothstep(flat, reach, ao));
          const i = c * (rows + 1) + r;
          if (v > h[i]) h[i] = v;
        }
      }
    }
    return { cols, rows, dx, dz, h };
  }

  /** Terrain height (bilinear on the physics grid). */
  heightAt(x: number, z: number): number {
    const g = this.grid, b = this.bounds;
    const fx = clamp((x - b.minX) / g.dx, 0, g.cols - 1e-4);
    const fz = clamp((z - b.minZ) / g.dz, 0, g.rows - 1e-4);
    const c = Math.floor(fx), r = Math.floor(fz);
    const tx = fx - c, tz = fz - r;
    const H = (cc: number, rr: number) => g.h[cc * (g.rows + 1) + rr];
    return (H(c, r) * (1 - tx) + H(c + 1, r) * tx) * (1 - tz) + (H(c, r + 1) * (1 - tx) + H(c + 1, r + 1) * tx) * tz;
  }

  private buildBarriers() {
    const W = this.opts.width / 2 + BARRIER_OFFSET;
    const N = this.samples.length;
    // Walk both edges sample by sample; a barrier stops where it reaches the other straight's barrier
    // line (so the corners of the open X are closed), and runs are cut into ~2.5 m segments.
    for (const side of [1, -1] as const) {
      let run: THREE.Vector3[] = [];
      let sinceLast = 0;
      const flush = () => {
        for (let k = 0; k + 1 < run.length; k++) {
          this.barriers.push({ a: run[k], b: run[k + 1], side: side > 0 ? 'left' : 'right', kind: 'jersey' });
        }
        run = [];
      };
      let prev: THREE.Vector3 | null = null;
      for (let k = 0; k <= N; k++) {
        const smp = this.samples[k % N]; // runs past the end once so the loop closes
        const p = smp.p.clone().addScaledVector(smp.n, W * side);
        p.y = 0;
        // inside another stretch of track? (the crossing)
        const inside = this.nearestOther(p.x, p.z, smp.s, 20) < W - 0.2;
        if (inside) {
          if (run.length && prev && run[run.length - 1] !== prev) run.push(prev);
          flush();
          prev = null;
          continue;
        }
        if (!run.length) {
          run.push(p);
          sinceLast = 0;
        } else if (++sinceLast >= 5) {
          run.push(p);
          sinceLast = 0;
        }
        prev = p;
      }
      if (prev && run.length && run[run.length - 1] !== prev) run.push(prev);
      flush();
    }
    // tyres on the outside of the loops (where cars fly off), concrete everywhere else
    for (const b of this.barriers) {
      const mid = b.a.clone().add(b.b).multiplyScalar(0.5);
      const near = this.nearest(mid.x, mid.z);
      const smp = this.samples[near.index];
      if (smp.straight === 0 && Math.sign(near.lateral) === smp.out) b.kind = 'tires';
    }
  }

  /** distance from (x,z) to the nearest centreline point that is > `gap` metres away along the track from s */
  private nearestOther(x: number, z: number, s: number, gap: number) {
    let best = Infinity;
    const bx = Math.floor(x / 4), bz = Math.floor(z / 4);
    for (let ix = bx - 3; ix <= bx + 3; ix++) {
      for (let iz = bz - 3; iz <= bz + 3; iz++) {
        const list = this.buckets.get(`${ix},${iz}`);
        if (!list) continue;
        for (const i of list) {
          const smp = this.samples[i];
          if (this.arcDistance(smp.s, s) < gap) continue;
          best = Math.min(best, Math.hypot(smp.p.x - x, smp.p.z - z));
        }
      }
    }
    return best;
  }

  private buildPhysics(world: RAPIER.World) {
    const add = (desc: RAPIER.ColliderDesc, tag: ColliderTag) => {
      desc.setCollisionGroups(tag.kind === 'arena' && tag.part === 'wall' ? GROUPS_WALL : GROUPS_ARENA);
      const c = world.createCollider(desc);
      this.colliders.push(c);
      this.tags.set(c.handle, tag);
    };
    const g = this.grid, b = this.bounds;
    add(
      RAPIER.ColliderDesc.heightfield(g.rows, g.cols, g.h, { x: b.maxX - b.minX, y: 1, z: b.maxZ - b.minZ })
        .setTranslation((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2)
        .setFriction(0.7)
        .setRestitution(0.05),
      { kind: 'arena', part: 'floor' },
    );
    // safety slab under everything
    add(RAPIER.ColliderDesc.cuboid(120, 1, 80).setTranslation(0, -1.6, 0).setFriction(0.7), { kind: 'arena', part: 'floor' });
    // barriers
    for (const s of this.barriers) {
      const mid = s.a.clone().add(s.b).multiplyScalar(0.5);
      const len = s.a.distanceTo(s.b);
      const yaw = Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      // a little taller than the visual barrier, so a car sliding into it can't ride up its top edge
      const hgt = 1.35;
      const base = this.heightAt(mid.x, mid.z);
      add(
        RAPIER.ColliderDesc.cuboid(0.35, hgt / 2 + 0.4, len / 2 + 0.15)
          .setTranslation(mid.x, base + hgt / 2 - 0.4, mid.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setFriction(0.3)
          .setRestitution(s.kind === 'tires' ? 0.45 : 0.2),
        { kind: 'arena', part: 'wall', soft: s.kind === 'tires' ? 0.4 : 0.8 },
      );
    }
    // venue perimeter
    const pb = this.bounds;
    const walls: [number, number, number, number][] = [
      [0, pb.minZ - 1, (pb.maxX - pb.minX) / 2 + 2, 1],
      [0, pb.maxZ + 1, (pb.maxX - pb.minX) / 2 + 2, 1],
      [pb.minX - 1, 0, 1, (pb.maxZ - pb.minZ) / 2 + 2],
      [pb.maxX + 1, 0, 1, (pb.maxZ - pb.minZ) / 2 + 2],
    ];
    for (const [x, z, hx, hz] of walls) add(RAPIER.ColliderDesc.cuboid(hx, 4, hz).setTranslation(x, 3, z).setFriction(0.3), { kind: 'arena', part: 'wall' });
  }

  /** Ground mesh: the height grid, painted with a layout texture (track, shoulders, field). */
  private buildGroundMesh() {
    const g = this.grid, b = this.bounds;
    const cols = g.cols, rows = g.rows;
    const pos = new Float32Array((cols + 1) * (rows + 1) * 3);
    const uv = new Float32Array((cols + 1) * (rows + 1) * 2);
    for (let c = 0; c <= cols; c++) {
      for (let r = 0; r <= rows; r++) {
        const i = c * (rows + 1) + r;
        const x = b.minX + c * g.dx, z = b.minZ + r * g.dz;
        pos[i * 3] = x;
        pos[i * 3 + 1] = g.h[i];
        pos[i * 3 + 2] = z;
        uv[i * 2] = (x - b.minX) / (b.maxX - b.minX);
        uv[i * 2 + 1] = 1 - (z - b.minZ) / (b.maxZ - b.minZ);
      }
    }
    const idx = new Uint32Array(cols * rows * 6);
    let k = 0;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const a = c * (rows + 1) + r, bb = (c + 1) * (rows + 1) + r, cc = a + 1, dd = bb + 1;
        idx[k++] = a;
        idx[k++] = cc;
        idx[k++] = bb;
        idx[k++] = bb;
        idx[k++] = cc;
        idx[k++] = dd;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    const layout = this.paintLayout(2048);
    const dirt = makeDirt(1024, 7); // same (cached) texture as the Bowl
    // the golden-hour sun only grazes the ground, so the dirt is painted a little light and picks up more sky
    const mat = new THREE.MeshStandardMaterial({ map: layout, roughness: 0.95, metalness: 0, envMapIntensity: 0.95 });
    const detail = dirt.map;
    const tileScale = (b.maxX - b.minX) / 6;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDetail = { value: detail };
      sh.uniforms.uTile = { value: new THREE.Vector2(tileScale, tileScale * ((b.maxZ - b.minZ) / (b.maxX - b.minX))) };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nuniform vec2 uTile;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
vec3 det = texture2D(uDetail, vMapUv * uTile).rgb;
float lum = dot(det, vec3(0.333));
diffuseColor.rgb *= 0.55 + lum * 1.15;`,
        );
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'Figure8Ground';
    this.group.add(mesh);
  }

  /** Big layout texture: dry grass field, dirt track with shoulders, racing-line ruts, start line. */
  private paintLayout(w: number): THREE.CanvasTexture {
    const b = this.bounds;
    const hgt = Math.round((w * (b.maxZ - b.minZ)) / (b.maxX - b.minX));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = hgt;
    const g = cv.getContext('2d')!;
    const sx = w / (b.maxX - b.minX);
    const X = (x: number) => (x - b.minX) * sx;
    const Z = (z: number) => (z - b.minZ) * sx;
    // field
    g.fillStyle = '#5f6a35';
    g.fillRect(0, 0, w, hgt);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 60},${95 + Math.random() * 45},${40 + Math.random() * 30},${0.15 + Math.random() * 0.25})`;
      g.fillRect(Math.random() * w, Math.random() * hgt, 2 + Math.random() * 10, 2 + Math.random() * 10);
    }
    // `wob`: the line wanders sideways (m) as it goes round, like real ruts
    const path = (width: number, color: string, offset = 0, wob = 0, phase = 0) => {
      g.strokeStyle = color;
      g.lineWidth = width * sx;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.beginPath();
      this.samples.forEach((smp, i) => {
        const o = offset + wob * (Math.sin(smp.s * 0.071 + phase) * 0.7 + Math.sin(smp.s * 0.19 + phase * 2.3) * 0.3);
        const x = X(smp.p.x + smp.n.x * o), z = Z(smp.p.z + smp.n.z * o);
        if (i === 0) g.moveTo(x, z);
        else g.lineTo(x, z);
      });
      g.closePath();
      g.stroke();
    };
    const W = this.opts.width;
    path(W + 2 * (BARRIER_OFFSET + 2.6), '#96785a'); // shoulders (under the barriers and down the embankment)
    path(W + 1.5, '#ad8660'); // track
    // worn racing line (a wide darker band) and a few faint, wandering ruts
    path(4.5, 'rgba(70,48,32,0.14)', 0, 1.2, 0.4);
    path(2.2, 'rgba(62,43,28,0.12)', 0, 1.6, 2.1);
    for (const [off, ph] of [[-3.2, 1.1], [-1.1, 3.7], [1.3, 0.2], [3.3, 5.1]] as const) path(0.7, 'rgba(58,40,26,0.16)', off, 0.6, ph);
    for (const [off, ph] of [[-4.6, 2.2], [0.1, 4.4], [2.4, 0.9], [5.0, 3.3]] as const) path(0.3, 'rgba(48,33,22,0.14)', off, 0.9, ph);
    // start/finish checker line
    const st = this.sampleAt(this.startS);
    const cells = 10;
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < 2; j++) {
        const o = -W / 2 + (i + 0.5) * (W / cells);
        const a = (j - 0.5) * 0.9;
        const cx = st.p.x + st.n.x * o + st.t.x * a, cz = st.p.z + st.n.z * o + st.t.z * a;
        g.fillStyle = (i + j) % 2 ? '#f4f1ea' : '#161616';
        g.save();
        g.translate(X(cx), Z(cz));
        g.rotate(Math.atan2(st.t.z, st.t.x));
        g.fillRect(-0.45 * sx, -(W / cells / 2) * sx, 0.9 * sx, (W / cells) * sx);
        g.restore();
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  /** Grid slots behind the start line, two abreast, following the track back into the loop. */
  spawnPoints(n: number): { position: THREE.Vector3; yaw: number }[] {
    const out: { position: THREE.Vector3; yaw: number }[] = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 2), col = i % 2;
      const smp = this.sampleAt(this.startS - 4 - row * 7);
      const lat = (col ? -1 : 1) * 2.8;
      const p = smp.p.clone().addScaledVector(smp.n, lat);
      p.y = this.heightAt(p.x, p.z);
      out.push({ position: p, yaw: Math.atan2(smp.t.x, smp.t.z) });
    }
    return out;
  }

  /** A safe spot on the centreline at arc length s (for respawns). */
  respawnAt(s: number, lateral = 0): { position: THREE.Vector3; yaw: number } {
    const smp = this.sampleAt(s);
    const p = smp.p.clone().addScaledVector(smp.n, lateral);
    p.y = this.heightAt(p.x, p.z) + 0.6;
    return { position: p, yaw: Math.atan2(smp.t.x, smp.t.z) };
  }
}
