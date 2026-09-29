import * as THREE from 'three';
import { GeoBuilder, Rng, lin, ringPoint, scaleRgb, type Rgb } from './util';
import { gapCutAngle, type Layout } from './layout';

export interface Seat {
  x: number;
  y: number;
  z: number;
  a: number; // angle
  r: number;
  kind: 0 | 1 | 2; // 0 seat, 1 standing at the apron (behind the fence), 2 cross-aisle
  tier: number;
  row: number;
  section: number;
  weight: number;
}

type Key =
  | 'apron'
  | 'apronLine'
  | 'parapet'
  | 'parapetStripe'
  | 'foot'
  | 'benchFront'
  | 'bench'
  | 'riser'
  | 'cross'
  | 'fascia'
  | 'fasciaStripe'
  | 'backWall'
  | 'cap'
  | 'trim'
  | 'facade'
  | 'aisle'
  | 'nosing';

interface Seg {
  r0: number;
  y0: number;
  r1: number;
  y1: number;
  key: Key;
  ao0: number;
  ao1: number;
}

const COL: Record<Key, Rgb> = {
  apron: lin(0x8c877e),
  apronLine: lin(0xd8b02a),
  parapet: lin(0x243a78),
  parapetStripe: lin(0xe9e4d6),
  foot: lin(0x8e8a82),
  benchFront: lin(0x6f6b64),
  bench: lin(0x9a968d),
  riser: lin(0x74716a),
  cross: lin(0x8a867d),
  fascia: lin(0x6e1d1d),
  fasciaStripe: lin(0xe9e4d6),
  backWall: lin(0x7c786f),
  cap: lin(0x9a968e),
  trim: lin(0xb0402e),
  facade: lin(0x8d887d),
  aisle: lin(0xaaa69b),
  nosing: lin(0xe0b726),
};

// 70s seat paint, per section (lower tier / upper tier).
const SEATS_LOWER: Rgb[] = [lin(0xc8561e), lin(0xe0a52a), lin(0xb33a22), lin(0xe0a52a)];
const SEATS_UPPER: Rgb[] = [lin(0x2c5fae), lin(0xd9d2bd), lin(0x2c5fae), lin(0x2f8a86)];

function profile(L: Layout, aisle: boolean): Seg[] {
  const s: Seg[] = [];
  const add = (r0: number, y0: number, r1: number, y1: number, key: Key, ao0 = 1, ao1 = 1) => s.push({ r0, y0, r1, y1, key, ao0, ao1 });
  // apron walkway behind the wall top
  add(L.apronR0, L.apronY, L.apronR0 + 0.14, L.apronY, 'apronLine', 1, 1);
  add(L.apronR0 + 0.14, L.apronY, L.apronR1, L.apronY, 'apron', 1, 0.78);
  // lower-tier front parapet
  add(L.apronR1, L.apronY, L.apronR1, L.lowerFrontY - 0.16, 'parapet', 0.8, 1);
  add(L.apronR1, L.lowerFrontY - 0.16, L.apronR1, L.lowerFrontY, 'parapetStripe');
  const rows = L.rows;
  for (let i = 0; i < rows.length; i++) {
    const w = rows[i];
    const mid = w.rFront + w.depth * 0.5;
    const yb = w.y + w.rise * 0.5;
    if (aisle) {
      add(w.rFront, w.y, w.rFront + 0.07, w.y, 'nosing');
      add(w.rFront + 0.07, w.y, mid, w.y, 'aisle', 1, 0.8);
      add(mid, w.y, mid, yb, 'riser', 0.8, 1);
      add(mid, yb, mid + 0.07, yb, 'nosing');
      add(mid + 0.07, yb, w.rBack, yb, 'aisle', 1, 0.8);
    } else {
      add(w.rFront, w.y, mid, w.y, 'foot', 1, 0.7);
      add(mid, w.y, mid, yb, 'benchFront', 0.72, 1);
      add(mid, yb, w.rBack, yb, 'bench', 1, 0.8);
    }
    const next = rows[i + 1];
    if (next && next.tier === w.tier) {
      add(w.rBack, yb, w.rBack, next.y, 'riser', 0.8, 1);
    } else if (w.tier === 0) {
      // riser up to the cross aisle, cross aisle, upper-tier fascia wall
      add(w.rBack, yb, w.rBack, L.crossY, 'riser', 0.8, 1);
      add(L.crossR0, L.crossY, L.crossR1, L.crossY, 'cross', 1, 0.75);
      add(L.crossR1, L.crossY, L.crossR1, L.upperFrontTopY - 0.18, 'fascia', 0.75, 1);
      add(L.crossR1, L.upperFrontTopY - 0.18, L.crossR1, L.upperFrontTopY, 'fasciaStripe');
    } else {
      add(w.rBack, yb, w.rBack, L.backTopY, 'backWall', 0.8, 1);
    }
  }
  add(L.backR, L.backTopY, L.facadeR, L.backTopY, 'cap');
  add(L.facadeR, L.backTopY, L.facadeR, L.backTopY - 0.7, 'trim');
  add(L.facadeR, L.backTopY - 0.7, L.facadeR, 0, 'facade', 1, 0.55);
  return s;
}

