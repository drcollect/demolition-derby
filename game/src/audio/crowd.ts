/*
 * Crowd: a stereo bed of filtered pink noise whose level and brightness follow excitement, with slow
 * independent L/R swells and babble modulation so it breathes; cheers are formant-filtered "roars"
 * that swell and die away, with a few finger whistles and some applause for the big ones.
 */
import { AudioCore, clamp, pick, rand } from './core';

interface CheerHandle {
  end: number;
  env: GainNode;
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
}

export class Crowd {
  private readonly core: AudioCore;
  private readonly out: GainNode;
  private readonly bed: GainNode[] = [];
  private readonly lp: BiquadFilterNode[] = [];
  private readonly pk: BiquadFilterNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private cheers: CheerHandle[] = [];
  private x = 0.25;
  private nextSwell = 0;
  private nextSpont = 0;
  private started = false;

  constructor(core: AudioCore) {
    this.core = core;
    this.out = core.ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(core.crowdBus);
  }

  private level(x: number): number {
    return 0.12 + 0.2 * x;
  }

  start(): void {
    const core = this.core;
    const B = core.buf;
    if (this.started || !B) return;
    this.started = true;
    const ctx = core.ctx;
    const merger = ctx.createChannelMerger(2);
    merger.connect(this.out);
    this.nodes.push(merger);
    const t = core.now();
    for (let ch = 0; ch < 2; ch++) {
      const src = ctx.createBufferSource();
      src.buffer = B.pink[ch % B.pink.length] ?? null;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = -3;
      lp.frequency.value = 1500;
      const pk = ctx.createBiquadFilter();
      pk.type = 'peaking';
      pk.frequency.value = 900;
      pk.Q.value = 0.8;
      pk.gain.value = 2;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 180;
      hp.Q.value = -3;
      const mod = ctx.createGain();
      mod.gain.value = 0.75;
      const bab = ctx.createBufferSource();
      bab.buffer = B.babble[ch % B.babble.length] ?? null;
      bab.loop = true;
      const depth = ctx.createGain();
      depth.gain.value = 0.25;
      bab.connect(depth);
      depth.connect(mod.gain);
      const bed = ctx.createGain();
      bed.gain.value = this.level(this.x);
      src.connect(lp);
      lp.connect(pk);
      pk.connect(hp);
      hp.connect(mod);
      mod.connect(bed);
      bed.connect(merger, 0, ch);
      src.start(t, rand(0, 5));
      bab.start(t, rand(0, 6));
      this.bed.push(bed);
      this.lp.push(lp);
      this.pk.push(pk);
      this.sources.push(src, bab);
      this.nodes.push(src, bab, lp, pk, hp, mod, depth, bed);
    }
    this.applyExcitement(0.05);
    this.nextSwell = t + 2;
    this.nextSpont = t + 6;
  }

  setExcitement(x: number): void {
    if (!Number.isFinite(x)) return;
    this.x = clamp(x, 0, 1);
    if (this.started) this.applyExcitement(0.6);
  }

  get excitement(): number {
    return this.x;
  }

  private applyExcitement(tau: number): void {
    const t = this.core.now();
    const x = this.x;
    for (const lp of this.lp) lp.frequency.setTargetAtTime(800 + 2600 * x, t, tau);
    for (const pk of this.pk) pk.gain.setTargetAtTime(1 + 5 * x, t, tau);
    for (const b of this.bed) b.gain.setTargetAtTime(this.level(x), t, tau);
  }

