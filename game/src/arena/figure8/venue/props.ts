import * as THREE from 'three';
import { GeoBuilder, Rng, lin, scaleRgb, type Rgb } from '../../stadium/util';
import { Sign, flatPanel } from '../../stadium/signage';
import type { Seat } from '../../stadium/stands';
import type { Site } from './site';
import type { Layout } from './layout';
import type { Builders, Lamp } from './stands';
import { F8Sign } from './signs';
import { FlagArt, FlagBuilder, POLE_ART, roundBale, squareBale } from './flags';
import { box, boxOn, cylinder, local } from './shapes';
import { ambulance, hayWagon, pickup, wrecker, waterTruck, farmTractor, type VB } from './vehicles';

export interface PropCtx {
  site: Site;
  L: Layout;
  B: Builders;
  hay: GeoBuilder;
  flags: FlagBuilder;
  seats: Seat[];
  lamps: Lamp[];
  wind: THREE.Vector3;
  hi: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const STEEL: Rgb = lin(0x6f757b);
const GALV: Rgb = lin(0xa4aaaf);
const WOOD_POLE: Rgb = lin(0x5a4430);
const HAY: Rgb = [1, 1, 1];
const HAY_OLD: Rgb = [0.82, 0.78, 0.68];

/** crowd.ts yaw convention: a figure with seat angle `a` faces (-cos a, -sin a). */
export const faceAngle = (dx: number, dz: number) => Math.atan2(-dz, -dx);

function standing(seats: Seat[], p: THREE.Vector3, facing: THREE.Vector3, kind: 1 | 2 = 1) {
  seats.push({ x: p.x, y: p.y, z: p.z, a: faceAngle(facing.x, facing.z), r: 0, kind, tier: 0, row: -1, section: -1, weight: 1 });
}

/** Square truss between two points (4 chords + zig-zag lacing on every face). */
function truss(b: GeoBuilder, p0: THREE.Vector3, p1: THREE.Vector3, w: number, h: number, chord: number, lace: number, col: Rgb, bay = 1.0) {
  const dir = p1.clone().sub(p0);
  const len = dir.length();
  dir.normalize();
  const side = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(UP, dir).normalize();
  const up2 = new THREE.Vector3().crossVectors(dir, side).normalize();
  const c = (sx: number, sy: number, t: number) => p0.clone().addScaledVector(dir, t).addScaledVector(side, (sx * w) / 2).addScaledVector(up2, (sy * h) / 2);
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sy] of corners) b.beam(c(sx, sy, 0), c(sx, sy, len), chord, col);
  const n = Math.max(1, Math.round(len / bay));
  for (let k = 0; k < n; k++) {
    const t0 = (k * len) / n, t1 = ((k + 1) * len) / n;
    for (let f = 0; f < 4; f++) {
      const [ax, ay] = corners[f], [bx, by] = corners[(f + 1) % 4];
      if (k % 2 === 0) b.beam(c(ax, ay, t0), c(bx, by, t1), lace, col);
      else b.beam(c(bx, by, t0), c(ax, ay, t1), lace, col);
    }
    for (let f = 0; f < 4; f++) {
      const [ax, ay] = corners[f], [bx, by] = corners[(f + 1) % 4];
      b.beam(c(ax, ay, t1), c(bx, by, t1), lace, col);
    }
  }
}