interface Column {
  a0: number;
  a1: number;
  aisle: boolean;
  section: number;
  first: boolean;
  last: boolean;
}

function buildColumns(L: Layout): Column[] {
  const cols: Column[] = [];
  const maxStep = (1.1 * Math.PI) / 180;
  const bounds = [L.standA0];
  for (const a of L.aisles) bounds.push(a - L.aisleHalfAngle, a + L.aisleHalfAngle);
  bounds.push(L.standA1);
  for (let k = 0; k < bounds.length - 1; k++) {
    const a0 = bounds[k];
    const a1 = bounds[k + 1];
    const isAisle = k % 2 === 1;
    const section = Math.floor(k / 2);
    if (isAisle) {
      cols.push({ a0, a1, aisle: true, section, first: false, last: false });
    } else {
      const n = Math.max(1, Math.ceil((a1 - a0) / maxStep));
      for (let j = 0; j < n; j++) {
        cols.push({ a0: a0 + ((a1 - a0) * j) / n, a1: a0 + ((a1 - a0) * (j + 1)) / n, aisle: false, section, first: false, last: false });
      }
    }
  }
  cols[0].first = true;
  cols[cols.length - 1].last = true;
  return cols;
}

export interface StandsResult {
  seats: Seat[];
  sections: number;
}

/**
 * Builds the concrete bowl (both tiers, aisles, gate-gap caps, the bridge and the pit road) into `b`
 * and returns the spectator positions.
 */
