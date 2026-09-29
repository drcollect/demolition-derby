/*
 * Continuous per-car voices: metal scraping, tyre skids and horns. One voice per car id.
 *
 * Each call schedules "hold for 120 ms, then fade" on the voice gain, so a voice fades out by itself
 * on the audio thread when the calls stop (robust to main-thread hitches); housekeeping then stops its
 * sources and frees the nodes. Voice counts are capped; when full, a louder newcomer replaces the
 * quietest voice.
 */
import { AudioCore, type Vec3, clamp, finite3, pick, rand, smoothstep } from './core';

const MAX_SCRAPE = 6;
const MAX_SKID = 8;
const MAX_HORN = 6;

function holdFade(p: AudioParam, v: number, t: number, attack = 0.03, hold = 0.12, release = 0.06): void {
  p.cancelScheduledValues(t);
  p.setTargetAtTime(v, t, attack);
  p.setTargetAtTime(0, t + hold, release);
}

abstract class LoopVoice {
  readonly id: number;
  lastCall = 0;
  prio = 0;
  protected readonly core: AudioCore;
  protected readonly nodes: AudioNode[] = [];
  protected readonly sources: AudioScheduledSourceNode[] = [];
  protected readonly pan: PannerNode;
  protected readonly vol: GainNode;
  private stopped = false;

  constructor(core: AudioCore, id: number, ref: number, sendAmt: number) {
    this.core = core;
    this.id = id;
    const ctx = core.ctx;
    this.vol = ctx.createGain();
    this.vol.gain.value = 0;
    this.pan = core.panner(ref);
    const send = ctx.createGain();
    send.gain.value = sendAmt;
    this.vol.connect(this.pan);
    this.pan.connect(core.sfxBus);
    this.vol.connect(send);
    send.connect(core.reverbIn);
    this.nodes.push(this.vol, this.pan, send);
  }

  protected node<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  protected source<T extends AudioScheduledSourceNode>(n: T): T {
    this.sources.push(n);
    this.nodes.push(n);
    return n;
  }

  protected bq(type: BiquadFilterType, f: number, q: number): BiquadFilterNode {
    const b = this.core.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return this.node(b);
  }

  protected gain(v: number): GainNode {
    const g = this.core.ctx.createGain();
    g.gain.value = v;
    return this.node(g);
  }

  protected loopSrc(buf: AudioBuffer | undefined, rate = 1): AudioBufferSourceNode {
    const s = this.core.ctx.createBufferSource();
    if (buf) s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    return this.source(s);
  }

  protected startAll(): void {
    const t = this.core.now();
    for (const s of this.sources) {
      const b = s instanceof AudioBufferSourceNode && s.buffer ? s.buffer.duration : 0;
      if (s instanceof AudioBufferSourceNode) s.start(t, b > 0 ? Math.random() * b : 0);
      else s.start(t);
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.core.now();
    this.vol.gain.cancelScheduledValues(t);
    this.vol.gain.setTargetAtTime(0, t, 0.015);
    for (const s of this.sources) {
      try {
        s.stop(t + 0.1);
      } catch {
        /* never started / already stopped */
      }
    }
    const nodes = this.nodes;
    setTimeout(() => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* already disconnected */
        }
      }
    }, 250);
  }
}

class ScrapeVoice extends LoopVoice {
  private readonly bp1: BiquadFilterNode;
  private readonly bp2: BiquadFilterNode;
  private readonly g1: GainNode;
  private readonly g2: GainNode;
  private readonly g4: GainNode;
  private readonly g5: GainNode;
  private readonly jit: AudioBufferSourceNode;
  private readonly base: number;
  private wob = 0;

