import * as THREE from 'three';
import { glyph } from '../../stadium/font5x7';
import type { Disposer } from '../../stadium/util';

/*
 LED scoreboard face: a grid of round dots driven by a small DataTexture that setLines() writes with the
 stadium's 5x7 font. Short lines are drawn double size. A leading "^x" picks a colour (a amber, y yellow,
 w white, r red, g green, b blue, o orange, c cyan). Border bulbs chase faster with excitement and flash
 on cheers. All output is clamped (no NaN / negatives reach bloom).
*/

const COLORS: Record<string, [number, number, number]> = {
  a: [255, 170, 50],
  y: [255, 220, 70],
  w: [255, 238, 210],
  r: [255, 70, 45],
  g: [90, 255, 120],
  b: [100, 170, 255],
  o: [255, 120, 30],
  c: [80, 240, 240],
};

export interface ScoreboardFace {
  mesh: THREE.Mesh;
  setLines(lines: string[]): void;
  update(dt: number, excite: number): void;
  flash(strength: number): void;
  width: number;
  height: number;
}

export function buildScoreboardFace(gw: number, gh: number, cell: number, disposer: Disposer): ScoreboardFace {
  const margin = 2;
  const W = (gw + 2 * margin) * cell;
  const H = (gh + 2 * margin) * cell;
  const data = new Uint8Array(gw * gh * 4);
  const tex = new THREE.DataTexture(data, gw, gh, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  disposer.add(tex);
  const uniforms = {
    uText: { value: tex },
    uGrid: { value: new THREE.Vector2(gw, gh) },
    uMargin: { value: margin },
    uTime: { value: 0 },
    uBright: { value: 3.2 },
    uFlash: { value: 0 },
    uChase: { value: 0.5 },
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
        float R = 0.38;
        float dotMask = 1.0 - smoothstep(R - fw * 0.7, R + fw * 0.7, length(f));
        // far away the dots merge: fade to their average coverage instead of aliasing
        dotMask = mix(dotMask, 0.45, smoothstep(0.35, 0.9, fw));
        vec3 col = vec3(0.006, 0.006, 0.007);
        bool inside = cell.x >= 0.0 && cell.y >= 0.0 && cell.x < uGrid.x && cell.y < uGrid.y;
        if (inside) {
          vec4 t = texture2D(uText, (cell + 0.5) / uGrid);
          vec3 lit = t.rgb * uBright * (1.0 + 0.6 * clamp(uFlash, 0.0, 1.5));
          col = mix(vec3(0.03, 0.028, 0.026), lit, t.a) * dotMask;
        } else {
          float lo = -1.0;
          float hx = uGrid.x;
          float hy = uGrid.y;
          bool ring = ((cell.x == lo || cell.x == hx) && cell.y >= lo && cell.y <= hy) || ((cell.y == lo || cell.y == hy) && cell.x >= lo && cell.x <= hx);
          if (ring && mod(cell.x + cell.y, 2.0) < 0.5) {
            float p = cell.x + cell.y * 1.7;
            float on = step(0.55, fract(p / 12.0 - uTime * uChase));
            on = max(on, step(0.2, uFlash) * step(0.5, fract(uTime * 5.0)));
            float bulb = 1.0 - smoothstep(0.3 - fw, 0.3 + fw, length(f));
            col = mix(vec3(0.03, 0.02, 0.01), vec3(1.0, 0.7, 0.3) * 3.0, on) * bulb;
          }
        }
        gl_FragColor = vec4(clamp(col, vec3(0.0), vec3(12.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    fog: false,
  });
  disposer.add(mat);
  const geo = disposer.add(new THREE.PlaneGeometry(W, H));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'F8Scoreboard';
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const setLines = (input: string[]) => {
    data.fill(0);
    type Line = { text: string; color: [number, number, number]; scale: number };
    const lines: Line[] = input.slice(0, 8).map((raw, i) => {
      let t = String(raw ?? '');
      let color = i === 0 ? COLORS.y : i % 2 ? COLORS.a : COLORS.w;
      const m = /^\^([a-z])/.exec(t);
      if (m) {
        color = COLORS[m[1]] ?? color;
        t = t.slice(2);
      }
      t = t.toUpperCase();
      const maxChars = Math.floor((gw + 1) / 6);
      if (t.length > maxChars) t = t.slice(0, maxChars);
      const scale = t.length * 12 - 2 <= gw && i === 0 ? 2 : 1;
      return { text: t, color, scale };
    });
    const heightOf = (ls: Line[]) => ls.reduce((a, l, i) => a + 7 * l.scale + (i < ls.length - 1 ? (l.scale === 2 ? 3 : 2) : 0), 0);
    for (let i = lines.length - 1; i >= 0 && heightOf(lines) > gh; i--) lines[i].scale = 1;
    while (lines.length > 0 && heightOf(lines) > gh) lines.pop();
    let y = Math.floor((gh - heightOf(lines)) / 2);
    for (const l of lines) {
      const s = l.scale;
      const width = l.text.length * 6 * s - s;
      let x = Math.floor((gw - width) / 2);
      for (const ch of l.text) {
        const rows = glyph(ch);
        for (let ry = 0; ry < 7; ry++) {
          for (let rx = 0; rx < 5; rx++) {
            if (!(rows[ry] & (1 << (4 - rx)))) continue;
            for (let sy = 0; sy < s; sy++) {
              for (let sx = 0; sx < s; sx++) {
                const px = x + rx * s + sx, py = y + ry * s + sy;
                if (px < 0 || px >= gw || py < 0 || py >= gh) continue;
                const idx = ((gh - 1 - py) * gw + px) * 4;
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
      y += 7 * s + (s === 2 ? 3 : 2);
    }
    tex.needsUpdate = true;
  };

  let time = 0;
  return {
    mesh,
    setLines,
    width: W,
    height: H,
    update: (dt: number, excite: number) => {
      time = (time + dt) % 1000;
      uniforms.uTime.value = time;
      uniforms.uChase.value = 0.35 + 1.8 * Math.min(1, Math.max(0, excite));
      uniforms.uFlash.value = Math.max(0, uniforms.uFlash.value - dt * 0.9);
    },
    flash: (s: number) => {
      uniforms.uFlash.value = Math.min(1.5, Math.max(uniforms.uFlash.value, s));
    },
  };
}
