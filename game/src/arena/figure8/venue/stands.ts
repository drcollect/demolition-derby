import * as THREE from 'three';
import { GeoBuilder, Rng, lin, scaleRgb, type Disposer, type Rgb } from '../../stadium/util';
import { flatPanel, type Sign } from '../../stadium/signage';
import type { Seat } from '../../stadium/stands';
import type { Layout, StandSpec } from './layout';
import { box, cylinder } from './shapes';
import { F8Sign } from './signs';

/*
 Grandstands and the catch fence.
 - Open aluminium bleachers: stepped treads/risers, bench planks, closed back/side skirts, guard rails.
 - The covered main grandstand: concrete deck with painted benches, front wall with sponsor boards, back
   wall, a sloping roof on front columns with a sign fascia, and the announcer booth on the roof.
 - Catch fence on the bounds: concrete base wall (sponsor boards), posts, rails, cables, chain-link.
 Seat positions (feet level, facing the track) are returned for the crowd.
*/

export interface Builders {
  matte: GeoBuilder; // concrete, wood, paint (rough)
  metal: GeoBuilder; // steel, aluminium
  paint: GeoBuilder; // vehicles / glossy painted metal
  lamps: GeoBuilder; // emissive
  signs: GeoBuilder; // sponsor atlas (lit by the scene)
  glow: GeoBuilder; // sponsor atlas, self-lit (backlit signs)
}

export interface Lamp {
  p: THREE.Vector3;
  size: number;
  color: THREE.Color;
  /** facing of a directional lamp (its glow fades when seen from behind); omit for bulbs */
  dir?: THREE.Vector3;
}

const ALU: Rgb = lin(0xb9bcbd);
const ALU_DARK: Rgb = lin(0x8a8e90);
const ALU_TREAD: Rgb = lin(0xa9aba7);
const CONCRETE: Rgb = lin(0xa7a296);
const CONCRETE_DARK: Rgb = lin(0x8a857a);
const STEEL: Rgb = lin(0x6f757b);
const GALV: Rgb = lin(0x9ea4a9);
const CREAM: Rgb = lin(0xe8e0cc);
const TRIM_RED: Rgb = lin(0xa8221c);
const ROOF_GREEN: Rgb = lin(0x2f5a3a);
const BENCH_COLS: Rgb[] = [lin(0x2f6b3f), lin(0xd8d2c0), lin(0x2f6b3f), lin(0xb13a26)];

const UP = new THREE.Vector3(0, 1, 0);

/** World point for a stand-local (x along, y up, z back from the front edge). */
function standPoint(s: StandSpec, x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(s.cx + x, y, s.frontZ - s.face * z);
}

/** Box in stand-local coordinates (min/max corners). */
function sbox(b: GeoBuilder, s: StandSpec, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: Rgb, skip: string[] = [], faceColor: Partial<Record<string, Rgb>> = {}) {
  const c = standPoint(s, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  box(b, c, 0, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), col, skip, faceColor);
}

function seatYaw(face: 1 | -1): number {
  // crowd.ts faces a figure toward (-cos a, -sin a); we want (0, face)
  return Math.atan2(-face, 0);
}

function inAisle(s: StandSpec, x: number, half: number): boolean {
  for (const a of s.aisles) if (Math.abs(x - a) < half) return true;
  return false;
}

/** Seats along the rows of a stand (feet level, a little behind the front of each tread). */
function standSeats(s: StandSpec, rng: Rng, section: number, seats: Seat[], spacing = 0.58, weight = 1) {
  const a = seatYaw(s.face);
  for (let i = 0; i < s.rows; i++) {
    const y = s.firstY + i * s.rise;
    const zl = i * s.depth + 0.28;
    const x0 = -s.length / 2 + 0.45, x1 = s.length / 2 - 0.45;
    const n = Math.floor((x1 - x0) / spacing);
    for (let k = 0; k < n; k++) {
      const x = x0 + (k + 0.5) * ((x1 - x0) / n) + (rng.next() - 0.5) * 0.1;
      if (inAisle(s, x, 0.95)) continue;
      const p = standPoint(s, x, y, zl + (rng.next() - 0.5) * 0.05);
      seats.push({ x: p.x, y: p.y, z: p.z, a, r: 0, kind: 0, tier: 0, row: i, section: section * 8 + Math.floor((x - x0) / 7), weight: weight * (1 - 0.25 * (i / s.rows)) });
    }
  }
}

