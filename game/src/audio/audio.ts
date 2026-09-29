/*
 * Demolition Derby — procedural sound (Web Audio only: no files, no network, no packages).
 *
 *   const audio = new DerbyAudio();
 *   window.addEventListener('pointerdown', () => audio.init(), { once: true });   // user gesture
 *   const eng = audio.createEngine('v8muscle', true);                            // any time, even pre-init
 *   // every frame:
 *   audio.setListener(camera.position, camFwd, camera.up);
 *   eng.update({ rpm, throttle, load, position, velocity, damage, dead });
 *   // events: audio.impact(p, 0.7, 'car'); audio.glass(p, 0.8); audio.scrape(id, p, 0.6); ...
 *
 * Every method is a silent no-op before init() has finished (engine handles created early start
 * sounding on their first update after init). Nothing here throws.
 *
 * Files: engine-dsp.ts (engine model), engine-worklet.ts (AudioWorklet wrapper), engines.ts (voice
 * manager), sfx.ts (impacts/glass/parts/wreck), loops.ts (scrape/skid/horn), crowd.ts, ui-sfx.ts,
 * samples.ts (procedural buffers), core.ts (buses, limiter, reverb, helpers).
 */
import * as THREE from 'three';
import engineWorkletUrl from './engine-worklet.ts?worker&url';
import { AudioCore, clamp, finite3 } from './core';
import { EngineManager } from './engines';
import { Sfx } from './sfx';
import { Loops } from './loops';
import { Crowd } from './crowd';
import { UiSfx } from './ui-sfx';
import { sampleJobs, type SampleSet } from './samples';

export type EngineProfile = 'v8big' | 'v8wagon' | 'v8muscle' | 'i4' | 'v8truck';
export type ImpactKind = 'car' | 'wall' | 'ground' | 'debris';
export type UiSound = 'countdown' | 'go' | 'select' | 'back' | 'points' | 'wreck' | 'lose' | 'win';

export interface EngineVoice {
  update(p: {
    rpm: number;
    throttle: number;
    load: number;
    position: THREE.Vector3;
    velocity?: THREE.Vector3;
    /** 0..1: rough idle, misfires, knocking, rattles as it rises */
    damage: number;
    /** engine died: short sputter-out, then silence (back to false restarts it with a crank) */
    dead: boolean;
  }): void;
  dispose(): void;
}

export interface DerbyAudioOptions {
  /** Render into this context instead of creating an AudioContext (e.g. an OfflineAudioContext). */
  context?: BaseAudioContext;
  /** HRTF panning for positional sounds (default false: equal-power, cheaper). */
  hrtf?: boolean;
  /** AI engines rendered with the full model, nearest first (default 6; the player is always full). */
  maxFullEngines?: number;
  /** Suspend the AudioContext while the tab is hidden (default true). */
  pauseWhenHidden?: boolean;
  /** Crowd gasps/cheers by itself on very big impacts (default true). */
  crowdReactsToImpacts?: boolean;
  /** Run the ambient crowd bed (default true; cheers still work when false). */
  crowdBed?: boolean;
  /** 0 disables Doppler on AI engines, 1 = physical (default). */
  dopplerScale?: number;
  /** Measurement only: skip the master limiter. */
  bypassLimiter?: boolean;
}

export interface DerbyAudioStats {
  state: string;
  sampleRate: number;
  worklet: boolean;
  engines: { full: number; lite: number; off: number; total: number };
  oneShotSlotsBusy: number;
  loops: number;
  sources: number;
  limiterReductionDb: number;
}

const sampleCache = new Map<number, Promise<SampleSet>>();

function yieldToMain(): Promise<void> {
  const sch = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sch && typeof sch.yield === 'function') return sch.yield();
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = (): void => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(0);
  });
}

/** Generates all procedural buffers, yielding to the main thread every ~6 ms. Cached per rate. */
function getSamples(sr: number): Promise<SampleSet> {
  let p = sampleCache.get(sr);
  if (!p) {
    p = (async (): Promise<SampleSet> => {
      const out: Partial<SampleSet> = {};
      let last = performance.now();
      for (const job of sampleJobs(sr)) {
        job(out);
        if (performance.now() - last > 6) {
          await yieldToMain();
          last = performance.now();
        }
      }
      return out as SampleSet;
    })();
    p.catch(() => sampleCache.delete(sr));
    sampleCache.set(sr, p);
  }
  return p;
}

