import * as THREE from 'three';
import type { DriverInput } from '../core/input';
import { clamp, rng, wrapAngle } from '../core/math';
import type { Car } from '../car/car';

export interface Personality {
  name: string;
  /** how eager to attack, 0..1 */
  aggression: number;
  /** how much it protects its own nose (turns side-on, backs into cars), 0..1 */
  caution: number;
  /** likes backing into people, 0..1 */
  reverseRam: number;
  /** steering precision and prediction, 0..1 */
  skill: number;
  /** bias toward picking on the player, 0..1 */
  focusPlayer: number;
}

export const AI_DRIVERS: Personality[] = [
  { name: 'Big Earl', aggression: 0.8, caution: 0.5, reverseRam: 0.6, skill: 0.7, focusPlayer: 0.4 },
  { name: 'Dusty Rhodes', aggression: 0.6, caution: 0.7, reverseRam: 0.8, skill: 0.6, focusPlayer: 0.2 },
  { name: 'Mad Molly', aggression: 1.0, caution: 0.15, reverseRam: 0.2, skill: 0.75, focusPlayer: 0.6 },
  { name: 'Junkyard Jim', aggression: 0.7, caution: 0.6, reverseRam: 0.9, skill: 0.55, focusPlayer: 0.3 },
  { name: 'Skeeter', aggression: 0.5, caution: 0.8, reverseRam: 0.4, skill: 0.8, focusPlayer: 0.2 },
  { name: 'Wreckin\' Rita', aggression: 0.9, caution: 0.35, reverseRam: 0.5, skill: 0.85, focusPlayer: 0.5 },
  { name: 'Hoss', aggression: 0.75, caution: 0.45, reverseRam: 0.7, skill: 0.5, focusPlayer: 0.35 },
  { name: 'Lugnut', aggression: 0.65, caution: 0.55, reverseRam: 0.3, skill: 0.65, focusPlayer: 0.25 },
  { name: 'Tex Tucker', aggression: 0.85, caution: 0.4, reverseRam: 0.6, skill: 0.7, focusPlayer: 0.45 },
  { name: 'Duchess', aggression: 0.55, caution: 0.9, reverseRam: 0.95, skill: 0.75, focusPlayer: 0.2 },
  { name: 'Crusher Kowalski', aggression: 0.95, caution: 0.3, reverseRam: 0.4, skill: 0.6, focusPlayer: 0.55 },
];

export interface Difficulty {
  name: 'Rookie' | 'Amateur' | 'Pro';
  skill: number; // multiplies personality skill
  aggression: number;
  throttle: number; // max throttle
  toughness: number; // AI damage taken multiplier
}

export const DIFFICULTIES: Difficulty[] = [
  { name: 'Rookie', skill: 0.6, aggression: 0.7, throttle: 0.82, toughness: 1.2 },
  { name: 'Amateur', skill: 0.85, aggression: 0.9, throttle: 0.92, toughness: 1.0 },
  { name: 'Pro', skill: 1.0, aggression: 1.05, throttle: 1.0, toughness: 0.9 },
];

type Mode = 'attack' | 'reverse' | 'evade' | 'unstuck' | 'brakecheck' | 'wander' | 'backoff';

export interface ArenaInfo {
  floorRadius: number;
  wallRadius: number;
}

