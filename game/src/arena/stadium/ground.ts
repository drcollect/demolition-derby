import * as THREE from 'three';
import { GeoBuilder, Rng, lin, ringPoint, scaleRgb, type Disposer, type Rgb } from './util';
import type { Layout } from './layout';

export function noiseTexture(rng: Rng, size = 256, lo = 0.78, hi = 1.0): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('stadium: 2D canvas unavailable');
  const img = ctx.createImageData(size, size);
  // value noise, 3 octaves, tileable
  const grid = (n: number) => {
    const g: number[] = [];
    for (let i = 0; i < n * n; i++) g.push(rng.next());
    return (x: number, y: number) => {
      const fx = (x / size) * n;
      const fy = (y / size) * n;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const at = (i: number, j: number) => g[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  const o1 = grid(8);
  const o2 = grid(32);
  const o3 = grid(128);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = o1(x, y) * 0.5 + o2(x, y) * 0.3 + o3(x, y) * 0.2;
      const speck = rng.next() < 0.02 ? -0.15 : 0;
      const k = Math.max(0, Math.min(1, lo + (hi - lo) * v + speck));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(k * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export interface GroundResult {
  ground: THREE.Mesh;
  cars: THREE.InstancedMesh;
}

export function buildGround(L: Layout, rng: Rng, metal: GeoBuilder, lamps: GeoBuilder, groundTex: THREE.Texture, carDensity: number, disposer: Disposer): GroundResult {
  // ---- ground rings with colour bands ----
  const rings: [number, Rgb][] = [
    [L.outerR - 0.1, lin(0x5a5750)],
    [L.facadeR + 7, lin(0x5d5a54)],
    [L.facadeR + 9, lin(0x2c2c2f)],
    [118, lin(0x28292c)],
    [126, lin(0x1c2616)],
    [260, lin(0x141d11)],
    [480, lin(0x0b100a)],
    [900, lin(0x070907)],
  ];
  const b = new GeoBuilder();
  const segs = 160;
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < rings.length - 1; k++) {
    const [r0, c0] = rings[k];
    const [r1, c1] = rings[k + 1];
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const p = [ringPoint(a0, r0, 0), ringPoint(a1, r0, 0), ringPoint(a1, r1, 0), ringPoint(a0, r1, 0)];
      const uv: number[] = [];
      for (const q of p) uv.push(q.x / 7, q.z / 7);
      b.quad(p[0], p[1], p[2], p[3], [c0, c0, c1, c1], up, uv);
    }
  }
  const geo = b.build();
  disposer.add(geo);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTex, roughness: 0.95, metalness: 0 });
  disposer.add(mat);
  const ground = new THREE.Mesh(geo, mat);
  ground.name = 'StadiumGround';
  ground.receiveShadow = true;
  ground.castShadow = false;

  // ---- parking lot cars (one instanced mesh) ----
  const cb = new GeoBuilder();
  const I = new THREE.Matrix4();
  const body: Rgb = [1, 1, 1];
  const glass: Rgb = [0.05, 0.06, 0.07];
  const tyre: Rgb = [0.03, 0.03, 0.03];
  cb.box(I, [-0.9, 0.18, -2.3], [0.9, 0.95, 2.3], body, ['ny']);
  cb.box(I, [-0.78, 0.95, -1.25], [0.78, 1.42, 0.85], body, ['ny'], { pz: glass, nz: glass, px: glass, nx: glass });
  cb.box(I, [-0.92, 0.0, -1.7], [0.92, 0.36, -1.0], tyre, ['ny', 'py']);
  cb.box(I, [-0.92, 0.0, 1.0], [0.92, 0.36, 1.7], tyre, ['ny', 'py']);
  const cgeo = cb.build();
  cgeo.deleteAttribute('uv');
  disposer.add(cgeo);
  const cmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.45 });
  disposer.add(cmat);
  const paints = [0xb8b2a4, 0x8a1c1c, 0x1f3a6e, 0x2d5a33, 0xd7c9a0, 0x5a3a22, 0x222222, 0xe0e0dc, 0x9aa8b5, 0xb4561e, 0x6e7a2e, 0x7a1f3d, 0xc9a227, 0x3c6e8a];
  interface Spot { p: THREE.Vector3; yaw: number; scale: THREE.Vector3; color: number }
  const spots: Spot[] = [];
  const gA = L.gateAngle;
  const nearGate = (a: number, r: number) => Math.abs(Math.sin(a - gA)) * r < 9 && Math.cos(a - gA) > 0;
  const nearTower = (a: number, r: number) => L.towerAngles.some((ta) => ringPoint(ta, L.towerR, 0).distanceTo(ringPoint(a, r, 0)) < 5);
  for (let r = 72; r <= 112; r += 7) {
    const n = Math.floor((Math.PI * 2 * r) / 2.8);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (nearGate(a, r) || nearTower(a, r)) continue;
      if (rng.next() > 0.62 * carDensity) continue;
      const rowFlip = Math.floor((r - 72) / 7) % 2 === 0 ? 0 : Math.PI;
      const yaw = Math.atan2(Math.cos(a), Math.sin(a)) + rowFlip + (rng.next() - 0.5) * 0.12;
      spots.push({ p: ringPoint(a, r + (rng.next() - 0.5) * 0.4, 0), yaw, scale: new THREE.Vector3(1, 1, 0.92 + rng.next() * 0.16), color: rng.pick(paints) });
    }
  }
  // haulers + trailers in the pits beyond the gate road
  const gdir = new THREE.Vector3(Math.cos(gA), 0, Math.sin(gA));
  const gt = new THREE.Vector3(-Math.sin(gA), 0, Math.cos(gA));
  for (let i = 0; i < 8; i++) {
    const s = L.facadeR + 10 + (i % 4) * 7;
    const side = i < 4 ? 1 : -1;
    const p = gdir.clone().multiplyScalar(s).addScaledVector(gt, side * (8.5 + rng.next()));
    spots.push({ p, yaw: Math.atan2(gdir.x, gdir.z) + (rng.next() - 0.5) * 0.2, scale: new THREE.Vector3(1.35, 2.1, 2.3), color: rng.pick([0xe8e4da, 0x8a1c1c, 0x1f3a6e, 0xc9a227]) });
  }
  const cars = new THREE.InstancedMesh(cgeo, cmat, Math.max(1, spots.length));
  cars.name = 'StadiumParkingLot';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(up, s.yaw);
    m.compose(s.p, q, s.scale);
    cars.setMatrixAt(i, m);
    col.set(s.color);
    cars.setColorAt(i, col);
  });
  cars.count = spots.length;
  cars.castShadow = false;
  cars.receiveShadow = false;
  cars.computeBoundingSphere();

  // ---- parking lot light poles (sodium) ----
  const poleCol = lin(0x7d8288);
  const sodium: Rgb = scaleRgb(lin(0xffa860), 7);
  for (let r = 90; r <= 120; r += 30) {
    const n = Math.round((Math.PI * 2 * r) / 42);
    for (let i = 0; i < n; i++) {
      const a = ((i + (r === 90 ? 0.5 : 0)) / n) * Math.PI * 2;
      if (nearGate(a, r)) continue;
      const base = ringPoint(a, r, 0);
      const top = ringPoint(a, r, 11);
      metal.beam(base, top, 0.22, poleCol);
      const armDir = new THREE.Vector3(Math.cos(a + 1.5708), 0, Math.sin(a + 1.5708));
      for (const sgn of [1, -1]) {
        const tip = top.clone().addScaledVector(armDir, sgn * 1.6);
        metal.beam(top, tip, 0.12, poleCol);
        const c = tip.clone().setY(tip.y - 0.12);
        const s = 0.35;
        lamps.quad(
          c.clone().add(new THREE.Vector3(-s, 0, -s)),
          c.clone().add(new THREE.Vector3(s, 0, -s)),
          c.clone().add(new THREE.Vector3(s, 0, s)),
          c.clone().add(new THREE.Vector3(-s, 0, s)),
          sodium,
          new THREE.Vector3(0, -1, 0),
        );
      }
    }
  }
  return { ground, cars };
}
