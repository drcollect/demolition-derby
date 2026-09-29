import * as THREE from 'three';
import { makeGlow, makePuff } from '../render/textures';

export interface ParticleKind {
  max: number;
  texture: THREE.Texture;
  blending: THREE.Blending;
  gravity: number; // m/s² (negative = down)
  drag: number; // 1/s
  /** size over normalised life t (0..1), multiplied by the particle's base size */
  size: (t: number) => number;
  /** alpha over life */
  alpha: (t: number) => number;
  /** colour over life, written into out (linear 0..1, may exceed 1 for bloom) */
  color?: (t: number, base: THREE.Color, out: THREE.Color) => void;
  bounce?: number; // ground restitution; undefined = no ground collision
  spinRate?: number;
}

interface Pool {
  kind: ParticleKind;
  points: THREE.Points;
  pos: Float32Array;
  vel: Float32Array;
  col: Float32Array; // rgba out
  base: Float32Array; // base rgb
  size: Float32Array; // current size out
  baseSize: Float32Array;
  rot: Float32Array;
  rotVel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  count: number;
}

const vert = /* glsl */ `
attribute vec4 pcolor;
attribute float psize;
attribute float prot;
uniform float uScale;
varying vec4 vColor;
varying float vRot;
#include <common>
#include <fog_pars_vertex>
void main() {
  vColor = pcolor;
  vRot = prot;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = psize * uScale / max(0.1, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = /* glsl */ `
