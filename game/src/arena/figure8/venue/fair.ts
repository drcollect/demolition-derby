import * as THREE from 'three';
import { GeoBuilder, Rng, lin, scaleRgb, type Rgb } from '../../stadium/util';
import { Sign, flatPanel } from '../../stadium/signage';
import type { Seat } from '../../stadium/stands';
import type { Layout } from './layout';
import type { Builders, Lamp } from './stands';
import { F8Sign } from './signs';
import { box, boxOn, cylinder, dome, gableRoof, local } from './shapes';
import { boxHauler, enclosedTrailer, flatbed, pickup, sedan, semiTractor, CAR_PAINTS, DERBY_PAINTS, type VB } from './vehicles';
import { faceAngle } from './props';

const UP = new THREE.Vector3(0, 1, 0);
const TYRE: Rgb = [0.03, 0.03, 0.032];

function crew(seats: Seat[], p: THREE.Vector3, rng: Rng, kind: 1 | 2 = 2) {
  const a = rng.next() * Math.PI * 2;
  seats.push({ x: p.x, y: p.y, z: p.z, a: faceAngle(Math.cos(a), Math.sin(a)), r: 0, kind, tier: 0, row: -1, section: -1, weight: 1 });
}

function tyreStack(b: GeoBuilder, c: THREE.Vector3, n: number) {
  for (let k = 0; k < n; k++) cylinder(b, c.clone().setY(c.y + k * 0.21), c.clone().setY(c.y + k * 0.21 + 0.2), 0.32, 0.32, 8, TYRE, { capTop: k === n - 1 });
}

function canopy(b: GeoBuilder, c: THREE.Vector3, yaw: number, col: Rgb) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const p = local(c, yaw, sx * 1.45, 0, sz * 1.45);
    b.beam(p, p.clone().setY(c.y + 2.3), 0.04, lin(0xb8bcbf));
  }
  const top = c.clone().setY(c.y + 2.85);
  const corner = (sx: number, sz: number) => local(c, yaw, sx * 1.55, 2.3, sz * 1.55);
  const cs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let k = 0; k < 4; k++) {
    const a = corner(...cs[k]), bb = corner(...cs[(k + 1) % 4]);
    b.tri(a, bb, top, col, UP);
    b.tri(a, top, bb, scaleRgb(col, 0.55), UP.clone().negate());
    // valance
    b.quad(a, bb, bb.clone().setY(bb.y - 0.25), a.clone().setY(a.y - 0.25), scaleRgb(col, 0.85), a.clone().add(bb).multiplyScalar(0.5).sub(c).setY(0));
  }
}

