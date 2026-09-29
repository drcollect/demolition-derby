import * as THREE from 'three';
import { RAPIER, GROUPS_ARENA, type ColliderTag } from '../physics/world';
import { makeConcrete, makeDirt } from '../render/textures';
import { smoothstep } from '../core/math';

export interface BowlOptions {
  floorRadius: number; // flat dirt out to here
  wallRadius: number; // inner face of the wall
  bankHeight: number; // height of the bank where it meets the wall
  wallHeight: number; // wall above the bank top
  wallThickness: number;
  fenceTop: number; // physics catch-fence height (y)
}

export const DEFAULT_BOWL: BowlOptions = {
  floorRadius: 30,
  wallRadius: 36,
  bankHeight: 1.4,
  wallHeight: 1.3,
  wallThickness: 0.6,
  fenceTop: 7,
};

/**
 * The Bowl: a round dirt arena with a banked rim and a concrete wall, modelled on the derby arena of the
 * 1995 PlayStation game. Visuals and colliders come from the same profile, so what you see is what you hit.
 */
export class Bowl {
  readonly opts: BowlOptions;
  readonly group = new THREE.Group();
  readonly colliders: RAPIER.Collider[] = [];
  readonly tags = new Map<number, ColliderTag>();

  constructor(world: RAPIER.World, opts: Partial<BowlOptions> = {}) {
    this.opts = { ...DEFAULT_BOWL, ...opts };
    this.group.name = 'Bowl';
    this.buildGround();
    this.buildWall();
    this.buildPhysics(world);
  }

  /** Height of the arena surface at radius r (floor then bank). */
  heightAtRadius(r: number): number {
    const { floorRadius: f, wallRadius: w, bankHeight: h } = this.opts;
    if (r <= f) return 0;
    const t = Math.min(1, (r - f) / (w - f));
    // concave bank: gentle at the bottom, ~28 degrees where it meets the wall
    return h * (0.25 * t * t + 0.75 * t * t * t);
  }

  heightAt(x: number, z: number) {
    return this.heightAtRadius(Math.hypot(x, z));
  }

  /** Start positions around the floor, facing the middle, like a derby line-up. */
  spawnPoints(n: number, radius = 23): { position: THREE.Vector3; yaw: number }[] {
    const out: { position: THREE.Vector3; yaw: number }[] = [];
    const offset = Math.PI / 2; // player (index 0) starts at the south side, facing north
    for (let i = 0; i < n; i++) {
      const a = offset + (i / n) * Math.PI * 2;
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      out.push({ position: new THREE.Vector3(x, 0, z), yaw: Math.atan2(-x, -z) });
    }
    return out;
  }

  private buildGround() {
    const { floorRadius, wallRadius } = this.opts;
    const radii: number[] = [];
    for (let r = 0; r < floorRadius; r += r < 4 ? 1 : 1.5) radii.push(r);
    for (let r = floorRadius; r <= wallRadius + 1e-6; r += 0.4) radii.push(Math.min(r, wallRadius));
    if (radii[radii.length - 1] < wallRadius) radii.push(wallRadius);
    const seg = 160;
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    const tile = 7;
    // macro variation: a few low-frequency waves, darker rubbered ring near the wall, lighter centre
    const macro = (x: number, z: number, r: number) => {
      const w1 = Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.13 - 0.4);
      const w2 = Math.sin((x + z) * 0.05 + 2.1) * 0.6;
      const w3 = Math.sin(x * 0.31 - z * 0.27) * 0.25;
      let v = 0.9 + 0.08 * w1 + 0.06 * w2 + 0.04 * w3;
      v *= 1 - 0.18 * smoothstep(floorRadius - 8, floorRadius + 1, r); // tyre-rubbered racing groove near the rim
      v *= 1 + 0.08 * (1 - smoothstep(0, 14, r));
      return v;
    };
    for (let i = 0; i < radii.length; i++) {
      const r = radii[i];
      const y = this.heightAtRadius(r);
      const ringN = r === 0 ? 1 : seg + 1;
      for (let j = 0; j < ringN; j++) {
        const a = (j / seg) * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        pos.push(x, y, z);
        // planar UVs on the floor; on the bank stretch along the slope a bit so texels stay square-ish
        uv.push(x / tile, z / tile);
        const m = macro(x, z, r);
        col.push(m, m * 0.98, m * 0.95);
      }
    }
    // index: centre fan then rings
    let base = 1;
    for (let j = 0; j < seg; j++) idx.push(0, base + j + 1, base + j);
    for (let i = 1; i < radii.length - 1; i++) {
      const a0 = 1 + (i - 1) * (seg + 1);
      const b0 = 1 + i * (seg + 1);
      for (let j = 0; j < seg; j++) {
        const a = a0 + j, b = a0 + j + 1, c = b0 + j, d = b0 + j + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const dirt = makeDirt();
    const mat = new THREE.MeshStandardMaterial({
      map: dirt.map,
      roughnessMap: dirt.roughness,
      bumpMap: dirt.bump,
      bumpScale: 1.6,
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.6,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'Ground';
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildWall() {
    const { wallRadius: R, bankHeight: h, wallHeight, wallThickness: t } = this.opts;
    const top = h + wallHeight;
    const seg = 180;
    const concrete = makeConcrete();
    concrete.repeat.set(1, 1);
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const circ = 2 * Math.PI * R;
    // profile around the wall: inner foot (slightly below bank top so no gap), inner top, outer top, outer foot
    const prof: [number, number, number][] = [
      [R, h - 0.3, 0],
      [R, top - 0.12, wallHeight + 0.18],
      [R + 0.12, top, wallHeight + 0.35],
      [R + t, top, wallHeight + 0.35 + t],
      [R + t, -0.5, wallHeight + 0.35 + t + top + 0.5],
    ];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      for (const [r, y, v] of prof) {
        pos.push(c * r, y, s * r);
        uv.push((a / (Math.PI * 2)) * circ / 4, v / 4);
      }
    }
    const P = prof.length;
    for (let j = 0; j < seg; j++) {
      for (let k = 0; k < P - 1; k++) {
        const a = j * P + k, b = a + 1, c = (j + 1) * P + k, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.92, metalness: 0, color: 0xd8d4cc });
    const wall = new THREE.Mesh(geo, mat);
    wall.name = 'Wall';
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.group.add(wall);

    // hazard band along the top of the inner face
    const band = document.createElement('canvas');
    band.width = 256;
    band.height = 32;
    const g = band.getContext('2d')!;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#f4f1ea' : '#c8201e';
      g.fillRect(i * 32, 0, 32, 32);
    }
    const bandTex = new THREE.CanvasTexture(band);
    bandTex.colorSpace = THREE.SRGBColorSpace;
    bandTex.wrapS = THREE.RepeatWrapping;
    bandTex.repeat.set(circ / 8, 1);
    const bandGeo = new THREE.CylinderGeometry(R - 0.01, R - 0.01, 0.18, seg, 1, true);
    const bandMat = new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.7, side: THREE.BackSide });
    const bandMesh = new THREE.Mesh(bandGeo, bandMat);
    bandMesh.position.y = top - 0.24;
    bandMesh.receiveShadow = true;
    this.group.add(bandMesh);
  }

