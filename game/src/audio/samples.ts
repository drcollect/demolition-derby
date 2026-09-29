/*
 * Procedural one-shot and loop material, generated once at init (no audio files). Pure functions over
 * Float32Array with a seeded RNG and no DOM, so they can be rendered and checked in Node.
 *
 * Every generator returns a buffer normalised to a known peak; per-hit variation comes from picking
 * random variants, playback rates, filters and layer timing at trigger time (see sfx.ts).
 */

export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TWO_PI = Math.PI * 2;

function onePole(fc: number, sr: number): number {
  return 1 - Math.exp((-TWO_PI * Math.min(fc, sr * 0.49)) / sr);
}

/** Adds amp * e^(-t/tau) * sin(2 pi f t + phase) from sample `start` (recursive oscillator, wraps if loop). */
function addMode(b: Float32Array, sr: number, start: number, f: number, amp: number, tau: number, phase: number, wrap = false): void {
  if (f <= 0 || f >= sr * 0.45 || amp === 0) return;
  const w = (TWO_PI * f) / sr;
  const r = Math.exp(-1 / (tau * sr));
  const c = 2 * r * Math.cos(w);
  const r2 = r * r;
  let y1 = (amp / r) * Math.sin(phase - w);
  let y2 = (amp / r2) * Math.sin(phase - 2 * w);
  const len = Math.min(wrap ? b.length : b.length - start, Math.ceil(tau * sr * 9));
  const n = b.length;
  for (let i = 0; i < len; i++) {
    const y = c * y1 - r2 * y2;
    y2 = y1;
    y1 = y;
    const k = start + i;
    if (k < n) b[k] = (b[k] as number) + y;
    else if (wrap) b[k - n] = (b[k - n] as number) + y;
  }
}

/** Exponentially decaying noise burst, optionally one-pole low-passed. */
function addBurst(b: Float32Array, sr: number, start: number, dur: number, amp: number, tau: number, rnd: Rng, lpHz = 0, wrap = false): void {
  const len = Math.floor(dur * sr);
  const a = lpHz > 0 ? onePole(lpHz, sr) : 1;
  const n = b.length;
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const x = rnd() * 2 - 1;
    lp += a * (x - lp);
    const v = lp * amp * Math.exp(-i / (tau * sr));
    const k = start + i;
    if (k < n) b[k] = (b[k] as number) + v;
    else if (wrap) b[k - n] = (b[k - n] as number) + v;
  }
}

function normalize(b: Float32Array, peak: number): Float32Array {
  let m = 0;
  for (let i = 0; i < b.length; i++) {
    const v = Math.abs(b[i] as number);
    if (v > m) m = v;
  }
  if (m > 0) {
    const g = peak / m;
    for (let i = 0; i < b.length; i++) b[i] = (b[i] as number) * g;
  }
  return b;
}

function fadeIn(b: Float32Array, sr: number, sec: number): void {
  const n = Math.min(b.length, Math.floor(sec * sr));
  for (let i = 0; i < n; i++) b[i] = (b[i] as number) * (i / n);
}

function fadeOut(b: Float32Array, sr: number, sec: number): void {
  const n = Math.min(b.length, Math.floor(sec * sr));
  const s = b.length - n;
  for (let i = 0; i < n; i++) b[s + i] = (b[s + i] as number) * (1 - i / n);
}

function lp1(b: Float32Array, fc: number, sr: number, passes = 1, loop = false): void {
  const a = onePole(fc, sr);
  for (let p = 0; p < passes; p++) {
    let y = 0;
    if (loop) for (let i = 0; i < b.length; i++) y += a * ((b[i] as number) - y); // warm-up round the loop
    for (let i = 0; i < b.length; i++) {
      y += a * ((b[i] as number) - y);
      b[i] = y;
    }
  }
}

function hp1(b: Float32Array, fc: number, sr: number, passes = 1): void {
  const a = onePole(fc, sr);
  for (let p = 0; p < passes; p++) {
    let y = 0;
    for (let i = 0; i < b.length; i++) {
      y += a * ((b[i] as number) - y);
      b[i] = (b[i] as number) - y;
    }
  }
}

