// Test bench for src/audio. Served by Vite at /dev/audio.html.
import * as THREE from 'three';
import { DerbyAudio, type EngineProfile, type EngineVoice, type ImpactKind, type UiSound } from '../src/audio/audio';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};
const logEl = $('log');
function log(msg: string, cls = ''): void {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = `${new Date().toLocaleTimeString()}  ${msg}`;
  logEl.prepend(line);
}
// capture warnings/errors from the audio module and elsewhere
for (const level of ['warn', 'error'] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]): void => {
    orig(...args);
    log(`${level}: ${args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ')}`, 'bad');
  };
}
window.addEventListener('error', (e) => log(`error: ${e.message}`, 'bad'));
window.addEventListener('unhandledrejection', (e) => log(`unhandled rejection: ${String(e.reason)}`, 'bad'));

const PROFILES: EngineProfile[] = ['v8big', 'v8wagon', 'v8muscle', 'i4', 'v8truck'];
const IDLE: Record<EngineProfile, number> = { v8big: 700, v8wagon: 680, v8muscle: 900, i4: 850, v8truck: 650 };
const REDLINE: Record<EngineProfile, number> = { v8big: 5200, v8wagon: 5000, v8muscle: 6500, i4: 6300, v8truck: 4800 };

// ?awake keeps audio running in a hidden tab/pane (for automated testing); default is the game default.
const params = new URLSearchParams(location.search);
const audio = new DerbyAudio({ pauseWhenHidden: !params.has('awake') });
(window as unknown as { derbyAudio: DerbyAudio }).derbyAudio = audio;

// --- the API must be callable (as a no-op) before init -------------------------------------------
{
  const v = new THREE.Vector3(1, 0, -5);
  try {
    audio.setListener(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0));
    audio.setMasterVolume(0.8);
    audio.setMuted(false);
    const e = audio.createEngine('v8big', false);
    e.update({ rpm: 800, throttle: 0, load: 0, position: v, damage: 0, dead: false });
    e.dispose();
    audio.impact(v, 0.5, 'car');
    audio.glass(v, 0.9);
    audio.scrape(0, v, 1);
    audio.skid(0, v, 1);
    audio.partOff(v);
    audio.wreck(v);
    audio.horn(0, v, true);
    audio.crowd.setExcitement(0.25);
    audio.crowd.cheer(1);
    audio.ui('select');
    log(`pre-init calls ok (ready=${audio.ready})`, 'good');
  } catch (err) {
    log(`pre-init call threw: ${String(err)}`, 'bad');
  }
}

// --- sliders ------------------------------------------------------------------------------------
function slider(id: string, fmt: (v: number) => string = (v) => v.toFixed(2)): HTMLInputElement {
  const el = $<HTMLInputElement>(id);
  const out = el.parentElement?.querySelector('output');
  const upd = (): void => {
    if (out) out.textContent = fmt(parseFloat(el.value));
  };
  el.addEventListener('input', upd);
  upd();
  return el;
}
function setSlider(el: HTMLInputElement, v: number): void {
  el.value = String(v);
  el.dispatchEvent(new Event('input'));
}
const sDist = slider('dist', (v) => `${v.toFixed(1)} m`);
const sAz = slider('az', (v) => `${v.toFixed(0)}°`);
const sStrength = slider('strength');
const sRpm = slider('rpm', (v) => v.toFixed(0));
const sThr = slider('thr');
const sLoad = slider('load');
const sDmg = slider('dmg');
const sInt = slider('intensity');
const sSurf = slider('surface');
const sExc = slider('excite');
const sCheer = slider('cheerS');
const num = (el: HTMLInputElement): number => parseFloat(el.value);

const LISTENER = new THREE.Vector3(0, 1.5, 0);
const FWD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
function sourcePos(): THREE.Vector3 {
  const d = num(sDist);
  const a = THREE.MathUtils.degToRad(num(sAz));
  return new THREE.Vector3(Math.sin(a) * d, 0.6, -Math.cos(a) * d);
}

