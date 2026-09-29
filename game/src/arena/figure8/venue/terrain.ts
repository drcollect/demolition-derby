import * as THREE from 'three';
import { HASH_GLSL, Rng, type Disposer } from '../../stadium/util';
import { GROUND_Y, type Site } from './site';
import { patchMaterial, type HazeUniforms } from './materials';

/*
 The ground beyond the track's own terrain: one big plane (with a hole where the track's heightfield mesh
 is) out to ~1.3 km. Near the venue its colour comes from a painted "ground map" (walkways, parking,
 pits, worn grass); further out a procedural patchwork of fields with crop rows, fading into the sky's
 horizon colour.
*/

export interface GroundPaint {
  /** called with the 2D context in world metres (x right, z down the canvas) to paint lots/paths/etc */
  (ctx: CanvasRenderingContext2D, rng: Rng): void;
}

export interface TerrainResult {
  mesh: THREE.Mesh;
}

const MAP_HALF = 330; // metres covered by the ground map (square, centred on the origin)
const MAP_PX = 1024;

function lines(inner: number, outer: number, step0: number, near: number): number[] {
  // positive coordinates from `inner` outward: fine steps to `near`, then growing
  const out: number[] = [inner];
  let x = inner;
  let step = step0;
  while (x < outer) {
    if (x >= near) step *= 1.22;
    x = Math.min(outer, x + step);
    out.push(x);
  }
  return out;
}

