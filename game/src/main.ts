import * as THREE from 'three';
import { initPhysics, PHYS_DT } from './physics/world';
import { Input } from './core/input';
import { Renderer, addDuskLights, addStadiumLights, makeStadiumEnvironment } from './render/renderer';
import { GameCamera } from './render/camera';
import { loadCarTemplates, type CarTemplate } from './car/carAsset';
import { CAR_SPECS } from './car/specs';
import { DIFFICULTIES } from './ai/driver';
import { Match, type MatchAudio, type StadiumLike } from './game/match';
import { Showroom } from './game/showroom';
import { Hud } from './ui/hud';
import { Screens, type Settings } from './ui/screens';
import type { Car } from './car/car';

// Optional modules (built in parallel): picked up if present.
const stadiumMods = import.meta.glob('./arena/stadium.ts');
const venueMods = import.meta.glob('./arena/figure8/venue.ts');
import { DerbyAudio } from './audio/audio';

type AppState = 'loading' | 'title' | 'garage' | 'match' | 'results';

interface EngineVoiceLike {
  update(p: { rpm: number; throttle: number; load: number; position: THREE.Vector3; velocity?: THREE.Vector3; damage: number; dead: boolean }): void;
  dispose(): void;
}
interface DerbyAudioLike {
  init(): Promise<void>;
  readonly ready: boolean;
  setMasterVolume(v: number): void;
  setMuted(m: boolean): void;
  setListener(p: THREE.Vector3, f: THREE.Vector3, u: THREE.Vector3): void;
  createEngine(profile: string, isPlayer: boolean): EngineVoiceLike;
  impact(p: THREE.Vector3, s: number, k: string): void;
  glass(p: THREE.Vector3, s: number): void;
  scrape(id: number, p: THREE.Vector3, i: number): void;
  skid(id: number, p: THREE.Vector3, i: number, surface?: number): void;
  partOff(p: THREE.Vector3): void;
  wreck(p: THREE.Vector3): void;
  horn(id: number, p: THREE.Vector3, on: boolean): void;
  crowd: { setExcitement(x: number): void; cheer(s: number): void };
  ui(kind: string): void;
}

type StadiumFactory = (o: { quality?: 'low' | 'high' }) => StadiumLike & { dispose?: () => void };
type Venue = StadiumLike & {
  dispose?: () => void;
  sunDirection?: THREE.Vector3;
  sunColor?: THREE.Color;
  fogColor?: THREE.Color;
  makeEnvironment?: (r: THREE.WebGLRenderer) => THREE.Texture;
};
type VenueFactory = (track: import('./arena/figure8/track').Figure8Track, o: { quality?: 'low' | 'high' }) => Venue;
const DEFAULT_SUN = new THREE.Vector3(-0.62, 0.2, -0.76).normalize();

