import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_SPECS, type CarSpec } from './specs';
import type { WheelName } from './vehicle';

export interface PartTemplate {
  name: string;
  geometry: THREE.BufferGeometry; // car space
  materialNames: string[]; // one per geometry group
  box: THREE.Box3;
}

export interface WheelTemplate {
  name: WheelName;
  geometry: THREE.BufferGeometry; // wheel space, centred on the axle
  materialNames: string[];
  center: THREE.Vector3; // car space
  radius: number;
  width: number;
}

export interface CarTemplate {
  id: string;
  spec: CarSpec;
  parts: PartTemplate[];
  wheels: WheelTemplate[];
  bodyBox: THREE.Box3;
  cabinBox: THREE.Box3;
  size: THREE.Vector3;
  source: 'glb' | 'placeholder';
  /** points for the physics hull (car space), sampled from the Body */
  hull?: Float32Array;
}

const WHEELS: WheelName[] = ['FL', 'FR', 'RL', 'RR'];

const baseMatName = (m: THREE.Material | undefined) => {
  const n = (m?.name || 'Paint').split('.')[0].trim();
  return n || 'Paint';
};

/** Keep position/normal/uv only, make sure everything is indexed, so geometries can be merged. */
function normalizeGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.getAttribute('position').clone());
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  out.setAttribute('normal', g.getAttribute('normal').clone());
  const uv = g.getAttribute('uv');
  const n = g.getAttribute('position').count;
  out.setAttribute('uv', uv ? uv.clone() : new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (g.index) out.setIndex(g.index.clone());
  else {
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    out.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return out;
}

function collect(node: THREE.Object3D, toSpace: THREE.Matrix4): { geos: THREE.BufferGeometry[]; mats: string[] } {
  const geos: THREE.BufferGeometry[] = [];
  const mats: string[] = [];
  const m = new THREE.Matrix4();
  node.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    m.multiplyMatrices(toSpace, mesh.matrixWorld);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const src = mesh.geometry;
    if (src.groups.length > 1 && Array.isArray(mesh.material)) {
      for (const grp of src.groups) {
        const sub = src.clone();
        sub.clearGroups();
        const idx = sub.index!;
        const arr = (idx.array as Uint32Array | Uint16Array).slice(grp.start, grp.start + grp.count);
        sub.setIndex(new THREE.BufferAttribute(new Uint32Array(arr), 1));
        sub.applyMatrix4(m);
        geos.push(normalizeGeometry(sub));
        mats.push(baseMatName(materials[grp.materialIndex ?? 0]));
      }
    } else {
      const g = src.clone();
      g.applyMatrix4(m);
      geos.push(normalizeGeometry(g));
      mats.push(baseMatName(materials[0]));
    }
  });
  return { geos, mats };
}

function mergeWithGroups(geos: THREE.BufferGeometry[], mats: string[]): { geometry: THREE.BufferGeometry; materialNames: string[] } {
  // merge sources that share a material, then merge those into one geometry with one group per material
  const byMat = new Map<string, THREE.BufferGeometry[]>();
  geos.forEach((g, i) => {
    const k = mats[i];
    if (!byMat.has(k)) byMat.set(k, []);
    byMat.get(k)!.push(g);
  });
  const merged: THREE.BufferGeometry[] = [];
  const names: string[] = [];
  for (const [k, list] of byMat) {
    merged.push(list.length === 1 ? list[0] : mergeGeometries(list, false)!);
    names.push(k);
  }
  const geometry = merged.length === 1 ? merged[0] : mergeGeometries(merged, true)!;
  if (merged.length === 1) {
    geometry.clearGroups();
    geometry.addGroup(0, geometry.index!.count, 0);
  }
  return { geometry, materialNames: names };
}

