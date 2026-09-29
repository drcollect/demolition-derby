/*
 * Engine voices: one AudioWorkletNode per car (ScriptProcessor fallback when AudioWorklet is missing,
 * e.g. plain-http LAN testing). The player's engine is stereo and non-positional; AI engines are mono
 * through a PannerNode with Doppler (applied to the firing rate) and air absorption (inside the DSP).
 *
 * Voice budget: the player plus the nearest `maxFull` AI cars run the full model; other audible AI cars
 * run the cheap "lite" model; stale, far or finished-dead voices are switched off (no DSP work).
 */
import * as THREE from 'three';
import { EngineDSP, type EngineProfileName } from './engine-dsp';
import { AudioCore, airCutoff, clamp, finite3 } from './core';

export interface EngineParams {
  rpm: number;
  throttle: number;
  load: number;
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  damage: number;
  dead: boolean;
}

const PARAM_NAMES = ['rpm', 'throttle', 'load', 'damage', 'dead', 'quality', 'pitch', 'air'] as const;
type ParamName = (typeof PARAM_NAMES)[number];
const PARAM_EPS: Record<ParamName, number> = { rpm: 0.5, throttle: 0.002, load: 0.002, damage: 0.002, dead: 0.5, quality: 0.5, pitch: 0.0005, air: 25 };

const AI_GAIN = 0.8;
const PLAYER_GAIN = 1.0;
const SPEED_OF_SOUND = 343;

let seedCounter = 1;

export class EngineVoiceImpl {
  readonly profile: EngineProfileName;
  readonly isPlayer: boolean;
  readonly seed: number;
  rpm = 800;
  throttle = 0;
  load = 0;
  damage = 0;
  dead = false;
  pitch = 1;
  air = 24000;
  quality = 2;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  hasPos = false;
  hasVel = false;
  lastUpdate = -1;
  deadSince = -1;
  dist = 0;
  disposed = false;
  worklet: AudioWorkletNode | null = null;
  script: ScriptProcessorNode | null = null;
  dsp: EngineDSP | null = null;
  panner: PannerNode | null = null;
  out: GainNode | null = null;
  send: GainNode | null = null;
  params: Partial<Record<ParamName, AudioParam>> = {};
  sent: Partial<Record<ParamName, number>> = {};
  private readonly mgr: EngineManager;

  constructor(mgr: EngineManager, profile: EngineProfileName, isPlayer: boolean) {
    this.mgr = mgr;
    this.profile = profile;
    this.isPlayer = isPlayer;
    this.seed = (Math.floor(Math.random() * 0x7fffffff) ^ (seedCounter++ * 2654435761)) | 0;
  }

  update(p: EngineParams): void {
    if (this.disposed || !p) return;
    try {
      this.mgr.onUpdate(this, p);
    } catch (e) {
      this.mgr.warn('engine update failed', e);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mgr.remove(this);
  }
}

export class EngineManager {
  readonly voices = new Set<EngineVoiceImpl>();
  core: AudioCore | null = null;
  workletOk = false;
  maxFull: number;
  dopplerScale = 1;
  private readonly wall: () => number;
  private lastPrio = -1;
  private readonly tmp = new THREE.Vector3();
  private warned = 0;

  constructor(wall: () => number, maxFull: number) {
    this.wall = wall;
    this.maxFull = maxFull;
  }

  warn(msg: string, e?: unknown): void {
    if (this.warned++ < 5) console.warn(`[audio] ${msg}`, e ?? '');
  }

  create(profile: EngineProfileName, isPlayer: boolean): EngineVoiceImpl {
    const v = new EngineVoiceImpl(this, profile, isPlayer);
    this.voices.add(v);
    return v;
  }

  attach(core: AudioCore, workletOk: boolean): void {
    this.core = core;
    this.workletOk = workletOk;
  }