  /** A swelling roar (0..1), optionally scheduled at audio time `when`. */
  cheer(strength: number, when?: number): void {
    const core = this.core;
    const B = core.buf;
    if (!B || !core.isRunning() || !Number.isFinite(strength)) return;
    this.cheers = this.cheers.filter((c) => c.end > core.now());
    const s = clamp(strength, 0, 1);
    if (s < 0.02) return;
    const ctx = core.ctx;
    const now = core.now();
    const t0 = Math.max(now + 0.01, when ?? now);
    // at most 3 overlapping cheers: retire the oldest
    this.cheers = this.cheers.filter((c) => c.end > now);
    while (this.cheers.length >= 3) {
      const old = this.cheers.shift();
      if (old) this.kill(old, now);
    }
    const attack = rand(0.22, 0.45) + 0.15 * (1 - s);
    const hold = rand(0.4, 0.8) + 1.2 * s;
    const release = rand(1.4, 2.2) + 1.2 * s;
    const peak = (0.25 + 2.6 * Math.pow(s, 0.9)) * (0.8 + 0.4 * this.x);
    const end = t0 + attack + hold + release * 2.2;
    const env = ctx.createGain();
    const h: CheerHandle = { end, env, nodes: [], sources: [] };

    const src = ctx.createBufferSource();
    src.buffer = pick(B.pink);
    src.loop = true;
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + attack);
    env.gain.setTargetAtTime(peak * 0.8, t0 + attack, hold / 3);
    env.gain.setTargetAtTime(0, t0 + attack + hold, release / 3);
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.35, 0.35);
    // "aaah" formants plus body
    const formants: Array<[BiquadFilterType, number, number, number]> = [
      ['bandpass', rand(700, 850), 2.5, 1.0],
      ['bandpass', rand(1100, 1300), 3, 0.75],
      ['bandpass', rand(2450, 2800), 4, 0.35 + 0.35 * s],
      ['lowpass', 450, -3, 0.35],
    ];
    for (const [type, f, q, g] of formants) {
      const bq = ctx.createBiquadFilter();
      bq.type = type;
      bq.frequency.value = f;
      bq.Q.value = q;
      const gg = ctx.createGain();
      gg.gain.value = g;
      src.connect(bq);
      bq.connect(gg);
      gg.connect(env);
      h.nodes.push(bq, gg);
    }
    env.connect(pan);
    pan.connect(this.out);
    src.start(t0, rand(0, 5));
    src.stop(end);
    h.sources.push(src);
    h.nodes.push(src, env, pan);

    // finger whistles
    const nW = Math.floor(s * 3 + Math.random() * 1.5);
    for (let i = 0; i < nW; i++) {
      const tw = t0 + 0.1 + Math.random() * (attack + hold);
      const dur = rand(0.45, 1.0);
      const f = rand(1700, 2400);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, tw);
      o.frequency.exponentialRampToValueAtTime(f * rand(1.25, 1.45), tw + 0.12);
      o.frequency.setValueAtTime(f * 1.35, tw + dur * 0.6);
      o.frequency.exponentialRampToValueAtTime(f * rand(0.8, 0.95), tw + dur);
      const g = ctx.createGain();
      const a = rand(0.02, 0.045) * s;
      g.gain.setValueAtTime(0, tw);
      g.gain.linearRampToValueAtTime(a, tw + 0.04);
      g.gain.setValueAtTime(a, tw + dur - 0.1);
      g.gain.linearRampToValueAtTime(0, tw + dur);
      const p = ctx.createStereoPanner();
      p.pan.value = rand(-0.8, 0.8);
      o.connect(g);
      g.connect(p);
      p.connect(this.out);
      o.start(tw);
      o.stop(tw + dur + 0.02);
      h.sources.push(o);
      h.nodes.push(o, g, p);
    }

    // applause for bigger moments
    if (s > 0.3 && B.applause.length > 0) {
      const ap = ctx.createBufferSource();
      ap.buffer = pick(B.applause);
      ap.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 600;
      const g = ctx.createGain();
      const ta = t0 + attack * 0.6;
      const lvl = 0.9 * s;
      g.gain.setValueAtTime(0, ta);
      g.gain.linearRampToValueAtTime(lvl, ta + 0.5);
      g.gain.setTargetAtTime(0, ta + 0.5 + hold, release / 2.5);
      ap.connect(hp);
      hp.connect(g);
      g.connect(this.out);
      ap.start(ta, rand(0, 3));
      ap.stop(end);
      h.sources.push(ap);
      h.nodes.push(ap, hp, g);
    }
    for (const sNode of h.sources) {
      sNode.onended = (): void => {
        if (sNode === h.sources[0]) for (const n of h.nodes) n.disconnect();
      };
    }
    this.cheers.push(h);
  }

  private kill(h: CheerHandle, t: number): void {
    h.env.gain.cancelScheduledValues(t);
    h.env.gain.setTargetAtTime(0, t, 0.015);
    for (const s of h.sources) {
      try {
        s.stop(t + 0.05);
      } catch {
        /* already stopped */
      }
    }
  }

  /** Slow random swells and the odd spontaneous "woo"; call ~10x per second. */
  tick(t: number): void {
    if (!this.started) return;
    if (t >= this.nextSwell) {
      const base = this.level(this.x);
      for (const b of this.bed) b.gain.setTargetAtTime(base * rand(0.72, 1.3), t, rand(0.8, 2.0));
      this.nextSwell = t + rand(2.5, 6);
    }
    if (t >= this.nextSpont) {
      const rate = 0.02 + 0.1 * this.x;
      if (this.x > 0.15) this.cheer(rand(0.08, 0.25) * (0.5 + this.x));
      this.nextSpont = t + Math.min(40, -Math.log(1 - Math.random()) / rate);
    }
  }

  dispose(): void {
    const t = this.core.now();
    for (const h of this.cheers) this.kill(h, t);
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    for (const n of this.nodes) n.disconnect();
    this.out.disconnect();
  }
}