/** Poisson event times on [0, dur) with time-varying rate (events/s). */
function events(dur: number, rate: (t: number) => number, rnd: Rng, max = 5000): number[] {
  const out: number[] = [];
  let t = 0;
  // thinning with a running bound
  for (let guard = 0; guard < max * 4 && out.length < max; guard++) {
    const r = Math.max(1e-3, rate(t));
    t += -Math.log(1 - rnd()) / r;
    if (t >= dur) break;
    out.push(t);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// Impact layers

/** Body-mass thump: falling sine + low-passed noise. */
export function genThump(sr: number, rnd: Rng): Float32Array {
  const n = Math.floor(0.45 * sr);
  const b = new Float32Array(n);
  const f0 = 95 + 45 * rnd();
  const f1 = 36 + 12 * rnd();
  const kf = Math.exp(-1 / (0.05 * sr));
  const tauA = 0.09 + 0.09 * rnd();
  const aN = onePole(260, sr);
  let f = f0;
  let ph = 0;
  let lpN = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    f = f1 + (f - f1) * kf;
    ph += (TWO_PI * f) / sr;
    lpN += aN * (rnd() * 2 - 1 - lpN);
    b[i] = Math.sin(ph) * (1 - Math.exp(-t / 0.0015)) * Math.exp(-t / tauA) + lpN * Math.exp(-t / 0.035) * 2.2;
  }
  addBurst(b, sr, 0, 0.004, 0.25, 0.0008, rnd, 3000);
  fadeOut(b, sr, 0.05);
  return normalize(b, 0.95);
}

/** Crumpling sheet metal: a decaying storm of buckling snaps over a filtered noise bed. */
export function genCrunch(sr: number, rnd: Rng): Float32Array {
  const dur = 0.35 + 0.2 * rnd();
  const n = Math.floor(dur * sr);
  const b = new Float32Array(n);
  const tau = 0.05 + 0.07 * rnd();
  const rate0 = 900 + 1500 * rnd();
  const aH = onePole(350, sr);
  const aL = onePole(4500, sr);
  let lp = 0;
  let hp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    lp += aL * (rnd() * 2 - 1 - lp);
    hp += aH * (lp - hp);
    b[i] = (lp - hp) * Math.exp(-t / (tau * 1.3)) * (1 - Math.exp(-t / 0.001)) * 0.35;
  }
  for (const t of events(dur - 0.01, (x) => rate0 * Math.exp(-x / tau) + 25, rnd)) {
    let a = rnd() * rnd() * Math.exp(-t / (tau * 1.8));
    if (rnd() < 0.08) a *= 2.5;
    const s = Math.floor(t * sr);
    addBurst(b, sr, s, 0.0005 + 0.003 * rnd(), a * 0.8, 0.0003 + 0.0012 * rnd(), rnd);
    addMode(b, sr, s, 900 + 4600 * rnd(), a * 0.6, 0.002 + 0.007 * rnd(), rnd() * TWO_PI);
  }
  fadeOut(b, sr, 0.04);
  return normalize(b, 0.95);
}

/** Struck sheet-metal panel: inharmonic plate modes with beating pairs. */
export function genRing(sr: number, rnd: Rng, f0: number, seconds = 1.5): Float32Array {
  const n = Math.floor(seconds * sr);
  const b = new Float32Array(n);
  const ratios = [1, 1.58, 2.08, 2.73, 3.36, 4.18, 5.01, 6.12, 7.3];
  for (let k = 0; k < ratios.length; k++) {
    const f = f0 * (ratios[k] as number) * (1 + 0.1 * (rnd() - 0.5));
    const amp = (0.35 + 0.65 * rnd()) / (1 + 0.3 * k);
    const t60 = (1.2 - 0.09 * k) * (0.5 + 0.7 * rnd()) * (seconds / 1.5);
    const tau = Math.max(0.03, t60 / 6.91);
    addMode(b, sr, 0, f, amp, tau, rnd() * TWO_PI);
    if (rnd() < 0.5) addMode(b, sr, 0, f * (1.002 + 0.006 * rnd()), amp * 0.6, tau * 0.9, rnd() * TWO_PI);
  }
  addBurst(b, sr, 0, 0.002, 0.4, 0.0005, rnd);
  fadeIn(b, sr, 0.0008);
  fadeOut(b, sr, 0.12);
  return normalize(b, 0.9);
}

