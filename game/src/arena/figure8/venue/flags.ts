import * as THREE from 'three';
import { GeoBuilder, type Disposer, type SharedUniforms } from '../../stadium/util';

/*
 Cloth: pole flags, hanging flags, the flagman's flag and pennant strings, all in one mesh whose vertices
 flutter in the vertex shader (travelling wave that grows away from the attachment, sagging when calm).
 Flag art is a small procedural atlas (4 x 4 cells of 256 x 128).
*/

export enum FlagArt {
  Stars = 0,
  Checker,
  Green,
  Yellow,
  White,
  Red,
  Figure8,
  County,
  Kola,
  Grizzly,
  PRed,
  PWhite,
  PBlue,
  PYellow,
  Fair,
  Number1,
}
export const POLE_ART: FlagArt[] = [FlagArt.Stars, FlagArt.County, FlagArt.Checker, FlagArt.Figure8, FlagArt.Kola, FlagArt.Grizzly, FlagArt.Fair, FlagArt.Number1];
export const PENNANT_ART: FlagArt[] = [FlagArt.PRed, FlagArt.PWhite, FlagArt.PBlue, FlagArt.PYellow];

const FW = 1024, FH = 512, CW = 256, CH = 128;

function drawAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FW;
  c.height = FH;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('figure8 venue: 2D canvas unavailable');
  const cell = (id: FlagArt, fn: (x: CanvasRenderingContext2D) => void) => {
    ctx.save();
    ctx.translate((id % 4) * CW, Math.floor(id / 4) * CH);
    ctx.beginPath();
    ctx.rect(0, 0, CW, CH);
    ctx.clip();
    fn(ctx);
    ctx.restore();
  };
  const fill = (x: CanvasRenderingContext2D, col: string) => {
    x.fillStyle = col;
    x.fillRect(0, 0, CW, CH);
  };
  const label = (x: CanvasRenderingContext2D, s: string, col: string, size: number, italic = false) => {
    x.fillStyle = col;
    x.font = `${italic ? 'italic ' : ''}${size}px Impact, "Arial Black", sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const w = x.measureText(s).width;
    x.save();
    x.translate(CW / 2, CH / 2 + 2);
    x.scale(Math.min(1, (CW - 26) / w), 1);
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
  cell(FlagArt.Stars, (x) => {
    for (let i = 0; i < 13; i++) {
      x.fillStyle = i % 2 === 0 ? '#b3192e' : '#f2f0ea';
      x.fillRect(0, (i * CH) / 13, CW, CH / 13 + 1);
    }
    x.fillStyle = '#1c2a5e';
    x.fillRect(0, 0, CW * 0.4, (CH * 7) / 13);
    x.fillStyle = '#f2f0ea';
    for (let r = 0; r < 5; r++) for (let k = 0; k < 6; k++) {
      x.beginPath();
      x.arc(8 + k * 16 + (r % 2) * 7, 7 + r * 12.5, 2.2, 0, Math.PI * 2);
      x.fill();
    }
  });
  cell(FlagArt.Checker, (x) => {
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
      x.fillStyle = (i + j) % 2 ? '#111' : '#f2f2f2';
      x.fillRect(i * 32, j * 32, 32, 32);
    }
  });
  cell(FlagArt.Green, (x) => fill(x, '#1f8a36'));
  cell(FlagArt.Yellow, (x) => fill(x, '#f2c61f'));
  cell(FlagArt.White, (x) => fill(x, '#f0efea'));
  cell(FlagArt.Red, (x) => fill(x, '#c8141c'));
  cell(FlagArt.Figure8, (x) => {
    fill(x, '#111');
    x.strokeStyle = '#ff9a1c';
    x.lineWidth = 9;
    x.beginPath();
    x.arc(CW / 2 - 34, CH / 2, 30, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    x.arc(CW / 2 + 34, CH / 2, 30, 0, Math.PI * 2);
    x.stroke();
  });
  cell(FlagArt.County, (x) => {
    fill(x, '#1d3f94');
    x.fillStyle = '#f2c61f';
    x.beginPath();
    x.arc(CW / 2, CH / 2, 40, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#1d3f94';
    x.beginPath();
    x.arc(CW / 2, CH / 2, 32, 0, Math.PI * 2);
    x.fill();
    star(x, CW / 2, CH / 2, 22, '#f2c61f');
  });
  cell(FlagArt.Kola, (x) => {
    fill(x, '#c8141c');
    label(x, 'KRASH KOLA', '#fff', 54, true);
  });
  cell(FlagArt.Grizzly, (x) => {
    fill(x, '#3a2416');
    label(x, 'GRIZZLY', '#f0dcb0', 60);
  });
  cell(FlagArt.PRed, (x) => fill(x, '#d0202a'));
  cell(FlagArt.PWhite, (x) => fill(x, '#eeeeee'));
  cell(FlagArt.PBlue, (x) => fill(x, '#1f47a8'));
  cell(FlagArt.PYellow, (x) => fill(x, '#f2c61f'));
  cell(FlagArt.Fair, (x) => {
    fill(x, '#2e7d4a');
    label(x, 'COUNTY FAIR', '#f2e6b0', 44);
  });
  cell(FlagArt.Number1, (x) => {
    fill(x, '#141414');
    label(x, '#1 FANS', '#f2c61f', 60);
  });
  return c;
}

function uvRect(id: FlagArt): [number, number, number, number] {
  const cx = (id % 4) * CW, cy = Math.floor(id / 4) * CH, i = 2;
  return [(cx + i) / FW, 1 - (cy + CH - i) / FH, (cx + CW - i) / FW, 1 - (cy + i) / FH];
}

export class FlagBuilder {
  readonly b = new GeoBuilder();
  private white: [number, number, number] = [1, 1, 1];
  constructor() {
    this.b.defineExtra('aWave', 3, [0, 0, 1]); // along (0 at attachment), phase, length
    this.b.defineExtra('aDir', 3, [0, 0, 1]); // flutter direction
    this.b.defineExtra('aAlong', 3, [1, 0, 0]); // away from the attachment
  }

  /** Flag on a pole: `top` = top of the hoist, flying along `wind` (horizontal unit). */
  poleFlag(top: THREE.Vector3, wind: THREE.Vector3, art: FlagArt, w: number, h: number, phase: number) {
    const side = new THREE.Vector3().crossVectors(wind, new THREE.Vector3(0, 1, 0)).normalize();
    const [u0, v0, u1, v1] = uvRect(art);
    const segU = 8, segV = 2;
    this.b.setExtra('aDir', [side.x, side.y, side.z]);
    this.b.setExtra('aAlong', [wind.x, wind.y, wind.z]);
    for (let v = 0; v < segV; v++) {
      for (let u = 0; u < segU; u++) {
        const idx: number[] = [];
        for (const [du, dv] of [[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][]) {
          const uu = (u + du) / segU, vv = (v + dv) / segV;
          const p = top.clone().addScaledVector(wind, uu * w).setY(top.y - vv * h);
          this.b.setExtra('aWave', [uu, phase, w]);
          idx.push(this.b.vert(p, side, u0 + (u1 - u0) * uu, v1 - (v1 - v0) * vv, this.white));
        }
        this.b.idx.push(idx[0], idx[1], idx[2], idx[0], idx[2], idx[3]);
      }
    }
  }

  /** Flag hanging down from a bar (attachment along `right`), fluttering along `normal`. */
  hanging(topLeft: THREE.Vector3, right: THREE.Vector3, normal: THREE.Vector3, art: FlagArt, w: number, h: number, phase: number) {
    const [u0, v0, u1, v1] = uvRect(art);
    const segU = 3, segV = 5;
    const down = new THREE.Vector3(0, -1, 0);
    this.b.setExtra('aDir', [normal.x, normal.y, normal.z]);
    this.b.setExtra('aAlong', [0, -1, 0]);
    for (let v = 0; v < segV; v++) {
      for (let u = 0; u < segU; u++) {
        const idx: number[] = [];
        for (const [du, dv] of [[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][]) {
          const uu = (u + du) / segU, vv = (v + dv) / segV;
          const p = topLeft.clone().addScaledVector(right, uu * w).addScaledVector(down, vv * h);
          this.b.setExtra('aWave', [vv * 0.7, phase + uu * 1.3, h]);
          idx.push(this.b.vert(p, normal, u0 + (u1 - u0) * uu, v1 - (v1 - v0) * vv, this.white));
        }
        this.b.idx.push(idx[0], idx[1], idx[2], idx[0], idx[2], idx[3]);
      }
    }
  }

  /** String of triangular pennants between a and b with a little sag. */
  pennants(a: THREE.Vector3, b: THREE.Vector3, sag: number, spacing: number, rope: GeoBuilder, ropeCol: [number, number, number], phase0: number) {
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.floor(len / spacing));
    const along = b.clone().sub(a).normalize();
    const side = new THREE.Vector3().crossVectors(along, new THREE.Vector3(0, 1, 0)).normalize();
    const at = (t: number) => a.clone().lerp(b, t).setY(a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t));
    const sub = Math.max(2, Math.min(12, Math.ceil(len / 6)));
    for (let k = 0; k < sub; k++) rope.beam(at(k / sub), at((k + 1) / sub), 0.018, ropeCol);
    for (let k = 0; k < n; k++) {
      const t0 = (k + 0.1) / n, t1 = (k + 0.9) / n, tm = (k + 0.5) / n;
      const pa = at(t0), pb = at(t1), pc = at(tm).setY(at(tm).y - 0.42);
      const [u0, v0, u1, v1] = uvRect(PENNANT_ART[k % PENNANT_ART.length]);
      const ph = phase0 + k * 0.7;
      this.b.setExtra('aDir', [side.x, side.y, side.z]);
      this.b.setExtra('aAlong', [0, -1, 0]);
      this.b.setExtra('aWave', [0, ph, 0.42]);
      const ia = this.b.vert(pa, side, u0, v1, this.white);
      const ib = this.b.vert(pb, side, u1, v1, this.white);
      this.b.setExtra('aWave', [1, ph, 0.42]);
      const ic = this.b.vert(pc, side, (u0 + u1) / 2, v0, this.white);
      this.b.idx.push(ia, ib, ic);
    }
  }

  build(shared: SharedUniforms, energy: { value: number }, disposer: Disposer): THREE.Mesh {
    const geo = this.b.build();
    geo.deleteAttribute('color');
    disposer.add(geo);
    const tex = new THREE.CanvasTexture(drawAtlas());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    disposer.add(tex);
    const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = shared.uTime;
      sh.uniforms.uFlagEnergy = energy;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec3 aWave;\nattribute vec3 aDir;\nattribute vec3 aAlong;\nuniform float uTime;\nuniform float uFlagEnergy;`)
        .replace(
          '#include <beginnormal_vertex>',
          `float fgW = clamp(aWave.x, 0.0, 1.0);
          float fgL = max(aWave.z, 0.05);
          float fgE = clamp(uFlagEnergy, 0.0, 1.0);
          float fgSpeed = 4.5 + 6.5 * fgE;
          float fgAmp = (0.05 + 0.13 * fgE) * fgL;
          float fgP1 = fgW * 6.0 - uTime * fgSpeed + aWave.y;
          float fgP2 = fgW * 13.0 - uTime * fgSpeed * 1.7 + aWave.y * 2.1;
          float fgDisp = (sin(fgP1) + 0.3 * sin(fgP2)) * fgAmp * fgW;
          float fgDer = ((cos(fgP1) * 6.0 + 0.3 * 13.0 * cos(fgP2)) * fgAmp * fgW + (sin(fgP1) + 0.3 * sin(fgP2)) * fgAmp) / fgL;
          #include <beginnormal_vertex>
          float fgSg = objectNormal.x * aDir.x + objectNormal.y * aDir.y + objectNormal.z * aDir.z >= 0.0 ? 1.0 : -1.0;
          vec3 fgN = fgSg * (aDir - aAlong * fgDer);
          objectNormal = fgN / max(length(fgN), 1e-4);`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed += aDir * fgDisp;
          if (abs(aAlong.y) < 0.5) transformed.y -= fgW * fgW * 0.3 * fgL * (1.0 - fgE);`,
        );
    };
    mat.customProgramCacheKey = () => 'f8-flags-v1';
    disposer.add(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'F8Flags';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }
}

// ---- hay ----------------------------------------------------------------------------------------------------------------

/** Straw texture: fibres along u, two twine bands; tileable. */
export function strawTexture(rand: () => number): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  if (!g) throw new Error('figure8 venue: 2D canvas unavailable');
  g.fillStyle = '#c9a85a';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x = rand() * S, y = rand() * S, len = 6 + rand() * 26, a = (rand() - 0.5) * 0.5;
    const l = 150 + rand() * 90;
    g.strokeStyle = `rgba(${l},${l * 0.82},${l * 0.45},${0.25 + rand() * 0.5})`;
    g.lineWidth = 0.7 + rand() * 1.2;
    for (const ox of [0, -S, S]) {
      g.beginPath();
      g.moveTo(x + ox, y);
      g.lineTo(x + ox + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(90,70,35,${0.1 + rand() * 0.25})`;
    g.fillRect(rand() * S, rand() * S, 1 + rand() * 3, 1 + rand() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A small square bale (0.9 x 0.45 x 0.36) with twine bands, uv in metres-ish. */
export function squareBale(b: GeoBuilder, c: THREE.Vector3, yaw: number, tint: [number, number, number]) {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(c);
  const hx = 0.46, hy = 0.18, hz = 0.23;
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
  const N = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).transformDirection(m);
  const faces: [THREE.Vector3[], THREE.Vector3, number, number][] = [
    [[P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)], N(0, 0, 1), 2 * hx, 2 * hy],
    [[P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz)], N(0, 0, -1), 2 * hx, 2 * hy],
    [[P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz)], N(0, 1, 0), 2 * hx, 2 * hz],
    [[P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz)], N(1, 0, 0), 2 * hz, 2 * hy],
    [[P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz)], N(-1, 0, 0), 2 * hz, 2 * hy],
  ];
  for (const [p, n, w, h] of faces) {
    b.quad(p[0], p[1], p[2], p[3], tint, n, [0, 0, w, 0, w, h, 0, h]);
  }
}