class App {
  private renderer: Renderer;
  private input = new Input();
  private cam: GameCamera;
  private hud: Hud;
  private screens: Screens;
  private templates = new Map<string, CarTemplate>();
  private env!: THREE.Texture;
  private envDusk: THREE.Texture | null = null;
  /** reflections from the Figure 8 venue's sky (the same sky every time, so it's made once) */
  private envVenue: THREE.Texture | null = null;
  private createVenue: VenueFactory | null = null;
  showroom!: Showroom;
  match: Match | null = null;
  private state: AppState = 'loading';
  private paused = false;
  private acc = 0;
  last = performance.now();
  private audio: DerbyAudioLike | null = null;
  private engines = new Map<Car, EngineVoiceLike>();
  private createStadium: StadiumFactory | null = null;
  private settings: Settings = { volume: 0.8, quality: 'high' };
  private overShownAt = -1;
  private muted = false;
  private fpsAcc = { t: 0, n: 0, fps: 0 };
  private debugEl: HTMLElement;
  private debug = false;
  private hornOn = false;
  /** test hook: orbit the camera around this car */
  inspect: { car: Car; radius: number; height: number; speed: number } | null = null;
  /** dev: a camera parked at a spot (testkit shots) */
  fixedCam: { pos: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null;
  /** test hook: when set, overrides the player's input */
  forcedInput: { throttle: number; brake: number; steer: number; handbrake: boolean; horn: boolean } | null = null;

  constructor() {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    try {
      const s = JSON.parse(localStorage.getItem('dd.settings') ?? 'null');
      if (s) this.settings = { ...this.settings, ...s };
    } catch {
      /* ignore */
    }
    this.renderer.setQuality(this.settings.quality);
    this.cam = new GameCamera(window.innerWidth / window.innerHeight);
    const ui = document.getElementById('ui')!;
    this.hud = new Hud(ui);
    this.hud.show(false);
    this.screens = new Screens(ui);
    this.debugEl = document.createElement('div');
    this.debugEl.style.cssText =
      'position:absolute;left:50%;bottom:34px;transform:translateX(-50%);font:12px monospace;color:#9f9;background:rgba(0,0,0,.6);padding:4px 8px;display:none;white-space:pre';
    ui.appendChild(this.debugEl);
    window.addEventListener('resize', () => this.onResize());
    this.input.onFirstGesture = () => void this.initAudio();
    (window as unknown as { __dd: unknown }).__dd = this;
  }

  async boot() {
    const title = this.screens.title(() => this.toGarage());
    await initPhysics();
    title.progress(0.15);
    this.env = makeStadiumEnvironment(this.renderer.renderer);
    this.showroom = new Showroom(this.env, window.innerWidth / window.innerHeight);
    const stadiumLoader = stadiumMods['./arena/stadium.ts'];
    if (stadiumLoader) {
      try {
        const mod = (await stadiumLoader()) as { createStadium?: StadiumFactory };
        this.createStadium = mod.createStadium ?? null;
      } catch (e) {
        console.warn('[stadium] failed to load', e);
      }
    }
    const venueLoader = venueMods['./arena/figure8/venue.ts'];
    if (venueLoader) {
      try {
        const mod = (await venueLoader()) as { createFigure8Venue?: VenueFactory };
        this.createVenue = mod.createFigure8Venue ?? null;
      } catch (e) {
        console.warn('[figure8 venue] failed to load', e);
      }
    }
    this.templates = await loadCarTemplates((d, t) => title.progress(0.2 + (0.8 * d) / t));
    this.screens.sourceOf = (id) => (this.templates.get(id)?.source === 'glb' ? 'COLLECT CAR MODEL' : 'PLACEHOLDER MODEL (GLB MISSING)');
    const g = this.screens.garage;
    this.showroom.show(this.templates.get(CAR_SPECS[g.carIndex].id)!, this.screens.livery(), g.number);
    this.state = 'title';
    this.startDemo();
    title.ready();
    requestAnimationFrame((t) => this.frame(t));
  }

  /**
   * Start sound from inside the user's first click/keypress: the AudioContext has to be created and
   * resumed synchronously in the gesture (Safari/iPad are strict about it), so nothing async comes first.
   */
  private initAudio() {
    if (!this.audio) {
      const a = new DerbyAudio() as unknown as DerbyAudioLike;
      a.setMasterVolume(this.settings.volume);
      a.setMuted(this.muted);
      this.audio = a;
      if (this.match) this.attachAudio(this.match);
    }
    void this.audio.init().then(() => this.updateSoundBadge());
  }

  /** Small corner badge: tells the player whether the browser is actually letting us make sound. */
  private soundBadge: HTMLElement | null = null;
  private updateSoundBadge() {
    if (!this.soundBadge) {
      const b = document.createElement('button');
      b.className = 'sound-badge interactive';
      b.onclick = (e) => {
        e.stopPropagation();
        this.initAudio();
        this.audio?.ui('select');
      };
      document.getElementById('ui')!.appendChild(b);
      this.soundBadge = b;
    }
    const st = (this.audio as unknown as { stats?: () => { state: string } } | null)?.stats?.().state ?? 'off';
    const on = st === 'running' && !this.muted;
    this.soundBadge.textContent = this.muted ? 'SOUND MUTED (M)' : on ? 'SOUND ON' : 'CLICK FOR SOUND';
    this.soundBadge.classList.toggle('on', on);
    const inMatch = this.state === 'match';
    this.soundBadge.classList.toggle('in-match', inMatch);
    this.soundBadge.style.display = inMatch && on ? 'none' : '';
  }

  private attachAudio(m: Match) {
    const a = this.audio;
    if (!a) return;
    const hooks: MatchAudio = {
      impact: (p, s, k) => a.impact(p, s, k),
      glass: (p, s) => a.glass(p, s),
      partOff: (p) => a.partOff(p),
      wreck: (p) => a.wreck(p),
      scrape: (id, p, i) => a.scrape(id, p, i),
      skid: (id, p, i) => a.skid(id, p, i),
      horn: (id, p, on) => a.horn(id, p, on),
      cheer: (s) => a.crowd.cheer(s),
      excitement: (x) => a.crowd.setExcitement(x),
      ui: (k) => a.ui(k),
    };
    m.audio = hooks;
    for (const c of m.cars) {
      if (!this.engines.has(c)) this.engines.set(c, a.createEngine(c.spec.engine, c.isPlayer));
    }
  }

  private disposeEngines() {
    for (const v of this.engines.values()) v.dispose();
    this.engines.clear();
  }

  // ------------------------------------------------------------------------------------------------
  toGarage() {
    this.stopDemo();
    this.endMatch();
    this.state = 'garage';
    this.paused = false;
    this.hud.show(false);
    this.screens.onGarageChange = (s) => {
      const spec = CAR_SPECS[s.carIndex];
      this.showroom.show(this.templates.get(spec.id)!, this.screens.livery(), s.number);
      this.audio?.ui('select');
    };
    this.screens.onGarageStart = () => this.startMatch();
    this.screens.showGarage();
  }

  startMatch() {
    this.endMatch();
    const g = this.screens.garage;
    const m = new Match(
      {
        playerCar: CAR_SPECS[g.carIndex].id,
        playerColor: this.screens.livery().color,
        playerLivery: this.screens.livery(),
        playerNumber: g.number,
        opponents: g.opponents,
        difficulty: DIFFICULTIES[g.difficulty],
        timeLimit: g.event === 'race' ? 600 : 240,
        seed: (Math.random() * 1e9) | 0,
        mode: g.event,
        laps: g.laps ?? 10,
      },
      this.templates,
    );
    this.dressScene(m);
    this.match = m;
    this.attachAudio(m);
    this.screens.close();
    this.hud.show(true);
    this.state = 'match';
    this.paused = false;
    this.overShownAt = -1;
    this.acc = 0;
    this.cam.mode = 0;
    this.cam.snap();
  }

  /** Lights, environment, sky and scenery around a match: the floodlit Bowl, or the Figure 8 at dusk. */
  private dressScene(m: Match) {
    const q = this.renderer.quality === 'low' ? 'low' : 'high';
    if (m.track) {
      let venue: Venue | null = null;
      if (this.createVenue) {
        try {
          venue = this.createVenue(m.track, { quality: q });
          m.scene.add(venue.group);
          m.stadium = venue;
        } catch (e) {
          console.warn('[figure8 venue] create failed', e);
        }
      }
      const sun = venue?.sunDirection?.clone().normalize() ?? DEFAULT_SUN;
      if (venue?.makeEnvironment) this.envVenue ??= venue.makeEnvironment(this.renderer.renderer);
      m.scene.environment = this.envVenue ?? (this.envDusk ??= makeStadiumEnvironment(this.renderer.renderer, undefined, 'dusk', sun));
      m.scene.environmentIntensity = 0.85;
      addDuskLights(m.scene, this.renderer.quality, sun, venue?.sunColor);
      const fog = venue?.fogColor?.clone() ?? new THREE.Color(0x8a6f66);
      m.scene.background = fog.clone();
      // the venue's far scenery fades into its own sky; the fog only starts past the fairground
      m.scene.fog = venue ? new THREE.Fog(fog, 220, 1600) : new THREE.FogExp2(fog, 0.0032);
      return;
    }
    m.scene.environment = this.env;
    m.scene.environmentIntensity = 0.9;
    addStadiumLights(m.scene, this.renderer.quality, m.bowl!.opts.wallRadius);
    m.scene.background = new THREE.Color(0x05070d);
    m.scene.fog = new THREE.FogExp2(0x0a0c14, 0.0045);
    if (this.createStadium) {
      try {
        const st = this.createStadium({ quality: q });
        m.scene.add(st.group);
        m.stadium = st;
      } catch (e) {
        console.warn('[stadium] create failed', e);
      }
    }
  }

  /** How far out the camera may go (the Bowl's wall), and the ground height under it. */
  private camLimit(m: Match) {
    return m.bowl ? m.bowl.opts.wallRadius : Infinity;
  }

  // ---- attract mode: all-AI races and derbies behind the title screen ----
  private demo: Match | null = null;
  private demoAcc = 0;
  private demoFocus = 0;
  private demoFocusT = 0;

  private demoCount = 0;

  private startDemo() {
    this.stopDemo();
    // alternate between a short race on the Figure 8 (first) and a derby in the Bowl
    const race = this.demoCount++ % 2 === 0;
    const m = new Match(
      {
        playerCar: CAR_SPECS[0].id,
        playerColor: '#b3261e',
        playerNumber: 1,
        opponents: 7,
        difficulty: DIFFICULTIES[2],
        timeLimit: 600,
        seed: (Math.random() * 1e9) | 0,
        demo: true,
        mode: race ? 'race' : 'derby',
        laps: 3,
      },
      this.templates,
    );
    this.dressScene(m);
    m.skipIntro();
    this.demo = m;
    this.demoAcc = 0;
    this.demoFocusT = 0;
  }

  private stopDemo() {
    if (!this.demo) return;
    const st = this.demo.stadium as (StadiumLike & { dispose?: () => void }) | null;
    st?.dispose?.();
    this.demo.dispose();
    this.demo = null;
  }

  private runDemo(dt: number) {
    const m = this.demo!;
    this.demoAcc += dt;
    let steps = 0;
    const idle = { throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false };
    while (this.demoAcc >= PHYS_DT && steps < 6) {
      m.fixedStep(idle);
      this.demoAcc -= PHYS_DT;
      steps++;
    }
    if (steps >= 6) this.demoAcc = 0;
    m.frame(dt, this.demoAcc / PHYS_DT);
    // follow a different car every few seconds, preferring ones still running
    this.demoFocusT -= dt;
    const alive = m.cars.filter((c) => !c.wrecked);
    if (this.demoFocusT <= 0 || m.cars[this.demoFocus].wrecked) {
      this.demoFocusT = 7;
      const pool = alive.length ? alive : m.cars;
      this.demoFocus = pool[Math.floor(Math.random() * pool.length)].index;
    }
    const c = m.cars[this.demoFocus];
    this.cam.orbit(dt, c.root.position.clone().setY(c.root.position.y + 0.6), 11, 3.6, 0.16, this.camLimit(m) - 2);
    m.fx.particles.setViewport(this.renderer.heightPx, this.cam.camera.fov);
    this.renderer.render(m.scene, this.cam.camera);
    if (m.phase === 'over' || alive.length <= 1) this.startDemo();
  }

  private endMatch() {
    this.disposeEngines();
    if (this.match) {
      const st = this.match.stadium as (StadiumLike & { dispose?: () => void }) | null;
      st?.dispose?.();
      this.match.dispose();
      this.match = null;
    }
  }

  private setPaused(p: boolean) {
    if (!this.match) return;
    this.paused = p;
    if (p) {
      this.screens.pause(
        {
          resume: () => this.setPaused(false),
          restart: () => this.startMatch(),
          garage: () => this.toGarage(),
        },
        this.settings,
        (s) => this.applySettings(s),
      );
    } else this.screens.close();
  }

  private applySettings(s: Settings) {
    const qChanged = s.quality !== this.settings.quality;
    this.settings = s;
    this.audio?.setMasterVolume(s.volume);
    if (qChanged) this.renderer.setQuality(s.quality);
    try {
      localStorage.setItem('dd.settings', JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }

  private onResize() {
    this.renderer.resize(window.innerWidth, window.innerHeight);
    this.cam.setAspect(window.innerWidth / window.innerHeight);
  }

  // ------------------------------------------------------------------------------------------------
  private handleActions() {
    const inp = this.input;
    if (inp.wasPressed('debug')) {
      this.debug = !this.debug;
      this.debugEl.style.display = this.debug ? '' : 'none';
    }
    if (inp.wasPressed('mute')) {
      this.muted = !this.muted;
      this.audio?.setMuted(this.muted);
      this.updateSoundBadge();
    }
    if (this.state === 'title') {
      if (inp.wasPressed('confirm')) this.toGarage();
      return;
    }
    if (this.state === 'garage') {
      if (inp.wasPressed('left')) this.screens.cycleCar(-1);
      if (inp.wasPressed('right')) this.screens.cycleCar(1);
      if (inp.wasPressed('up')) this.screens.cyclePaint(-1);
      if (inp.wasPressed('down')) this.screens.cyclePaint(1);
      if (inp.wasPressed('confirm')) this.startMatch();
      return;
    }
    if (this.screens.hasMenu) {
      if (inp.wasPressed('up')) this.screens.menuMove(-1);
      if (inp.wasPressed('down')) this.screens.menuMove(1);
      if (inp.wasPressed('confirm')) this.screens.menuConfirm();
      else if (this.state === 'match' && this.paused && inp.wasPressed('pause')) this.setPaused(false);
      return;
    }
    const m = this.match;
    if (this.state === 'match' && m) {
      if (inp.wasPressed('pause')) {
        this.setPaused(true);
        return;
      }
      if (inp.wasPressed('camera')) {
        this.cam.cycle();
        this.hud.flashCamera(this.cam.mode, m.time);
      }
      if (inp.wasPressed('confirm')) {
        if (m.phase === 'intro') m.skipIntro();
        else if (m.phase === 'run' && m.player.wrecked) m.finish('You were wrecked');
      }
      if (inp.wasPressed('reset') && m.phase === 'run' && !m.player.wrecked) {
        const p = m.player;
        const st = m.race?.of(p);
        if (st && !st.finished) {
          // races: back onto the track (a little behind), when stopped, flipped or thrown out
          if (p.vehicle.upDot < 0.7 || Math.abs(p.vehicle.speed) < 3 || m.race!.outside(st)) m.race!.respawn(st);
        } else if (p.vehicle.upDot < 0.7 || Math.abs(p.vehicle.speed) < 1.5) p.resetUpright();
      }
    }
  }

  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    this.tick(now);
  }

  /** One frame of work (also driven directly by the dev testkit). */
  tick(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.input.pollGamepad();
    this.handleActions();
    const aspect = window.innerWidth / window.innerHeight;

    if ((this.state === 'match' || this.state === 'results') && this.match) {
      this.runMatch(dt);
    } else if (this.state === 'title' && this.demo) {
      this.runDemo(dt);
    } else {
      this.showroom.update(dt, aspect);
      this.renderer.render(this.showroom.scene, this.showroom.camera);
    }
    this.input.endFrame();

    this.fpsAcc.t += dt;
    this.fpsAcc.n++;
    if (this.fpsAcc.t > 0.5) {
      this.updateSoundBadge();
      this.fpsAcc.fps = this.fpsAcc.n / this.fpsAcc.t;
      this.fpsAcc.t = 0;
      this.fpsAcc.n = 0;
      if (this.debug) {
        const info = this.renderer.lastInfo;
        const m = this.match;
        this.debugEl.textContent =
          `${this.fpsAcc.fps.toFixed(0)} fps · ${info.render.calls} calls · ${(info.render.triangles / 1000).toFixed(0)}k tris` +
          (m ? ` · debris ${m.debris.count} · alive ${m.aliveCount}` : '');
      }
    }
  }

  get fps() {
    return this.fpsAcc.fps;
  }

  private runMatch(dt: number) {
    const m = this.match!;
    const pin = this.forcedInput ?? this.input.driver(dt);
    if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= PHYS_DT && steps < 10) {
        m.fixedStep(pin);
        this.acc -= PHYS_DT;
        steps++;
      }
      if (steps >= 10) this.acc = 0;
      m.frame(dt, this.acc / PHYS_DT);
    }

    // horn: the audio module wants a call every frame while it's held
    if (pin.horn || this.hornOn) this.audio?.horn(m.player.index, m.player.curPos, pin.horn);
    this.hornOn = pin.horn;

    // camera
    const view = this.viewCar(m);
    if (this.fixedCam) {
      const c = this.cam.camera;
      c.position.copy(this.fixedCam.pos);
      c.lookAt(this.fixedCam.look);
      c.fov = this.fixedCam.fov;
      c.updateProjectionMatrix();
    } else if (this.inspect) {
      const i = this.inspect;
      this.cam.orbit(dt, i.car.root.position.clone().setY(i.car.root.position.y + 0.7), i.radius, i.height, i.speed, this.camLimit(m) - 1);
    } else if (m.phase === 'intro') {
      if (m.track) this.cam.orbit(dt, new THREE.Vector3(0, 1, 0), 78 - m.phaseTime * 5, 34 - m.phaseTime * 4, 0.22);
      else this.cam.orbit(dt, new THREE.Vector3(0, 1, 0), 34 - m.phaseTime * 2.5, 14 - m.phaseTime * 2, 0.3);
    } else if (m.phase === 'over') {
      this.cam.orbit(dt, view.curPos.clone().setY(view.curPos.y + 0.8), 11, 4.5, 0.25, this.camLimit(m) - 2);
    } else {
      if (m.playerHits > 0) {
        this.cam.shake(Math.min(1, m.playerHits * 1.4));
        m.playerHits = 0;
      }
      const t = view.template;
      const bb = t.bodyBox;
      // hood cam: near the top of the body, about where the windscreen starts; bumper cam: low on the nose
      const hoodEye = new THREE.Vector3(0, bb.min.y + (bb.max.y - bb.min.y) * 1.02, bb.min.z + (bb.max.z - bb.min.z) * 0.64);
      const bumperEye = new THREE.Vector3(0, Math.max(0.5, bb.min.y + 0.35), bb.max.z + 0.2);
      this.cam.update(
        dt,
        { pos: view.root.position, quat: view.root.quaternion, velocity: view.velocity, hoodEye, bumperEye, length: t.size.z },
        this.input.lookBack,
        this.camLimit(m) - 1.2,
        (x, z) => m.arena.heightAt(x, z),
        m.cars.filter((c) => c !== view).map((c) => c.root.position),
      );
    }
    // a car right on top of the lens (a tailgater under the chase camera) is hidden rather than filling the screen
    const eye = this.cam.camera.position;
    for (const c of m.cars) c.root.visible = c === view || c.root.position.distanceTo(eye) > c.template.size.z * 0.62;
    m.fx.particles.setViewport(this.renderer.heightPx, this.cam.camera.fov);

    // audio
    if (this.audio?.ready) {
      const c = this.cam.camera;
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
      const u = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion);
      this.audio.setListener(c.position, f, u);
      for (const [car, v] of this.engines) {
        const veh = car.vehicle;
        const dmg = Math.max(car.zones.front, (car.zones.front + car.zones.rear) / 2);
        v.update({
          rpm: veh.rpm,
          throttle: veh.throttleOut,
          load: veh.throttleOut * (veh.groundedCount > 0 ? 1 : 0.2),
          position: car.curPos,
          velocity: car.velocity,
          damage: dmg,
          dead: car.wrecked,
        });
        let skid = 0;
        for (const w of veh.wheels) skid = Math.max(skid, w.grounded ? w.skid : 0);
        this.audio.skid(car.index, car.curPos, skid, 0.15); // dirt floor
      }
    }