// --- header -------------------------------------------------------------------------------------
$('init').addEventListener('click', async () => {
  const t0 = performance.now();
  await audio.init();
  log(`init resolved in ${(performance.now() - t0).toFixed(0)} ms, ready=${audio.ready}, state=${audio.stats().state}, worklet=${audio.stats().worklet}`, audio.ready ? 'good' : 'bad');
  audio.crowd.setExcitement(num(sExc));
});
$<HTMLInputElement>('vol').addEventListener('input', (e) => audio.setMasterVolume(parseFloat((e.target as HTMLInputElement).value)));
$<HTMLInputElement>('mute').addEventListener('change', (e) => audio.setMuted((e.target as HTMLInputElement).checked));

// --- one-shots ----------------------------------------------------------------------------------
document.querySelectorAll<HTMLButtonElement>('[data-impact]').forEach((b) =>
  b.addEventListener('click', () => audio.impact(sourcePos(), num(sStrength), b.dataset.impact as ImpactKind)),
);
$('glass').addEventListener('click', () => audio.glass(sourcePos(), num(sStrength)));
$('partoff').addEventListener('click', () => audio.partOff(sourcePos()));
$('wreck').addEventListener('click', () => audio.wreck(sourcePos()));
const randPos = (rMin: number, rMax: number): THREE.Vector3 => {
  const a = Math.random() * Math.PI * 2;
  const r = rMin + Math.random() * (rMax - rMin);
  return new THREE.Vector3(Math.cos(a) * r, 0.6, Math.sin(a) * r);
};
const KINDS: ImpactKind[] = ['car', 'car', 'wall', 'ground', 'debris'];
$('pileup').addEventListener('click', () => {
  for (let i = 0; i < 15; i++) {
    setTimeout(() => {
      const kind = KINDS[Math.floor(Math.random() * KINDS.length)] as ImpactKind;
      audio.impact(randPos(4, 20), 0.3 + Math.random() * 0.7, kind);
      if (Math.random() < 0.3) audio.glass(randPos(4, 20), Math.random());
    }, Math.random() * 2000);
  }
});
$('spam').addEventListener('click', () => {
  const p = sourcePos();
  for (let i = 0; i < 30; i++) setTimeout(() => audio.impact(p.clone().addScalar(Math.random() * 0.3), num(sStrength) * (0.7 + 0.3 * Math.random()), 'car'), i * 10);
});
let randomHits = false;
$('randomhits').addEventListener('click', (e) => {
  randomHits = !randomHits;
  (e.target as HTMLElement).textContent = `random hits: ${randomHits ? 'on' : 'off'}`;
  (e.target as HTMLElement).classList.toggle('on', randomHits);
});

// --- engine -------------------------------------------------------------------------------------
let engine: EngineVoice | null = null;
let engineProfile: EngineProfile = 'v8muscle';
let enginePlayer = true;
type Auto = { kind: 'rev' | 'drive' | 'driveby' | 'tour'; t: number; i?: number };
let auto: Auto | null = null;
const drivePos = new THREE.Vector3();
const driveVel = new THREE.Vector3();

function createEngine(): void {
  engine?.dispose();
  engineProfile = $<HTMLSelectElement>('profile').value as EngineProfile;
  enginePlayer = $<HTMLInputElement>('isplayer').checked;
  engine = audio.createEngine(engineProfile, enginePlayer);
  setSlider(sRpm, IDLE[engineProfile]);
  setSlider(sThr, 0);
  setSlider(sLoad, 0.1);
  log(`engine ${engineProfile} (${enginePlayer ? 'player' : 'AI'}) created`);
}
$('engcreate').addEventListener('click', createEngine);
$('engremove').addEventListener('click', () => {
  engine?.dispose();
  engine = null;
  auto = null;
});
$('rev').addEventListener('click', () => {
  if (!engine) createEngine();
  auto = { kind: 'rev', t: 0 };
});
$('drive').addEventListener('click', () => {
  if (!engine) createEngine();
  auto = { kind: 'drive', t: 0 };
});
$('driveby').addEventListener('click', () => {
  if (!engine || enginePlayer) {
    $<HTMLInputElement>('isplayer').checked = false;
    createEngine();
  }
  auto = { kind: 'driveby', t: 0 };
});
$('tour').addEventListener('click', () => {
  auto = { kind: 'tour', t: 0, i: -1 };
});