/** A big round bale lying on its side (axis along local x), diameter d, width w. */
export function roundBale(b: GeoBuilder, c: THREE.Vector3, yaw: number, d: number, w: number, tint: [number, number, number], segs = 12) {
  const r = d / 2;
  const ax = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const fw = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const up = new THREE.Vector3(0, 1, 0);
  const center = c.clone().setY(c.y + r);
  const ring = (side: number) => {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      out.push(center.clone().addScaledVector(ax, (side * w) / 2).addScaledVector(up, Math.cos(a) * r).addScaledVector(fw, Math.sin(a) * r));
    }
    return out;
  };
  const A = ring(-1), B = ring(1);
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const n0 = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(fw, Math.sin(a));
    const n1 = up.clone().multiplyScalar(Math.cos(a1)).addScaledVector(fw, Math.sin(a1));
    const ia = b.vert(A[i], n0, 0, (i / segs) * 4, tint);
    const ib = b.vert(B[i], n0, w, (i / segs) * 4, tint);
    const ic = b.vert(B[i + 1], n1, w, ((i + 1) / segs) * 4, tint);
    const id = b.vert(A[i + 1], n1, 0, ((i + 1) / segs) * 4, tint);
    // outward winding
    b.idx.push(ia, ic, ib, ia, id, ic);
  }
  // spiral end faces (darker)
  for (const side of [-1, 1]) {
    const n = ax.clone().multiplyScalar(side);
    const cc = center.clone().addScaledVector(ax, (side * w) / 2);
    const ic = b.vert(cc, n, 0.5, 0.5, [tint[0] * 0.8, tint[1] * 0.78, tint[2] * 0.7]);
    const R = side < 0 ? A : B;
    for (let i = 0; i < segs; i++) {
      const i0 = b.vert(R[i], n, 0.5 + Math.cos((i / segs) * 6.283) * 0.5, 0.5 + Math.sin((i / segs) * 6.283) * 0.5, [tint[0] * 0.85, tint[1] * 0.82, tint[2] * 0.72]);
      const i1 = b.vert(R[i + 1], n, 0.5 + Math.cos(((i + 1) / segs) * 6.283) * 0.5, 0.5 + Math.sin(((i + 1) / segs) * 6.283) * 0.5, [tint[0] * 0.85, tint[1] * 0.82, tint[2] * 0.72]);
      const e1 = R[i].clone().sub(cc), e2 = R[i + 1].clone().sub(cc);
      const nn = new THREE.Vector3().crossVectors(e1, e2);
      if (nn.dot(n) >= 0) b.idx.push(ic, i0, i1);
      else b.idx.push(ic, i1, i0);
    }
  }
}
