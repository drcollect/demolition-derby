import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RAPIER, createWorld } from '../src/physics/world';
import { Figure8Track } from '../src/arena/figure8/track';
import { Renderer, makeStadiumEnvironment } from '../src/render/renderer';
import { createFigure8Venue, type Figure8Venue } from '../src/arena/figure8/venue';

/*
 Dev page for the figure-8 venue: the real track, the game's renderer (bloom, ACES, NaN guard), a warm sun
 from venue.sunDirection, a hemisphere fill and a few box "cars" for scale.

 URL params: q=low|high, seed=N, view=<name>, ex=0..1, panel=0, env=sky (environment from the venue sky
 instead of makeStadiumEnvironment), shots=1 (keeps the drawing buffer).
 Console: f8.shot('name', 'view') renders one frame and POSTs it to /__shot (lands in game/.shots/name.png).
*/

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

await RAPIER.init();
const world = createWorld();
const track = new Figure8Track(world);

const canvas = $<HTMLCanvasElement>('c');
const R = new Renderer(canvas);
const renderer = R.renderer;

const scene = new THREE.Scene();
scene.add(track.group);
track.group.traverse((o) => {
  if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
});
const stadiumEnv = makeStadiumEnvironment(renderer);
scene.environment = stadiumEnv;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

// ---- lights (the game owns these; here only to preview) ---------------------------------------------------
const hemi = new THREE.HemisphereLight(0x8fa6d8, 0x6a5238, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffc28a, 2.9);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
{
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -100;
  sc.right = 100;
  sc.top = 70;
  sc.bottom = -70;
  sc.near = 10;
  sc.far = 700;
}
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

// ---- a few box "cars" for scale ----------------------------------------------------------------------------
{
  const colors = [0xc0392b, 0x2e86de, 0xf1c40f, 0x27ae60, 0xe67e22, 0xecf0f1, 0x8e44ad];
  const body = new THREE.BoxGeometry(1.9, 0.95, 4.6);
  const cab = new THREE.BoxGeometry(1.6, 0.55, 2.2);
  const glass = new THREE.MeshStandardMaterial({ color: 0x151a20, roughness: 0.5, metalness: 0.3 });
  const put = (s: number, lat: number, i: number) => {
    const smp = track.sampleAt(s);
    const p = smp.p.clone().addScaledVector(smp.n, lat);
    p.y = track.heightAt(p.x, p.z);
    const car = new THREE.Group();
    const b = new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.4, metalness: 0.3 }));
    b.position.y = 0.75;
    const c = new THREE.Mesh(cab, glass);
    c.position.set(0, 1.5, -0.3);
    b.castShadow = c.castShadow = true;
    car.add(b, c);
    car.position.copy(p);
    car.rotation.y = Math.atan2(smp.t.x, smp.t.z);
    scene.add(car);
  };
  put(track.startS - 4, 2.8, 0);
  put(track.startS - 4, -2.8, 1);
  put(track.startS - 11, 2.8, 2);
  put(track.crossingS[0] - 12, 1, 3);
  put(track.crossingS[1] + 3, -2, 4);
  put(track.length * 0.33, 3, 5);
  put(track.length * 0.8, -3, 6);
}

// ---- venue --------------------------------------------------------------------------------------------------
let venue: Figure8Venue;
let quality: 'high' | 'low' = params.get('q') === 'low' ? 'low' : 'high';
const seed = Number(params.get('seed') ?? 7);
let skyEnv: THREE.Texture | null = null;
function build() {
  if (venue) venue.dispose();
  const t0 = performance.now();
  venue = createFigure8Venue(track, { quality, seed });
  console.log(`[figure8] venue built in ${(performance.now() - t0).toFixed(0)} ms`);
  scene.add(venue.group);
  const sd = venue.sunDirection;
  sun.position.copy(sd).multiplyScalar(300);
  sun.target.position.set(0, 0, 0);
  const v = venue as Figure8Venue & { fogColor?: THREE.Color; makeEnvironment?: (r: THREE.WebGLRenderer) => THREE.Texture };
  scene.fog = new THREE.Fog(v.fogColor ? v.fogColor.clone() : new THREE.Color(0xc8a08a), 220, 1600);
  scene.background = v.fogColor ? v.fogColor.clone() : new THREE.Color(0x303848);
  if (params.get('env') === 'sky' && v.makeEnvironment) {
    skyEnv?.dispose();
    skyEnv = v.makeEnvironment(renderer);
    scene.environment = skyEnv;
  }
  measureNext = performance.now() + 400;
}

