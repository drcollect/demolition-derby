/*
 * Procedural carbureted-engine synthesiser — pure DSP, no DOM and no imports, so the same code runs
 * inside the AudioWorklet (engine-worklet.ts), in the ScriptProcessor fallback and in Node for offline
 * checks.
 *
 * Signal flow (per sample):
 *   crank angle -> firing events at the real firing order (per-bank grouping for the cross-plane V8
 *   burble, per-cylinder level bias and exhaust arrival offsets, cycle-to-cycle lope, misfires)
 *   -> impulses scatter-written (sub-sample accurate) into one excitation line per exhaust bank
 *   -> pressure pulse (leaky integrator, decay scaled in crank degrees) + combustion rasp noise
 *   -> brightness low-pass that opens with load -> damped comb per bank (header/pipe resonance)
 *   -> mid/side: mid through muffler/body formant resonators, side keeps the per-bank pulse pattern
 *   -> + intake roar/honk, whine, lifter tick, rod knock, panel rattles, exhaust leak, overrun pops,
 *     steam hiss, starter -> high-pass -> soft saturation (bark) -> air-absorption low-pass.
 * A cheap "lite" path (one pulse integrator + two resonators) is used for distant voices and the two
 * paths crossfade when the voice manager changes a voice's quality.
 */

export type EngineProfileName = 'v8big' | 'v8wagon' | 'v8muscle' | 'i4' | 'v8truck';

export interface ResDef {
  f: number;
  q: number;
  g: number;
}

export interface EngineProfileDef {
  cyl: 4 | 8;
  /** Firing order, 1-based cylinder numbers. */
  order: number[];
  /** Exhaust bank (0/1) of cylinder n at index n-1. */
  bank: number[];
  idle: number;
  redline: number;
  /** Round-trip delay of each bank's header/pipe (ms) and the comb feedback (open end: negative). */
  pipeMs: [number, number];
  pipeFb: number;
  pipeDampHz: number;
  /** Muffler/body resonances applied to the summed exhaust (4 entries). */
  res: [ResDef, ResDef, ResDef, ResDef];
  direct: number;
  directHz: number;
  /** Pressure-pulse decay in crank degrees, with a floor in ms. */
  pulseDeg: number;
  pulseMinMs: number;
  brightLo: number;
  brightHi: number;
  rasp: number;
  drive: number;
  lope: number;
  pops: number;
  intake: number;
  intakeHz: number;
  honkHz: number;
  whine: number;
  whineRatio: [number, number];
  tick: number;
  fan: number;
  leak: number;
  cylBias: number;
  cylTimeMs: number;
  /** Extra exhaust path length of bank 1 (ms): uneven pulse spacing at the pipe outlets = V8 burble. */
  bankDelayMs: number;
  bankBal: number;
  hpHz: number;
  gain: number;
  liteGain: number;
  knockHz: [number, number];
}

const GM: number[] = [0, 1, 0, 1, 0, 1, 0, 1];
const FORD: number[] = [1, 1, 1, 1, 0, 0, 0, 0];
const INLINE: number[] = [0, 0, 0, 0];

export const ENGINE_PROFILES: Record<EngineProfileName, EngineProfileDef> = {
  // Full-size sedan: 400-455 big block, long rusty dual pipes. Deep, lazy, heavy.
  v8big: {
    cyl: 8, order: [1, 8, 4, 3, 6, 5, 7, 2], bank: GM,
    idle: 700, redline: 5200,
    pipeMs: [10.6, 12.2], pipeFb: -0.5, pipeDampHz: 2100,
    res: [{ f: 86, q: 2.0, g: 1.0 }, { f: 205, q: 2.6, g: 0.75 }, { f: 520, q: 3.2, g: 0.4 }, { f: 1250, q: 2.4, g: 0.22 }],
    direct: 0.5, directHz: 1900,
    pulseDeg: 70, pulseMinMs: 1.3, brightLo: 300, brightHi: 2600,
    rasp: 0.22, drive: 1.5, lope: 0.14, pops: 0.35,
    intake: 0.28, intakeHz: 950, honkHz: 250, whine: 0.010, whineRatio: [3.1, 8.7], tick: 0.22, fan: 0.04, leak: 0.03,
    cylBias: 0.1, cylTimeMs: 0.35, bankDelayMs: 2.2, bankBal: 0.62, hpHz: 28, gain: 0.5, liteGain: 1.0,
    knockHz: [1150, 2450],
  },
  // Full-size wagon: Ford 351/400 (1-5-4-2-6-3-7-8), long tailpipe, hollow body boom, leaky exhaust.
  v8wagon: {
    cyl: 8, order: [1, 5, 4, 2, 6, 3, 7, 8], bank: FORD,
    idle: 680, redline: 5000,
    pipeMs: [13.2, 14.6], pipeFb: -0.52, pipeDampHz: 1800,
    res: [{ f: 72, q: 2.8, g: 1.05 }, { f: 170, q: 2.4, g: 0.7 }, { f: 440, q: 3.0, g: 0.36 }, { f: 1050, q: 2.2, g: 0.18 }],
    direct: 0.45, directHz: 1600,
    pulseDeg: 75, pulseMinMs: 1.4, brightLo: 280, brightHi: 2200,
    rasp: 0.18, drive: 1.3, lope: 0.11, pops: 0.2,
    intake: 0.24, intakeHz: 850, honkHz: 230, whine: 0.010, whineRatio: [2.9, 7.9], tick: 0.3, fan: 0.05, leak: 0.12,
    cylBias: 0.1, cylTimeMs: 0.4, bankDelayMs: 2.8, bankBal: 0.66, hpHz: 26, gain: 0.5, liteGain: 1.0,
    knockHz: [1050, 2300],
  },
  // Muscle coupe: big cam, open headers, 6500 rpm. Lumpy idle, raspy bark, lots of overrun crackle.
  v8muscle: {
    cyl: 8, order: [1, 8, 4, 3, 6, 5, 7, 2], bank: GM,
    idle: 900, redline: 6500,
    pipeMs: [3.7, 4.3], pipeFb: -0.55, pipeDampHz: 3200,
    res: [{ f: 110, q: 1.8, g: 0.9 }, { f: 310, q: 2.4, g: 0.6 }, { f: 880, q: 2.6, g: 0.42 }, { f: 2150, q: 2.2, g: 0.3 }],
    direct: 0.62, directHz: 3600,
    pulseDeg: 55, pulseMinMs: 1.0, brightLo: 420, brightHi: 4200,
    rasp: 0.5, drive: 2.6, lope: 0.38, pops: 1.0,
    intake: 0.55, intakeHz: 1250, honkHz: 300, whine: 0.012, whineRatio: [3.3, 9.1], tick: 0.18, fan: 0.03, leak: 0.02,
    cylBias: 0.15, cylTimeMs: 0.3, bankDelayMs: 1.6, bankBal: 0.58, hpHz: 30, gain: 0.46, liteGain: 1.0,
    knockHz: [1300, 2700],
  },
  // Compact hatchback: 2.0 inline-4 (1-3-4-2), single pipe, small muffler. Buzzy, thin, a bit whiny.
  i4: {
    cyl: 4, order: [1, 3, 4, 2], bank: INLINE,
    idle: 850, redline: 6300,
    pipeMs: [7.4, 7.4], pipeFb: -0.45, pipeDampHz: 3000,
    res: [{ f: 175, q: 2.2, g: 0.85 }, { f: 430, q: 2.8, g: 0.6 }, { f: 1100, q: 2.8, g: 0.45 }, { f: 2600, q: 2.4, g: 0.3 }],
    direct: 0.6, directHz: 3800,
    pulseDeg: 80, pulseMinMs: 1.1, brightLo: 480, brightHi: 4800,
    rasp: 0.4, drive: 2.2, lope: 0.06, pops: 0.4,
    intake: 0.5, intakeHz: 1500, honkHz: 380, whine: 0.03, whineRatio: [2.0, 5.3], tick: 0.4, fan: 0.02, leak: 0.03,
    cylBias: 0.07, cylTimeMs: 0.25, bankDelayMs: 0, bankBal: 1, hpHz: 38, gain: 0.55, liteGain: 1.0,
    knockHz: [1600, 3300],
  },
  // Pickup: 360-390 truck V8, low gearing, glasspacks, big mechanical fan. Deep and trucky.
  v8truck: {
    cyl: 8, order: [1, 5, 4, 8, 6, 3, 7, 2], bank: FORD,
    idle: 650, redline: 4800,
    pipeMs: [9.0, 9.9], pipeFb: -0.6, pipeDampHz: 1700,
    res: [{ f: 64, q: 2.4, g: 1.1 }, { f: 142, q: 2.6, g: 0.8 }, { f: 380, q: 3.0, g: 0.36 }, { f: 950, q: 2.2, g: 0.16 }],
    direct: 0.42, directHz: 1500,
    pulseDeg: 82, pulseMinMs: 1.5, brightLo: 250, brightHi: 2000,
    rasp: 0.2, drive: 1.5, lope: 0.12, pops: 0.2,
    intake: 0.25, intakeHz: 800, honkHz: 210, whine: 0.016, whineRatio: [2.6, 7.3], tick: 0.25, fan: 0.3, leak: 0.05,
    cylBias: 0.1, cylTimeMs: 0.4, bankDelayMs: 2.5, bankBal: 0.68, hpHz: 25, gain: 0.52, liteGain: 1.3,
    knockHz: [1000, 2150],
  },
};

