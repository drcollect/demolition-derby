// Dev-only helpers for driving scripted crash tests from the browser console:
//   await __ddt.duel('brickhouse', 'tincan'); __ddt.headOn(12); __ddt.look(1)
import * as THREE from 'three';
import type { Car } from '../car/car';
import type { Match } from '../game/match';

interface AppLike {
  match: Match | null;
  forcedInput: { throttle: number; brake: number; steer: number; handbrake: boolean; horn: boolean } | null;
  showroom: { turntable: THREE.Group; update(dt: number, aspect: number): void };
  toGarage(): void;
  startMatch(): void;
  inspect: { car: Car; radius: number; height: number; speed: number } | null;
  screens: { garage: { opponents: number; carIndex: number } };
}

const IDS = ['hypercar', 'wedge', 'rally', 'endurance', 'streamliner'];
const idle = { throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false };

export function installTestkit(app: AppLike) {
  const m = () => app.match!;
  let ttAngle: number | null = null;
  let patched = false;
  const patchShowroom = () => {
    if (patched || !app.showroom) return;
    patched = true;
    const sr = app.showroom;
    const origUpdate = sr.update.bind(sr);
    sr.update = (dt: number, aspect: number) => {
      origUpdate(ttAngle === null ? dt : 0, aspect);
      if (ttAngle !== null) sr.turntable.rotation.y = ttAngle;
    };
  };
  let clock = 0;
  const api = {
    /**
     * Run the whole game loop (physics, camera, HUD, particles, rendering) for `sec` seconds at 60 fps,
     * e.g. while the browser tab is hidden and requestAnimationFrame is paused.
     */
    advance(sec = 1, input: AppLike['forcedInput'] = null) {
      const frame = (app as unknown as { tick(t: number): void }).tick.bind(app);
      if (!clock) clock = performance.now();
      const prev = app.forcedInput;
      if (input) app.forcedInput = input;
      for (let i = 0; i < Math.round(sec * 60); i++) {
        clock += 1000 / 60;
        (app as unknown as { last: number }).last = clock - 1000 / 60;
        frame(clock);
      }
      app.forcedInput = input ? prev : app.forcedInput;
    },
    /** Garage: show car i with the turntable frozen at `angleDeg` (null = spin). */
    /** Save the current frame (canvas + HUD is not included) to game/.shots/<name>.png. */
    async shot(name = 'shot') {
      const tick = (app as unknown as { tick(t: number): void }).tick.bind(app);
      if (!clock) clock = performance.now();
      clock += 1000 / 60;
      (app as unknown as { last: number }).last = clock - 1000 / 60;
      tick(clock);
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const url = canvas.toDataURL('image/png');
      await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: url });
      return `.shots/${name}.png`;
    },
    garage(i = 0, angleDeg: number | null = 40) {
      patchShowroom();
      if (!document.querySelector('.garage')) app.toGarage();
      (app.screens as unknown as { garage: { carIndex: number }; cycleCar(d: number): void }).garage.carIndex = i;
      (app.screens as unknown as { cycleCar(d: number): void }).cycleCar(0);
      ttAngle = angleDeg === null ? null : (angleDeg * Math.PI) / 180;
    },
    /** Start a Figure 8 race (intro skipped); with `auto` the player's car is driven by the race AI too. */
    async race(carIndex = 1, opponents = 7, laps = 10, auto = true) {
      const g = app.screens.garage as unknown as { event: string; laps: number; opponents: number; carIndex: number };
      g.event = 'race';
      g.laps = laps;
      g.opponents = opponents;
      g.carIndex = carIndex;
      app.startMatch();
      const mm = m();
      if (auto) {
        const { RaceDriver } = await import('../ai/racer');
        const { AI_DRIVERS, DIFFICULTIES } = await import('../ai/driver');
        const pd = new RaceDriver(AI_DRIVERS[3], DIFFICULTIES[2], 7);
        const orig = mm.fixedStep.bind(mm);
        mm.fixedStep = (inp) => orig(mm.phase === 'run' && mm.race ? pd.update(1 / 120, mm.player, mm.race.of(mm.player), mm.track!, mm.race, mm.time) : inp);
      }
      mm.skipIntro();
      return mm.cars.map((c) => `${c.index}:${c.spec.id}`).join(' ');
    },
    /** Physics only (no rendering), fast: `sec` seconds of match time. */
    sim(sec: number, input = idle) {
      const mm = m();
      for (let i = 0; i < Math.round(sec * 120) && mm.phase !== 'over'; i++) mm.fixedStep(input);
      return mm.phase;
    },
    /** Start a match with just the player and one opponent, frozen AI, already running. */
    duel(player = 'hypercar', opponents = 1) {
      (app.screens.garage as unknown as { event: string }).event = 'derby'; // crash tests happen in the Bowl
      app.screens.garage.opponents = opponents;
      app.screens.garage.carIndex = Math.max(0, IDS.indexOf(player));
      app.startMatch();
      const mm = m();
      mm.aiEnabled = false;
      mm.phase = 'run';
      return mm.cars.map((c) => `${c.index}:${c.spec.id}`).join(' ');
    },
    place(i: number, x: number, z: number, yawDeg: number, speed = 0) {
      const c = m().cars[i];
      const yaw = (yawDeg * Math.PI) / 180;
      c.body.setTranslation({ x, y: 0.1, z }, true);
      c.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
      c.body.setLinvel({ x: Math.sin(yaw) * speed, y: 0, z: Math.cos(yaw) * speed }, true);
      c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      c.postStep();
      c.postStep();
    },
    step(n = 120, input = idle) {
      for (let k = 0; k < n; k++) m().fixedStep(input);
      return m().impactLog.slice(-4);
    },
    headOn(speed = 12, a = 0, b = 1, offset = 0.5) {
      api.place(a, 0, -8, 0, speed);
      api.place(b, offset, 8, 180, speed);
      return api.step(180);
    },
    tbone(speed = 12, attacker = 0, victim = 1, zOff = 0) {
      api.place(victim, 0, 0, 180, 0);
      api.place(attacker, -9, zOff, 90, speed);
      return api.step(180);
    },
    rear(speed = 12, attacker = 0, victim = 1) {
      api.place(victim, 0, 4, 0, 0);
      api.place(attacker, 0, -8, 0, speed);
      return api.step(180);
    },
    wall(speed = 14, i = 0, yawDeg = 90) {
      api.place(i, 20, 0, yawDeg, speed);
      return api.step(200);
    },
    look(i = 1, radius = 6, height = 2, speed = 0.25) {
      app.inspect = { car: m().cars[i], radius, height, speed };
    },
    unlook() {
      app.inspect = null;
      (app as unknown as { fixedCam: unknown }).fixedCam = null;
    },
    /** Park the camera at (x, y, z) looking at (lx, ly, lz). */
    cam(x: number, y: number, z: number, lx = 0, ly = 0, lz = 0, fov = 55) {
      (app as unknown as { fixedCam: unknown }).fixedCam = { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(lx, ly, lz), fov };
    },
    state(i = 1) {
      const c = m().cars[i];
      return {
        spec: c.spec.id,
        zones: Object.fromEntries(Object.entries(c.zones).map(([k, v]) => [k, +v.toFixed(2)])),
        wheels: c.wheelDmg.map((v) => +v.toFixed(2)),
        glass: c.glass.map((g) => `${g.name}:${['ok', 'cracked', 'gone'][g.state]}`),
        hoodOff: c.hoodOff,
        bumpers: c.bumperOff,
        wrecked: c.wrecked,
      };
    },
  };
  (window as unknown as { __ddt: typeof api }).__ddt = api;
}
