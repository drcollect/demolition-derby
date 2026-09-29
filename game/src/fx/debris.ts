import * as THREE from 'three';
import { RAPIER, GROUPS_DEBRIS } from '../physics/world';

interface Piece {
  id: number;
  mesh: THREE.Object3D;
  body: RAPIER.RigidBody;
  age: number;
  fading: number; // >0 while shrinking away
  prevPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  curPos: THREE.Vector3;
  curQuat: THREE.Quaternion;
}

/**
 * Loose car parts (bumpers, hoods, wheels) as light physics bodies that cars can shove around.
 * Old pieces shrink away once there are too many.
 */
export class DebrisManager {
  readonly group = new THREE.Group();
  private pieces: Piece[] = [];
  private nextId = 1;
  constructor(private world: RAPIER.World, private maxPieces = 36) {}

  /**
   * Turn a part into debris. `obj` must already be detached from its car; its geometry is re-centred so
   * the body's origin sits at the part's centre. Position/orientation are world space.
   */
  spawn(obj: THREE.Mesh, worldPos: THREE.Vector3, worldQuat: THREE.Quaternion, vel: THREE.Vector3, angVel: THREE.Vector3, mass: number, shape: 'box' | 'wheel' = 'box') {
    const geo = obj.geometry;
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const size = new THREE.Vector3();
    bb.getSize(size);
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(worldPos.x, worldPos.y, worldPos.z)
      .setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w })
      .setLinvel(vel.x, vel.y, vel.z)
      .setAngvel({ x: angVel.x, y: angVel.y, z: angVel.z })
      .setLinearDamping(0.15)
      .setAngularDamping(0.4)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(desc);
    let col: RAPIER.ColliderDesc;
    if (shape === 'wheel') {
      const r = Math.max(size.y, size.z) / 2;
      col = RAPIER.ColliderDesc.cylinder(Math.max(0.05, size.x / 2), r).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 });
    } else {
      col = RAPIER.ColliderDesc.cuboid(Math.max(0.03, size.x / 2), Math.max(0.03, size.y / 2), Math.max(0.03, size.z / 2));
    }
    const c = new THREE.Vector3();
    bb.getCenter(c);
    col.setTranslation(c.x, c.y, c.z).setCollisionGroups(GROUPS_DEBRIS).setFriction(0.8).setRestitution(0.25).setMass(mass);
    this.world.createCollider(col, body);
    obj.position.copy(worldPos);
    obj.quaternion.copy(worldQuat);
    obj.castShadow = true;
    this.group.add(obj);
    this.pieces.push({
      id: this.nextId++,
      mesh: obj,
      body,
      age: 0,
      fading: 0,
      prevPos: worldPos.clone(),
      prevQuat: worldQuat.clone(),
      curPos: worldPos.clone(),
      curQuat: worldQuat.clone(),
    });
    // too many? start shrinking the oldest
    const live = this.pieces.filter((p) => p.fading === 0);
    if (live.length > this.maxPieces) live[0].fading = 0.0001;
  }

  /** after each physics step */
  postStep() {
    for (const p of this.pieces) {
      p.prevPos.copy(p.curPos);
      p.prevQuat.copy(p.curQuat);
      const t = p.body.translation();
      const r = p.body.rotation();
      p.curPos.set(t.x, t.y, t.z);
      p.curQuat.set(r.x, r.y, r.z, r.w);
    }
  }

  update(dt: number, alpha: number) {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.age += dt;
      p.mesh.position.lerpVectors(p.prevPos, p.curPos, alpha);
      p.mesh.quaternion.slerpQuaternions(p.prevQuat, p.curQuat, alpha);
      if (p.curPos.y < -20) p.fading = Math.max(p.fading, 0.0001);
      if (p.fading > 0) {
        p.fading += dt;
        const s = Math.max(0.001, 1 - p.fading / 1.5);
        p.mesh.scale.setScalar(s);
        if (p.fading >= 1.5) {
          this.remove(i);
        }
      }
    }
  }

  private remove(i: number) {
    const p = this.pieces[i];
    this.world.removeRigidBody(p.body);
    this.group.remove(p.mesh);
    p.mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.pieces.splice(i, 1);
  }

  clear() {
    for (let i = this.pieces.length - 1; i >= 0; i--) this.remove(i);
  }

  get count() {
    return this.pieces.length;
  }
}