  constructor(core: AudioCore, id: number) {
    super(core, id, 8, 0.2);
    const B = core.buf;
    this.base = rand(1500, 2600);
    const src = this.loopSrc(B ? pick(B.white) : undefined, rand(0.9, 1.1));
    // screech: two resonant squeals of the panel being dragged
    this.bp1 = this.bq('bandpass', this.base, 9);
    this.bp2 = this.bq('bandpass', this.base * 1.71, 12);
    this.g1 = this.gain(0);
    this.g2 = this.gain(0);
    // grind body, low rubbing rumble, spark sizzle
    const bpLow = this.bq('bandpass', rand(380, 650), 1.2);
    const g3 = this.gain(1.4);
    const lpR = this.bq('lowpass', 160, -3);
    this.g4 = this.gain(0);
    const hpS = this.bq('highpass', 5500, -3);
    this.g5 = this.gain(0);
    // stick-slip amplitude modulation
    const am = this.gain(0.45);
    this.jit = this.loopSrc(B ? pick(B.jitter) : undefined, 1);
    const jd = this.gain(0.55);
    this.jit.connect(jd);
    jd.connect(am.gain);
    src.connect(this.bp1);
    this.bp1.connect(this.g1);
    src.connect(this.bp2);
    this.bp2.connect(this.g2);
    src.connect(bpLow);
    bpLow.connect(g3);
    src.connect(lpR);
    lpR.connect(this.g4);
    src.connect(hpS);
    hpS.connect(this.g5);
    for (const g of [this.g1, this.g2, g3, this.g4, this.g5]) g.connect(am);
    am.connect(this.vol);
    this.startAll();
  }

  set(pos: Vec3, intensity: number, t: number): void {
    const i = clamp(intensity, 0, 1);
    this.core.setPos(this.pan, pos);
    holdFade(this.vol.gain, 0.55 * Math.pow(i, 0.8), t);
    this.wob = this.wob * 0.9 + (Math.random() - 0.5) * 0.3;
    const f1 = this.base * (0.8 + 0.5 * i) * (1 + 0.12 * this.wob);
    this.bp1.frequency.setTargetAtTime(f1, t, 0.05);
    this.bp2.frequency.setTargetAtTime(f1 * 1.71, t, 0.05);
    this.g1.gain.setTargetAtTime(4 * Math.pow(i, 1.2), t, 0.05);
    this.g2.gain.setTargetAtTime(2.5 * Math.pow(i, 1.4), t, 0.05);
    this.g4.gain.setTargetAtTime(3 * (1 - 0.5 * i), t, 0.05);
    this.g5.gain.setTargetAtTime(0.18 * i * i, t, 0.05);
    this.jit.playbackRate.setTargetAtTime(0.6 + 0.9 * i, t, 0.1);
  }
}

class SkidVoice extends LoopVoice {
  private readonly bpA: BiquadFilterNode;
  private readonly bpB: BiquadFilterNode;
  private readonly bpC: BiquadFilterNode;
  private readonly dA: GainNode;
  private readonly dB: GainNode;
  private readonly dC: GainNode;
  private readonly sq: GainNode;
  private readonly dirt: GainNode;
  private readonly lfo: OscillatorNode;
  private readonly f0: number;