// ---- pits (beyond the +x fence) -------------------------------------------------------------------------------------------
export function buildPits(L: Layout, B: Builders, v: VB, seats: Seat[], lamps: Lamp[], rng: Rng, hi: boolean) {
  const P = L.pits;
  const cols = [P.minX + 7.5, P.minX + 26, P.minX + 44.5];
  const lane = L.pitGateZ;
  const canopyCols: Rgb[] = [lin(0xc8241c), lin(0x1f47a8), lin(0xf2c61f), lin(0xf0efea), lin(0x2e8a44), lin(0xe07a2a)];
  for (let ci = 0; ci < cols.length; ci++) {
    const x = cols[ci];
    for (let z = P.minZ + 4; z <= P.maxZ - 3; z += 6.8) {
      if (Math.abs(z - lane) < 6) continue;
      const r = rng.next();
      if (r < 0.1) continue;
      const derbyCol = lin(DERBY_PAINTS[Math.floor(rng.next() * DERBY_PAINTS.length)]);
      const truckCol = lin(CAR_PAINTS[Math.floor(rng.next() * CAR_PAINTS.length)]);
      if (ci === 2 && r < 0.35) {
        // semi with an enclosed race trailer (long rig)
        const trailerCol = lin([0xf0efea, 0x23305a, 0x8a1c1c, 0x2b2b2b][Math.floor(rng.next() * 4)]);
        enclosedTrailer(v, new THREE.Vector3(x - 2, 0, z), Math.PI / 2, trailerCol, lin(0xc8241c));
        semiTractor(v, new THREE.Vector3(x + 9.8, 0, z), Math.PI / 2, truckCol);
        crew(seats, new THREE.Vector3(x - 10.5, 0, z + 1.8), rng);
      } else if (r < 0.62) {
        // pickup + open trailer carrying a derby car
        pickup(v, new THREE.Vector3(x + 3.6, 0, z), Math.PI / 2, truckCol, rng);
        const deck = flatbed(v, new THREE.Vector3(x - 3.4, 0, z), Math.PI / 2, lin(0x3a3d40));
        sedan(v, new THREE.Vector3(x - 3.5, deck, z), Math.PI / 2 + (rng.next() - 0.5) * 0.06, derbyCol, rng, true);
        if (rng.next() < 0.6) crew(seats, new THREE.Vector3(x - 7.4, 0, z + (rng.next() - 0.5) * 2), rng);
        if (rng.next() < 0.4) crew(seats, new THREE.Vector3(x + 0.2, 0, z + 1.6), rng);
      } else if (r < 0.82) {
        // derby car on the ground under a pop-up canopy, tyres and a toolbox
        const cz = z + (rng.next() - 0.5) * 0.6;
        sedan(v, new THREE.Vector3(x - 3.0, 0, cz), Math.PI / 2 + (rng.next() - 0.5) * 0.3, derbyCol, rng, true);
        canopy(B.matte, new THREE.Vector3(x - 3.0, 0, cz), rng.next() * 0.2, canopyCols[Math.floor(rng.next() * canopyCols.length)]);
        tyreStack(v.b, new THREE.Vector3(x + 0.8, 0, cz - 1.8), 2 + Math.floor(rng.next() * 3));
        tyreStack(v.b, new THREE.Vector3(x + 0.8, 0, cz - 1.1), 1 + Math.floor(rng.next() * 3));
        boxOn(v.b, new THREE.Vector3(x + 0.9, 0, cz + 1.4), 0.2, 0.6, 1.0, 0.45, lin(0xb4231d));
        pickup(v, new THREE.Vector3(x + 4.6, 0, cz), Math.PI / 2, truckCol, rng);
        for (let k = 0; k < 2 + Math.floor(rng.next() * 2); k++) crew(seats, new THREE.Vector3(x - 3 + (rng.next() - 0.5) * 3, 0, cz + (rng.next() < 0.5 ? -1.6 : 1.6)), rng);
      } else {
        // box hauler + pickup
        boxHauler(v, new THREE.Vector3(x - 3.2, 0, z), Math.PI / 2, lin([0xf0efea, 0xc9ccd0, 0x2b2b2b][Math.floor(rng.next() * 3)]), lin([0xc8241c, 0x1f47a8, 0xf2c61f][Math.floor(rng.next() * 3)]));
        pickup(v, new THREE.Vector3(x + 5.0, 0, z), Math.PI / 2, truckCol, rng);
      }
    }
  }
  // porta-potties by the gate
  for (let k = 0; k < 5; k++) {
    const p = new THREE.Vector3(P.minX + 1.5, 0, lane - 10 - k * 1.35);
    const col = k === 2 ? lin(0x2e8a44) : lin(0x2f6fb8);
    boxOn(B.matte, p, Math.PI / 2, 1.15, 2.25, 1.15, col, ['ny'], { py: lin(0xe8e6e0) });
    boxOn(B.matte, p.clone().setY(2.25), Math.PI / 2, 1.2, 0.12, 1.2, lin(0xe8e6e0));
  }
  // pit lights on two poles
  for (const [x, z] of [[P.minX + 17, lane + 7], [P.minX + 36, lane - 7]]) {
    const top = new THREE.Vector3(x, 12, z);
    cylinder(B.matte, new THREE.Vector3(x, -0.2, z), top, 0.18, 0.13, 7, lin(0x5a4430), { capTop: true });
    for (const sx of [-1, 1]) {
      const h = top.clone().add(new THREE.Vector3(sx * 0.9, -0.3, 0));
      B.metal.beam(top.clone().setY(top.y - 0.3), h, 0.06, lin(0x6f757b));
      B.lamps.quad(h.clone().add(new THREE.Vector3(-0.25, -0.1, -0.2)), h.clone().add(new THREE.Vector3(0.25, -0.1, -0.2)), h.clone().add(new THREE.Vector3(0.25, -0.1, 0.2)), h.clone().add(new THREE.Vector3(-0.25, -0.1, 0.2)), [2.8, 2.1, 1.3], UP.clone().negate());
      lamps.push({ p: h.clone().setY(h.y - 0.2), size: 1.3, color: new THREE.Color(0.6, 0.45, 0.3), dir: new THREE.Vector3(0, -1, 0) });
    }
  }
  if (hi) for (let k = 0; k < 14; k++) crew(seats, new THREE.Vector3(P.minX + 2 + rng.next() * 50, 0, lane + (rng.next() - 0.5) * 5), rng);
}