const TWO_PI = Math.PI * 2;
const SIN_N = 4096;
const SIN = new Float32Array(SIN_N + 1);
for (let i = 0; i <= SIN_N; i++) SIN[i] = Math.sin((i / SIN_N) * TWO_PI);

const LAT = 2;
const EXC_N = 8192;
const EXC_MASK = EXC_N - 1;
const PIPE_N = 8192;
const PIPE_MASK = PIPE_N - 1;
const CTRL = 64;

const EV_FIRE = 0;
const EV_KNOCK = 1;
const EV_TICK = 2;

function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
/** RBJ band-pass with 0 dB peak: stores b0, a1, a2 at c[o..o+2] (b1 = 0, b2 = -b0). */
function bpCoef(f: number, q: number, sr: number, c: Float64Array, o: number): void {
  const w0 = (TWO_PI * clamp(f, 10, sr * 0.45)) / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  c[o] = alpha / a0;
  c[o + 1] = (-2 * Math.cos(w0)) / a0;
  c[o + 2] = (1 - alpha) / a0;
}
/** Peak of a constant-0dB band-pass impulse response is ~w0/Q; this undoes that for struck resonators. */
function strikeNorm(f: number, q: number, sr: number): number {
  return (q * sr) / (TWO_PI * f);
}
function onePole(fc: number, sr: number): number {
  return 1 - Math.exp((-TWO_PI * Math.min(fc, sr * 0.49)) / sr);
}

export class EngineDSP {
  readonly sr: number;
  readonly P: EngineProfileDef;
  readonly stereo: boolean;
  private readonly dual: boolean;

  // ---- targets ----
  private tRpm: number;
  private tThr = 0;
  private tLoad = 0;
  private tDmg = 0;
  private tDead = false;
  private tQ = 2;
  private tPitch = 1;
  private tAir = 24000;

  // ---- smoothed controls ----
  private rpm: number;
  private thr = 0;
  private load = 0;
  private dmg = 0;
  private pitch = 1;
  private air = 24000;
  private onAmt = 0;
  private fullAmt = 1;
  private silent = true;

  // ---- per-voice randomisation ----
  private readonly bias: Float64Array;
  private readonly cylDelay: Float64Array;
  private readonly bankOf: Int8Array;
  private readonly evAng: Float64Array;
  private readonly evType: Int8Array;
  private readonly evArg: Int8Array;
  private readonly nEv: number;
  private readonly pipeD0: number;
  private readonly pipeD1: number;

  // ---- random ----
  private rs: number;
  private ns: number;

  // ---- crank ----
  private phase = 0;
  private dphi = 0;
  private dphiT = 0;
  private nextIdx = 0;
  private nextAng = 0;
  private wob = 0;
  private flare = 0;

  // ---- derived per control block ----
  private amp = 0;
  private cycleF = 1;
  private lopeAmt = 0;
  private jit = 0;
  private pMis = 0;
  private popP = 0;
  private popWin = 0;
  private thrPeak = 0;
  private pRattle = 0;
  private rattleAmt = 0;
  private knockAmt = 0;
  private tickAmt = 0;
  private runOn = false;
  private readonly carry = new Float64Array(2);
  private pd = 0;
  private nd = 0;
  private bc = 0;
  private bc1 = 0;
  private rasp = 0;
  private drive = 1;
  private satOut = 1;
  private intakeAmt = 0;
  private honkAmt = 0;
  private whineAmt = 0;
  private wInc1 = 0;
  private wInc2 = 0;
  private fanAmt = 0;
  private leakAmt = 0;
  private hissAmt = 0;
  private starterAmt = 0;
  private sInc = 0;
  private ac = 1;
  private outG = 0;

  // ---- dying / cranking ----
  private dying = false;
  private deadDone = false;
  private deadT = 0;
  private deathRpm = 0;
  private lastGasp = -1;
  private clunkDone = false;
  private deadGain = 1;
  private crankT = 0;

  // ---- buffers ----
  private readonly exc0 = new Float32Array(EXC_N);
  private readonly exc1 = new Float32Array(EXC_N);
  private readonly popX = new Float32Array(EXC_N);
  private readonly mechX = new Float32Array(EXC_N);
  private readonly tickX = new Float32Array(EXC_N);
  private readonly ratX = new Float32Array(EXC_N);
  private readonly pipe0 = new Float32Array(PIPE_N);
  private readonly pipe1 = new Float32Array(PIPE_N);
  private w = 0;
  private mechLeft = 0;
  private tickLeft = 0;
  private ratLeft = 0;
  private popLeft = 0;

