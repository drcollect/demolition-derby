import * as THREE from 'three';
import { RAPIER, GROUPS_CAR } from '../physics/world';
import { emptyInput, type DriverInput } from '../core/input';
import { clamp, hash3, rng } from '../core/math';
import type { CarTemplate } from './carAsset';
import type { CarSpec } from './specs';
import { Vehicle, defaultMods, type WheelDef } from './vehicle';
import { Deformable, dent, scuff, zoneWeights, ZONES, type Zone } from './damage';
import { makeGlow, makeHeadlight, makeHelmet, makeNumberMaterial, makePaint, makeTaillight, sharedMaterials, type Livery, type PaintUniforms } from './materials';
import { makeCrack } from '../render/textures';
import { numberDecals } from './decals';
import type { Effects } from '../fx/particles';
import type { Skidmarks } from '../fx/skidmarks';
import type { DebrisManager } from '../fx/debris';

export interface SoundHooks {
  impact(pos: THREE.Vector3, strength: number, kind: 'car' | 'wall' | 'ground' | 'debris'): void;
  glass(pos: THREE.Vector3, strength: number): void;
  partOff(pos: THREE.Vector3): void;
  wreck(pos: THREE.Vector3): void;
}

export interface CarHost {
  world: RAPIER.World;
  fx: Effects;
  skids: Skidmarks;
  debris: DebrisManager;
  sound: SoundHooks | null;
  groundHeight(x: number, z: number): number;
  now(): number;
}

export interface CarOptions {
  index: number;
  template: CarTemplate;
  color: string;
  accent: string;
  stripe: Livery['stripe'];
  stripeColor: string;
  number: number;
  helmet: string;
  isPlayer: boolean;
  driverName: string;
  wear: number;
  toughnessMul: number; // difficulty: AI toughness scaling
}

export interface ImpactInfo {
  pointWorld: THREE.Vector3;
  dirWorld: THREE.Vector3; // into this car
  impulse: number; // N·s
  /** velocity change to use for damage (m/s); defaults to impulse / mass */
  dv?: number;
  otherCar: Car | null;
  kind: 'car' | 'wall' | 'ground' | 'debris';
}

/**
 * A hit in car space. Everything the damage model does follows from these numbers (random choices are
 * seeded from the car and sequence number), so a network host can send them and every client
 * reproduces the same dents, broken glass and loose parts.
 */
export interface LocalImpact {
  seq: number;
  p: [number, number, number]; // car-space contact point
  d: [number, number, number]; // car-space direction into the car
  dv: number; // velocity change, m/s
  other: number; // other car's index, or -1
  kind: 'car' | 'wall' | 'ground' | 'debris';
  time: number;
}

interface GlassPane {
  name: string;
  mesh: THREE.Mesh;
  box: THREE.Box3;
  dmg: number;
  state: 0 | 1 | 2; // ok, cracked, gone
  overlay: THREE.Mesh | null;
}

interface LightUnit {
  name: string;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  front: boolean;
  broken: boolean;
  center: THREE.Vector3;
}

export interface SpinTrack {
  attacker: number;
  accum: number;
  t: number;
  calm: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

const DEFORM: Record<string, [number, number]> = {
  // maxDeform (m), stiffness (dent multiplier)
  Body: [0.5, 1],
  Cabin: [0.36, 0.85],
  Hood: [0.42, 1.1],
  Bumper_F: [0.34, 0.8],
  Bumper_R: [0.34, 0.8],
  Interior: [0.25, 0.6],
  Engine: [0.2, 0.4],
};

export class Car {
  readonly index: number;
  readonly spec: CarSpec;
  readonly template: CarTemplate;
  readonly isPlayer: boolean;
  readonly name: string;
  readonly number: number;
  readonly color: THREE.Color;
  readonly root = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly colliders: RAPIER.Collider[] = [];
  readonly vehicle: Vehicle;
  readonly deformables: Deformable[] = [];
  readonly parts = new Map<string, THREE.Mesh>();
  readonly wheelPivots: THREE.Group[] = [];
  readonly wheelMeshes: THREE.Mesh[] = [];
  readonly bodyCenter = new THREE.Vector3();
  readonly bodyHalf = new THREE.Vector3();
  readonly paint: PaintUniforms;
  input: DriverInput = emptyInput();