// ---- parking behind the main grandstand ---------------------------------------------------------------------------------------
export function buildParking(L: Layout, v: VB, rng: Rng, hi: boolean) {
  const P = L.parking;
  const rows = hi ? 4 : 2;
  for (let r = 0; r < rows; r++) {
    const z = P.maxZ - 4 - r * 13;
    const yaw = r % 2 === 0 ? 0 : Math.PI;
    for (let x = P.minX; x <= P.maxX; x += 2.95) {
      if (rng.next() > (hi ? 0.62 : 0.45)) continue;
      if (Math.abs(x) < 7) continue; // entrance lane
      const col = lin(CAR_PAINTS[Math.floor(rng.next() * CAR_PAINTS.length)]);
      const p = new THREE.Vector3(x + (rng.next() - 0.5) * 0.3, 0, z + (rng.next() - 0.5) * 0.5);
      const y = yaw + (rng.next() - 0.5) * 0.12;
      if (rng.next() < 0.4) pickup(v, p, y, col, rng);
      else sedan(v, p, y, col, rng);
    }
  }
}

// ---- concession stands (beyond the -x fence) ------------------------------------------------------------------------------------
export function buildConcessions(L: Layout, B: Builders, v: VB, seats: Seat[], lamps: Lamp[], rng: Rng) {
  const C = L.concessions;
  const signs = [F8Sign.Concessions, F8Sign.HotDogs, Sign.Gutbuster, Sign.PistonPetes, Sign.KrashKola];
  const awn: Rgb[] = [lin(0xc8241c), lin(0xf2c61f), lin(0x1f47a8), lin(0x2e8a44), lin(0xe07a2a)];
  const n = 5;
  const fwd = new THREE.Vector3(1, 0, 0); // serving side faces the track
  const right = new THREE.Vector3().crossVectors(UP, fwd);
  const stands: THREE.Vector3[] = [];
  for (let k = 0; k < n; k++) {
    const z = C.z0 + ((k + 0.5) * (C.z1 - C.z0)) / n;
    const c = new THREE.Vector3(C.x - 1.3, 0, z);
    stands.push(c);
    const body = lin([0xf0efe8, 0xe8d8b0, 0xd6e0e8, 0xf2e0e0, 0xe8e8d0][k]);
    boxOn(B.matte, c, 0, 2.6, 2.9, 5.2, body, ['ny'], { py: lin(0xb8b4aa) });
    // window (warm lit interior) and counter
    const w0 = c.clone().add(new THREE.Vector3(1.31, 1.0, -1.7)), w1 = c.clone().add(new THREE.Vector3(1.31, 1.0, 1.7));
    B.lamps.quad(w0, w1, w1.clone().setY(2.2), w0.clone().setY(2.2), [[0.75, 0.5, 0.26], [0.75, 0.5, 0.26], [0.95, 0.66, 0.34], [0.95, 0.66, 0.34]], fwd);
    box(B.matte, c.clone().add(new THREE.Vector3(1.45, 1.0, 0)), 0, 0.35, 0.06, 3.6, lin(0xb8b4aa));
    // awning
    const a0 = c.clone().add(new THREE.Vector3(1.3, 2.45, -2.0)), a1 = c.clone().add(new THREE.Vector3(1.3, 2.45, 2.0));
    const a2 = a1.clone().add(new THREE.Vector3(1.3, -0.45, 0)), a3 = a0.clone().add(new THREE.Vector3(1.3, -0.45, 0));
    for (let s = 0; s < 8; s++) {
      const t0 = s / 8, t1 = (s + 1) / 8;
      const col = s % 2 ? lin(0xf2f0ea) : awn[k];
      const q0 = a0.clone().lerp(a1, t0), q1 = a0.clone().lerp(a1, t1), q2 = a3.clone().lerp(a2, t1), q3 = a3.clone().lerp(a2, t0);
      B.matte.quad(q0, q1, q2, q3, col, new THREE.Vector3(0.33, 1, 0));
      B.matte.quad(q0, q3, q2, q1, scaleRgb(col, 0.6), new THREE.Vector3(-0.33, -1, 0));
    }
    // lit sign on the roof
    const sc = c.clone().add(new THREE.Vector3(0.6, 3.45, 0));
    box(B.metal, sc.clone().add(new THREE.Vector3(-0.1, 0, 0)), 0, 0.15, 0.7, 5.0, lin(0x2a2b2d));
    flatPanel(B.glow, signs[k % signs.length], sc.clone().add(new THREE.Vector3(0.0, 0, 0)), right, UP, 4.8, 0.6);
    for (const dz of [-2, 2]) B.metal.beam(c.clone().add(new THREE.Vector3(0.5, 2.9, dz)), c.clone().add(new THREE.Vector3(0.5, 3.1, dz)), 0.06, lin(0x2a2b2d));
    // wheels peeking out (they are trailers)
    for (const dz of [-1.2, 1.2]) cylinder(v.b, c.clone().add(new THREE.Vector3(1.32, 0.33, dz)), c.clone().add(new THREE.Vector3(1.05, 0.33, dz)), 0.33, 0.33, 8, TYRE, { capBottom: true });
    // queue + milling
    for (let q = 0; q < 2 + Math.floor(rng.next() * 3); q++) {
      const p = c.clone().add(new THREE.Vector3(2.4 + q * 0.75 + rng.next() * 0.2, 0, (rng.next() - 0.5) * 0.8));
      seats.push({ x: p.x, y: 0, z: p.z, a: faceAngle(-1, (rng.next() - 0.5) * 0.4), r: 0, kind: 1, tier: 0, row: -1, section: -1, weight: 1 });
    }
  }
  // festoon lights between the stands (catenary with warm bulbs)
  const bulbs: THREE.Vector3[] = [];
  for (let k = 0; k + 1 < stands.length; k++) {
    const a = stands[k].clone().add(new THREE.Vector3(1.9, 3.2, 1.2)), b = stands[k + 1].clone().add(new THREE.Vector3(1.9, 3.2, -1.2));
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const p = a.clone().lerp(b, t);
      p.y -= 0.6 * 4 * t * (1 - t);
      if (i < 10) {
        const q = a.clone().lerp(b, (i + 1) / 10);
        q.y -= 0.6 * 4 * ((i + 1) / 10) * (1 - (i + 1) / 10);
        B.metal.beam(p, q, 0.015, lin(0x202020));
      }
      if (i > 0 && i < 10) bulbs.push(p.clone().setY(p.y - 0.06));
    }
  }
  for (const p of bulbs) {
    const s = 0.05;
    const col: Rgb = [3.2, 2.2, 1.1];
    B.lamps.quad(p.clone().add(new THREE.Vector3(0, -s, -s)), p.clone().add(new THREE.Vector3(0, -s, s)), p.clone().add(new THREE.Vector3(0, s, s)), p.clone().add(new THREE.Vector3(0, s, -s)), col, fwd);
    B.lamps.quad(p.clone().add(new THREE.Vector3(0, -s, s)), p.clone().add(new THREE.Vector3(0, -s, -s)), p.clone().add(new THREE.Vector3(0, s, -s)), p.clone().add(new THREE.Vector3(0, s, s)), col, fwd.clone().negate());
    lamps.push({ p, size: 0.35, color: new THREE.Color(1.0, 0.7, 0.4) });
  }
  // picnic tables and people
  for (let k = 0; k < 6; k++) {
    const p = new THREE.Vector3(C.x + 4.2 + (k % 2) * 2.2, 0, C.z0 + 4 + k * ((C.z1 - C.z0 - 8) / 5));
    boxOn(B.matte, p.clone().setY(0.72), 0, 0.8, 0.06, 2.0, lin(0x7a5a3a));
    for (const sx of [-0.65, 0.65]) boxOn(B.matte, p.clone().add(new THREE.Vector3(sx, 0.42, 0)), 0, 0.28, 0.05, 2.0, lin(0x6e5236));
    for (const sz of [-0.8, 0.8]) boxOn(B.matte, p.clone().add(new THREE.Vector3(0, 0, sz)), 0, 1.6, 0.72, 0.08, lin(0x5a4430));
    for (let q = 0; q < 3; q++) crew(seats, p.clone().add(new THREE.Vector3((rng.next() - 0.5) * 3, 0, (rng.next() - 0.5) * 3)), rng);
  }
}