  // ---- filter coefficients ----
  private readonly fc = new Float64Array(12); // 4 formant band-passes
  private readonly ic = new Float64Array(6); // intake noise + honk
  private readonly kc = new Float64Array(9); // knock 2 + thud
  private readonly tc = new Float64Array(3); // lifter tick
  private readonly rc = new Float64Array(9); // 3 rattle modes
  private readonly fanC = new Float64Array(3);
  private readonly hpC = new Float64Array(5);
  private readonly knockNorm: Float64Array;
  private readonly tickNorm: number;
  private readonly rattleNorm: Float64Array;
  private readonly pdc: number;
  private readonly dlc: number;
  private readonly lkc: number;
  private readonly hsc: number;
  private readonly crc: number;

  // ---- filter state (full path) ----
  private p0 = 0; private p1 = 0; private n0 = 0; private n1 = 0; private b0 = 0; private b1 = 0;
  private pl0 = 0; private pl1 = 0; private dl = 0; private dlR = 0;
  private readonly fz = new Float64Array(8);
  private readonly fzR = new Float64Array(8);
  private readonly iz = new Float64Array(4);
  private readonly kz = new Float64Array(6);
  private readonly tz = new Float64Array(2);
  private readonly rz = new Float64Array(6);
  private readonly fanZ = new Float64Array(2);
  private hz1 = 0; private hz2 = 0; private hzR1 = 0; private hzR2 = 0;
  private popEnv = 0; private crLp = 0;
  private lkLp = 0; private hsLp = 0;
  private dcx = 0; private dcy = 0; private dcxR = 0; private dcyR = 0;
  private aoL = 0; private aoR = 0;
  private wp1 = 0; private wp2 = 0; private sp = 0;
  // ---- lite path state ----
  private lp = 0; private ln = 0; private lb = 0; private ldl = 0;
  private readonly lz = new Float64Array(4);
  private lhz1 = 0; private lhz2 = 0;

  constructor(sampleRate: number, profile: EngineProfileName | string, stereo: boolean, seed: number) {
    this.sr = sampleRate;
    const P = ENGINE_PROFILES[(profile in ENGINE_PROFILES ? profile : 'v8big') as EngineProfileName];
    this.P = P;
    this.stereo = stereo;
    this.dual = P.cyl === 8;
    this.rs = (seed | 0) || 0x9e3779b9;
    this.ns = ((seed * 7919) ^ 0x5bd1e995) | 0 || 0x1234567;
    this.tRpm = P.idle;
    this.rpm = P.idle;
    const sr = sampleRate;

    // cylinders
    this.bias = new Float64Array(P.cyl);
    this.cylDelay = new Float64Array(P.cyl);
    this.bankOf = new Int8Array(P.cyl);
    for (let c = 0; c < P.cyl; c++) {
      this.bias[c] = clamp(1 + P.cylBias * this.gauss(), 0.6, 1.4);
      this.bankOf[c] = P.bank[c] ?? 0;
      this.cylDelay[c] = (this.rand() * P.cylTimeMs + (this.bankOf[c] === 1 ? P.bankDelayMs : 0)) * 0.001 * sr;
    }
    // events around the 720-degree cycle
    const evs: Array<[number, number, number]> = [];
    const step = 720 / P.cyl;
    for (let j = 0; j < P.cyl; j++) evs.push([j * step, EV_FIRE, (P.order[j] ?? 1) - 1]);
    const ka = (Math.floor(this.rand() * P.cyl) * step + 25) % 720;
    evs.push([ka, EV_KNOCK, 0], [(ka + 360) % 720, EV_KNOCK, 1]);
    evs.push([this.rand() * 719, EV_TICK, 0], [this.rand() * 719, EV_TICK, 1]);
    evs.sort((a, b) => a[0] - b[0]);
    this.nEv = evs.length;
    this.evAng = new Float64Array(evs.map((e) => e[0]));
    this.evType = new Int8Array(evs.map((e) => e[1]));
    this.evArg = new Int8Array(evs.map((e) => e[2]));
    this.nextIdx = 0;
    this.nextAng = this.evAng[0] ?? 0;
    this.phase = 0;

    // per-voice variation of the plumbing
    const v = (amt: number): number => 1 + amt * (this.rand() * 2 - 1);
    this.pipeD0 = clamp(P.pipeMs[0] * v(0.05) * 0.001 * sr, 4, PIPE_N - 4);
    this.pipeD1 = clamp(P.pipeMs[1] * v(0.05) * 0.001 * sr, 4, PIPE_N - 4);
    for (let k = 0; k < 4; k++) {
      const r = P.res[k] as ResDef;
      bpCoef(r.f * v(0.04), r.q, sr, this.fc, k * 3);
    }
    bpCoef(P.honkHz * v(0.05), 3.5, sr, this.ic, 3);
    bpCoef(P.intakeHz, 1.1, sr, this.ic, 0);
    const k1 = P.knockHz[0] * v(0.05);
    const k2 = P.knockHz[1] * v(0.05);
    bpCoef(k1, 9, sr, this.kc, 0);
    bpCoef(k2, 13, sr, this.kc, 3);
    bpCoef(165, 1.6, sr, this.kc, 6);
    this.knockNorm = new Float64Array([strikeNorm(k1, 9, sr), strikeNorm(k2, 13, sr), strikeNorm(165, 1.6, sr)]);
    const tf = 3600 + this.rand() * 1800;
    bpCoef(tf, 7, sr, this.tc, 0);
    this.tickNorm = strikeNorm(tf, 7, sr);
    const rf = [650 + this.rand() * 450, 1250 + this.rand() * 650, 2100 + this.rand() * 1100];
    const rq = [16 + this.rand() * 10, 18 + this.rand() * 10, 20 + this.rand() * 10];
    this.rattleNorm = new Float64Array(3);
    for (let k = 0; k < 3; k++) {
      bpCoef(rf[k] as number, rq[k] as number, sr, this.rc, k * 3);
      this.rattleNorm[k] = strikeNorm(rf[k] as number, rq[k] as number, sr);
    }
    bpCoef(720, 0.8, sr, this.fanC, 0);
    // 2nd-order Butterworth high-pass
    {
      const w0 = (TWO_PI * P.hpHz) / sr;
      const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
      const cw = Math.cos(w0);
      const a0 = 1 + alpha;
      this.hpC[0] = (1 + cw) / 2 / a0;
      this.hpC[1] = -(1 + cw) / a0;
      this.hpC[2] = (1 + cw) / 2 / a0;
      this.hpC[3] = (-2 * cw) / a0;
      this.hpC[4] = (1 - alpha) / a0;
    }
    this.pdc = onePole(P.pipeDampHz, sr);
    this.dlc = onePole(P.directHz, sr);
    this.lkc = onePole(1600, sr);
    this.hsc = onePole(2800, sr);
    this.crc = onePole(650, sr);
  }