  // damage state
  zones: Record<Zone, number> = { front: 0, rear: 0, left: 0, right: 0 };
  wheelDmg = [0, 0, 0, 0];
  hoodDmg = 0;
  bumperDmg = { F: 0, R: 0 };
  hoodOff = false;
  bumperOff = { F: false, R: false };
  bumperHang = { F: 0, R: 0 };
  glass: GlassPane[] = [];
  lights: LightUnit[] = [];
  /** parts that tear off (Loose_* in the model, plus Hood/Bumper_* on the older layout) */
  loose: { name: string; mesh: THREE.Mesh; center: THREE.Vector3; radius: number; health: number; mass: number }[] = [];
  glows: THREE.MeshStandardMaterial[] = [];
  wrecked = false;
  wreckTime = 0;
  burning = 0; // 0..1
  hitFlash: Record<Zone, number> = { front: 0, rear: 0, left: 0, right: 0 };

  // scoring
  points = 0;
  wrecksScored = 0;
  spinsScored = 0;
  lastHitBy: { car: number; time: number } | null = null;
  spin: SpinTrack | null = null;
  finishPlace = 0;

  // misc
  stuckTime = 0;
  flipTime = 0;
  resetCooldown = 0;
  private prevPos = new THREE.Vector3();
  private prevQuat = new THREE.Quaternion();
  readonly curPos = new THREE.Vector3();
  readonly curQuat = new THREE.Quaternion();
  readonly velocity = new THREE.Vector3();
  /** velocities after our own tyre impulses, before the physics step (used to measure closing speeds) */
  readonly preVel = new THREE.Vector3();
  readonly preAng = new THREE.Vector3();
  readonly preCom = new THREE.Vector3();
  private host: CarHost;
  private emitAcc = { steam: 0, smoke: 0, fire: 0, dust: 0 };
  private toughnessMul: number;
  readonly mass: number;
  private impactSeq = 0;
  private r: () => number = Math.random;
  /** Subscribe to every impact this car takes (the future network host sends these). */
  onImpact: ((e: LocalImpact) => void) | null = null;

  constructor(host: CarHost, opts: CarOptions, spawn: { position: THREE.Vector3; yaw: number }) {
    this.host = host;
    this.index = opts.index;
    this.template = opts.template;
    this.spec = opts.template.spec;
    this.isPlayer = opts.isPlayer;
    this.name = opts.driverName;
    this.number = opts.number;
    this.color = new THREE.Color(opts.color);
    this.toughnessMul = opts.toughnessMul;
    this.root.name = `Car_${opts.index}_${this.spec.id}`;

    // ---------------- visuals ----------------
    const shared = sharedMaterials();
    const tb = this.template.bodyBox;
    const paint = makePaint(
      {
        color: opts.color,
        stripe: opts.stripe,
        stripeColor: opts.stripeColor,
        metallic: this.template.spec.metallic,
        stripeWidth: Math.min(0.2, (tb.max.x - tb.min.x) * 0.075),
        sideStripeY: tb.min.y + (tb.max.y - tb.min.y) * 0.42,
      },
      opts.wear,
    );
    this.paint = paint.u;
    const numberMat = makeNumberMaterial(opts.number);
    const helmet = makeHelmet(opts.helmet);
    const glow = makeGlow(opts.accent);
    this.glows.push(glow);
    const matFor = (name: string, partName: string): THREE.Material => {
      switch (name) {
        case 'Paint':
          return paint.mat;
        case 'Number':
          return numberMat;
        case 'Helmet':
          return helmet;
        case 'Glow':
          return glow;
        case 'Headlight':
          return makeHeadlight();
        case 'Taillight':
          return makeTaillight();
        default:
          return (shared as unknown as Record<string, THREE.Material>)[name] ?? paint.mat;
      }
    };
    for (const pt of this.template.parts) {
      const geo = pt.geometry.clone();
      const mats = pt.materialNames.map((n) => matFor(n, pt.name));
      const mesh = new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats);
      mesh.name = pt.name;
      const isGlass = pt.name.startsWith('Glass_');
      mesh.castShadow = !isGlass && !pt.name.startsWith('Number') && pt.name !== 'Interior' && pt.name !== 'Engine';
      mesh.receiveShadow = !isGlass;
      if (isGlass) mesh.renderOrder = 2;
      this.root.add(mesh);
      this.parts.set(pt.name, mesh);
      const [maxD, stiff] = DEFORM[pt.name] ?? (isGlass ? [0.3, 0.9] : pt.name.startsWith('Light_') ? [0.3, 0.9] : [0.45, 1]);
      const d = new Deformable(mesh, maxD, stiff, pt.geometry);
      this.deformables.push(d);
      if (isGlass) {
        planarUV(geo);
        this.glass.push({ name: pt.name, mesh, box: pt.box.clone(), dmg: 0, state: 0, overlay: null });
      }
      if (pt.name.startsWith('Light_')) {
        const m = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).find(
          (mm) => mm.name === 'Headlight' || mm.name === 'Taillight',
        ) as THREE.MeshStandardMaterial | undefined;
        if (m) {
          const c = new THREE.Vector3();
          pt.box.getCenter(c);
          this.lights.push({ name: pt.name, mesh, mat: m, front: pt.name.startsWith('Light_F'), broken: false, center: c });
        }
      }
    }
    for (const [name, mesh] of this.parts) {
      if (!/^(Loose_|Hood$|Bumper_)/.test(name)) continue;
      const pt = this.template.parts.find((p) => p.name === name)!;
      const c = new THREE.Vector3(), sz = new THREE.Vector3();
      pt.box.getCenter(c);
      pt.box.getSize(sz);
      const mass = Math.max(6, Math.min(40, sz.x * sz.y * sz.z * 180 + sz.length() * 6));
      this.loose.push({ name, mesh, center: c, radius: sz.length() / 2, health: name === 'Hood' ? 1.4 : 1, mass });
    }
    // spray-painted door and roof numbers, projected onto the body
    const body = this.parts.get('Body');
    if (body && !this.parts.has('Number_L')) {
      for (const d of numberDecals(this.template, body)) {
        const mesh = new THREE.Mesh(d.geometry.clone(), numberMat);
        mesh.name = d.name;
        mesh.receiveShadow = true;
        mesh.renderOrder = 1;
        this.root.add(mesh);
        this.parts.set(d.name, mesh);
        this.deformables.push(new Deformable(mesh, 0.5, 1, d.geometry));
      }
    }
    const bb = this.template.bodyBox.clone();
    bb.getCenter(this.bodyCenter);
    bb.getSize(this.bodyHalf).multiplyScalar(0.5);
    // include bumpers in the length
    for (const n of ['Bumper_F', 'Bumper_R']) {
      const p = this.template.parts.find((x) => x.name === n);
      if (p) {
        const u = bb.clone().union(p.box);
        u.getCenter(this.bodyCenter);
        const s = new THREE.Vector3();
        u.getSize(s);
        this.bodyHalf.z = Math.max(this.bodyHalf.z, s.z / 2);
        bb.copy(u);
      }
    }