// ---- the fair: Ferris wheel (rotating), tents, a drop tower ---------------------------------------------------------------------------
export interface FerrisWheel {
  group: THREE.Group;
  metal: GeoBuilder;
  lamps: GeoBuilder;
  gondolaPivots: THREE.Vector3[]; // in wheel-local coordinates
  hub: THREE.Vector3;
  axis: THREE.Vector3;
  radius: number;
}

export function buildFair(L: Layout, far: GeoBuilder, farLamps: GeoBuilder, lamps: Lamp[], rng: Rng): FerrisWheel {
  const c = L.ferris.clone();
  const toVenue = new THREE.Vector3(-c.x, 0, -c.z).normalize();
  const axis = toVenue.clone(); // the wheel faces the venue
  const side = new THREE.Vector3().crossVectors(UP, axis).normalize();
  const R = 16;
  const hubY = R + 2.6;
  const hub = c.clone().setY(hubY);
  const white: Rgb = lin(0xe8e6e0);
  const red: Rgb = lin(0xc8241c);
  // A-frame supports (static)
  for (const sa of [-1, 1]) {
    const foot0 = c.clone().addScaledVector(side, -9).addScaledVector(axis, sa * 1.6);
    const foot1 = c.clone().addScaledVector(side, 9).addScaledVector(axis, sa * 1.6);
    const top = hub.clone().addScaledVector(axis, sa * 1.3);
    far.beam(foot0, top, 0.45, white);
    far.beam(foot1, top, 0.45, white);
    far.beam(foot0.clone().lerp(top, 0.45), foot1.clone().lerp(top, 0.45), 0.25, white);
  }
  cylinder(far, hub.clone().addScaledVector(axis, -1.6), hub.clone().addScaledVector(axis, 1.6), 0.5, 0.5, 10, lin(0x9a9fa4), { capTop: true, capBottom: true });
  // boarding platform + ticket booth
  box(far, c.clone().add(new THREE.Vector3(0, 0.4, 0)).addScaledVector(axis, 3.5), Math.atan2(axis.x, axis.z), 10, 0.8, 5, lin(0x8a7a60));
  boxOn(far, c.clone().addScaledVector(axis, 7.5).addScaledVector(side, 4), Math.atan2(axis.x, axis.z), 2, 2.6, 2, red, ['ny'], { py: white });
  // wheel (rotating group, local frame: z = axle, x/y = wheel plane)
  const metal = new GeoBuilder();
  const wl = new GeoBuilder();
  const n = 16;
  const ring = (r: number, z: number, t: number, col: Rgb) => {
    const segs = 48;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      metal.beam(new THREE.Vector3(Math.cos(a0) * r, Math.sin(a0) * r, z), new THREE.Vector3(Math.cos(a1) * r, Math.sin(a1) * r, z), t, col);
    }
  };
  for (const z of [-0.9, 0.9]) {
    ring(R, z, 0.3, white);
    ring(R * 0.62, z, 0.18, red);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      metal.beam(new THREE.Vector3(0, 0, z * 0.4), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, z), 0.14, white);
    }
  }
  const gondolaPivots: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    metal.beam(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, -0.9), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0.9), 0.12, white);
    gondolaPivots.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0));
  }
  // bulbs along the rim and spokes (both faces)
  const bulb = (p: THREE.Vector3, col: Rgb, s: number) => {
    for (const fz of [1, -1]) {
      const q = p.clone().setZ(p.z + fz * 0.2);
      wl.quad(q.clone().add(new THREE.Vector3(-s, -s, 0)), q.clone().add(new THREE.Vector3(s, -s, 0)), q.clone().add(new THREE.Vector3(s, s, 0)), q.clone().add(new THREE.Vector3(-s, s, 0)), col, new THREE.Vector3(0, 0, fz));
    }
  };
  const bulbCols: Rgb[] = [[3.4, 2.4, 1.2], [3.2, 0.7, 0.4], [0.9, 1.6, 3.4], [3.2, 2.9, 0.8]];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    bulb(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0.9), bulbCols[i % 4], 0.16);
  }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    for (let k = 1; k <= 5; k++) bulb(new THREE.Vector3(Math.cos(a) * R * (k / 6), Math.sin(a) * R * (k / 6), 0.95), bulbCols[(i + k) % 4], 0.12);
  }
  const group = new THREE.Group();
  group.position.copy(hub);
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, UP, axis));
  lamps.push({ p: hub.clone(), size: 3.5, color: new THREE.Color(1.0, 0.7, 0.4) });

  // tents (striped cones) and a drop tower with lights
  const tentCols: [Rgb, Rgb][] = [
    [lin(0xc8241c), lin(0xf2f0ea)],
    [lin(0x1f47a8), lin(0xf2c61f)],
    [lin(0x2e8a44), lin(0xf2f0ea)],
  ];
  for (let k = 0; k < 5; k++) {
    const p = c.clone().addScaledVector(side, (k - 2) * 15 + (rng.next() - 0.5) * 4).addScaledVector(axis, 22 + rng.next() * 18);
    const r = 5 + rng.next() * 3;
    const h = 3.2, peak = 3 + rng.next() * 2;
    const [a, b] = tentCols[k % 3];
    const segs = 12;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const q0 = p.clone().add(new THREE.Vector3(Math.cos(a0) * r, 0, Math.sin(a0) * r)), q1 = p.clone().add(new THREE.Vector3(Math.cos(a1) * r, 0, Math.sin(a1) * r));
      const col = i % 2 ? a : b;
      const out = new THREE.Vector3(Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2));
      far.quad(q0, q1, q1.clone().setY(h), q0.clone().setY(h), col, out);
      far.tri(q0.clone().setY(h), q1.clone().setY(h), p.clone().setY(h + peak), col, out.clone().setY(0.8));
    }
    far.beam(p.clone().setY(h + peak), p.clone().setY(h + peak + 1.2), 0.06, lin(0xdedede));
  }
  {
    const p = c.clone().addScaledVector(side, 28).addScaledVector(axis, 12);
    const H = 38;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) far.beam(p.clone().add(new THREE.Vector3(sx * 1.1, 0, sz * 1.1)), p.clone().add(new THREE.Vector3(sx * 0.8, H, sz * 0.8)), 0.18, lin(0xd8d8d8));
    for (let y = 3; y < H; y += 3) {
      const k = 1.1 - (0.3 * y) / H;
      far.beam(p.clone().add(new THREE.Vector3(-k, y, -k)), p.clone().add(new THREE.Vector3(k, y, -k)), 0.08, lin(0xd8d8d8));
      far.beam(p.clone().add(new THREE.Vector3(-k, y, k)), p.clone().add(new THREE.Vector3(k, y, k)), 0.08, lin(0xd8d8d8));
      far.beam(p.clone().add(new THREE.Vector3(-k, y, -k)), p.clone().add(new THREE.Vector3(-k, y, k)), 0.08, lin(0xd8d8d8));
      far.beam(p.clone().add(new THREE.Vector3(k, y, -k)), p.clone().add(new THREE.Vector3(k, y, k)), 0.08, lin(0xd8d8d8));
      const col: Rgb = (y / 3) % 2 ? [3.2, 0.6, 0.35] : [3.4, 2.6, 1.0];
      for (const f of [axis, side, axis.clone().negate(), side.clone().negate()]) {
        const q = p.clone().setY(y).addScaledVector(f, k + 0.05);
        const r2 = new THREE.Vector3().crossVectors(UP, f).multiplyScalar(0.18);
        farLamps.quad(q.clone().sub(r2).setY(y - 0.12), q.clone().add(r2).setY(y - 0.12), q.clone().add(r2).setY(y + 0.12), q.clone().sub(r2).setY(y + 0.12), col, f);
      }
    }
    box(far, p.clone().setY(8), 0, 3.6, 1.0, 3.6, lin(0xc8241c));
    lamps.push({ p: p.clone().setY(H + 0.5), size: 2.5, color: new THREE.Color(1.2, 0.2, 0.1) });
  }
  return { group, metal, lamps: wl, gondolaPivots, hub, axis, radius: R };
}