  /** Called once per render block (k-rate). NaN-safe. */
  set(rpm: number, thr: number, load: number, dmg: number, dead: boolean, quality: number, pitch: number, air: number): void {
    if (rpm === rpm) this.tRpm = clamp(rpm, 0, 12000);
    if (thr === thr) this.tThr = clamp(thr, 0, 1);
    if (load === load) this.tLoad = clamp(load, 0, 1);
    if (dmg === dmg) this.tDmg = clamp(dmg, 0, 1);
    this.tDead = dead;
    if (quality === quality) this.tQ = quality;
    if (pitch === pitch) this.tPitch = clamp(pitch, 0.5, 2);
    if (air === air) this.tAir = clamp(air, 200, 24000);
  }

  /** True once the voice has faded to silence (off, or dead and finished sputtering). */
  get isSilent(): boolean {
    return this.silent;
  }

  /** Renders samples [start, end) into L (and R when stereo). Writes every sample. */
  process(L: Float32Array, R: Float32Array | null, start: number, end: number): void {
    let i = start;
    while (i < end) {
      const n = Math.min(CTRL, end - i);
      this.control(n);
      if (this.silent) {
        L.fill(0, i, i + n);
        if (R) R.fill(0, i, i + n);
      } else {
        this.render(L, R, i, i + n);
      }
      i += n;
    }
  }

  // ------------------------------------------------------------------------------------------------
  private rand(): number {
    let s = this.rs;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.rs = s;
    return (s >>> 0) / 4294967296;
  }
  private gauss(): number {
    return (this.rand() + this.rand() + this.rand() + this.rand() - 2) * 1.7320508;
  }

  private goSilent(): void {
    this.silent = true;
    this.onAmt = 0;
    this.exc0.fill(0); this.exc1.fill(0); this.popX.fill(0); this.mechX.fill(0); this.tickX.fill(0); this.ratX.fill(0);
    this.pipe0.fill(0); this.pipe1.fill(0);
    this.fz.fill(0); this.fzR.fill(0); this.iz.fill(0); this.kz.fill(0); this.tz.fill(0); this.rz.fill(0); this.fanZ.fill(0); this.lz.fill(0);
    this.p0 = this.p1 = this.n0 = this.n1 = this.b0 = this.b1 = this.pl0 = this.pl1 = this.dl = this.dlR = 0;
    this.hz1 = this.hz2 = this.hzR1 = this.hzR2 = this.popEnv = this.crLp = this.lkLp = this.hsLp = 0;
    this.dcx = this.dcy = this.dcxR = this.dcyR = this.aoL = this.aoR = 0;
    this.lp = this.ln = this.lb = this.ldl = this.lhz1 = this.lhz2 = 0;
    this.mechLeft = this.tickLeft = this.ratLeft = this.popLeft = 0;
    this.carry.fill(0);
  }

  private startDying(): void {
    this.dying = true;
    this.deadT = 0;
    this.deathRpm = Math.max(this.rpm, this.P.idle * 0.9);
    this.lastGasp = this.rand() < 0.75 ? 0.04 + this.rand() * 0.25 : -1;
    this.clunkDone = false;
    this.deadGain = 1;
    this.crankT = 0;
    this.flare = 0;
  }

  private revive(): void {
    const wasSilent = this.silent;
    this.dying = false;
    this.deadDone = false;
    this.deadGain = 1;
    this.runOn = false;
    if (wasSilent) {
      this.crankT = 0.62;
      this.rpm = 150;
    }
  }

