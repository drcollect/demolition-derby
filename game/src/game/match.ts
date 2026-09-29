import * as THREE from 'three';
import { RAPIER, createWorld, PHYS_DT } from '../physics/world';
import { Bowl } from '../arena/bowl';
import { Figure8Track } from '../arena/figure8/track';
import { RaceController, formatLap, type RaceState } from './race';
import { RaceDriver } from '../ai/racer';
import { Car, type CarHost, type SoundHooks } from '../car/car';
import type { CarTemplate } from '../car/carAsset';
import { ACCENTS, CAR_SPECS, PAINTS, STRIPES, stripeColorFor, type LiveryChoice } from '../car/specs';
import { AIDriver, AI_DRIVERS, type Difficulty } from '../ai/driver';
import { Effects } from '../fx/particles';
import { Skidmarks } from '../fx/skidmarks';
import { DebrisManager } from '../fx/debris';
import { emptyInput, type DriverInput } from '../core/input';
import { clamp, rng } from '../core/math';

export interface MatchConfig {
  playerCar: string;
  playerColor: string;
  playerLivery?: LiveryChoice;
  playerNumber: number;
  opponents: number;
  difficulty: Difficulty;
  timeLimit: number; // seconds
  seed: number;
  /** attract mode: every car is AI-driven */
  demo?: boolean;
  /** 'total' = Total Destruction: every AI car goes for the player; 'race' = Figure 8 race */
  mode?: 'derby' | 'total' | 'race';
  /** race laps */
  laps?: number;
}

export type Phase = 'intro' | 'countdown' | 'run' | 'over';

export interface FeedItem {
  text: string;
  time: number;
  kind: 'spin' | 'wreck' | 'info' | 'player';
}

export interface Popup {
  text: string;
  sub?: string;
  time: number;
  color?: string;
}

/** Duck-typed hooks the match drives if the audio module is present. */
export interface MatchAudio extends SoundHooks {
  scrape(id: number, pos: THREE.Vector3, intensity: number): void;
  skid(id: number, pos: THREE.Vector3, intensity: number): void;
  horn(id: number, pos: THREE.Vector3, on: boolean): void;
  cheer(strength: number): void;
  excitement(x: number): void;
  ui(kind: 'countdown' | 'go' | 'points' | 'wreck' | 'lose' | 'win'): void;
}

/** Duck-typed stadium (built by src/arena/stadium.ts). */
export interface StadiumLike {
  group: THREE.Group;
  update(dt: number, time: number, excitement: number): void;
  cheer(strength: number, at?: THREE.Vector3): void;
  setScoreboard(lines: string[]): void;
}

interface PendingImpact {
  a: number;
  b: number;
  /** closing speed along the normal at first contact (m/s), from pre-step velocities */
  vrel: number;
  impulse: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  weight: number;
  steps: number;
  idle: number;
  seen: boolean;
}

const SPIN_POINTS: [number, number, string][] = [
  [320, 10, '360°'],
  [160, 4, '180°'],
  [80, 2, '90°'],
];
const WRECK_POINTS = 10;
const SURVIVOR_BONUS = 10;
const HELMETS = ['#f2f2f2', '#e8c21d', '#d62f2f', '#2f6fd6', '#1c1c1c', '#f07f1a', '#2fb36a', '#b04fd6'];

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