/** A simple standing person (for the flagman) facing `yaw` (+z local = forward). */
function person(b: GeoBuilder, base: THREE.Vector3, yaw: number, shirt: Rgb, pants: Rgb, rightArmUp: boolean) {
  const skin = lin(0xd8a07a);
  const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: Rgb) => {
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(local(base, yaw, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
    b.box(m, [-(x1 - x0) / 2, -(y1 - y0) / 2, -(z1 - z0) / 2], [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2], col, ['ny']);
  };
  bx(-0.17, -0.02, 0, 0.86, -0.1, 0.1, pants);
  bx(0.02, 0.17, 0, 0.86, -0.1, 0.1, pants);
  bx(-0.22, 0.22, 0.84, 1.44, -0.13, 0.13, shirt);
  bx(-0.1, 0.1, 1.44, 1.72, -0.11, 0.11, skin);
  bx(-0.12, 0.12, 1.7, 1.78, -0.13, 0.15, lin(0x1c1c1c)); // cap
  bx(0.22, 0.32, 0.82, 1.4, -0.06, 0.06, shirt); // left arm down
  if (rightArmUp) bx(-0.33, -0.23, 1.36, 1.98, -0.06, 0.06, shirt);
  else bx(-0.33, -0.23, 0.82, 1.4, -0.06, 0.06, shirt);
}

// ---- start / finish gantry -----------------------------------------------------------------------------------------------
export function buildGantry(c: PropCtx) {
  const { site, B, flags } = c;
  const track = site.track;
  const st = track.sampleAt(track.startS);
  const t = st.t.clone().setY(0).normalize();
  const n = st.n.clone().setY(0).normalize();
  const surf = track.heightAt(st.p.x, st.p.z);
  // legs just outside the hard keep-out on both sides
  const legAt = (side: number) => {
    for (let lat = site.clear + 0.85; lat < site.clear + 6; lat += 0.1) {
      const p = st.p.clone().addScaledVector(n, side * lat);
      if (site.isClear(p.x, p.z, 0.75, 0.1, true)) return p;
    }
    return st.p.clone().addScaledVector(n, side * (site.clear + 6));
  };
  const legL = legAt(1), legR = legAt(-1);
  const bottom = surf + 6.4;
  const top = bottom + 1.0;
  const red: Rgb = lin(0xb4231d);
  for (const leg of [legL, legR]) {
    const g = c.site.groundMin(leg.x, leg.z, 0.7);
    boxOn(B.matte, new THREE.Vector3(leg.x, g - 0.3, leg.z), Math.atan2(t.x, t.z), 1.3, 0.55, 1.3, lin(0xa39e92));
    truss(B.metal, new THREE.Vector3(leg.x, g + 0.2, leg.z), new THREE.Vector3(leg.x, top + 0.45, leg.z), 0.8, 0.8, 0.07, 0.035, red, 0.8);
  }
  const aL = legL.clone().setY((bottom + top) / 2), aR = legR.clone().setY((bottom + top) / 2);
  truss(B.metal, aL, aR, 0.9, 1.0, 0.075, 0.04, lin(0xe8e6de), 1.0);
  // banners: START/FINISH toward the approaching cars (they drive along +t), FIGURE 8 on the far side
  const span = aL.distanceTo(aR);
  const mid = aL.clone().add(aR).multiplyScalar(0.5);
  const bw = Math.min(span - 2.2, 15.2), bh = bw / 8;
  const approach = t.clone().negate();
  const rightA = new THREE.Vector3().crossVectors(UP, approach); // viewer's right when facing the banner
  flatPanel(B.signs, F8Sign.StartFinish, mid.clone().addScaledVector(approach, 0.5).setY(bottom + bh / 2 - 0.05), rightA, UP, bw, bh);
  const rightB = new THREE.Vector3().crossVectors(UP, t);
  flatPanel(B.signs, F8Sign.Figure8, mid.clone().addScaledVector(t, 0.5).setY(bottom + bh / 2 - 0.05), rightB, UP, bw, bh);
  // start lights under the truss: red row off, green row on
  const lc = mid.clone().setY(bottom - 0.35);
  box(B.metal, lc, Math.atan2(t.x, t.z), 2.3, 0.55, 0.35, lin(0x1c1d1f));
  for (let k = 0; k < 5; k++) {
    const x = (k - 2) * 0.42;
    for (const [dy, col] of [[0.12, [0.3, 0.025, 0.02]], [-0.12, [0.2, 1.7, 0.4]]] as [number, Rgb][]) {
      const p = lc.clone().addScaledVector(rightA, x).addScaledVector(approach, 0.18).setY(lc.y + dy);
      const s = 0.085;
      B.lamps.quad(p.clone().addScaledVector(rightA, -s).setY(p.y - s), p.clone().addScaledVector(rightA, s).setY(p.y - s), p.clone().addScaledVector(rightA, s).setY(p.y + s), p.clone().addScaledVector(rightA, -s).setY(p.y + s), col, approach);
      if (col[1] > 1) c.lamps.push({ p: p.clone().addScaledVector(approach, 0.05), size: 0.4, color: new THREE.Color(0.12, 0.6, 0.18), dir: approach.clone() });
    }
  }
  // checkered + green flags hanging from the truss ends
  flags.hanging(aL.clone().addScaledVector(approach, 0.5).addScaledVector(rightA, span * 0.5 - 1.8).setY(bottom - 0.05), rightA.clone().negate(), approach, FlagArt.Checker, 1.2, 0.8, 0.3);
  flags.hanging(aR.clone().addScaledVector(approach, 0.5).addScaledVector(rightA, -span * 0.5 + 3.0).setY(bottom - 0.05), rightA.clone().negate(), approach, FlagArt.Checker, 1.2, 0.8, 1.9);
  // flag poles on top of the legs
  for (const [leg, art] of [[legL, FlagArt.Stars], [legR, FlagArt.Checker]] as [THREE.Vector3, FlagArt][]) {
    const p0 = leg.clone().setY(top + 0.45), p1 = leg.clone().setY(top + 3.6);
    cylinder(B.metal, p0, p1, 0.04, 0.03, 5, lin(0xdedede), { capTop: true });
    flags.poleFlag(p1, c.wind, art, 1.8, 0.95, leg.x);
  }
  return { mid, legL, legR, approach, bottom };
}

// ---- flagman stand at the crossing --------------------------------------------------------------------------------------
export function buildFlagman(c: PropCtx, rng: Rng) {
  const { site, B, flags } = c;
  // a spot on the +z side of the X, far enough to be on the flat, looking at the crossing
  let pos = new THREE.Vector3(0, 0, 18);
  for (let z = 17; z < 34; z += 0.25) {
    if (site.isClear(0, z, 1.9, 0.4)) {
      pos = new THREE.Vector3(0, 0, z + 0.3);
      break;
    }
  }
  const g = site.groundY(pos.x, pos.z);
  const yaw = Math.PI; // faces -z (the crossing)
  const H = 3.4;
  const legCol = lin(0x7a7f84);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const p = local(new THREE.Vector3(pos.x, g, pos.z), yaw, sx * 1.1, 0, sz * 1.1);
    B.metal.beam(p.clone().setY(g - 0.2), p.clone().setY(g + H + 1.1), 0.09, legCol);
  }
  // braces
  for (const [a, b2] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as [number, number][][]) {
    const pa = local(new THREE.Vector3(pos.x, g, pos.z), yaw, a[0] * 1.1, 0.3, a[1] * 1.1);
    const pb = local(new THREE.Vector3(pos.x, g, pos.z), yaw, b2[0] * 1.1, H - 0.3, b2[1] * 1.1);
    B.metal.beam(pa, pb, 0.05, legCol);
  }
  // deck, rails, roof
  box(B.matte, new THREE.Vector3(pos.x, g + H, pos.z), yaw, 2.6, 0.12, 2.6, lin(0x8a7a60));
  for (const y of [H + 0.55, H + 1.05]) {
    const p = (sx: number, sz: number) => local(new THREE.Vector3(pos.x, g + y, pos.z), yaw, sx * 1.15, 0, sz * 1.15);
    B.metal.beam(p(-1, -1), p(1, -1), 0.045, GALV);
    B.metal.beam(p(1, -1), p(1, 1), 0.045, GALV);
    B.metal.beam(p(-1, 1), p(1, 1), 0.045, GALV);
  }
  // front skirt with a sponsor sign facing the crossing
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3().crossVectors(UP, fwd);
  box(B.matte, local(new THREE.Vector3(pos.x, g + H + 0.5, pos.z), yaw, 0, 0, 1.2), yaw, 2.5, 0.9, 0.05, lin(0xf0eee6));
  flatPanel(B.signs, Sign.Hanks, local(new THREE.Vector3(pos.x, g + H + 0.5, pos.z), yaw, 0, 0, 1.24), right, UP, 2.4, 0.3);
  // umbrella roof
  const post0 = new THREE.Vector3(pos.x, g + H, pos.z), post1 = new THREE.Vector3(pos.x, g + H + 2.7, pos.z);
  cylinder(B.metal, post0.clone().add(new THREE.Vector3(0.9, 0, -0.9).applyAxisAngle(UP, yaw)), post1.clone().add(new THREE.Vector3(0.9, 0, -0.9).applyAxisAngle(UP, yaw)), 0.035, 0.035, 5, GALV);
  const um = post1.clone().add(new THREE.Vector3(0.9, 0.25, -0.9).applyAxisAngle(UP, yaw));
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
    const r = 1.5;
    const col: Rgb = k % 2 ? lin(0xf2f0ea) : lin(0xc8241c);
    const p0 = um.clone().add(new THREE.Vector3(Math.cos(a0) * r, -0.45, Math.sin(a0) * r));
    const p1 = um.clone().add(new THREE.Vector3(Math.cos(a1) * r, -0.45, Math.sin(a1) * r));
    B.matte.tri(um, p0, p1, col, UP);
    B.matte.tri(um, p1, p0, scaleRgb(col, 0.6), UP.clone().negate());
  }
  // ladder at the back
  for (const sx of [-0.25, 0.25]) B.metal.beam(local(new THREE.Vector3(pos.x, g, pos.z), yaw, sx, 0, -1.35), local(new THREE.Vector3(pos.x, g, pos.z), yaw, sx, H, -1.2), 0.04, GALV);
  for (let k = 1; k < 10; k++) {
    const y = (k / 10) * H;
    B.metal.beam(local(new THREE.Vector3(pos.x, g, pos.z), yaw, -0.25, y, -1.35 + (0.15 * y) / H), local(new THREE.Vector3(pos.x, g, pos.z), yaw, 0.25, y, -1.35 + (0.15 * y) / H), 0.03, GALV);
  }
  // the flagman himself, green flag up
  const fb = new THREE.Vector3(pos.x, g + H + 0.06, pos.z);
  person(B.matte, fb, yaw, lin(0xf2f0ea), lin(0x1f2a44), true);
  const hand = local(fb, yaw, -0.28, 1.98, 0.05);
  const stickTop = hand.clone().add(new THREE.Vector3(0, 0.75, 0));
  cylinder(B.metal, hand.clone().setY(hand.y - 0.1), stickTop, 0.015, 0.015, 4, lin(0x2a2a2a));
  flags.poleFlag(stickTop, c.wind, FlagArt.Green, 0.95, 0.62, rng.next() * 6);
  // hay bales around the foot of the stand
  for (let k = -3; k <= 3; k++) {
    const p = local(new THREE.Vector3(pos.x, g, pos.z), yaw, k * 0.95, 0.18, 2.3);
    squareBale(c.hay, p.setY(site.groundY(p.x, p.z) + 0.18), yaw + Math.PI / 2 + (rng.next() - 0.5) * 0.1, rng.next() < 0.3 ? HAY_OLD : HAY);
    if (Math.abs(k) < 3) {
      const q = local(new THREE.Vector3(pos.x, g, pos.z), yaw, k * 0.95 + 0.45, 0.54, 2.3);
      squareBale(c.hay, q.setY(site.groundY(q.x, q.z) + 0.54), yaw + Math.PI / 2 + (rng.next() - 0.5) * 0.1, HAY);
    }
  }
  return pos;
}

