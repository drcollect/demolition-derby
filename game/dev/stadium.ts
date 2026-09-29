import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createStadium, type Stadium } from '../src/arena/stadium';

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- renderer / scene ------------------------------------------------------------------------------
const canvas = $<HTMLCanvasElement>('c');
// preserveDrawingBuffer only so screenshots of a hidden/background tab still show the frame
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.get('pdb') !== '0' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.1;

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI;

// ---- stand-in arena (what the engine owns) ----------------------------------------------------------
const WALL_R = 36;
const WALL_T = 0.6;
const BASE_Y = 1.4;
const TOP_Y = 2.7;
const arena = new THREE.Group();
scene.add(arena);
{
  const dirt = new THREE.MeshStandardMaterial({ color: 0x6b5034, roughness: 1 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 128), dirt);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  arena.add(floor);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const s = i / 16;
    pts.push(new THREE.Vector2(30 + 6 * s, BASE_Y * (s * s * (3 - 2 * s))));
  }
  const bank = new THREE.Mesh(new THREE.LatheGeometry(pts, 160), new THREE.MeshStandardMaterial({ color: 0x5f4a33, roughness: 1, side: THREE.DoubleSide }));
  bank.receiveShadow = true;
  arena.add(bank);
  const concrete = new THREE.MeshStandardMaterial({ color: 0xa3a098, roughness: 0.9 });
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(WALL_R, WALL_R, TOP_Y - BASE_Y, 160, 1, true), new THREE.MeshStandardMaterial({ color: 0xa3a098, roughness: 0.9, side: THREE.BackSide }));
  inner.position.y = (TOP_Y + BASE_Y) / 2;
  inner.receiveShadow = true;
  arena.add(inner);
  const top = new THREE.Mesh(new THREE.RingGeometry(WALL_R, WALL_R + WALL_T, 160), concrete);
  top.rotation.x = -Math.PI / 2;
  top.position.y = TOP_Y;
  arena.add(top);
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(WALL_R + WALL_T, WALL_R + WALL_T, TOP_Y, 160, 1, true), concrete);
  outer.position.y = TOP_Y / 2;
  arena.add(outer);
  // a few box "cars"
  const colors = [0xc0392b, 0x2e86de, 0xf1c40f, 0x27ae60, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x34495e, 0xd35400];
  const carGeo = new THREE.BoxGeometry(1.9, 1.0, 4.6);
  const cabGeo = new THREE.BoxGeometry(1.6, 0.55, 2.2);
  colors.forEach((c, i) => {
    const car = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.3 });
    const body = new THREE.Mesh(carGeo, m);
    body.position.y = 0.75;
    const cab = new THREE.Mesh(cabGeo, new THREE.MeshStandardMaterial({ color: 0x151a20, roughness: 0.2, metalness: 0.5 }));
    cab.position.set(0, 1.5, -0.3);
    body.castShadow = cab.castShadow = true;
    car.add(body, cab);
    const a = (i / colors.length) * Math.PI * 2 + 0.3;
    const r = i % 3 === 0 ? 31 : 8 + (i % 4) * 5;
    car.position.set(Math.cos(a) * r, i % 3 === 0 ? 0.25 : 0, Math.sin(a) * r);
    car.rotation.y = a + (i % 2 ? 1.2 : -0.4);
    if (i % 3 === 0) car.rotation.z = 0.12;
    arena.add(car);
  });
}

// ---- lights (the engine owns these; here only to preview) --------------------------------------------
const hemi = new THREE.HemisphereLight(0x33416a, 0x1a140e, 0.35);
scene.add(hemi);
const moonLight = new THREE.DirectionalLight(0x9db4ff, 0.35);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.left = -45;
moonLight.shadow.camera.right = 45;
moonLight.shadow.camera.top = 45;
moonLight.shadow.camera.bottom = -45;
moonLight.shadow.camera.far = 300;
scene.add(moonLight, moonLight.target);
const spots: THREE.SpotLight[] = [];

// ---- post ------------------------------------------------------------------------------------------------
const size = new THREE.Vector2();
renderer.getDrawingBufferSize(size);
const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.6, 0.4, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---- stadium -------------------------------------------------------------------------------------------------
let stadium: Stadium;
let quality: 'high' | 'low' = params.get('q') === 'low' ? 'low' : 'high';
function build() {
  if (stadium) stadium.dispose();
  for (const s of spots) {
    scene.remove(s, s.target);
    s.dispose();
  }
  spots.length = 0;
  const t0 = performance.now();
  stadium = createStadium({ quality, seed: Number(params.get('seed') ?? 1977) });
  console.log(`stadium built in ${(performance.now() - t0).toFixed(0)} ms, crowd ${stadium.crowdCount}`);
  scene.add(stadium.group);
  for (const f of stadium.floodlights) {
    const s = new THREE.SpotLight(f.color, 5000, 0, f.angle, f.penumbra, 2);
    s.position.copy(f.position);
    s.target.position.copy(f.target);
    s.visible = $<HTMLInputElement>('spots').checked;
    scene.add(s, s.target);
    spots.push(s);
  }
  moonLight.position.copy(stadium.moonDirection).multiplyScalar(120);
  measureNext = performance.now() + 500;
}