    this.hud.update(m, view, m.time);
    this.renderer.render(m.scene, this.cam.camera);

    if (m.phase === 'over') {
      if (this.overShownAt < 0) this.overShownAt = m.time;
      if (m.time - this.overShownAt > 2.5 && this.state === 'match') {
        this.state = 'results';
        this.hud.show(false);
        this.screens.results(m, { again: () => this.startMatch(), garage: () => this.toGarage() });
      }
    }
  }

  /** The car the camera follows: the player, or once wrecked, whoever is doing well. */
  private viewCar(m: Match): Car {
    if (!m.player.wrecked || m.phase === 'intro' || m.phase === 'countdown') return m.player;
    if (m.phase === 'over') return m.winner ?? m.player;
    if (m.time - m.player.wreckTime < 3) return m.player;
    // races: watch the leader
    if (m.race) return m.race.standings().find((s) => !s.car.wrecked)?.car ?? m.player;
    const killer = m.player.lastHitBy ? m.cars[m.player.lastHitBy.car] : null;
    if (killer && !killer.wrecked) return killer;
    const alive = m.cars.filter((c) => !c.wrecked);
    if (!alive.length) return m.player;
    return alive.sort((a, b) => b.points - a.points)[0];
  }
}

const app = new App();
if (import.meta.env.DEV) {
  void import('./dev/testkit').then((t) => t.installTestkit(app as unknown as Parameters<typeof t.installTestkit>[0]));
}
app.boot().catch((e) => {
  console.error(e);
  const ui = document.getElementById('ui')!;
  ui.innerHTML = `<div style="color:#f66;font:16px monospace;padding:20px">Failed to start: ${String(e)}</div>`;
});