export class Match {
  readonly world: RAPIER.World;
  readonly scene = new THREE.Scene();
  /** the arena the round is in: the Bowl (derby) or the Figure 8 track (race) */
  readonly arena: Bowl | Figure8Track;
  readonly bowl: Bowl | null;
  readonly track: Figure8Track | null;
  readonly race: RaceController | null = null;
  readonly cars: Car[] = [];
  readonly player: Car;
  readonly fx = new Effects();
  readonly skids = new Skidmarks();
  readonly debris: DebrisManager;
  readonly config: MatchConfig;
  private ais = new Map<Car, AIDriver>();
  private racers = new Map<Car, RaceDriver>();
  private eventQueue = new RAPIER.EventQueue(true);
  private colliderCar = new Map<number, Car>();
  private pending = new Map<string, PendingImpact>();
  private activePairs = new Map<string, [number, number]>();
  private wreckScored = new Set<Car>();
  phase: Phase = 'intro';
  phaseTime = 0;
  clock = 0; // time since the green flag
  time = 0; // sim time
  feed: FeedItem[] = [];
  popups: Popup[] = [];
  excitement = 0.2;
  stadium: StadiumLike | null = null;
  audio: MatchAudio | null = null;
  playerHits = 0; // for camera shake
  lastPlayerImpact = 0;
  winner: Car | null = null;
  /** test switch: when false the AI cars get no input */
  aiEnabled = true;
  impactLog: { t: number; a: number; b: number; kind: string; J: number; vrel: number; dvA: number; dvB: number; raw: number }[] = [];
  overReason = '';
  private overDelay = -1;
  private scoreboardT = 0;
  private rand: () => number;

  constructor(config: MatchConfig, templates: Map<string, CarTemplate>) {
    this.config = config;
    this.rand = rng(config.seed);
    this.world = createWorld();
    const racing = config.mode === 'race';
    this.track = racing ? new Figure8Track(this.world) : null;
    this.bowl = racing ? null : new Bowl(this.world);
    this.arena = (this.track ?? this.bowl)!;
    if (this.track) this.fx.dustTint.setRGB(0.72, 0.6, 0.5); // red-brown dirt at dusk
    this.debris = new DebrisManager(this.world);
    this.scene.add(this.arena.group, this.fx.particles.group, this.skids.mesh, this.debris.group);

    const host: CarHost = {
      world: this.world,
      fx: this.fx,
      skids: this.skids,
      debris: this.debris,
      sound: {
        impact: (p, s, k) => this.audio?.impact(p, s, k),
        glass: (p, s) => this.audio?.glass(p, s),
        partOff: (p) => this.audio?.partOff(p),
        wreck: (p) => this.audio?.wreck(p),
      },
      groundHeight: (x, z) => this.arena.heightAt(x, z),
      now: () => this.time,
    };

    const n = 1 + clamp(config.opponents, 1, 11);
    const spawns = this.arena.spawnPoints(n);
    // races: the player starts from the back of the grid and has the whole field to get through
    if (racing && !config.demo) spawns.unshift(spawns.pop()!);
    const usedNumbers = new Set<number>([config.playerNumber]);
    const colors = PAINTS.filter((c) => c.toLowerCase() !== config.playerColor.toLowerCase());
    // shuffle driver roster
    const roster = AI_DRIVERS.slice().sort(() => this.rand() - 0.5);
    for (let i = 0; i < n; i++) {
      const isPlayer = i === 0 && !config.demo;
      const specId = isPlayer ? config.playerCar : CAR_SPECS[Math.floor(this.rand() * CAR_SPECS.length)].id;
      const tmpl = templates.get(specId)!;
      let num = config.playerNumber;
      if (!isPlayer) {
        do num = 1 + Math.floor(this.rand() * 98);
        while (usedNumbers.has(num));
        usedNumbers.add(num);
      }
      let livery: LiveryChoice;
      if (isPlayer && config.playerLivery) livery = config.playerLivery;
      else {
        const color = isPlayer ? config.playerColor : colors[(i * 5 + Math.floor(this.rand() * 3)) % colors.length];
        const accent = ACCENTS[Math.floor(this.rand() * ACCENTS.length)];
        const stripe = STRIPES[Math.floor(this.rand() * STRIPES.length)];
        livery = { color, accent, stripe, stripeColor: stripeColorFor(color, accent, stripe) };
      }
      const car = new Car(
        host,
        {
          index: i,
          template: tmpl,
          color: livery.color,
          accent: livery.accent,
          stripe: livery.stripe,
          stripeColor: livery.stripeColor,
          number: num,
          helmet: HELMETS[Math.floor(this.rand() * HELMETS.length)],
          isPlayer,
          driverName: isPlayer ? 'You' : roster[(i + roster.length - 1) % roster.length].name,
          wear: isPlayer ? 0.25 : 0.15 + this.rand() * 0.6,
          toughnessMul: isPlayer ? 1 : config.difficulty.toughness,
        },
        spawns[i],
      );
      this.cars.push(car);
      this.scene.add(car.root);
      for (const c of car.colliders) this.colliderCar.set(c.handle, car);
      if (!isPlayer) {
        const who = roster[(i + roster.length - 1) % roster.length];
        if (racing) this.racers.set(car, new RaceDriver(who, config.difficulty, config.seed * 31 + i));
        else this.ais.set(car, new AIDriver(who, config.difficulty, config.seed * 31 + i));
      }
    }
    this.player = this.cars[0];
    if (this.track) {
      const laps = config.laps ?? 10;
      this.race = new RaceController(this.track, this.cars, laps, {
        lap: (st, t, best) => this.onLap(st, t, best),
        finish: (st) => this.onFinish(st),
        respawn: (st, why) => {
          if (st.car.isPlayer) this.popup(why === 'thrown' ? 'THROWN OUT!' : 'BACK ON TRACK', why === 'thrown' ? 'back on the track' : undefined, '#9fe8ff');
          else if (why === 'thrown') this.pushFeed(`#${st.car.number} ${st.car.name} was thrown off the track`, 'spin');
        },
      });
      this.pushFeed(`Figure 8: ${laps} laps, ${n} cars. Mind the crossing.`, 'info');
    } else {
      this.pushFeed(config.mode === 'total' ? `Total Destruction: all ${n - 1} cars are coming for you.` : `${n} cars in the Bowl. Last car running wins.`, 'info');
    }
  }

