import * as THREE from 'three';
import { HAZE_GLSL, SKY_HORIZON_GLSL } from './sky';

export interface HazeUniforms {
  uSunDir: { value: THREE.Vector3 };
  /** x = start distance (m), y = 1 / scale (1/m), z = max amount */
  uHaze: { value: THREE.Vector3 };
}

export interface PatchOptions {
  key: string;
  /** directional aerial perspective toward the sky's horizon colour */
  haze?: HazeUniforms;
  /** world-space (box-projected) greyscale noise multiplied into the albedo */
  noise?: { tex: THREE.Texture; scale: number; amount: number };
  /** extra fragment declarations (after #include <common>) */
  fragDecl?: string;
  /** code run after #include <color_fragment> (diffuseColor, vF8World, vF8Normal available) */
  fragColor?: string;
  /** extra uniforms */
  uniforms?: Record<string, THREE.IUniform>;
  vertDecl?: string;
  /** code after #include <begin_vertex> (object space `transformed`) */
  vertBegin?: string;
}

/**
 * Patches a MeshStandardMaterial / MeshBasicMaterial with a world-space position/normal varying plus the
 * optional features above. All injected maths is guarded (normalised with epsilons, clamped mixes).
 */
export function patchMaterial<T extends THREE.Material>(mat: T, o: PatchOptions): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    if (o.haze) {
      sh.uniforms.uSunDir = o.haze.uSunDir;
      sh.uniforms.uHaze = o.haze.uHaze;
    }
    if (o.noise) {
      sh.uniforms.uF8Noise = { value: o.noise.tex };
      sh.uniforms.uF8NoiseScale = { value: o.noise.scale };
      sh.uniforms.uF8NoiseAmt = { value: o.noise.amount };
    }
    if (o.uniforms) Object.assign(sh.uniforms, o.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vF8World;\nvarying vec3 vF8Normal;\n${o.vertDecl ?? ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${o.vertBegin ?? ''}`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 f8p = vec4(transformed, 1.0);
          vec3 f8n = normal;
          #ifdef USE_INSTANCING
            f8p = instanceMatrix * f8p;
            f8n = mat3(instanceMatrix) * f8n;
          #endif
          vF8World = (modelMatrix * f8p).xyz;
          vF8Normal = mat3(modelMatrix) * f8n;
        }`,
      );
    let decl = `varying vec3 vF8World;\nvarying vec3 vF8Normal;\n`;
    if (o.haze) decl += `uniform vec3 uSunDir;\n${SKY_HORIZON_GLSL}\n${HAZE_GLSL}\n`;
    if (o.noise) decl += `uniform sampler2D uF8Noise;\nuniform float uF8NoiseScale;\nuniform float uF8NoiseAmt;\n`;
    if (o.fragDecl) decl += o.fragDecl;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${decl}`);
    let col = '';
    if (o.noise) {
      col += `
      {
        vec3 an = abs(vF8Normal);
        vec2 puv = an.y > max(an.x, an.z) ? vF8World.xz : (an.x > an.z ? vF8World.zy : vF8World.xy);
        float nz = texture2D(uF8Noise, puv * uF8NoiseScale).r * 0.6 + texture2D(uF8Noise, puv * uF8NoiseScale * 0.23 + 0.37).r * 0.4;
        diffuseColor.rgb *= clamp(1.0 + (nz - 0.5) * 2.0 * uF8NoiseAmt, 0.0, 2.0);
      }`;
    }
    if (o.fragColor) col += `\n${o.fragColor}\n`;
    if (col) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${col}`);
    if (o.haze) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>\ngl_FragColor.rgb = max(f8ApplyHaze(gl_FragColor.rgb, vF8World), vec3(0.0));`);
    }
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|f8:${o.key}`;
  return mat;
}

/** Tileable linear-space value-noise texture (greyscale, mean ~0.5), deterministic. */
export function makeNoiseTexture(rand: () => number, size = 256, octaves = 4): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const acc = new Float32Array(size * size);
  let amp = 1, total = 0, cells = 4;
  for (let o = 0; o < octaves; o++) {
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * cells;
      const y0 = Math.floor(gy) % cells, y1 = (y0 + 1) % cells;
      let ty = gy - Math.floor(gy);
      ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells;
        const x0 = Math.floor(gx) % cells, x1 = (x0 + 1) % cells;
        let tx = gx - Math.floor(gx);
        tx = tx * tx * (3 - 2 * tx);
        const a = grid[y0 * cells + x0], b = grid[y0 * cells + x1], c = grid[y1 * cells + x0], d = grid[y1 * cells + x1];
        acc[y * size + x] += amp * ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty);
      }
    }
    total += amp;
    amp *= 0.55;
    cells *= 2;
  }
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(Math.min(1, Math.max(0, acc[i] / total)) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