  constructor(core: AudioCore, id: number) {
    super(core, id, 8, 0.15);
    const B = core.buf;
    this.f0 = rand(720, 980);
    const src = this.loopSrc(B ? pick(B.white) : undefined, rand(0.95, 1.05));
    // squeal: narrow noise bands at f0, 2f0, 3f0 wobbling with a slow LFO
    this.bpA = this.bq('bandpass', this.f0, 28);
    this.bpB = this.bq('bandpass', this.f0 * 2, 30);
    this.bpC = this.bq('bandpass', this.f0 * 3, 30);
    const gA = this.gain(28);
    const gB = this.gain(13);
    const gC = this.gain(6);
    this.lfo = this.core.ctx.createOscillator();
    this.lfo.frequency.value = rand(5, 9);
    this.source(this.lfo);
    this.dA = this.gain(this.f0 * 0.025);
    this.dB = this.gain(this.f0 * 0.05);
    this.dC = this.gain(this.f0 * 0.075);
    this.lfo.connect(this.dA);
    this.dA.connect(this.bpA.frequency);
    this.lfo.connect(this.dB);
    this.dB.connect(this.bpB.frequency);
    this.lfo.connect(this.dC);
    this.dC.connect(this.bpC.frequency);
    const amS = this.gain(0.5);
    const jit = this.loopSrc(B ? pick(B.jitter) : undefined, rand(0.8, 1.2));
    const jd = this.gain(0.5);
    jit.connect(jd);
    jd.connect(amS.gain);
    this.sq = this.gain(0);
    src.connect(this.bpA);
    this.bpA.connect(gA);
    src.connect(this.bpB);
    this.bpB.connect(gB);
    src.connect(this.bpC);
    this.bpC.connect(gC);
    gA.connect(amS);
    gB.connect(amS);
    gC.connect(amS);
    amS.connect(this.sq);
    this.sq.connect(this.vol);
    // dirt scrub with gravel chatter
    const lpD = this.bq('lowpass', 1100, -3);
    const bpD = this.bq('bandpass', 2500, 0.9);
    const gD1 = this.gain(1.2);
    const gD2 = this.gain(0.4);
    const amD = this.gain(0.4);
    const jit2 = this.loopSrc(B ? (B.jitter[1] ?? pick(B.jitter)) : undefined, rand(1.2, 1.8));
    const jd2 = this.gain(0.6);
    jit2.connect(jd2);
    jd2.connect(amD.gain);
    this.dirt = this.gain(0);
    src.connect(lpD);
    lpD.connect(gD1);
    src.connect(bpD);
    bpD.connect(gD2);
    gD1.connect(amD);
    gD2.connect(amD);
    amD.connect(this.dirt);
    this.dirt.connect(this.vol);
    this.startAll();
  }

  set(pos: Vec3, intensity: number, surface: number, t: number): void {
    const i = clamp(intensity, 0, 1);
    const hard = clamp(surface, 0, 1);
    this.core.setPos(this.pan, pos);
    holdFade(this.vol.gain, 0.5 * Math.pow(i, 0.8), t);
    const f = this.f0 * (0.93 + 0.14 * i);
    this.bpA.frequency.setTargetAtTime(f, t, 0.08);
    this.bpB.frequency.setTargetAtTime(f * 2, t, 0.08);
    this.bpC.frequency.setTargetAtTime(f * 3, t, 0.08);
    this.sq.gain.setTargetAtTime(0.35 * (0.2 + 0.8 * hard) * smoothstep(0.12, 0.55, i), t, 0.05);
    this.dirt.gain.setTargetAtTime((1 - 0.65 * hard) * (0.3 + 0.7 * i), t, 0.05);
  }
}

class HornVoice extends LoopVoice {
  private readonly env: GainNode;
  on = false;
  offAt = 0;

  constructor(core: AudioCore, id: number) {
    super(core, id, 10, 0.25);
    const ctx = core.ctx;
    const k = rand(0.88, 1.12);
    const o1 = this.source(ctx.createOscillator());
    const o2 = this.source(ctx.createOscillator());
    o1.type = 'sawtooth';
    o2.type = 'sawtooth';
    o1.frequency.value = 349 * k;
    o2.frequency.value = 440 * k * rand(0.995, 1.005);
    const mix = this.gain(0.5);
    const shaper = this.node(ctx.createWaveShaper());
    const N = 1024;
    const curve = new Float32Array(N);
    for (let i = 0; i < N; i++) curve[i] = Math.tanh(((i / (N - 1)) * 2 - 1) * 2.5) / Math.tanh(2.5);
    shaper.curve = curve;
    const bp = this.bq('bandpass', 1700 * k, 0.9);
    const hp = this.bq('highpass', 320, -3);
    this.env = this.gain(0);
    o1.connect(mix);
    o2.connect(mix);
    mix.connect(shaper);
    shaper.connect(bp);
    bp.connect(hp);
    hp.connect(this.env);
    this.env.connect(this.vol);
    this.vol.gain.value = 1;
    this.startAll();
  }

