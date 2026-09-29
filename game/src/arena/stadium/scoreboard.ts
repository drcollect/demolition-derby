import * as THREE from 'three';
import { GeoBuilder, lin, ringPoint, type Disposer } from './util';
import { glyph } from './font5x7';
import { Sign, flatPanel } from './signage';
import type { Layout } from './layout';

const GW = 160; // dot columns
const GH = 72; // dot rows
const MARGIN = 3; // border cells (chaser bulbs live here)
const CELL = 0.125; // metres per dot

const COLORS: Record<string, [number, number, number]> = {
  a: [255, 176, 58], // amber
  y: [255, 222, 70],
  w: [255, 236, 200],
  r: [255, 64, 40],
  g: [90, 255, 110],
  b: [90, 170, 255],
  o: [255, 120, 30],
  c: [80, 240, 240],
};

export interface ScoreboardResult {
  screen: THREE.Mesh;
  setLines(lines: string[]): void;
  update(dt: number, excite: number): void;
  flash(strength: number): void;
}

export function buildScoreboard(L: Layout, metal: GeoBuilder, signGlow: GeoBuilder, lamps: GeoBuilder, disposer: Disposer): ScoreboardResult {
  const w = (GW + 2 * MARGIN) * CELL;
  const h = (GH + 2 * MARGIN) * CELL;
  const th = L.scoreboardAngle;
  const radial = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
  const right = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th)); // viewer's right from the arena
  const up = new THREE.Vector3(0, 1, 0);
  const inward = radial.clone().negate();
  const R = L.facadeR + 3.6;
  const bottom = L.backTopY + 4.2;
  const center = ringPoint(th, R, bottom + h / 2);
  const basis = new THREE.Matrix4().makeBasis(right, up, inward).setPosition(center);

  // ---- structure (metal) ----
  const dark = lin(0x1d1f23);
  const paint = lin(0x2a3558);
  const steel = lin(0x8d949b);
  const headerH = 2.6;
  metal.box(basis, [-w / 2 - 0.7, -h / 2 - 2.2, -1.6], [w / 2 + 0.7, h / 2 + 0.7 + headerH, -0.03], paint, [], { pz: dark });
  // legs down to the ground
  const legBottom = -(bottom + h / 2);
  for (const x of [-w * 0.3, w * 0.3]) {
    metal.box(basis, [x - 0.5, legBottom, -1.35], [x + 0.5, -h / 2 - 2.2, -0.35], steel);
  }
  for (let k = 0; k < 4; k++) {
    const y0 = legBottom + ((-h / 2 - 2.2 - legBottom) * k) / 4;
    const y1 = legBottom + ((-h / 2 - 2.2 - legBottom) * (k + 1)) / 4;
    const a = new THREE.Vector3(-w * 0.3, y0, -0.85).applyMatrix4(basis);
    const b = new THREE.Vector3(w * 0.3, y1, -0.85).applyMatrix4(basis);
    const c = new THREE.Vector3(w * 0.3, y0, -0.85).applyMatrix4(basis);
    const d = new THREE.Vector3(-w * 0.3, y1, -0.85).applyMatrix4(basis);
    metal.beam(a, b, 0.18, steel);
    metal.beam(c, d, 0.18, steel);
  }
  // header sign + sponsor strip (glowing)
  const hc = new THREE.Vector3(0, h / 2 + 0.35 + headerH / 2, 0.01).applyMatrix4(basis);
  flatPanel(signGlow, Sign.TheBowl, hc, right, up, Math.min(w + 1.0, headerH * 8), headerH);
  const sc = new THREE.Vector3(0, -h / 2 - 1.15, 0.01).applyMatrix4(basis);
  flatPanel(signGlow, Sign.KolaOfficial, sc, right, up, 1.7 * 8, 1.7);
  // little lamps on top of the header
  for (let i = -3; i <= 3; i++) {
    const p = new THREE.Vector3(i * (w / 7), h / 2 + 0.75 + headerH, -0.4).applyMatrix4(basis);
    const s = 0.22;
    const col: [number, number, number] = [6, 1.2, 0.5];
    lamps.quad(
      p.clone().addScaledVector(right, -s).addScaledVector(up, -s),
      p.clone().addScaledVector(right, s).addScaledVector(up, -s),
      p.clone().addScaledVector(right, s).addScaledVector(up, s),
      p.clone().addScaledVector(right, -s).addScaledVector(up, s),
      col,
      inward,
    );
  }

  // ---- screen ----
  const data = new Uint8Array(GW * GH * 4);
  const tex = new THREE.DataTexture(data, GW, GH, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  disposer.add(tex);

  const uniforms = {
    uText: { value: tex },
    uGrid: { value: new THREE.Vector2(GW, GH) },
    uMargin: { value: MARGIN },
    uTime: { value: 0 },
    uBright: { value: 4.2 },
    uFlash: { value: 0 },
    uChase: { value: 0.6 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uText;
      uniform vec2 uGrid;
      uniform float uMargin;
      uniform float uTime;
      uniform float uBright;
      uniform float uFlash;
      uniform float uChase;
      varying vec2 vUv;
      void main() {
        vec2 total = uGrid + 2.0 * uMargin;
        vec2 g = vUv * total - uMargin;
        vec2 cell = floor(g);
        vec2 f = fract(g) - 0.5;
        float fw = max(length(fwidth(g)), 1e-3);
        float R = 0.36;
        float dotMask = 1.0 - smoothstep(R - fw * 0.7, R + fw * 0.7, length(f));
        dotMask = mix(dotMask, 3.14159 * R * R * 1.3, smoothstep(0.35, 0.9, fw));
        vec3 col = vec3(0.004, 0.004, 0.005);
        bool inside = cell.x >= 0.0 && cell.y >= 0.0 && cell.x < uGrid.x && cell.y < uGrid.y;
        if (inside) {
          vec4 t = texture2D(uText, (cell + 0.5) / uGrid);
          vec3 lit = t.rgb * uBright * (1.0 + uFlash * 0.7);
          vec3 off = vec3(0.02, 0.018, 0.016);
          col = mix(off, lit, t.a) * dotMask;
          col *= 0.95 + 0.05 * sin(uTime * 37.0 + cell.y * 0.9);
        } else {
          // chaser bulbs on the middle ring of the border
          float lo = -2.0;
          float hx = uGrid.x + 1.0;
          float hy = uGrid.y + 1.0;
          bool onRing = (cell.x == lo || cell.x == hx) && cell.y >= lo && cell.y <= hy
                     || (cell.y == lo || cell.y == hy) && cell.x >= lo && cell.x <= hx;
          if (onRing && mod(cell.x + cell.y, 2.0) < 0.5) {
            float W = hx - lo;
            float H = hy - lo;
            float p;
            if (cell.y == lo) p = cell.x - lo;
            else if (cell.x == hx) p = W + (cell.y - lo);
            else if (cell.y == hy) p = W + H + (hx - cell.x);
            else p = 2.0 * W + H + (hy - cell.y);
            float on = step(0.5, fract(p / 10.0 - uTime * uChase));
            on = max(on, uFlash * step(0.5, fract(uTime * 6.0)));
            float bulb = 1.0 - smoothstep(0.3 - fw, 0.3 + fw, length(f));
            col = mix(vec3(0.03, 0.02, 0.01), vec3(1.0, 0.72, 0.32) * 5.0, on) * bulb;
          }
        }
        gl_FragColor = vec4(clamp(col, 0.0, 16.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    fog: false,
  });
  disposer.add(mat);
  const geo = new THREE.PlaneGeometry(w, h);
  disposer.add(geo);
  const screen = new THREE.Mesh(geo, mat);
  screen.name = 'StadiumScoreboard';
  basis.decompose(screen.position, screen.quaternion, screen.scale);
  screen.position.addScaledVector(inward, 0.02);
  screen.castShadow = false;
  screen.receiveShadow = false;

  const setLines = (input: string[]) => {
    data.fill(0);
    type Line = { text: string; color: [number, number, number]; scale: number };
    const defaultColor = (i: number, n: number): [number, number, number] => (i === 0 && n >= 3 ? COLORS.r : i % 2 === 0 ? COLORS.a : COLORS.y);
    const lines: Line[] = input.slice(0, 8).map((raw, i, arr) => {
      let t = raw;
      let color = defaultColor(i, arr.length);
      const m = /^\^([a-z])/.exec(t);
      if (m) {
        color = COLORS[m[1]] ?? color;
        t = t.slice(2);
      }
      t = t.toUpperCase();
      const scale = t.length <= Math.floor((GW + 2) / 12) ? 2 : 1;
      const maxChars = Math.floor((GW + 1) / 6);
      if (t.length > maxChars) t = t.slice(0, maxChars);
      return { text: t, color, scale };
    });
    const heightOf = (ls: Line[]) => ls.reduce((a, l, i) => a + 7 * l.scale + (i < ls.length - 1 ? (l.scale === 2 ? 4 : 3) : 0), 0);
    // demote double-size lines (bottom first) until everything fits
    for (let i = lines.length - 1; i >= 0 && heightOf(lines) > GH; i--) lines[i].scale = 1;
    while (lines.length > 0 && heightOf(lines) > GH) lines.pop();
    let y = Math.floor((GH - heightOf(lines)) / 2);
    for (const l of lines) {
      const s = l.scale;
      const width = l.text.length * 6 * s - s;
      let x = Math.floor((GW - width) / 2);
      for (const ch of l.text) {
        const rows = glyph(ch);
        for (let ry = 0; ry < 7; ry++) {
          for (let rx = 0; rx < 5; rx++) {
            if (!(rows[ry] & (1 << (4 - rx)))) continue;
            for (let sy = 0; sy < s; sy++) {
              for (let sx = 0; sx < s; sx++) {
                const px = x + rx * s + sx;
                const py = y + ry * s + sy;
                if (px < 0 || px >= GW || py < 0 || py >= GH) continue;
                const idx = ((GH - 1 - py) * GW + px) * 4;
                data[idx] = l.color[0];
                data[idx + 1] = l.color[1];
                data[idx + 2] = l.color[2];
                data[idx + 3] = 255;
              }
            }
          }
        }
        x += 6 * s;
      }
      y += 7 * s + (s === 2 ? 4 : 3);
    }
    tex.needsUpdate = true;
  };

  let time = 0;
  return {
    screen,
    setLines,
    update: (dt: number, excite: number) => {
      time += dt;
      uniforms.uTime.value = time % 1000;
      uniforms.uChase.value = 0.35 + 2.2 * excite;
      uniforms.uFlash.value = Math.max(0, uniforms.uFlash.value - dt * 0.9);
    },
    flash: (s: number) => {
      uniforms.uFlash.value = Math.min(1.5, Math.max(uniforms.uFlash.value, s));
    },
  };
}