export function buildStands(L: Layout, rng: Rng, b: GeoBuilder, metal: GeoBuilder): StandsResult {
  const cols = buildColumns(L);
  const seatProfile = profile(L, false);
  const aisleProfile = profile(L, true);
  const up = new THREE.Vector3(0, 1, 0);

  const angleAt = (c: Column, r: number, end: 0 | 1): number => {
    if (end === 0 && c.first) return gapCutAngle(L, r, 1);
    if (end === 1 && c.last) return gapCutAngle(L, r, -1);
    return end === 0 ? c.a0 : c.a1;
  };

  let colIndex = 0;
  for (const c of cols) {
    const prof = c.aisle ? aisleProfile : seatProfile;
    const jitter = 0.94 + rng.next() * 0.1;
    const pilaster = colIndex % 7 === 0;
    colIndex++;
    for (const sg of prof) {
      let base: Rgb = COL[sg.key];
      const tierOfSeg = sg.r0 >= L.crossR0 ? 1 : 0;
      if (sg.key === 'bench' || sg.key === 'benchFront') {
        const pal = tierOfSeg === 0 ? SEATS_LOWER : SEATS_UPPER;
        base = pal[c.section % pal.length];
        if (sg.key === 'benchFront') base = scaleRgb(base, 0.62);
      }
      if (sg.key === 'facade' && pilaster) base = scaleRgb(base, 0.82);
      const k = sg.key === 'nosing' || sg.key === 'apronLine' || sg.key === 'parapetStripe' || sg.key === 'fasciaStripe' ? 1 : jitter;
      const c0 = scaleRgb(base, sg.ao0 * k);
      const c1 = scaleRgb(base, sg.ao1 * k);
      const aL0 = angleAt(c, sg.r0, 0);
      const aR0 = angleAt(c, sg.r0, 1);
      const aL1 = angleAt(c, sg.r1, 0);
      const aR1 = angleAt(c, sg.r1, 1);
      const p0 = ringPoint(aL0, sg.r0, sg.y0);
      const p1 = ringPoint(aR0, sg.r0, sg.y0);
      const p2 = ringPoint(aR1, sg.r1, sg.y1);
      const p3 = ringPoint(aL1, sg.r1, sg.y1);
      // facing: 2D normal (-dy, dr) in (radial, up)
      const dr = sg.r1 - sg.r0;
      const dy = sg.y1 - sg.y0;
      const am = (aL0 + aR0) * 0.5;
      const facing = new THREE.Vector3(Math.cos(am) * -dy, dr, Math.sin(am) * -dy);
      const uvs = [
        (aL0 * sg.r0) / 2.5, (sg.r0 + sg.y0) / 2.5,
        (aR0 * sg.r0) / 2.5, (sg.r0 + sg.y0) / 2.5,
        (aR1 * sg.r1) / 2.5, (sg.r1 + sg.y1) / 2.5,
        (aL1 * sg.r1) / 2.5, (sg.r1 + sg.y1) / 2.5,
      ];
      b.quad(p0, p1, p2, p3, [c0, c0, c1, c1], facing, uvs);
    }
  }

  // ---- gate gap: end caps, road, bridge ------------------------------------------------------
  const G = L.gateAngle;
  const g = new THREE.Vector3(Math.cos(G), 0, Math.sin(G));
  const t = new THREE.Vector3(-Math.sin(G), 0, Math.cos(G));
  const hw = L.gateHalfWidth;
  const sOf = (r: number) => Math.sqrt(Math.max(0, r * r - hw * hw));
  const gp = (s: number, tt: number, y: number) => new THREE.Vector3().addScaledVector(g, s).addScaledVector(t, tt).setY(y);

  // cap polygon in (s, y)
  const poly: THREE.Vector2[] = [];
  poly.push(new THREE.Vector2(sOf(seatProfile[0].r0), seatProfile[0].y0));
  for (const sg of seatProfile) {
    const p = new THREE.Vector2(sOf(sg.r1), sg.y1);
    const lastP = poly[poly.length - 1];
    if (Math.abs(lastP.x - p.x) > 1e-5 || Math.abs(lastP.y - p.y) > 1e-5) poly.push(p);
  }
  poly.push(new THREE.Vector2(sOf(seatProfile[0].r0), 0));
  const tris = THREE.ShapeUtils.triangulateShape(poly, []);
  const capCol = lin(0x6c6960);
  for (const side of [1, -1] as const) {
    const facing = t.clone().multiplyScalar(-side);
    for (const tr of tris) {
      const A = poly[tr[0]];
      const B = poly[tr[1]];
      const C = poly[tr[2]];
      b.tri(gp(A.x, side * hw, A.y), gp(B.x, side * hw, B.y), gp(C.x, side * hw, C.y), scaleRgb(capCol, 0.9), facing, [
        A.x / 2.5, A.y / 2.5, B.x / 2.5, B.y / 2.5, C.x / 2.5, C.y / 2.5,
      ]);
    }
  }

  // pit road through the gap (ramp from the bank top down to the ground)
  const asphalt = lin(0x2b2b2e);
  const line = lin(0xd8b02a);
  const roadEnd = L.facadeR + 34;
  const roadY = (s: number) => {
    const s0 = L.outerR + 0.4;
    const s1 = L.crossR0;
    if (s <= s0) return L.baseY - 0.02;
    if (s >= s1) return 0.03;
    const k = (s - s0) / (s1 - s0);
    return L.baseY - 0.02 + (0.03 - (L.baseY - 0.02)) * (k * k * (3 - 2 * k));
  };
  const steps = 14;
  const lanes: [number, number, Rgb][] = [
    [-hw, -0.08, asphalt],
    [-0.08, 0.08, line],
    [0.08, hw, asphalt],
  ];
  for (let i = 0; i < steps; i++) {
    const s0 = L.apronR0 + ((roadEnd - L.apronR0) * i) / steps;
    const s1 = L.apronR0 + ((roadEnd - L.apronR0) * (i + 1)) / steps;
    for (const [t0, t1, col] of lanes) {
      const isLine = col === line;
      if (isLine && i % 2 === 1) {
        b.quad(gp(s0, t0, roadY(s0)), gp(s1, t0, roadY(s1)), gp(s1, t1, roadY(s1)), gp(s0, t1, roadY(s0)), asphalt, up);
      } else {
        b.quad(gp(s0, t0, roadY(s0)), gp(s1, t0, roadY(s1)), gp(s1, t1, roadY(s1)), gp(s0, t1, roadY(s0)), col, up, [
          s0 / 2.5, t0 / 2.5, s1 / 2.5, t0 / 2.5, s1 / 2.5, t1 / 2.5, s0 / 2.5, t1 / 2.5,
        ]);
      }
    }
  }
  // road side walls beyond the stands (low kerbs)
  for (const side of [1, -1]) {
    const m = new THREE.Matrix4().makeBasis(g, up, t).setPosition(0, 0, 0);
    b.box(m, [L.facadeR, 0, side * hw - 0.2], [roadEnd, 0.35, side * hw + 0.2], lin(0x9a968d), ['ny']);
  }

  // footbridge over the gap connecting the cross aisles
  {
    const m = new THREE.Matrix4().makeBasis(g, up, t);
    const s0 = sOf(L.crossR0) - 0.2;
    const s1 = sOf(L.crossR1) + 0.8;
    const conc = lin(0x7a766d);
    b.box(m, [s0, L.crossY - 1.1, -hw - 0.02], [s1, L.crossY, hw + 0.02], conc, [], { ny: scaleRgb(conc, 0.45), py: lin(0x8a867d) });
    // front parapet of the bridge (carries the PIT sign)
    b.box(m, [s0, L.crossY, -hw - 0.02], [s0 + 0.25, L.crossY + 1.15, hw + 0.02], conc);
    // rear parapet
    b.box(m, [s1 - 0.25, L.crossY, -hw - 0.02], [s1, L.crossY + 1.15, hw + 0.02], conc);
    // bridge rail posts
    for (let k = -4; k <= 4; k++) {
      metal.box(m, [s0 + 0.08, L.crossY + 1.15, k * 1.2 - 0.03], [s0 + 0.14, L.crossY + 1.95, k * 1.2 + 0.03], lin(0xd8b02a));
    }
    metal.box(m, [s0 + 0.05, L.crossY + 1.9, -hw], [s0 + 0.17, L.crossY + 1.98, hw], lin(0xd8b02a));
  }

  // ---- rails: lower-tier front rail, upper-tier front rail, back rail ------------------------
  const railYellow = lin(0xd8b02a);
  const railGrey = lin(0x8d9399);
  const addRing = (r: number, y0: number, h: number, col: Rgb, postEvery: number) => {
    for (const c of cols) {
      const aL = angleAt(c, r, 0);
      const aR = angleAt(c, r, 1);
      if (c.aisle && y0 < L.crossY) continue; // keep lower aisles open at the front rail
      const p0 = ringPoint(aL, r, y0 + h);
      const p1 = ringPoint(aR, r, y0 + h);
      metal.beam(p0, p1, 0.07, col);
      const mid = ringPoint(aL, r, y0 + h * 0.5);
      const mid1 = ringPoint(aR, r, y0 + h * 0.5);
      metal.beam(mid, mid1, 0.035, col);
    }
    const n = Math.floor((r * (L.standA1 - L.standA0)) / postEvery);
    for (let i = 0; i <= n; i++) {
      const a = L.standA0 + ((L.standA1 - L.standA0) * i) / n;
      let inAisle = false;
      for (const al of L.aisles) if (Math.abs(a - al) < L.aisleHalfAngle) inAisle = true;
      if (inAisle && y0 < L.crossY) continue;
      metal.beam(ringPoint(a, r, y0), ringPoint(a, r, y0 + h), 0.06, col);
    }
  };
  addRing(L.apronR1 + 0.06, L.lowerFrontY, 0.95, railYellow, 2.4);
  addRing(L.crossR1 + 0.06, L.upperFrontTopY, 0.95, railYellow, 2.4);
  addRing(L.backR + 0.1, L.backTopY, 1.0, railGrey, 3.0);

  // aisle hand rails (centre of each aisle, following the rake)
  for (const al of L.aisles) {
    for (const tier of [0, 1]) {
      const tr = L.rows.filter((w) => w.tier === tier);
      const f = tr[0];
      const l = tr[tr.length - 1];
      const pA = ringPoint(al, f.rFront + 0.4, f.y + 0.95);
      const pB = ringPoint(al, l.rBack - 0.2, l.y + l.rise * 0.5 + 0.95);
      metal.beam(pA, pB, 0.06, railGrey);
      const n = 4;
      for (let i = 0; i <= n; i++) {
        const w = tr[Math.round((i / n) * (tr.length - 1))];
        const rr = w.rFront + w.depth * 0.5;
        const k = (rr - (f.rFront + 0.4)) / (l.rBack - 0.2 - (f.rFront + 0.4));
        const yTop = pA.y + (pB.y - pA.y) * k;
        metal.beam(ringPoint(al, rr, w.y + w.rise * 0.5), ringPoint(al, rr, yTop), 0.05, railGrey);
      }
    }
  }

  // ---- seats -------------------------------------------------------------------------------
  const seats: Seat[] = [];
  const secBounds: [number, number][] = [];
  const bounds = [L.standA0, ...L.aisles, L.standA1];
  for (let k = 0; k < bounds.length - 1; k++) secBounds.push([bounds[k], bounds[k + 1]]);
  const nSec = secBounds.length;
  const spacing = 0.6;
  for (const w of L.rows) {
    const r = w.rFront + w.depth * 0.26;
    for (let s = 0; s < nSec; s++) {
      let a0 = secBounds[s][0];
      let a1 = secBounds[s][1];
      a0 = s === 0 ? gapCutAngle(L, r, 1) + 0.3 / r : a0 + L.aisleHalfAngle + 0.22 / r;
      a1 = s === nSec - 1 ? gapCutAngle(L, r, -1) - 0.3 / r : a1 - L.aisleHalfAngle - 0.22 / r;
      const n = Math.floor(((a1 - a0) * r) / spacing);
      if (n <= 0) continue;
      const step = (a1 - a0) / n;
      for (let i = 0; i < n; i++) {
        const a = a0 + step * (i + 0.5) + ((rng.next() - 0.5) * 0.12) / r;
        const rr = r + (rng.next() - 0.5) * 0.06;
        const rowFrac = w.index / 9;
        const weight = (w.tier === 0 ? 1.0 : 0.82) - 0.22 * rowFrac * (w.tier === 1 ? 1 : 0.4);
        seats.push({ x: Math.cos(a) * rr, y: w.y, z: Math.sin(a) * rr, a, r: rr, kind: 0, tier: w.tier, row: w.index, section: s, weight });
      }
    }
  }
  // standing fans on the apron right behind the wall / fence, in clusters
  {
    const r0 = L.outerR + 0.32;
    const r1 = L.apronR1 - 0.3;
    const nClusters = 70;
    for (let k = 0; k < nClusters; k++) {
      const ac = L.standA0 + 0.05 + rng.next() * (L.standA1 - L.standA0 - 0.1);
      const size = 3 + Math.floor(rng.next() * 9);
      for (let i = 0; i < size; i++) {
        const rr = r0 + rng.next() * (r1 - r0);
        const a = ac + ((i - size / 2) * 0.55 + (rng.next() - 0.5) * 0.3) / rr;
        if (a < gapCutAngle(L, rr, 1) + 0.4 / rr || a > gapCutAngle(L, rr, -1) - 0.4 / rr) continue;
        seats.push({ x: Math.cos(a) * rr, y: L.apronY, z: Math.sin(a) * rr, a, r: rr, kind: 1, tier: 0, row: -1, section: -1, weight: 1 });
      }
    }
    // people milling on the cross aisle
    const rc0 = L.crossR0 + 0.4;
    const rc1 = L.crossR1 - 0.45;
    for (let k = 0; k < 160; k++) {
      const rr = rc0 + rng.next() * (rc1 - rc0);
      const a = L.standA0 + 0.1 + rng.next() * (L.standA1 - L.standA0 - 0.2);
      if (a < gapCutAngle(L, rr, 1) + 0.5 / rr || a > gapCutAngle(L, rr, -1) - 0.5 / rr) continue;
      seats.push({ x: Math.cos(a) * rr, y: L.crossY, z: Math.sin(a) * rr, a, r: rr, kind: 2, tier: 0, row: -1, section: -1, weight: 1 });
    }
  }

  return { seats, sections: nSec };
}
