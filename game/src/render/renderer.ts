import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Replaces NaN/Inf and clamps extreme HDR values, so one bad pixel can't black out the bloom blur. */
const SanitizeShader = {
  name: 'SanitizeShader',
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(notEqual(c, c)) || any(greaterThan(abs(c), vec4(60000.0)))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = clamp(c, vec4(0.0), vec4(48.0));
    }`,
};

export type Quality = 'low' | 'medium' | 'high';

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  quality: Quality = 'high';
  private w = 1;
  private h = 1;

  constructor(canvas: HTMLCanvasElement) {
    // ?shots=1 keeps the drawing buffer so screenshots work while the page isn't being composited
    const preserve = new URLSearchParams(location.search).has('shots');
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: preserve });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    this.composer.addPass(new ShaderPass(SanitizeShader));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.42, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize(window.innerWidth, window.innerHeight);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.bloom.enabled = q !== 'low';
    this.resize(this.w, this.h);
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const dpr = window.devicePixelRatio || 1;
    const pr = this.quality === 'high' ? Math.min(dpr, 2) : this.quality === 'medium' ? Math.min(dpr, 1.25) : 1;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set((w * pr) / 2, (h * pr) / 2);
  }

  get heightPx() {
    return this.h * this.renderer.getPixelRatio();
  }

  /** draw calls / triangles of the last frame (all passes) */
  lastInfo = { render: { calls: 0, triangles: 0 } };

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    const info = this.renderer.info;
    info.autoReset = false;
    info.reset();
    this.composer.render();
    this.lastInfo.render.calls = info.render.calls;
    this.lastInfo.render.triangles = info.render.triangles;
  }
}

/** Night-stadium lighting: a shadow-casting key from the main floodlight bank, a cool fill, sky/ground bounce. */
export function addStadiumLights(scene: THREE.Scene, quality: Quality, arenaRadius: number) {
  const hemi = new THREE.HemisphereLight(0x5a6a9a, 0x4a3524, 0.75);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0d8, 2.7);
  key.position.set(26, 48, 14);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  const sm = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
  key.shadow.mapSize.set(sm, sm);
  const s = arenaRadius + 4;
  const sc = key.shadow.camera as THREE.OrthographicCamera;
  sc.left = -s;
  sc.right = s;
  sc.top = s;
  sc.bottom = -s;
  sc.near = 5;
  sc.far = 140;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.04;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 1.1);
  fill.position.set(-30, 40, -22);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe2b8, 0.8);
  rim.position.set(-10, 30, 40);
  scene.add(rim);
  return { hemi, key, fill, rim };
}

/** Golden-hour lighting for the Figure 8: a low warm sun (shadows) plus sky fill. */
export function addDuskLights(scene: THREE.Scene, quality: Quality, sunDir: THREE.Vector3, sunColor?: THREE.Color) {
  // a low golden-hour sun (the venue's colour when it has one) and a sky/earth hemisphere fill
  const hemi = new THREE.HemisphereLight(0x8fa6d8, 0x6a5238, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(sunColor ?? 0xffc28a, 2.9);
  sun.position.copy(sunDir).normalize().multiplyScalar(300);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  const sm = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  // the sun is only a few degrees up: the frustum has to take in the stands' long shadows too
  sc.left = -100;
  sc.right = 100;
  sc.top = 70;
  sc.bottom = -70;
  sc.near = 10;
  sc.far = 700;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  return { hemi, sun };
}

/**
 * Environment map for reflections: a dark night dome, a warm band of lit stands at the horizon, and bright
 * floodlight banks up high, so car paint and chrome pick up the stadium lights.
 */
export function makeStadiumEnvironment(renderer: THREE.WebGLRenderer, floodlights?: THREE.Vector3[], mood: 'night' | 'dusk' = 'night', sunDir?: THREE.Vector3): THREE.Texture {
  const env = new THREE.Scene();
  if (mood === 'dusk') return makeDuskEnvironment(renderer, sunDir ?? new THREE.Vector3(-0.6, 0.2, -0.75));
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(100, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP;
        void main(){
          float y = vP.y;
          vec3 top = vec3(0.012, 0.018, 0.045);
          vec3 hor = vec3(0.10, 0.075, 0.06);
          vec3 stands = vec3(0.55, 0.42, 0.3);
          vec3 ground = vec3(0.09, 0.065, 0.045);
          vec3 c = mix(hor, top, smoothstep(0.0, 0.6, y));
          c = mix(c, stands, smoothstep(0.02, 0.07, y) * (1.0 - smoothstep(0.12, 0.26, y)) * 0.6);
          c = mix(ground, c, smoothstep(-0.05, 0.02, y));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  env.add(dome);
  const lamps = floodlights && floodlights.length ? floodlights : [0, 1, 2, 3, 4, 5].map((i) => new THREE.Vector3(Math.cos((i / 6) * Math.PI * 2) * 55, 30, Math.sin((i / 6) * Math.PI * 2) * 55));
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.7, 4.2) });
  for (const p of lamps) {
    const d = p.clone().normalize().multiplyScalar(90);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(16, 7), lampMat);
    panel.position.copy(d);
    panel.lookAt(0, 0, 0);
    env.add(panel);
  }
  // a big soft key panel roughly where the shadow light comes from
  const keyPanel = new THREE.Mesh(new THREE.PlaneGeometry(40, 18), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.45, 2.2) }));
  keyPanel.position.set(26, 48, 14).normalize().multiplyScalar(90);
  keyPanel.lookAt(0, 0, 0);
  env.add(keyPanel);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  return tex;
}

/** Sunset dome: warm orange horizon, blue zenith, a bright low sun. */
function makeDuskEnvironment(renderer: THREE.WebGLRenderer, sunDir: THREE.Vector3): THREE.Texture {
  const env = new THREE.Scene();
  const sd = sunDir.clone().normalize();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(100, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uSun: { value: sd } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uSun; varying vec3 vP;
        void main(){
          float y = vP.y;
          vec3 zen = vec3(0.10, 0.16, 0.34);
          vec3 hor = vec3(1.05, 0.55, 0.32);
          vec3 ground = vec3(0.16, 0.12, 0.08);
          vec3 c = mix(hor, zen, smoothstep(0.0, 0.55, y));
          float sunAmt = max(dot(normalize(vP), uSun), 0.0);
          c += vec3(1.6, 0.9, 0.5) * pow(sunAmt, 24.0) + vec3(0.5, 0.25, 0.12) * pow(sunAmt, 4.0);
          c = mix(ground, c, smoothstep(-0.06, 0.02, y));
          gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
        }`,
    }),
  );
  env.add(dome);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 6.5, 4) }));
  sun.position.copy(sd).multiplyScalar(90);
  sun.lookAt(0, 0, 0);
  env.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  return tex;
}