/** Small metal part: a short bright ping. */
export function genPing(sr: number, rnd: Rng): Float32Array {
  const n = Math.floor(0.3 * sr);
  const b = new Float32Array(n);
  const f = 1500 + 5000 * rnd();
  const k = 2 + Math.floor(rnd() * 2);
  for (let j = 0; j < k; j++) {
    addMode(b, sr, 0, f * (j === 0 ? 1 : 1.3 + 1.6 * rnd()), 1 / (1 + j), 0.01 + 0.06 * rnd(), rnd() * TWO_PI);
  }
  addBurst(b, sr, 0, 0.0015, 0.5, 0.0004, rnd);
  fadeIn(b, sr, 0.0003);
  fadeOut(b, sr, 0.03);
  return normalize(b, 0.9);
}

/** Dry concrete crack: broadband burst plus crumbling grit. */
export function genConcrete(sr: number, rnd: Rng): Float32Array {
  const dur = 0.35;
  const n = Math.floor(dur * sr);
  const b = new Float32Array(n);
  const tau = 0.02 + 0.015 * rnd();
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    b[i] = (rnd() * 2 - 1) * (1 - Math.exp(-t / 0.0003)) * Math.exp(-t / tau);
  }
  hp1(b, 300, sr);
  lp1(b, 5000, sr);
  for (const t of events(dur - 0.02, (x) => 300 * Math.exp(-x / 0.08) + 5, rnd)) {
    addBurst(b, sr, Math.floor(t * sr), 0.0003 + 0.001 * rnd(), rnd() * rnd() * 0.6, 0.0004, rnd, 3500);
  }
  fadeOut(b, sr, 0.03);
  return normalize(b, 0.95);
}

/** Dirt impact: muffled thud plus gravel spray. */
export function genDirt(sr: number, rnd: Rng): Float32Array {
  const dur = 0.5;
  const n = Math.floor(dur * sr);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    b[i] = (rnd() * 2 - 1) * (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.07);
  }
  lp1(b, 420, sr, 2);
  normalize(b, 1);
  for (const t of events(dur - 0.02, (x) => 220 * Math.exp(-x / 0.14) + 4, rnd)) {
    addBurst(b, sr, Math.floor(t * sr), 0.0004, rnd() * rnd() * 0.35, 0.00025, rnd, 3000);
  }
  fadeOut(b, sr, 0.05);
  return normalize(b, 0.95);
}

/** Metal tearing: gliding resonances driven by stick-slip grinding. */
export function genTear(sr: number, rnd: Rng): Float32Array {
  const dur = 0.45 + 0.15 * rnd();
  const n = Math.floor(dur * sr);
  const b = new Float32Array(n);
  const fs = 2000 + 1000 * rnd();
  const fe = 800 + 400 * rnd();
  const ratio = 1.5 + 0.25 * rnd();
  let gate = 0;
  let gateT = 0;
  let segLeft = 0;
  const ga = onePole(300, sr);
  let z1a = 0, z2a = 0, z1b = 0, z2b = 0;
  let b0a = 0, a1a = 0, a2a = 0, b0b = 0, a1b = 0, a2b = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 31) === 0) {
      const f1 = fe + (fs - fe) * Math.exp(-t / 0.12);
      const set = (f: number, q: number): [number, number, number] => {
        const w0 = (TWO_PI * Math.min(f, sr * 0.45)) / sr;
        const al = Math.sin(w0) / (2 * q);
        const a0 = 1 + al;
        return [al / a0, (-2 * Math.cos(w0)) / a0, (1 - al) / a0];
      };
      [b0a, a1a, a2a] = set(f1, 9);
      [b0b, a1b, a2b] = set(f1 * ratio, 12);
    }
    if (--segLeft <= 0) {
      segLeft = Math.floor((0.008 + 0.022 * rnd()) * sr);
      gateT = 0.2 + 0.8 * rnd();
    }
    gate += ga * (gateT - gate);
    const env = (1 - Math.exp(-t / 0.012)) * (t > dur - 0.2 ? Math.max(0, (dur - t) / 0.2) : 1);
    const x = (rnd() * 2 - 1) * gate * env;
    let y = b0a * x + z1a;
    z1a = -a1a * y + z2a;
    z2a = -b0a * x - a2a * y;
    let o = y;
    y = b0b * x + z1b;
    z1b = -a1b * y + z2b;
    z2b = -b0b * x - a2b * y;
    o += y * 0.6;
    b[i] = o;
  }
  for (const t of events(dur - 0.05, () => 60, rnd)) {
    addBurst(b, sr, Math.floor(t * sr), 0.0006, 0.08 * rnd(), 0.0003, rnd);
  }
  fadeOut(b, sr, 0.03);
  return normalize(b, 0.9);
}

