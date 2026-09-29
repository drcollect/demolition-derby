/*
 * Non-positional UI / announcer sounds: stadium PA beeps, an air horn for "go", arcade-ish chimes for
 * points, a heavy stinger for a wreck, and short lose/win cues. All synthesised with oscillators.
 */
import { AudioCore, pick } from './core';
import type { Crowd } from './crowd';

export type UiKind = 'countdown' | 'go' | 'select' | 'back' | 'points' | 'wreck' | 'lose' | 'win';

interface NoteOpts {
  attack?: number;
  release?: number;
  lp?: number;
  glideTo?: number;
  glideTime?: number;
  vibrato?: number;
  vibratoDepth?: number;
  send?: number;
}

export class UiSfx {
  private readonly core: AudioCore;
  private readonly crowd: Crowd | null;
  private lastPlayed: Partial<Record<UiKind, number>> = {};

  constructor(core: AudioCore, crowd: Crowd | null) {
    this.core = core;
    this.crowd = crowd;
  }

  private note(type: OscillatorType, f: number, t: number, dur: number, gain: number, o: NoteOpts = {}): void {
    const ctx = this.core.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t + (o.glideTime ?? dur));
    const nodes: AudioNode[] = [osc];
    let lfo: OscillatorNode | null = null;
    if (o.vibrato) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = o.vibrato;
      const d = ctx.createGain();
      d.gain.value = o.vibratoDepth ?? 10;
      lfo.connect(d);
      d.connect(osc.detune);
      nodes.push(lfo, d);
    }
    let head: AudioNode = osc;
    if (o.lp) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lp;
      lp.Q.value = 0;
      head.connect(lp);
      head = lp;
      nodes.push(lp);
    }
    const env = ctx.createGain();
    const a = o.attack ?? 0.005;
    const r = o.release ?? 0.05;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + a);
    env.gain.setValueAtTime(gain, t + Math.max(a, dur - r));
    env.gain.linearRampToValueAtTime(0, t + dur);
    head.connect(env);
    env.connect(this.core.uiBus);
    nodes.push(env);
    if (o.send) {
      const s = ctx.createGain();
      s.gain.value = o.send;
      env.connect(s);
      s.connect(this.core.reverbIn);
      nodes.push(s);
    }
    osc.start(t);
    osc.stop(t + dur + 0.02);
    if (lfo) {
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
    }
    osc.onended = (): void => {
      for (const n of nodes) n.disconnect();
    };
  }

  play(kind: UiKind): void {
    const core = this.core;
    if (!core.isRunning()) return;
    const t = core.now() + 0.005;
    // de-duplicate accidental double triggers in the same frame
    const last = this.lastPlayed[kind];
    if (last !== undefined && t - last < 0.03) return;
    this.lastPlayed[kind] = t;
    const B = core.buf;
    switch (kind) {
      case 'countdown':
        this.note('square', 659.25, t, 0.18, 0.13, { lp: 2400, send: 0.35 });
        this.note('sine', 1318.5, t, 0.14, 0.05, { send: 0.2 });
        break;
      case 'go':
        // stadium air horn: dissonant brassy triad with a little scoop
        for (const f of [233.1, 293.7, 370]) {
          this.note('sawtooth', f * 0.97, t, 1.1, 0.075, { attack: 0.03, release: 0.25, lp: 2600, glideTo: f, glideTime: 0.08, send: 0.5 });
        }
        this.note('square', 1318.5, t, 0.25, 0.05, { lp: 3000 });
        this.crowd?.cheer(0.75, t + 0.25);
        break;
      case 'select':
        this.note('sine', 1400, t, 0.07, 0.16, { glideTo: 1000, glideTime: 0.05 });
        this.note('triangle', 2800, t, 0.03, 0.05);
        break;
      case 'back':
        this.note('sine', 700, t, 0.1, 0.16, { glideTo: 470, glideTime: 0.08 });
        break;
      case 'points':
        this.note('triangle', 1318.5, t, 0.18, 0.14, { release: 0.12, send: 0.2 });
        this.note('triangle', 1975.5, t + 0.07, 0.32, 0.12, { release: 0.25, send: 0.2 });
        this.note('sine', 3951, t + 0.07, 0.2, 0.03, { release: 0.15 });
        break;
      case 'wreck':
        this.note('sawtooth', 55, t, 1.0, 0.16, { lp: 500, release: 0.6, send: 0.3 });
        this.note('sawtooth', 82.4, t, 1.0, 0.12, { lp: 500, release: 0.6 });
        this.note('square', 110, t, 0.25, 0.05, { lp: 900, release: 0.2 });
        if (B) {
          core.play(core.uiBus, B.ring[2], t, 0.3, 1.0);
          core.play(core.uiBus, pick(B.thump), t, 0.45, 0.85);
        }
        break;
      case 'lose': {
        const seq = [392, 370, 349.2];
        seq.forEach((f, i) => this.note('sawtooth', f, t + i * 0.3, 0.28, 0.09, { lp: 1400, release: 0.08, send: 0.25 }));
        this.note('sawtooth', 329.6, t + 0.9, 1.1, 0.09, { lp: 1400, release: 0.4, vibrato: 5.5, vibratoDepth: 14, glideTo: 311, glideTime: 1.0, send: 0.25 });
        break;
      }
      case 'win': {
        const seq = [523.25, 659.25, 783.99];
        seq.forEach((f, i) => {
          this.note('square', f, t + i * 0.11, 0.12, 0.07, { lp: 3000, send: 0.3 });
          this.note('triangle', f * 2, t + i * 0.11, 0.12, 0.04);
        });
        this.note('square', 1046.5, t + 0.33, 0.8, 0.08, { lp: 3000, release: 0.35, vibrato: 6, vibratoDepth: 8, send: 0.4 });
        this.note('triangle', 523.25, t + 0.33, 0.8, 0.06, { release: 0.35 });
        this.crowd?.cheer(1, t + 0.2);
        break;
      }
    }
  }
}