    const wheelDefs: WheelDef[] = [];
    for (const wt of this.template.wheels) {
      const pivot = new THREE.Group();
      pivot.position.copy(wt.center);
      pivot.rotation.order = 'YXZ';
      const mats = wt.materialNames.map((n) => matFor(n, 'Wheel'));
      const mesh = new THREE.Mesh(wt.geometry, mats.length === 1 ? mats[0] : mats);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.rotation.order = 'XYZ';
      pivot.add(mesh);
      this.root.add(pivot);
      this.wheelPivots.push(pivot);
      this.wheelMeshes.push(mesh);
      wheelDefs.push({
        name: wt.name,
        mount: wt.center.clone(),
        radius: wt.radius,
        width: wt.width,
        front: wt.name[0] === 'F',
        left: wt.name[1] === 'L',
      });
    }

    // ---------------- physics ----------------
    const spec = this.spec;
    const q = new THREE.Quaternion().setFromAxisAngle(_up, spawn.yaw);
    const rideY = 0.03;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.position.x, spawn.position.y + rideY, spawn.position.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.02)
      .setAngularDamping(0.35)
      .setCcdEnabled(true)
      .setCanSleep(false);
    const W = this.bodyHalf.x * 2, L = this.bodyHalf.z * 2, H = this.template.size.y;
    const m = spec.mass;
    // boxy inertia, beefed up in roll/pitch so cars don't flip at every nudge
    const Ix = (m / 12) * (H * H + L * L) * 1.25;
    const Iy = (m / 12) * (W * W + L * L) * 0.9;
    const Iz = (m / 12) * (W * W + H * H) * 1.6;
    desc.setAdditionalMassProperties(m, { x: 0, y: spec.comHeight, z: spec.comForward }, { x: Ix, y: Iy, z: Iz }, { x: 0, y: 0, z: 0, w: 1 });
    this.body = host.world.createRigidBody(desc);
    this.mass = m;

    const wr = Math.min(...this.template.wheels.map((w) => w.radius));
    const floorY = Math.max(bb.min.y, wr * 0.75);
    const zs = this.template.wheels.map((w) => w.center.z);
    const shapeDesc = this.template.hull
      ? RAPIER.ColliderDesc.roundConvexHull(liftHull(this.template.hull, floorY, Math.max(...zs), Math.min(...zs)), 0.04)
      : null;
    const events = RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS;
    if (shapeDesc) {
      shapeDesc.setDensity(0).setFriction(0.32).setRestitution(0.12).setCollisionGroups(GROUPS_CAR).setActiveEvents(events).setContactForceEventThreshold(m * 0.6 * 120);
      this.colliders.push(host.world.createCollider(shapeDesc, this.body));
    } else {
      const top = bb.max.y;
      const hy = Math.max(0.12, (top - floorY) / 2);
      const rr = 0.09;
      const main = RAPIER.ColliderDesc.roundCuboid(this.bodyHalf.x - rr, hy - rr, this.bodyHalf.z - rr, rr)
        .setTranslation(this.bodyCenter.x, floorY + hy, this.bodyCenter.z)
        .setDensity(0)
        .setFriction(0.32)
        .setRestitution(0.12)
        .setCollisionGroups(GROUPS_CAR)
        .setActiveEvents(events)
        .setContactForceEventThreshold(m * 0.6 * 120);
      this.colliders.push(host.world.createCollider(main, this.body));
    }
    this.vehicle = new Vehicle(host.world, this.body, spec, wheelDefs);
    this.snapTransforms();
  }

  private snapTransforms() {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.curPos.set(t.x, t.y, t.z);
    this.curQuat.set(r.x, r.y, r.z, r.w);
    this.prevPos.copy(this.curPos);
    this.prevQuat.copy(this.curQuat);
    this.root.position.copy(this.curPos);
    this.root.quaternion.copy(this.curQuat);
  }

  get alive() {
    return !this.wrecked;
  }

  get position() {
    return this.curPos;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(0, 0, 1).applyQuaternion(this.curQuat);
  }

  /** Overall damage 0..1 for the HUD/AI. */
  get health() {
    const z = this.zones;
    return clamp(1 - Math.max(z.front, (z.front + z.rear + z.left + z.right) / 3.2), 0, 1);
  }

  // ------------------------------------------------------------------------------------------------
  // physics step
  // ------------------------------------------------------------------------------------------------
  fixedUpdate(dt: number) {
    const mods = defaultMods();
    const z = this.zones;
    // front: radiator then engine. rear: drivetrain. sides: alignment.
    const overheat = clamp((z.front - 0.55) / 0.45, 0, 1);
    mods.powerMul *= 1 - 0.55 * overheat;
    mods.powerMul *= 1 - 0.65 * Math.pow(z.rear, 1.6);
    mods.topSpeedMul = 1 - 0.3 * Math.max(z.front, z.rear);
    mods.steerMul = 1 - 0.3 * Math.max(z.left, z.right, this.wheelDmg[0], this.wheelDmg[1]);
    mods.steerPull = (z.left - z.right) * 0.06 + (this.wheelDmg[0] - this.wheelDmg[1]) * 0.05;
    mods.engineDead = this.wrecked;
    this.vehicle.mods = mods;
    for (let i = 0; i < 4; i++) {
      const w = this.vehicle.wheels[i];
      if (w) w.gripMul = 1 - 0.35 * this.wheelDmg[i];
    }
    const input = this.wrecked ? { throttle: 0, brake: 0.4, steer: 0, handbrake: true, horn: false } : this.input;
    this.vehicle.step(dt, input);
    const lv0 = this.body.linvel(), av0 = this.body.angvel(), c0 = this.body.worldCom();
    this.preVel.set(lv0.x, lv0.y, lv0.z);
    this.preAng.set(av0.x, av0.y, av0.z);
    this.preCom.set(c0.x, c0.y, c0.z);

    // spin tracking for scoring (the match reads `spin` when it closes)
    if (this.spin) {
      const av = this.body.angvel();
      const yawRate = av.y;
      const s = this.spin;
      s.t += dt;
      if (Math.abs(yawRate) > 0.9) {
        s.accum += yawRate * dt;
        s.calm = 0;
      } else s.calm += dt;
    }

    // stuck on its side / roof
    const lv = this.body.linvel();
    const speed = Math.hypot(lv.x, lv.y, lv.z);
    if (this.vehicle.upDot < 0.35 && speed < 2.5) this.flipTime += dt;
    else this.flipTime = Math.max(0, this.flipTime - dt * 2);
    if (this.resetCooldown > 0) this.resetCooldown -= dt;
    if (this.flipTime > (this.wrecked ? 1e9 : 2.8)) this.resetUpright();
  }

  postStep() {
    this.prevPos.copy(this.curPos);
    this.prevQuat.copy(this.curQuat);
    const t = this.body.translation();
    const r = this.body.rotation();
    this.curPos.set(t.x, t.y, t.z);
    this.curQuat.set(r.x, r.y, r.z, r.w);
    const v = this.body.linvel();
    this.velocity.set(v.x, v.y, v.z);
  }

  /** Move the car somewhere else, upright and at rest (race respawns). */
  teleport(position: THREE.Vector3, yaw: number) {
    const q = new THREE.Quaternion().setFromAxisAngle(_up, yaw);
    this.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.flipTime = 0;
    this.spin = null;
    this.snapTransforms();
    for (let i = 0; i < 10; i++) this.host.fx.dust(_p.set(position.x, position.y, position.z), _v2.set(0, 0, 0), 1.3);
  }

  resetUpright() {
    if (this.resetCooldown > 0) return false;
    const t = this.body.translation();
    const f = this.forward(_v);
    f.y = 0;
    const yaw = f.lengthSq() > 1e-4 ? Math.atan2(f.x, f.z) : 0;
    const q = new THREE.Quaternion().setFromAxisAngle(_up, yaw);
    const gy = this.host.groundHeight(t.x, t.z);
    this.body.setTranslation({ x: t.x, y: gy + 0.9, z: t.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.flipTime = 0;
    this.resetCooldown = 4;
    for (let i = 0; i < 12; i++) this.host.fx.dust(_p.set(t.x, gy + 0.3, t.z), _v2.set(0, 0, 0), 1.5);
    return true;
  }

  // ------------------------------------------------------------------------------------------------
  // damage
  // ------------------------------------------------------------------------------------------------

  /** Grinding along a wall or another car: scrape the paint around a world point. */
  scuffWorld(p: THREE.Vector3, amount: number) {
    _qi.copy(this.curQuat).invert();
    const pl = _v.copy(p).sub(this.curPos).applyQuaternion(_qi);
    scuff(this.deformables, pl, 0.45, amount);
  }

  /** Velocity of a world point on this car just before the last physics step. */
  preVelocityAt(p: THREE.Vector3, out: THREE.Vector3) {
    const rx = p.x - this.preCom.x, ry = p.y - this.preCom.y, rz = p.z - this.preCom.z;
    const w = this.preAng;
    return out.set(this.preVel.x + w.y * rz - w.z * ry, this.preVel.y + w.z * rx - w.x * rz, this.preVel.z + w.x * ry - w.y * rx);
  }

  /** Returns the zone damage dealt (0..~1) so the match can score and the audio can pick a level. */
  applyImpact(ev: ImpactInfo): number {
    const dv = ev.dv ?? ev.impulse / this.mass;
    // car-space point and direction from the current physics pose
    _qi.copy(this.curQuat).invert();
    const pl = _p.copy(ev.pointWorld).sub(this.curPos).applyQuaternion(_qi);
    const dl = _d.copy(ev.dirWorld).applyQuaternion(_qi).normalize();
    const li: LocalImpact = {
      seq: this.impactSeq++,
      p: [pl.x, pl.y, pl.z],
      d: [dl.x, dl.y, dl.z],
      dv,
      other: ev.otherCar ? ev.otherCar.index : -1,
      kind: ev.kind,
      time: this.host.now(),
    };
    this.onImpact?.(li);
    return this.applyLocalImpact(li);
  }

  /** Apply a car-space impact (deterministic: same impacts in the same order give the same car). */
  applyLocalImpact(li: LocalImpact): number {
    const dv = li.dv;
    const pl = _p.set(li.p[0], li.p[1], li.p[2]);
    const dl = _d.set(li.d[0], li.d[1], li.d[2]);
    _q.copy(this.curQuat);
    this.r = rng((this.index + 1) * 7919 + li.seq * 104729);
    const now = li.time;
    if (li.other >= 0 && dv > 1.2) this.lastHitBy = { car: li.other, time: now };

    if (dv < 1.0) {
      if (dv > 0.5) scuff(this.deformables, pl, 0.4, 0.05);
      return 0;
    }
    // --- dents ---
    const depth = Math.min(0.3, 0.02 + (dv - 1.0) * 0.021);
    const radius = 0.42 + Math.min(0.55, dv * 0.045);
    dent(this.deformables, pl, dl, depth, radius, this.bodyCenter);

    // --- zones ---
    // zone damage: a solid hit (dv 8, ~30 km/h change of speed) takes ~30% off a zone; shoves add up
    const base = Math.pow(Math.max(0, dv - 1.5), 1.25) * 0.028 * this.toughnessMul;
    const w = zoneWeights(pl, this.bodyCenter, this.bodyHalf);
    const tough = this.spec.toughness;
    let dealt = 0;
    for (const zn of ZONES) {
      const mul = zn === 'front' ? tough.front : zn === 'rear' ? tough.rear : tough.side;
      const add = base * w[zn] * mul;
      if (add > 0.002) this.hitFlash[zn] = 1;
      this.zones[zn] = Math.min(1, this.zones[zn] + add);
      dealt += add;
    }

    // --- wheels ---
    for (let i = 0; i < 4; i++) {
      const wd = this.vehicle.wheels[i];
      if (!wd || !wd.attached) continue;
      const dx = pl.x - wd.def.mount.x, dz = pl.z - wd.def.mount.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.0) {
        this.wheelDmg[i] = Math.min(1, this.wheelDmg[i] + base * (1 - dist) * 1.6);
        if (this.wheelDmg[i] >= 1) this.detachWheel(i);
      }
    }

    // --- parts that tear off: wings, splitters, mirrors, skid plates (and hoods/bumpers) ---
    for (const lp of this.loose) {
      if (!lp.mesh.visible) continue;
      const dist = Math.max(0, lp.center.distanceTo(pl) - lp.radius);
      if (dist > radius + 0.4) continue;
      const near = 1 - dist / (radius + 0.4);
      lp.health -= base * 3.2 * near + (dv > 7 ? 0.25 * near : 0);
      if (lp.health <= 0 && base > 0.02) {
        const out = _v2.copy(lp.center).sub(this.bodyCenter).setY(0).normalize().multiplyScalar(3);
        this.detachPart(lp.name, lp.mass, new THREE.Vector3(out.x, 3 + this.r() * 3, out.z));
      }
    }

    // --- lights ---
    for (const l of this.lights) {
      if (l.broken) continue;
      if (l.center.distanceTo(pl) < 0.75 && base > 0.015) {
        l.broken = true;
        l.mat.emissiveIntensity = 0;
        l.mat.color.setHex(0x222222);
        this.host.fx.glass(_v.copy(l.center).applyQuaternion(_q).add(this.curPos), this.velocity, 10);
      }
    }

    // --- glass ---
    for (const g of this.glass) {
      if (g.state === 2) continue;
      const dist = g.box.distanceToPoint(pl);
      const reach = radius * 1.3;
      let add = base * 0.35; // body flex
      if (dist < reach) add += base * 2.6 * (1 - dist / reach);
      if (dv > 6 && dist < reach * 0.6) add += 0.5;
      g.dmg += add;
      if (g.dmg >= 0.95) this.shatter(g);
      else if (g.dmg >= 0.35 && g.state === 0) this.crack(g, pl);
    }

    // --- wrecked? ---
    const z = this.zones;
    if (!this.wrecked && (z.front >= 1 || z.front + z.rear + z.left + z.right >= 3.2)) {
      this.wrecked = true;
      this.wreckTime = now;
      for (const g of this.glows) g.emissiveIntensity = 0.15;
      for (const l of this.lights) l.mat.emissiveIntensity = 0;
      this.host.sound?.wreck(this.curPos);
    }
    return dealt;
  }

  private worldOf(local: THREE.Vector3, out: THREE.Vector3) {
    return out.copy(local).applyQuaternion(this.curQuat).add(this.curPos);
  }

  private detachPart(name: string, mass: number, kickLocal: THREE.Vector3) {
    const mesh = this.parts.get(name);
    if (!mesh || !mesh.visible) return;
    mesh.visible = false;
    if (name === 'Hood') this.hoodOff = true;
    if (name === 'Bumper_F') this.bumperOff.F = true;
    if (name === 'Bumper_R') this.bumperOff.R = true;
    const geo = mesh.geometry.clone();
    // bake any hang rotation (mesh.matrix is identity unless the bumper was left hanging)
    geo.applyMatrix4(mesh.matrix);
    geo.computeBoundingBox();
    const c = new THREE.Vector3();
    geo.boundingBox!.getCenter(c);
    geo.translate(-c.x, -c.y, -c.z);
    geo.deleteAttribute('dmg');
    const piece = new THREE.Mesh(geo, mesh.material);
    const wp = this.worldOf(c, new THREE.Vector3());
    const r = this.r;
    const vel = this.velocity.clone().add(kickLocal.clone().applyQuaternion(this.curQuat)).add(new THREE.Vector3((r() - 0.5) * 3, r() * 2, (r() - 0.5) * 3));
    const ang = new THREE.Vector3((r() - 0.5) * 12, (r() - 0.5) * 8, (r() - 0.5) * 12);
    this.host.debris.spawn(piece, wp, this.curQuat.clone(), vel, ang, mass);
    this.host.sound?.partOff(wp);
    this.host.fx.sparks(wp, _v.set(0, 1, 0), 18, 6);
    // the part no longer takes dents
    const i = this.deformables.findIndex((d) => d.mesh === mesh);
    if (i >= 0) this.deformables.splice(i, 1);
  }

  private hangBumper(side: 'F' | 'R', hitX: number) {
    const mesh = this.parts.get(`Bumper_${side}`);
    if (!mesh) return;
    // hinge at the end away from the hit; droop the hit end
    const bb = mesh.geometry.boundingBox ?? (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox!);
    const hingeX = hitX > 0 ? bb.min.x : bb.max.x;
    const pivot = new THREE.Vector3(hingeX, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2);
    const ang = (hitX > 0 ? -1 : 1) * (0.18 + this.r() * 0.12);
    // rotate about the car's Z axis through the pivot: position/rotation on the mesh itself
    const m = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(new THREE.Matrix4().makeRotationZ(ang))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(m);
    this.bumperHang[side] = ang;
  }

  private detachWheel(i: number) {
    const w = this.vehicle.wheels[i];
    if (!w.attached) return;
    w.attached = false;
    const pivot = this.wheelPivots[i];
    const mesh = this.wheelMeshes[i];
    pivot.visible = false;
    const geo = mesh.geometry.clone();
    const piece = new THREE.Mesh(geo, mesh.material);
    pivot.updateMatrixWorld(true);
    const wp = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
    const wq = new THREE.Quaternion().setFromRotationMatrix(mesh.matrixWorld);
    const side = new THREE.Vector3(w.def.left ? 1 : -1, 0, 0).applyQuaternion(this.curQuat);
    const vel = this.velocity.clone().addScaledVector(side, 3).add(new THREE.Vector3(0, 2.5, 0));
    this.host.debris.spawn(piece, wp, wq, vel, new THREE.Vector3(this.r() * 6, 0, this.r() * 6).applyQuaternion(this.curQuat), 22, 'wheel');
    this.host.sound?.partOff(wp);
    this.host.fx.sparks(wp, _v.set(0, 1, 0), 24, 7);
  }

  private crack(g: GlassPane, hitLocal: THREE.Vector3) {
    if (g.overlay) return;
    if (g.state === 0) g.state = 1;
    const tex = makeCrack(Math.floor(hash3(hitLocal.x, hitLocal.y, hitLocal.z) * 1e6) ^ (this.index * 7919));
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      color: 0xe6f0f2,
    });
    const overlay = new THREE.Mesh(g.mesh.geometry, mat);
    overlay.renderOrder = 3;
    g.mesh.add(overlay);
    g.overlay = overlay;
    this.host.sound?.glass(this.worldOf(g.box.getCenter(_v2), _v), 0.3);
  }

  private shatter(g: GlassPane) {
    g.state = 2;
    // Most of these cars have nothing modelled behind the glass, so a smashed pane stays as crazed,
    // milky safety glass instead of leaving a hole.
    g.mesh.material = crazedGlass();
    if (g.overlay) (g.overlay.material as THREE.MeshBasicMaterial).opacity = 1;
    else this.crack(g, g.box.getCenter(new THREE.Vector3()));
    const c = this.worldOf(g.box.getCenter(_v2), new THREE.Vector3());
    const size = new THREE.Vector3();
    g.box.getSize(size);
    const n = Math.round(20 + (size.x + size.y + size.z) * 22);
    this.host.fx.glass(c, this.velocity, n);
    this.host.sound?.glass(c, 1);
  }

  // ------------------------------------------------------------------------------------------------
  // per-frame visuals
  // ------------------------------------------------------------------------------------------------
  render(alpha: number, dt: number) {
    this.root.position.lerpVectors(this.prevPos, this.curPos, alpha);
    this.root.quaternion.slerpQuaternions(this.prevQuat, this.curQuat, alpha);
    for (const d of this.deformables) d.flush();
    for (const zn of ZONES) this.hitFlash[zn] = Math.max(0, this.hitFlash[zn] - dt * 2.5);

    // wheels
    const veh = this.vehicle;
    for (let i = 0; i < this.wheelPivots.length; i++) {
      const w = veh.wheels[i];
      const pivot = this.wheelPivots[i];
      if (!w.attached) continue;
      veh.wheelLocalCenter(i, pivot.position);
      pivot.rotation.y = w.steer;
      const dmg = this.wheelDmg[i];
      const wob = dmg > 0.35 ? Math.sin(w.spin) * dmg * 0.08 : 0;
      pivot.rotation.z = (w.def.left ? 1 : -1) * dmg * 0.12 + wob;
      this.wheelMeshes[i].rotation.x = w.spin;
    }

    // brake lights
    const braking = veh.brakeOut > 0.1 || (veh.reversing && veh.throttleOut > 0.1);
    for (const l of this.lights) {
      if (l.broken || l.front) continue;
      l.mat.emissiveIntensity = braking ? 3.2 : 0.9;
    }

    // mud builds up slowly
    this.paint.uDirt.value = Math.min(0.85, this.paint.uDirt.value + dt * 0.004 * Math.min(1, Math.abs(veh.speed) / 10));
    this.emitEffects(dt);
  }

  private emitEffects(dt: number) {
    const fx = this.host.fx;
    const veh = this.vehicle;
    const z = this.zones;
    const acc = this.emitAcc;
    // engine bay point (front of the body, near the top)
    const engineLocal = _v2.set(this.bodyCenter.x, this.template.bodyBox.max.y - 0.05, this.bodyCenter.z + this.bodyHalf.z * 0.62);
    const ep = this.worldOf(engineLocal, _p);
    if (z.front > 0.45 && !this.wrecked) {
      acc.steam += dt * (4 + z.front * 14);
      while (acc.steam > 1) {
        acc.steam--;
        fx.steam(ep, this.velocity);
      }
    }
    if (z.front > 0.7 || this.wrecked) {
      acc.smoke += dt * (this.wrecked ? 10 : 3 + (z.front - 0.7) * 20);
      while (acc.smoke > 1) {
        acc.smoke--;
        fx.smoke(ep, this.velocity, this.wrecked ? 0.95 : 0.6, this.wrecked ? 1.5 : 1);
      }
    }
    if (this.wrecked) {
      const since = this.host.now() - this.wreckTime;
      this.burning = Math.min(1, since / 2) * Math.max(0.35, 1 - since / 40);
      acc.fire += dt * 26 * this.burning;
      while (acc.fire > 1) {
        acc.fire--;
        fx.fire(ep, this.velocity, 1 + this.burning);
      }
      this.paint.uHeat.value = Math.min(0.85, this.paint.uHeat.value + dt * 0.05);
    }
    // wheels: dust, skid marks
    for (const w of veh.wheels) {
      if (!w.attached || !w.grounded || w.groundIsCar) {
        this.host.skids.add(`${this.index}${w.def.name}`, w.contact, w.normal, _v, 0.2, 0);
        continue;
      }
      const speed = Math.abs(veh.speed);
      const dustRate = (speed > 6 ? (speed - 6) * 0.25 : 0) + w.skid * 16;
      acc.dust += dt * dustRate * 0.5;
      if (acc.dust > 1) {
        acc.dust--;
        fx.dust(w.contact, this.velocity, 0.8 + w.skid);
      }
      const side = _v.set(1, 0, 0).applyQuaternion(this.curQuat);
      this.host.skids.add(`${this.index}${w.def.name}`, w.contact, w.normal, side, w.def.width * 0.9, w.skid);
    }
  }

  dispose() {
    this.host.world.removeRigidBody(this.body);
    const shared = new Set<THREE.Material>(Object.values(sharedMaterials()));
    const mats = new Set<THREE.Material>();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry && !this.template.wheels.some((w) => w.geometry === m.geometry)) m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (!shared.has(mat)) mats.add(mat);
    });
    for (const mat of mats) {
      const mm = mat as THREE.MeshStandardMaterial;
      // per-car canvas textures (door numbers, glass cracks); the shared grunge/wood textures stay
      if (mm.map && (mm.name === 'Number' || mm.map instanceof THREE.CanvasTexture) && mm.name !== 'Wood') mm.map.dispose();
      mat.dispose();
    }
  }
}