export class DerbyAudio {
  private core: AudioCore | null = null;
  private readonly engines: EngineManager;
  private sfx: Sfx | null = null;
  private loops: Loops | null = null;
  private crowdImpl: Crowd | null = null;
  private uiImpl: UiSfx | null = null;
  private readonly opts: Required<Omit<DerbyAudioOptions, 'context'>> & { context?: BaseAudioContext };
  private _ready = false;
  private initP: Promise<void> | null = null;
  private disposed = false;
  private workletOk = false;
  private vol = 0.8;
  private muted = false;
  private excitement = 0.25;
  private hiddenSuspended = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = -1;
  private lastBigHitReact = -10;
  private readonly lis = { t: -1, pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), set: false };
  private readonly tmp = new THREE.Vector3();
  private readonly cleanup: Array<() => void> = [];
  private warnings = 0;

  /** Ambient crowd bed + cheers/roars. */
  readonly crowd = {
    /** 0..1: level and brightness of the crowd bed (and how often it cheers by itself). */
    setExcitement: (x: number): void => {
      if (!Number.isFinite(x)) return;
      this.excitement = clamp(x, 0, 1);
      this.guard(() => this.crowdImpl?.setExcitement(this.excitement));
    },
    /** A swelling roar; 0.1 = a few "woo"s, 1 = the whole stadium. */
    cheer: (strength: number): void => {
      this.guard(() => this.crowdImpl?.cheer(strength));
    },
  };

  constructor(opts: DerbyAudioOptions = {}) {
    this.opts = {
      context: opts.context,
      hrtf: opts.hrtf ?? false,
      maxFullEngines: opts.maxFullEngines ?? 6,
      pauseWhenHidden: opts.pauseWhenHidden ?? true,
      crowdReactsToImpacts: opts.crowdReactsToImpacts ?? true,
      crowdBed: opts.crowdBed ?? true,
      dopplerScale: opts.dopplerScale ?? 1,
      bypassLimiter: opts.bypassLimiter ?? false,
    };
    this.engines = new EngineManager(() => this.wall(), this.opts.maxFullEngines);
    this.engines.dopplerScale = this.opts.dopplerScale;
  }

  get ready(): boolean {
    return this._ready;
  }

  /** The underlying context (null before init). */
  get context(): BaseAudioContext | null {
    return this.core?.ctx ?? null;
  }

  /** Call from the first user gesture. Creates and resumes the AudioContext; safe to call repeatedly. */
  init(): Promise<void> {
    if (!this.initP) {
      this.initP = this.doInit().catch((e: unknown) => {
        this.warn('init failed', e);
      });
    }
    return this.initP;
  }

  private async doInit(): Promise<void> {
    if (this.disposed) return;
    let ctx: BaseAudioContext;
    if (this.opts.context) {
      ctx = this.opts.context;
    } else {
      const W = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctor = W.AudioContext ?? W.webkitAudioContext;
      if (!Ctor) {
        this.warn('Web Audio is not available');
        return;
      }
      ctx = new Ctor({ latencyHint: 'interactive' });
    }
    const core = new AudioCore(ctx, { hrtf: this.opts.hrtf, bypassLimiter: this.opts.bypassLimiter });
    this.core = core;
    core.volume.gain.value = this.muted ? 0 : this.vol;
    let resumeP: Promise<unknown> = Promise.resolve();
    if (!core.offline) {
      // must happen synchronously inside the user gesture (iOS / Safari)
      const ac = ctx as AudioContext;
      if (ac.state !== 'running') resumeP = ac.resume().catch(() => undefined);
      try {
        const b = ac.createBuffer(1, 1, ac.sampleRate);
        const s = ac.createBufferSource();
        s.buffer = b;
        s.connect(ac.destination);
        s.start(0);
      } catch {
        /* unlock is best effort */
      }
    }
    if (this.lis.set) this.applyListener();

    // engine worklet (Vite bundles engine-worklet.ts + engine-dsp.ts into its own file)
    const aw = (ctx as { audioWorklet?: AudioWorklet }).audioWorklet;
    if (aw && typeof AudioWorkletNode !== 'undefined') {
      try {
        await aw.addModule(engineWorkletUrl);
        this.workletOk = true;
      } catch (e) {
        this.warn('engine worklet failed to load; using the ScriptProcessor fallback', e);
      }
    }
    if (this.disposed) return;

    const set = await getSamples(ctx.sampleRate);
    if (this.disposed) return;
    core.setSamples(set);

    const crowd = new Crowd(core);
    this.crowdImpl = crowd;
    this.sfx = new Sfx(core);
    this.loops = new Loops(core);
    this.uiImpl = new UiSfx(core, crowd);
    this.sfx.onWreck = (when): void => crowd.cheer(1, when + 0.1);
    this.sfx.onBigHit = (s, when): void => {
      if (!this.opts.crowdReactsToImpacts) return;
      if (when - this.lastBigHitReact < 2.5) return;
      this.lastBigHitReact = when;
      crowd.cheer(0.25 + 0.35 * s, when + 0.25);
    };
    this.engines.attach(core, this.workletOk);
    crowd.setExcitement(this.excitement);
    if (this.opts.crowdBed) crowd.start();

    if (!core.offline) {
      await Promise.race([resumeP, new Promise((r) => setTimeout(r, 2000))]);
      if (this.disposed) return;
      this.installLifecycle(ctx as AudioContext);
      this.timer = setInterval(() => this.tick(), 100);
    }
    this._ready = true;
  }

  private installLifecycle(ac: AudioContext): void {
    if (typeof document === 'undefined') return;
    const onVis = (): void => {
      if (this.disposed) return;
      if (document.hidden) {
        if (this.opts.pauseWhenHidden && ac.state === 'running') {
          this.hiddenSuspended = true;
          ac.suspend().catch(() => undefined);
        }
      } else if (this.hiddenSuspended) {
        this.hiddenSuspended = false;
        ac.resume().catch(() => undefined);
      }
    };
    // if the browser suspended/interrupted us while visible, the next gesture brings it back
    const onGesture = (): void => {
      if (this.disposed || document.hidden) return;
      if (ac.state !== 'running' && ac.state !== 'closed') ac.resume().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVis);
    const evs = ['pointerdown', 'keydown', 'touchend'];
    for (const ev of evs) window.addEventListener(ev, onGesture, true);
    this.cleanup.push(() => {
      document.removeEventListener('visibilitychange', onVis);
      for (const ev of evs) window.removeEventListener(ev, onGesture, true);
    });
    if (document.hidden) onVis();
  }

  private wall(): number {
    const core = this.core;
    return core && core.offline ? core.now() : performance.now() / 1000;
  }

  private warn(msg: string, e?: unknown): void {
    if (this.warnings++ < 8) console.warn(`[audio] ${msg}`, e ?? '');
  }

  private guard(fn: () => void): void {
    if (this.disposed) return;
    try {
      fn();
    } catch (e) {
      this.warn('call failed', e);
    }
  }

  /** Housekeeping: voice priorities, releasing finished loops, crowd swells. ~10 Hz. */
  tick(): void {
    this.guard(() => {
      const core = this.core;
      if (!core || !this._ready) return;
      const t = core.now();
      if (t - this.lastTick < 0.05) return;
      this.lastTick = t;
      this.engines.prioritize();
      this.loops?.tick(t);
      this.crowdImpl?.tick(t);
    });
  }

  setMasterVolume(v: number): void {
    if (!Number.isFinite(v)) return;
    this.vol = clamp(v, 0, 1);
    this.applyVolume();
  }

  setMuted(m: boolean): void {
    this.muted = !!m;
    this.applyVolume();
  }

  private applyVolume(): void {
    this.guard(() => {
      const core = this.core;
      if (!core) return;
      core.volume.gain.setTargetAtTime(this.muted ? 0 : this.vol, core.now(), 0.03);
    });
  }

  setListener(position: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3): void {
    this.guard(() => {
      if (!finite3(position)) return;
      const now = this.wall();
      const L = this.lis;
      const core = this.core;
      if (core && L.t >= 0) {
        const dt = now - L.t;
        if (dt > 0.004 && dt < 0.25) {
          this.tmp.subVectors(position, L.pos).divideScalar(dt);
          core.lisVel.lerp(this.tmp, 0.25);
        } else if (dt >= 0.25) {
          core.lisVel.set(0, 0, 0);
        }
      }
      L.t = now;
      L.pos.set(position.x, position.y, position.z);
      if (finite3(forward) && forward.lengthSq() > 1e-10) L.fwd.set(forward.x, forward.y, forward.z).normalize();
      if (finite3(up) && up.lengthSq() > 1e-10) L.up.set(up.x, up.y, up.z).normalize();
      L.set = true;
      if (core) {
        this.applyListener();
        if (core.offline) this.tick();
      }
    });
  }

  private applyListener(): void {
    const core = this.core;
    if (!core) return;
    const L = this.lis;
    core.lisPos.copy(L.pos);
    core.lisFwd.copy(L.fwd);
    core.lisUp.copy(L.up);
    const l = core.ctx.listener;
    if (l.positionX) {
      l.positionX.value = L.pos.x;
      l.positionY.value = L.pos.y;
      l.positionZ.value = L.pos.z;
      l.forwardX.value = L.fwd.x;
      l.forwardY.value = L.fwd.y;
      l.forwardZ.value = L.fwd.z;
      l.upX.value = L.up.x;
      l.upY.value = L.up.y;
      l.upZ.value = L.up.z;
    } else {
      l.setPosition(L.pos.x, L.pos.y, L.pos.z);
      l.setOrientation(L.fwd.x, L.fwd.y, L.fwd.z, L.up.x, L.up.y, L.up.z);
    }
  }

  createEngine(profile: EngineProfile, isPlayer: boolean): EngineVoice {
    if (this.disposed) return { update: (): void => undefined, dispose: (): void => undefined };
    const p: EngineProfile = ['v8big', 'v8wagon', 'v8muscle', 'i4', 'v8truck'].includes(profile) ? profile : 'v8big';
    return this.engines.create(p, !!isPlayer);
  }

  impact(position: THREE.Vector3, strength: number, kind: ImpactKind): void {
    this.guard(() => {
      if (this._ready) this.sfx?.impact(position, strength, kind);
    });
  }

  glass(position: THREE.Vector3, strength: number): void {
    this.guard(() => {
      if (this._ready) this.sfx?.glass(position, strength);
    });
  }

  /** Metal-on-metal / wall grinding. Call every frame while it happens; fades out when calls stop. */
  scrape(id: number, position: THREE.Vector3, intensity: number): void {
    this.guard(() => {
      if (this._ready) this.loops?.scrape(id, position, intensity);
    });
  }

  /** Tyre squeal/scrub; `surface` 0 = dirt (scrub), 1 = concrete (squeal), default 0.5. */
  skid(id: number, position: THREE.Vector3, intensity: number, surface = 0.5): void {
    this.guard(() => {
      if (this._ready) this.loops?.skid(id, position, intensity, surface);
    });
  }

  partOff(position: THREE.Vector3): void {
    this.guard(() => {
      if (this._ready) this.sfx?.partOff(position);
    });
  }

  wreck(position: THREE.Vector3): void {
    this.guard(() => {
      if (this._ready) this.sfx?.wreck(position);
    });
  }

  /** Call each frame while held (keeps the position current); auto-releases 4 s after the last call. */
  horn(id: number, position: THREE.Vector3, on: boolean): void {
    this.guard(() => {
      if (this._ready) this.loops?.horn(id, position, !!on);
    });
  }

  ui(kind: UiSound): void {
    this.guard(() => {
      if (this._ready) this.uiImpl?.play(kind);
    });
  }

  stats(): DerbyAudioStats {
    const core = this.core;
    return {
      state: core ? (core.offline ? 'offline' : core.ctx.state) : 'uninitialised',
      sampleRate: core ? core.sr : 0,
      worklet: this.workletOk,
      engines: this.engines.counts(),
      oneShotSlotsBusy: this.sfx ? this.sfx.busySlots() : 0,
      loops: this.loops ? this.loops.count() : 0,
      sources: core ? core.activeSources : 0,
      limiterReductionDb: core && core.limiter ? core.limiter.reduction : 0,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this._ready = false;
    try {
      if (this.timer !== null) clearInterval(this.timer);
      for (const c of this.cleanup) c();
      this.engines.dispose();
      this.loops?.dispose();
      this.crowdImpl?.dispose();
      const core = this.core;
      if (core) {
        core.dispose();
        if (!core.offline) (core.ctx as AudioContext).close().catch(() => undefined);
      }
    } catch (e) {
      this.warn('dispose failed', e);
    }
  }

  /**
   * Test helper: renders `seconds` of audio offline. `frame` runs at `fps` (default 60) on the audio
   * timeline, so a script can drive engines and trigger events exactly as the game loop would.
   */
  static async renderOffline(o: {
    seconds: number;
    sampleRate?: number;
    fps?: number;
    options?: DerbyAudioOptions;
    setup?: (a: DerbyAudio) => void;
    frame?: (a: DerbyAudio, t: number) => void;
  }): Promise<AudioBuffer> {
    const sr = o.sampleRate ?? 48000;
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(o.seconds * sr), sampleRate: sr });
    const a = new DerbyAudio({ ...o.options, context: ctx, pauseWhenHidden: false });
    await a.init();
    a.setListener(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0));
    o.setup?.(a);
    const fps = o.fps ?? 60;
    const quantum = 128 / sr;
    let lastQ = -1;
    for (let i = 1; i < o.seconds * fps; i++) {
      const t = i / fps;
      const q = Math.floor(t / quantum);
      if (q === lastQ) continue;
      lastQ = q;
      ctx
        .suspend(q * quantum)
        .then(() => {
          try {
            o.frame?.(a, t);
            a.tick();
          } finally {
            void ctx.resume();
          }
        })
        .catch(() => undefined);
    }
    const buf = await ctx.startRendering();
    a.dispose();
    return buf;
  }
}
