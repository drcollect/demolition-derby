import * as THREE from 'three';
import { GeoBuilder, ringPoint, type Rgb } from './util';

/*
 Procedural sponsor atlas: 2048x2048 canvas, 2 x 16 cells of 1024x128 (8:1). All brands are invented.
*/
export const ATLAS_W = 2048;
export const ATLAS_H = 2048;
export const CELL_W = 1024;
export const CELL_H = 128;
const COLS = 2;

export enum Sign {
  KrashKola = 0,
  ScrapyardSams,
  PistonPetes,
  Bulldog,
  MaxTorque,
  Hanks,
  Gutbuster,
  Sundown,
  Grizzly,
  Lucky7,
  TriCounty,
  ChromeDome,
  DentBGone,
  BigBuck,
  Sparkys,
  CountyLine,
  PitGate,
  TheBowl,
  PitEntry,
  DerbyTonight,
  KolaOfficial,
  WelcomeFans,
  RollORama,
}
/** Designs that rotate around the wall and the fascia. */
export const ROTATION: Sign[] = [
  Sign.KrashKola,
  Sign.ScrapyardSams,
  Sign.PistonPetes,
  Sign.Bulldog,
  Sign.MaxTorque,
  Sign.Hanks,
  Sign.Gutbuster,
  Sign.Sundown,
  Sign.Grizzly,
  Sign.Lucky7,
  Sign.TriCounty,
  Sign.ChromeDome,
  Sign.DentBGone,
  Sign.BigBuck,
  Sign.Sparkys,
  Sign.CountyLine,
  Sign.RollORama,
];

const F_IMPACT = 'Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif';
const F_BLACK = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const F_SERIF = 'Rockwell, "Cooper Black", Georgia, "Times New Roman", serif';
const F_CLASSY = 'Didot, "Bodoni 72", Georgia, "Times New Roman", serif';
const F_SCRIPT = '"Brush Script MT", "Snell Roundhand", "Segoe Script", cursive';
const F_ROUND = '"Arial Rounded MT Bold", "Trebuchet MS", "Verdana", sans-serif';

type Ctx = CanvasRenderingContext2D;

interface TextOpts {
  font: string;
  size: number;
  color: string | CanvasGradient;
  weight?: string;
  style?: string;
  stroke?: string;
  strokeW?: number;
  shadow?: string;
  shadowOff?: number;
  align?: CanvasTextAlign;
  maxW?: number;
}

function text(ctx: Ctx, s: string, x: number, y: number, o: TextOpts): number {
  ctx.save();
  ctx.font = `${o.style ?? 'normal'} ${o.weight ?? 'normal'} ${o.size}px ${o.font}`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(s).width;
  const maxW = o.maxW ?? 1e9;
  const sx = w > maxW ? maxW / w : 1;
  ctx.translate(x, y);
  ctx.scale(sx, 1);
  ctx.lineJoin = 'round';
  if (o.shadow) {
    ctx.fillStyle = o.shadow;
    const d = o.shadowOff ?? 4;
    if (o.stroke) {
      ctx.strokeStyle = o.shadow;
      ctx.lineWidth = (o.strokeW ?? 4) * 2;
      ctx.strokeText(s, d / sx, d);
    }
    ctx.fillText(s, d / sx, d);
  }
  if (o.stroke) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = (o.strokeW ?? 4) * 2;
    ctx.strokeText(s, 0, 0);
  }
  ctx.fillStyle = o.color;
  ctx.fillText(s, 0, 0);
  ctx.restore();
  return w * sx;
}

function frame(ctx: Ctx, w: number, h: number, color: string, lw: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
  ctx.restore();
}