// ------------------------------------------------------------------------------------------------
// Glass

export function genTinkle(sr: number, rnd: Rng): Float32Array {
  const n = Math.floor(0.12 * sr);
  const b = new Float32Array(n);
  const f = 3000 + 8000 * rnd();
  const k = 2 + Math.floor(rnd() * 2);
  for (let j = 0; j < k; j++) {
    addMode(b, sr, 0, f * (j === 0 ? 1 : 1.35 + 1.2 * rnd()), 1 / (1 + j * 0.7), 0.004 + 0.026 * rnd(), rnd() * TWO_PI);
  }
  addBurst(b, sr, 0, 0.0006, 0.4, 0.00015, rnd);
  fadeIn(b, sr, 0.0002);
  fadeOut(b, sr, 0.02);
  return normalize(b, 0.9);
}

/** The initial shatter: bright noise crash sprinkled with micro fractures. */
export function genGlassBurst(sr: number, rnd: Rng): Float32Array {
  const dur = 0.45;
  const n = Math.floor(dur * sr);
  const b = new Float32Array(n);
  const tau = 0.06 + 0.03 * rnd();
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    b[i] = (rnd() * 2 - 1) * (1 - Math.exp(-t / 0.0004)) * Math.exp(-t / tau) * 0.6;
  }
  hp1(b, 1800, sr, 2);
  for (const t of events(dur - 0.02, (x) => 2500 * Math.exp(-x / 0.07) + 40, rnd)) {
    addMode(b, sr, Math.floor(t * sr), 3500 + 9500 * rnd(), rnd() * rnd() * Math.exp(-t / 0.1), 0.002 + 0.006 * rnd(), rnd() * TWO_PI);
  }
  fadeOut(b, sr, 0.04);
  return normalize(b, 0.95);
}

/** Tempered-glass cubes raining down and bouncing: dense at first, thinning out over ~1 s. */
export function genGlassRain(sr: number, rnd: Rng): Float32Array {
  const dur = 1.0;
  const n = Math.floor(dur * sr);
  const b = new Float32Array(n);
  for (const t of events(dur - 0.03, (x) => 320 * Math.exp(-x / 0.2) + 30 * Math.exp(-x / 0.5), rnd)) {
    const a = (0.2 + 0.8 * rnd() * rnd()) * (0.45 + 0.55 * Math.exp(-t / 0.35));
    const s = Math.floor(t * sr);
    const f = 2500 + 8000 * rnd();
    const tau = 0.003 + 0.017 * rnd();
    addMode(b, sr, s, f, a, tau, rnd() * TWO_PI);
    addMode(b, sr, s, f * (1.4 + 0.9 * rnd()), a * 0.5, tau * 0.7, rnd() * TWO_PI);
    addBurst(b, sr, s, 0.0003, a * 0.3, 0.0001, rnd);
  }
  fadeOut(b, sr, 0.05);
  return normalize(b, 0.9);
}

// ------------------------------------------------------------------------------------------------
// Arena extras