  set(pos: Vec3, on: boolean, t: number): void {
    this.core.setPos(this.pan, pos);
    this.switch(on, t);
  }

  switch(on: boolean, t: number): void {
    if (on === this.on) return;
    this.env.gain.cancelScheduledValues(t);
    this.env.gain.setTargetAtTime(on ? 0.55 : 0, t, on ? 0.012 : 0.035);
    this.on = on;
    if (!on) this.offAt = t;
  }
}

export class Loops {
  private readonly core: AudioCore;
  private readonly scrapes = new Map<number, ScrapeVoice>();
  private readonly skids = new Map<number, SkidVoice>();
  private readonly horns = new Map<number, HornVoice>();

  constructor(core: AudioCore) {
    this.core = core;
  }

  private weight(pos: Vec3, ref: number): number {
    const d = this.core.dist(pos);
    return ref / (ref + Math.max(0, d - ref));
  }

  private claim<V extends LoopVoice>(map: Map<number, V>, id: number, prio: number, max: number, make: () => V): V | null {
    let v = map.get(id);
    if (!v) {
      if (prio <= 0.002) return null;
      if (map.size >= max) {
        let weakest: V | null = null;
        for (const w of map.values()) if (!weakest || w.prio < weakest.prio) weakest = w;
        if (!weakest || weakest.prio >= prio) return null;
        weakest.stop();
        map.delete(weakest.id);
      }
      v = make();
      map.set(id, v);
    }
    v.prio = prio;
    return v;
  }

  private ok(pos: Vec3): boolean {
    return !!this.core.buf && this.core.isRunning() && finite3(pos);
  }

  scrape(id: number, pos: Vec3, intensity: number): void {
    if (!this.ok(pos)) return;
    const i = clamp(Number.isFinite(intensity) ? intensity : 0, 0, 1);
    const v = this.claim(this.scrapes, id | 0, i * this.weight(pos, 8), MAX_SCRAPE, () => new ScrapeVoice(this.core, id | 0));
    if (!v) return;
    const t = this.core.now();
    v.lastCall = t;
    v.set(pos, i, t);
  }

  skid(id: number, pos: Vec3, intensity: number, surface: number): void {
    if (!this.ok(pos)) return;
    const i = clamp(Number.isFinite(intensity) ? intensity : 0, 0, 1);
    const v = this.claim(this.skids, id | 0, i * this.weight(pos, 8), MAX_SKID, () => new SkidVoice(this.core, id | 0));
    if (!v) return;
    const t = this.core.now();
    v.lastCall = t;
    v.set(pos, i, Number.isFinite(surface) ? surface : 0.5, t);
  }

  horn(id: number, pos: Vec3, on: boolean): void {
    if (!this.ok(pos)) return;
    const t = this.core.now();
    let v: HornVoice | null | undefined = this.horns.get(id | 0);
    if (!v && on) v = this.claim(this.horns, id | 0, this.weight(pos, 10), MAX_HORN, () => new HornVoice(this.core, id | 0));
    if (!v) return;
    v.lastCall = t;
    v.set(pos, on, t);
  }

  /** Frees faded voices; releases horns that were left on without refresh for 4 s. */
  tick(t: number): void {
    for (const map of [this.scrapes, this.skids] as Array<Map<number, LoopVoice>>) {
      for (const [id, v] of map) {
        v.prio *= 0.7;
        if (t - v.lastCall > 0.7) {
          v.stop();
          map.delete(id);
        }
      }
    }
    for (const [id, v] of this.horns) {
      if (v.on && t - v.lastCall > 4) v.switch(false, t);
      if (!v.on && t - v.offAt > 0.6) {
        v.stop();
        this.horns.delete(id);
      }
    }
  }

  count(): number {
    return this.scrapes.size + this.skids.size + this.horns.size;
  }

  dispose(): void {
    for (const map of [this.scrapes, this.skids, this.horns] as Array<Map<number, LoopVoice>>) {
      for (const v of map.values()) v.stop();
      map.clear();
    }
  }
}