// ---- views -----------------------------------------------------------------------------------------------------
type View = { pos: THREE.Vector3; look: THREE.Vector3; fov?: number };
const views: Record<string, () => View> = {
  overview: () => ({ pos: new THREE.Vector3(10, 120, 150), look: new THREE.Vector3(0, 0, 5) }),
  top: () => ({ pos: new THREE.Vector3(0.01, 260, 0.01), look: new THREE.Vector3(0, 0, 0), fov: 50 }),
  straight: () => {
    // car height on straight 1, past the start line, looking at the crossing and the jump
    const smp = track.sampleAt(track.crossingS[0] - 18);
    const p = smp.p.clone().addScaledVector(smp.n, -2.4);
    p.y = track.heightAt(p.x, p.z) + 1.3;
    return { pos: p, look: p.clone().addScaledVector(smp.t, 40).setY(1.3) };
  },
  straight2: () => {
    const smp = track.sampleAt(track.crossingS[1] - 16);
    const p = smp.p.clone().addScaledVector(smp.n, -1.5);
    p.y = track.heightAt(p.x, p.z) + 1.3;
    return { pos: p, look: p.clone().addScaledVector(smp.t, 40).setY(1.4) };
  },
  towardSun: () => {
    const smp = track.sampleAt(track.crossingS[0] + 95);
    const p = smp.p.clone();
    p.y = track.heightAt(p.x, p.z) + 1.4;
    return { pos: p, look: p.clone().add(new THREE.Vector3(-0.75, 0.06, 0.66).multiplyScalar(60)) };
  },
  awayFromSun: () => {
    const smp = track.sampleAt(track.crossingS[1] + 95);
    const p = smp.p.clone();
    p.y = track.heightAt(p.x, p.z) + 1.4;
    return { pos: p, look: p.clone().add(new THREE.Vector3(0.75, 0.04, -0.66).multiplyScalar(60)) };
  },
  gantry: () => {
    const smp = track.sampleAt(track.startS - 26);
    const st = track.sampleAt(track.startS);
    const p = smp.p.clone().addScaledVector(smp.n, 1);
    p.y = track.heightAt(p.x, p.z) + 2.2;
    return { pos: p, look: st.p.clone().setY(4) };
  },
  gantryBack: () => {
    const smp = track.sampleAt(track.startS + 18);
    const st = track.sampleAt(track.startS);
    const p = smp.p.clone().addScaledVector(smp.n, -3);
    p.y = 3;
    return { pos: p, look: st.p.clone().setY(4.5) };
  },
  tyres: () => {
    // on loop B, looking along the outer tyre wall
    const smp = track.sampleAt(track.crossingS[0] + 70);
    const out = smp.out;
    const p = smp.p.clone().addScaledVector(smp.n, out * 4.5);
    p.y = track.heightAt(p.x, p.z) + 1.3;
    const ahead = track.sampleAt(track.crossingS[0] + 82);
    const q = ahead.p.clone().addScaledVector(ahead.n, out * 7.6);
    q.y = track.heightAt(q.x, q.z) + 0.6;
    return { pos: p, look: q };
  },
  jersey: () => {
    const smp = track.sampleAt(track.crossingS[1] - 16);
    const p = smp.p.clone().addScaledVector(smp.n, -4.5);
    p.y = 1.2;
    const q = track.sampleAt(track.crossingS[1] - 6);
    const l = q.p.clone().addScaledVector(q.n, -7.9);
    l.y = 0.5;
    return { pos: p, look: l };
  },
  crossing: () => ({ pos: new THREE.Vector3(-26, 9, 6), look: new THREE.Vector3(0, 0, 0) }),
  grandstand: () => ({ pos: new THREE.Vector3(12, 3, -22), look: new THREE.Vector3(-4, 5, -52) }),
  north: () => ({ pos: new THREE.Vector3(-10, 3, 20), look: new THREE.Vector3(10, 5, 52) }),
  sunset: () => ({ pos: new THREE.Vector3(40, 3.5, -20), look: new THREE.Vector3(-60, 8, 30) }),
  pits: () => ({ pos: new THREE.Vector3(55, 12, -30), look: new THREE.Vector3(100, 0, 5) }),
  outside: () => ({ pos: new THREE.Vector3(160, 60, -170), look: new THREE.Vector3(0, 5, 0) }),
};
let currentView = 'overview';
function setView(name: string) {
  const v = views[name]?.();
  if (!v) return;
  currentView = name;
  camera.position.copy(v.pos);
  controls.target.copy(v.look);
  camera.fov = v.fov ?? 62;
  camera.updateProjectionMatrix();
  controls.update();
}
const vbox = $('views');
for (const k of Object.keys(views)) {
  const b = document.createElement('button');
  b.textContent = k;
  b.onclick = () => setView(k);
  vbox.appendChild(b);
}