async function loadGlbTemplate(spec: CarSpec, url: string): Promise<CarTemplate> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene.getObjectByName(`Car_${spec.id}`) ?? gltf.scene;
  gltf.scene.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const parts: PartTemplate[] = [];
  const wheels: WheelTemplate[] = [];
  for (const child of root.children) {
    const name = child.name.split('.')[0];
    const wm = /^Wheel_(FL|FR|RL|RR)$/.exec(name);
    if (wm) {
      const winv = child.matrixWorld.clone().invert();
      const { geos, mats } = collect(child, winv);
      if (!geos.length) continue;
      const { geometry, materialNames } = mergeWithGroups(geos, mats);
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox!;
      const center = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(inv, child.matrixWorld));
      wheels.push({
        name: wm[1] as WheelName,
        geometry,
        materialNames,
        center,
        radius: Math.max(bb.max.y - bb.min.y, bb.max.z - bb.min.z) / 2,
        width: bb.max.x - bb.min.x,
      });
      continue;
    }
    const { geos, mats } = collect(child, inv);
    if (!geos.length) continue;
    const { geometry, materialNames } = mergeWithGroups(geos, mats);
    geometry.computeBoundingBox();
    parts.push({ name, geometry, materialNames, box: geometry.boundingBox!.clone() });
  }
  if (wheels.length !== 4) throw new Error(`${spec.id}: expected 4 wheels, found ${wheels.length}`);
  const body = parts.find((p) => p.name === 'Body');
  if (!body) throw new Error(`${spec.id}: no Body`);
  const cabin = parts.find((p) => p.name === 'Cabin');
  const size = new THREE.Vector3();
  const all = new THREE.Box3();
  for (const p of parts) all.union(p.box);
  all.getSize(size);
  wheels.sort((a, b) => WHEELS.indexOf(a.name) - WHEELS.indexOf(b.name));
  return {
    id: spec.id,
    spec,
    parts,
    wheels,
    bodyBox: body.box.clone(),
    cabinBox: (cabin ?? body).box.clone(),
    size,
    source: 'glb',
    hull: samplePoints(body.geometry, 2400),
  };
}

/** Every n-th vertex plus the extremes along each axis: enough for a convex hull. */
function samplePoints(g: THREE.BufferGeometry, max: number): Float32Array {
  const pos = g.getAttribute('position');
  const n = pos.count;
  const step = Math.max(1, Math.floor(n / max));
  const pts: number[] = [];
  const ext = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      const v = pos.getComponent(i, a);
      if (v < pos.getComponent(ext[a * 2], a)) ext[a * 2] = i;
      if (v > pos.getComponent(ext[a * 2 + 1], a)) ext[a * 2 + 1] = i;
    }
    if (i % step === 0) pts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  for (const i of ext) pts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  return new Float32Array(pts);
}

// ---------------------------------------------------------------------------------------------------
// Placeholder cars: same part names as the Blender assets, built from subdivided boxes. Used until the
// GLBs exist, and as a fallback if one fails to load.
// ---------------------------------------------------------------------------------------------------

interface Dims { L: number; W: number; H: number; wb: number; r: number; sill: number; belt: number; hoodLen: number; deckLen: number; wagon?: boolean; pickup?: boolean }
const DIMS: Record<string, Dims> = {
  hypercar: { L: 4.7, W: 2.05, H: 1.25, wb: 3.23, r: 0.39, sill: 0.22, belt: 0.8, hoodLen: 1.6, deckLen: 1.4 },
  wedge: { L: 4.4, W: 1.93, H: 1.2, wb: 2.75, r: 0.36, sill: 0.25, belt: 0.82, hoodLen: 1.6, deckLen: 1.0 },
  rally: { L: 4.64, W: 1.99, H: 1.8, wb: 3.24, r: 0.52, sill: 0.55, belt: 1.2, hoodLen: 1.3, deckLen: 0.8 },
  endurance: { L: 4.8, W: 1.97, H: 1.32, wb: 3.24, r: 0.39, sill: 0.2, belt: 0.8, hoodLen: 1.7, deckLen: 1.5 },
  streamliner: { L: 5.2, W: 1.4, H: 1.29, wb: 2.97, r: 0.35, sill: 0.25, belt: 0.75, hoodLen: 1.9, deckLen: 1.4 },
};