  private buildPhysics(world: RAPIER.World) {
    const { floorRadius, wallRadius: R, fenceTop } = this.opts;
    const addTagged = (desc: RAPIER.ColliderDesc, tag: ColliderTag) => {
      desc.setCollisionGroups(GROUPS_ARENA);
      const c = world.createCollider(desc);
      this.colliders.push(c);
      this.tags.set(c.handle, tag);
      return c;
    };

    // Floor: one big flat slab (no triangle seams to catch on)
    addTagged(RAPIER.ColliderDesc.cuboid(R + 6, 1, R + 6).setTranslation(0, -1, 0).setFriction(0.7).setRestitution(0.05), {
      kind: 'arena',
      part: 'floor',
    });

    // Bank: lathe trimesh
    {
      const seg = 128;
      const rings: number[] = [];
      for (let r = floorRadius - 0.5; r <= R + 0.6; r += 0.35) rings.push(r);
      const verts: number[] = [];
      const idx: number[] = [];
      for (let j = 0; j < seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        for (const r of rings) verts.push(Math.cos(a) * r, this.heightAtRadius(r), Math.sin(a) * r);
      }
      const n = rings.length;
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg;
        for (let k = 0; k < n - 1; k++) {
          const a = j * n + k, b = a + 1, c = j2 * n + k, d = c + 1;
          // wind so normals point up/inward
          idx.push(a, c, b, b, c, d);
        }
      }
      addTagged(
        RAPIER.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(idx), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
          .setFriction(0.7)
          .setRestitution(0.05),
        { kind: 'arena', part: 'bank' },
      );
    }

    // Wall + invisible catch fence: inner cylinder face, normals toward the arena
    {
      const seg = 144;
      const verts: number[] = [];
      const idx: number[] = [];
      const ys = [-0.5, 1, 2.5, 4, fenceTop];
      for (let j = 0; j < seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        for (const y of ys) verts.push(Math.cos(a) * R, y, Math.sin(a) * R);
      }
      const n = ys.length;
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg;
        for (let k = 0; k < n - 1; k++) {
          const a = j * n + k, b = a + 1, c = j2 * n + k, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
      addTagged(
        RAPIER.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(idx), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
          .setFriction(0.25)
          .setRestitution(0.2),
        { kind: 'arena', part: 'wall' },
      );
      // a thick backstop ring of boxes just outside, in case anything squeezes through the thin trimesh
      const boxes = 72;
      for (let i = 0; i < boxes; i++) {
        const a = (i / boxes) * Math.PI * 2;
        const half = (Math.PI * 2 * (R + 1.5)) / boxes / 2 + 0.2;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2);
        addTagged(
          RAPIER.ColliderDesc.cuboid(half, fenceTop / 2 + 0.5, 1.2)
            .setTranslation(Math.cos(a) * (R + 1.25), fenceTop / 2, Math.sin(a) * (R + 1.25))
            .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
            .setFriction(0.25)
            .setRestitution(0.2),
          { kind: 'arena', part: 'wall' },
        );
      }
    }
  }
}