/** Open aluminium bleachers. */
export function buildBleachers(s: StandSpec, B: Builders, rng: Rng, section: number, seats: Seat[]) {
  const L = s.length;
  const hx = L / 2;
  const topY = s.firstY + (s.rows - 1) * s.rise;
  const back = s.rows * s.depth;
  for (let i = 0; i < s.rows; i++) {
    const y = s.firstY + i * s.rise;
    const z0 = i * s.depth;
    const yPrev = i === 0 ? 0 : y - s.rise;
    // riser (closed, hides the legs of seated people) and tread
    sbox(B.metal, s, -hx, hx, yPrev, y, z0, z0 + 0.03, ALU_DARK, ['ny']);
    sbox(B.metal, s, -hx, hx, y - 0.04, y, z0, z0 + s.depth, ALU_TREAD, ['ny']);
    // bench planks (split at aisles)
    const cuts = [-hx + 0.05, ...s.aisles.flatMap((a) => [a - 0.6, a + 0.6]), hx - 0.05];
    for (let k = 0; k + 1 < cuts.length; k += 2) {
      sbox(B.metal, s, cuts[k], cuts[k + 1], y + 0.38, y + 0.43, z0 + 0.42, z0 + 0.7, ALU, ['ny']);
      // bench legs
      for (let x = cuts[k] + 0.3; x < cuts[k + 1]; x += 2.4) sbox(B.metal, s, x - 0.03, x + 0.03, y, y + 0.38, z0 + 0.52, z0 + 0.6, ALU_DARK, ['ny', 'py']);
    }
  }
  // closed back and ends (skirting), top rail
  sbox(B.metal, s, -hx, hx, 0, topY + 0.02, back, back + 0.04, ALU_DARK);
  for (const sx of [-1, 1]) {
    const x = sx * hx;
    // stepped side skirt: one panel per row
    for (let i = 0; i < s.rows; i++) {
      const y = s.firstY + i * s.rise;
      sbox(B.metal, s, x - 0.02, x + 0.02, 0, y, i * s.depth, (i + 1) * s.depth, ALU_DARK, ['ny']);
    }
    // side rail following the rake
    const p0 = standPoint(s, x, s.firstY + 1.0, 0.1);
    const p1 = standPoint(s, x, topY + 1.05, back - 0.05);
    B.metal.beam(p0, p1, 0.05, GALV);
    for (let i = 0; i <= s.rows; i += 3) {
      const ri = Math.min(i, s.rows - 1);
      const zz = ri * s.depth + 0.2;
      const yy = s.firstY + ri * s.rise;
      const k = zz / back;
      B.metal.beam(standPoint(s, x, yy, zz), standPoint(s, x, p0.y + (p1.y - p0.y) * k, zz), 0.045, GALV);
    }
  }
  // back guard rail
  const ry = topY + 1.05;
  B.metal.beam(standPoint(s, -hx, ry, back - 0.05), standPoint(s, hx, ry, back - 0.05), 0.055, GALV);
  B.metal.beam(standPoint(s, -hx, topY + 0.55, back - 0.05), standPoint(s, hx, topY + 0.55, back - 0.05), 0.035, GALV);
  for (let x = -hx; x <= hx + 0.01; x += 2.4) B.metal.beam(standPoint(s, x, topY, back - 0.05), standPoint(s, x, ry, back - 0.05), 0.045, GALV);
  // aisle hand rails
  for (const a of s.aisles) {
    B.metal.beam(standPoint(s, a, s.firstY + 0.9, 0.3), standPoint(s, a, topY + 0.9, back - 0.3), 0.045, GALV);
    for (let i = 0; i < s.rows; i += 2) {
      const zz = i * s.depth + 0.35;
      const k = (zz - 0.3) / (back - 0.6);
      B.metal.beam(standPoint(s, a, s.firstY + i * s.rise, zz), standPoint(s, a, s.firstY + 0.9 + (topY - s.firstY) * k, zz), 0.04, GALV);
    }
  }
  // front step for the first row
  sbox(B.metal, s, -hx, hx, 0, 0.02, -0.5, 0, ALU_DARK);
  standSeats(s, rng, section, seats);
}

