import * as THREE from 'three';
import type { BarrierSegment, Figure8Track } from '../track';

/** Height of the venue's own ground plane (just under the track's terrain so the two never z-fight). */
export const GROUND_Y = -0.02;

/** One chain of barrier segments that share end points (a continuous wall). */
export interface BarrierRun {
  segs: BarrierSegment[];
  /** true when the last segment connects back to the first */
  closed: boolean;
}

/**
 * Site analysis around a Figure8Track: keep-out tests (drivable width + shoulders around every centreline
 * sample), ground heights and the barrier chains. Everything decorative asks this before it is placed.
 */
export class Site {
  readonly track: Figure8Track;
  /** half the drivable width */
  readonly half: number;
  /** hard keep-out radius around every centreline sample: half width + 3 m shoulder */
  readonly clear: number;
  /** where the road embankment has fallen back to field level (solid props go beyond this) */
  readonly flat: number;
  /** areas kept free of solid props (the loop infields are the wreck yard in race mode) */
  readonly reserved: { x: number; z: number; r: number }[];
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  readonly runs: BarrierRun[];

  constructor(track: Figure8Track) {
    this.track = track;
    this.half = track.opts.width / 2;
    this.clear = this.half + 3;
    const off = (track as { barrierOffset?: number }).barrierOffset ?? 1.4;
    this.flat = Math.max(this.clear, this.half + off + 0.9 + 3.5);
    this.reserved = track.loopCenters.map((c) => ({ x: c.x, z: c.z, r: 11 }));
    this.bounds = { ...track.bounds };
    this.runs = chainBarriers(track.barriers);
  }

  /** Horizontal distance to the nearest centreline sample. */
  dist(x: number, z: number): number {
    return this.track.nearest(x, z).dist;
  }

  /**
   * True when a disc of radius r at (x, z) is off the track and its shoulders (hard = true), or out on the
   * flat field beyond the embankment (default), and outside the reserved wreck-yard circles.
   */
  isClear(x: number, z: number, r = 0, margin = 0.6, hard = false): boolean {
    for (const q of this.reserved) if (Math.hypot(x - q.x, z - q.z) < q.r + r) return false;
    return this.dist(x, z) >= (hard ? this.clear : this.flat) + r + margin;
  }

  /** Every corner and edge midpoint of an oriented rectangle is clear (for boxes: vehicles, buildings). */
  rectClear(c: THREE.Vector3, yaw: number, halfW: number, halfL: number, margin = 0.6, hard = false): boolean {
    const ax = Math.cos(yaw), az = -Math.sin(yaw); // local +x
    const fx = Math.sin(yaw), fz = Math.cos(yaw); // local +z
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]) {
      const x = c.x + ax * u * halfW + fx * v * halfL;
      const z = c.z + az * u * halfW + fz * v * halfL;
      if (!this.isClear(x, z, 0, margin, hard)) return false;
    }
    return true;
  }

  inBounds(x: number, z: number): boolean {
    const b = this.bounds;
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  }

  /** Ground height: the track terrain inside its bounds, the venue ground plane outside. */
  groundY(x: number, z: number): number {
    return this.inBounds(x, z) ? this.track.heightAt(x, z) : GROUND_Y;
  }

  /** Lowest ground under a disc (so a prop can be sunk in and never float). */
  groundMin(x: number, z: number, r: number): number {
    let m = this.groundY(x, z);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      m = Math.min(m, this.groundY(x + Math.cos(a) * r, z + Math.sin(a) * r));
    }
    return m;
  }
}

/** Group barrier segments into chains by shared end points (the track reuses the same points). */
function chainBarriers(segs: BarrierSegment[]): BarrierRun[] {
  const runs: BarrierRun[] = [];
  const eq = (a: THREE.Vector3, b: THREE.Vector3) => Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.z - b.z) < 1e-3;
  let cur: BarrierSegment[] = [];
  for (const s of segs) {
    if (cur.length && eq(cur[cur.length - 1].b, s.a) && cur[cur.length - 1].side === s.side) cur.push(s);
    else {
      if (cur.length) runs.push({ segs: cur, closed: false });
      cur = [s];
    }
  }
  if (cur.length) runs.push({ segs: cur, closed: false });
  // the walk around the loop starts mid-way: join a run that ends where another starts
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < runs.length && !merged; i++) {
      for (let j = 0; j < runs.length && !merged; j++) {
        if (i === j) continue;
        const A = runs[i].segs, B = runs[j].segs;
        if (A[0].side === B[0].side && eq(A[A.length - 1].b, B[0].a)) {
          runs[i] = { segs: A.concat(B), closed: false };
          runs.splice(j, 1);
          merged = true;
        }
      }
    }
  }
  for (const r of runs) {
    const s = r.segs;
    r.closed = s.length > 2 && eq(s[s.length - 1].b, s[0].a);
  }
  return runs;
}