function runAuto(dt: number): void {
  if (!auto) return;
  auto.t += dt;
  const t = auto.t;
  const P = engineProfile;
  const idle = IDLE[P];
  const red = REDLINE[P];
  const lerp = (a: number, b: number, x: number): number => a + (b - a) * Math.min(1, Math.max(0, x));
  if (auto.kind === 'rev') {
    if (t < 1.1) {
      setSlider(sThr, 1);
      setSlider(sLoad, 0.25);
      setSlider(sRpm, lerp(idle, red * 0.9, t / 1.1));
    } else if (t < 3.2) {
      setSlider(sThr, 0);
      setSlider(sLoad, 0);
      setSlider(sRpm, Math.max(idle, red * 0.9 * Math.exp(-(t - 1.1) / 0.8)));
    } else {
      setSlider(sRpm, idle);
      setSlider(sLoad, 0.1);
      auto = null;
    }
  } else if (auto.kind === 'drive') {
    if (t < 2.4) {
      setSlider(sThr, 1);
      setSlider(sLoad, 1);
      setSlider(sRpm, lerp(1800, red * 0.95, t / 2.4));
    } else if (t < 2.6) {
      setSlider(sThr, 0.15);
      setSlider(sLoad, 0.3);
      setSlider(sRpm, lerp(red * 0.95, red * 0.62, (t - 2.4) / 0.2));
    } else if (t < 4.8) {
      setSlider(sThr, 1);
      setSlider(sLoad, 1);
      setSlider(sRpm, lerp(red * 0.62, red * 0.95, (t - 2.6) / 2.2));
    } else if (t < 7.5) {
      setSlider(sThr, 0);
      setSlider(sLoad, 0);
      setSlider(sRpm, lerp(red * 0.95, idle * 1.4, (t - 4.8) / 2.7));
    } else {
      setSlider(sRpm, idle);
      setSlider(sLoad, 0.1);
      auto = null;
    }
  } else if (auto.kind === 'driveby') {
    const x = -70 + 30 * t;
    drivePos.set(x, 0.6, -8);
    driveVel.set(30, 0, 0);
    setSlider(sThr, 0.7);
    setSlider(sLoad, 0.7);
    setSlider(sRpm, red * 0.7);
    if (x > 70) {
      auto = null;
      setSlider(sThr, 0);
      setSlider(sRpm, idle);
    }
  } else if (auto.kind === 'tour') {
    const seg = 5.5;
    const idx = Math.floor(t / seg);
    if (idx >= PROFILES.length) {
      auto = null;
      return;
    }
    if (idx !== auto.i) {
      auto.i = idx;
      $<HTMLSelectElement>('profile').value = PROFILES[idx] as string;
      $<HTMLInputElement>('isplayer').checked = true;
      createEngine();
      log(`tour: ${PROFILES[idx]}`);
    }
    const lt = t - idx * seg;
    const id2 = IDLE[engineProfile];
    const rd = REDLINE[engineProfile];
    if (lt < 1.5) setSlider(sRpm, id2), setSlider(sThr, 0);
    else if (lt < 2.6) setSlider(sThr, 1), setSlider(sLoad, 0.3), setSlider(sRpm, lerp(id2, rd * 0.9, (lt - 1.5) / 1.1));
    else if (lt < 4.6) setSlider(sThr, 0), setSlider(sLoad, 0), setSlider(sRpm, Math.max(id2, rd * 0.9 * Math.exp(-(lt - 2.6) / 0.8)));
    else setSlider(sRpm, id2), setSlider(sLoad, 0.1);
  }
}

// --- continuous holds ---------------------------------------------------------------------------
const held = new Set<string>();
document.querySelectorAll<HTMLButtonElement>('[data-hold]').forEach((b) => {
  const kind = b.dataset.hold as string;
  const on = (e: Event): void => {
    e.preventDefault();
    held.add(kind);
    b.classList.add('on');
  };
  const off = (): void => {
    if (!held.has(kind)) return;
    held.delete(kind);
    b.classList.remove('on');
    if (kind === 'horn') audio.horn(0, sourcePos(), false);
  };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off);
  b.addEventListener('pointercancel', off);
});

// --- crowd & ui -----------------------------------------------------------------------------------
sExc.addEventListener('input', () => audio.crowd.setExcitement(num(sExc)));
$('cheer').addEventListener('click', () => audio.crowd.cheer(num(sCheer)));
const UI: UiSound[] = ['countdown', 'go', 'select', 'back', 'points', 'wreck', 'lose', 'win'];
for (const k of UI) {
  const b = document.createElement('button');
  b.textContent = k;
  b.addEventListener('click', () => audio.ui(k));
  $('uibtns').appendChild(b);
}