/** Project a glass pane's vertices onto its two longest axes → 0..1 UVs (for the crack texture). */
function planarUV(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const s = new THREE.Vector3();
  bb.getSize(s);
  const axes = [0, 1, 2].sort((a, b) => s.getComponent(b) - s.getComponent(a));
  const [a, b] = axes;
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const pa = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    uv[i * 2] = (pa[a] - bb.min.getComponent(a)) / Math.max(1e-4, s.getComponent(a));
    uv[i * 2 + 1] = (pa[b] - bb.min.getComponent(b)) / Math.max(1e-4, s.getComponent(b));
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * Hull points with the underside lifted to `floorY` (the body rides on its wheels, not its splitter), and
 * the overhangs chamfered up like a sled ahead of the front axle and behind the rear one, so long noses
 * climb the banked rim and ride over debris instead of digging in.
 */
function liftHull(points: Float32Array, floorY: number, zFront: number, zRear: number): Float32Array {
  const out = new Float32Array(points);
  const slope = 0.55; // ~29 degrees approach/departure angle
  for (let i = 0; i < out.length; i += 3) {
    const z = out[i + 2];
    const minY = floorY + Math.max(0, z - zFront) * slope + Math.max(0, zRear - z) * slope;
    if (out[i + 1] < minY) out[i + 1] = minY;
  }
  return out;
}

let crazed: THREE.MeshPhysicalMaterial | null = null;
function crazedGlass() {
  return (crazed ??= new THREE.MeshPhysicalMaterial({
    color: 0x59656b,
    roughness: 0.55,
    metalness: 0,
    transparent: true,
    opacity: 0.9,
    envMapIntensity: 0.5,
    side: THREE.DoubleSide,
    name: 'GlassCrazed',
  }));
}