// ---- light poles ------------------------------------------------------------------------------------------------------------
export function buildLightPoles(c: PropCtx, rng: Rng, fbl: { position: THREE.Vector3; target: THREE.Vector3 }[]) {
  const { site, B, L } = c;
  const f = L.fence;
  // (none at x = 0: that would stand in front of the scoreboard and the announcer booth)
  const cand: [number, number][] = [
    [-24, f.minZ + 4.5],
    [24, f.minZ + 4.5],
    [-24, f.maxZ - 4.5],
    [24, f.maxZ - 4.5],
    [-56, f.minZ + 4.5],
    [56, f.minZ + 4.5],
    [-56, f.maxZ - 4.5],
    [56, f.maxZ - 4.5],
    [f.minX + 4, 0],
    [f.maxX - 4, 0],
  ];
  const lampCol = new THREE.Color(0.62, 0.5, 0.36);
  for (const [x, z] of cand) {
    let px = x, pz = z;
    // nudge toward the fence until clear
    let ok = site.isClear(px, pz, 0.6, 0.3);
    for (let k = 0; k < 20 && !ok; k++) {
      if (Math.abs(x) > Math.abs(z)) px += Math.sign(x) * 0.4;
      else pz += Math.sign(z) * 0.4;
      ok = site.isClear(px, pz, 0.6, 0.3) && Math.abs(px) < f.maxX - 0.8 && Math.abs(pz) < f.maxZ - 0.8;
    }
    if (!ok) continue;
    const g = site.groundMin(px, pz, 0.5);
    const H = 16 + rng.next() * 2;
    const wooden = rng.next() < 0.5;
    cylinder(wooden ? B.matte : B.metal, new THREE.Vector3(px, g - 0.3, pz), new THREE.Vector3(px, g + H, pz), wooden ? 0.2 : 0.16, wooden ? 0.14 : 0.1, 7, wooden ? WOOD_POLE : GALV, { capTop: true });
    boxOn(B.matte, new THREE.Vector3(px, g - 0.1, pz), 0, 0.9, 0.35, 0.9, lin(0xa39e92));
    // aim at the nearest track point, a little beyond
    const near = site.track.samples[site.track.nearest(px, pz).index].p;
    const aim = new THREE.Vector3(near.x - px, 0, near.z - pz).normalize();
    const side = new THREE.Vector3().crossVectors(UP, aim).normalize();
    const top = new THREE.Vector3(px, g + H, pz);
    B.metal.beam(top.clone().addScaledVector(side, -1.5).setY(top.y - 0.3), top.clone().addScaledVector(side, 1.5).setY(top.y - 0.3), 0.1, STEEL);
    const heads = 4;
    const target = near.clone().setY(0);
    for (let k = 0; k < heads; k++) {
      const hp = top.clone().addScaledVector(side, -1.2 + (k * 2.4) / (heads - 1)).addScaledVector(aim, 0.25).setY(top.y - 0.3 + (k % 2) * 0.1);
      const d = target.clone().sub(hp).normalize();
      const X = new THREE.Vector3().crossVectors(UP, d).normalize();
      const Y = new THREE.Vector3().crossVectors(d, X).normalize();
      const m = new THREE.Matrix4().makeBasis(X, Y, d).setPosition(hp);
      B.metal.box(m, [-0.3, -0.24, -0.35], [0.3, 0.24, 0.02], lin(0x2a2c2f), ['pz']);
      // lens: warm, some still warming up (dimmer, oranger)
      // lens: warm; a few still warming up (dimmer, oranger)
      const warming = rng.next() < 0.25;
      const col: Rgb = warming ? [1.5, 0.75, 0.28] : [2.3, 1.85, 1.25];
      const P = (u: number, v: number) => new THREE.Vector3(u, v, 0.03).applyMatrix4(m);
      B.lamps.quad(P(-0.26, -0.2), P(0.26, -0.2), P(0.26, 0.2), P(-0.26, 0.2), col, d);
      c.lamps.push({ p: P(0, 0).addScaledVector(d, 0.05), size: warming ? 1.0 : 1.5, color: warming ? new THREE.Color(0.55, 0.28, 0.1) : lampCol.clone(), dir: d.clone() });
    }
    fbl.push({ position: top.clone().addScaledVector(aim, 0.4), target: target.clone() });
    // a ring of hay bales around the base (the pole is a hazard)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rng.next() * 0.2;
      const p = new THREE.Vector3(px + Math.cos(a) * 1.1, 0, pz + Math.sin(a) * 1.1);
      p.y = site.groundY(p.x, p.z) + 0.18;
      squareBale(c.hay, p, -a + Math.PI / 2, rng.next() < 0.3 ? HAY_OLD : HAY);
    }
  }
}