  onUpdate(v: EngineVoiceImpl, p: EngineParams): void {
    const now = this.wall();
    const num = (x: unknown, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : d);
    v.rpm = clamp(num(p.rpm, v.rpm), 0, 12000);
    v.throttle = clamp(num(p.throttle, v.throttle), 0, 1);
    v.load = clamp(num(p.load, v.load), 0, 1);
    v.damage = clamp(num(p.damage, v.damage), 0, 1);
    const dead = !!p.dead;
    if (dead && !v.dead) v.deadSince = now;
    if (!dead) v.deadSince = -1;
    v.dead = dead;
    const dt = v.lastUpdate >= 0 ? now - v.lastUpdate : 0;
    if (finite3(p.position)) {
      if (v.hasPos) v.prevPos.copy(v.pos);
      v.pos.set(p.position.x, p.position.y, p.position.z);
      if (finite3(p.velocity)) {
        v.vel.set(p.velocity.x, p.velocity.y, p.velocity.z);
        v.hasVel = true;
      } else if (v.hasPos && dt > 0.004 && dt < 0.25) {
        // estimate velocity from successive positions when the game doesn't pass one
        this.tmp.subVectors(v.pos, v.prevPos).divideScalar(dt);
        v.vel.lerp(this.tmp, 0.3);
        v.hasVel = true;
      }
      v.hasPos = true;
    }
    const wasStale = v.lastUpdate < 0 || now - v.lastUpdate > 1.0;
    v.lastUpdate = now;
    const core = this.core;
    if (!core) return;
    v.dist = v.hasPos ? core.dist(v.pos) : 0;
    if (!v.worklet && !v.script) {
      this.prioritize(true);
      this.build(v);
    } else if (wasStale) {
      this.prioritize(true);
    }
    this.spatialize(v, core);
    this.push(v);
  }

  private build(v: EngineVoiceImpl): void {
    const core = this.core;
    if (!core || v.disposed) return;
    const ctx = core.ctx;
    const stereo = v.isPlayer;
    let src: AudioNode;
    try {
      if (this.workletOk) {
        const node = new AudioWorkletNode(ctx, 'derby-engine', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [stereo ? 2 : 1],
          processorOptions: { profile: v.profile, stereo, seed: v.seed },
          parameterData: { rpm: v.rpm, throttle: v.throttle, load: v.load, damage: v.damage, dead: v.dead ? 1 : 0, quality: v.quality, pitch: 1, air: 24000 },
        });
        node.onprocessorerror = (e): void => this.warn('engine processor error', e);
        for (const n of PARAM_NAMES) {
          const prm = node.parameters.get(n);
          if (prm) v.params[n] = prm;
        }
        v.worklet = node;
        src = node;
      } else {
        const dsp = new EngineDSP(ctx.sampleRate, v.profile, stereo, v.seed);
        const sp = ctx.createScriptProcessor(1024, 0, stereo ? 2 : 1);
        sp.onaudioprocess = (e: AudioProcessingEvent): void => {
          const ob = e.outputBuffer;
          const L = ob.getChannelData(0);
          const R = stereo && ob.numberOfChannels > 1 ? ob.getChannelData(1) : null;
          dsp.set(v.rpm, v.throttle, v.load, v.damage, v.dead, v.disposed ? 0 : v.quality, v.pitch, v.air);
          dsp.process(L, R, 0, L.length);
        };
        v.dsp = dsp;
        v.script = sp;
        src = sp;
      }
    } catch (e) {
      this.warn('could not create engine voice', e);
      return;
    }
    const out = ctx.createGain();
    out.gain.value = stereo ? PLAYER_GAIN : AI_GAIN;
    const send = ctx.createGain();
    send.gain.value = stereo ? 0.05 : 0.12;
    if (stereo) {
      src.connect(out);
    } else {
      const pan = core.panner(7);
      core.setPos(pan, v.pos);
      src.connect(pan);
      pan.connect(out);
      v.panner = pan;
    }
    out.connect(core.engineBus);
    src.connect(send);
    send.connect(core.reverbIn);
    v.out = out;
    v.send = send;
  }

  private spatialize(v: EngineVoiceImpl, core: AudioCore): void {
    const d = v.hasPos ? core.dist(v.pos) : 0;
    v.dist = d;
    const t = core.now();
    if (v.isPlayer) {
      // chase-cam distance is normally 5-8 m; only far camera modes pull the level down
      const g = PLAYER_GAIN * clamp(9 / Math.max(9, d), 0.35, 1);
      v.out?.gain.setTargetAtTime(g, t, 0.05);
      v.pitch = 1;
      v.air = 24000;
      return;
    }
    if (v.panner) core.setPos(v.panner, v.pos);
    v.air = airCutoff(d);
    v.send?.gain.setTargetAtTime(0.1 + 0.16 * Math.min(1, d / 50), t, 0.1);
    // Doppler on the firing rate: f' = f (c + v_listener->source) / (c - v_source->listener)
    let pitch = 1;
    if (v.hasVel && d > 0.5 && this.dopplerScale > 0) {
      const lp = core.lisPos;
      const nx = (lp.x - v.pos.x) / d;
      const ny = (lp.y - v.pos.y) / d;
      const nz = (lp.z - v.pos.z) / d;
      const vs = clamp(v.vel.x * nx + v.vel.y * ny + v.vel.z * nz, -120, 120) * this.dopplerScale;
      const lv = core.lisVel;
      const vl = clamp(-(lv.x * nx + lv.y * ny + lv.z * nz), -120, 120) * this.dopplerScale;
      pitch = clamp((SPEED_OF_SOUND + vl) / (SPEED_OF_SOUND - vs), 0.75, 1.3);
    }
    v.pitch = pitch;
  }

