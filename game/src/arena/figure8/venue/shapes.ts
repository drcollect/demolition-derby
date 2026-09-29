import * as THREE from 'three';
import { GeoBuilder, type Rgb } from '../../stadium/util';

/*
 Small geometry helpers on top of the stadium GeoBuilder (which does flat-shaded quads/boxes/beams).
 These add smooth-shaded round things (poles, tanks, tyres), oriented boxes and gable prisms.
*/


/** Orthonormal frame with `dir` as local +Y. */
function frameAround(dir: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const h = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3().crossVectors(h, dir).normalize();
  const b = new THREE.Vector3().crossVectors(dir, a).normalize();
  return [a, b];
}

/** Smooth-shaded cylinder/cone from p0 (radius r0) to p1 (radius r1). */
export function cylinder(
  b: GeoBuilder,
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  r0: number,
  r1: number,
  segs: number,
  color: Rgb,
  opts: { capTop?: boolean; capBottom?: boolean; color1?: Rgb } = {},
): void {
  const dir = new THREE.Vector3().subVectors(p1, p0);
  const len = dir.length();
  if (len < 1e-6) return;
  dir.divideScalar(len);
  const [ax, bx] = frameAround(dir);
  const slope = (r0 - r1) / len;
  const c1 = opts.color1 ?? color;
  const ring0: number[] = [];
  const ring1: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const radial = new THREE.Vector3().addScaledVector(ax, ca).addScaledVector(bx, sa);
    const n = radial.clone().addScaledVector(dir, slope).normalize();
    ring0.push(b.vert(p0.clone().addScaledVector(radial, r0), n, i / segs, 0, color));
    ring1.push(b.vert(p1.clone().addScaledVector(radial, r1), n, i / segs, 1, c1));
  }
  for (let i = 0; i < segs; i++) b.idx.push(ring0[i], ring0[i + 1], ring1[i + 1], ring0[i], ring1[i + 1], ring1[i]);
  if (opts.capTop && r1 > 1e-4) disc(b, p1, dir, r1, segs, c1);
  if (opts.capBottom && r0 > 1e-4) disc(b, p0, dir.clone().negate(), r0, segs, color);
}

/** Flat disc facing `normal`. */
export function disc(b: GeoBuilder, c: THREE.Vector3, normal: THREE.Vector3, r: number, segs: number, color: Rgb): void {
  const n = normal.clone().normalize();
  const [ax, bx] = frameAround(n);
  const ic = b.vert(c, n, 0.5, 0.5, color);
  const ring: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const p = c.clone().addScaledVector(ax, Math.cos(a) * r).addScaledVector(bx, Math.sin(a) * r);
    ring.push(b.vert(p, n, 0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a), color));
  }
  // winding: (ax, bx, n) is right-handed, so ic, ring[i], ring[i+1] is counter-clockwise seen from +n
  for (let i = 0; i < segs; i++) b.idx.push(ic, ring[i], ring[i + 1]);
}

/** Low-poly smooth dome/sphere cap (for silo tops, bushes, water-tower tanks). */
export function dome(b: GeoBuilder, c: THREE.Vector3, r: number, ry: number, segs: number, rings: number, color: Rgb, full = false, colorBottom?: Rgb): void {
  const r0 = full ? -rings : 0;
  const rowsIdx: number[][] = [];
  for (let j = r0; j <= rings; j++) {
    const phi = (j / rings) * (Math.PI / 2);
    const cy = Math.sin(phi), cr = Math.cos(phi);
    const row: number[] = [];
    const col = colorBottom && j < 0 ? colorBottom : color;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const nx = Math.cos(a) * cr, nz = Math.sin(a) * cr;
      const n = new THREE.Vector3(nx / r, cy / ry, nz / r).normalize();
      row.push(b.vert(new THREE.Vector3(c.x + nx * r, c.y + cy * ry, c.z + nz * r), n, i / segs, j / rings, col));
    }
    rowsIdx.push(row);
  }
  for (let j = 0; j < rowsIdx.length - 1; j++) {
    const A = rowsIdx[j], B = rowsIdx[j + 1];
    for (let i = 0; i < segs; i++) b.idx.push(A[i], B[i + 1], A[i + 1], A[i], B[i], B[i + 1]);
  }
}

/** Box given a centre, yaw (about +Y) and full sizes; optional pitch/roll matrix instead. */
export function box(b: GeoBuilder, c: THREE.Vector3, yaw: number, sx: number, sy: number, sz: number, color: Rgb, skip: string[] = [], faceColor: Partial<Record<string, Rgb>> = {}): void {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(c);
  b.box(m, [-sx / 2, -sy / 2, -sz / 2], [sx / 2, sy / 2, sz / 2], color, skip, faceColor);
}