// ---- scoreboard structure ---------------------------------------------------------------------------------------------------
export function buildScoreboardFrame(c: PropCtx, w: number, h: number): { center: THREE.Vector3; yaw: number } {
  const { B, L } = c;
  const x = L.scoreboard.x, z = L.scoreboard.z;
  const yaw = Math.PI; // faces -z (the track and the main grandstand)
  const bottom = L.scoreboard.bottom;
  const center = new THREE.Vector3(x, bottom + h / 2, z);
  const paintCol = lin(0x23305a);
  // cabinet behind the face
  box(B.metal, local(center, yaw, 0, 0.15, -0.55), yaw, w + 0.9, h + 1.0, 1.0, paintCol, [], { pz: lin(0x111214) });
  // header sign + sponsor strip
  const fwd = new THREE.Vector3(0, 0, -1);
  const right = new THREE.Vector3().crossVectors(UP, fwd);
  box(B.metal, local(center, yaw, 0, h / 2 + 1.25, -0.4), yaw, w + 0.9, 1.9, 0.6, lin(0xa8221c));
  flatPanel(B.glow, F8Sign.Speedway, center.clone().setY(center.y + h / 2 + 1.25).addScaledVector(fwd, -0.09), right, UP, (w + 0.4), (w + 0.4) / 8);
  box(B.metal, local(center, yaw, 0, -h / 2 - 0.9, -0.4), yaw, w * 0.8, 1.3, 0.5, paintCol);
  flatPanel(B.signs, Sign.KrashKola, center.clone().setY(center.y - h / 2 - 0.9).addScaledVector(fwd, -0.14), right, UP, w * 0.76, (w * 0.76) / 8);
  // legs + catwalk
  for (const sx of [-1, 1]) {
    const lx = x + sx * w * 0.3;
    truss(B.metal, new THREE.Vector3(lx, -0.1, z + 0.55), new THREE.Vector3(lx, bottom - 1.5, z + 0.55), 0.9, 0.9, 0.09, 0.04, STEEL, 1.2);
    boxOn(B.matte, new THREE.Vector3(lx, -0.05, z + 0.55), 0, 1.4, 0.4, 1.4, lin(0xa39e92));
  }
  box(B.metal, new THREE.Vector3(x, bottom - 1.55, z + 0.2), 0, w + 0.6, 0.08, 1.2, STEEL);
  // lamps on top of the header
  for (let k = -3; k <= 3; k++) {
    const p = new THREE.Vector3(x + k * (w / 7), bottom + h + 2.45, z - 0.2);
    B.lamps.quad(p.clone().add(new THREE.Vector3(-0.16, -0.16, -0.05)), p.clone().add(new THREE.Vector3(0.16, -0.16, -0.05)), p.clone().add(new THREE.Vector3(0.16, 0.16, -0.05)), p.clone().add(new THREE.Vector3(-0.16, 0.16, -0.05)), [3.5, 0.9, 0.35], new THREE.Vector3(0, 0, -1));
    c.lamps.push({ p: p.clone().add(new THREE.Vector3(0, 0, -0.1)), size: 0.8, color: new THREE.Color(1.2, 0.35, 0.12), dir: new THREE.Vector3(0, 0, -1) });
  }
  // hay bales at the feet
  for (let k = 0; k < 8; k++) {
    const p = new THREE.Vector3(x - 5 + k * 1.3, 0.18, z - 1.8);
    squareBale(c.hay, p, 0, HAY);
  }
  return { center: center.clone().add(new THREE.Vector3(0, 0, -0.08)), yaw };
}

