import * as THREE from 'three';
import type { DriverInput } from '../core/input';
import { clamp, rng } from '../core/math';
import type { Car } from '../car/car';
import type { Figure8Track } from '../arena/figure8/track';
import type { RaceController, RaceState } from '../game/race';
import type { Difficulty, Personality } from './driver';
import { GRAVITY } from '../physics/world';

const _inv = new THREE.Quaternion();
const _l = new THREE.Vector3();
const _aim = new THREE.Vector3();

/**
 * Figure 8 racing AI: follows the track with a speed-dependent lookahead, brakes for the loops, picks a
 * side to pass slower cars, and at the X either lifts to let crossing traffic through (careful drivers)
 * or keeps its foot in and T-bones it (aggressive ones).
 */
export class RaceDriver {
  private lane: number;
  private laneTarget: number;
  private rand: () => number;
  private steerS = 0;
  private yieldT = 0;
  private reverseT = 0;

  constructor(readonly p: Personality, readonly diff: Difficulty, seed: number) {
    this.rand = rng(seed);
    this.lane = (this.rand() - 0.5) * 3;
    this.laneTarget = this.lane;
  }

  update(dt: number, me: Car, st: RaceState, track: Figure8Track, race: RaceController, now: number): DriverInput {
    const out: DriverInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false };
    if (me.wrecked) return out;
    const coolDown = st.finished; // past the flag: an easy lap, out of everyone's way
    const skill = clamp(this.p.skill * this.diff.skill, 0.2, 1);
    const aggression = clamp(this.p.aggression * this.diff.aggression, 0, 1.2);
    const v = Math.max(0, me.vehicle.speed);

    // ---- traffic ahead on the same stretch: pick a side to pass (wrecks and stopped cars from further out) ----
    let blocker: RaceState | null = null;
    let parkedAhead = Infinity;
    for (const o of race.states) {
      if (o === st || o.towed) continue;
      const ahead = track.ahead(st.s, o.s);
      const parked = o.car.wrecked || Math.abs(o.car.vehicle.speed) < 2;
      const inLine = Math.abs(o.lateral - st.lateral) < (parked ? 3.2 : 2.6);
      if (ahead > 0.5 && ahead < (parked ? 28 : 14) && inLine && (parked || o.car.vehicle.speed < v + 1.5)) {
        if (!blocker || track.ahead(st.s, blocker.s) > ahead) blocker = o;
        if (parked) parkedAhead = Math.min(parkedAhead, ahead);
      }
    }
    if (blocker) {
      const side = blocker.lateral > 0 ? -1 : 1;
      this.laneTarget = clamp(blocker.lateral + side * 3.4, -4.3, 4.3);
    } else if (this.rand() < dt * 0.3) {
      this.laneTarget = (this.rand() - 0.5) * 3;
    }
    const laneRate = parkedAhead < 28 ? 4 : 2.5;
    this.lane += clamp(this.laneTarget - this.lane, -laneRate * dt, laneRate * dt);

    // ---- steering: pure pursuit on a point ahead on the track ----
    const look = 6 + v * (0.45 + 0.2 * skill);
    const smp = track.sampleAt(st.s + look);
    // on the loops, hug the inside a little (but keep the wheels on the dirt)
    let lane = this.lane;
    if (smp.straight === 0) lane -= smp.out * 1.2 * smp.bank;
    lane = clamp(lane, -4.3, 4.3);
    _aim.copy(smp.p).addScaledVector(smp.n, lane);
    _inv.copy(me.curQuat).invert();
    _l.copy(_aim).sub(me.curPos).applyQuaternion(_inv);
    const ang = Math.atan2(_l.x, _l.z);
    // the arc through the aim point → the wheel angle for it → the stick position for that angle
    // (the car's lock shrinks with speed)
    const dist = Math.max(4, Math.hypot(_l.x, _l.z));
    const wheelAngle = Math.atan((2 * Math.sin(ang) * me.vehicle.wheelbase) / dist);
    const lock = me.spec.steerMax / (1 + v / me.spec.steerFade);
    let steer = clamp((wheelAngle / lock) * (1.15 + 0.25 * skill), -1, 1);
    if (Math.abs(ang) > 1.2) steer = Math.sign(ang); // facing well away from the line: full lock

    // ---- speed: slow down for the loops ahead ----
    const mu = me.spec.grip * (1.02 + 0.08 * skill);
    let vTarget = me.spec.topSpeed;
    const brakeDecel = 7.5;
    // there are no brakes in the air: with a jump before the loop, the braking has to be done by the ramp
    let toRamp = Infinity;
    for (const j of track.jumps) toRamp = Math.min(toRamp, track.ahead(st.s, j.s0));
    for (let d = 4; d < 50; d += 3) {
      const k = track.sampleAt(st.s + d);
      if (k.kappa <= 0) continue;
      const bankBoost = 1 + 0.25 * k.bank;
      const vMax = Math.sqrt((mu * -GRAVITY * bankBoost) / k.kappa) * (0.86 + 0.08 * skill);
      // how fast can we be now and still get down to vMax by then?
      const room = toRamp < d ? toRamp - 1 : d - 4;
      const vHere = Math.sqrt(vMax * vMax + 2 * brakeDecel * Math.max(0, room));
      vTarget = Math.min(vTarget, vHere);
    }

    if (coolDown) vTarget = Math.min(vTarget, 11);
    // something stopped right in our path: slow right down until we're round it
    if (parkedAhead < 12) vTarget = Math.min(vTarget, 4 + parkedAhead * 0.8);

    // ---- the crossing: yield or go for the T-bone ----
    this.yieldT = Math.max(0, this.yieldT - dt);
    const myCross = track.crossingS.map((cs) => track.ahead(st.s, cs)).filter((d) => d < 45);
    if (myCross.length) {
      const dMe = Math.min(...myCross);
      const etaMe = dMe / Math.max(v, 4);
      for (const o of race.states) {
        if (o === st || o.car.wrecked) continue;
        const dO = Math.min(...track.crossingS.map((cs) => track.ahead(o.s, cs)));
        const onOther = track.samples[o.idx].straight !== 0 && track.samples[o.idx].straight !== track.samples[st.idx].straight;
        if (!onOther || dO > 40) continue;
        const etaO = dO / Math.max(o.car.vehicle.speed, 4);
        if (Math.abs(etaMe - etaO) < 0.7 && etaMe < 2.5) {
          const careful = coolDown || (this.p.caution > aggression * 0.9 && this.rand() < 0.9);
          if (careful) this.yieldT = 0.6;
          else vTarget = me.spec.topSpeed; // T-bone time
        }
      }
    }

    // ---- pedals ----
    const throttleCap = this.diff.throttle;
    if (this.yieldT > 0) {
      out.throttle = 0;
      out.brake = v > 6 ? 0.6 : 0;
    } else if (v < vTarget - 0.5) {
      out.throttle = throttleCap;
    } else if (v > vTarget + 2) {
      out.brake = clamp((v - vTarget) / 6, 0.2, 1);
    } else {
      out.throttle = 0.35 * throttleCap;
    }
    // sharp correction needed (after a spin): back up and turn
    if (Math.abs(ang) > 1.9 && v < 3) {
      this.reverseT = 1.1;
    }
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      out.throttle = 0;
      out.brake = 1;
      steer = -Math.sign(ang);
    }
    const rate = 5 + skill * 7;
    this.steerS += clamp(steer - this.steerS, -rate * dt, rate * dt);
    out.steer = this.steerS;
    void now;
    return out;
  }
}