  private push(v: EngineVoiceImpl): void {
    if (!v.worklet) return;
    const vals: Record<ParamName, number> = {
      rpm: v.rpm, throttle: v.throttle, load: v.load, damage: v.damage, dead: v.dead ? 1 : 0,
      quality: v.disposed ? 0 : v.quality, pitch: v.pitch, air: v.air,
    };
    for (const n of PARAM_NAMES) {
      const prm = v.params[n];
      const val = vals[n];
      const last = v.sent[n];
      if (prm && (last === undefined || Math.abs(last - val) > PARAM_EPS[n])) {
        prm.value = val;
        v.sent[n] = val;
      }
    }
  }

  /** Assigns full / lite / off to every voice. Cheap; called ~10x per second and on voice changes. */
  prioritize(force = false): void {
    const now = this.wall();
    if (!force && now - this.lastPrio < 0.1) return;
    this.lastPrio = now;
    const ai: EngineVoiceImpl[] = [];
    for (const v of this.voices) {
      if (v.disposed) continue;
      const stale = v.lastUpdate < 0 || now - v.lastUpdate > 1.0;
      const finished = v.dead && v.deadSince >= 0 && now - v.deadSince > 2.2;
      let q = v.quality;
      if (stale) q = 0;
      else if (v.isPlayer) q = 2;
      else if (finished) q = 0; // DSP is silent by now; keep the slot free for live cars
      else ai.push(v);
      if (q !== v.quality) {
        v.quality = q;
        this.push(v);
      }
    }
    // nearest first, with hysteresis so voices don't flip at equal distances
    ai.sort((a, b) => a.dist * (a.quality === 2 ? 0.85 : 1) - b.dist * (b.quality === 2 ? 0.85 : 1));
    for (let i = 0; i < ai.length; i++) {
      const v = ai[i] as EngineVoiceImpl;
      const q = i < this.maxFull ? 2 : v.dist < 140 ? 1 : 0;
      if (q !== v.quality) {
        v.quality = q;
        this.push(v);
      }
    }
  }

  counts(): { full: number; lite: number; off: number; total: number } {
    let full = 0;
    let lite = 0;
    let off = 0;
    for (const v of this.voices) {
      if (v.disposed) continue;
      if (!v.worklet && !v.script) off++;
      else if (v.quality === 2) full++;
      else if (v.quality === 1) lite++;
      else off++;
    }
    return { full, lite, off, total: full + lite + off };
  }

  remove(v: EngineVoiceImpl): void {
    this.voices.delete(v);
    v.quality = 0;
    // tell the DSP to fade out and stop computing right away (covers the reverb send too)
    const q = v.params.quality;
    if (q) q.value = 0;
    const core = this.core;
    const nodes: AudioNode[] = [];
    if (v.worklet) nodes.push(v.worklet);
    if (v.script) nodes.push(v.script);
    if (v.panner) nodes.push(v.panner);
    if (v.out) nodes.push(v.out);
    if (v.send) nodes.push(v.send);
    const kill = (): void => {
      if (v.worklet) {
        try {
          v.worklet.port.postMessage({ type: 'dispose' });
        } catch {
          /* port closed */
        }
      }
      if (v.script) v.script.onaudioprocess = null;
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* already disconnected */
        }
      }
    };
    if (core && v.out && core.isRunning()) {
      const t = core.now();
      v.out.gain.setTargetAtTime(0, t, 0.03);
      v.send?.gain.setTargetAtTime(0, t, 0.03);
      setTimeout(kill, 200);
    } else {
      kill();
    }
  }

  dispose(): void {
    for (const v of [...this.voices]) v.dispose();
  }
}