/** Box with its bottom face centred on `base`. */
export function boxOn(b: GeoBuilder, base: THREE.Vector3, yaw: number, sx: number, sy: number, sz: number, color: Rgb, skip: string[] = ['ny'], faceColor: Partial<Record<string, Rgb>> = {}): void {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(base);
  b.box(m, [-sx / 2, 0, -sz / 2], [sx / 2, sy, sz / 2], color, skip, faceColor);
}

/**
 * Gable (triangular prism) roof: ridge along local z, width w (x), length l (z), ridge height h above base.
 * `overhang` extends the eaves; the gable ends get `endColor`.
 */
export function gableRoof(b: GeoBuilder, m: THREE.Matrix4, w: number, l: number, h: number, color: Rgb, endColor: Rgb, overhang = 0.3): void {
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
  const hw = w / 2 + overhang, hl = l / 2 + overhang;
  const dropY = -overhang * (h / (w / 2));
  const up = new THREE.Vector3(0, 1, 0).transformDirection(m);
  const zAx = new THREE.Vector3(0, 0, 1).transformDirection(m);
  // two roof planes
  b.quad(P(-hw, dropY, -hl), P(-hw, dropY, hl), P(0, h, hl), P(0, h, -hl), color, up);
  b.quad(P(hw, dropY, -hl), P(0, h, -hl), P(0, h, hl), P(hw, dropY, hl), color, up);
  // gable triangles (walls, no overhang)
  b.tri(P(-w / 2, 0, l / 2), P(w / 2, 0, l / 2), P(0, h, l / 2), endColor, zAx);
  b.tri(P(-w / 2, 0, -l / 2), P(0, h, -l / 2), P(w / 2, 0, -l / 2), endColor, zAx.clone().negate());
  // roof undersides (visible from below at the eaves)
  const down = up.clone().negate();
  b.quad(P(-hw, dropY - 0.02, -hl), P(0, h - 0.02, -hl), P(0, h - 0.02, hl), P(-hw, dropY - 0.02, hl), [color[0] * 0.5, color[1] * 0.5, color[2] * 0.5], down);
  b.quad(P(hw, dropY - 0.02, -hl), P(hw, dropY - 0.02, hl), P(0, h - 0.02, hl), P(0, h - 0.02, -hl), [color[0] * 0.5, color[1] * 0.5, color[2] * 0.5], down);
}

/** Wheel: short smooth cylinder lying on its side, axis along `axle`. */
export function wheel(b: GeoBuilder, c: THREE.Vector3, axle: THREE.Vector3, r: number, width: number, tyre: Rgb, hub: Rgb, segs = 10): void {
  const a = axle.clone().normalize();
  const p0 = c.clone().addScaledVector(a, -width / 2);
  const p1 = c.clone().addScaledVector(a, width / 2);
  cylinder(b, p0, p1, r, r, segs, tyre);
  disc(b, p1, a, r * 0.98, segs, tyre);
  disc(b, p0, a.clone().negate(), r * 0.98, segs, tyre);
  disc(b, p1.clone().addScaledVector(a, 0.005), a, r * 0.55, segs, hub);
  disc(b, p0.clone().addScaledVector(a, -0.005), a.clone().negate(), r * 0.55, segs, hub);
}

/** Quad strip following a polyline (e.g. a banner or a rope), constant width, facing `side` function. */
export function ribbon(
  b: GeoBuilder,
  pts: THREE.Vector3[],
  halfWidth: number,
  widthDir: (i: number) => THREE.Vector3,
  color: Rgb,
  facing: (i: number) => THREE.Vector3,
): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const w0 = widthDir(i).clone().multiplyScalar(halfWidth);
    const w1 = widthDir(i + 1).clone().multiplyScalar(halfWidth);
    b.quad(pts[i].clone().sub(w0), pts[i + 1].clone().sub(w1), pts[i + 1].clone().add(w1), pts[i].clone().add(w0), color, facing(i));
  }
}

/** Horizontal yaw that makes local +Z point along (dx, dz). */
export function yawTo(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Point `base + right*x + up*y + fwd*z` for a yawed local frame. */
export function local(base: THREE.Vector3, yaw: number, x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // local +x -> (c, 0, -s), local +z -> (s, 0, c)
  return out.set(base.x + c * x + s * z, base.y + y, base.z - s * x + c * z);
}

