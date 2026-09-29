import * as THREE from 'three';
import { GeoBuilder, Rng, lin, scaleRgb, type Rgb } from '../../stadium/util';
import { cylinder, local, wheel } from './shapes';

/*
 Low-poly vehicles written straight into a shared GeoBuilder (one draw call for every parked vehicle).
 Local frame: `base` is the ground point under the vehicle centre, local +z is forward, +x its left side.
 Each builder returns useful heights (bed floor / deck) for putting people or cargo on it.
*/

export const GLASS: Rgb = lin(0x1a2128);
const CHROME: Rgb = lin(0xa8aaad);
const TYRE: Rgb = [0.025, 0.025, 0.026];
const HUB: Rgb = lin(0x8c8e90);
const DARK: Rgb = lin(0x2a2b2d);
const RUST: Rgb = lin(0x6b3a22);

export interface VB {
  b: GeoBuilder; // painted bodies
  lamps: GeoBuilder; // emissive light bars
}

function vbox(b: GeoBuilder, base: THREE.Vector3, yaw: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: Rgb, faceColor: Partial<Record<string, Rgb>> = {}, skip: string[] = ['ny']) {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(local(base, yaw, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  b.box(m, [-(x1 - x0) / 2, -(y1 - y0) / 2, -(z1 - z0) / 2], [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2], col, skip, faceColor);
}

function wheels(b: GeoBuilder, base: THREE.Vector3, yaw: number, xs: number, r: number, w: number, zs: number[], segs = 8) {
  const axle = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  for (const z of zs) for (const sx of [-1, 1]) wheel(b, local(base, yaw, sx * xs, r, z), axle, r, w, TYRE, HUB, segs);
}

/** Sloped windscreen quad between two heights (front of a cabin). */
function screen(b: GeoBuilder, base: THREE.Vector3, yaw: number, hw: number, y0: number, z0: number, y1: number, z1: number, col: Rgb) {
  const p = (x: number, y: number, z: number) => local(base, yaw, x, y, z);
  // outward normal in local (y, z): perpendicular to the slope, pointing forward and up
  const ny = -(z1 - z0), nz = y1 - y0;
  const nf = new THREE.Vector3(Math.sin(yaw) * nz, ny, Math.cos(yaw) * nz).normalize();
  b.quad(p(-hw, y0, z0), p(hw, y0, z0), p(hw, y1, z1), p(-hw, y1, z1), col, nf);
}

export function sedan(v: VB, base: THREE.Vector3, yaw: number, paint: Rgb, rng: Rng, derby = false): number {
  const b = v.b;
  const tilt = derby ? (rng.next() - 0.5) * 0.08 : 0;
  const yawB = yaw + tilt;
  const front = derby ? 2.15 - rng.next() * 0.35 : 2.45;
  vbox(b, base, yawB, -0.92, 0.92, 0.3, 0.92, -2.45, front, paint, { pz: scaleRgb(paint, 0.8) });
  // greenhouse: glass all round, painted roof
  const glass = derby ? DARK : GLASS;
  vbox(b, base, yawB, -0.8, 0.8, 0.92, 1.38, -1.15, 0.75, glass, { py: paint });
  screen(b, base, yawB, 0.8, 0.92, 1.25, 1.38, 0.75, glass);
  // bumpers
  vbox(b, base, yawB, -0.95, 0.95, 0.3, 0.5, front, front + 0.1, derby ? RUST : CHROME);
  vbox(b, base, yawB, -0.95, 0.95, 0.3, 0.5, -2.55, -2.45, derby ? RUST : CHROME);
  if (derby) {
    // roll-cage bar across the roof, a painted number panel on the roof, crumpled hood
    vbox(b, base, yawB, -0.5, 0.5, 1.385, 1.39, -0.7, 0.2, lin(0xf2f0ea), {}, ['ny']);
    vbox(b, base, yawB, -0.88, 0.88, 0.92, 1.04, 1.25, front, scaleRgb(paint, 0.85));
  }
  wheels(b, base, yaw, 0.84, 0.33, 0.24, [1.45, -1.45]);
  return 0.92;
}

export function pickup(v: VB, base: THREE.Vector3, yaw: number, paint: Rgb, rng: Rng): number {
  const b = v.b;
  const trim = rng.next() < 0.5 ? CHROME : DARK;
  vbox(b, base, yaw, -0.98, 0.98, 0.45, 0.95, -2.75, 2.75, paint);
  // cab
  vbox(b, base, yaw, -0.95, 0.95, 0.95, 1.9, -0.25, 1.15, paint, { pz: GLASS });
  vbox(b, base, yaw, -0.955, 0.955, 1.3, 1.78, -0.1, 1.05, GLASS, {}, ['ny', 'py', 'pz', 'nz']);
  screen(b, base, yaw, 0.93, 1.3, 1.16, 1.84, 1.02, GLASS);
  // hood + grille
  vbox(b, base, yaw, -0.95, 0.95, 0.95, 1.25, 1.15, 2.75, paint, { pz: trim });
  // bed walls + tailgate
  for (const sx of [-1, 1]) vbox(b, base, yaw, sx * 0.98 - 0.05, sx * 0.98 + 0.05, 0.95, 1.45, -2.75, -0.3, paint);
  vbox(b, base, yaw, -0.98, 0.98, 0.95, 1.45, -2.78, -2.68, paint);
  vbox(b, base, yaw, -0.93, 0.93, 0.95, 0.99, -2.68, -0.3, scaleRgb(paint, 0.55), {}, ['ny']);
  vbox(b, base, yaw, -1.0, 1.0, 0.42, 0.62, 2.75, 2.88, trim);
  vbox(b, base, yaw, -1.0, 1.0, 0.42, 0.62, -2.9, -2.78, trim);
  wheels(b, base, yaw, 0.9, 0.38, 0.28, [1.75, -1.75]);
  return 0.99; // bed floor
}

export function boxHauler(v: VB, base: THREE.Vector3, yaw: number, paint: Rgb, stripe: Rgb): void {
  const b = v.b;
  vbox(b, base, yaw, -1.22, 1.22, 0.55, 3.2, -3.8, 3.3, paint, { py: scaleRgb(paint, 0.9) });
  vbox(b, base, yaw, -1.235, 1.235, 1.4, 1.75, -3.8, 3.3, stripe, {}, ['ny', 'py', 'pz', 'nz']);
  // v-nose
  vbox(b, base, yaw, -1.0, 1.0, 0.55, 3.1, 3.3, 3.9, scaleRgb(paint, 0.92));
  // tongue + jack
  b.beam(local(base, yaw, 0, 0.5, 3.9), local(base, yaw, 0, 0.5, 5.4), 0.12, DARK);
  b.beam(local(base, yaw, 0, 0.0, 4.9), local(base, yaw, 0, 0.5, 4.9), 0.08, DARK);
  // fenders + tandem wheels
  for (const sx of [-1, 1]) vbox(b, base, yaw, sx * 1.22 - 0.1, sx * 1.22 + 0.1, 0.7, 0.8, -1.9, 0.1, DARK);
  wheels(b, base, yaw, 1.08, 0.36, 0.24, [-0.3, -1.5]);
}

export function flatbed(v: VB, base: THREE.Vector3, yaw: number, frame: Rgb): number {
  const b = v.b;
  vbox(b, base, yaw, -1.1, 1.1, 0.5, 0.62, -2.9, 2.6, lin(0x6e5236));
  for (const sx of [-1, 1]) vbox(b, base, yaw, sx * 1.1 - 0.06, sx * 1.1 + 0.06, 0.42, 0.72, -2.9, 2.6, frame);
  vbox(b, base, yaw, -1.1, 1.1, 0.42, 0.66, -3.0, -2.9, frame);
  b.beam(local(base, yaw, 0, 0.48, 2.6), local(base, yaw, 0, 0.48, 4.2), 0.12, frame);
  // ramps stowed at the back
  for (const sx of [-0.7, 0.7]) vbox(b, base, yaw, sx - 0.18, sx + 0.18, 0.62, 0.68, -2.8, -1.2, CHROME);
  wheels(b, base, yaw, 1.02, 0.33, 0.22, [0.1, -0.95]);
  return 0.62;
}

export function semiTractor(v: VB, base: THREE.Vector3, yaw: number, paint: Rgb): void {
  const b = v.b;
  vbox(b, base, yaw, -0.55, 0.55, 0.65, 1.05, -3.2, 3.2, DARK);
  vbox(b, base, yaw, -1.25, 1.25, 1.05, 3.4, -0.2, 1.7, paint, { pz: GLASS });
  vbox(b, base, yaw, -1.26, 1.26, 2.2, 3.0, 0.2, 1.5, GLASS, {}, ['ny', 'py', 'pz', 'nz']);
  vbox(b, base, yaw, -1.2, 1.2, 1.05, 2.1, 1.7, 3.3, paint, { pz: CHROME });
  vbox(b, base, yaw, -1.25, 1.25, 1.05, 3.1, -1.3, -0.2, scaleRgb(paint, 0.9));
  for (const sx of [-1, 1]) cylinder(b, local(base, yaw, sx * 1.15, 1.8, -0.35), local(base, yaw, sx * 1.15, 4.3, -0.35), 0.09, 0.09, 6, CHROME, { capTop: true });
  // fifth wheel plate
  vbox(b, base, yaw, -1.0, 1.0, 1.05, 1.15, -3.0, -1.6, DARK);
  wheels(b, base, yaw, 1.05, 0.52, 0.32, [2.5, -1.8, -3.0], 10);
}

export function enclosedTrailer(v: VB, base: THREE.Vector3, yaw: number, paint: Rgb, stripe: Rgb): void {
  const b = v.b;
  vbox(b, base, yaw, -1.28, 1.28, 1.2, 4.0, -7.0, 7.0, paint);
  vbox(b, base, yaw, -1.29, 1.29, 1.6, 2.1, -7.0, 7.0, stripe, {}, ['ny', 'py', 'pz', 'nz']);
  vbox(b, base, yaw, -1.1, 1.1, 0.9, 1.2, -7.0, 6.5, DARK);
  wheels(b, base, yaw, 1.1, 0.5, 0.3, [-4.6, -5.9], 10);
  // landing legs
  for (const sx of [-0.9, 0.9]) b.beam(local(base, yaw, sx, 0.0, 4.5), local(base, yaw, sx, 1.2, 4.5), 0.12, DARK);
}

export function farmTractor(v: VB, base: THREE.Vector3, yaw: number, paint: Rgb): void {
  const b = v.b;
  vbox(b, base, yaw, -0.45, 0.45, 0.8, 1.55, 0.0, 2.2, paint, { pz: DARK });
  vbox(b, base, yaw, -0.6, 0.6, 0.7, 1.3, -1.0, 0.1, scaleRgb(paint, 0.85));
  // seat + fenders + ROPS
  vbox(b, base, yaw, -0.25, 0.25, 1.3, 1.75, -0.9, -0.5, DARK);
  for (const sx of [-1, 1]) {
    vbox(b, base, yaw, sx * 0.95 - 0.2, sx * 0.95 + 0.2, 1.55, 1.62, -1.5, -0.1, paint);
    b.beam(local(base, yaw, sx * 0.55, 1.3, -1.1), local(base, yaw, sx * 0.55, 2.7, -1.1), 0.09, DARK);
  }
  b.beam(local(base, yaw, -0.55, 2.7, -1.1), local(base, yaw, 0.55, 2.7, -1.1), 0.09, DARK);
  cylinder(b, local(base, yaw, 0.25, 1.5, 1.6), local(base, yaw, 0.25, 2.35, 1.6), 0.05, 0.05, 6, DARK, { capTop: true });
  const axle = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  for (const sx of [-1, 1]) {
    wheel(b, local(base, yaw, sx * 0.98, 0.78, -0.75), axle, 0.78, 0.42, TYRE, paint, 12);
    wheel(b, local(base, yaw, sx * 0.62, 0.42, 1.75), axle, 0.42, 0.24, TYRE, paint, 10);
  }
}

/** Hay wagon: flat deck with a ladder front; returns the deck height. */
export function hayWagon(v: VB, base: THREE.Vector3, yaw: number): number {
  const b = v.b;
  const wood = lin(0x7a5a3a);
  vbox(b, base, yaw, -1.2, 1.2, 0.85, 1.0, -3.0, 3.0, wood);
  vbox(b, base, yaw, -1.0, 1.0, 0.55, 0.85, -2.6, 2.6, DARK);
  // ladder front
  for (const sx of [-1.1, 1.1]) b.beam(local(base, yaw, sx, 1.0, 2.95), local(base, yaw, sx, 2.6, 2.95), 0.08, wood);
  for (let k = 0; k < 4; k++) b.beam(local(base, yaw, -1.1, 1.3 + k * 0.4, 2.95), local(base, yaw, 1.1, 1.3 + k * 0.4, 2.95), 0.06, wood);
  b.beam(local(base, yaw, 0, 0.6, 3.0), local(base, yaw, 0, 0.5, 4.6), 0.1, DARK);
  wheels(b, base, yaw, 0.95, 0.42, 0.22, [1.9, -1.9]);
  return 1.0;
}

export function ambulance(v: VB, base: THREE.Vector3, yaw: number): void {
  const b = v.b;
  const white = lin(0xf0eeea), red = lin(0xc21d1d);
  vbox(b, base, yaw, -1.0, 1.0, 0.5, 1.05, -3.1, 3.1, white);
  vbox(b, base, yaw, -1.0, 1.0, 1.05, 2.1, 1.5, 3.1, white, { pz: GLASS });
  vbox(b, base, yaw, -1.01, 1.01, 1.35, 1.85, 1.6, 2.6, GLASS, {}, ['ny', 'py', 'pz', 'nz']);
  vbox(b, base, yaw, -1.15, 1.15, 0.5, 2.85, -3.1, 1.5, white);
  vbox(b, base, yaw, -1.16, 1.16, 1.25, 1.55, -3.1, 1.5, red, {}, ['ny', 'py', 'pz', 'nz']);
  vbox(b, base, yaw, -1.0, 1.0, 0.95, 1.1, 3.1, 3.2, CHROME);
  wheels(b, base, yaw, 0.95, 0.38, 0.26, [2.0, -2.0]);
  // light bar (red, just glowing)
  const p = local(base, yaw, 0, 2.2, 2.3);
  lightBar(v.lamps, p, yaw, 1.5, [1.6, 0.12, 0.08]);
  lightBar(v.lamps, local(base, yaw, 0, 2.95, 1.45), yaw, 1.9, [1.4, 0.1, 0.06]);
}

export function wrecker(v: VB, base: THREE.Vector3, yaw: number, paint: Rgb): void {
  const b = v.b;
  vbox(b, base, yaw, -1.0, 1.0, 0.5, 1.05, -3.2, 3.0, paint);
  vbox(b, base, yaw, -1.0, 1.0, 1.05, 2.05, 0.9, 2.3, paint, { pz: GLASS });
  vbox(b, base, yaw, -1.01, 1.01, 1.35, 1.85, 1.0, 2.1, GLASS, {}, ['ny', 'py', 'pz', 'nz']);
  vbox(b, base, yaw, -0.95, 0.95, 1.05, 1.3, 2.3, 3.0, paint, { pz: CHROME });
  // bed with boom
  vbox(b, base, yaw, -1.05, 1.05, 1.05, 1.4, -3.2, 0.6, DARK);
  const b0 = local(base, yaw, 0, 1.4, -0.4), b1 = local(base, yaw, 0, 3.6, -2.6);
  b.beam(b0, b1, 0.28, lin(0xd4a017));
  b.beam(b1, local(base, yaw, 0, 1.9, -3.1), 0.04, DARK);
  vbox(b, base, yaw, -0.9, 0.9, 0.45, 0.75, -3.4, -3.2, lin(0xd4a017));
  wheels(b, base, yaw, 0.92, 0.4, 0.28, [2.1, -1.6, -2.5]);
  lightBar(v.lamps, local(base, yaw, 0, 2.12, 1.6), yaw, 1.6, [1.7, 0.8, 0.08]);
}

export function waterTruck(v: VB, base: THREE.Vector3, yaw: number, paint: Rgb): void {
  const b = v.b;
  vbox(b, base, yaw, -0.6, 0.6, 0.6, 1.05, -3.4, 3.2, DARK);
  vbox(b, base, yaw, -1.1, 1.1, 1.05, 2.5, 1.8, 3.2, paint, { pz: GLASS });
  vbox(b, base, yaw, -1.11, 1.11, 1.65, 2.25, 1.9, 2.9, GLASS, {}, ['ny', 'py', 'pz', 'nz']);
  cylinder(b, local(base, yaw, 0, 1.95, -3.3), local(base, yaw, 0, 1.95, 1.5), 1.0, 1.0, 12, lin(0xb8bcbf), { capTop: true, capBottom: true });
  b.beam(local(base, yaw, -1.0, 0.8, -3.45), local(base, yaw, 1.0, 0.8, -3.45), 0.12, DARK); // spray bar
  wheels(b, base, yaw, 0.95, 0.46, 0.3, [2.4, -1.6, -2.8], 10);
}

function lightBar(lamps: GeoBuilder, c: THREE.Vector3, yaw: number, w: number, col: Rgb) {
  const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(w / 2);
  const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.14);
  const up = new THREE.Vector3(0, 0.12, 0);
  const p = (a: number, b: number, h: number) => c.clone().addScaledVector(r, a).addScaledVector(f, b).addScaledVector(up, h);
  lamps.quad(p(-1, 1, 0), p(1, 1, 0), p(1, 1, 1), p(-1, 1, 1), col, f);
  lamps.quad(p(1, -1, 0), p(-1, -1, 0), p(-1, -1, 1), p(1, -1, 1), col, f.clone().negate());
  lamps.quad(p(-1, -1, 1), p(-1, 1, 1), p(1, 1, 1), p(1, -1, 1), col, up);
}

export const CAR_PAINTS: number[] = [0xb8b2a4, 0x8a1c1c, 0x1f3a6e, 0x2d5a33, 0xd7c9a0, 0x5a3a22, 0x2b2b2b, 0xe0e0dc, 0x9aa8b5, 0xb4561e, 0x6e7a2e, 0x7a1f3d, 0xc9a227, 0x3c6e8a, 0xf0efe9];
export const DERBY_PAINTS: number[] = [0xe8c21d, 0xd62f2f, 0x2f6fd6, 0xf07f1a, 0x2fb36a, 0xb04fd6, 0xf2f2f2, 0xff5fa2, 0x27c3c9, 0x8ad62f];