export interface MainStandResult {
  booth: THREE.Vector3; // announcer booth window centre (for the PA / light)
  roofFrontY: number;
  flagPoles: THREE.Vector3[]; // tops of the roof flag poles
}

/** The covered main grandstand with the announcer booth on its roof. */
export function buildMainStand(s: StandSpec, B: Builders, rng: Rng, section: number, seats: Seat[], signPool: Sign[], lamps: Lamp[]): MainStandResult {
  const L = s.length;
  const hx = L / 2;
  const back = s.rows * s.depth;
  const topY = s.firstY + (s.rows - 1) * s.rise;
  // concrete deck
  for (let i = 0; i < s.rows; i++) {
    const y = s.firstY + i * s.rise;
    const z0 = i * s.depth;
    const shade = 0.94 + rng.next() * 0.06;
    sbox(B.matte, s, -hx, hx, i === 0 ? 0 : y - s.rise, y, z0, z0 + 0.05, scaleRgb(CONCRETE_DARK, shade), ['ny', 'py']);
    sbox(B.matte, s, -hx, hx, y - 0.12, y, z0, z0 + s.depth, scaleRgb(CONCRETE, shade), ['ny', 'nz', 'pz']);
    // painted wooden benches per section
    const cuts = [-hx + 0.3, ...s.aisles.flatMap((a) => [a - 0.7, a + 0.7]), hx - 0.3];
    for (let k = 0; k + 1 < cuts.length; k += 2) {
      const col = BENCH_COLS[(k / 2 + i) % 2 === 0 ? (k / 2) % BENCH_COLS.length : 1];
      sbox(B.matte, s, cuts[k], cuts[k + 1], y + 0.37, y + 0.43, z0 + 0.4, z0 + 0.72, col, ['ny']);
      sbox(B.matte, s, cuts[k], cuts[k + 1], y, y + 0.37, z0 + 0.5, z0 + 0.64, scaleRgb(CONCRETE_DARK, 0.8), ['ny', 'py']);
    }
  }
  // fill under the deck (seen from the ends)
  for (const sx of [-1, 1]) {
    const x = sx * hx;
    for (let i = 0; i < s.rows; i++) {
      const y = s.firstY + i * s.rise;
      sbox(B.matte, s, x - 0.15, x + 0.15, 0, y + 1.0, i * s.depth, (i + 1) * s.depth, CREAM, ['ny']);
    }
  }
  // front wall with a red cap, sponsor boards on it
  sbox(B.matte, s, -hx - 0.15, hx + 0.15, 0, s.firstY + 0.05, -0.28, 0, CREAM, ['ny'], { py: TRIM_RED });
  {
    const bh = s.firstY - 0.35;
    const bw = bh * 8;
    const n = Math.floor((L - 2) / (bw + 0.5));
    const slack = (L - n * bw) / (n + 1);
    const right = new THREE.Vector3(s.face, 0, 0); // viewer's right when looking at the stand from the track
    for (let k = 0; k < n; k++) {
      const x = -hx + slack + k * (bw + slack) + bw / 2;
      const c = standPoint(s, x, 0.2 + bh / 2, -0.29);
      const id = k === Math.floor(n / 2) ? F8Sign.Speedway : signPool[Math.floor(rng.next() * signPool.length)];
      flatPanel(B.signs, id, c, right, UP, bw, bh);
    }
  }
  // front rail
  const ry = s.firstY + 1.0;
  B.metal.beam(standPoint(s, -hx, ry, -0.14), standPoint(s, hx, ry, -0.14), 0.06, STEEL);
  B.metal.beam(standPoint(s, -hx, s.firstY + 0.5, -0.14), standPoint(s, hx, s.firstY + 0.5, -0.14), 0.04, STEEL);
  for (let x = -hx; x <= hx + 0.01; x += 2.2) B.metal.beam(standPoint(s, x, s.firstY, -0.14), standPoint(s, x, ry, -0.14), 0.05, STEEL);
  // stairs up to the deck at the aisles (in front of the front wall)
  for (const a of s.aisles) {
    const steps = 6;
    for (let k = 0; k < steps; k++) {
      const y1 = ((k + 1) / steps) * s.firstY;
      const z1 = -0.3 - (steps - 1 - k) * 0.32;
      sbox(B.matte, s, a - 0.7, a + 0.7, 0, y1, z1 - 0.32, z1, CONCRETE, ['ny']);
    }
    for (const sx of [-1, 1]) {
      B.metal.beam(standPoint(s, a + sx * 0.72, 0.95, -0.3 - steps * 0.32), standPoint(s, a + sx * 0.72, s.firstY + 0.95, -0.35), 0.05, STEEL);
    }
    // aisle rail up the deck
    B.metal.beam(standPoint(s, a, s.firstY + 0.9, 0.3), standPoint(s, a, topY + 0.9, back - 0.3), 0.05, STEEL);
  }
  // back wall (cream siding with a red band), up to the roof
  const roofBackY = topY + 4.6;
  const roofFrontY = roofBackY - 1.7;
  const roofFrontZ = -1.4;
  const roofBackZ = back + 0.35;
  sbox(B.matte, s, -hx - 0.15, hx + 0.15, 0, roofBackY, back, back + 0.3, CREAM, ['ny'], { py: CREAM });
  sbox(B.matte, s, -hx - 0.16, hx + 0.16, 2.2, 2.9, back + 0.3, back + 0.33, TRIM_RED, ['ny']);
  // end walls (closed up to the roof line at the back, open at the front)
  const roofY = (z: number) => roofFrontY + ((z - roofFrontZ) / (roofBackZ - roofFrontZ)) * (roofBackY - roofFrontY);
  for (const sx of [-1, 1]) {
    const x = sx * (hx + 0.15);
    const facing = new THREE.Vector3(sx, 0, 0);
    const zA = back * 0.45;
    const pts = [standPoint(s, x, 0, zA), standPoint(s, x, 0, back + 0.3), standPoint(s, x, roofY(back + 0.3), back + 0.3), standPoint(s, x, roofY(zA), zA)];
    B.matte.quad(pts[0], pts[1], pts[2], pts[3], CREAM, facing);
    B.matte.quad(pts[0], pts[3], pts[2], pts[1], scaleRgb(CREAM, 0.7), facing.clone().negate());
  }
  // roof: slab + fascia (sign band) + gutter
  {
    const t = 0.22;
    const p = (x: number, z: number, dy: number) => standPoint(s, x, roofY(z) + dy, z);
    const X0 = -hx - 1.2, X1 = hx + 1.2;
    B.matte.quad(p(X0, roofFrontZ, t), p(X1, roofFrontZ, t), p(X1, roofBackZ, t), p(X0, roofBackZ, t), ROOF_GREEN, UP);
    B.matte.quad(p(X0, roofFrontZ, 0), p(X0, roofBackZ, 0), p(X1, roofBackZ, 0), p(X1, roofFrontZ, 0), lin(0xcfc9b8), UP.clone().negate());
    // corrugation ribs on top
    for (let x = X0 + 0.5; x < X1; x += 1.0) {
      B.matte.quad(p(x - 0.05, roofFrontZ, t + 0.05), p(x + 0.05, roofFrontZ, t + 0.05), p(x + 0.05, roofBackZ, t + 0.05), p(x - 0.05, roofBackZ, t + 0.05), scaleRgb(ROOF_GREEN, 1.12), UP);
    }
    // fascia: red band with the speedway sign, facing the track
    const fz = roofFrontZ - 0.02;
    const fy1 = roofFrontY + t + 0.1;
    const fy0 = fy1 - 1.45;
    sbox(B.matte, s, X0, X1, fy0, fy1, roofFrontZ - 0.02, roofFrontZ + 0.25, TRIM_RED);
    const right = new THREE.Vector3(s.face, 0, 0);
    const signH = 1.15;
    const nSigns = 5;
    const span = (X1 - X0 - 2) / nSigns;
    for (let k = 0; k < nSigns; k++) {
      const x = X0 + 1 + span * (k + 0.5);
      const id = k === 2 ? F8Sign.Speedway : k % 2 === 0 ? F8Sign.Figure8 : signPool[Math.floor(rng.next() * signPool.length)];
      flatPanel(B.signs, id, standPoint(s, x, (fy0 + fy1) / 2, fz - 0.01), right, UP, Math.min(span - 0.6, signH * 8), signH);
    }
    // back edge
    sbox(B.matte, s, X0, X1, roofBackY - 0.3, roofBackY + t, roofBackZ - 0.05, roofBackZ + 0.05, TRIM_RED);
  }
  // front columns (I-beams) holding the roof edge
  for (let x = -hx; x <= hx + 0.01; x += L / 8) {
    const zc = -0.75;
    sbox(B.metal, s, x - 0.16, x + 0.16, 0, roofY(zc), zc - 0.05, zc + 0.05, STEEL, ['ny']);
    sbox(B.metal, s, x - 0.04, x + 0.04, 0, roofY(zc), zc - 0.16, zc + 0.16, STEEL, ['ny']);
    // knee brace to the roof
    B.metal.beam(standPoint(s, x, roofY(zc) - 2.2, zc), standPoint(s, x, roofY(1.8) - 0.05, 1.8), 0.12, STEEL);
  }
  // lights under the roof edge (lamps just coming on)
  for (let x = -hx + L / 16; x < hx; x += L / 8) {
    const c = standPoint(s, x, roofY(0.2) - 0.22, 0.2);
    B.lamps.quad(c.clone().add(new THREE.Vector3(-0.3, 0, -0.12)), c.clone().add(new THREE.Vector3(0.3, 0, -0.12)), c.clone().add(new THREE.Vector3(0.3, 0, 0.12)), c.clone().add(new THREE.Vector3(-0.3, 0, 0.12)), [2.6, 2.0, 1.3], UP.clone().negate());
    lamps.push({ p: c.clone(), size: 1.1, color: new THREE.Color(0.6, 0.48, 0.33), dir: new THREE.Vector3(0, -1, 0) });
  }

  // ---- announcer / press box on the roof ------------------------------------------------------------------
  const bz0 = 1.0, bz1 = 4.6;
  const bw = 11;
  const by0 = roofY(bz1) + 0.2;
  const bh = 3.0;
  const bx0 = -bw / 2, bx1 = bw / 2;
  // body
  sbox(B.matte, s, bx0, bx1, roofY(bz0) - 0.2, by0 + bh, bz0, bz1, CREAM, ['ny'], { pz: CREAM });
  // window band facing the track: dark glass with a warm interior
  const winY0 = by0 + 1.1, winY1 = by0 + 2.45;
  {
    const zf = bz0 - 0.02;
    const nw = 5;
    for (let k = 0; k < nw; k++) {
      const x0 = bx0 + 0.4 + (k * (bw - 0.8)) / nw + 0.08;
      const x1 = bx0 + 0.4 + ((k + 1) * (bw - 0.8)) / nw - 0.08;
      const a = standPoint(s, x0, winY0, zf), b = standPoint(s, x1, winY0, zf), c = standPoint(s, x1, winY1, zf), d = standPoint(s, x0, winY1, zf);
      const warm: Rgb = k === 2 ? [0.95, 0.62, 0.3] : [0.55, 0.36, 0.2];
      B.lamps.quad(a, b, c, d, [warm, warm, [warm[0] * 0.45, warm[1] * 0.45, warm[2] * 0.5], [warm[0] * 0.45, warm[1] * 0.45, warm[2] * 0.5]], new THREE.Vector3(0, 0, s.face));
    }
    // mullion frame
    sbox(B.metal, s, bx0 + 0.3, bx1 - 0.3, winY0 - 0.1, winY0, zf - 0.08, zf, STEEL);
    sbox(B.metal, s, bx0 + 0.3, bx1 - 0.3, winY1, winY1 + 0.1, zf - 0.08, zf, STEEL);
  }
  // radio sign below the windows, booth roof with overhang, PA horns, antenna, flag poles
  flatPanel(B.signs, F8Sign.Radio, standPoint(s, 0, by0 + 0.55, bz0 - 0.04), new THREE.Vector3(s.face, 0, 0), UP, 6.4, 0.8);
  sbox(B.matte, s, bx0 - 0.5, bx1 + 0.5, by0 + bh, by0 + bh + 0.25, bz0 - 0.9, bz1 + 0.4, TRIM_RED);
  const flagPoles: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    // PA horn cluster on a short mast
    const m0 = standPoint(s, sx * (bw / 2 + 1.6), roofY(bz0) + 0.2, bz0 + 0.2);
    const m1 = m0.clone().setY(m0.y + 2.6);
    cylinder(B.metal, m0, m1, 0.06, 0.05, 6, STEEL);
    for (const ang of [-0.5, 0.3]) {
      const dir = new THREE.Vector3(Math.sin(ang) * 0.6, -0.15, s.face).normalize();
      cylinder(B.metal, m1.clone().addScaledVector(UP, -0.3), m1.clone().addScaledVector(UP, -0.3).addScaledVector(dir, 0.75), 0.08, 0.32, 8, lin(0x9aa0a4), { capTop: true, color1: lin(0x3a3d40) });
    }
  }
  {
    const a0 = standPoint(s, bx1 - 1, by0 + bh + 0.25, bz1 - 0.6);
    cylinder(B.metal, a0, a0.clone().setY(a0.y + 5.5), 0.05, 0.02, 5, GALV);
    lamps.push({ p: a0.clone().setY(a0.y + 5.55), size: 0.6, color: new THREE.Color(1.2, 0.1, 0.05) });
    B.lamps.quad(a0.clone().add(new THREE.Vector3(-0.06, 5.5, 0)), a0.clone().add(new THREE.Vector3(0.06, 5.5, 0)), a0.clone().add(new THREE.Vector3(0.06, 5.62, 0)), a0.clone().add(new THREE.Vector3(-0.06, 5.62, 0)), [3, 0.25, 0.12], new THREE.Vector3(0, 0, s.face));
  }
  for (let k = 0; k < 6; k++) {
    const x = -hx + 6 + (k * (L - 12)) / 5;
    if (Math.abs(x) < bw / 2 + 2) continue;
    const base = standPoint(s, x, roofY(roofFrontZ + 0.6) + 0.22, roofFrontZ + 0.6);
    const top = base.clone().setY(base.y + 5.2);
    cylinder(B.metal, base, top, 0.045, 0.035, 5, lin(0xdedede), { capTop: true });
    flagPoles.push(top);
  }
  standSeats(s, rng, section, seats, 0.56, 1.25);
  return { booth: standPoint(s, 0, (winY0 + winY1) / 2, bz0), roofFrontY, flagPoles };
}