  get aliveCount() {
    return this.cars.filter((c) => !c.wrecked).length;
  }

  get timeLeft() {
    return Math.max(0, this.config.timeLimit - this.clock);
  }

  standings(): Car[] {
    if (this.race) return this.race.standings().map((s) => s.car);
    return this.cars.slice().sort((a, b) => b.points - a.points || Number(a.wrecked) - Number(b.wrecked) || b.wreckTime - a.wreckTime);
  }

  targetedBy = (c: Car) => {
    let n = 0;
    for (const ai of this.ais.values()) if (ai.target === c) n++;
    return n;
  };

  pushFeed(text: string, kind: FeedItem['kind']) {
    this.feed.push({ text, time: this.time, kind });
    if (this.feed.length > 7) this.feed.shift();
  }

  popup(text: string, sub?: string, color?: string) {
    this.popups.push({ text, sub, time: this.time, color });
    if (this.popups.length > 3) this.popups.shift();
  }

  skipIntro() {
    if (this.phase === 'intro') this.setPhase('countdown');
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseTime = 0;
    if (p === 'countdown') this.audio?.ui('countdown');
  }

  // ------------------------------------------------------------------------------------------------
  fixedStep(playerInput: DriverInput) {
    const dt = PHYS_DT;
    this.time += dt;
    this.phaseTime += dt;
    const racing = this.phase === 'run' || (this.phase === 'over' && this.overDelay >= 0);

    // phase clock
    if (this.phase === 'intro' && this.phaseTime > 3.2) this.setPhase('countdown');
    if (this.phase === 'countdown') {
      const before = Math.ceil(3 - (this.phaseTime - dt));
      const now = Math.ceil(3 - this.phaseTime);
      if (now !== before && now > 0) this.audio?.ui('countdown');
      if (this.phaseTime >= 3) {
        this.setPhase('run');
        this.audio?.ui('go');
        this.stadium?.cheer(0.8);
        this.excitement = 0.7;
      }
    }
    if (this.phase === 'run') this.clock += dt;

    // inputs
    for (const car of this.cars) {
      if (!racing) {
        car.input = { ...emptyInput(), brake: 0, handbrake: true };
        // let them rev on the line
        if (this.phase === 'countdown' && !car.isPlayer) car.input.throttle = 0.3 * this.rand();
        if (this.phase === 'countdown' && car.isPlayer) car.input.throttle = playerInput.throttle;
        continue;
      }
      if (car.isPlayer) car.input = this.phase === 'over' ? emptyInput() : playerInput;
      else if (this.race) {
        const rd = this.racers.get(car)!;
        const st = this.race.of(car);
        car.input = this.aiEnabled ? rd.update(dt, car, st, this.track!, this.race, this.time) : emptyInput();
      } else {
        const ai = this.ais.get(car)!;
        if (this.config.mode === 'total' && !this.player.wrecked && this.player.isPlayer) ai.forcedTarget = this.player;
        else ai.forcedTarget = null;
        const b = this.bowl!.opts;
        car.input = this.phase === 'over' || !this.aiEnabled ? emptyInput() : ai.update(dt, car, this.cars, { floorRadius: b.floorRadius, wallRadius: b.wallRadius }, this.targetedBy, this.time);
      }
    }
    for (const car of this.cars) car.fixedUpdate(dt);
    this.world.step(this.eventQueue);
    for (const car of this.cars) car.postStep();
    this.debris.postStep();
    this.race?.update(dt, this.clock, this.phase === 'run');
    this.collectImpacts(dt);
    this.scoring();
  }