function box(w: number, h: number, d: number, x: number, y: number, z: number, seg = 0.12) {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w / seg)), Math.max(1, Math.round(h / seg)), Math.max(1, Math.round(d / seg)));
  g.translate(x, y, z);
  return g;
}

function plane(w: number, h: number, pos: THREE.Vector3, rotY: number, rotX = 0) {
  const g = new THREE.PlaneGeometry(w, h, 4, 3);
  g.rotateX(rotX);
  g.rotateY(rotY);
  g.translate(pos.x, pos.y, pos.z);
  return g;
}

function part(name: string, geos: THREE.BufferGeometry[], mats: string[]): PartTemplate {
  const { geometry, materialNames } = mergeWithGroups(geos.map(normalizeGeometry), mats);
  geometry.computeBoundingBox();
  return { name, geometry, materialNames, box: geometry.boundingBox!.clone() };
}

export function placeholderTemplate(spec: CarSpec): CarTemplate {
  const d = DIMS[spec.id] ?? DIMS.wedge;
  const { L, W, H, wb, r, sill, belt } = d;
  const zf = L / 2, zr = -L / 2;
  const cabinFront = zf - d.hoodLen;
  const cabinRear = d.pickup ? cabinFront - 1.3 : zr + d.deckLen;
  const cabinLen = cabinFront - cabinRear;
  const parts: PartTemplate[] = [];
  const bodyH = belt - sill;
  parts.push(part('Body', [box(W, bodyH, L - 0.2, 0, sill + bodyH / 2, 0)], ['Paint']));
  const cw = W - 0.22;
  const ch = H - belt;
  parts.push(part('Cabin', [box(cw, ch, cabinLen, 0, belt + ch / 2, (cabinFront + cabinRear) / 2)], ['Paint']));
  parts.push(part('Hood', [box(W - 0.1, 0.05, d.hoodLen - 0.1, 0, belt + 0.02, zf - d.hoodLen / 2 - 0.05)], ['Paint']));
  parts.push(part('Engine', [box(0.8, 0.3, 0.8, 0, belt - 0.2, zf - 0.9)], ['EngineBay']));
  parts.push(part('Interior', [box(cw - 0.1, 0.4, cabinLen - 0.2, 0, belt + 0.1, (cabinFront + cabinRear) / 2)], ['Interior']));
  const gz = cabinFront + 0.004;
  parts.push(part('Glass_Front', [plane(cw - 0.16, ch - 0.14, new THREE.Vector3(0, belt + ch / 2, gz), 0)], ['Glass']));
  parts.push(part('Glass_Rear', [plane(cw - 0.16, ch - 0.14, new THREE.Vector3(0, belt + ch / 2, cabinRear - 0.004), Math.PI)], ['Glass']));
  parts.push(part('Glass_L1', [plane(cabinLen * 0.8, ch - 0.14, new THREE.Vector3(cw / 2 + 0.004, belt + ch / 2, (cabinFront + cabinRear) / 2), Math.PI / 2)], ['Glass']));
  parts.push(part('Glass_R1', [plane(cabinLen * 0.8, ch - 0.14, new THREE.Vector3(-cw / 2 - 0.004, belt + ch / 2, (cabinFront + cabinRear) / 2), -Math.PI / 2)], ['Glass']));
  parts.push(part('Bumper_F', [box(W + 0.04, 0.16, 0.14, 0, sill + 0.1, zf - 0.02)], ['Chrome']));
  parts.push(part('Bumper_R', [box(W + 0.04, 0.16, 0.14, 0, sill + 0.1, zr + 0.02)], ['Chrome']));
  parts.push(part('Light_FL', [box(0.3, 0.14, 0.04, W / 2 - 0.3, belt - 0.2, zf - 0.08)], ['Headlight']));
  parts.push(part('Light_FR', [box(0.3, 0.14, 0.04, -W / 2 + 0.3, belt - 0.2, zf - 0.08)], ['Headlight']));
  parts.push(part('Light_RL', [box(0.3, 0.12, 0.04, W / 2 - 0.3, belt - 0.2, zr + 0.08)], ['Taillight']));
  parts.push(part('Light_RR', [box(0.3, 0.12, 0.04, -W / 2 + 0.3, belt - 0.2, zr + 0.08)], ['Taillight']));
  const doorZ = (cabinFront + cabinRear) / 2;
  const nL = plane(0.62, 0.42, new THREE.Vector3(W / 2 + 0.006, sill + bodyH * 0.5, doorZ), Math.PI / 2);
  const nR = plane(0.62, 0.42, new THREE.Vector3(-W / 2 - 0.006, sill + bodyH * 0.5, doorZ), -Math.PI / 2);
  const nT = plane(0.7, 0.5, new THREE.Vector3(0, H + 0.006, doorZ), Math.PI / 2, -Math.PI / 2);
  parts.push(part('Number_L', [nL], ['Number']));
  parts.push(part('Number_R', [nR], ['Number']));
  parts.push(part('Number_Roof', [nT], ['Number']));

  const tw = 0.24;
  const wheels: WheelTemplate[] = [];
  const track = W / 2 - tw / 2 - 0.04;
  for (const name of WHEELS) {
    const front = name[0] === 'F';
    const left = name[1] === 'L';
    const tire = new THREE.CylinderGeometry(r, r, tw, 24, 1);
    tire.rotateZ(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, tw + 0.01, 12, 1);
    rim.rotateZ(Math.PI / 2);
    const hub = new THREE.BoxGeometry(tw + 0.03, r * 0.9, 0.08);
    const { geometry, materialNames } = mergeWithGroups([normalizeGeometry(tire), normalizeGeometry(rim), normalizeGeometry(hub)], ['Tire', 'Rim', 'Rim']);
    wheels.push({ name, geometry, materialNames, center: new THREE.Vector3(left ? track : -track, r, front ? wb / 2 : -wb / 2), radius: r, width: tw });
  }
  const bodyBox = parts[0].box.clone();
  const cabinBox = parts[1].box.clone();
  const size = new THREE.Vector3(W, H, L);
  return { id: spec.id, spec, parts, wheels, bodyBox, cabinBox, size, source: 'placeholder' };
}

