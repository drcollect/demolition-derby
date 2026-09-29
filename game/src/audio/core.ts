/*
 * Shared audio core: the AudioContext, the bus structure, master limiter, arena reverb, listener state
 * and small helpers used by every sound family.
 *
 *   engines ─┐
 *   sfx ─────┤
 *   crowd ───┼─> mix ─> limiter (DynamicsCompressor) ─> soft clipper ─> volume ─> destination
 *   ui ──────┤
 *   reverb ──┘   (reverb is fed by per-voice sends into `reverbIn`)
 */
import * as THREE from 'three';
import { MOD_SR, type SampleSet } from './samples';

export type Vec3 = { x: number; y: number; z: number };
export type BufferKey = Exclude<keyof SampleSet, 'irL' | 'irR'>;
export type Buffers = Record<BufferKey, AudioBuffer[]>;

export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
export const rand = (a: number, b: number): number => a + (b - a) * Math.random();
export const chance = (p: number): boolean => Math.random() < p;
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length) % Math.max(1, arr.length)] as T;
}
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function finite3(v: Vec3 | null | undefined): v is Vec3 {
  return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
/** Distance low-pass (air absorption + "far away" dulling), Hz. */
export function airCutoff(d: number): number {
  return Math.min(22000, 22000 / (1 + Math.max(0, d) / 28));
}
/** Safe exponential approach; ignores NaN. */
export function glide(p: AudioParam, v: number, t: number, tau: number): void {
  if (Number.isFinite(v)) p.setTargetAtTime(v, t, Math.max(0.001, tau));
}

export interface CoreOptions {
  hrtf: boolean;
  bypassLimiter: boolean;
}

export class AudioCore {
  readonly ctx: BaseAudioContext;
  readonly offline: boolean;
  readonly sr: number;
  readonly engineBus: GainNode;
  readonly sfxBus: GainNode;
  readonly crowdBus: GainNode;
  readonly uiBus: GainNode;
  readonly reverbIn: GainNode;
  readonly mix: GainNode;
  readonly volume: GainNode;
  readonly limiter: DynamicsCompressorNode | null;
  private readonly convolver: ConvolverNode;
  private readonly reverbOut: GainNode;
  readonly hrtf: boolean;
  buf: Buffers | null = null;

  readonly lisPos = new THREE.Vector3();
  readonly lisFwd = new THREE.Vector3(0, 0, -1);
  readonly lisUp = new THREE.Vector3(0, 1, 0);
  readonly lisVel = new THREE.Vector3();
  /** Number of AudioBufferSourceNodes currently playing one-shots (for budgeting). */
  activeSources = 0;

  constructor(ctx: BaseAudioContext, opts: CoreOptions) {
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.sr = ctx.sampleRate;
    this.hrtf = opts.hrtf;
    const g = (v: number): GainNode => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    this.engineBus = g(0.58);
    this.sfxBus = g(0.9);
    this.crowdBus = g(0.62);
    this.uiBus = g(0.5);
    this.reverbIn = g(1);
    this.mix = g(1);
    this.volume = g(0.8);
    this.engineBus.connect(this.mix);
    this.sfxBus.connect(this.mix);
    this.crowdBus.connect(this.mix);
    this.uiBus.connect(this.mix);

    this.convolver = ctx.createConvolver();
    this.convolver.normalize = false;
    this.reverbOut = g(0.3);
    this.reverbIn.connect(this.convolver);
    this.convolver.connect(this.reverbOut);
    this.reverbOut.connect(this.mix);

    if (opts.bypassLimiter) {
      this.limiter = null;
      this.mix.connect(this.volume);
    } else {
      // Limiter-ish compressor. The spec adds automatic make-up gain ((1/fullRangeGain)^0.6, about
      // +3.2 dB with these settings), which the bus levels above already account for.
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -7;
      lim.knee.value = 5;
      lim.ratio.value = 12;
      lim.attack.value = 0.002;
      lim.release.value = 0.15;
      this.limiter = lim;
      // Soft clipper as a last line of defence: linear to 0.85, tanh knee to 1.0, headroom to 2.0 in.
      const pre = g(0.5);
      const shaper = ctx.createWaveShaper();
      const N = 2048;
      const curve = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const v = ((i / (N - 1)) * 2 - 1) * 2;
        const a = Math.abs(v);
        curve[i] = Math.sign(v) * (a < 0.85 ? a : 0.85 + 0.15 * Math.tanh((a - 0.85) / 0.15));
      }
      shaper.curve = curve;
      this.mix.connect(lim);
      lim.connect(pre);
      pre.connect(shaper);
      shaper.connect(this.volume);
    }
    this.volume.connect(ctx.destination);
  }

  setSamples(set: SampleSet): void {
    const ctx = this.ctx;
    const mk = (data: Float32Array, rate = this.sr): AudioBuffer => {
      const b = ctx.createBuffer(1, data.length, rate);
      b.getChannelData(0).set(data);
      return b;
    };
    const out: Partial<Buffers> = {};
    for (const key of Object.keys(set) as Array<keyof SampleSet>) {
      if (key === 'irL' || key === 'irR') continue;
      const arr = set[key] as Float32Array[];
      const rate = key === 'babble' || key === 'jitter' ? MOD_SR : this.sr;
      out[key] = arr.map((d) => mk(d, rate));
    }
    this.buf = out as Buffers;
    const ir = ctx.createBuffer(2, set.irL.length, this.sr);
    ir.getChannelData(0).set(set.irL);
    ir.getChannelData(1).set(set.irR);
    try {
      this.convolver.buffer = ir;
    } catch {
      /* ignore: some engines reject late buffer swaps */
    }
  }

  isRunning(): boolean {
    return this.offline || this.ctx.state === 'running';
  }

  now(): number {
    return this.ctx.currentTime;
  }

  panner(ref: number, rolloff = 1): PannerNode {
    const p = this.ctx.createPanner();
    p.panningModel = this.hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = 10000;
    p.rolloffFactor = rolloff;
    p.coneInnerAngle = 360;
    p.coneOuterAngle = 360;
    p.coneOuterGain = 1;
    return p;
  }

  setPos(p: PannerNode, v: Vec3): void {
    if (!finite3(v)) return;
    if (p.positionX) {
      p.positionX.value = v.x;
      p.positionY.value = v.y;
      p.positionZ.value = v.z;
    } else {
      (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(v.x, v.y, v.z);
    }
  }

  dist(v: Vec3): number {
    if (!finite3(v)) return 0;
    const dx = v.x - this.lisPos.x;
    const dy = v.y - this.lisPos.y;
    const dz = v.z - this.lisPos.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** One-shot buffer playback into `dest`; returns the end time. Tracks the active-source budget. */
  play(
    dest: AudioNode,
    buffer: AudioBuffer | undefined,
    when: number,
    gain: number,
    rate = 1,
    offset = 0,
    maxDur = 0,
    track?: Set<AudioBufferSourceNode>,
  ): number {
    if (!buffer || gain <= 0.0005) return when;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = clamp(rate, 0.1, 8);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(dest);
    const off = clamp(offset, 0, Math.max(0, buffer.duration - 0.01));
    let dur = (buffer.duration - off) / src.playbackRate.value;
    if (maxDur > 0 && maxDur < dur) {
      dur = maxDur;
      g.gain.setValueAtTime(gain, when + dur * 0.7);
      g.gain.linearRampToValueAtTime(0, when + dur);
      src.start(when, off, dur * src.playbackRate.value + 0.01);
    } else {
      src.start(when, off);
    }
    this.activeSources++;
    track?.add(src);
    src.onended = (): void => {
      this.activeSources = Math.max(0, this.activeSources - 1);
      track?.delete(src);
      src.disconnect();
      g.disconnect();
    };
    return when + dur;
  }

  dispose(): void {
    try {
      this.volume.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}
