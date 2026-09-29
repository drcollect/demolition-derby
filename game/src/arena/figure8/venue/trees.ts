import * as THREE from 'three';
import { GeoBuilder, Rng, lin, type Disposer, type Rgb, type SharedUniforms } from '../../stadium/util';
import { patchMaterial, type HazeUniforms } from './materials';
import { cylinder, dome } from './shapes';

/*
 Instanced low-poly trees: broadleaf (three lumpy crowns on a trunk) and poplar/cedar (tall narrow crown).
 One InstancedMesh per kind; crowns sway with the wind in the vertex shader (weighted by height), and the
 material fades into the sky's horizon colour with distance.
*/

function broadleaf(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const bark: Rgb = lin(0x4a3a2a);
  cylinder(b, new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, 3.2, 0), 0.28, 0.18, 5, bark);
  const leaf = (c: THREE.Vector3, r: number, shade: number) => {
    const col: Rgb = [0.11 * shade, 0.16 * shade, 0.05 * shade];
    const low: Rgb = [0.05 * shade, 0.075 * shade, 0.025 * shade];
    dome(b, c, r, r * 0.85, 6, 2, col, true, low);
  };
  leaf(new THREE.Vector3(0, 4.9, 0), 2.7, 1.0);
  leaf(new THREE.Vector3(1.4, 4.0, 0.6), 1.9, 0.88);
  leaf(new THREE.Vector3(-0.9, 5.6, -0.6), 2.0, 1.15);
  return b.build();
}

function poplar(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  cylinder(b, new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, 2.0, 0), 0.2, 0.14, 5, lin(0x4a3a2a));
  const segs = 7;
  const rows = [
    [1.5, 1.2],
    [2.2, 1.55],
    [5.0, 1.45],
    [8.0, 1.05],
    [10.2, 0.5],
    [11.2, 0.0],
  ];
  const ring: number[][] = [];
  for (let j = 0; j < rows.length; j++) {
    const [y, r] = rows[j];
    const row: number[] = [];
    const shade = 0.6 + 0.5 * (j / (rows.length - 1));
    const col: Rgb = [0.08 * shade, 0.13 * shade, 0.045 * shade];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const n = new THREE.Vector3(Math.cos(a), 0.35, Math.sin(a)).normalize();
      row.push(b.vert(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), n, i / segs, j, col));
    }
    ring.push(row);
  }
  for (let j = 0; j + 1 < ring.length; j++) for (let i = 0; i < segs; i++) b.idx.push(ring[j][i], ring[j + 1][i + 1], ring[j][i + 1], ring[j][i], ring[j + 1][i], ring[j + 1][i + 1]);
  return b.build();
}

export interface TreePlacement {
  p: THREE.Vector3;
  scale: number;
  kind: 0 | 1;
}

export function buildTrees(list: TreePlacement[], rng: Rng, shared: SharedUniforms, haze: HazeUniforms, disposer: Disposer): THREE.InstancedMesh[] {
  const out: THREE.InstancedMesh[] = [];
  const geos = [disposer.add(broadleaf()), disposer.add(poplar())];
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.35 });
  patchMaterial(mat, {
    key: 'trees',
    haze,
    uniforms: { uTime: shared.uTime },
    vertDecl: 'uniform float uTime;\n',
    vertBegin: /* glsl */ `
      {
        vec4 f8o = vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          f8o = instanceMatrix * f8o;
        #endif
        float f8h = max(transformed.y - 2.0, 0.0);
        float f8ph = f8o.x * 0.13 + f8o.z * 0.07;
        float f8s = sin(uTime * 1.3 + f8ph) * 0.6 + sin(uTime * 2.9 + f8ph * 1.7) * 0.25;
        transformed.x += f8s * f8h * 0.018;
        transformed.z += f8s * f8h * 0.01;
      }
    `,
  });
  disposer.add(mat);
  for (const kind of [0, 1] as const) {
    const items = list.filter((t) => t.kind === kind);
    if (!items.length) continue;
    const mesh = new THREE.InstancedMesh(geos[kind], mat, items.length);
    mesh.name = kind === 0 ? 'F8TreesBroadleaf' : 'F8TreesPoplar';
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    items.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * Math.PI * 2);
      const s = t.scale;
      m.compose(t.p, q, new THREE.Vector3(s * (0.9 + rng.next() * 0.2), s, s * (0.9 + rng.next() * 0.2)));
      mesh.setMatrixAt(i, m);
      const k = 0.8 + rng.next() * 0.4;
      col.setRGB(k * (0.95 + rng.next() * 0.15), k, k * (0.85 + rng.next() * 0.2));
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    disposer.add(mesh);
    out.push(mesh);
  }
  return out;
}

/** Tree lines along field edges and clumps, kept away from the venue, lots and the fair's sight line. */
export function planTrees(rng: Rng, avoid: (x: number, z: number) => boolean, hi: boolean): TreePlacement[] {
  const out: TreePlacement[] = [];
  const add = (x: number, z: number, kind: 0 | 1, scale: number) => {
    if (avoid(x, z)) return;
    out.push({ p: new THREE.Vector3(x, -0.05, z), scale, kind });
  };
  const density = hi ? 1 : 0.5;
  // wind breaks: long rows at various distances and angles
  const rows: [number, number, number, number, 0 | 1][] = [
    [-50, 88, 115, 93, 0], // windbreak behind the far stands
    [174, -75, 178, 75, 1], // poplars east of the pits
    [-420, 205, 380, 230, 0],
    [-380, -250, 200, -300, 0],
    [290, -380, 330, 360, 1],
    [-330, -380, -300, 120, 0],
    [120, 340, 520, 420, 0],
    [-600, 480, -150, 520, 0],
    [500, -250, 700, 120, 1],
    [-700, -150, -560, 360, 0],
  ];
  for (const [x0, z0, x1, z1, kind] of rows) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const step = (kind === 1 ? 7 : 10) / density;
    for (let d = 0; d < len; d += step * (0.7 + rng.next() * 0.6)) {
      const t = d / len;
      if (rng.next() < 0.12) continue;
      add(x0 + (x1 - x0) * t + (rng.next() - 0.5) * 4, z0 + (z1 - z0) * t + (rng.next() - 0.5) * 4, kind, (kind === 1 ? 1.0 : 1.3) * (0.75 + rng.next() * 0.6));
    }
  }
  // clumps
  const clumps = Math.round(22 * density);
  for (let k = 0; k < clumps; k++) {
    const a = rng.next() * Math.PI * 2;
    const r = 130 + rng.next() * 520;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const n = 3 + Math.floor(rng.next() * 7);
    for (let i = 0; i < n; i++) add(cx + (rng.next() - 0.5) * 30, cz + (rng.next() - 0.5) * 30, rng.next() < 0.2 ? 1 : 0, 1.0 + rng.next() * 0.7);
  }
  return out;
}