// --- stress test ----------------------------------------------------------------------------------
interface StressCar {
  voice: EngineVoice;
  profile: EngineProfile;
  r: number;
  w: number;
  a: number;
  phase: number;
  player: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
}
let stress: StressCar[] = [];
$('stress').addEventListener('click', (e) => {
  const btn = e.target as HTMLElement;
  if (stress.length) {
    for (const c of stress) c.voice.dispose();
    stress = [];
    btn.textContent = '12 engines orbiting: off';
    btn.classList.remove('on');
    return;
  }
  for (let i = 0; i < 12; i++) {
    const profile = i === 0 ? 'v8muscle' : (PROFILES[i % PROFILES.length] as EngineProfile);
    const player = i === 0;
    stress.push({
      voice: audio.createEngine(profile, player),
      profile,
      r: player ? 5 : 6 + Math.random() * 32,
      w: (0.15 + Math.random() * 0.6) * (Math.random() < 0.5 ? -1 : 1),
      a: Math.random() * Math.PI * 2,
      phase: Math.random() * 10,
      player,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
    });
  }
  btn.textContent = '12 engines orbiting: on';
  btn.classList.add('on');
});

function runStress(dt: number, time: number): void {
  const fx = $<HTMLInputElement>('stressfx').checked;
  for (const [i, c] of stress.entries()) {
    c.a += c.w * dt * (c.player ? 0 : 1);
    const px = c.player ? 0 : Math.cos(c.a) * c.r;
    const pz = c.player ? -5 : Math.sin(c.a) * c.r;
    c.vel.set((px - c.pos.x) / Math.max(dt, 1e-3), 0, (pz - c.pos.z) / Math.max(dt, 1e-3));
    c.pos.set(px, 0.6, pz);
    const cyc = (time * 0.35 + c.phase) % 1;
    const thr = cyc < 0.55 ? 1 : cyc < 0.7 ? 0 : 0.3;
    const rpm = IDLE[c.profile] + (REDLINE[c.profile] * 0.85 - IDLE[c.profile]) * (cyc < 0.55 ? cyc / 0.55 : cyc < 0.7 ? 1 - (cyc - 0.55) / 0.15 * 0.6 : 0.4);
    c.voice.update({ rpm, throttle: thr, load: thr, position: c.pos, velocity: c.vel, damage: (i % 4) * 0.25, dead: false });
    if (fx && !c.player) {
      if (Math.random() < dt * 0.25) audio.impact(c.pos, 0.2 + Math.random() * 0.8, Math.random() < 0.7 ? 'car' : 'wall');
      if (i % 3 === 0 && cyc > 0.2 && cyc < 0.35) audio.scrape(i, c.pos, 0.7);
      if (i % 3 === 1 && cyc > 0.55 && cyc < 0.7) audio.skid(i, c.pos, 0.8);
    }
  }
}

// --- map ------------------------------------------------------------------------------------------
const map = $<HTMLCanvasElement>('map');
const mctx = map.getContext('2d');
function drawMap(): void {
  if (!mctx) return;
  const W = map.width;
  const H = map.height;
  const s = Math.min(W, H) / 90; // metres -> px (arena ~84 m)
  mctx.clearRect(0, 0, W, H);
  mctx.strokeStyle = '#2c313a';
  mctx.beginPath();
  mctx.arc(W / 2, H / 2, 42 * s, 0, Math.PI * 2);
  mctx.stroke();
  const pt = (p: THREE.Vector3, c: string, r: number): void => {
    mctx.fillStyle = c;
    mctx.beginPath();
    mctx.arc(W / 2 + p.x * s, H / 2 + p.z * s, r, 0, Math.PI * 2);
    mctx.fill();
  };
  pt(new THREE.Vector3(0, 0, 0), '#5fcf80', 5);
  mctx.strokeStyle = '#5fcf80';
  mctx.beginPath();
  mctx.moveTo(W / 2, H / 2);
  mctx.lineTo(W / 2, H / 2 - 14);
  mctx.stroke();
  pt(auto?.kind === 'driveby' ? drivePos : sourcePos(), '#f0a431', 5);
  for (const c of stress) pt(c.pos, c.player ? '#5fcf80' : '#8a93a3', 3.5);
}