/** Chain-link catch fence shaken by a wall hit. */
export function genFence(sr: number, rnd: Rng): Float32Array {
  const dur = 1.1;
  const n = Math.floor(dur * sr);
  const b = new Float32Array(n);
  const fw = 7 + 5 * rnd();
  for (const t of events(dur - 0.03, (x) => 650 * Math.exp(-x / 0.3) * Math.max(0, 1 + 0.8 * Math.sin(TWO_PI * fw * x)) + 8, rnd)) {
    const a = Math.pow(rnd(), 1.5) * Math.exp(-t / 0.4);
    const s = Math.floor(t * sr);
    addBurst(b, sr, s, 0.0004, a * 0.5, 0.00015, rnd);
    addMode(b, sr, s, 1800 + 3700 * rnd(), a, 0.002 + 0.004 * rnd(), rnd() * TWO_PI);
  }
  fadeOut(b, sr, 0.05);
  return normalize(b, 0.9);
}

/** Fuel igniting: a deep soft "whoomp". */
export function genWhoomp(sr: number, rnd: Rng): Float32Array {
  const dur = 1.6;
  const n = Math.floor(dur * sr);
  const b = new Float32Array(n);
  let y1 = 0;
  let y2 = 0;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const fc = t < 0.1 ? 120 + 900 * (t / 0.1) : 1020 * Math.exp(-(t - 0.1) / 0.4) + 180;
    const a = onePole(fc, sr);
    y1 += a * (rnd() * 2 - 1 - y1);
    y2 += a * (y1 - y2);
    const env = (1 - Math.exp(-t / 0.045)) * Math.exp(-t / 0.5);
    const fs = 38 + 30 * (1 - Math.exp(-t / 0.08)) * Math.exp(-t / 0.6);
    ph += (TWO_PI * fs) / sr;
    const sub = Math.sin(ph) * (1 - Math.exp(-t / 0.03)) * Math.exp(-t / 0.3);
    b[i] = y2 * env * 3 + sub * 0.8;
  }
  for (const t of events(0.5, (x) => 80 * Math.exp(-x / 0.2), rnd)) {
    addBurst(b, sr, Math.floor(t * sr), 0.001, 0.15 * rnd(), 0.0004, rnd, 2500);
  }
  fadeOut(b, sr, 0.2);
  return normalize(b, 0.95);
}

/** Seamless loop of a burning car: low roar plus crackles. */
export function genFireLoop(sr: number, rnd: Rng, seconds = 4): Float32Array {
  const n = Math.floor(seconds * sr);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = rnd() * 2 - 1;
  lp1(b, 200, sr, 2, true);
  normalize(b, 0.5);
  const k = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) b[i] = (b[i] as number) * (0.7 + 0.3 * Math.sin((TWO_PI * k * i) / n));
  for (const t of events(seconds, () => 40, rnd)) {
    const s = Math.floor(t * sr);
    const a = Math.pow(rnd(), 3);
    addBurst(b, sr, s, 0.0003 + 0.0017 * rnd(), a * 0.9, 0.0004, rnd, 0, true);
    addMode(b, sr, s, 700 + 2100 * rnd(), a * 0.5, 0.001 + 0.003 * rnd(), rnd() * TWO_PI, true);
  }
  return normalize(b, 0.8);
}

/** Seamless applause loop for cheers. */
export function genApplause(sr: number, rnd: Rng, seconds = 4): Float32Array {
  const n = Math.floor(seconds * sr);
  const b = new Float32Array(n);
  for (const t of events(seconds, () => 280, rnd, 4000)) {
    const s = Math.floor(t * sr);
    const len = Math.floor((0.003 + 0.004 * rnd()) * sr);
    const al = onePole(1500 + 2500 * rnd(), sr);
    const ah = onePole(600 + 600 * rnd(), sr);
    const amp = 0.3 + 0.7 * rnd();
    let lp = 0;
    let hp = 0;
    for (let i = 0; i < len; i++) {
      lp += al * (rnd() * 2 - 1 - lp);
      hp += ah * (lp - hp);
      const k = (s + i) % n;
      b[k] = (b[k] as number) + (lp - hp) * amp * Math.exp(-i / (0.0015 * sr));
    }
  }
  return normalize(b, 0.8);
}

// ------------------------------------------------------------------------------------------------
// Loops and modulators