// ---- catch fence -------------------------------------------------------------------------------------------------------

function chainLinkTexture(): THREE.DataTexture {
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  const wire = 1.7;
  const wrap = (v: number) => {
    const m = ((v % N) + N) % N;
    return Math.min(m, N - m);
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const e1 = wrap(x - y) / Math.SQRT2;
      const e2 = wrap(x + y + 1) / Math.SQRT2;
      const m = Math.min(e1, e2);
      const a = Math.max(0, Math.min(1, wire + 0.5 - m));
      const shade = e1 < e2 ? 1.0 : 0.8;
      const i = (y * N + x) * 4;
      const c = Math.round(170 * shade);
      data[i] = c;
      data[i + 1] = c + 3;
      data[i + 2] = c + 6;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface FenceResult {
  mesh: THREE.Mesh;
  topY: number;
  /** points along the top rail (for pennant strings) per side */
  railRuns: [THREE.Vector3, THREE.Vector3][];
}

export function buildCatchFence(L: Layout, B: Builders, rng: Rng, signPool: Sign[], disposer: Disposer): FenceResult {
  const f = L.fence;
  const baseH = 0.9;
  const topY = 4.7;
  const mesh = new GeoBuilder();
  const white: [number, number, number] = [1, 1, 1];
  const railRuns: [THREE.Vector3, THREE.Vector3][] = [];
  // four runs: [start, end, inward normal (toward the track)]
  const sides: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(f.minX, 0, f.minZ), new THREE.Vector3(f.maxX, 0, f.minZ), new THREE.Vector3(0, 0, 1)],
    [new THREE.Vector3(f.maxX, 0, f.maxZ), new THREE.Vector3(f.minX, 0, f.maxZ), new THREE.Vector3(0, 0, -1)],
    [new THREE.Vector3(f.maxX, 0, f.minZ), new THREE.Vector3(f.maxX, 0, f.maxZ), new THREE.Vector3(-1, 0, 0)],
    [new THREE.Vector3(f.minX, 0, f.maxZ), new THREE.Vector3(f.minX, 0, f.minZ), new THREE.Vector3(1, 0, 0)],
  ];
  const gate = { side: 2, c: L.pitGateZ, half: 4.2 };
  sides.forEach(([a, b, inward], si) => {
    const dir = b.clone().sub(a);
    const len = dir.length();
    dir.normalize();
    const out = inward.clone().negate();
    const P = (t: number, y: number, o: number) => a.clone().addScaledVector(dir, t).addScaledVector(out, o).setY(y);
    // gate interval along this run (in t)
    let g0 = Infinity, g1 = -Infinity;
    if (si === gate.side) {
      const tc = (gate.c - a.z) / (b.z - a.z) * len;
      g0 = tc - gate.half;
      g1 = tc + gate.half;
    }
    // base wall pieces (skipping the gate)
    const pieces: [number, number][] = g0 < Infinity ? [[0, g0], [g1, len]] : [[0, len]];
    for (const [t0, t1] of pieces) {
      const c = P((t0 + t1) / 2, baseH / 2, 0.14);
      const yaw = Math.atan2(dir.x, dir.z);
      box(B.matte, c, yaw, 0.28, baseH, t1 - t0 + (t0 === 0 ? 0.14 : 0) + (t1 === len ? 0.14 : 0), lin(0xdcd8cc), ['ny'], { py: lin(0xb4231d) });
      // sponsor boards on the track face
      const bh = 0.62;
      const bw = bh * 8;
      let t = t0 + 1.2 + rng.next() * 2;
      while (t + bw < t1 - 0.6) {
        if (rng.next() < 0.8) {
          const id = signPool[Math.floor(rng.next() * signPool.length)];
          const right = dir.clone(); // viewer faces `out`; right = out x up ... flip if needed
          const facing = inward.clone();
          const r = new THREE.Vector3().crossVectors(UP, facing);
          flatPanel(B.signs, id, P(t + bw / 2, 0.14 + bh / 2, -0.012), r.dot(right) >= 0 ? right : right.clone().negate(), UP, bw, bh);
          t += bw + 0.35;
        } else t += 3 + rng.next() * 5;
      }
    }
    // posts, rails, cables
    const nPosts = Math.max(2, Math.round(len / 3.05));
    for (let k = 0; k <= nPosts; k++) {
      const t = (k / nPosts) * len;
      if (t > g0 + 0.2 && t < g1 - 0.2) continue;
      const p0 = P(t, baseH - 0.05, 0.1);
      cylinder(B.metal, p0, p0.clone().setY(topY + 0.08), 0.045, 0.045, 6, lin(0x8e949a), { capTop: true });
    }
    const railA = P(0, topY, 0.1), railB = P(len, topY, 0.1);
    B.metal.beam(railA, railB, 0.055, lin(0x9ea4a9));
    B.metal.beam(P(0, (baseH + topY) / 2, 0.1), P(len, (baseH + topY) / 2, 0.1), 0.02, lin(0x5d6166));
    railRuns.push([railA.clone().setY(topY + 0.03), railB.clone().setY(topY + 0.03)]);
    // chain-link band (uv in metres)
    const segs: [number, number][] = g0 < Infinity ? [[0, g0], [g1, len]] : [[0, len]];
    for (const [t0, t1] of segs) {
      const q0 = P(t0, baseH, 0.1), q1 = P(t1, baseH, 0.1), q2 = P(t1, topY, 0.1), q3 = P(t0, topY, 0.1);
      mesh.quad(q0, q1, q2, q3, white, inward, [t0, 0, t1, 0, t1, topY - baseH, t0, topY - baseH]);
    }
    // vinyl banners zip-tied to the chain-link here and there (between posts)
    let t = 4 + rng.next() * 8;
    const vh = 0.85;
    const vw = vh * 8;
    while (t + vw < len - 3) {
      if ((t + vw < g0 - 1 || t > g1 + 1) && rng.next() < 0.45) {
        const id = signPool[Math.floor(rng.next() * signPool.length)];
        const facing = inward.clone();
        const r = new THREE.Vector3().crossVectors(UP, facing);
        flatPanel(B.signs, id, P(t + vw / 2, baseH + 0.5 + vh / 2, 0.08), r, UP, vw, vh);
        t += vw + 6 + rng.next() * 14;
      } else t += 5 + rng.next() * 10;
    }
    // pit gate: a pipe frame gate (closed) with a sign arch
    if (si === gate.side) {
      const gp0 = P(g0, 0, 0.1), gp1 = P(g1, 0, 0.1);
      for (const gp of [gp0, gp1]) cylinder(B.metal, gp, gp.clone().setY(topY + 1.6), 0.1, 0.1, 8, lin(0x5d6166), { capTop: true });
      B.metal.beam(gp0.clone().setY(topY + 1.5), gp1.clone().setY(topY + 1.5), 0.14, lin(0x5d6166));
      const mid = gp0.clone().add(gp1).multiplyScalar(0.5);
      const r = new THREE.Vector3().crossVectors(UP, inward);
      flatPanel(B.signs, F8Sign.Pits, mid.clone().setY(topY + 0.95).addScaledVector(inward, 0.1), r, UP, 7.4, 0.92);
      // gate leaves: frame + chain-link
      for (let k = 0; k < 2; k++) {
        const ta = g0 + (k * (g1 - g0)) / 2 + 0.08, tb = g0 + ((k + 1) * (g1 - g0)) / 2 - 0.08;
        const fa = P(ta, 0.1, 0.1), fb = P(tb, 0.1, 0.1);
        const fc = fb.clone().setY(2.0), fd = fa.clone().setY(2.0);
        B.metal.beam(fa, fb, 0.05, GALV);
        B.metal.beam(fd, fc, 0.05, GALV);
        B.metal.beam(fa, fd, 0.05, GALV);
        B.metal.beam(fb, fc, 0.05, GALV);
        B.metal.beam(fa, fc, 0.03, GALV);
        mesh.quad(fa, fb, fc, fd, white, inward, [ta, 0, tb, 0, tb, 1.9, ta, 1.9]);
      }
    }
  });
  const geo = mesh.build();
  geo.deleteAttribute('color');
  disposer.add(geo);
  const tex = disposer.add(chainLinkTexture());
  tex.repeat.set(1 / 0.09, 1 / 0.09);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.55, color: new THREE.Color(0.85, 0.87, 0.9) });
  mat.forceSinglePass = true;
  disposer.add(mat);
  const m = new THREE.Mesh(geo, mat);
  m.name = 'F8CatchFence';
  m.renderOrder = 1;
  m.castShadow = false;
  m.receiveShadow = false;
  return { mesh: m, topY, railRuns };
}

/** Standing spectators along the walkway behind the fence, in clusters near the stands. */
export function fenceStanders(L: Layout, rng: Rng, seats: Seat[], count: number) {
  const f = L.fence;
  for (let k = 0; k < count; k++) {
    const side = rng.next() < 0.55 ? -1 : 1; // -1: main (-z) side
    const x = (rng.next() - 0.5) * (f.maxX - f.minX - 16);
    const cluster = 1 + Math.floor(rng.next() * 5);
    for (let i = 0; i < cluster; i++) {
      const xx = x + (i - cluster / 2) * 0.62 + (rng.next() - 0.5) * 0.2;
      const zz = side < 0 ? f.minZ - 0.8 - rng.next() * 1.6 : f.maxZ + 0.8 + rng.next() * 1.6;
      // keep clear of the grandstand stairs
      if (side < 0 && L.main.aisles.some((a) => Math.abs(xx - (L.main.cx + a)) < 1.6)) continue;
      seats.push({ x: xx, y: 0, z: zz, a: seatYaw(side < 0 ? 1 : -1) + (rng.next() - 0.5) * 0.3, r: 0, kind: 1, tier: 0, row: -1, section: -1, weight: 1 });
    }
  }
}