  private control(n: number): void {
    const P = this.P;
    const sr = this.sr;
    const dt = n / sr;

    if (this.tDead) {
      if (!this.dying && !this.deadDone) this.startDying();
    } else if (this.dying || this.deadDone) {
      this.revive();
    }
    if (this.deadDone) {
      if (!this.silent) this.goSilent();
      return;
    }
    const onT = this.tQ >= 0.5 ? 1 : 0;
    const fullT = this.tQ >= 1.5 ? 1 : 0;
    const kq = 1 - Math.exp(-dt / 0.07);
    this.onAmt += (onT - this.onAmt) * kq;
    this.fullAmt += (fullT - this.fullAmt) * kq;
    if (this.fullAmt > 0.999) this.fullAmt = 1;
    else if (this.fullAmt < 0.001) this.fullAmt = 0;
    if (onT === 0 && this.onAmt < 0.002) {
      if (!this.silent) this.goSilent();
      return;
    }
    this.silent = false;

    // ---------------- controls ----------------
    let rpmT = this.tRpm;
    let thrT = this.tThr;
    let cpOverride = -1;
    let misExtra = 0;
    this.runOn = false;
    this.starterAmt = 0;
    let rpmK = 1 - Math.exp(-dt / 0.035);
    if (this.dying) {
      this.deadT += dt;
      const t = this.deadT;
      thrT = 0;
      cpOverride = 0.42;
      rpmK = 1 - Math.exp(-dt / 0.04);
      if (t < 0.5) {
        rpmT = Math.max(150, this.deathRpm * Math.exp(-t / 0.2));
        misExtra = 0.3 + t;
      } else if (t < 1.15) {
        rpmT = 150 - (t - 0.5) * 60;
        misExtra = 0.62;
        this.runOn = true;
      } else {
        rpmT = Math.max(0, 110 * (1 - (t - 1.15) / 0.15));
        misExtra = 1;
      }
      this.deadGain = t < 1.15 ? 1 : Math.max(0, 1 - (t - 1.15) / 0.45);
      if (this.lastGasp > 0 && t >= this.lastGasp) {
        this.lastGasp = -1;
        this.pop(this.rand() < 0.5 ? 0 : 1, this.w, 1.2 + this.rand() * 0.8, 1.8);
      }
      if (t >= 1.15 && !this.clunkDone) {
        this.clunkDone = true;
        this.scatter(this.mechX, this.w, LAT + 1, 0.08);
        this.mechLeft = sr * 0.5;
      }
      if (t > 1.65) {
        this.dying = false;
        this.deadDone = true;
        this.goSilent();
        return;
      }
    } else if (this.crankT > 0) {
      this.crankT -= dt;
      const ct = 0.62 - this.crankT;
      rpmT = 185 + 40 * Math.sin(TWO_PI * 7 * ct);
      rpmK = 1 - Math.exp(-dt / 0.01);
      cpOverride = 0.05;
      thrT = 0;
      this.starterAmt = 0.075 * smoothstep(0, 0.05, ct);
      if (this.crankT <= 0) {
        this.flare = 650;
        this.rpm = P.idle * 0.8;
      }
    }
    this.rpm += (rpmT - this.rpm) * rpmK;
    this.thr += (thrT - this.thr) * (1 - Math.exp(-dt / 0.025));
    this.load += (this.tLoad - this.load) * (1 - Math.exp(-dt / 0.06));
    this.dmg += (this.tDmg - this.dmg) * (1 - Math.exp(-dt / 0.25));
    const kp = 1 - Math.exp(-dt / 0.08);
    this.pitch += (this.tPitch - this.pitch) * kp;
    this.air += (this.tAir - this.air) * kp;
    if (this.flare > 1) this.flare *= Math.exp(-dt / 0.35);
    else this.flare = 0;

    const rpm = Math.max(1, this.rpm);
    const thr = this.thr;
    const dmg = this.dmg;
    const rn = clamp(rpm / P.redline, 0, 1.25);
    const idleF = clamp(1 - (rpm - P.idle) / 1400, 0, 1) * (1 - 0.85 * thr);

    // cylinder pressure: idle air bypass when closed, load-dependent when open
    const cpClosed = Math.max(0.15, 0.4 * Math.pow(Math.min(1, P.idle / rpm), 0.55));
    const cpOpen = 0.55 + 0.45 * this.load;
    let cp = cpClosed + (cpOpen - cpClosed) * Math.pow(thr, 0.8);
    if (cpOverride >= 0) cp = cpOverride;
    this.amp = cp * (0.62 + 0.38 * Math.min(1, rn));

    // idle lope, jitter, misfires
    const overrunF = thr < 0.15 && !this.dying ? smoothstep(1800, 3600, rpm) * (1 - thr / 0.15) : 0;
    this.lopeAmt = P.lope * idleF + 0.3 * dmg + 0.25 * overrunF;
    this.jit = 0.04 + 0.14 * P.lope * idleF + 0.22 * dmg + 0.3 * overrunF;
    this.pMis = Math.min(1, 0.0008 + dmg * dmg * 0.15 * (0.5 + 0.5 * idleF) + 0.04 * overrunF * P.pops + misExtra);
    const wobAmp = (P.lope * 150 + dmg * 120) * idleF;
    this.wob += (-this.wob / 0.12) * dt + wobAmp * Math.sqrt(dt / 0.12) * this.gauss();

    // overrun crackle
    this.thrPeak = Math.max(thr, this.thrPeak * Math.exp(-dt / 0.35));
    const overrun = thr < 0.15 && rpm > 2000 && !this.dying && this.crankT <= 0;
    if (thr < 0.12 && this.thrPeak > 0.45 && rpm > 0.45 * P.redline && this.popWin <= 0) {
      this.popWin = (0.5 + 0.9 * this.rand()) * (0.4 + 0.6 * P.pops);
      this.thrPeak = 0;
    }
    if (this.popWin > 0) this.popWin -= dt;
    const fireRate = Math.max(1, (rpm / 120) * P.cyl);
    const popRate = overrun ? (this.popWin > 0 ? 12 : 0.8) * P.pops * (0.35 + 0.65 * Math.min(1, rn)) : 0;
    this.popP = Math.min(0.5, popRate / fireRate);

    // damage extras
    this.rattleAmt = smoothstep(0.12, 0.8, dmg);
    this.pRattle = Math.min(1, (this.rattleAmt * (5 + 28 * (1 - Math.min(1, rn * 1.6)))) / fireRate);
    this.knockAmt = smoothstep(0.3, 0.85, dmg) * (0.35 + 0.65 * cp) * 0.07;
    this.tickAmt = P.tick * (0.25 + dmg) * (0.35 + 0.65 * idleF) * 0.05;
    this.leakAmt = P.leak + 0.35 * smoothstep(0.2, 0.9, dmg);
    this.hissAmt = 0.03 * smoothstep(0.55, 1.0, dmg);

    // pulse shape & tone
    const tau = Math.max(P.pulseMinMs * 0.001, P.pulseDeg / (6 * rpm));
    this.pd = Math.exp(-1 / (tau * sr));
    this.nd = Math.exp(-1 / (0.0011 * sr));
    const fcB = P.brightLo * (1 + 1.2 * Math.min(1, rn)) + (P.brightHi - P.brightLo) * Math.pow(cp, 1.5) * (0.5 + 0.5 * Math.min(1, rn));
    this.bc = onePole(fcB, sr);
    this.bc1 = onePole(fcB * 0.78, sr);
    this.rasp = P.rasp * (0.3 + 0.7 * cp) * (1 + 0.8 * dmg);
    this.drive = 1 + P.drive * cp * cp * (0.6 + 0.4 * Math.min(1, rn));
    this.satOut = (1 + 0.3 * (this.drive - 1)) / this.drive;

    // intake
    this.intakeAmt = P.intake * Math.pow(thr, 1.3) * (0.2 + 0.8 * Math.min(1, rn)) * 0.35;
    this.honkAmt = P.intake * thr * (0.3 + 0.7 * Math.min(1, rn)) * 0.5;
    bpCoef(P.intakeHz * (0.7 + 0.6 * Math.min(1, rn)), 1.1, sr, this.ic, 0);

    // mechanical
    const crankHz = rpm / 60;
    this.whineAmt = P.whine * (0.15 + rn * rn);
    this.wInc1 = (crankHz * P.whineRatio[0]) / sr;
    this.wInc2 = (crankHz * P.whineRatio[1]) / sr;
    this.fanAmt = P.fan * rn * rn * 0.5;
    this.sInc = (120 + 0.25 * rpm) / sr;

    this.ac = this.air >= 20000 ? 1 : onePole(this.air, sr);
    this.outG = P.gain * this.onAmt * this.deadGain;

    const rpmEff = Math.max(0, rpm + this.wob + this.flare) * this.pitch;
    this.dphiT = (rpmEff * 6) / sr;

    if (this.mechLeft > 0) this.mechLeft -= n;
    if (this.tickLeft > 0) this.tickLeft -= n;
    if (this.ratLeft > 0) this.ratLeft -= n;
    if (this.popLeft > 0) this.popLeft -= n;
  }

  private scatter(buf: Float32Array, w: number, pos: number, a: number): void {
    if (pos < 1) pos = 1;
    if (pos > EXC_N - 4) pos = EXC_N - 4;
    const ip = Math.floor(pos);
    const f = pos - ip;
    const idx = (w + ip) & EXC_MASK;
    buf[idx] = (buf[idx] as number) + a * (1 - f);
    const idx2 = (idx + 1) & EXC_MASK;
    buf[idx2] = (buf[idx2] as number) + a * f;
  }

  private pop(bank: number, w: number, delayMs: number, a: number): void {
    const pos = LAT + delayMs * 0.001 * this.sr;
    this.scatter(this.popX, w, pos, a * 0.55);
    this.scatter(bank === 1 && this.dual ? this.exc1 : this.exc0, w, pos, a * 0.9);
    this.popLeft = this.sr * 0.1 + pos;
  }

  private popCluster(bank: number, w: number): void {
    let t = this.rand() * 6;
    const n = 1 + (this.rand() < 0.5 ? 1 : 0) + (this.rand() < 0.25 ? 1 : 0);
    for (let j = 0; j < n; j++) {
      this.pop(this.dual && this.rand() < 0.5 ? 1 - bank : bank, w, t, 0.5 + this.rand() * 0.9);
      t += 3 + this.rand() * 14;
    }
  }