// ---- the +z side: pickups and hay wagons with people on them ------------------------------------------------------------------
export function buildFarSideTrucks(c: PropCtx, v: VB, rng: Rng) {
  const { L, seats, hay } = c;
  const toTrack = new THREE.Vector3(0, 0, -1);
  for (const gap of L.farGaps) {
    if (gap.width < 12) {
      // hay wagon parallel to the fence, bales on it and people standing on the deck / bales
      // tongue points +x, so shift back to keep wagon + tongue inside the gap
      const base = new THREE.Vector3(gap.cx - 0.8, 0, L.fence.maxZ + 3.8);
      const yaw = Math.PI / 2;
      const deck = hayWagon(v, base, yaw);
      for (let k = 0; k < 4; k++) {
        const p = local(base, yaw, 0.55, deck + 0.18, -2.2 + k * 1.1);
        squareBale(hay, p, yaw + (rng.next() - 0.5) * 0.1, HAY);
      }
      for (let k = 0; k < 7; k++) {
        const onBale = k < 3;
        const p = local(base, yaw, onBale ? 0.55 : -0.55 + (rng.next() - 0.5) * 0.2, deck + (onBale ? 0.36 : 0), -2.4 + k * 0.72 + (rng.next() - 0.5) * 0.2);
        standing(seats, p, toTrack.clone().applyAxisAngle(UP, (rng.next() - 0.5) * 0.5));
      }
    } else {
      // two pickups backed up to the fence with folks in the beds, a tractor behind them
      for (const sx of [-1, 1]) {
        const base = new THREE.Vector3(gap.cx + sx * 7.8, 0, L.fence.maxZ + 3.9);
        const yaw = 0; // nose pointing +z (tailgate toward the track)
        const paint = lin([0x8a1c1c, 0x1f3a6e, 0xd7c9a0, 0x2d5a33][Math.floor(rng.next() * 4)]);
        const bed = pickup(v, base, yaw, paint, rng);
        for (let k = 0; k < 4; k++) {
          const p = local(base, yaw, (k % 2 ? -0.45 : 0.45) + (rng.next() - 0.5) * 0.1, bed, -2.3 + Math.floor(k / 2) * 0.9);
          standing(seats, p, toTrack.clone().applyAxisAngle(UP, (rng.next() - 0.5) * 0.6));
        }
        // lawn-chair crowd next to the truck
        for (let k = 0; k < 3; k++) standing(seats, new THREE.Vector3(base.x + sx * 2.1 + (rng.next() - 0.5), 0, base.z - 2.0 + k * 0.7), toTrack);
      }
      farmTractor(v, new THREE.Vector3(gap.cx + 2.5, 0, L.fence.maxZ + 11), -0.3, lin(0x2f7a2f));
      roundBale(hay, new THREE.Vector3(gap.cx - 3.5, 0, L.fence.maxZ + 11.5), 0.4, 1.5, 1.2, HAY);
    }
  }
}