// --- frame loop -----------------------------------------------------------------------------------
let last = performance.now();
let statusT = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  audio.setListener(LISTENER, FWD, UP);
  runAuto(dt);
  if (engine) {
    const pos = auto?.kind === 'driveby' ? drivePos : enginePlayer ? new THREE.Vector3(0, 0.6, -5) : sourcePos();
    engine.update({
      rpm: num(sRpm),
      throttle: num(sThr),
      load: num(sLoad),
      position: pos,
      velocity: auto?.kind === 'driveby' ? driveVel : undefined,
      damage: num(sDmg),
      dead: $<HTMLInputElement>('dead').checked,
    });
  }
  for (const k of held) {
    const p = sourcePos();
    if (k === 'scrape') audio.scrape(0, p, num(sInt));
    else if (k === 'skid') audio.skid(0, p, num(sInt), num(sSurf));
    else if (k === 'horn') audio.horn(0, p, true);
  }
  if (randomHits && Math.random() < dt * 2) {
    audio.impact(randPos(5, 30), Math.random(), KINDS[Math.floor(Math.random() * KINDS.length)] as ImpactKind);
  }
  if (stress.length) runStress(dt, now / 1000);
  statusT += dt;
  if (statusT > 0.25) {
    statusT = 0;
    const s = audio.stats();
    $('status').textContent =
      `state ${s.state} · ${s.sampleRate} Hz · worklet ${s.worklet ? 'yes' : 'no'} · engines full ${s.engines.full} / lite ${s.engines.lite} / off ${s.engines.off}` +
      ` · slots ${s.oneShotSlotsBusy} · loops ${s.loops} · sources ${s.sources} · limiter ${s.limiterReductionDb.toFixed(1)} dB`;
  }
  drawMap();
  schedule();
}
// rAF stops in hidden documents; fall back to a timer so ?awake testing keeps driving the voices
function schedule(): void {
  if (document.hidden) setTimeout(() => frame(performance.now()), 16);
  else requestAnimationFrame(frame);
}
schedule();

// --- offline level check --------------------------------------------------------------------------
interface Check {
  name: string;
  seconds: number;
  setup?: (a: DerbyAudio) => void;
  frame?: (a: DerbyAudio, t: number) => void;
}
const at = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, 0.6, z);
function engineCheck(name: string, profile: EngineProfile, player: boolean, script: (t: number) => { rpm: number; thr: number; load: number; dmg?: number; dead?: boolean }, seconds = 4, pos = at(0, -5)): Check {
  let v: EngineVoice | null = null;
  return {
    name,
    seconds,
    setup: (a) => {
      v = a.createEngine(profile, player);
    },
    frame: (_a, t) => {
      const s = script(t);
      v?.update({ rpm: s.rpm, throttle: s.thr, load: s.load, position: pos, damage: s.dmg ?? 0, dead: !!s.dead });
    },
  };
}
const revScript = (P: EngineProfile) => (t: number) =>
  t < 0.5 ? { rpm: IDLE[P], thr: 0, load: 0.1 }
  : t < 1.6 ? { rpm: IDLE[P] + (REDLINE[P] * 0.9 - IDLE[P]) * ((t - 0.5) / 1.1), thr: 1, load: 0.3 }
  : { rpm: Math.max(IDLE[P], REDLINE[P] * 0.9 * Math.exp(-(t - 1.6) / 0.8)), thr: 0, load: 0 };
const pullScript = (P: EngineProfile) => (t: number) =>
  t < 3 ? { rpm: 1800 + (REDLINE[P] * 0.95 - 1800) * (t / 3), thr: 1, load: 1 } : { rpm: REDLINE[P] * 0.95 * Math.exp(-(t - 3) / 1.5), thr: 0, load: 0 };

