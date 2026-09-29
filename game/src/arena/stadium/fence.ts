import * as THREE from 'three';
import { GeoBuilder, lin, ringPoint, type Disposer } from './util';
import type { Layout } from './layout';

/** Chain-link tile as a DataTexture (colour everywhere, pattern only in alpha => clean mipmaps). */
function chainLinkTexture(): THREE.DataTexture {
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  const wire = 1.9; // px half-width (perpendicular)
  const wrap = (v: number) => {
    const m = ((v % N) + N) % N;
    return Math.min(m, N - m);
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // two diagonal wire families (x-y = 0, x+y = 0 mod N) -> two diamonds per tile
      const e1 = wrap(x - y) / Math.SQRT2;
      const e2 = wrap(x + y + 1) / Math.SQRT2;
      const m = Math.min(e1, e2);
      const a = Math.max(0, Math.min(1, wire + 0.5 - m));
      // woven look: the family on top is a touch brighter
      const shade = e1 < e2 ? 1.0 : 0.82;
      const i = (y * N + x) * 4;
      const c = Math.round(160 * shade);
      data[i] = c;
      data[i + 1] = c + 4;
      data[i + 2] = c + 9;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
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
}

/** Posts/rails go into `metal`; the mesh band is its own transparent draw call. */
export function buildFence(L: Layout, metal: GeoBuilder, disposer: Disposer): FenceResult {
  const r = L.fenceR;
  const y0 = L.topY;
  const y1 = L.fenceTopY;
  const galv = lin(0x8e949a);
  const dark = lin(0x5d6166);
  const circ = Math.PI * 2 * r;
  const nPosts = Math.round(circ / 3.2);
  for (let i = 0; i < nPosts; i++) {
    const a = (i / nPosts) * Math.PI * 2;
    const m = new THREE.Matrix4().makeRotationY(-a).setPosition(ringPoint(a, r, 0));
    // post: 10 cm square, base plate
    metal.box(m, [-0.05, y0, -0.05], [0.05, y1 + 0.05, 0.05], galv, ['ny']);
    metal.box(m, [-0.12, y0, -0.12], [0.12, y0 + 0.03, 0.12], dark, ['ny']);
    // inward-leaning top arm (catch lip)
    const top = ringPoint(a, r, y1);
    const lip = ringPoint(a, r - 0.55, y1 + 0.42);
    metal.beam(top, lip, 0.06, galv);
  }
  // top rail, mid cable, lip rail
  const segs = Math.max(96, nPosts * 2);
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    metal.beam(ringPoint(a0, r, y1), ringPoint(a1, r, y1), 0.07, galv);
    metal.beam(ringPoint(a0, r - 0.55, y1 + 0.42), ringPoint(a1, r - 0.55, y1 + 0.42), 0.05, galv);
    metal.beam(ringPoint(a0, r - 0.02, (y0 + y1) * 0.5), ringPoint(a1, r - 0.02, (y0 + y1) * 0.5), 0.025, dark);
  }

  // mesh band (vertical part + the leaning lip), uv in metres
  const b = new GeoBuilder();
  const rm = L.fenceMeshR;
  const white: [number, number, number] = [1, 1, 1];
  const rings: [number, number][] = [
    [rm, y0 + 0.01],
    [rm, y1],
    [rm - 0.55, y1 + 0.42],
  ];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    for (let k = 0; k < rings.length - 1; k++) {
      const [ra, ya] = rings[k];
      const [rb, yb] = rings[k + 1];
      const va = k === 0 ? 0 : y1 - y0;
      const vb = k === 0 ? y1 - y0 : y1 - y0 + Math.hypot(ra - rb, ya - yb);
      const am = (a0 + a1) / 2;
      const facing = new THREE.Vector3(-Math.cos(am), 0, -Math.sin(am));
      b.quad(ringPoint(a0, ra, ya), ringPoint(a1, ra, ya), ringPoint(a1, rb, yb), ringPoint(a0, rb, yb), white, facing, [
        a0 * ra, va, a1 * ra, va, a1 * rb, vb, a0 * rb, vb,
      ]);
    }
  }
  const geo = b.build();
  geo.deleteAttribute('color');
  disposer.add(geo);
  const tex = disposer.add(chainLinkTexture());
  tex.repeat.set(1 / 0.1, 1 / 0.1); // tile = 10 cm (diamonds ~10 cm wide)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: 0.45,
    metalness: 0.6,
    color: new THREE.Color(0.9, 0.92, 0.95),
  });
  mat.forceSinglePass = true;
  disposer.add(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'StadiumCatchFence';
  mesh.renderOrder = -1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return { mesh };
}
