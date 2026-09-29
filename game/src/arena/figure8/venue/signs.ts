import * as THREE from 'three';
import { ATLAS_H, ATLAS_W, CELL_H, CELL_W, ROTATION, Sign, createSignAtlas, signUV } from '../../stadium/signage';
import { GeoBuilder, type Rgb } from '../../stadium/util';

/*
 The stadium's sponsor atlas (2 x 16 cells of 1024 x 128) uses ids 0..22. The figure-8 venue creates its own
 copy and paints a few extra designs into the free cells 23..31 (the Bowl's atlas is untouched).
*/

export const F8Sign = {
  Figure8: 23 as Sign,
  StartFinish: 24 as Sign,
  Speedway: 25 as Sign,
  CountyFair: 26 as Sign,
  Concessions: 27 as Sign,
  Salvage: 28 as Sign,
  Radio: 29 as Sign,
  Pits: 30 as Sign,
  HotDogs: 31 as Sign,
};

/** Designs for barriers / fence boards (no Bowl-specific boards). */
export const F8_ROTATION: Sign[] = [...ROTATION, F8Sign.Figure8, F8Sign.CountyFair, F8Sign.Salvage, F8Sign.Radio, F8Sign.HotDogs];

const IMPACT = 'Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif';
const BLACK = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Rockwell, "Cooper Black", Georgia, "Times New Roman", serif';
const SCRIPT = '"Brush Script MT", "Snell Roundhand", "Segoe Script", cursive';

type Ctx = CanvasRenderingContext2D;