const once = (t: number, at0 = 0.2): boolean => Math.abs(t - at0) < 0.008;
// factories: every render needs fresh per-render state (voices are created in setup)
const CHECKS: Array<() => Check> = [
  () => engineCheck('engine idle v8big (player)', 'v8big', true, () => ({ rpm: 700, thr: 0, load: 0.1 })),
  () => engineCheck('engine rev v8muscle (player)', 'v8muscle', true, revScript('v8muscle')),
  () => engineCheck('engine pull i4 (player)', 'i4', true, pullScript('i4')),
  () => engineCheck('engine pull v8truck (player)', 'v8truck', true, pullScript('v8truck')),
  () => engineCheck('engine rev v8wagon AI @ 12 m', 'v8wagon', false, revScript('v8wagon'), 4, at(8, -9)),
  () => engineCheck('engine damaged v8big (player)', 'v8big', true, () => ({ rpm: 720, thr: 0.05, load: 0.2, dmg: 0.9 })),
  () => engineCheck('engine dies v8muscle (player)', 'v8muscle', true, (t) => ({ rpm: 2500, thr: 0.5, load: 0.5, dmg: 0.6, dead: t > 1 }), 3.5),
  () => {
    const cars: Array<{ v: EngineVoice; p: EngineProfile; r: number; a: number; w: number }> = [];
    return {
      name: '12 engines (stress)',
      seconds: 4,
      setup: (a: DerbyAudio): void => {
        for (let i = 0; i < 12; i++) {
          const p = PROFILES[i % 5] as EngineProfile;
          cars.push({ v: a.createEngine(p, i === 0), p, r: i === 0 ? 5 : 6 + i * 2.6, a: i, w: 0.4 });
        }
      },
      frame: (_a: DerbyAudio, t: number): void => {
        for (const c of cars) {
          const cyc = (t * 0.4 + c.a * 0.13) % 1;
          c.v.update({
            rpm: IDLE[c.p] + (REDLINE[c.p] * 0.85 - IDLE[c.p]) * cyc,
            throttle: cyc < 0.8 ? 1 : 0,
            load: 0.8,
            position: at(Math.cos(c.a + t * c.w) * c.r, Math.sin(c.a + t * c.w) * c.r),
            damage: 0.2,
            dead: false,
          });
        }
      },
    };
  },
  () => ({ name: 'impact car 1.0 @ 8 m', seconds: 2.5, frame: (a, t) => { if (once(t)) a.impact(at(3, -7), 1, 'car'); } }),
  () => ({ name: 'impact wall 1.0 @ 8 m', seconds: 2.5, frame: (a, t) => { if (once(t)) a.impact(at(-3, -7), 1, 'wall'); } }),
  () => ({ name: 'impact ground 0.8 @ 6 m', seconds: 2, frame: (a, t) => { if (once(t)) a.impact(at(0, -6), 0.8, 'ground'); } }),
  () => ({ name: 'impact car 0.1 (tap) @ 8 m', seconds: 1.5, frame: (a, t) => { if (once(t)) a.impact(at(3, -7), 0.1, 'car'); } }),
  () => ({ name: 'impact debris 0.5 @ 5 m', seconds: 1.5, frame: (a, t) => { if (once(t)) a.impact(at(2, -4), 0.5, 'debris'); } }),
  () => ({
    name: 'pile-up: 1.0 hits every frame for 0.6 s @ 3-12 m',
    seconds: 3,
    frame: (a, t) => {
      if (t > 0.2 && t < 0.8) a.impact(at(Math.sin(t * 40) * 6, -3 - Math.abs(Math.cos(t * 31)) * 9), 1, t * 60 % 2 < 1 ? 'car' : 'wall');
    },
  }),
  () => ({ name: 'glass crack 0.3 @ 4 m', seconds: 1.5, frame: (a, t) => { if (once(t)) a.glass(at(1, -4), 0.3); } }),
  () => ({ name: 'glass shatter 0.9 @ 4 m', seconds: 2, frame: (a, t) => { if (once(t)) a.glass(at(1, -4), 0.9); } }),
  () => ({ name: 'part off @ 6 m', seconds: 2.5, frame: (a, t) => { if (once(t)) a.partOff(at(2, -6)); } }),
  () => ({ name: 'wreck @ 10 m', seconds: 5, frame: (a, t) => { if (once(t)) a.wreck(at(4, -9)); } }),
  () => ({ name: 'scrape 1.0 @ 5 m (1.5 s)', seconds: 2.5, frame: (a, t) => { if (t > 0.2 && t < 1.7) a.scrape(1, at(2, -5), 1); } }),
  () => ({ name: 'skid 1.0 concrete @ 5 m (1.5 s)', seconds: 2.5, frame: (a, t) => { if (t > 0.2 && t < 1.7) a.skid(1, at(-2, -5), 1, 1); } }),
  () => ({ name: 'skid 1.0 dirt @ 5 m (1.5 s)', seconds: 2.5, frame: (a, t) => { if (t > 0.2 && t < 1.7) a.skid(1, at(-2, -5), 1, 0); } }),
  () => ({ name: 'horn @ 6 m (1 s)', seconds: 2, frame: (a, t) => { a.horn(2, at(0, -6), t > 0.2 && t < 1.2); } }),
  () => ({ name: 'crowd bed excitement 0.2', seconds: 4, setup: (a) => a.crowd.setExcitement(0.2) }),
  () => ({ name: 'crowd bed excitement 1.0', seconds: 4, setup: (a) => a.crowd.setExcitement(1) }),
  () => ({ name: 'crowd cheer 1.0', seconds: 5, setup: (a) => a.crowd.setExcitement(0.3), frame: (a, t) => { if (once(t)) a.crowd.cheer(1); } }),
  () => ({
    name: 'ui: all 8 in sequence',
    seconds: 8,
    frame: (a, t) => {
      const i = Math.round(t / 0.9);
      if (Math.abs(t - i * 0.9) < 0.008 && i >= 0 && i < UI.length) a.ui(UI[i] as UiSound);
    },
  }),
];