  // ------------------------------------------------------------------------------------------------
  // race events
  private onLap(st: RaceState, t: number, best: boolean) {
    const laps = this.race!.laps;
    if (st.car.isPlayer) {
      const left = laps - st.lap;
      this.popup(left === 1 ? 'FINAL LAP!' : `LAP ${st.lap + 1}/${laps}`, `${formatLap(t)}${best ? '  BEST' : ''}`, left === 1 ? '#ff6b4a' : '#ffd23f');
      this.audio?.ui('points');
    }
    const leader = this.race!.standings()[0];
    if (leader === st && laps - st.lap === 1) this.pushFeed(`#${st.car.number} ${st.car.isPlayer ? 'You' : st.car.name} leads onto the final lap`, 'info');
  }

  private onFinish(st: RaceState) {
    const who = st.car.isPlayer ? 'You' : `#${st.car.number} ${st.car.name}`;
    const pos = ['1st', '2nd', '3rd'][st.place - 1] ?? `${st.place}th`;
    const down = this.race!.laps - st.lap;
    const lapsDown = down > 0 ? ` (${down} lap${down > 1 ? 's' : ''} down)` : '';
    this.pushFeed(`${who} finished ${pos}${lapsDown}`, st.car.isPlayer ? 'player' : 'info');
    if (st.place === 1) {
      this.stadium?.cheer(1);
      this.excitement = 1;
    }
    if (st.car.isPlayer) {
      this.popup(st.place === 1 ? 'YOU WIN!' : `FINISHED ${pos.toUpperCase()}`, formatLap(st.finishTime), st.place === 1 ? '#7dff5a' : '#ffd23f');
      this.audio?.ui(st.place <= 3 ? 'win' : 'lose');
    }
  }