const _inv = new THREE.Quaternion();
const _l = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _tf = new THREE.Vector3();
const _ts = new THREE.Vector3();
const _to = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export class AIDriver {
  target: Car | null = null;
  /** Total Destruction: ignore everyone else */
  forcedTarget: Car | null = null;
  mode: Mode = 'attack';
  private modeT = 0;
  private retarget = 0;
  private stuck = 0;
  private steerS = 0;
  private rand: () => number;
  private evadeDir = 1;
  private wobble = 0;
  private unstuckForward = false;
  private pushing = 0;
  private backoffSteer = 0;

  constructor(readonly p: Personality, readonly diff: Difficulty, seed: number) {
    this.rand = rng(seed);
  }

  private setMode(m: Mode, t: number) {
    this.mode = m;
    this.modeT = t;
  }

  update(dt: number, me: Car, cars: Car[], arena: ArenaInfo, targetedBy: (c: Car) => number, now: number): DriverInput {
    const out: DriverInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false };
    if (me.wrecked) return out;
    const skill = clamp(this.p.skill * this.diff.skill, 0.2, 1);
    const aggression = clamp(this.p.aggression * this.diff.aggression, 0, 1.2);
    const speed = me.vehicle.speed;
    this.modeT -= dt;
    this.retarget -= dt;
    this.wobble += dt;

    // ---------------- target selection ----------------
    if (this.forcedTarget && !this.forcedTarget.wrecked) this.target = this.forcedTarget;
    else if (!this.target || this.target.wrecked || this.retarget <= 0) {
      this.target = this.pickTarget(me, cars, targetedBy, now);
      this.retarget = 1.2 + this.rand() * 2.2;
    }

    _inv.copy(me.curQuat).invert();
    const toLocal = (p: THREE.Vector3, out: THREE.Vector3) => out.copy(p).sub(me.curPos).applyQuaternion(_inv);

    // ---------------- stuck detection ----------------
    const wantMove = this.mode === 'attack' || this.mode === 'reverse' || this.mode === 'wander' || this.mode === 'backoff';
    if (wantMove && Math.abs(speed) < 1.0) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt * 2);
    if (this.stuck > 1.4 && this.mode !== 'unstuck') {
      this.setMode('unstuck', 1.1 + this.rand() * 0.6);
      this.evadeDir = this.rand() < 0.5 ? -1 : 1;
      this.stuck = 0;
      // if we were backing up, get out forward
      this.unstuckForward = me.vehicle.reversing;
    }

    // ---------------- threats: head-on attackers, tailgaters ----------------
    if (this.mode === 'attack' || this.mode === 'wander') {
      for (const c of cars) {
        if (c === me || c.wrecked) continue;
        _to.copy(me.curPos).sub(c.curPos);
        const d = _to.length();
        if (d > 14 || d < 0.1) continue;
        _to.divideScalar(d);
        const closing = c.velocity.dot(_to) - me.velocity.dot(_to);
        const loc = toLocal(c.curPos, _l);
        const ang = Math.atan2(loc.x, loc.z);
        // coming at our nose fast: turn side-on (the manual's rule 5)
        if (closing > 8 && Math.abs(ang) < 0.7 && d < 11 && this.rand() < this.p.caution * 0.35 * dt * 60 * 0.1) {
          this.setMode('evade', 0.55 + this.rand() * 0.3);
          this.evadeDir = ang > 0 ? -1 : 1;
          break;
        }
        // tailgater: stamp on the brakes (rule 1)
        if (c !== this.target && Math.abs(ang) > 2.6 && d < 7 && closing > 3.5 && this.rand() < this.p.caution * 0.04) {
          this.setMode('brakecheck', 0.45);
          break;
        }
      }
    }

    // shoving contest: back off at an angle and come again with speed (derby drivers don't just push)
    if (this.mode === 'attack' && this.target) {
      const t = this.target;
      const loc = toLocal(t.curPos, _l);
      const touching = t.curPos.distanceTo(me.curPos) < me.bodyHalf.z + t.bodyHalf.z + 1.2;
      if (touching && loc.z > 0 && Math.abs(speed) < 2.5) this.pushing += dt;
      else this.pushing = Math.max(0, this.pushing - dt * 2);
      if (this.pushing > 0.45 + (1 - aggression) * 0.4) {
        this.pushing = 0;
        this.setMode('backoff', 1.3 + this.rand() * 1.1);
        this.backoffSteer = (this.rand() < 0.5 ? -1 : 1) * (0.35 + this.rand() * 0.5);
      }
    }

    if (this.modeT <= 0 && this.mode !== 'attack') this.mode = this.target ? 'attack' : 'wander';
    if (!this.target && this.mode === 'attack') this.mode = 'wander';

    // ---------------- act ----------------
    switch (this.mode) {
      case 'unstuck': {
        if (this.unstuckForward) {
          out.throttle = 1;
          out.steer = this.evadeDir;
        } else {
          out.brake = 1;
          out.steer = this.evadeDir;
        }
        break;
      }
      case 'evade': {
        out.throttle = 1;
        out.steer = this.evadeDir;
        break;
      }
      case 'brakecheck': {
        out.brake = 1;
        break;
      }
      case 'backoff': {
        out.brake = 1; // reverse gear once stopped
        out.steer = this.backoffSteer;
        break;
      }
      case 'wander': {
        // idle laps of the floor
        const a = Math.atan2(me.curPos.z, me.curPos.x) + 0.6;
        _aim.set(Math.cos(a) * arena.floorRadius * 0.55, 0, Math.sin(a) * arena.floorRadius * 0.55);
        const loc = toLocal(_aim, _l);
        out.steer = clamp(Math.atan2(loc.x, loc.z) * 1.8, -1, 1);
        out.throttle = 0.55;
        break;
      }
      case 'attack':
      case 'reverse': {
        const t = this.target!;
        const d = t.curPos.distanceTo(me.curPos);
        // lead the target
        const closing = Math.max(4, me.velocity.length() + 2);
        const lead = clamp(d / closing, 0, 1.3) * (0.4 + 0.6 * skill);
        _aim.copy(t.curPos).addScaledVector(t.velocity, lead);
        // aim for a rear quarter to spin it (rule 2), more so for aggressive, skilled drivers
        t.forward(_tf);
        _ts.set(1, 0, 0).applyQuaternion(t.curQuat);
        _to.copy(me.curPos).sub(t.curPos);
        const sideSign = Math.sign(_to.dot(_ts)) || 1;
        const quarter = clamp(aggression * skill, 0, 1);
        const behindT = _to.dot(_tf) < 0;
        _aim.addScaledVector(_tf, -t.bodyHalf.z * (behindT ? 0.8 : 0.55) * quarter);
        _aim.addScaledVector(_ts, sideSign * t.bodyHalf.x * 0.6 * quarter);
        // keep off the bank unless the target is up there
        const tr = Math.hypot(t.curPos.x, t.curPos.z);
        if (tr < arena.floorRadius) {
          const ar = Math.hypot(_aim.x, _aim.z);
          if (ar > arena.floorRadius) _aim.multiplyScalar(arena.floorRadius / ar);
        }
        const loc = toLocal(_aim, _l);
        const ang = Math.atan2(loc.x, loc.z);

        // decide forward vs backing in
        if (this.mode === 'attack' && Math.abs(ang) > 2.1 && d < 15 && d > 3 && this.rand() < this.p.reverseRam * 0.05 + (me.zones.front > me.zones.rear + 0.2 ? 0.05 : 0)) {
          this.setMode('reverse', 2.2 + this.rand() * 1.5);
        }
        if (this.mode === 'reverse') {
          if (Math.abs(ang) < 1.2) {
            this.mode = 'attack';
          } else {
            const back = Math.atan2(-loc.x, -loc.z);
            out.brake = 1; // reverse gear
            out.steer = clamp(-back * 2.0, -1, 1);
            break;
          }
        }
        // forward attack
        const noise = (1 - skill) * Math.sin(this.wobble * 2.3) * 0.25;
        out.steer = clamp(ang * (1.6 + skill) + noise, -1, 1);
        const absA = Math.abs(ang);
        out.throttle = absA < 0.45 ? 1 : absA < 1.2 ? 0.8 : 0.5;
        if (absA > 1.5 && speed > 9 && skill > 0.6) out.handbrake = this.rand() < 0.5;
        if (absA > 2.2 && speed < 4) {
          // target right behind us and we're slow: three-point turn via reverse
          out.throttle = 0;
          out.brake = 1;
          out.steer = -Math.sign(ang);
        }
        // lining up for a big hit: floor it
        if (absA < 0.25 && d < 25) out.throttle = 1;
        break;
      }
    }

    // wall avoidance: don't drive head-first into the concrete for nothing
    const r = Math.hypot(me.curPos.x, me.curPos.z);
    if (r > arena.wallRadius - 7 && this.mode !== 'unstuck' && this.mode !== 'reverse' && this.mode !== 'backoff') {
      me.forward(_fwd);
      const out_ = (_fwd.x * me.curPos.x + _fwd.z * me.curPos.z) / Math.max(1, r);
      const targetAtWall = this.target && Math.hypot(this.target.curPos.x, this.target.curPos.z) > arena.wallRadius - 8 && this.target.curPos.distanceTo(me.curPos) < 12;
      if (out_ > 0.5 && !targetAtWall) {
        const loc = toLocal(_aim.set(0, 0, 0), _l);
        const ang = Math.atan2(loc.x, loc.z);
        out.steer = clamp(ang * 2, -1, 1);
        out.throttle = Math.min(out.throttle, 0.7);
      }
    }

    out.throttle *= this.diff.throttle;
    // smooth the steering a little, less for skilled drivers
    const rate = 4 + skill * 8;
    this.steerS += clamp(out.steer - this.steerS, -rate * dt, rate * dt);
    out.steer = this.steerS;
    return out;
  }

  private pickTarget(me: Car, cars: Car[], targetedBy: (c: Car) => number, now: number): Car | null {
    let best: Car | null = null;
    let bestScore = Infinity;
    me.forward(_fwd);
    for (const c of cars) {
      if (c === me || c.wrecked) continue;
      _to.copy(c.curPos).sub(me.curPos);
      const d = _to.length();
      const ang = Math.abs(wrapAngle(Math.atan2(_to.x, _to.z) - Math.atan2(_fwd.x, _fwd.z)));
      // prefer a target with room for a run-up: a 14 m charge hits much harder than a nudge
      let s = Math.abs(d - 14) * 0.8 + ang * 4.5;
      if (c.isPlayer) s -= this.p.focusPlayer * 14;
      if (me.lastHitBy && me.lastHitBy.car === c.index && now - me.lastHitBy.time < 6) s -= 10; // revenge
      if (c.health < 0.3) s -= 6; // finish off the weak
      s += targetedBy(c) * 5; // spread out a bit
      s += this.rand() * 6;
      if (s < bestScore) {
        bestScore = s;
        best = c;
      }
    }
    return best;
  }
}