function txt(ctx: Ctx, s: string, x: number, y: number, size: number, font: string, color: string | CanvasGradient, maxW: number, o: { stroke?: string; sw?: number; italic?: boolean; weight?: string; shadow?: string } = {}) {
  ctx.save();
  ctx.font = `${o.italic ? 'italic ' : ''}${o.weight ?? 'normal'} ${size}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(s).width;
  const k = w > maxW ? maxW / w : 1;
  ctx.translate(x, y);
  ctx.scale(k, 1);
  ctx.lineJoin = 'round';
  if (o.shadow) {
    ctx.fillStyle = o.shadow;
    ctx.fillText(s, 4 / k, 4);
  }
  if (o.stroke) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = (o.sw ?? 4) * 2;
    ctx.strokeText(s, 0, 0);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, 0, 0);
  ctx.restore();
}

function checker(ctx: Ctx, x: number, y: number, w: number, h: number, cell: number) {
  for (let i = 0; i * cell < w; i++) {
    for (let j = 0; j * cell < h; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#111' : '#f4f2ea';
      ctx.fillRect(x + i * cell, y + j * cell, Math.min(cell, w - i * cell), Math.min(cell, h - j * cell));
    }
  }
}

function star(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

const W = CELL_W;
const H = CELL_H;
const grad = (ctx: Ctx, y0: number, y1: number, stops: [number, string][]) => {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
};

const DESIGNS: [Sign, (ctx: Ctx) => void][] = [
  [
    F8Sign.Figure8,
    (ctx) => {
      ctx.fillStyle = '#101010';
      ctx.fillRect(0, 0, W, H);
      checker(ctx, 0, 0, 120, H, 32);
      checker(ctx, W - 120, 0, 120, H, 32);
      txt(ctx, 'FIGURE 8', 400, 62, 100, IMPACT, grad(ctx, 12, 110, [[0, '#fff27a'], [0.5, '#ff9a1c'], [1, '#e2361a']]), 440, { italic: true, stroke: '#3a0a02', sw: 3 });
      txt(ctx, 'RACING', 760, 44, 44, BLACK, '#fff', 250, { weight: '900' });
      txt(ctx, 'EVERY SATURDAY', 760, 92, 26, BLACK, '#ffcf3a', 250, { weight: '900' });
    },
  ],
  [
    F8Sign.StartFinish,
    (ctx) => {
      ctx.fillStyle = '#f4f2ea';
      ctx.fillRect(0, 0, W, H);
      checker(ctx, 0, 0, W, 22, 22);
      checker(ctx, 0, H - 22, W, 22, 22);
      star(ctx, 512, 64, 30, '#c8141c');
      txt(ctx, 'START', 270, 66, 84, IMPACT, '#111', 360, { italic: true });
      txt(ctx, 'FINISH', 760, 66, 84, IMPACT, '#111', 380, { italic: true });
    },
  ],
  [
    F8Sign.Speedway,
    (ctx) => {
      ctx.fillStyle = grad(ctx, 0, H, [[0, '#c21d1d'], [1, '#8a0e10']]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f6e7c1';
      ctx.fillRect(0, 8, W, 4);
      ctx.fillRect(0, H - 12, W, 4);
      star(ctx, 60, 64, 34, '#f6e7c1');
      star(ctx, W - 60, 64, 34, '#f6e7c1');
      txt(ctx, 'TRI-COUNTY FAIR SPEEDWAY', W / 2, 66, 76, SERIF, '#f6e7c1', 840, { weight: 'bold', shadow: 'rgba(0,0,0,0.35)' });
    },
  ],
  [
    F8Sign.CountyFair,
    (ctx) => {
      ctx.fillStyle = '#1d4f9c';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f2c61f';
      ctx.beginPath();
      ctx.moveTo(0, 30);
      ctx.lineTo(300, 30);
      ctx.lineTo(330, 64);
      ctx.lineTo(300, 98);
      ctx.lineTo(0, 98);
      ctx.fill();
      txt(ctx, 'COUNTY FAIR', 155, 66, 50, IMPACT, '#1d4f9c', 270);
      txt(ctx, 'AUG 14-20', 520, 46, 44, BLACK, '#fff', 330, { weight: '900' });
      txt(ctx, 'RIDES • LIVESTOCK • PIE CONTEST', 660, 98, 26, BLACK, '#f2c61f', 620, { weight: '900' });
      star(ctx, 900, 44, 26, '#f2c61f');
    },
  ],
  [
    F8Sign.Concessions,
    (ctx) => {
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = i % 2 ? '#f4f2ea' : '#c8141c';
        ctx.fillRect(i * 64, 0, 64, H);
      }
      ctx.fillStyle = '#f4f2ea';
      ctx.fillRect(40, 20, W - 80, H - 40);
      txt(ctx, 'CORN DOGS • LEMONADE • FUNNEL CAKE', W / 2, 66, 56, IMPACT, '#c8141c', 880);
    },
  ],
  [
    F8Sign.Salvage,
    (ctx) => {
      ctx.fillStyle = '#3b3f45';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f2c200';
      ctx.fillRect(0, 0, W, 10);
      ctx.fillRect(0, H - 10, W, 10);
      txt(ctx, "BIG AL'S AUTO SALVAGE", 420, 60, 70, IMPACT, '#f2c200', 700);
      txt(ctx, "WE CRUSH 'EM", 880, 46, 30, BLACK, '#fff', 240, { weight: '900' });
      txt(ctx, 'YOU WRECK EM', 880, 88, 22, BLACK, '#f2c200', 240, { weight: '900' });
    },
  ],
  [
    F8Sign.Radio,
    (ctx) => {
      ctx.fillStyle = '#0f2a4a';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#ff6a2a';
      ctx.lineWidth = 6;
      for (let r = 20; r <= 60; r += 20) {
        ctx.beginPath();
        ctx.arc(90, 64, r, -0.9, 0.9);
        ctx.stroke();
      }
      txt(ctx, 'WKRZ 1340 AM', 450, 58, 82, IMPACT, '#fff', 560, { italic: true });
      txt(ctx, 'LIVE', 850, 44, 44, BLACK, '#ff6a2a', 220, { weight: '900' });
      txt(ctx, 'FROM THE TRACK', 850, 90, 24, BLACK, '#bcd0ff', 240, { weight: '900' });
    },
  ],
  [
    F8Sign.Pits,
    (ctx) => {
      for (let i = -4; i < 40; i++) {
        ctx.fillStyle = i % 2 ? '#141414' : '#f2c200';
        ctx.beginPath();
        ctx.moveTo(i * 40, H);
        ctx.lineTo(i * 40 + 40, H);
        ctx.lineTo(i * 40 + 40 + H, 0);
        ctx.lineTo(i * 40 + H, 0);
        ctx.fill();
      }
      ctx.fillStyle = '#141414';
      ctx.fillRect(200, 14, W - 400, H - 28);
      txt(ctx, 'PIT AREA • CREW ONLY', W / 2, 66, 64, IMPACT, '#f2c200', 580);
    },
  ],
  [
    F8Sign.HotDogs,
    (ctx) => {
      ctx.fillStyle = '#f5c518';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#c0261f';
      ctx.beginPath();
      ctx.ellipse(110, 64, 80, 26, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8b04a';
      ctx.beginPath();
      ctx.ellipse(110, 72, 90, 20, -0.1, 0, Math.PI);
      ctx.fill();
      txt(ctx, 'HOT DOGS', 520, 60, 92, SCRIPT, '#c0261f', 520, { shadow: 'rgba(0,0,0,0.2)' });
      txt(ctx, '50¢', 900, 64, 80, IMPACT, '#111', 180);
    },
  ],
];

/** The stadium atlas plus the figure-8 designs. */
export function createF8SignAtlas(): THREE.CanvasTexture {
  const tex = createSignAtlas();
  const canvas = tex.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (const [id, draw] of DESIGNS) {
      const n = id as number;
      const cx = (n % 2) * CELL_W;
      const cy = Math.floor(n / 2) * CELL_H;
      if (cy + CELL_H > ATLAS_H || cx + CELL_W > ATLAS_W) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, cy, CELL_W, CELL_H);
      ctx.clip();
      ctx.translate(cx, cy);
      draw(ctx);
      ctx.restore();
    }
    tex.needsUpdate = true;
  }
  return tex;
}

/**
 * A sign following a polyline (e.g. a banner strapped along a curved barrier). `pts` are the bottom-edge
 * points along the banner, `facing(i)` the outward normal per point; u runs left-to-right for a viewer.
 */
export function polylineSign(b: GeoBuilder, id: Sign, pts: THREE.Vector3[], facing: THREE.Vector3[], height: number, reverseU: boolean, tint: Rgb = [1, 1, 1]): void {
  const [u0, v0, u1, v1] = signUV(id);
  const len: number[] = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = Math.max(len[len.length - 1], 1e-6);
  for (let i = 0; i + 1 < pts.length; i++) {
    let ta = len[i] / total, tb = len[i + 1] / total;
    if (reverseU) {
      ta = 1 - ta;
      tb = 1 - tb;
    }
    const ua = u0 + (u1 - u0) * ta, ub = u0 + (u1 - u0) * tb;
    const a = pts[i], c = pts[i + 1];
    const f = facing[i].clone().add(facing[i + 1]).normalize();
    b.quad(a, c, c.clone().setY(c.y + height), a.clone().setY(a.y + height), tint, f, [ua, v0, ub, v0, ub, v1, ua, v1]);
  }
}