// ---- safety crew parked in the -z wedge (in front of the main grandstand) ----------------------------------------------------
export function buildSafetyCrew(c: PropCtx, v: VB, rng: Rng) {
  const { site, L } = c;
  const spots: [number, (b: THREE.Vector3, yaw: number) => void, number][] = [
    [-1, (b, y) => ambulance(v, b, y), 3.3],
    [1, (b, y) => wrecker(v, b, y, lin(0xd9a21b)), 3.5],
  ];
  for (const [sx, make, halfL] of spots) {
    let placed = false;
    for (let z = L.fence.minZ + 7; z < -16 && !placed; z += 0.5) {
      for (let x = 4; x < 20 && !placed; x += 0.5) {
        const p = new THREE.Vector3(sx * x, 0, z);
        const yaw = sx > 0 ? -0.35 : 0.35;
        if (site.rectClear(p, yaw, 1.3, halfL, 0.5)) {
          p.y = site.groundY(p.x, p.z);
          make(p, yaw);
          // a couple of crew leaning on it
          standing(c.seats, local(p, yaw, sx * 1.6, 0, 0.5), new THREE.Vector3(0, 0, 1), 2);
          placed = true;
        }
      }
    }
  }
  // water truck on the -x end strip, tractor with the track drag at the +x end
  const tryPlace = (cx: number, cz: number, yaw: number, halfL: number, make: (b: THREE.Vector3) => void) => {
    for (let k = 0; k < 40; k++) {
      const p = new THREE.Vector3(cx + (rng.next() - 0.5) * k * 0.6, 0, cz + (rng.next() - 0.5) * k * 0.6);
      if (site.rectClear(p, yaw, 1.4, halfL, 0.5) && site.inBounds(p.x, p.z)) {
        p.y = site.groundY(p.x, p.z);
        make(p);
        return;
      }
    }
  };
  tryPlace(L.fence.minX + 5, L.fence.maxZ - 6, 0.3, 3.6, (p) => waterTruck(v, p, 0.3, lin(0xe8e4da)));
  tryPlace(L.fence.maxX - 5, L.fence.maxZ - 6, -0.4, 2.2, (p) => farmTractor(v, p, -0.4, lin(0xc0241c)));
}