// ---- farmsteads, power lines ------------------------------------------------------------------------------------------------
export function buildFarm(far: GeoBuilder, c: THREE.Vector3, yaw: number, rng: Rng) {
  const red: Rgb = lin(0x8e2a1e), white: Rgb = lin(0xe8e4da), roof: Rgb = lin(0x4a4d52);
  // barn with a gambrel-ish roof (two stacked gables)
  const bw = 12, bl = 20, bh = 6.5;
  boxOn(far, c, yaw, bw, bh, bl, red, ['ny'], { pz: red });
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(c.clone().setY(bh));
  gableRoof(far, m, bw, bl, 4.8, roof, red, 0.4);
  // white trim X door on the gable end
  const door = local(c, yaw, 0, 2.2, bl / 2 + 0.02);
  const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  far.beam(door.clone().addScaledVector(r, -1.8).setY(0.2), door.clone().addScaledVector(r, 1.8).setY(4.2), 0.18, white);
  far.beam(door.clone().addScaledVector(r, 1.8).setY(0.2), door.clone().addScaledVector(r, -1.8).setY(4.2), 0.18, white);
  // silos
  for (let k = 0; k < 2; k++) {
    const p = local(c, yaw, bw / 2 + 3.5 + k * 5.5, 0, -bl / 2 + 3);
    const h = 15 + k * 3 + rng.next() * 2;
    cylinder(far, p, p.clone().setY(h), 2.4, 2.4, 12, k ? lin(0xb8bcbf) : lin(0x9aa6b8));
    dome(far, p.clone().setY(h), 2.45, 1.8, 12, 3, lin(0xc8ccd0));
  }
  // farmhouse
  const hp = local(c, yaw, -bw / 2 - 16, 0, 6);
  boxOn(far, hp, yaw + 0.1, 8, 5.2, 10, white);
  gableRoof(far, new THREE.Matrix4().makeRotationY(yaw + 0.1).setPosition(hp.clone().setY(5.2)), 8, 10, 3.2, roof, white, 0.5);
  // windmill
  const wp = local(c, yaw, -bw / 2 - 6, 0, -bl / 2 - 6);
  const H = 12;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) far.beam(wp.clone().add(new THREE.Vector3(sx * 1.4, 0, sz * 1.4)), wp.clone().add(new THREE.Vector3(sx * 0.25, H, sz * 0.25)), 0.1, lin(0x8a8e92));
  const hubW = wp.clone().setY(H + 0.4);
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 0.6) / 16) * Math.PI * 2;
    far.tri(hubW, hubW.clone().addScaledVector(r, Math.cos(a0) * 2.2).setY(hubW.y + Math.sin(a0) * 2.2), hubW.clone().addScaledVector(r, Math.cos(a1) * 2.2).setY(hubW.y + Math.sin(a1) * 2.2), lin(0xb8bcbf), new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)));
  }
}