export function genWhite(sr: number, rnd: Rng, seconds: number): Float32Array {
  const n = Math.floor(seconds * sr);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = rnd() * 2 - 1;
  return b;
}

/** Pink noise (Kellet filter), crossfaded so it loops without a seam. Peak ~1. */
export function genPink(sr: number, rnd: Rng, seconds: number): Float32Array {
  const n = Math.floor(seconds * sr);
  const x = Math.floor(0.05 * sr);
  const tmp = new Float32Array(n + x);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n + x; i++) {
    const wv = rnd() * 2 - 1;
    b0 = 0.99765 * b0 + wv * 0.099046;
    b1 = 0.963 * b1 + wv * 0.2965164;
    b2 = 0.57 * b2 + wv * 1.0526913;
    tmp[i] = (b0 + b1 + b2 + wv * 0.1848) * 0.2;
  }
  const b = tmp.slice(0, n);
  for (let i = 0; i < x; i++) {
    const g = i / x;
    b[i] = (tmp[i] as number) * g + (tmp[n + i] as number) * (1 - g);
  }
  return normalize(b, 1);
}

/** Smooth random modulator in [-1, 1] that loops exactly (integer cycles per loop). */
export function genBabble(sr: number, rnd: Rng, seconds: number, fMin = 0.4, fMax = 4.5, parts = 7): Float32Array {
  const n = Math.floor(seconds * sr);
  const b = new Float32Array(n);
  for (let p = 0; p < parts; p++) {
    const cycles = Math.max(1, Math.round((fMin + (fMax - fMin) * rnd()) * seconds));
    const ph = rnd() * TWO_PI;
    const amp = 0.5 + 0.5 * rnd();
    const w = (TWO_PI * cycles) / n;
    for (let i = 0; i < n; i++) b[i] = (b[i] as number) + amp * Math.sin(w * i + ph);
  }
  return normalize(b, 1);
}

/** Stick-slip gate: random levels in [0.15, 1] held for ~1/rate s, lightly smoothed. Loops. */
export function genJitter(sr: number, rnd: Rng, seconds: number, rate: number): Float32Array {
  const n = Math.floor(seconds * sr);
  const b = new Float32Array(n);
  let i = 0;
  while (i < n) {
    const len = Math.max(8, Math.floor((-Math.log(1 - rnd()) / rate) * sr));
    const v = 0.15 + 0.85 * rnd() * (rnd() < 0.15 ? 0.3 : 1);
    for (let j = 0; j < len && i < n; j++, i++) b[i] = v;
  }
  lp1(b, 250, sr, 1, true);
  return normalize(b, 1);
}

