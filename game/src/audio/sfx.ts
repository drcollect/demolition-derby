/*
 * Positional one-shots: impacts, glass, parts tearing off, wrecks.
 *
 * A pool of slots (gain -> brightness/air low-pass -> PannerNode, plus a reverb send) is reused; each
 * event layers several randomly chosen, randomly pitched procedural buffers with small timing offsets
 * so repeated hits never sound identical. Contact spam from the physics engine is merged: a hit that
 * lands within ~90 ms and ~2.5 m of a louder recent hit is dropped, and bursts are rate-limited.
 */
import { AudioCore, type Vec3, airCutoff, chance, clamp, finite3, pick, rand } from './core';

export type ImpactKind = 'car' | 'wall' | 'ground' | 'debris';

interface Slot {
  inp: GainNode;
  lp: BiquadFilterNode;
  pan: PannerNode;
  send: GainNode;
  busyUntil: number;
  srcs: Set<AudioBufferSourceNode>;
}

interface KindDef {
  ref: number;
  bright: number;
  thump: number;
  thumpRate: number;
  crunch: number;
  ring: number;
  ringP: number;
  debrisAt: number;
}

const KINDS: Record<ImpactKind, KindDef> = {
  car: { ref: 10, bright: 1, thump: 0.75, thumpRate: 1.0, crunch: 0.9, ring: 0.45, ringP: 1, debrisAt: 0.45 },
  wall: { ref: 11, bright: 0.9, thump: 0.95, thumpRate: 0.82, crunch: 0.75, ring: 0.3, ringP: 0.8, debrisAt: 0.55 },
  ground: { ref: 9, bright: 0.35, thump: 0.9, thumpRate: 0.75, crunch: 0.25, ring: 0.12, ringP: 0.3, debrisAt: 0.7 },
  debris: { ref: 6, bright: 1, thump: 0.12, thumpRate: 1.8, crunch: 0.2, ring: 0.5, ringP: 1, debrisAt: 2 },
};

const MAX_SLOTS = 20;
const MAX_SOURCES = 180;

export class Sfx {
  private readonly core: AudioCore;
  private readonly slots: Slot[] = [];
  private readonly recent: Array<{ x: number; y: number; z: number; t: number; s: number }> = [];
  /** Crowd hooks (set by DerbyAudio). */
  onBigHit: ((strength: number, when: number) => void) | null = null;
  onWreck: ((when: number) => void) | null = null;

  constructor(core: AudioCore) {
    this.core = core;
  }

  busySlots(): number {
    const now = this.core.now();
    let n = 0;
    for (const s of this.slots) if (s.busyUntil > now) n++;
    return n;
  }

  private makeSlot(): Slot {
    const core = this.core;
    const ctx = core.ctx;
    const inp = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = -3; // dB for lowpass: no resonant bump
    const pan = core.panner(10);
    const send = ctx.createGain();
    inp.connect(lp);
    lp.connect(pan);
    pan.connect(core.sfxBus);
    lp.connect(send);
    send.connect(core.reverbIn);
    return { inp, lp, pan, send, busyUntil: 0, srcs: new Set() };
  }

