import * as THREE from 'three';
import { rng } from '../core/math';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  return { c, g };
}

/** Tileable value noise, `oct` octaves, written into a Float32Array (0..1). */
function tileNoise(size: number, seed: number, baseCells: number, oct: number, gain = 0.5): Float32Array {
  const out = new Float32Array(size * size);
  const r = rng(seed);
  let amp = 1;
  let total = 0;
  let cells = baseCells;
  for (let o = 0; o < oct; o++) {
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = r();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * cells;
      const y0 = Math.floor(gy) % cells;
      const y1 = (y0 + 1) % cells;
      let ty = gy - Math.floor(gy);
      ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells;
        const x0 = Math.floor(gx) % cells;
        const x1 = (x0 + 1) % cells;
        let tx = gx - Math.floor(gx);
        tx = tx * tx * (3 - 2 * tx);
        const a = grid[y0 * cells + x0], b = grid[y0 * cells + x1];
        const c = grid[y1 * cells + x0], d = grid[y1 * cells + x1];
        out[y * size + x] += amp * ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty);
      }
    }
    total += amp;
    amp *= gain;
    cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

export interface DirtTextures {
  map: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}

const dirtCache = new Map<string, DirtTextures>();

/** Packed arena dirt: colour, roughness (with a few damp glossy patches) and a bump map. Tileable. Cached. */
export function makeDirt(size = 1024, seed = 7): DirtTextures {
  const key = `${size}|${seed}`;
  const hit = dirtCache.get(key);
  if (hit) return hit;
  const made = buildDirt(size, seed);
  dirtCache.set(key, made);
  return made;
}

function buildDirt(size: number, seed: number): DirtTextures {
  const n1 = tileNoise(size, seed, 8, 6, 0.55);
  const n2 = tileNoise(size, seed + 1, 4, 3, 0.5);
  const n3 = tileNoise(size, seed + 2, 32, 3, 0.6);
  const { c: cc, g: gc } = canvas(size, size);
  const { c: rc, g: gr } = canvas(size, size);
  const { c: bc, g: gb } = canvas(size, size);
  const col = gc.createImageData(size, size);
  const rough = gr.createImageData(size, size);
  const bump = gb.createImageData(size, size);
  const r = rng(seed + 9);
  for (let i = 0; i < size * size; i++) {
    const a = n1[i], b = n2[i], s = n3[i];
    const wet = Math.max(0, (b - 0.62) * 5); // damp patches
    const dark = 0.62 + a * 0.55 - wet * 0.22;
    // warm brown dirt with slightly reddish clay variation
    const rr = (118 + 30 * (b - 0.5)) * dark;
    const gg = (92 + 18 * (a - 0.5)) * dark;
    const bb = (68 + 10 * (s - 0.5)) * dark;
    const j = i * 4;
    col.data[j] = rr;
    col.data[j + 1] = gg;
    col.data[j + 2] = bb;
    col.data[j + 3] = 255;
    const ro = Math.max(0.18, 0.95 - wet * 0.9 - s * 0.05);
    rough.data[j] = rough.data[j + 1] = rough.data[j + 2] = ro * 255;
    rough.data[j + 3] = 255;
    const h = a * 0.6 + s * 0.4;
    bump.data[j] = bump.data[j + 1] = bump.data[j + 2] = h * 255;
    bump.data[j + 3] = 255;
  }
  gc.putImageData(col, 0, 0);
  gr.putImageData(rough, 0, 0);
  gb.putImageData(bump, 0, 0);
  // pebbles and clods
  for (let k = 0; k < 2600; k++) {
    const x = r() * size, y = r() * size, rad = 0.6 + r() * r() * 3.2;
    const l = 70 + r() * 90;
    gc.fillStyle = `rgba(${l + 20},${l},${l - 15},${0.55 + r() * 0.4})`;
    gc.beginPath();
    gc.arc(x, y, rad, 0, Math.PI * 2);
    gc.fill();
    gb.fillStyle = `rgba(255,255,255,0.8)`;
    gb.beginPath();
    gb.arc(x, y, rad, 0, Math.PI * 2);
    gb.fill();
  }
  // old tyre ruts
  gc.lineCap = 'round';
  for (let k = 0; k < 14; k++) {
    const x = r() * size, y = r() * size, rad = size * (0.2 + r() * 0.6), a0 = r() * Math.PI * 2, len = 0.4 + r() * 0.8;
    for (const off of [0, 30 + r() * 8]) {
      gc.strokeStyle = `rgba(40,28,18,${0.12 + r() * 0.12})`;
      gc.lineWidth = 8 + r() * 6;
      gc.beginPath();
      gc.arc(x, y, rad + off, a0, a0 + len);
      gc.stroke();
    }
  }
  const mk = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: mk(cc, true), roughness: mk(rc, false), bump: mk(bc, false) };
}