function hazard(ctx: Ctx, x: number, y: number, w: number, h: number, a: string, b: string, step = 36) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = a;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = b;
  for (let i = -h * 2; i < w + h * 2; i += step * 2) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + step, y + h);
    ctx.lineTo(x + i + step + h, y);
    ctx.lineTo(x + i + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function bolt(ctx: Ctx, x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0.2, -1);
  ctx.lineTo(-0.45, 0.1);
  ctx.lineTo(-0.02, 0.1);
  ctx.lineTo(-0.25, 1);
  ctx.lineTo(0.5, -0.2);
  ctx.lineTo(0.06, -0.2);
  ctx.lineTo(0.35, -1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function star(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function lin2(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

const W = CELL_W;
const H = CELL_H;

const DESIGNS: Record<number, (ctx: Ctx) => void> = {
  [Sign.KrashKola]: (ctx) => {
    ctx.fillStyle = lin2(ctx, 0, 0, 0, H, [[0, '#e3202a'], [1, '#9c0c12']]);
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(0, 104);
    ctx.bezierCurveTo(260, 70, 520, 132, 1024, 86);
    ctx.stroke();
    bolt(ctx, 92, 62, 46, '#ffd21f');
    text(ctx, 'KRASH KOLA', 470, 58, { font: F_IMPACT, size: 96, color: '#fff', style: 'italic', stroke: '#6d0508', strokeW: 5, shadow: 'rgba(0,0,0,0.45)', maxW: 640 });
    ctx.fillStyle = '#ffd21f';
    ctx.beginPath();
    ctx.arc(900, 64, 52, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, 'ICE', 900, 44, { font: F_BLACK, size: 30, color: '#9c0c12', weight: '900' });
    text(ctx, 'COLD!', 900, 80, { font: F_BLACK, size: 30, color: '#9c0c12', weight: '900' });
    frame(ctx, W, H, '#fff', 6);
  },
  [Sign.ScrapyardSams]: (ctx) => {
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, W, H);
    hazard(ctx, 0, 0, 90, H, '#f2c200', '#121212', 26);
    hazard(ctx, W - 90, 0, 90, H, '#f2c200', '#121212', 26);
    text(ctx, "SCRAPYARD SAM'S", W / 2, 50, { font: F_IMPACT, size: 78, color: '#f2c200', maxW: 780 });
    text(ctx, 'WE BUY WRECKS  •  CASH PAID  •  RT. 9', W / 2, 104, { font: F_BLACK, size: 26, color: '#fff', weight: '900', maxW: 760 });
  },
  [Sign.PistonPetes]: (ctx) => {
    ctx.fillStyle = '#f4e6c2';
    ctx.fillRect(0, 0, W, H);
    const cols = ['#1f7a3a', '#f4e6c2', '#b3211e'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = cols[i];
      ctx.fillRect(0, 100 + i * 9, W, 9);
    }
    // pizza
    ctx.fillStyle = '#d9a13a';
    ctx.beginPath();
    ctx.arc(80, 58, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c0391f';
    ctx.beginPath();
    ctx.arc(80, 58, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a1d12';
    for (const [dx, dy] of [[-14, -12], [12, -16], [18, 10], [-10, 16], [0, 0]]) {
      ctx.beginPath();
      ctx.arc(80 + dx, 58 + dy, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    text(ctx, "PISTON PETE'S", 450, 54, { font: F_SERIF, size: 76, color: '#b3211e', weight: 'bold', shadow: 'rgba(0,0,0,0.25)', shadowOff: 3, maxW: 560 });
    text(ctx, 'Pizza!', 860, 54, { font: F_SCRIPT, size: 84, color: '#1f7a3a', maxW: 260 });
  },
  [Sign.Bulldog]: (ctx) => {
    ctx.fillStyle = lin2(ctx, 0, 0, W, 0, [[0, '#132f78'], [0.5, '#1f47a8'], [1, '#132f78']]);
    ctx.fillRect(0, 0, W, H);
    bolt(ctx, 70, 64, 50, '#ffd21f');
    bolt(ctx, W - 70, 64, 50, '#ffd21f');
    text(ctx, 'BULLDOG', 400, 62, { font: F_IMPACT, size: 104, color: '#ffd21f', stroke: '#0b1a44', strokeW: 5, maxW: 460 });
    text(ctx, 'SPARK PLUGS', 770, 46, { font: F_BLACK, size: 38, color: '#fff', weight: '900', maxW: 300 });
    text(ctx, 'HOT START. EVERY START.', 770, 90, { font: F_BLACK, size: 20, color: '#bcd0ff', weight: '900', maxW: 300 });
    frame(ctx, W, H, '#ffd21f', 5);
  },
  [Sign.MaxTorque]: (ctx) => {
    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c21d1d';
    ctx.fillRect(0, 96, W, 14);
    const g = lin2(ctx, 0, 10, 0, 100, [[0, '#ffe066'], [0.55, '#ff8a1c'], [1, '#d23b0e']]);
    text(ctx, 'MAX-TORQUE', 380, 52, { font: F_IMPACT, size: 92, color: g, style: 'italic', stroke: '#000', strokeW: 3, maxW: 600 });
    text(ctx, 'MOTOR OIL', 820, 40, { font: F_BLACK, size: 36, color: '#fff', weight: '900', maxW: 300 });
    ctx.fillStyle = '#ff8a1c';
    ctx.fillRect(730, 62, 180, 30);
    text(ctx, '10W-40', 820, 78, { font: F_BLACK, size: 24, color: '#0e0e0e', weight: '900' });
  },
  [Sign.Hanks]: (ctx) => {
    ctx.fillStyle = '#f2f0ea';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c21d1d';
    ctx.fillRect(24, 18, 190, 92);
    text(ctx, '24', 90, 66, { font: F_IMPACT, size: 80, color: '#fff' });
    text(ctx, 'HR', 170, 66, { font: F_IMPACT, size: 46, color: '#fff' });
    text(ctx, "HANK'S TOWING", 560, 52, { font: F_IMPACT, size: 80, color: '#16275c', maxW: 600 });
    text(ctx, 'NO WRECK TOO BIG  •  CALL 555-0187', 560, 104, { font: F_BLACK, size: 24, color: '#c21d1d', weight: '900', maxW: 620 });
    frame(ctx, W, H, '#16275c', 8);
  },
  [Sign.Gutbuster]: (ctx) => {
    ctx.fillStyle = '#f5c518';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c0261f';
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      const a = (i / 16) * Math.PI * 2;
      ctx.moveTo(80, 64);
      ctx.arc(80, 64, 70, a, a + Math.PI / 16);
      ctx.fill();
    }
    ctx.fillStyle = '#8a4b1c';
    ctx.beginPath();
    ctx.ellipse(80, 64, 40, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, 'GUTBUSTER', 460, 56, { font: F_SERIF, size: 88, color: '#c0261f', weight: 'bold', stroke: '#fff4c9', strokeW: 4, maxW: 560 });
    text(ctx, 'BURGERS', 860, 44, { font: F_BLACK, size: 40, color: '#5a2a0c', weight: '900', maxW: 260 });
    text(ctx, '2 FOR $1.99', 860, 90, { font: F_BLACK, size: 30, color: '#c0261f', weight: '900', maxW: 260 });
  },
  [Sign.Sundown]: (ctx) => {
    ctx.fillStyle = lin2(ctx, 0, 0, 0, H, [[0, '#2a0f4a'], [0.55, '#a3246b'], [1, '#f28a1c']]);
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 220, 128);
    ctx.clip();
    ctx.fillStyle = '#ffcf3a';
    ctx.beginPath();
    ctx.arc(110, 128, 90, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#a3246b';
    for (let i = 0; i < 5; i++) ctx.fillRect(0, 60 + i * 14, 220, 4 + i);
    ctx.restore();
    text(ctx, 'Sundown Drive-In', 590, 58, { font: F_SCRIPT, size: 96, color: '#fff', shadow: 'rgba(40,0,40,0.6)', shadowOff: 4, maxW: 680 });
    text(ctx, 'DOUBLE FEATURE  •  FRI & SAT  •  $3 A CARLOAD', 590, 110, { font: F_BLACK, size: 20, color: '#ffe9a8', weight: '900', maxW: 680 });
  },
  [Sign.Grizzly]: (ctx) => {
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#23150c';
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 20, 14);
      ctx.lineTo(x + 40, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.lineTo(x + 20, H - 14);
      ctx.lineTo(x + 40, H);
      ctx.fill();
    }
    text(ctx, 'GRIZZLY TIRES', 400, 64, { font: F_IMPACT, size: 92, color: '#f0dcb0', stroke: '#1a0e06', strokeW: 4, maxW: 640 });
    text(ctx, 'GRIPS LIKE A BEAR', 850, 64, { font: F_BLACK, size: 26, color: '#e39b3a', weight: '900', maxW: 250 });
  },
  [Sign.Lucky7]: (ctx) => {
    ctx.fillStyle = '#127a78';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#d42a2a';
    ctx.beginPath();
    ctx.arc(80, 64, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.stroke();
    text(ctx, '7', 80, 68, { font: F_IMPACT, size: 84, color: '#fff' });
    text(ctx, 'LUCKY 7 LANES', 500, 54, { font: F_ROUND, size: 76, color: '#fff', weight: 'bold', shadow: '#0a4442', shadowOff: 4, maxW: 700 });
    text(ctx, 'BOWLING  •  BILLIARDS  •  COCKTAILS', 500, 106, { font: F_BLACK, size: 22, color: '#ffe38a', weight: '900', maxW: 700 });
  },
  [Sign.TriCounty]: (ctx) => {
    ctx.fillStyle = '#2e6a2a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f2d23a';
    ctx.fillRect(0, 0, W, 12);
    ctx.fillRect(0, H - 12, W, 12);
    text(ctx, 'TRI-COUNTY FEED & SEED', W / 2, 60, { font: F_SERIF, size: 70, color: '#f2d23a', weight: 'bold', maxW: 900 });
    text(ctx, 'SINCE 1952', W / 2, 102, { font: F_BLACK, size: 20, color: '#e8f0d8', weight: '900' });
  },
  [Sign.ChromeDome]: (ctx) => {
    ctx.fillStyle = lin2(ctx, 0, 0, 0, H, [[0, '#f5f5f5'], [0.45, '#9c9fa4'], [0.55, '#7d8086'], [1, '#e4e4e4']]);
    ctx.fillRect(0, 0, W, H);
    star(ctx, 80, 60, 40, '#fff');
    star(ctx, 944, 60, 40, '#fff');
    text(ctx, 'CHROME DOME', 430, 62, { font: F_IMPACT, size: 96, color: '#141414', style: 'italic', maxW: 600 });
    text(ctx, 'CAR WAX', 790, 62, { font: F_BLACK, size: 44, color: '#c21d1d', weight: '900', maxW: 220 });
    frame(ctx, W, H, '#141414', 6);
  },
  [Sign.DentBGone]: (ctx) => {
    ctx.fillStyle = '#e8641b';
    ctx.fillRect(0, 0, W, H);
    text(ctx, 'DENT-B-GONE', 360, 62, { font: F_IMPACT, size: 100, color: '#111', maxW: 560 });
    text(ctx, 'BODY & PAINT', 820, 46, { font: F_BLACK, size: 36, color: '#fff', weight: '900', maxW: 300 });
    text(ctx, 'FREE ESTIMATES', 820, 88, { font: F_BLACK, size: 26, color: '#111', weight: '900', maxW: 300 });
    frame(ctx, W, H, '#111', 6);
  },
  [Sign.BigBuck]: (ctx) => {
    ctx.fillStyle = '#c99a5b';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#5a3417';
    ctx.fillRect(0, 0, W, 10);
    ctx.fillRect(0, H - 10, W, 10);
    text(ctx, 'BIG BUCK', 330, 62, { font: F_SERIF, size: 92, color: '#4a2610', weight: 'bold', maxW: 480 });
    text(ctx, 'BEEF JERKY', 760, 62, { font: F_IMPACT, size: 72, color: '#a8201a', maxW: 400 });
  },
  [Sign.Sparkys]: (ctx) => {
    ctx.fillStyle = '#0d1840';
    ctx.fillRect(0, 0, W, H);
    const burst = (x: number, y: number, r: number, c: string) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = 3;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.stroke();
      }
    };
    burst(70, 50, 44, '#ff4a4a');
    burst(150, 86, 32, '#ffd23a');
    burst(954, 50, 44, '#6ad0ff');
    burst(880, 90, 30, '#ff4a4a');
    text(ctx, "SPARKY'S FIREWORKS", W / 2, 58, { font: F_IMPACT, size: 80, color: '#fff', stroke: '#d42a2a', strokeW: 4, maxW: 640 });
    text(ctx, 'OPEN ALL SUMMER', W / 2, 106, { font: F_BLACK, size: 22, color: '#ffd23a', weight: '900' });
  },
  [Sign.CountyLine]: (ctx) => {
    ctx.fillStyle = '#0f3d2e';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#d6b35a';
    ctx.lineWidth = 3;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    text(ctx, 'COUNTY LINE', 380, 64, { font: F_CLASSY, size: 76, color: '#e3c572', weight: 'bold', maxW: 520 });
    text(ctx, 'SAVINGS & LOAN', 790, 64, { font: F_CLASSY, size: 44, color: '#e8e2c8', maxW: 330 });
  },
  [Sign.PitGate]: (ctx) => {
    hazard(ctx, 0, 0, W, H, '#f2c200', '#141414', 44);
    ctx.fillStyle = '#141414';
    ctx.fillRect(250, 14, W - 500, H - 28);
    text(ctx, 'PIT GATE', W / 2, 56, { font: F_IMPACT, size: 74, color: '#f2c200', maxW: 480 });
    text(ctx, 'KEEP CLEAR', W / 2, 102, { font: F_BLACK, size: 22, color: '#fff', weight: '900' });
  },
  [Sign.TheBowl]: (ctx) => {
    ctx.fillStyle = '#b3171c';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffdf8a';
    for (let x = 18; x < W; x += 36) {
      ctx.beginPath();
      ctx.arc(x, 12, 6, 0, Math.PI * 2);
      ctx.arc(x, H - 12, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    text(ctx, '★ THE BOWL ★', W / 2, 66, { font: F_IMPACT, size: 88, color: '#fff', stroke: '#5a0508', strokeW: 4, maxW: 820 });
  },
  [Sign.PitEntry]: (ctx) => {
    ctx.fillStyle = '#10522c';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    text(ctx, 'PITS  •  ALL DRIVERS REPORT HERE', W / 2, 66, { font: F_BLACK, size: 50, color: '#fff', weight: '900', maxW: 900 });
  },
  [Sign.DerbyTonight]: (ctx) => {
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, 0, W, H);
    const g = lin2(ctx, 0, 14, 0, 96, [[0, '#fff27a'], [0.5, '#ff9a1c'], [1, '#e2361a']]);
    text(ctx, 'DEMOLITION DERBY', 420, 58, { font: F_IMPACT, size: 88, color: g, style: 'italic', stroke: '#3a0a02', strokeW: 3, maxW: 720 });
    text(ctx, 'EVERY', 880, 40, { font: F_BLACK, size: 30, color: '#fff', weight: '900' });
    text(ctx, 'FRIDAY NIGHT', 880, 84, { font: F_BLACK, size: 30, color: '#fff', weight: '900', maxW: 240 });
  },
  [Sign.KolaOfficial]: (ctx) => {
    ctx.fillStyle = '#c8141c';
    ctx.fillRect(0, 0, W, H);
    bolt(ctx, 60, 64, 44, '#ffd21f');
    text(ctx, 'KRASH KOLA', 360, 62, { font: F_IMPACT, size: 88, color: '#fff', style: 'italic', maxW: 480 });
    text(ctx, 'OFFICIAL SODA OF THE BOWL', 800, 64, { font: F_BLACK, size: 28, color: '#ffe9a8', weight: '900', maxW: 380 });
  },
  [Sign.WelcomeFans]: (ctx) => {
    ctx.fillStyle = '#1a3a8a';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) star(ctx, 40 + i * 86, i % 2 ? 22 : 106, 12, '#fff');
    text(ctx, 'WELCOME DERBY FANS!', W / 2, 64, { font: F_IMPACT, size: 80, color: '#fff', stroke: '#b3171c', strokeW: 4, maxW: 820 });
  },
  [Sign.RollORama]: (ctx) => {
    ctx.fillStyle = lin2(ctx, 0, 0, W, 0, [[0, '#ff5fa2'], [1, '#27c3c9']]);
    ctx.fillRect(0, 0, W, H);
    text(ctx, 'ROLL-O-RAMA', 420, 60, { font: F_ROUND, size: 90, color: '#fff', weight: 'bold', stroke: '#5b1a6e', strokeW: 5, maxW: 600 });
    text(ctx, 'SKATE NIGHT', 840, 46, { font: F_BLACK, size: 34, color: '#2b0a3a', weight: '900', maxW: 280 });
    text(ctx, 'DISCO WEDNESDAYS', 840, 88, { font: F_BLACK, size: 24, color: '#fff', weight: '900', maxW: 280 });
  },
};

export function createSignAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('stadium: 2D canvas unavailable');
  ctx.fillStyle = '#555';
  ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);
  for (const key of Object.keys(DESIGNS)) {
    const id = Number(key);
    const cx = (id % COLS) * CELL_W;
    const cy = Math.floor(id / COLS) * CELL_H;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, CELL_W, CELL_H);
    ctx.clip();
    ctx.translate(cx, cy);
    DESIGNS[id](ctx);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** uv rect [u0, v0, u1, v1] of a sign cell (flipY texture). */
export function signUV(id: Sign): [number, number, number, number] {
  const cx = (id % COLS) * CELL_W;
  const cy = Math.floor(id / COLS) * CELL_H;
  const inset = 1.5;
  const u0 = (cx + inset) / ATLAS_W;
  const u1 = (cx + CELL_W - inset) / ATLAS_W;
  const v1 = 1 - (cy + inset) / ATLAS_H;
  const v0 = 1 - (cy + CELL_H - inset) / ATLAS_H;
  return [u0, v0, u1, v1];
}

/** A board curved along a circle, facing the centre (readable from inside). */
export function curvedPanel(b: GeoBuilder, id: Sign, a0: number, a1: number, r: number, y0: number, y1: number, segs = 8, tint: Rgb = [1, 1, 1]): void {
  const [u0, v0, u1, v1] = signUV(id);
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const aa = a0 + (a1 - a0) * t0;
    const ab = a0 + (a1 - a0) * t1;
    const am = (aa + ab) / 2;
    const facing = new THREE.Vector3(-Math.cos(am), 0, -Math.sin(am));
    const ua = u0 + (u1 - u0) * t0;
    const ub = u0 + (u1 - u0) * t1;
    b.quad(ringPoint(aa, r, y0), ringPoint(ab, r, y0), ringPoint(ab, r, y1), ringPoint(aa, r, y1), tint, facing, [ua, v0, ub, v0, ub, v1, ua, v1]);
  }
}

/** Flat sign: centre, right (reading direction) and up axes. */
export function flatPanel(b: GeoBuilder, id: Sign, c: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, w: number, h: number, tint: Rgb = [1, 1, 1]): void {
  const [u0, v0, u1, v1] = signUV(id);
  const hw = right.clone().multiplyScalar(w / 2);
  const hh = up.clone().multiplyScalar(h / 2);
  const p0 = c.clone().sub(hw).sub(hh);
  const p1 = c.clone().add(hw).sub(hh);
  const p2 = c.clone().add(hw).add(hh);
  const p3 = c.clone().sub(hw).add(hh);
  const facing = new THREE.Vector3().crossVectors(right, up);
  b.quad(p0, p1, p2, p3, tint, facing, [u0, v0, u1, v0, u1, v1, u0, v1]);
}