  private acquire(pos: Vec3, ref: number, gain: number, bright: number): { slot: Slot; t0: number } {
    const core = this.core;
    const now = core.now();
    let slot: Slot | undefined;
    let t0 = now + 0.004;
    let stolen = false;
    for (const s of this.slots) {
      if (s.busyUntil <= now) {
        slot = s;
        break;
      }
    }
    if (!slot && this.slots.length < MAX_SLOTS) {
      slot = this.makeSlot();
      this.slots.push(slot);
    }
    if (!slot) {
      // steal the slot that finishes soonest: quick fade, stop its sources, start 25 ms later
      slot = this.slots.reduce((a, b) => (a.busyUntil < b.busyUntil ? a : b));
      const g = slot.inp.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.02);
      for (const src of slot.srcs) {
        try {
          src.stop(now + 0.021);
        } catch {
          /* already stopped */
        }
      }
      slot.srcs.clear();
      t0 = now + 0.025;
      stolen = true;
    }
    if (!stolen) slot.inp.gain.cancelScheduledValues(now);
    const d = core.dist(pos);
    slot.pan.refDistance = ref;
    core.setPos(slot.pan, pos);
    slot.inp.gain.setValueAtTime(gain, t0);
    slot.lp.frequency.setValueAtTime(clamp(Math.min(airCutoff(d), bright), 200, 22000), t0);
    slot.send.gain.setValueAtTime(0.16 + 0.3 * Math.min(1, d / 60), t0);
    slot.busyUntil = t0 + 0.5;
    return { slot, t0 };
  }

  /** Returns false when the event should be merged into a recent louder one. */
  private admit(pos: Vec3, s: number, radius: number, window: number): boolean {
    const now = this.core.now();
    while (this.recent.length > 0 && now - (this.recent[0] as { t: number }).t > 0.3) this.recent.shift();
    let burst = 0;
    for (const r of this.recent) {
      const age = now - r.t;
      if (age < window) {
        const dx = r.x - pos.x;
        const dy = r.y - pos.y;
        const dz = r.z - pos.z;
        if (dx * dx + dy * dy + dz * dz < radius * radius && s <= r.s * 1.15) return false;
      }
      if (age < 0.1) burst++;
    }
    if (burst >= 8 && s < 0.6) return false;
    this.recent.push({ x: pos.x, y: pos.y, z: pos.z, t: now, s });
    return true;
  }

  private ready(pos: Vec3): boolean {
    return !!this.core.buf && this.core.isRunning() && finite3(pos);
  }

  impact(pos: Vec3, strength: number, kind: ImpactKind, force = false): void {
    if (!this.ready(pos)) return;
    const B = this.core.buf;
    if (!B) return;
    const s = clamp(Number.isFinite(strength) ? strength : 0, 0, 1);
    if (s < 0.01) return;
    const k = KINDS[kind] ?? KINDS.car;
    if (!force && !this.admit(pos, s, kind === 'debris' ? 1.2 : 2.5, 0.09)) return;
    const core = this.core;
    const bright = k.bright * (1400 + 17000 * Math.pow(s, 0.8));
    const { slot, t0 } = this.acquire(pos, k.ref, 0.9 * Math.pow(s, 1.1), bright);
    let end = t0;
    const P = (buf: AudioBuffer | undefined, dt: number, g: number, rate: number, maxDur = 0): void => {
      end = Math.max(end, core.play(slot.inp, buf, t0 + dt, g, rate, 0, maxDur, slot.srcs));
    };
    // body-mass thump: lower and longer for harder hits
    P(pick(B.thump), 0, k.thump, k.thumpRate * (1.2 - 0.4 * s) * rand(0.9, 1.1));
    // crumpling metal, 1-3 staggered layers
    const nCrunch = kind === 'debris' ? 1 : 1 + (s > 0.35 ? 1 : 0) + (s > 0.7 ? 1 : 0);
    for (let i = 0; i < nCrunch; i++) {
      P(pick(B.crunch), i === 0 ? rand(0, 0.006) : rand(0.008, 0.03) * i, k.crunch * (i === 0 ? 1 : 0.7), rand(0.8, 1.25) * (1.1 - 0.2 * s));
    }
    // metallic ring of the panels
    if (chance(k.ringP)) {
      const idx = kind === 'debris' ? 7 + Math.floor(Math.random() * 5) : Math.floor(Math.random() * 5) + (s < 0.4 ? 3 : 0);
      P(B.ring[idx], rand(0, 0.01), k.ring * rand(0.6, 1), rand(0.85, 1.2));
      if (s > 0.55 && kind !== 'ground') P(B.ring[Math.floor(Math.random() * 7)], rand(0.01, 0.04), k.ring * 0.6 * rand(0.6, 1), rand(0.85, 1.2));
    }
    if (kind === 'wall') {
      P(pick(B.concrete), 0, 0.55, rand(0.85, 1.15));
      if (s > 0.3 && chance(0.7)) P(pick(B.fence), rand(0.015, 0.045), 0.35 * s, rand(0.85, 1.15));
    } else if (kind === 'ground') {
      P(pick(B.dirt), 0, 0.85, rand(0.8, 1.15));
    } else if (kind === 'debris') {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) P(pick(B.ping), rand(0, 0.08), 0.45 * rand(0.5, 1), rand(0.7, 1.4));
    }
    if (s > k.debrisAt && core.activeSources < MAX_SOURCES) {
      end = Math.max(end, this.debris(slot, t0, (s - k.debrisAt) / (1 - k.debrisAt)));
    }
    slot.busyUntil = end + 0.05;
    if (s >= 0.75 && this.onBigHit) this.onBigHit(s, t0);
  }

  /** Bits of trim, glass and bolts raining down after a big hit; some bounce. */
  private debris(slot: Slot, t0: number, amt: number): number {
    const core = this.core;
    const B = core.buf;
    if (!B) return t0;
    let end = t0;
    const n = Math.min(10, Math.round(amt * 14 * rand(0.7, 1.3)) + 1);
    for (let i = 0; i < n; i++) {
      const t = 0.06 + 1.1 * Math.pow(Math.random(), 1.7);
      const g = 0.28 * rand(0.3, 1) * (0.5 + 0.5 * amt);
      const buf = chance(0.75) ? pick(B.ping) : B.ring[8 + Math.floor(Math.random() * 4)];
      const rate = rand(0.7, 1.4);
      end = Math.max(end, core.play(slot.inp, buf, t0 + t, g, rate, 0, 0.35, slot.srcs));
      if (chance(0.3)) {
        let dt = rand(0.08, 0.2);
        let gg = g * 0.5;
        let tt = t;
        const k = 2 + Math.floor(Math.random() * 2);
        for (let j = 0; j < k; j++) {
          tt += dt;
          end = Math.max(end, core.play(slot.inp, buf, t0 + tt, gg, rate * rand(0.97, 1.03), 0, 0.2, slot.srcs));
          dt *= 0.55;
          gg *= 0.55;
        }
      }
    }
    return end;
  }

  glass(pos: Vec3, strength: number): void {
    if (!this.ready(pos)) return;
    const B = this.core.buf;
    if (!B) return;
    const s = clamp(Number.isFinite(strength) ? strength : 0.5, 0, 1);
    if (!this.admit(pos, s, 1.0, 0.04)) return;
    const core = this.core;
    const shatter = s >= 0.5;
    const { slot, t0 } = this.acquire(pos, 6, shatter ? 0.7 + 0.4 * s : 0.35 + 0.45 * s, 20000);
    let end = t0;
    const P = (buf: AudioBuffer | undefined, dt: number, g: number, rate: number, maxDur = 0): void => {
      end = Math.max(end, core.play(slot.inp, buf, t0 + dt, g, rate, 0, maxDur, slot.srcs));
    };
    if (!shatter) {
      // a crack: sharp tick, a short splinter, a few tiny chips
      P(pick(B.tinkle), 0, 0.8, rand(0.5, 0.7));
      P(pick(B.glassBurst), 0.002, 0.3, rand(1.1, 1.4), 0.07);
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) P(pick(B.tinkle), rand(0.01, 0.12), 0.25 * rand(0.4, 1), rand(0.8, 1.3));
    } else {
      P(pick(B.glassBurst), 0, 0.85, rand(0.9, 1.1));
      P(pick(B.glassRain), rand(0.01, 0.03), 0.6, rand(0.9, 1.15));
      const n = 8 + Math.floor(Math.random() * 9);
      for (let i = 0; i < n; i++) {
        const t = 0.05 + 0.95 * Math.pow(Math.random(), 1.6);
        const g = 0.35 * rand(0.3, 1) * (1 - 0.5 * t);
        const rate = rand(0.8, 1.35);
        const buf = pick(B.tinkle);
        P(buf, t, g, rate);
        if (chance(0.3)) P(buf, t + rand(0.05, 0.12), g * 0.45, rate * rand(0.97, 1.03));
      }
    }
    slot.busyUntil = end + 0.05;
  }

  partOff(pos: Vec3): void {
    if (!this.ready(pos)) return;
    const B = this.core.buf;
    if (!B) return;
    if (!this.admit(pos, 0.6, 1.5, 0.1)) return;
    const core = this.core;
    const { slot, t0 } = this.acquire(pos, 8, 0.75, 16000);
    let end = t0;
    const P = (buf: AudioBuffer | undefined, dt: number, g: number, rate: number, maxDur = 0): void => {
      end = Math.max(end, core.play(slot.inp, buf, t0 + dt, g, rate, 0, maxDur, slot.srcs));
    };
    // tear, then the clang of the part landing, then a tumbling rattle
    P(pick(B.tear), 0, 0.6, rand(0.9, 1.15));
    const land = rand(0.14, 0.26);
    P(B.ring[2 + Math.floor(Math.random() * 5)], land, 0.7, rand(0.9, 1.15));
    P(pick(B.thump), land, 0.35, rand(1.3, 1.7));
    P(pick(B.crunch), land, 0.25, rand(1.1, 1.4), 0.12);
    let t = land;
    let dt = rand(0.16, 0.24);
    let g = 0.45;
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      t += dt;
      P(chance(0.5) ? B.ring[4 + Math.floor(Math.random() * 6)] : pick(B.ping), t, g, rand(0.85, 1.25), 0.35);
      P(pick(B.thump), t, g * 0.3, rand(1.6, 2.2));
      dt *= rand(0.55, 0.75);
      g *= 0.62;
    }
    slot.busyUntil = end + 0.05;
  }

  wreck(pos: Vec3): void {
    if (!this.ready(pos)) return;
    const B = this.core.buf;
    if (!B) return;
    const core = this.core;
    const ctx = core.ctx;
    this.impact(pos, 1, 'car', true);
    const { slot, t0 } = this.acquire(pos, 14, 0.9, 12000);
    // fuel igniting
    const whoompEnd = core.play(slot.inp, pick(B.whoomp), t0 + 0.3, 0.95, rand(0.9, 1.05), 0, 0, slot.srcs);
    // then a few seconds of crackling fire
    const fire = pick(B.fire);
    let end = whoompEnd;
    if (fire) {
      const src = ctx.createBufferSource();
      src.buffer = fire;
      src.loop = true;
      const g = ctx.createGain();
      const a = t0 + 0.35;
      g.gain.setValueAtTime(0, a);
      g.gain.linearRampToValueAtTime(0.45, a + 0.6);
      g.gain.setValueAtTime(0.45, a + 3.8);
      g.gain.linearRampToValueAtTime(0, a + 6.5);
      src.connect(g);
      g.connect(slot.inp);
      src.start(a, rand(0, 3));
      src.stop(a + 6.6);
      slot.srcs.add(src);
      core.activeSources++;
      src.onended = (): void => {
        core.activeSources = Math.max(0, core.activeSources - 1);
        slot.srcs.delete(src);
        src.disconnect();
        g.disconnect();
      };
      end = Math.max(end, a + 6.6);
    }
    slot.busyUntil = end + 0.05;
    if (this.onWreck) this.onWreck(t0 + 0.3);
  }
}
