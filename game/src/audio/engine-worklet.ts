/*
 * AudioWorklet processor for the engine voices. Loaded by audio.ts through a Vite `?worker&url` import,
 * which bundles this file (and engine-dsp.ts) into a standalone JS file in production builds and serves
 * it as a transformed ES module in dev.
 *
 * Parameters are k-rate AudioParams written from the main thread once per game frame; all smoothing
 * happens inside EngineDSP.
 */
import { EngineDSP } from './engine-dsp';

// AudioWorkletGlobalScope globals (not part of TypeScript's DOM lib).
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(name: string, ctor: unknown): void;

interface EngineProcessorOptions {
  processorOptions?: { profile?: string; stereo?: boolean; seed?: number };
}

const PARAMS = [
  { name: 'rpm', defaultValue: 800, minValue: 0, maxValue: 12000, automationRate: 'k-rate' },
  { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
  { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
  { name: 'damage', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
  { name: 'dead', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
  // 0 = off (silent, no CPU), 1 = lite, 2 = full
  { name: 'quality', defaultValue: 2, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
  // Doppler factor applied to the firing rate
  { name: 'pitch', defaultValue: 1, minValue: 0.5, maxValue: 2, automationRate: 'k-rate' },
  // air-absorption low-pass cutoff (Hz); >= 20000 bypasses it
  { name: 'air', defaultValue: 24000, minValue: 200, maxValue: 24000, automationRate: 'k-rate' },
] as const;

/** First value of a k-rate parameter (no per-quantum allocations on the audio thread). */
function pv(p: Record<string, Float32Array>, name: string, d: number): number {
  const a = p[name];
  return a && a.length > 0 ? (a[0] as number) : d;
}

class DerbyEngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(): typeof PARAMS {
    return PARAMS;
  }

  private readonly dsp: EngineDSP;
  private alive = true;

  constructor(options: EngineProcessorOptions) {
    super(options);
    const o = options.processorOptions ?? {};
    this.dsp = new EngineDSP(sampleRate, o.profile ?? 'v8big', !!o.stereo, o.seed ?? 1);
    this.port.onmessage = (e: MessageEvent): void => {
      const d = e.data as { type?: string } | null;
      if (d && d.type === 'dispose') this.alive = false;
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], p: Record<string, Float32Array>): boolean {
    if (!this.alive) return false;
    const out = outputs[0];
    const l = out?.[0];
    if (!l) return true;
    const r = out.length > 1 ? (out[1] ?? null) : null;
    this.dsp.set(pv(p, 'rpm', 800), pv(p, 'throttle', 0), pv(p, 'load', 0), pv(p, 'damage', 0), pv(p, 'dead', 0) > 0.5, pv(p, 'quality', 2), pv(p, 'pitch', 1), pv(p, 'air', 24000));
    this.dsp.process(l, r, 0, l.length);
    return true;
  }
}

registerProcessor('derby-engine', DerbyEngineProcessor);