/** Weathered concrete with a painted band. */
export function makeConcrete(size = 512, seed = 3): THREE.CanvasTexture {
  const n1 = tileNoise(size, seed, 6, 6, 0.6);
  const n2 = tileNoise(size, seed + 4, 3, 2, 0.5);
  const { c, g } = canvas(size, size);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 150 + (n1[i] - 0.5) * 70 - Math.max(0, n2[i] - 0.6) * 120;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v * 0.98;
    img.data[i * 4 + 2] = v * 0.94;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const r = rng(seed);
  // rust/tyre streaks
  for (let k = 0; k < 60; k++) {
    g.fillStyle = `rgba(30,25,20,${0.05 + r() * 0.12})`;
    const x = r() * size, y = size * (0.55 + r() * 0.45), w = 20 + r() * 120;
    g.fillRect(x, y, w, 3 + r() * 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Soft round puff used by smoke, dust and steam particles. */
export function makePuff(size = 128): THREE.CanvasTexture {
  const { c, g } = canvas(size, size);
  const r = rng(11);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  // lumpy
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 40; k++) {
    const a = r() * Math.PI * 2, d = size * (0.25 + r() * 0.25);
    const gg = g.createRadialGradient(size / 2 + Math.cos(a) * d, size / 2 + Math.sin(a) * d, 0, size / 2 + Math.cos(a) * d, size / 2 + Math.sin(a) * d, size * 0.18);
    gg.addColorStop(0, 'rgba(0,0,0,0.35)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gg;
    g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Hot core glow for sparks, fire and flashes. */
export function makeGlow(size = 64): THREE.CanvasTexture {
  const { c, g } = canvas(size, size);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Spider-web crack pattern for damaged glass (white lines on transparent). */
export function makeCrack(seed: number, size = 512): THREE.CanvasTexture {
  const { c, g } = canvas(size, size);
  const r = rng(seed);
  const cx = size * (0.3 + r() * 0.4), cy = size * (0.3 + r() * 0.4);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineCap = 'round';
  const spokes = 9 + Math.floor(r() * 7);
  const angles: number[] = [];
  for (let i = 0; i < spokes; i++) angles.push((i / spokes) * Math.PI * 2 + (r() - 0.5) * 0.5);
  for (const a of angles) {
    let x = cx, y = cy;
    g.lineWidth = 1.5 + r() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    const len = size * (0.4 + r() * 0.6);
    let d = 0;
    let ang = a;
    while (d < len) {
      const step = 8 + r() * 26;
      ang += (r() - 0.5) * 0.35;
      x += Math.cos(ang) * step;
      y += Math.sin(ang) * step;
      d += step;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // concentric rings
  for (let ring = 1; ring <= 5; ring++) {
    const rad = ring * size * (0.05 + r() * 0.05);
    g.lineWidth = 0.8 + r();
    g.beginPath();
    for (let i = 0; i <= spokes; i++) {
      const a = angles[i % spokes];
      const rr = rad * (0.8 + r() * 0.4);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // impact star
  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.08);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Spray-painted derby number: a white roundel with a big black number. */
export function makeNumberTexture(num: number, opts: { bg?: string; fg?: string; seed?: number; wide?: boolean } = {}): THREE.CanvasTexture {
  const w = opts.wide ? 512 : 256, h = 256;
  const { c, g } = canvas(w, h);
  const r = rng(opts.seed ?? num * 13 + 1);
  g.clearRect(0, 0, w, h);
  // rough spray-painted background panel
  g.fillStyle = opts.bg ?? '#f2efe6';
  g.beginPath();
  const pad = 14;
  const pts = 28;
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const rx = (w / 2 - pad) * (0.94 + r() * 0.06), ry = (h / 2 - pad) * (0.94 + r() * 0.06);
    const x = w / 2 + Math.cos(a) * rx, y = h / 2 + Math.sin(a) * ry;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  // overspray speckle
  for (let k = 0; k < 400; k++) {
    g.fillStyle = `rgba(242,239,230,${r() * 0.5})`;
    const a = r() * Math.PI * 2, d = 0.9 + r() * 0.2;
    g.fillRect(w / 2 + Math.cos(a) * (w / 2 - pad) * d, h / 2 + Math.sin(a) * (h / 2 - pad) * d, 2, 2);
  }
  g.fillStyle = opts.fg ?? '#111';
  g.font = `900 ${Math.round(h * 0.72)}px Impact, "Arial Black", "Helvetica Neue", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(w / 2, h / 2 + h * 0.03);
  g.rotate((r() - 0.5) * 0.12);
  g.fillText(String(num), 0, 0);
  g.restore();
  // drips
  for (let k = 0; k < 5; k++) {
    g.fillRect(w * (0.3 + r() * 0.4), h * (0.62 + r() * 0.1), 3, 10 + r() * 22);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Wood-grain for the wagon's side panels. */
export function makeWood(size = 512, seed = 5): THREE.CanvasTexture {
  const { c, g } = canvas(size, size);
  const n = tileNoise(size, seed, 4, 4, 0.5);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const grain = Math.sin((y / size) * 90 + n[i] * 14) * 0.5 + 0.5;
      const v = 0.55 + grain * 0.25 + (n[i] - 0.5) * 0.3;
      img.data[i * 4] = 150 * v;
      img.data[i * 4 + 1] = 92 * v;
      img.data[i * 4 + 2] = 48 * v;
      img.data[i * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Grungy overlay (0..1 grey) the paint shader uses for scratches, rust and dirt breakup. */
export function makeGrunge(size = 512, seed = 21): THREE.DataTexture {
  const n1 = tileNoise(size, seed, 8, 6, 0.6);
  const n2 = tileNoise(size, seed + 3, 24, 3, 0.55);
  const data = new Uint8Array(size * size * 4);
  const r = rng(seed);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = n1[i] * 255; // R: large blotches (rust/dirt)
    data[i * 4 + 1] = n2[i] * 255; // G: fine noise
    data[i * 4 + 2] = 0; // B: scratches (drawn below)
    data[i * 4 + 3] = 255;
  }
  // scratch lines into B
  for (let k = 0; k < 900; k++) {
    let x = r() * size, y = r() * size;
    const a = (r() - 0.5) * 0.6 + (r() < 0.5 ? 0 : Math.PI / 2) * 0.15;
    const len = 10 + r() * 60;
    for (let s = 0; s < len; s++) {
      const xi = ((Math.floor(x) % size) + size) % size, yi = ((Math.floor(y) % size) + size) % size;
      data[(yi * size + xi) * 4 + 2] = Math.min(255, data[(yi * size + xi) * 4 + 2] + 150 + r() * 100);
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