export function buildTerrain(site: Site, rng: Rng, haze: HazeUniforms, paint: GroundPaint, detail: THREE.Texture, quality: 'low' | 'high', disposer: Disposer): TerrainResult {
  const b = site.bounds;
  // hole where the track's own terrain mesh is (5 cm overlap so there is never a crack at the seam)
  const hole = { minX: b.minX + 0.05, maxX: b.maxX - 0.05, minZ: b.minZ + 0.05, maxZ: b.maxZ - 0.05 };
  const R = 1320;

  // ---- geometry: grid with explicit lines so the hole edges are exact -----------------------------------------
  const step = quality === 'high' ? 6 : 10;
  const inside = (lo: number, hi: number, s: number) => {
    const out: number[] = [];
    const n = Math.max(1, Math.round((hi - lo) / s));
    for (let i = 1; i < n; i++) out.push(lo + ((hi - lo) * i) / n);
    return out;
  };
  const xsPos = lines(hole.maxX, R, step, 220);
  const xsNeg = lines(-hole.minX, R, step, 220).map((v) => -v).reverse();
  const zsPos = lines(hole.maxZ, R, step, 220);
  const zsNeg = lines(-hole.minZ, R, step, 220).map((v) => -v).reverse();
  const xs = [...xsNeg, ...inside(hole.minX, hole.maxX, step * 2), ...xsPos];
  const zs = [...zsNeg, ...inside(hole.minZ, hole.maxZ, step * 2), ...zsPos];
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const vid = new Int32Array(xs.length * zs.length).fill(-1);
  const vert = (i: number, j: number) => {
    const k = i * zs.length + j;
    if (vid[k] < 0) {
      vid[k] = pos.length / 3;
      pos.push(xs[i], GROUND_Y, zs[j]);
      nrm.push(0, 1, 0);
    }
    return vid[k];
  };
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      if (cx > hole.minX && cx < hole.maxX && cz > hole.minZ && cz < hole.maxZ) continue;
      if (Math.hypot(cx, cz) > R * 1.02) continue;
      const a = vert(i, j), bb = vert(i + 1, j), c = vert(i + 1, j + 1), d = vert(i, j + 1);
      idx.push(a, d, c, a, c, bb);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  disposer.add(geo);

  // ---- ground map --------------------------------------------------------------------------------------------------------
  const cv = document.createElement('canvas');
  cv.width = MAP_PX;
  cv.height = MAP_PX;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('figure8 venue: 2D canvas unavailable');
  const s = MAP_PX / (MAP_HALF * 2);
  // base: dry summer grass with blotches
  ctx.fillStyle = '#6c6c3c';
  ctx.fillRect(0, 0, MAP_PX, MAP_PX);
  for (let i = 0; i < 9000; i++) {
    const x = rng.next() * MAP_PX, y = rng.next() * MAP_PX, r = 1 + rng.next() * rng.next() * 14;
    const k = rng.next();
    ctx.fillStyle =
      k < 0.4
        ? `rgba(${88 + rng.next() * 25},${100 + rng.next() * 25},${46 + rng.next() * 16},${0.06 + rng.next() * 0.12})`
        : k < 0.8
          ? `rgba(${150 + rng.next() * 35},${132 + rng.next() * 25},${78 + rng.next() * 22},${0.05 + rng.next() * 0.1})`
          : `rgba(${95 + rng.next() * 20},${80 + rng.next() * 15},${52 + rng.next() * 12},${0.05 + rng.next() * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.4 + rng.next() * 0.8), rng.next() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(MAP_PX / 2, MAP_PX / 2);
  ctx.scale(s, s);
  paint(ctx, rng);
  ctx.restore();
  const mapTex = new THREE.CanvasTexture(cv);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.flipY = false;
  mapTex.anisotropy = 8;
  mapTex.wrapS = mapTex.wrapT = THREE.ClampToEdgeWrapping;
  disposer.add(mapTex);

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97, metalness: 0, envMapIntensity: 0.4 });
  patchMaterial(mat, {
    key: 'terrain',
    haze,
    uniforms: {
      uGroundMap: { value: mapTex },
      uGroundDetail: { value: detail },
      uMapHalf: { value: MAP_HALF },
    },
    fragDecl: /* glsl */ `
      uniform sampler2D uGroundMap;
      uniform sampler2D uGroundDetail;
      uniform float uMapHalf;
      ${HASH_GLSL}
      vec3 f8Farm(vec2 p, float fw) {
        vec2 cs = vec2(150.0, 105.0);
        vec2 warp = vec2(sNoise2(p * 0.0035), sNoise2(p * 0.0035 + 17.0)) - 0.5;
        vec2 q = p / cs + warp * 0.3;
        vec2 cell = floor(q);
        vec2 f = fract(q);
        float h = sHash12(cell + 11.0);
        float h2 = sHash12(cell + 37.0);
        vec3 c;
        float rows = 0.0;
        if (h < 0.22) { c = vec3(0.48, 0.33, 0.09); rows = 0.5; }        // wheat stubble
        else if (h < 0.42) { c = vec3(0.09, 0.16, 0.035); rows = 1.0; }  // corn
        else if (h < 0.56) { c = vec3(0.16, 0.24, 0.05); rows = 1.0; }   // beans
        else if (h < 0.7) { c = vec3(0.20, 0.11, 0.055); rows = 0.8; }   // ploughed
        else if (h < 0.88) { c = vec3(0.20, 0.23, 0.07); rows = 0.0; }   // pasture
        else { c = vec3(0.40, 0.33, 0.12); rows = 0.3; }                 // hay meadow
        c *= 0.85 + 0.3 * h2;
        float ang = step(0.5, h2) * 1.5707963 + (h2 - 0.5) * 0.2;
        float coord = dot(p, vec2(cos(ang), sin(ang)));
        float period = 1.4 + 1.2 * fract(h2 * 7.0);
        float aa = 1.0 - smoothstep(period * 0.2, period * 0.6, fw);
        float stripe = 0.5 + 0.5 * sin(coord * 6.2831853 / period);
        c *= mix(1.0, 0.72 + 0.5 * stripe, aa * rows);
        // field margins: grassy strips / hedgerows
        vec2 e = min(f, 1.0 - f) * cs;
        float edge = 1.0 - smoothstep(1.0, 3.0 + fw, min(e.x, e.y));
        c = mix(c, vec3(0.06, 0.08, 0.03), edge * 0.6);
        return c;
      }
    `,
    fragColor: /* glsl */ `
      {
        vec2 wp = vF8World.xz;
        float fw = max(length(fwidth(wp)), 1e-4);
        vec2 muv = (wp + uMapHalf) / (2.0 * uMapHalf);
        vec3 mapCol = texture2D(uGroundMap, clamp(muv, vec2(0.0), vec2(1.0))).rgb;
        float edgeD = min(min(muv.x, 1.0 - muv.x), min(muv.y, 1.0 - muv.y)) * 2.0 * uMapHalf;
        float mw = smoothstep(0.0, 60.0, edgeD);
        vec3 farm = f8Farm(wp, fw);
        vec3 base = mix(farm, mapCol, mw);
        float det = texture2D(uGroundDetail, wp * 0.19).r * 0.55 + texture2D(uGroundDetail, wp * 0.041 + 0.3).r * 0.45;
        float detAmt = 1.0 - smoothstep(2.0, 12.0, fw * 40.0);
        base *= mix(1.0, 0.62 + 0.76 * det, 0.35 + 0.65 * detAmt);
        diffuseColor.rgb = max(base, vec3(0.0));
      }
    `,
  });
  disposer.add(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'F8Ground';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return { mesh };
}