export function buildPowerLine(far: GeoBuilder, pts: THREE.Vector3[], spacing: number) {
  const wood = lin(0x4e3b2a);
  const wire = lin(0x1a1a1a);
  const poles: THREE.Vector3[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(1, Math.round(a.distanceTo(b) / spacing));
    for (let k = 0; k < n; k++) poles.push(a.clone().lerp(b, k / n));
  }
  poles.push(pts[pts.length - 1].clone());
  const H = 10.5;
  let prevTips: THREE.Vector3[] | null = null;
  for (let i = 0; i < poles.length; i++) {
    const p = poles[i];
    const dir = (i + 1 < poles.length ? poles[i + 1].clone().sub(p) : p.clone().sub(poles[i - 1])).setY(0).normalize();
    const side = new THREE.Vector3().crossVectors(UP, dir).normalize();
    cylinder(far, p.clone().setY(-0.3), p.clone().setY(H), 0.16, 0.12, 6, wood, { capTop: true });
    far.beam(p.clone().setY(H - 0.6).addScaledVector(side, -1.3), p.clone().setY(H - 0.6).addScaledVector(side, 1.3), 0.12, wood);
    const tips = [-1.1, 0, 1.1].map((s) => p.clone().setY(s === 0 ? H + 0.05 : H - 0.5).addScaledVector(side, s));
    if (prevTips) {
      for (let w = 0; w < 3; w++) {
        const a = prevTips[w], b = tips[w];
        const segs = 6;
        for (let k = 0; k < segs; k++) {
          const t0 = k / segs, t1 = (k + 1) / segs;
          const q0 = a.clone().lerp(b, t0), q1 = a.clone().lerp(b, t1);
          q0.y -= 1.1 * 4 * t0 * (1 - t0);
          q1.y -= 1.1 * 4 * t1 * (1 - t1);
          far.beam(q0, q1, 0.035, wire);
        }
      }
    }
    prevTips = tips;
  }
}

