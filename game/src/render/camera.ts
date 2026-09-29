import * as THREE from 'three';
import { clamp } from '../core/math';

export const CAMERA_MODES = ['Chase', 'Far chase', 'Hood', 'Bumper'] as const;

export interface CamTarget {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  velocity: THREE.Vector3;
  /** car-space eye points for the in-car views */
  hoodEye: THREE.Vector3;
  bumperEye: THREE.Vector3;
  length: number;
}

const _fwd = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _des = new THREE.Vector3();
const _look = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class GameCamera {
  readonly camera: THREE.PerspectiveCamera;
  mode = 0;
  private pos = new THREE.Vector3(0, 8, -20);
  private look = new THREE.Vector3();
  private heading = new THREE.Vector3(0, 0, 1);
  private shakeAmt = 0;
  private shakeT = 0;
  private baseFov = 62;
  private initialized = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.1, 1500);
  }

  cycle() {
    this.mode = (this.mode + 1) % CAMERA_MODES.length;
    this.initialized = false;
  }

  shake(amount: number) {
    this.shakeAmt = Math.min(1.2, this.shakeAmt + amount);
  }

  snap() {
    this.initialized = false;
  }

  private lift = 0;

  /** `avoid`: other cars; the chase camera lifts up and in rather than sit inside one (grids, tailgaters). */
  update(dt: number, t: CamTarget, lookBack: boolean, maxRadius: number, groundY: (x: number, z: number) => number, avoid: THREE.Vector3[] = []) {
    const cam = this.camera;
    this.shakeT += dt;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    const speed = t.velocity.length();

    if (this.mode >= 2) {
      // in-car: rigidly attached
      const eye = this.mode === 2 ? t.hoodEye : t.bumperEye;
      cam.position.copy(eye).applyQuaternion(t.quat).add(t.pos);
      _q.copy(t.quat);
      if (lookBack) _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      // three cameras look down -Z; the car's nose is +Z
      cam.quaternion.copy(_q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      cam.fov = this.baseFov + 6 + Math.min(14, speed * 0.35);
      this.applyShake(0.5);
      cam.updateProjectionMatrix();
      this.pos.copy(cam.position);
      this.initialized = true;
      return;
    }

    const far = this.mode === 1;
    const dist = (far ? 10.5 : 6.6) + t.length * 0.35;
    const height = far ? 4.4 : 2.5;
    // heading: the car's flattened forward, leaning a little into the direction of travel
    _fwd.set(0, 0, 1).applyQuaternion(t.quat);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-4) _fwd.copy(this.heading);
    _fwd.normalize();
    _vel.copy(t.velocity).setY(0);
    if (_vel.lengthSq() > 16 && _vel.dot(_fwd) > 0) _fwd.lerp(_vel.normalize(), 0.25).normalize();
    if (!this.initialized) this.heading.copy(_fwd);
    this.heading.lerp(_fwd, 1 - Math.exp(-dt * 4.5)).normalize();
    const h = _tmp.copy(this.heading);
    if (lookBack) h.negate();

    _des.copy(t.pos).addScaledVector(h, -dist);
    _des.y = t.pos.y + height;
    let lift = 0;
    for (const p of avoid) {
      const d = Math.hypot(p.x - _des.x, p.z - _des.z);
      if (d < 3.4) lift = Math.max(lift, 1 - d / 3.4);
    }
    this.lift += (lift - this.lift) * (1 - Math.exp(-dt * 4));
    _des.addScaledVector(h, this.lift * (far ? 2.5 : 1.8));
    _des.y += this.lift * (far ? 1.5 : 1.7);
    // stay inside the arena wall so we don't look at the back of the stands
    const r = Math.hypot(_des.x, _des.z);
    if (r > maxRadius) {
      const k = maxRadius / r;
      _des.x *= k;
      _des.z *= k;
      _des.y += (r - maxRadius) * 0.5;
    }
    _des.y = Math.max(_des.y, groundY(_des.x, _des.z) + 0.8);
    _look.copy(t.pos).addScaledVector(h, far ? 3 : 2.2);
    _look.y += far ? 0.6 : 0.9;

    if (!this.initialized) {
      this.pos.copy(_des);
      this.look.copy(_look);
      this.initialized = true;
    }
    const k = lookBack ? 1 : 1 - Math.exp(-dt * (far ? 4 : 6));
    this.pos.lerp(_des, k);
    this.look.lerp(_look, 1 - Math.exp(-dt * 12));
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
    cam.fov = this.baseFov + clamp(speed * 0.4, 0, 14);
    this.applyShake(1);
    cam.updateProjectionMatrix();
  }

  /** Slow orbit for menus, results and spectating. */
  orbit(dt: number, center: THREE.Vector3, radius: number, height: number, speed = 0.12, maxRadius = Infinity) {
    this.shakeT += dt;
    const a = this.shakeT * speed;
    this.camera.position.set(center.x + Math.cos(a) * radius, center.y + height, center.z + Math.sin(a) * radius);
    // stay inside the arena: pull in toward the middle and lift up instead of flying into the stands
    const r = Math.hypot(this.camera.position.x, this.camera.position.z);
    if (r > maxRadius) {
      const k = maxRadius / r;
      this.camera.position.x *= k;
      this.camera.position.z *= k;
      this.camera.position.y += (r - maxRadius) * 0.6;
    }
    this.camera.lookAt(center);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.initialized = false;
  }

  private applyShake(scale: number) {
    if (this.shakeAmt <= 0) return;
    const s = this.shakeAmt * this.shakeAmt * 0.18 * scale;
    const t = this.shakeT * 38;
    this.camera.position.x += Math.sin(t * 1.3) * s;
    this.camera.position.y += Math.sin(t * 1.7 + 1) * s;
    this.camera.position.z += Math.sin(t * 1.1 + 2) * s;
    this.camera.rotateZ(Math.sin(t * 0.9) * s * 0.08);
  }

  setAspect(a: number) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}