// ---- views ----------------------------------------------------------------------------------------------------
const views: Record<string, [number[], number[]]> = {
  car: [[0, 1.6, 22], [0, 6, -40]],
  stands: [[-10, 1.3, -24], [-26, 7, -44]],
  fence: [[14, 1.5, 27], [26, 4.5, 30]],
  gate: [[0, 2.0, -12], [0, 6, 40]],
  board: [[0, 3, 10], [0, 22, -60]],
  high: [[0, 80, 110], [0, 0, 0]],
  outside: [[150, 45, 120], [0, 10, 0]],
};
function setView(name: string) {
  const v = views[name];
  if (!v) return;
  camera.position.fromArray(v[0]);
  controls.target.fromArray(v[1]);
  controls.update();
}
const vbox = $('views');
for (const k of Object.keys(views)) {
  const b = document.createElement('button');
  b.textContent = k;
  b.onclick = () => setView(k);
  vbox.appendChild(b);
}

// ---- UI ------------------------------------------------------------------------------------------------------------
const ex = $<HTMLInputElement>('ex');
const exv = $('exv');
if (params.get('ex')) ex.value = params.get('ex') as string;
const syncEx = () => (exv.textContent = Number(ex.value).toFixed(2));
ex.oninput = syncEx;
syncEx();
const randomArenaPoint = () => {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * 28;
  return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
};
$('cheer').onclick = () => stadium.cheer(1, randomArenaPoint());
$('cheerAll').onclick = () => stadium.cheer(1);
$<HTMLInputElement>('bloom').onchange = (e) => (bloom.enabled = (e.target as HTMLInputElement).checked);
$<HTMLInputElement>('spots').onchange = (e) => spots.forEach((s) => (s.visible = (e.target as HTMLInputElement).checked));
if (params.get('auto') === '1') $<HTMLInputElement>('auto').checked = true;
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-q]')) {
  b.onclick = () => {
    quality = b.dataset.q === 'low' ? 'low' : 'high';
    build();
  };
}
$('hide').onclick = () => ($('panel').style.display = 'none');
if (params.get('panel') === '0') $('panel').style.display = 'none';

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---- stats ----------------------------------------------------------------------------------------------------------
let sceneCalls = 0;
let sceneTris = 0;
let stadiumCalls = 0;
let stadiumTris = 0;
let measureNext = 0;
scene.onAfterRender = () => {
  sceneCalls = renderer.info.render.calls;
  sceneTris = renderer.info.render.triangles;
};
function measureStadiumOnly() {
  const hidden: THREE.Object3D[] = [];
  for (const c of scene.children) {
    if (c !== stadium.group && c.visible && !(c instanceof THREE.Light)) {
      c.visible = false;
      hidden.push(c);
    }
  }
  const prev = scene.onAfterRender;
  scene.onAfterRender = () => {};
  renderer.info.reset();
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  stadiumCalls = renderer.info.render.calls;
  stadiumTris = renderer.info.render.triangles;
  scene.onAfterRender = prev;
  for (const h of hidden) h.visible = true;
}

// ---- loop -------------------------------------------------------------------------------------------------------------
build();
setView(params.get('view') ?? 'car');
const timer = new THREE.Timer();
let frames = 0;
let fpsT = 0;
let fps = 0;
let nextBoard = 0;
let nextAuto = 2;
let carsLeft = 9;
let elapsed = 0;
const stats = $('stats');
function frame() {
  requestAnimationFrame(frame);
  timer.update();
  step(Math.min(timer.getDelta(), 0.1));
}
function step(dt: number) {
  elapsed += dt;
  let e = Number(ex.value);
  if ($<HTMLInputElement>('auto').checked) {
    e = 0.45 + 0.4 * Math.sin(elapsed * 0.13);
    ex.value = e.toFixed(2);
    syncEx();
    if (elapsed > nextAuto) {
      nextAuto = elapsed + 1.5 + Math.random() * 4;
      stadium.cheer(0.6 + Math.random() * 0.8, randomArenaPoint());
    }
  }
  stadium.update(dt, elapsed, e);
  if (elapsed > nextBoard) {
    nextBoard = elapsed + 1;
    const left = Math.max(1, carsLeft - Math.floor(elapsed / 20));
    const tl = Math.max(0, 300 - Math.floor(elapsed));
    stadium.setScoreboard([
      'THE BOWL',
      `CARS LEFT ${left}`,
      `#44  ${32 + Math.floor(elapsed / 7) * 2} PTS`,
      `TIME ${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`,
    ]);
  }
  controls.update();
  renderer.info.reset();
  composer.render(dt);
  if (performance.now() > measureNext) {
    measureNext = performance.now() + 2000;
    measureStadiumOnly();
  }
  frames++;
  fpsT += dt;
  if (fpsT > 0.5) {
    fps = frames / fpsT;
    frames = 0;
    fpsT = 0;
    stats.textContent =
      `fps ${fps.toFixed(0)}\n` +
      `scene draws ${sceneCalls}  tris ${(sceneTris / 1000).toFixed(0)}k\n` +
      `stadium draws ${stadiumCalls}  tris ${(stadiumTris / 1000).toFixed(0)}k\n` +
      `crowd ${stadium.crowdCount}  (${quality})`;
  }
}
frame();

/** Dev helper: resize the drawing buffer, wait two frames, return the canvas as a PNG blob. */
async function capture(w = 1280, h = 720): Promise<Blob | null> {
  if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  // render synchronously (rAF does not run while the tab is hidden)
  for (let i = 0; i < 3; i++) step(1 / 60);
  return new Promise((r) => renderer.domElement.toBlob(r, 'image/png'));
}
(window as unknown as { stadiumDev: unknown }).stadiumDev = { scene, camera, controls, renderer, get stadium() { return stadium; }, setView, capture, views, step };