/** Open-air arena reverb: stand/wall slaps then a short, darkening diffuse tail. */
export function genReverbIR(sr: number, rnd: Rng, seconds = 1.4): [Float32Array, Float32Array] {
  const n = Math.floor(seconds * sr);
  const out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  const pre = 0.012;
  const rt60 = 1.25;
  for (let ch = 0; ch < 2; ch++) {
    const b = out[ch] as Float32Array;
    let lp = 0;
    let a = 1;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (t < pre) continue;
      const tt = t - pre;
      if ((i & 31) === 0) a = onePole(7000 * Math.exp(-tt / 0.5) + 1100, sr);
      lp += a * (rnd() * 2 - 1 - lp);
      b[i] = lp * Math.exp((-tt * 6.91) / rt60) * (1 - Math.exp(-tt / 0.02));
    }
    for (let k = 0; k < 7; k++) {
      const t = 0.016 + 0.07 * rnd();
      const idx = Math.floor(t * sr);
      if (idx < n) b[idx] = (b[idx] as number) + (0.35 + 0.45 * rnd()) * (rnd() < 0.5 ? -1 : 1) * 0.6;
    }
    let e = 0;
    for (let i = 0; i < n; i++) e += (b[i] as number) * (b[i] as number);
    const g = 1 / Math.sqrt(e || 1);
    for (let i = 0; i < n; i++) b[i] = (b[i] as number) * g;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------

/** Sample rate used for the slow modulator loops (babble, jitter). */
export const MOD_SR = 8000;

export interface SampleSet {
  thump: Float32Array[];
  crunch: Float32Array[];
  ring: Float32Array[]; // sorted low -> high
  ping: Float32Array[];
  concrete: Float32Array[];
  dirt: Float32Array[];
  tear: Float32Array[];
  tinkle: Float32Array[];
  glassBurst: Float32Array[];
  glassRain: Float32Array[];
  fence: Float32Array[];
  whoomp: Float32Array[];
  fire: Float32Array[];
  applause: Float32Array[];
  white: Float32Array[];
  pink: Float32Array[];
  /** at MOD_SR */
  babble: Float32Array[];
  /** at MOD_SR */
  jitter: Float32Array[];
  irL: Float32Array;
  irR: Float32Array;
}

/** Generation jobs, cheapest-and-most-needed first, so init can yield between them. */
export function sampleJobs(sr: number, seed = 20260923): Array<(s: Partial<SampleSet>) => void> {
  const rnd = makeRng(seed);
  const push = <K extends keyof SampleSet>(s: Partial<SampleSet>, k: K, v: Float32Array): void => {
    const arr = (s[k] as Float32Array[] | undefined) ?? [];
    arr.push(v);
    (s as Record<string, unknown>)[k] = arr;
  };
  const jobs: Array<(s: Partial<SampleSet>) => void> = [];
  jobs.push((s) => { push(s, 'white', genWhite(sr, rnd, 2.5)); });
  jobs.push((s) => { push(s, 'pink', genPink(sr, rnd, 6)); });
  jobs.push((s) => { push(s, 'pink', genPink(sr, rnd, 6.5)); });
  jobs.push((s) => {
    push(s, 'babble', genBabble(MOD_SR, rnd, 7));
    push(s, 'babble', genBabble(MOD_SR, rnd, 9));
  });
  jobs.push((s) => {
    push(s, 'jitter', genJitter(MOD_SR, rnd, 3, 45));
    push(s, 'jitter', genJitter(MOD_SR, rnd, 3.3, 22));
  });
  jobs.push((s) => { const [l, r] = genReverbIR(sr, rnd); s.irL = l; s.irR = r; });
  for (let i = 0; i < 6; i++) jobs.push((s) => { push(s, 'thump', genThump(sr, rnd)); });
  for (let i = 0; i < 10; i++) jobs.push((s) => { push(s, 'crunch', genCrunch(sr, rnd)); });
  const ringF = [150, 190, 235, 290, 350, 420, 510, 620, 760, 930, 1150, 1400];
  for (const f of ringF) jobs.push((s) => { push(s, 'ring', genRing(sr, rnd, f, f > 900 ? 0.9 : 1.5)); });
  jobs.push((s) => { for (let i = 0; i < 12; i++) push(s, 'ping', genPing(sr, rnd)); });
  jobs.push((s) => { for (let i = 0; i < 4; i++) push(s, 'concrete', genConcrete(sr, rnd)); });
  jobs.push((s) => { for (let i = 0; i < 4; i++) push(s, 'dirt', genDirt(sr, rnd)); });
  for (let i = 0; i < 4; i++) jobs.push((s) => { push(s, 'tear', genTear(sr, rnd)); });
  jobs.push((s) => { for (let i = 0; i < 16; i++) push(s, 'tinkle', genTinkle(sr, rnd)); });
  jobs.push((s) => { for (let i = 0; i < 4; i++) push(s, 'glassBurst', genGlassBurst(sr, rnd)); });
  for (let i = 0; i < 3; i++) jobs.push((s) => { push(s, 'glassRain', genGlassRain(sr, rnd)); });
  for (let i = 0; i < 3; i++) jobs.push((s) => { push(s, 'fence', genFence(sr, rnd)); });
  for (let i = 0; i < 2; i++) jobs.push((s) => { push(s, 'whoomp', genWhoomp(sr, rnd)); });
  jobs.push((s) => { push(s, 'fire', genFireLoop(sr, rnd)); });
  jobs.push((s) => { push(s, 'applause', genApplause(sr, rnd)); });
  return jobs;
}