// ---- hay-bale lines along the long sides (between the tyre walls and the catch fence) -----------------------------------------
export function buildHayLines(c: PropCtx, rng: Rng) {
  const { site, L, hay } = c;
  for (const sz of [-1, 1]) {
    const z = sz > 0 ? L.fence.maxZ - 2.4 : L.fence.minZ + 2.4;
    for (let x = L.fence.minX + 8; x < L.fence.maxX - 8; x += 1.62) {
      if (rng.next() < 0.12) continue;
      if (!site.isClear(x, z, 0.9, 0.2)) continue;
      const p = new THREE.Vector3(x + (rng.next() - 0.5) * 0.2, 0, z + (rng.next() - 0.5) * 0.3);
      p.y = site.groundY(p.x, p.z);
      roundBale(hay, p, (rng.next() - 0.5) * 0.25, 1.45, 1.2, rng.next() < 0.25 ? HAY_OLD : HAY, c.hi ? 12 : 8);
    }
  }
}

// ---- flag poles at the fence corners and along the far side ---------------------------------------------------------------------
export function buildFlagPoles(c: PropCtx, rng: Rng, extraTops: THREE.Vector3[]) {
  const { B, L, flags } = c;
  const f = L.fence;
  const corners: [number, number][] = [
    [f.minX - 1.5, f.minZ - 1.5],
    [f.maxX + 1.5, f.minZ - 1.5],
    [f.minX - 1.5, f.maxZ + 1.5],
    [f.maxX + 1.5, f.maxZ + 1.5],
  ];
  let i = 0;
  for (const [x, z] of corners) {
    const top = new THREE.Vector3(x, 13, z);
    cylinder(B.metal, new THREE.Vector3(x, -0.1, z), top, 0.09, 0.05, 7, lin(0xdedede), { capTop: true });
    flags.poleFlag(top.clone().setY(top.y - 0.1), c.wind, i % 2 === 0 ? FlagArt.Stars : FlagArt.County, 3.2, 1.7, rng.next() * 6);
    i++;
  }
  for (const s of L.farStands) {
    for (const sx of [-1, 1]) {
      const x = s.cx + sx * (s.length / 2 - 0.3);
      const zb = s.frontZ + s.rows * s.depth - 0.1;
      const yb = s.firstY + (s.rows - 1) * s.rise + 1.05;
      const top = new THREE.Vector3(x, yb + 5.5, zb);
      cylinder(B.metal, new THREE.Vector3(x, yb - 1, zb), top, 0.045, 0.035, 5, lin(0xdedede), { capTop: true });
      flags.poleFlag(top, c.wind, POLE_ART[Math.floor(rng.next() * POLE_ART.length)], 1.7, 0.9, rng.next() * 6);
    }
  }
  for (const top of extraTops) flags.poleFlag(top, c.wind, POLE_ART[Math.floor(rng.next() * POLE_ART.length)], 1.9, 1.0, rng.next() * 6);
}
