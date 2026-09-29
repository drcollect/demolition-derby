import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import type { CarTemplate } from './carAsset';

export interface NumberDecal {
  name: 'Number_L' | 'Number_R' | 'Number_Hood';
  geometry: THREE.BufferGeometry;
}

const cache = new WeakMap<CarTemplate, NumberDecal[]>();

/**
 * Derby numbers for cars that don't have number panels modelled: decals projected onto the doors and the
 * hood. Built once per car model (in car space) and cloned for every car of that model.
 */
export function numberDecals(t: CarTemplate, body: THREE.Mesh): NumberDecal[] {
  const cached = cache.get(t);
  if (cached) return cached;
  const out: NumberDecal[] = [];
  const probe = new THREE.Mesh(body.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  probe.updateMatrixWorld(true);
  const bb = t.bodyBox;
  const size = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  const front = t.wheels.filter((w) => w.name[0] === 'F');
  const rear = t.wheels.filter((w) => w.name[0] === 'R');
  const zf = front.reduce((a, w) => a + w.center.z, 0) / Math.max(1, front.length);
  const zr = rear.reduce((a, w) => a + w.center.z, 0) / Math.max(1, rear.length);
  const doorZ = zr + (zf - zr) * 0.52;
  const ray = new THREE.Raycaster();
  const helper = new THREE.Object3D();
  const w = Math.min(0.66, (zf - zr) * 0.24);
  const h = Math.min(0.48, size.y * 0.34);

  for (const side of [1, -1]) {
    let best: THREE.Intersection | null = null;
    for (const fy of [0.42, 0.36, 0.5, 0.3]) {
      const y = bb.min.y + size.y * fy;
      ray.set(new THREE.Vector3(side * (size.x + 1), y, doorZ), new THREE.Vector3(-side, 0, 0));
      const hit = ray.intersectObject(probe, false)[0];
      if (hit?.face && Math.abs(hit.face.normal.x) > 0.55 && Math.sign(hit.face.normal.x) === side) {
        best = hit;
        break;
      }
    }
    if (!best?.face) continue;
    const n = best.face.normal.clone();
    n.y *= 0.3; // keep the numbers upright on sloped flanks
    n.normalize();
    helper.up.set(0, 1, 0);
    helper.position.copy(best.point);
    helper.lookAt(best.point.clone().add(n));
    const g = new DecalGeometry(probe, best.point, helper.rotation.clone(), new THREE.Vector3(w, h, 0.6));
    if (g.getAttribute('position')?.count) out.push({ name: side > 0 ? 'Number_L' : 'Number_R', geometry: g });
  }

  // hood: find the first upward-facing paint surface ahead of the cabin
  for (const fz of [0.62, 0.52, 0.72]) {
    const z = center.z + size.z * 0.5 * fz;
    ray.set(new THREE.Vector3(0, bb.max.y + 1, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(probe, false)[0];
    if (!hit?.face || hit.face.normal.y < 0.6) continue;
    helper.up.set(0, 0, -1); // digits read from in front of the car
    helper.position.copy(hit.point);
    helper.lookAt(hit.point.clone().add(hit.face.normal));
    const g = new DecalGeometry(probe, hit.point, helper.rotation.clone(), new THREE.Vector3(Math.min(0.7, size.x * 0.36), Math.min(0.52, size.x * 0.27), 0.5));
    if (g.getAttribute('position')?.count) out.push({ name: 'Number_Hood', geometry: g });
    break;
  }
  cache.set(t, out);
  return out;
}
