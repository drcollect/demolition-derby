import * as THREE from 'three';
import { GeoBuilder, Rng, lin, ringPoint, type Disposer, type SharedUniforms } from './util';
import type { Layout } from './layout';

const FW = 1024;
const FH = 512;
const CW = 256;
const CH = 128;

enum Flag {
  Stars = 0,
  Checker,
  Green,
  Yellow,
  Red,
  Kola,
  Bowl,
  Derby,
  Halves,
  GoldStar,
  Number1,
  Burger,
  SwRed,
  SwWhite,
  SwBlue,
  SwYellow,
}
const POLE_FLAGS: Flag[] = [Flag.Stars, Flag.Checker, Flag.Kola, Flag.Bowl, Flag.Derby, Flag.Halves, Flag.GoldStar, Flag.Number1, Flag.Burger, Flag.Green, Flag.Yellow, Flag.Red];
const PENNANTS: Flag[] = [Flag.SwRed, Flag.SwWhite, Flag.SwBlue, Flag.SwYellow];

function drawFlags(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FW;
  c.height = FH;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('stadium: 2D canvas unavailable');
  const cell = (id: Flag, fn: (x: CanvasRenderingContext2D) => void) => {
    const cx = (id % 4) * CW;
    const cy = Math.floor(id / 4) * CH;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, CW, CH);
    ctx.clip();
    ctx.translate(cx, cy);
    fn(ctx);
    ctx.restore();
  };
  const fill = (x: CanvasRenderingContext2D, col: string) => {
    x.fillStyle = col;
    x.fillRect(0, 0, CW, CH);
  };
  const label = (x: CanvasRenderingContext2D, s: string, col: string, size: number, font = 'Impact, "Arial Black", sans-serif', style = '') => {
    x.fillStyle = col;
    x.font = `${style} ${size}px ${font}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const w = x.measureText(s).width;
    const sx = Math.min(1, (CW - 24) / w);
    x.save();
    x.translate(CW / 2, CH / 2 + 2);
    x.scale(sx, 1);
    x.fillText(s, 0, 0);
    x.restore();
  };
  const star = (x: CanvasRenderingContext2D, px: number, py: number, r: number, col: string) => {
    x.fillStyle = col;
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.42;
      x.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
    }
    x.closePath();
    x.fill();
  };
  cell(Flag.Stars, (x) => {
    for (let i = 0; i < 13; i++) {
      x.fillStyle = i % 2 === 0 ? '#b3192e' : '#f2f0ea';
      x.fillRect(0, (i * CH) / 13, CW, CH / 13 + 1);
    }
    x.fillStyle = '#1c2a5e';
    x.fillRect(0, 0, CW * 0.42, (CH * 7) / 13);
    x.fillStyle = '#f2f0ea';
    for (let r = 0; r < 5; r++) for (let k = 0; k < 6; k++) {
      x.beginPath();
      x.arc(9 + k * 17 + (r % 2) * 8, 7 + r * 12.5, 2.4, 0, Math.PI * 2);
      x.fill();
    }
  });
  cell(Flag.Checker, (x) => {
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
      x.fillStyle = (i + j) % 2 ? '#111' : '#f2f2f2';
      x.fillRect(i * 32, j * 32, 32, 32);
    }
  });
  cell(Flag.Green, (x) => fill(x, '#1f8a36'));
  cell(Flag.Yellow, (x) => fill(x, '#f2c61f'));
  cell(Flag.Red, (x) => fill(x, '#c8141c'));
  cell(Flag.Kola, (x) => {
    fill(x, '#c8141c');
    label(x, 'KRASH KOLA', '#fff', 54, 'Impact, "Arial Black", sans-serif', 'italic');
  });
  cell(Flag.Bowl, (x) => {
    fill(x, '#1d3f94');
    star(x, 30, 64, 20, '#f2c61f');
    star(x, 226, 64, 20, '#f2c61f');
    label(x, 'THE BOWL', '#fff', 50);
  });
  cell(Flag.Derby, (x) => {
    fill(x, '#e8641b');
    label(x, 'DERBY!', '#111', 70);
  });
  cell(Flag.Halves, (x) => {
    fill(x, '#f2f0ea');
    x.fillStyle = '#b3192e';
    x.fillRect(0, 0, CW / 2, CH);
  });
  cell(Flag.GoldStar, (x) => {
    fill(x, '#123a8a');
    star(x, CW / 2, CH / 2, 46, '#f2c61f');
  });
  cell(Flag.Number1, (x) => {
    fill(x, '#141414');
    label(x, '#1 FANS', '#f2c61f', 64);
  });
  cell(Flag.Burger, (x) => {
    fill(x, '#f5c518');
    label(x, 'GUTBUSTER', '#c0261f', 50);
  });
  cell(Flag.SwRed, (x) => fill(x, '#d0202a'));
  cell(Flag.SwWhite, (x) => fill(x, '#eeeeee'));
  cell(Flag.SwBlue, (x) => fill(x, '#1f47a8'));
  cell(Flag.SwYellow, (x) => fill(x, '#f2c61f'));
  return c;
}

function uvRect(id: Flag): [number, number, number, number] {
  const cx = (id % 4) * CW;
  const cy = Math.floor(id / 4) * CH;
  const i = 2;
  return [(cx + i) / FW, 1 - (cy + CH - i) / FH, (cx + CW - i) / FW, 1 - (cy + i) / FH];
}

export interface FlagsResult {
  mesh: THREE.Mesh;
  uniforms: { uFlagEnergy: { value: number } };
}

export function buildFlags(L: Layout, rng: Rng, metal: GeoBuilder, shared: SharedUniforms, windAngle: number, disposer: Disposer): FlagsResult {
  const b = new GeoBuilder();
  b.defineExtra('aWave', 3, [0, 0, 1]); // weight along, phase, length
  b.defineExtra('aDir', 3, [0, 0, 1]); // flutter direction
  b.defineExtra('aAlong', 3, [1, 0, 0]); // away from the attachment
  const white: [number, number, number] = [1, 1, 1];
  const wind = new THREE.Vector3(Math.cos(windAngle), 0, Math.sin(windAngle));
  const side = new THREE.Vector3().crossVectors(wind, new THREE.Vector3(0, 1, 0)).normalize();
  const poleCol = lin(0xd8d8d8);

  // ---- pole flags on the back rim ----
  const n = 30;
  const skip = (a: number) => {
    const d = (x: number, y: number) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
    return d(a, L.scoreboardAngle) < 0.2 || d(a, L.gateAngle) < 0.2;
  };
  let fi = 0;
  for (let i = 0; i < n; i++) {
    const a = L.gateAngle + ((i + 0.5) / n) * Math.PI * 2;
    if (skip(a)) continue;
    const r = L.backR + 0.18;
    const base = ringPoint(a, r, L.backTopY);
    const poleH = 5.2;
    const top = base.clone().setY(L.backTopY + poleH);
    metal.beam(base, top.clone().setY(top.y + 0.15), 0.07, poleCol);
    const id = POLE_FLAGS[fi++ % POLE_FLAGS.length];
    const [u0, v0, u1, v1] = uvRect(id);
    const W = 2.4;
    const H = 1.2;
    const segU = 8;
    const segV = 2;
    const phase = rng.next() * Math.PI * 2;
    b.setExtra('aDir', [side.x, side.y, side.z]);
    b.setExtra('aAlong', [wind.x, wind.y, wind.z]);
    for (let v = 0; v < segV; v++) {
      for (let u = 0; u < segU; u++) {
        const idx: number[] = [];
        for (const [du, dv] of [[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][]) {
          const uu = (u + du) / segU;
          const vv = (v + dv) / segV;
          const p = top.clone().addScaledVector(wind, uu * W).setY(top.y - 0.05 - vv * H);
          b.setExtra('aWave', [uu, phase, W]);
          idx.push(b.vert(p, side, u0 + (u1 - u0) * uu, v1 - (v1 - v0) * vv, white));
        }
        b.idx.push(idx[0], idx[1], idx[2], idx[0], idx[2], idx[3]);
      }
    }
  }

  // ---- pennant string along the upper-tier front rail ----
  const rr = L.crossR1 + 0.06;
  const ropeY = L.upperFrontTopY + 0.95;
  const span = 4.8;
  const arc = (L.standA1 - L.standA0) * rr;
  const nSpans = Math.floor(arc / span);
  const ropeCol = lin(0x303030);
  const down = new THREE.Vector3(0, -1, 0);
  let pi = 0;
  for (let s = 0; s < nSpans; s++) {
    const a0 = L.standA0 + ((L.standA1 - L.standA0) * s) / nSpans;
    const a1 = L.standA0 + ((L.standA1 - L.standA0) * (s + 1)) / nSpans;
    const sagAt = (t: number) => ropeY - 0.22 * 4 * t * (1 - t);
    const sub = 4;
    for (let k = 0; k < sub; k++) {
      const t0 = k / sub;
      const t1 = (k + 1) / sub;
      metal.beam(ringPoint(a0 + (a1 - a0) * t0, rr, sagAt(t0)), ringPoint(a0 + (a1 - a0) * t1, rr, sagAt(t1)), 0.02, ropeCol);
    }
    const count = Math.floor(span / 0.55);
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      const am = a0 + (a1 - a0) * t;
      const hwA = 0.17 / rr;
      const pa = ringPoint(am - hwA, rr - 0.02, sagAt(t));
      const pb = ringPoint(am + hwA, rr - 0.02, sagAt(t));
      const pc = ringPoint(am, rr - 0.02, sagAt(t) - 0.46);
      const radial = new THREE.Vector3(Math.cos(am), 0, Math.sin(am));
      const [u0, v0, u1, v1] = uvRect(PENNANTS[pi++ % PENNANTS.length]);
      const phase = rng.next() * Math.PI * 2;
      b.setExtra('aDir', [radial.x, 0, radial.z]);
      b.setExtra('aAlong', [down.x, down.y, down.z]);
      b.setExtra('aWave', [0, phase, 0.46]);
      const ia = b.vert(pa, radial, u0, v1, white);
      const ib = b.vert(pb, radial, u1, v1, white);
      b.setExtra('aWave', [1, phase, 0.46]);
      const ic = b.vert(pc, radial, (u0 + u1) / 2, v0, white);
      b.idx.push(ia, ib, ic);
    }
  }

  const geo = b.build();
  geo.deleteAttribute('color');
  disposer.add(geo);
  const tex = new THREE.CanvasTexture(drawFlags());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  disposer.add(tex);
  const uniforms = { uFlagEnergy: { value: 0.3 } };
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uFlagEnergy = uniforms.uFlagEnergy;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aWave;
        attribute vec3 aDir;
        attribute vec3 aAlong;
        uniform float uTime;
        uniform float uFlagEnergy;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `float fW = aWave.x;
        float fL = max(aWave.z, 0.01);
        float fSpeed = 5.0 + 7.0 * uFlagEnergy;
        float fAmp = (0.06 + 0.16 * uFlagEnergy) * fL;
        float fA1 = fW * 5.5 - uTime * fSpeed + aWave.y;
        float fA2 = fW * 12.0 - uTime * fSpeed * 1.6 + aWave.y * 1.7;
        float fDisp = (sin(fA1) + 0.35 * sin(fA2)) * fAmp * fW;
        float fDer = ((cos(fA1) * 5.5 + 0.35 * 12.0 * cos(fA2)) * fAmp * fW + (sin(fA1) + 0.35 * sin(fA2)) * fAmp) / fL;
        #include <beginnormal_vertex>
        float fSg = sign(dot(objectNormal, aDir) + 1e-4);
        objectNormal = normalize(fSg * (aDir - aAlong * fDer));`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed += aDir * fDisp;
        if (abs(aAlong.y) < 0.5) transformed.y -= fW * fW * 0.28 * fL * (1.0 - uFlagEnergy);`,
      );
  };
  mat.customProgramCacheKey = () => 'stadium-flags-v1';
  disposer.add(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'StadiumFlags';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return { mesh, uniforms };
}