// ---- UI ----------------------------------------------------------------------------------------------------------
const ex = $<HTMLInputElement>('ex');
const exv = $('exv');
if (params.get('ex')) ex.value = params.get('ex') as string;
const syncEx = () => (exv.textContent = Number(ex.value).toFixed(2));
ex.oninput = syncEx;
syncEx();
const randomTrackPoint = () => track.sampleAt(Math.random() * track.length).p.clone();
$('cheer').onclick = () => venue.cheer(1, randomTrackPoint());
$('cheerAll').onclick = () => venue.cheer(1);
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-q]')) {
  b.onclick = () => {
    quality = b.dataset.q === 'low' ? 'low' : 'high';
    R.setQuality(quality);
    build();
  };
}
$('hide').onclick = () => ($('panel').style.display = 'none');
if (params.get('panel') === '0') $('panel').style.display = 'none';
R.setQuality(quality);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  R.resize(window.innerWidth, window.innerHeight);
});

// ---- stats: venue-only draw calls / triangles (rendered once into an offscreen target) ------------------------------
let venueCalls = 0;
let venueTris = 0;
let measureNext = 0;
const measureRT = new THREE.WebGLRenderTarget(64, 64);
function measureVenueOnly() {
  const hidden: THREE.Object3D[] = [];
  for (const c of scene.children) {
    if (c !== venue.group && c.visible && !(c as THREE.Light).isLight) {
      c.visible = false;
      hidden.push(c);
    }
  }
  const info = renderer.info;
  const auto = info.autoReset;
  info.autoReset = false;
  info.reset();
  renderer.setRenderTarget(measureRT);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  venueCalls = info.render.calls;
  venueTris = info.render.triangles;
  info.autoReset = auto;
  for (const h of hidden) h.visible = true;
}

// ---- loop ------------------------------------------------------------------------------------------------------------
build();
setView(params.get('view') ?? 'overview');
let elapsed = 0;
let frames = 0;
let fpsT = 0;
let fps = 0;
let nextBoard = 0;
let nextAuto = 2;
let lap = 1;
let last = performance.now();
const stats = $('stats');

function step(dt: number) {
  elapsed += dt;
  let e = Number(ex.value);
  if ($<HTMLInputElement>('auto').checked) {
    e = 0.45 + 0.4 * Math.sin(elapsed * 0.13);
    ex.value = e.toFixed(2);
    syncEx();
    if (elapsed > nextAuto) {
      nextAuto = elapsed + 1.5 + Math.random() * 4;
      venue.cheer(0.6 + Math.random() * 0.8, randomTrackPoint());
    }
  }
  venue.update(dt, elapsed, e);
  if (elapsed > nextBoard) {
    nextBoard = elapsed + 1;
    lap = 1 + (Math.floor(elapsed / 25) % 10);
    venue.setScoreboard([`LAP ${lap}/10`, '1 #7 YOU', '2 #44 HOSS', '3 #13 LUCKY']);
  }
  controls.update();
  R.render(scene, camera);
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  step(dt);
  if (performance.now() > measureNext) {
    measureNext = performance.now() + 2000;
    measureVenueOnly();
  }
  frames++;
  fpsT += dt;
  if (fpsT > 0.5) {
    fps = frames / fpsT;
    frames = 0;
    fpsT = 0;
    const info = R.lastInfo.render;
    stats.textContent =
      `fps ${fps.toFixed(0)}  view ${currentView}\n` +
      `frame draws ${info.calls}  tris ${(info.triangles / 1000).toFixed(0)}k\n` +
      `venue draws ${venueCalls}  tris ${(venueTris / 1000).toFixed(0)}k\n` +
      `quality ${quality}  seed ${seed}`;
  }
}
frame();

/** Render one frame at w x h (synchronously, works while the tab is hidden) and POST it to the dev server. */
async function shot(name: string, view?: string, w = 1280, h = 720, settle = 3): Promise<string> {
  if (view) setView(view);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  R.resize(w / dpr, h / dpr);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  for (let i = 0; i < settle; i++) step(1 / 60);
  measureVenueOnly();
  step(1 / 60);
  const url = canvas.toDataURL('image/png');
  await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: url });
  return `${name}: ${canvas.width}x${canvas.height} venue draws ${venueCalls} tris ${venueTris}`;
}

(window as unknown as { f8: unknown }).f8 = {
  THREE,
  scene,
  camera,
  controls,
  renderer,
  R,
  track,
  sun,
  hemi,
  get venue() {
    return venue;
  },
  setView,
  views,
  shot,
  step,
  build,
  measure: () => {
    measureVenueOnly();
    return { calls: venueCalls, tris: venueTris };
  },
};