export interface ManifestEntry { id: string; name: string; file: string }

/** Load every car in CAR_SPECS: the Blender GLB if there is one, else a placeholder. */
export async function loadCarTemplates(onProgress?: (done: number, total: number) => void): Promise<Map<string, CarTemplate>> {
  const out = new Map<string, CarTemplate>();
  let manifest: ManifestEntry[] = [];
  try {
    // relative to the site's base path (the root on Vercel, /<repo>/ on GitHub Pages)
    const res = await fetch(`${import.meta.env.BASE_URL}models/cars/cars.json`, { cache: 'no-cache' });
    if (res.ok) manifest = await res.json();
  } catch {
    /* no manifest yet */
  }
  let done = 0;
  await Promise.all(
    CAR_SPECS.map(async (spec) => {
      const entry = manifest.find((m) => m.id === spec.id);
      let t: CarTemplate;
      if (entry) {
        try {
          t = await loadGlbTemplate(spec, `${import.meta.env.BASE_URL}models/cars/${entry.file}?v=${Date.now() % 1e7}`);
        } catch (e) {
          console.warn(`[cars] ${spec.id}: GLB failed, using placeholder`, e);
          t = placeholderTemplate(spec);
        }
      } else t = placeholderTemplate(spec);
      out.set(spec.id, t);
      onProgress?.(++done, CAR_SPECS.length);
    }),
  );
  return out;
}