  private newCycle(): void {
    this.cycleF = Math.max(0.25, 1 + this.lopeAmt * 0.55 * this.gauss());
  }

  private event(idx: number, frac: number, w: number): void {
    const type = this.evType[idx];
    const arg = this.evArg[idx] as number;
    if (type === EV_FIRE) {
      const bank = this.bankOf[arg] as number;
      let a = this.amp * (this.bias[arg] as number) * this.cycleF * (1 + this.jit * this.gauss());
      if (a < 0) a = 0;
      if (this.rand() < this.pMis) {
        a *= 0.05;
        this.carry[bank] = 0.4;
        if (this.rand() < 0.05 + 0.15 * this.dmg) this.pop(bank, w, 2 + this.rand() * 8, 0.3 + this.rand() * 0.4);
      } else {
        const c = this.carry[bank] as number;
        if (c > 0) {
          a *= 1 + c;
          this.carry[bank] = 0;
        }
        if (this.runOn) a *= 2.2;
      }
      if (this.popP > 0 && this.rand() < this.popP) this.popCluster(bank, w);
      const pos = LAT - frac + (this.cylDelay[arg] as number);
      this.scatter(bank === 1 && this.dual ? this.exc1 : this.exc0, w, pos, a);
      if (this.pRattle > 0.001 && this.rand() < this.pRattle) {
        let t = pos;
        const k = 2 + Math.floor(this.rand() * 3);
        for (let j = 0; j < k; j++) {
          this.scatter(this.ratX, w, t, (0.3 + 0.7 * this.rand()) * this.rattleAmt);
          t += (2.5 + this.rand() * 7) * 0.001 * this.sr;
        }
        this.ratLeft = this.sr * 0.25 + t;
      }
    } else if (type === EV_KNOCK) {
      if (this.knockAmt > 0.001) {
        this.scatter(this.mechX, w, LAT - frac + this.rand() * 0.0003 * this.sr, this.knockAmt * (0.7 + 0.6 * this.rand()));
        this.mechLeft = this.sr * 0.25;
      }
    } else if (type === EV_TICK) {
      if (this.tickAmt > 0.0005) {
        this.scatter(this.tickX, w, LAT - frac, this.tickAmt * (arg === 0 ? 1 : 0.55) * (0.8 + 0.4 * this.rand()));
        this.tickLeft = this.sr * 0.1;
      }
    }
  }