function analyse(buf: AudioBuffer): { peak: number; rms: number; st: number; nan: number; clip: number } {
  let peak = 0;
  let sum = 0;
  let nan = 0;
  let clip = 0;
  let st = 0;
  const win = Math.floor(buf.sampleRate * 0.05);
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const n = buf.length;
  for (let i0 = 0; i0 < n; i0 += win) {
    let s = 0;
    let cnt = 0;
    for (const ch of chans) {
      for (let i = i0; i < Math.min(n, i0 + win); i++) {
        const v = ch[i] as number;
        if (!Number.isFinite(v)) {
          nan++;
          continue;
        }
        const av = Math.abs(v);
        if (av > peak) peak = av;
        if (av >= 1) clip++;
        s += v * v;
        cnt++;
      }
    }
    sum += s;
    if (cnt) st = Math.max(st, Math.sqrt(s / cnt));
  }
  return { peak, rms: Math.sqrt(sum / (n * chans.length)), st, nan, clip };
}
const db = (v: number): string => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');

interface LevelRow {
  name: string;
  peak: number;
  rms: number;
  st: number;
  rawPeak: number;
  rawSt: number;
  nan: number;
  clip: number;
}
async function runLevels(filter?: string): Promise<LevelRow[]> {
  const out = $('levels');
  const btn = $('levels-run') as HTMLButtonElement;
  btn.disabled = true;
  const rows: string[] = [];
  const header = '<tr><th>sound</th><th>peak</th><th>rms</th><th>max 50ms rms</th><th>raw peak</th><th>raw 50ms rms</th><th>NaN</th><th>clipped</th></tr>';
  const results: LevelRow[] = [];
  for (const make of CHECKS) {
    const c = make();
    if (filter && !c.name.includes(filter)) continue;
    out.innerHTML = `<table>${header}${rows.join('')}</table><div>rendering: ${c.name}…</div>`;
    try {
      const lim = analyse(await DerbyAudio.renderOffline({ seconds: c.seconds, setup: c.setup, frame: c.frame }));
      const c2 = make();
      const raw = analyse(await DerbyAudio.renderOffline({ seconds: c2.seconds, setup: c2.setup, frame: c2.frame, options: { bypassLimiter: true } }));
      const bad = lim.nan > 0 || lim.clip > 0 || lim.peak === 0;
      rows.push(
        `<tr class="${bad ? 'bad' : ''}"><td>${c.name}</td><td>${db(lim.peak)}</td><td>${db(lim.rms)}</td><td>${db(lim.st)}</td>` +
          `<td>${db(raw.peak)}</td><td>${db(raw.st)}</td><td>${lim.nan + raw.nan}</td><td>${lim.clip}</td></tr>`,
      );
      results.push({ name: c.name, peak: +db(lim.peak), rms: +db(lim.rms), st: +db(lim.st), rawPeak: +db(raw.peak), rawSt: +db(raw.st), nan: lim.nan + raw.nan, clip: lim.clip });
    } catch (err) {
      rows.push(`<tr class="bad"><td>${c.name}</td><td colspan="7">failed: ${String(err)}</td></tr>`);
    }
  }
  out.innerHTML = `<table>${header}${rows.join('')}</table>`;
  btn.disabled = false;
  log('level check done', 'good');
  return results;
}
$('levels-run').addEventListener('click', () => {
  void runLevels();
});
// exposed for automation from the console
(window as unknown as { runLevels: typeof runLevels }).runLevels = runLevels;