  private collectImpacts(dt: number) {
    const world = this.world;
    this.eventQueue.drainContactForceEvents((e) => {
      const h1 = e.collider1(), h2 = e.collider2();
      const a = Math.min(h1, h2), b = Math.max(h1, h2);
      if (!this.colliderCar.has(a) && !this.colliderCar.has(b)) return;
      const key = `${a}:${b}`;
      let p = this.pending.get(key);
      if (!p) {
        p = { a, b, vrel: -1, impulse: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), weight: 0, steps: 0, idle: 0, seen: false };
        this.pending.set(key, p);
      }
      const imp = e.totalForceMagnitude() * dt;
      p.impulse += imp;
      p.seen = true;
      const c1 = world.getCollider(a), c2 = world.getCollider(b);
      if (!c1 || !c2) return;
      world.contactPair(c1, c2, (m, flipped) => {
        const nc = m.numSolverContacts();
        const nn = m.normal();
        const s = flipped ? -1 : 1;
        p!.normal.x += nn.x * s * imp;
        p!.normal.y += nn.y * s * imp;
        p!.normal.z += nn.z * s * imp;
        for (let i = 0; i < nc; i++) {
          const sp = m.solverContactPoint(i);
          if (!sp) continue;
          p!.point.x += (sp.x * imp) / nc;
          p!.point.y += (sp.y * imp) / nc;
          p!.point.z += (sp.z * imp) / nc;
          if (i === nc - 1) p!.weight += imp;
        }
        if (p!.vrel < 0 && nc > 0) {
          // closing speed at the moment of impact, measured from the velocities before this step
          const sp = m.solverContactPoint(0)!;
          const pt = new THREE.Vector3(sp.x, sp.y, sp.z);
          const n = new THREE.Vector3(nn.x * s, nn.y * s, nn.z * s); // a -> b
          const ca = this.colliderCar.get(a), cb = this.colliderCar.get(b);
          const va = ca ? ca.preVelocityAt(pt, new THREE.Vector3()) : new THREE.Vector3();
          const vb = cb ? cb.preVelocityAt(pt, new THREE.Vector3()) : new THREE.Vector3();
          p!.vrel = Math.max(0, va.sub(vb).dot(n));
        }
      });
    });
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      const a = Math.min(h1, h2), b = Math.max(h1, h2);
      const key = `${a}:${b}`;
      if (started) this.activePairs.set(key, [a, b]);
      else this.activePairs.delete(key);
    });
    for (const [key, p] of this.pending) {
      if (!p.seen) p.idle++;
      p.seen = false;
      p.steps++;
      if (p.idle >= 2 || p.steps >= 8) {
        this.pending.delete(key);
        this.resolveImpact(p);
      }
    }
  }

  private kindOf(handle: number): 'car' | 'wall' | 'ground' | 'debris' {
    if (this.colliderCar.has(handle)) return 'car';
    const tag = this.arena.tags.get(handle);
    if (tag && tag.kind === 'arena') return tag.part === 'wall' ? 'wall' : 'ground';
    return 'debris';
  }

  /** damage multiplier of an arena collider (tyre walls give) */
  private softness(handle: number): number {
    const tag = this.arena.tags.get(handle);
    return tag && tag.kind === 'arena' ? (tag.soft ?? 1) : 1;
  }

  private resolveImpact(p: PendingImpact) {
    const carA = this.colliderCar.get(p.a) ?? null;
    const carB = this.colliderCar.get(p.b) ?? null;
    if (carA && carA === carB) return;
    const point = new THREE.Vector3();
    if (p.weight > 0) point.copy(p.point).divideScalar(p.weight);
    else {
      const x = carA ?? carB!;
      point.copy(x.curPos);
    }
    const normal = _n.copy(p.normal);
    if (normal.lengthSq() < 1e-8) return;
    normal.normalize();
    const kindA = this.kindOf(p.b); // what A hit
    const kindB = this.kindOf(p.a);
    const scale = (k: string) => (k === 'debris' ? 0.25 : k === 'ground' ? 0.55 : 1);
    // A car's velocity change can't physically exceed its share of the closing speed (plus a little
    // bounce). The solver's penetration recovery can report far bigger impulses, so cap them.
    const mA = carA?.mass ?? 1e9, mB = carB?.mass ?? 1e9;
    const vrel = Math.max(0, p.vrel);
    const capA = vrel * (mB / (mA + mB)) * 1.2 + 0.3;
    const capB = vrel * (mA / (mA + mB)) * 1.2 + 0.3;
    let maxDv = 0;
    if (carA) {
      const imp = p.impulse * scale(kindA) * this.softness(p.b);
      const dv = Math.min(p.impulse / mA, capA) * scale(kindA) * this.softness(p.b);
      maxDv = Math.max(maxDv, dv);
      carA.applyImpact({ pointWorld: point, dirWorld: normal.clone().negate(), impulse: imp, dv, otherCar: carB, kind: kindA });
    }
    if (carB) {
      const imp = p.impulse * scale(kindB) * this.softness(p.a);
      const dv = Math.min(p.impulse / mB, capB) * scale(kindB) * this.softness(p.a);
      maxDv = Math.max(maxDv, dv);
      carB.applyImpact({ pointWorld: point, dirWorld: normal.clone(), impulse: imp, dv, otherCar: carA, kind: kindB });
    }
    if (this.impactLog.length > 60) this.impactLog.shift();
    this.impactLog.push({ t: +this.time.toFixed(2), a: carA?.index ?? -1, b: carB?.index ?? -1, kind: carA && carB ? 'car' : carA ? kindA : kindB, J: Math.round(p.impulse), vrel: +vrel.toFixed(1), dvA: carA ? +Math.min(p.impulse / mA, capA).toFixed(1) : 0, dvB: carB ? +Math.min(p.impulse / mB, capB).toFixed(1) : 0, raw: +(p.impulse / Math.min(mA, mB)).toFixed(1) });
    if (maxDv < 0.8) return;
    const kind = carA && carB ? 'car' : carA ? kindA : kindB;
    // effects
    const strength = clamp(maxDv / 12, 0, 1);
    if (kind !== 'ground' && kind !== 'debris') this.fx.sparks(point, normal.clone().multiplyScalar(Math.random() < 0.5 ? 1 : -1).add(_v.set(0, 0.6, 0)), Math.round(6 + strength * 60), 5 + strength * 8);
    if (strength > 0.25) this.fx.chunks(point, _v.set(0, 1, 0), Math.round(strength * 10), 0x333333);
    this.audio?.impact(point, strength, kind);
    this.excitement = Math.min(1, this.excitement + strength * 0.25);
    if (strength > 0.45) this.stadium?.cheer(strength * 0.6, point);
    if (carA?.isPlayer || carB?.isPlayer) {
      this.playerHits += strength;
      this.lastPlayerImpact = this.time;
    }
    // spins: a car that gets hit by another car starts a spin count, credited to the hitter
    if (carA && carB && this.phase === 'run') {
      for (const [victim, other] of [
        [carA, carB],
        [carB, carA],
      ] as const) {
        const dv = Math.min(p.impulse / victim.mass, victim === carA ? capA : capB);
        if (dv < 2.0 || victim.wrecked) continue;
        if (victim.spin && victim.spin.attacker !== other.index) this.closeSpin(victim);
        if (!victim.spin) victim.spin = { attacker: other.index, accum: 0, t: 0, calm: 0 };
        else victim.spin.t = Math.min(victim.spin.t, 0.3);
      }
    }
  }

  private closeSpin(victim: Car) {
    const s = victim.spin;
    victim.spin = null;
    if (!s || this.phase !== 'run') return;
    const deg = Math.abs(THREE.MathUtils.radToDeg(s.accum));
    const attacker = this.cars[s.attacker];
    if (!attacker || attacker.wrecked) return;
    for (const [min, pts, label] of SPIN_POINTS) {
      if (deg >= min) {
        attacker.points += pts;
        attacker.spinsScored++;
        const who = attacker.isPlayer ? 'You' : `#${attacker.number} ${attacker.name}`;
        this.pushFeed(`${who} spun #${victim.number} ${label}  +${pts}`, attacker.isPlayer ? 'player' : 'spin');
        if (attacker.isPlayer) {
          this.popup(`${label} SPIN!`, `+${pts}`, '#ffd23f');
          this.audio?.ui('points');
        }
        if (victim.isPlayer) this.popup(`SPUN ${label}`, `by #${attacker.number}`, '#ff6b4a');
        this.excitement = Math.min(1, this.excitement + pts * 0.03);
        break;
      }
    }
  }

  private scoring() {
    for (const car of this.cars) {
      const s = car.spin;
      if (s && ((s.t > 0.7 && s.calm > 0.35) || s.t > 4.5)) this.closeSpin(car);
    }
    for (const car of this.cars) {
      if (!car.wrecked || this.wreckScored.has(car)) continue;
      this.wreckScored.add(car);
      const hit = car.lastHitBy;
      const attacker = hit && this.time - hit.time < 8 ? this.cars[hit.car] : null;
      if (attacker && attacker !== car && this.phase === 'run') {
        attacker.points += WRECK_POINTS;
        attacker.wrecksScored++;
        const who = attacker.isPlayer ? 'You' : `#${attacker.number} ${attacker.name}`;
        this.pushFeed(`${who} WRECKED #${car.number} ${car.isPlayer ? '(you)' : car.name}  +${WRECK_POINTS}`, attacker.isPlayer ? 'player' : 'wreck');
        if (attacker.isPlayer) {
          this.popup('WRECKED HIM!', `#${car.number}  +${WRECK_POINTS}`, '#ffd23f');
          this.audio?.ui('wreck');
        }
      } else {
        this.pushFeed(`#${car.number} ${car.isPlayer ? 'You' : car.name} is out of the ${this.race ? 'race' : 'derby'}`, car.isPlayer ? 'player' : 'wreck');
      }
      if (car.isPlayer) {
        this.popup('WRECKED', 'your engine is dead', '#ff4a3a');
        this.audio?.ui('lose');
      }
      this.excitement = 1;
      this.stadium?.cheer(1, car.curPos);
    }
    // end of the round
    if (this.phase === 'run' && this.race) {
      const r = this.race;
      const running = r.states.filter((x) => !x.finished && !x.car.wrecked);
      // everyone gets the flag within about a lap of the winner; this is only the fallback for stragglers
      const graceOver = r.firstFinishTime >= 0 && this.clock - r.firstFinishTime > 35;
      if (this.overDelay < 0 && (running.length === 0 || graceOver || this.clock >= this.config.timeLimit || (this.player.wrecked && this.player.isPlayer && running.length <= 1))) {
        this.overDelay = 0;
        this.overReason = r.finishedCount ? 'Race finished' : 'Time';
      }
      if (this.overDelay >= 0) {
        this.overDelay += PHYS_DT;
        if (this.overDelay > 1.5) this.finish();
      }
      return;
    }
    if (this.phase === 'run') {
      const alive = this.cars.filter((c) => !c.wrecked);
      const playerOut = this.config.mode === 'total' && this.player.wrecked;
      if (this.overDelay < 0 && (alive.length <= 1 || this.clock >= this.config.timeLimit || playerOut)) {
        this.overDelay = 0;
        this.overReason = playerOut ? `Survived ${Math.floor(this.clock)} s` : alive.length <= 1 ? 'Last car running' : 'Time';
      }
      if (this.overDelay >= 0) {
        this.overDelay += PHYS_DT;
        if (this.overDelay > 2.2) this.finish();
      }
    }
  }

  /** End now (time up, last car, or the wrecked player asked to skip). */
  finish(reason?: string) {
    if (this.phase === 'over') return;
    if (reason) this.overReason = reason;
    const alive = this.cars.filter((c) => !c.wrecked);
    if (alive.length === 1 && !this.race) {
      const w = alive[0];
      w.points += SURVIVOR_BONUS;
      this.pushFeed(`#${w.number} ${w.isPlayer ? 'You' : w.name}: last car running  +${SURVIVOR_BONUS}`, w.isPlayer ? 'player' : 'info');
    }
    const st = this.standings();
    st.forEach((c, i) => (c.finishPlace = i + 1));
    this.winner = st[0];
    this.setPhase('over');
    this.overDelay = -1;
    this.audio?.ui(this.winner.isPlayer ? 'win' : 'lose');
    this.stadium?.cheer(1);
  }

  // ------------------------------------------------------------------------------------------------
  /** per rendered frame */
  frame(dt: number, alpha: number) {
    for (const car of this.cars) car.render(alpha, dt);
    this.debris.update(dt, alpha);
    this.fx.particles.update(dt, (x, z) => this.arena.heightAt(x, z));
    this.skids.flush();
    this.scrapes(dt);
    this.excitement = Math.max(0.15, this.excitement - dt * 0.05);
    this.stadium?.update(dt, this.time, this.excitement);
    this.scoreboardT -= dt;
    if (this.stadium && this.scoreboardT <= 0) {
      this.scoreboardT = 1;
      const top = this.standings().slice(0, 3);
      const name = (c: Car) => (c.isPlayer ? 'YOU' : c.name.split(' ')[0].toUpperCase().replace(/[^A-Z]/g, ''));
      if (this.race) {
        const lead = this.race.standings()[0];
        this.stadium.setScoreboard([
          this.phase === 'over' ? 'CHECKERED' : `LAP ${Math.min(this.race.laps, lead.lap + 1)}/${this.race.laps}`,
          ...top.map((c, i) => `${i + 1} #${c.number} ${name(c)}`),
        ]);
      } else {
        this.stadium.setScoreboard([
          this.phase === 'run' ? `CARS LEFT ${this.aliveCount}` : this.phase === 'over' ? 'DERBY OVER' : 'THE BOWL',
          ...top.map((c) => `#${c.number} ${name(c)} ${c.points}`),
        ]);
      }
    }
    this.audio?.excitement(this.excitement);
    // prune old UI items
    this.popups = this.popups.filter((p) => this.time - p.time < 2.6);
  }

  private scrapeAcc = 0;
  /** Grinding contacts: sparks, paint scuffs and the scrape sound. */
  private scrapes(dt: number) {
    const world = this.world;
    const perCar = new Map<Car, { p: THREE.Vector3; i: number }>();
    for (const [a, b] of this.activePairs.values()) {
      const carA = this.colliderCar.get(a), carB = this.colliderCar.get(b);
      if (!carA && !carB) continue;
      const c1 = world.getCollider(a), c2 = world.getCollider(b);
      if (!c1 || !c2) continue;
      let pt: THREE.Vector3 | null = null;
      world.contactPair(c1, c2, (m) => {
        if (m.numSolverContacts() > 0 && !pt) {
          const sp = m.solverContactPoint(0)!;
          pt = new THREE.Vector3(sp.x, sp.y, sp.z);
        }
      });
      if (!pt) continue;
      const p = pt as THREE.Vector3;
      const va = carA ? carA.body.velocityAtPoint(p) : { x: 0, y: 0, z: 0 };
      const vb = carB ? carB.body.velocityAtPoint(p) : { x: 0, y: 0, z: 0 };
      const rel = Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z);
      if (rel < 2.5) continue;
      const intensity = clamp((rel - 2.5) / 12, 0, 1);
      for (const car of [carA, carB]) {
        if (!car) continue;
        const prev = perCar.get(car);
        if (!prev || prev.i < intensity) perCar.set(car, { p, i: intensity });
        car.scuffWorld(p, dt * (0.4 + intensity * 1.6));
      }
      this.scrapeAcc += dt * (20 + intensity * 120);
      while (this.scrapeAcc > 1) {
        this.scrapeAcc--;
        this.fx.sparks(p, _v.set(va.x - vb.x, 1.5, va.z - vb.z).normalize(), 1, 3 + intensity * 6);
      }
    }
    for (const car of this.cars) {
      const s = perCar.get(car);
      this.audio?.scrape(car.index, s ? s.p : car.curPos, s ? s.i : 0);
    }
  }

  dispose() {
    for (const c of this.cars) c.dispose();
    this.debris.clear();
    this.eventQueue.free();
    this.world.free();
  }
}