  private render(L: Float32Array, R: Float32Array | null, i0: number, i1: number): void {
    const P = this.P;
    const dual = this.dual;
    const stereo = R !== null;
    const exc0 = this.exc0, exc1 = this.exc1, popX = this.popX, mechX = this.mechX, tickX = this.tickX, ratX = this.ratX;
    const pipe0 = this.pipe0, pipe1 = this.pipe1;
    const fullAmt = this.fullAmt;
    const doFull = fullAmt > 0;
    const doLite = fullAmt < 1;
    const liteAmt = 1 - fullAmt;
    const pd = this.pd, nd = this.nd, bc = this.bc, bc1 = this.bc1, rasp = this.rasp;
    const fb = P.pipeFb, pdc = this.pdc, dlc = this.dlc, direct = P.direct;
    const bal = P.bankBal;
    const drive = this.drive, satOut = this.satOut;
    const outG = this.outG;
    const ac = this.ac;
    const hb0 = this.hpC[0] as number, hb1 = this.hpC[1] as number, hb2 = this.hpC[2] as number;
    const ha1 = this.hpC[3] as number, ha2 = this.hpC[4] as number;

    const d0i = Math.floor(this.pipeD0), d0f = this.pipeD0 - d0i;
    const d1i = Math.floor(this.pipeD1), d1f = this.pipeD1 - d1i;

    // formant coefficients (shared) and state (left/mono + right)
    const fc = this.fc, fz = this.fz, fzR = this.fzR;
    const f0b = fc[0] as number, f0a1 = fc[1] as number, f0a2 = fc[2] as number;
    const f1b = fc[3] as number, f1a1 = fc[4] as number, f1a2 = fc[5] as number;
    const f2b = fc[6] as number, f2a1 = fc[7] as number, f2a2 = fc[8] as number;
    const f3b = fc[9] as number, f3a1 = fc[10] as number, f3a2 = fc[11] as number;
    const g0 = P.res[0].g, g1 = P.res[1].g, g2 = P.res[2].g, g3 = P.res[3].g;
    let z01 = fz[0] as number, z02 = fz[1] as number, z11 = fz[2] as number, z12 = fz[3] as number;
    let z21 = fz[4] as number, z22 = fz[5] as number, z31 = fz[6] as number, z32 = fz[7] as number;
    let r01 = fzR[0] as number, r02 = fzR[1] as number, r11 = fzR[2] as number, r12 = fzR[3] as number;
    let r21 = fzR[4] as number, r22 = fzR[5] as number, r31 = fzR[6] as number, r32 = fzR[7] as number;

    const intakeOn = doFull && (this.intakeAmt > 1e-4 || this.honkAmt > 1e-4);
    const ic = this.ic, iz = this.iz;
    const ib = ic[0] as number, ia1 = ic[1] as number, ia2 = ic[2] as number;
    const hkb = ic[3] as number, hka1 = ic[4] as number, hka2 = ic[5] as number;
    let iz1 = iz[0] as number, iz2 = iz[1] as number, hz1i = iz[2] as number, hz2i = iz[3] as number;
    const intakeAmt = this.intakeAmt, honkAmt = this.honkAmt;
    const popOn = this.popLeft > 0;
    const mechOn = doFull && this.mechLeft > 0;
    const tickOn = doFull && this.tickLeft > 0;
    const ratOn = doFull && this.ratLeft > 0;
    const leakAmt = doFull ? this.leakAmt : 0;
    const hissAmt = doFull ? this.hissAmt : 0;
    const whineAmt = doFull ? this.whineAmt : 0;
    const fanAmt = doFull ? this.fanAmt : 0;
    const starterAmt = this.starterAmt;
    const popD = Math.exp(-1 / (0.0028 * this.sr));
    const crc = this.crc, lkc = this.lkc, hsc = this.hsc;

    let p0 = this.p0, p1 = this.p1, n0 = this.n0, n1 = this.n1, b0 = this.b0, b1 = this.b1;
    let pl0 = this.pl0, pl1 = this.pl1, dl = this.dl, dlR = this.dlR;
    let hz1 = this.hz1, hz2 = this.hz2, hzR1 = this.hzR1, hzR2 = this.hzR2;
    let popEnv = this.popEnv, crLp = this.crLp, lkLp = this.lkLp, hsLp = this.hsLp;
    let dcx = this.dcx, dcy = this.dcy, dcxR = this.dcxR, dcyR = this.dcyR;
    let aoL = this.aoL, aoR = this.aoR;
    let wp1 = this.wp1, wp2 = this.wp2, sp = this.sp;
    const wInc1 = this.wInc1, wInc2 = this.wInc2, sInc = this.sInc;
    let lp = this.lp, ln = this.ln, lb = this.lb, ldl = this.ldl;
    const lz = this.lz;
    let lz01 = lz[0] as number, lz02 = lz[1] as number, lz11 = lz[2] as number, lz12 = lz[3] as number;
    let lhz1 = this.lhz1, lhz2 = this.lhz2;
    const liteGain = P.liteGain;

    let w = this.w;
    let ns = this.ns;
    let phase = this.phase;
    let dphi = this.dphi;
    const dphiStep = (this.dphiT - dphi) / (i1 - i0);

    for (let i = i0; i < i1; i++) {
      // ---- crank & events ----
      dphi += dphiStep;
      if (dphi > 1e-7) {
        phase += dphi;
        while (phase >= this.nextAng) {
          const frac = (phase - this.nextAng) / dphi;
          this.event(this.nextIdx, frac < 0 ? 0 : frac > 1 ? 1 : frac, w);
          let ni = this.nextIdx + 1;
          if (ni >= this.nEv) {
            ni = 0;
            phase -= 720;
            this.newCycle();
          }
          this.nextIdx = ni;
          this.nextAng = this.evAng[ni] as number;
        }
      }

      // ---- noise ----
      ns ^= ns << 13; ns ^= ns >>> 17; ns ^= ns << 5;
      const r1 = ns * 4.656612873077393e-10;
      ns ^= ns << 13; ns ^= ns >>> 17; ns ^= ns << 5;
      const r2 = ns * 4.656612873077393e-10;

      const wi = w & EXC_MASK;
      const e0 = exc0[wi] as number; exc0[wi] = 0;
      const e1 = exc1[wi] as number; exc1[wi] = 0;

      let outL = 0;
      let outR = 0;

      if (doFull) {
        // ---- pulses & pipes per bank ----
        p0 = p0 * pd + e0;
        n0 = n0 * nd + e0;
        b0 += bc * (p0 + n0 * r1 * rasp - b0);
        const pw = w & PIPE_MASK;
        const rd0 = (pipe0[(w - d0i) & PIPE_MASK] as number) * (1 - d0f) + (pipe0[(w - d0i - 1) & PIPE_MASK] as number) * d0f;
        pl0 += pdc * (rd0 - pl0);
        const y0 = b0 + fb * pl0;
        pipe0[pw] = y0;
        let y1 = 0;
        if (dual) {
          p1 = p1 * pd + e1;
          n1 = n1 * nd + e1;
          b1 += bc1 * (p1 + n1 * r2 * rasp - b1);
          const rd1 = (pipe1[(w - d1i) & PIPE_MASK] as number) * (1 - d1f) + (pipe1[(w - d1i - 1) & PIPE_MASK] as number) * d1f;
          pl1 += pdc * (rd1 - pl1);
          y1 = b1 + fb * pl1;
          pipe1[pw] = y1;
        }

        // ---- shared extras (intake, leak, hiss, mechanical) ----
        let ex = 0;
        let y = 0;
        if (intakeOn) {
          const xin = r2 * (0.3 + (n0 + n1) * 2);
          y = ib * xin + iz1; iz1 = -ia1 * y + iz2; iz2 = -ib * xin - ia2 * y; ex += y * intakeAmt;
          const xh = b0 + b1;
          y = hkb * xh + hz1i; hz1i = -hka1 * y + hz2i; hz2i = -hkb * xh - hka2 * y; ex += y * honkAmt;
        }
        if (leakAmt > 0) {
          const lk = (n0 + n1) * r2 * leakAmt;
          lkLp += lkc * (lk - lkLp);
          ex += (lk - lkLp) * 0.8;
        }
        if (hissAmt > 0) {
          const hs = r1 * hissAmt;
          hsLp += hsc * (hs - hsLp);
          ex += hs - hsLp;
        }
        if (whineAmt > 0) {
          wp1 += wInc1; if (wp1 >= 1) wp1 -= 1;
          wp2 += wInc2; if (wp2 >= 1) wp2 -= 1;
          ex += ((SIN[(wp1 * SIN_N) | 0] as number) + 0.5 * (SIN[(wp2 * SIN_N) | 0] as number)) * whineAmt;
        }
        if (fanAmt > 0) {
          const fzs = this.fanZ;
          const fb0 = this.fanC[0] as number, fa1 = this.fanC[1] as number, fa2 = this.fanC[2] as number;
          const xf = r1 * fanAmt;
          y = fb0 * xf + (fzs[0] as number); fzs[0] = -fa1 * y + (fzs[1] as number); fzs[1] = -fb0 * xf - fa2 * y; ex += y;
        }
        if (mechOn) {
          const kx = mechX[wi] as number; mechX[wi] = 0;
          const kc = this.kc, kz = this.kz, kn = this.knockNorm;
          let yk = (kc[0] as number) * kx + (kz[0] as number); kz[0] = -(kc[1] as number) * yk + (kz[1] as number); kz[1] = -(kc[0] as number) * kx - (kc[2] as number) * yk;
          let acc = yk * (kn[0] as number);
          yk = (kc[3] as number) * kx + (kz[2] as number); kz[2] = -(kc[4] as number) * yk + (kz[3] as number); kz[3] = -(kc[3] as number) * kx - (kc[5] as number) * yk;
          acc += yk * (kn[1] as number) * 0.55;
          yk = (kc[6] as number) * kx + (kz[4] as number); kz[4] = -(kc[7] as number) * yk + (kz[5] as number); kz[5] = -(kc[6] as number) * kx - (kc[8] as number) * yk;
          acc += yk * (kn[2] as number) * 1.2;
          ex += acc;
        }
        if (tickOn) {
          const tx = tickX[wi] as number; tickX[wi] = 0;
          const tc = this.tc, tz = this.tz;
          const yt = (tc[0] as number) * tx + (tz[0] as number); tz[0] = -(tc[1] as number) * yt + (tz[1] as number); tz[1] = -(tc[0] as number) * tx - (tc[2] as number) * yt;
          ex += yt * this.tickNorm;
        }
        if (ratOn) {
          const rx = ratX[wi] as number; ratX[wi] = 0;
          const rc = this.rc, rz = this.rz, rnm = this.rattleNorm;
          let yr = (rc[0] as number) * rx + (rz[0] as number); rz[0] = -(rc[1] as number) * yr + (rz[1] as number); rz[1] = -(rc[0] as number) * rx - (rc[2] as number) * yr;
          let acc = yr * (rnm[0] as number);
          yr = (rc[3] as number) * rx + (rz[2] as number); rz[2] = -(rc[4] as number) * yr + (rz[3] as number); rz[3] = -(rc[3] as number) * rx - (rc[5] as number) * yr;
          acc += yr * (rnm[1] as number) * 0.8;
          yr = (rc[6] as number) * rx + (rz[4] as number); rz[4] = -(rc[7] as number) * yr + (rz[5] as number); rz[5] = -(rc[6] as number) * rx - (rc[8] as number) * yr;
          acc += yr * (rnm[2] as number) * 0.6;
          ex += acc * 0.035;
        }

        // ---- left / mono: bank mix -> muffler & body formants -> HP -> saturation ----
        const m = y0 + bal * y1;
        dl += dlc * (m - dl);
        let f = dl * direct + ex;
        y = f0b * m + z01; z01 = -f0a1 * y + z02; z02 = -f0b * m - f0a2 * y; f += g0 * y;
        y = f1b * m + z11; z11 = -f1a1 * y + z12; z12 = -f1b * m - f1a2 * y; f += g1 * y;
        y = f2b * m + z21; z21 = -f2a1 * y + z22; z22 = -f2b * m - f2a2 * y; f += g2 * y;
        y = f3b * m + z31; z31 = -f3a1 * y + z32; z32 = -f3b * m - f3a2 * y; f += g3 * y;
        let hy = hb0 * f + hz1;
        hz1 = hb1 * f - ha1 * hy + hz2;
        hz2 = hb2 * f - ha2 * hy;
        let u = hy * drive;
        if (u > 3) u = 3; else if (u < -3) u = -3;
        outL = ((u * (27 + u * u)) / (27 + 9 * u * u)) * satOut * fullAmt;

        if (stereo) {
          // right channel hears the other bank louder (side-exit headers / dual pipes)
          const mr = dual ? y1 + bal * y0 : m;
          dlR += dlc * (mr - dlR);
          f = dlR * direct + ex;
          y = f0b * mr + r01; r01 = -f0a1 * y + r02; r02 = -f0b * mr - f0a2 * y; f += g0 * y;
          y = f1b * mr + r11; r11 = -f1a1 * y + r12; r12 = -f1b * mr - f1a2 * y; f += g1 * y;
          y = f2b * mr + r21; r21 = -f2a1 * y + r22; r22 = -f2b * mr - f2a2 * y; f += g2 * y;
          y = f3b * mr + r31; r31 = -f3a1 * y + r32; r32 = -f3b * mr - f3a2 * y; f += g3 * y;
          hy = hb0 * f + hzR1;
          hzR1 = hb1 * f - ha1 * hy + hzR2;
          hzR2 = hb2 * f - ha2 * hy;
          u = hy * drive;
          if (u > 3) u = 3; else if (u < -3) u = -3;
          outR = ((u * (27 + u * u)) / (27 + 9 * u * u)) * satOut * fullAmt;
        }
      } else {
        mechX[wi] = 0; tickX[wi] = 0; ratX[wi] = 0;
      }

      if (doLite) {
        const el = e0 + bal * e1;
        lp = lp * pd + el;
        ln = ln * nd + el;
        lb += bc * (lp + ln * r1 * rasp - lb);
        ldl += dlc * (lb - ldl);
        let f = ldl * direct;
        let y = f0b * lb + lz01; lz01 = -f0a1 * y + lz02; lz02 = -f0b * lb - f0a2 * y; f += g0 * y * 1.4;
        y = f1b * lb + lz11; lz11 = -f1a1 * y + lz12; lz12 = -f1b * lb - f1a2 * y; f += g1 * y * 1.4;
        const hy = hb0 * f + lhz1;
        lhz1 = hb1 * f - ha1 * hy + lhz2;
        lhz2 = hb2 * f - ha2 * hy;
        let u = hy * drive;
        if (u > 3) u = 3; else if (u < -3) u = -3;
        const lo = ((u * (27 + u * u)) / (27 + 9 * u * u)) * satOut * liteAmt * liteGain;
        outL += lo;
        outR += lo;
      }

      // ---- pops (dry crack) and starter: centred ----
      let c = 0;
      if (popOn) {
        const px = popX[wi] as number; popX[wi] = 0;
        popEnv = popEnv * popD + px;
        const cr = popEnv * r1;
        crLp += crc * (cr - crLp);
        c += (cr - crLp) * 0.9;
      }
      if (starterAmt > 0) {
        sp += sInc; if (sp >= 1) sp -= 1;
        const s2 = sp * 2 - Math.floor(sp * 2);
        const s3 = sp * 3 - Math.floor(sp * 3);
        c += ((SIN[(sp * SIN_N) | 0] as number) + 0.5 * (SIN[(s2 * SIN_N) | 0] as number) + 0.3 * (SIN[(s3 * SIN_N) | 0] as number) + r1 * 0.2) * starterAmt;
      }
      outL += c;

      // ---- DC block, air absorption, gain ----
      dcy = outL - dcx + 0.9995 * dcy;
      dcx = outL;
      let o = dcy;
      if (ac < 1) {
        aoL += ac * (o - aoL);
        o = aoL;
      }
      L[i] = o * outG;
      if (stereo) {
        outR += c;
        dcyR = outR - dcxR + 0.9995 * dcyR;
        dcxR = outR;
        let orr = dcyR;
        if (ac < 1) {
          aoR += ac * (orr - aoR);
          orr = aoR;
        }
        (R as Float32Array)[i] = orr * outG;
      }
      w = (w + 1) | 0;
    }

    this.w = w;
    this.ns = ns;
    this.phase = phase;
    this.dphi = dphi;
    this.p0 = p0; this.p1 = p1; this.n0 = n0; this.n1 = n1; this.b0 = b0; this.b1 = b1;
    this.pl0 = pl0; this.pl1 = pl1; this.dl = dl; this.dlR = dlR;
    fz[0] = z01; fz[1] = z02; fz[2] = z11; fz[3] = z12; fz[4] = z21; fz[5] = z22; fz[6] = z31; fz[7] = z32;
    fzR[0] = r01; fzR[1] = r02; fzR[2] = r11; fzR[3] = r12; fzR[4] = r21; fzR[5] = r22; fzR[6] = r31; fzR[7] = r32;
    iz[0] = iz1; iz[1] = iz2; iz[2] = hz1i; iz[3] = hz2i;
    this.hz1 = hz1; this.hz2 = hz2; this.hzR1 = hzR1; this.hzR2 = hzR2;
    this.popEnv = popEnv; this.crLp = crLp; this.lkLp = lkLp; this.hsLp = hsLp;
    this.dcx = dcx; this.dcy = dcy; this.dcxR = dcxR; this.dcyR = dcyR;
    this.aoL = aoL; this.aoR = aoR;
    this.wp1 = wp1; this.wp2 = wp2; this.sp = sp;
    this.lp = lp; this.ln = ln; this.lb = lb; this.ldl = ldl;
    lz[0] = lz01; lz[1] = lz02; lz[2] = lz11; lz[3] = lz12;
    this.lhz1 = lhz1; this.lhz2 = lhz2;
  }
}