uniform sampler2D uMap;
varying vec4 vColor;
varying float vRot;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  uv = mat2(c, -s, s, c) * uv + 0.5;
  vec4 t = texture2D(uMap, uv);
  gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <fog_fragment>
}`;

const _c = new THREE.Color();

export class ParticleSystem {
  readonly group = new THREE.Group();
  private pools = new Map<string, Pool>();
  private uScale = { value: 800 };

  add(name: string, kind: ParticleKind) {
    const n = kind.max;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 4);
    const size = new Float32Array(n);
    const rot = new Float32Array(n);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('prot', new THREE.BufferAttribute(rot, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: kind.texture }, uScale: this.uScale }]),
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: kind.blending,
      fog: true,
    });
    mat.uniforms.uScale = this.uScale;
    mat.uniforms.uMap.value = kind.texture;
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = kind.blending === THREE.AdditiveBlending ? 3 : 2;
    this.group.add(points);
    this.pools.set(name, {
      kind,
      points,
      pos,
      vel: new Float32Array(n * 3),
      col,
      base: new Float32Array(n * 3),
      size,
      baseSize: new Float32Array(n),
      rot,
      rotVel: new Float32Array(n),
      life: new Float32Array(n),
      maxLife: new Float32Array(n),
      count: 0,
    });
  }

  setViewport(heightPx: number, fovDeg: number) {
    this.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  emit(name: string, p: THREE.Vector3, v: THREE.Vector3, life: number, size: number, color: THREE.ColorRepresentation) {
    const pool = this.pools.get(name);
    if (!pool) return;
    let i: number;
    if (pool.count < pool.kind.max) i = pool.count++;
    else {
      // recycle the oldest-looking slot
      i = Math.floor(Math.random() * pool.kind.max);
    }
    pool.pos[i * 3] = p.x;
    pool.pos[i * 3 + 1] = p.y;
    pool.pos[i * 3 + 2] = p.z;
    pool.vel[i * 3] = v.x;
    pool.vel[i * 3 + 1] = v.y;
    pool.vel[i * 3 + 2] = v.z;
    _c.set(color);
    pool.base[i * 3] = _c.r;
    pool.base[i * 3 + 1] = _c.g;
    pool.base[i * 3 + 2] = _c.b;
    pool.baseSize[i] = size;
    pool.life[i] = 0;
    pool.maxLife[i] = life;
    pool.rot[i] = Math.random() * Math.PI * 2;
    pool.rotVel[i] = (Math.random() - 0.5) * (pool.kind.spinRate ?? 1);
  }

  update(dt: number, groundY: (x: number, z: number) => number) {
    for (const pool of this.pools.values()) {
      const k = pool.kind;
      const dragF = Math.exp(-k.drag * dt);
      let n = pool.count;
      for (let i = 0; i < n; i++) {
        pool.life[i] += dt;
        if (pool.life[i] >= pool.maxLife[i]) {
          // swap-remove
          n--;
          this.copySlot(pool, n, i);
          i--;
          continue;
        }
        const i3 = i * 3;
        pool.vel[i3 + 1] += k.gravity * dt;
        pool.vel[i3] *= dragF;
        pool.vel[i3 + 1] *= dragF;
        pool.vel[i3 + 2] *= dragF;
        pool.pos[i3] += pool.vel[i3] * dt;
        pool.pos[i3 + 1] += pool.vel[i3 + 1] * dt;
        pool.pos[i3 + 2] += pool.vel[i3 + 2] * dt;
        if (k.bounce !== undefined) {
          const gy = groundY(pool.pos[i3], pool.pos[i3 + 2]) + 0.01;
          if (pool.pos[i3 + 1] < gy) {
            pool.pos[i3 + 1] = gy;
            if (pool.vel[i3 + 1] < 0) pool.vel[i3 + 1] *= -k.bounce;
            pool.vel[i3] *= 0.6;
            pool.vel[i3 + 2] *= 0.6;
          }
        }
        pool.rot[i] += pool.rotVel[i] * dt;
        const t = pool.life[i] / pool.maxLife[i];
        pool.size[i] = pool.baseSize[i] * k.size(t);
        _c.setRGB(pool.base[i3], pool.base[i3 + 1], pool.base[i3 + 2]);
        if (k.color) k.color(t, _c, _c);
        pool.col[i * 4] = _c.r;
        pool.col[i * 4 + 1] = _c.g;
        pool.col[i * 4 + 2] = _c.b;
        pool.col[i * 4 + 3] = k.alpha(t);
      }
      pool.count = n;
      const g = pool.points.geometry;
      g.setDrawRange(0, n);
      (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (g.attributes.pcolor as THREE.BufferAttribute).needsUpdate = true;
      (g.attributes.psize as THREE.BufferAttribute).needsUpdate = true;
      (g.attributes.prot as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  private copySlot(p: Pool, from: number, to: number) {
    if (from === to) return;
    for (let k = 0; k < 3; k++) {
      p.pos[to * 3 + k] = p.pos[from * 3 + k];
      p.vel[to * 3 + k] = p.vel[from * 3 + k];
      p.base[to * 3 + k] = p.base[from * 3 + k];
    }
    for (let k = 0; k < 4; k++) p.col[to * 4 + k] = p.col[from * 4 + k];
    p.size[to] = p.size[from];
    p.baseSize[to] = p.baseSize[from];
    p.rot[to] = p.rot[from];
    p.rotVel[to] = p.rotVel[from];
    p.life[to] = p.life[from];
    p.maxLife[to] = p.maxLife[from];
  }

  clear() {
    for (const p of this.pools.values()) {
      p.count = 0;
      p.points.geometry.setDrawRange(0, 0);
    }
  }
}

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();

/** The game's particle effects, built on one ParticleSystem. */
export class Effects {
  readonly particles = new ParticleSystem();
  /** multiplies the dust colour, to match the arena's dirt and light */
  readonly dustTint = new THREE.Color(1, 1, 1);
  constructor() {
    const glow = makeGlow();
    const puff = makePuff();
    const ps = this.particles;
    ps.add('spark', {
      max: 1500,
      texture: glow,
      blending: THREE.AdditiveBlending,
      gravity: -14,
      drag: 1.2,
      bounce: 0.35,
      size: (t) => 1 - t * 0.6,
      alpha: (t) => 1 - t,
      color: (t, b, o) => o.setRGB(b.r * (4 - t * 3), b.g * (3 - t * 2.6), b.b * (1.5 - t * 1.4)),
    });
    ps.add('smoke', {
      max: 900,
      texture: puff,
      blending: THREE.NormalBlending,
      gravity: 1.6,
      drag: 1.1,
      spinRate: 1.2,
      size: (t) => 0.6 + t * 2.4,
      alpha: (t) => (t < 0.1 ? t * 10 : 1) * (1 - t) * 0.55,
    });
    ps.add('dust', {
      max: 900,
      texture: puff,
      blending: THREE.NormalBlending,
      gravity: 0.25,
      drag: 1.8,
      spinRate: 0.8,
      size: (t) => 0.5 + t * 2.2,
      alpha: (t) => (t < 0.15 ? t / 0.15 : 1) * (1 - t) * 0.42,
    });
    ps.add('steam', {
      max: 400,
      texture: puff,
      blending: THREE.NormalBlending,
      gravity: 2.5,
      drag: 1.5,
      spinRate: 1.5,
      size: (t) => 0.4 + t * 1.6,
      alpha: (t) => (1 - t) * 0.45,
    });
    ps.add('fire', {
      max: 700,
      texture: glow,
      blending: THREE.AdditiveBlending,
      gravity: 5,
      drag: 1.6,
      spinRate: 2,
      size: (t) => (1 - t) * 1.2 + 0.3,
      alpha: (t) => (1 - t) * 0.9,
      color: (t, b, o) => o.setRGB(3.2 - t * 1.5, 1.6 - t * 1.4, 0.35 - t * 0.33),
    });
    ps.add('glass', {
      max: 900,
      texture: glow,
      blending: THREE.AdditiveBlending,
      gravity: -12,
      drag: 0.6,
      bounce: 0.3,
      spinRate: 8,
      size: (t) => 0.6 + 0.4 * Math.abs(Math.sin(t * 40)),
      alpha: (t) => (1 - t * t) * 0.9,
    });
    ps.add('chunk', {
      max: 500,
      texture: puff,
      blending: THREE.NormalBlending,
      gravity: -13,
      drag: 0.4,
      bounce: 0.25,
      spinRate: 6,
      size: () => 1,
      alpha: (t) => 1 - t * t,
    });
  }

  sparks(p: THREE.Vector3, dir: THREE.Vector3, count: number, speed = 7) {
    for (let i = 0; i < count; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(speed).addScaledVector(dir, speed * (0.5 + Math.random()));
      this.particles.emit('spark', p, _v, 0.25 + Math.random() * 0.45, 0.05 + Math.random() * 0.06, 0xffc070);
    }
  }

  smoke(p: THREE.Vector3, vel: THREE.Vector3, dark: number, size = 1) {
    _v.copy(vel).multiplyScalar(0.3).add(_p.set((Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6));
    const g = 0.12 + (1 - dark) * 0.5;
    this.particles.emit('smoke', p, _v, 1.8 + Math.random() * 1.6, size * (0.6 + Math.random() * 0.5), new THREE.Color(g, g * 0.97, g * 0.94));
  }

  steam(p: THREE.Vector3, vel: THREE.Vector3) {
    _v.copy(vel).multiplyScalar(0.4).add(_p.set((Math.random() - 0.5) * 0.8, 1 + Math.random(), (Math.random() - 0.5) * 0.8));
    this.particles.emit('steam', p, _v, 0.8 + Math.random() * 0.6, 0.5 + Math.random() * 0.3, 0xdde2e6);
  }

  fire(p: THREE.Vector3, vel: THREE.Vector3, size = 1) {
    _v.copy(vel).multiplyScalar(0.5).add(_p.set((Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 1.2, (Math.random() - 0.5) * 0.8));
    this.particles.emit('fire', p, _v, 0.35 + Math.random() * 0.45, size * (0.5 + Math.random() * 0.5), 0xffffff);
  }

  dust(p: THREE.Vector3, vel: THREE.Vector3, amount: number) {
    _v.copy(vel).multiplyScalar(0.25).add(_p.set((Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2));
    const l = 0.42 + Math.random() * 0.12;
    const t = this.dustTint;
    this.particles.emit('dust', p, _v, 1.2 + Math.random() * 1.4, (0.7 + Math.random() * 0.8) * amount, new THREE.Color(l * t.r, l * 0.82 * t.g, l * 0.64 * t.b));
  }

  glass(p: THREE.Vector3, vel: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).multiplyScalar(4).addScaledVector(vel, 0.6);
      _p.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.5));
      this.particles.emit('glass', _p, _v, 0.8 + Math.random() * 1.2, 0.04 + Math.random() * 0.05, 0xcfe8f0);
    }
  }

  chunks(p: THREE.Vector3, vel: THREE.Vector3, count: number, color: THREE.ColorRepresentation) {
    for (let i = 0; i < count; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.3, Math.random() - 0.5).multiplyScalar(5).addScaledVector(vel, 0.5);
      this.particles.emit('chunk', p, _v, 1.5 + Math.random() * 1.5, 0.06 + Math.random() * 0.08, color);
    }
  }
}