// --- offline render viewer ------------------------------------------------------------------------
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] as number;
      re[i] = re[j] as number;
      re[j] = tr;
      const ti = im[i] as number;
      im[i] = im[j] as number;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const vr = (re[b] as number) * cr - (im[b] as number) * ci;
        const vi = (re[b] as number) * ci + (im[b] as number) * cr;
        re[b] = (re[a] as number) - vr;
        im[b] = (im[a] as number) - vi;
        re[a] = (re[a] as number) + vr;
        im[a] = (im[a] as number) + vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function drawView(buf: AudioBuffer, title: string): void {
  const cv = $<HTMLCanvasElement>('view');
  const g = cv.getContext('2d');
  if (!g) return;
  const W = cv.width;
  const H = cv.height;
  const WH = 90;
  const x = buf.getChannelData(0);
  const sr = buf.sampleRate;
  g.fillStyle = '#0c0e11';
  g.fillRect(0, 0, W, H);
  // waveform
  g.fillStyle = '#6fc3ff';
  for (let c = 0; c < W; c++) {
    const a = Math.floor((c * x.length) / W);
    const b = Math.floor(((c + 1) * x.length) / W);
    let mn = 0;
    let mx = 0;
    for (let i = a; i < b; i++) {
      const v = x[i] as number;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    g.fillRect(c, WH / 2 - mx * (WH / 2), 1, Math.max(1, (mx - mn) * (WH / 2)));
  }
  // spectrogram
  const N = 2048;
  const rows = H - WH;
  const fmin = 25;
  const fmax = 16000;
  const img = g.createImageData(W, rows);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const cols: Float64Array[] = [];
  let gmax = -1e9;
  for (let c = 0; c < W; c++) {
    const start = Math.floor((c * (x.length - N)) / W);
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = ((x[start + i] as number) ?? 0) * (win[i] as number);
    fft(re, im);
    const col = new Float64Array(rows);
    for (let r = 0; r < rows; r++) {
      const f = fmin * Math.pow(fmax / fmin, r / (rows - 1));
      const k = Math.min(N / 2 - 1, Math.round(f / (sr / N)));
      const v = 10 * Math.log10((re[k] as number) ** 2 + (im[k] as number) ** 2 + 1e-20);
      col[r] = v;
      if (v > gmax) gmax = v;
    }
    cols.push(col);
  }
  const range = 80;
  for (let c = 0; c < W; c++) {
    const col = cols[c] as Float64Array;
    for (let r = 0; r < rows; r++) {
      const t = Math.max(0, Math.min(1, ((col[r] as number) - (gmax - range)) / range));
      const o = ((rows - 1 - r) * W + c) * 4;
      img.data[o] = Math.min(255, t * 3 * 255);
      img.data[o + 1] = Math.min(255, Math.max(0, t * 3 - 1) * 255);
      img.data[o + 2] = Math.min(255, Math.max(0, t * 3 - 2) * 255 + t * 50);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, WH);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  for (const f of [100, 1000, 10000]) {
    const y = WH + rows - 1 - Math.round(((rows - 1) * Math.log(f / fmin)) / Math.log(fmax / fmin));
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  g.fillStyle = '#d9dde4';
  g.font = '14px ui-monospace, Menlo, monospace';
  g.fillText(`${title}  (${buf.duration.toFixed(1)} s)`, 8, 16);
}

const viewSel = $<HTMLSelectElement>('view-sel');
CHECKS.forEach((make, i) => {
  const o = document.createElement('option');
  o.value = String(i);
  o.textContent = make().name;
  viewSel.appendChild(o);
});
async function renderView(i: number): Promise<void> {
  const make = CHECKS[i];
  if (!make) return;
  const c = make();
  const buf = await DerbyAudio.renderOffline({ seconds: c.seconds, setup: c.setup, frame: c.frame, options: { crowdBed: false, crowdReactsToImpacts: false } });
  drawView(buf, c.name);
}
$('view-run').addEventListener('click', () => {
  void renderView(parseInt(viewSel.value, 10));
});
(window as unknown as { renderView: typeof renderView }).renderView = renderView;
