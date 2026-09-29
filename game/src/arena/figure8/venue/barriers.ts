import * as THREE from 'three';
import { GeoBuilder, Rng, lin, type Disposer, type Rgb } from '../../stadium/util';
import type { Sign } from '../../stadium/signage';
import type { BarrierSegment } from '../track';
import type { BarrierRun, Site } from './site';
import { patchMaterial } from './materials';
import { polylineSign } from './signs';

/*
 Barrier visuals, exactly on track.barriers (whose colliders already exist):
 - jersey: 0.7 m base, 0.95 m tall concrete blocks, one per segment, mitred where segments meet, painted
   white/red with a procedural scuff texture (tyre rubber, scrapes, chipped paint, dirt splash);
 - tires: stacks of tyres (0.66 m OD) filling the 0.7 m wide collider up to its 1.1 m top.
 Heights follow the collider: base = terrain height at the segment midpoint.
 Sponsor banners are strapped on the track side of some runs.
*/

const TYRE_H = 1.1; // jersey height (0.95) is baked into PROFILE
const COLLIDER_OVERHANG = 0.15;
const TYRE_OD = 0.66;

// jersey profile (u = lateral, v = height above base), counter-clockwise, convex
const PROFILE: [number, number][] = [
  [0.35, -0.55],
  [0.35, 0.08],
  [0.175, 0.33],
  [0.112, 0.925],
  [0.09, 0.95],
  [-0.09, 0.95],
  [-0.112, 0.925],
  [-0.175, 0.33],
  [-0.35, 0.08],
  [-0.35, -0.55],
];

export interface BarrierVisuals {
  jersey: THREE.Mesh;
  tyres: THREE.InstancedMesh;
  tyreTops: THREE.InstancedMesh;
  tyreCount: number;
}

const flat = (v: THREE.Vector3) => new THREE.Vector3(v.x, 0, v.z);

/** Horizontal unit direction of a segment and its left normal (same convention as the track). */
function segFrame(s: BarrierSegment) {
  const d = flat(s.b).sub(flat(s.a));
  const len = d.length();
  d.divideScalar(Math.max(len, 1e-6));
  const l = new THREE.Vector3(d.z, 0, -d.x);
  return { d, l, len };
}

/** +1 when the track is on the segment's left, -1 when on its right. */
function trackSide(site: Site, s: BarrierSegment): number {
  const mid = s.a.clone().add(s.b).multiplyScalar(0.5);
  const near = site.track.samples[site.track.nearest(mid.x, mid.z).index].p;
  const { l } = segFrame(s);
  return (near.x - mid.x) * l.x + (near.z - mid.z) * l.z >= 0 ? 1 : -1;
}

function scuffTexture(rng: Rng): THREE.DataTexture {
  // RGB = multiplicative grime, A = paint (0 where it is chipped and concrete shows).
  // u: 8 m, v: height 0..1.1 m (bottom up). Built from two opaque canvases into a DataTexture so the
  // grime colour survives under fully chipped pixels (no premultiplied-alpha loss).
  const Wd = 1024, Ht = 128;
  const c = document.createElement('canvas');
  c.width = Wd;
  c.height = Ht;
  const g = c.getContext('2d');
  const mc = document.createElement('canvas');
  mc.width = Wd;
  mc.height = Ht;
  const mg = mc.getContext('2d');
  if (!g || !mg) throw new Error('figure8 venue: 2D canvas unavailable');
  g.fillStyle = 'rgb(255,255,255)';
  g.fillRect(0, 0, Wd, Ht);
  mg.fillStyle = 'rgb(0,0,0)';
  mg.fillRect(0, 0, Wd, Ht);
  // canvas y = 0 is the top of the barrier (texture v = 1 with flipY)
  const Y = (h: number) => Ht * (1 - h / 1.1);
  const wrap = (fn: (ox: number) => void) => {
    fn(0);
    fn(-Wd);
    fn(Wd);
  };
  // general weathering: vertical streaks
  for (let i = 0; i < 90; i++) {
    const x = rng.next() * Wd, w = 2 + rng.next() * 10, a = 0.03 + rng.next() * 0.06;
    g.fillStyle = `rgba(90,80,70,${a})`;
    g.fillRect(x, Y(0.95), w, Ht * (0.3 + rng.next() * 0.5));
  }
  // dirt splash along the bottom
  const grad = g.createLinearGradient(0, Y(0.45), 0, Y(0));
  grad.addColorStop(0, 'rgba(120,90,60,0)');
  grad.addColorStop(0.6, 'rgba(120,88,58,0.35)');
  grad.addColorStop(1, 'rgba(96,70,46,0.75)');
  g.fillStyle = grad;
  g.fillRect(0, Y(0.45), Wd, Y(0) - Y(0.45));
  for (let i = 0; i < 700; i++) {
    const x = rng.next() * Wd, h = Math.pow(rng.next(), 2.2) * 0.5, r = 0.6 + rng.next() * 2.6;
    g.fillStyle = `rgba(${90 + rng.next() * 30},${66 + rng.next() * 20},${44 + rng.next() * 14},${0.25 + rng.next() * 0.5})`;
    wrap((ox) => {
      g.beginPath();
      g.ellipse(x + ox, Y(h), r * (1 + rng.next()), r, 0, 0, Math.PI * 2);
      g.fill();
    });
  }
  // tyre rubber marks at bumper height
  for (let i = 0; i < 26; i++) {
    const x = rng.next() * Wd, len = 30 + rng.next() * 180, h = 0.18 + rng.next() * 0.42, th = 3 + rng.next() * 10;
    const a = 0.25 + rng.next() * 0.5;
    const tilt = (rng.next() - 0.5) * 0.12;
    wrap((ox) => {
      g.save();
      g.translate(x + ox, Y(h));
      g.rotate(tilt);
      const lg = g.createLinearGradient(-len / 2, 0, len / 2, 0);
      lg.addColorStop(0, 'rgba(20,20,20,0)');
      lg.addColorStop(0.2, `rgba(22,22,22,${a})`);
      lg.addColorStop(0.8, `rgba(22,22,22,${a})`);
      lg.addColorStop(1, 'rgba(20,20,20,0)');
      g.fillStyle = lg;
      g.fillRect(-len / 2, -th / 2, len, th);
      g.restore();
    });
  }
  // chipped paint (alpha) with dark rims, and scrapes
  const chips = (n: number, hLo: number, hHi: number, rMax: number) => {
    for (let i = 0; i < n; i++) {
      const x = rng.next() * Wd, h = hLo + rng.next() * (hHi - hLo), r = 1.5 + rng.next() * rng.next() * rMax;
      const pts: [number, number][] = [];
      const k = 5 + Math.floor(rng.next() * 4);
      for (let j = 0; j < k; j++) {
        const a = (j / k) * Math.PI * 2;
        const rr = r * (0.6 + rng.next() * 0.7);
        pts.push([Math.cos(a) * rr * 1.4, Math.sin(a) * rr]);
      }
      const a = 0.75 + rng.next() * 0.25;
      wrap((ox) => {
        mg.save();
        mg.translate(x + ox, Y(h));
        mg.beginPath();
        pts.forEach(([px, py], j) => (j ? mg.lineTo(px, py) : mg.moveTo(px, py)));
        mg.closePath();
        mg.fillStyle = `rgba(255,255,255,${a})`;
        mg.fill();
        mg.restore();
        g.save();
        g.translate(x + ox, Y(h));
        g.beginPath();
        pts.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py)));
        g.closePath();
        g.strokeStyle = 'rgba(60,55,50,0.35)';
        g.lineWidth = 1;
        g.stroke();
        g.restore();
      });
    }
  };
  chips(140, 0.05, 0.93, 7);
  chips(40, 0.85, 0.95, 5); // top edge knocks
  for (let i = 0; i < 40; i++) {
    const x = rng.next() * Wd, len = 20 + rng.next() * 120, h = 0.15 + rng.next() * 0.6;
    const a = 0.4 + rng.next() * 0.4, lw = 1 + rng.next() * 1.5, dy = (rng.next() - 0.5) * 0.05;
    wrap((ox) => {
      mg.save();
      mg.strokeStyle = `rgba(255,255,255,${a})`;
      mg.lineWidth = lw;
      mg.beginPath();
      mg.moveTo(x + ox, Y(h));
      mg.lineTo(x + ox + len, Y(h + dy));
      mg.stroke();
      mg.restore();
    });
  }
  const col = g.getImageData(0, 0, Wd, Ht).data;
  const mask = mg.getImageData(0, 0, Wd, Ht).data;
  const data = new Uint8Array(Wd * Ht * 4);
  for (let y = 0; y < Ht; y++) {
    const src = y * Wd * 4;
    const dst = (Ht - 1 - y) * Wd * 4; // canvas top = barrier top = v 1
    for (let x = 0; x < Wd * 4; x += 4) {
      data[dst + x] = col[src + x];
      data[dst + x + 1] = col[src + x + 1];
      data[dst + x + 2] = col[src + x + 2];
      data[dst + x + 3] = 255 - mask[src + x];
    }
  }
  const tex = new THREE.DataTexture(data, Wd, Ht, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Tyre (OD 0.66, 0.2 tall, sitting on y = 0) in two parts: the bulging tread band (every tyre) and the top
 * sidewall + hole (only the top tyre of a stack, the others are hidden). uv.y > 1.5 marks the top part.
 */
function tyreBodyGeometry(segs: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry([new THREE.Vector2(0.295, 0.0), new THREE.Vector2(0.333, 0.1), new THREE.Vector2(0.295, 0.2)], segs);
}
function tyreTopGeometry(segs: number): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry([new THREE.Vector2(0.295, 0.2), new THREE.Vector2(0.22, 0.204), new THREE.Vector2(0.19, 0.18), new THREE.Vector2(0.186, 0.02)], segs);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) + 2);
  return g;
}

export function buildBarriers(site: Site, rng: Rng, signs: GeoBuilder, signPool: Sign[], quality: 'low' | 'high', disposer: Disposer): BarrierVisuals {
  const jb = new GeoBuilder();
  const white: Rgb = lin(0xe6e3da);
  const red: Rgb = lin(0xb4231d);
  const endPaint: Rgb = lin(0xe8b21a);
  const jointDark: Rgb = lin(0x5c5850);
  const inset = 0.012;

  const tyreM: THREE.Matrix4[] = [];
  const tyreC: THREE.Color[] = [];
  const topM: THREE.Matrix4[] = [];
  const topC: THREE.Color[] = [];
  const TYRE_COLS = [0xf0efe8, 0xe8c21d, 0xc8241c, 0x2a55b8, 0xe07a2a, 0x2e8a44].map((h) => new THREE.Color(h));

  let blockIndex = 0;
  for (const run of site.runs) {
    buildRunJersey(run);
    buildRunTyres(run);
    buildRunBanners(run);
  }

  function neighbours(run: BarrierRun, i: number): { prev: BarrierSegment | null; next: BarrierSegment | null } {
    const n = run.segs.length;
    const prev = i > 0 ? run.segs[i - 1] : run.closed ? run.segs[n - 1] : null;
    const next = i < n - 1 ? run.segs[i + 1] : run.closed ? run.segs[0] : null;
    return { prev, next };
  }

  /** Lateral (u) axis at a joint, scaled so the offset stays u metres from both segment lines. */
  function jointLateral(a: BarrierSegment, b: BarrierSegment): THREE.Vector3 {
    const la = segFrame(a).l, lb = segFrame(b).l;
    const m = la.clone().add(lb);
    if (m.lengthSq() < 1e-6) return lb.clone();
    m.normalize();
    const k = Math.max(0.5, m.dot(lb));
    return m.divideScalar(k);
  }

  function buildRunJersey(run: BarrierRun) {
    let runDist = 0;
    run.segs.forEach((s, i) => {
      const { d, l, len } = segFrame(s);
      if (s.kind !== 'jersey') {
        runDist += len;
        return;
      }
      const { prev, next } = neighbours(run, i);
      const joinPrev = !!prev && prev.kind === 'jersey';
      const joinNext = !!next && next.kind === 'jersey';
      const mid = s.a.clone().add(s.b).multiplyScalar(0.5);
      const base = site.track.heightAt(mid.x, mid.z);
      const pa = flat(s.a), pb = flat(s.b);
      const la = joinPrev ? jointLateral(prev!, s) : l;
      const lb = joinNext ? jointLateral(s, next!) : l;
      if (joinPrev) pa.addScaledVector(d, inset);
      else pa.addScaledVector(d, -COLLIDER_OVERHANG);
      if (joinNext) pb.addScaledVector(d, -inset);
      else pb.addScaledVector(d, COLLIDER_OVERHANG);
      const paint = blockIndex++ % 2 === 0 ? white : red;
      const shade = 0.9 + rng.next() * 0.14;
      const col: Rgb = [paint[0] * shade, paint[1] * shade, paint[2] * shade];
      const uOff = rng.next() * 8;
      const u0 = uOff / 8, u1 = (uOff + pa.distanceTo(pb)) / 8;
      const P = (p: THREE.Vector3, lat: THREE.Vector3, u: number, v: number) => new THREE.Vector3(p.x + lat.x * u, base + v, p.z + lat.z * u);
      const vt = (v: number) => Math.min(1, Math.max(0, (v + 0.1) / 1.1));
      for (let k = 0; k + 1 < PROFILE.length; k++) {
        const [ua, va] = PROFILE[k];
        const [ub, vb] = PROFILE[k + 1];
        // outward normal of this profile edge
        const nu = vb - va, nv = -(ub - ua);
        const facing = l.clone().multiplyScalar(nu).add(new THREE.Vector3(0, nv, 0)).normalize();
        jb.quad(P(pa, la, ua, va), P(pb, lb, ua, va), P(pb, lb, ub, vb), P(pa, la, ub, vb), col, facing, [u0, vt(va), u1, vt(va), u1, vt(vb), u0, vt(vb)]);
      }
      // end caps: joints get a dark face (reads as the gap between blocks), free ends a yellow hazard end
      for (const [p, lat, dir, joined] of [
        [pa, la, d.clone().negate(), joinPrev],
        [pb, lb, d, joinNext],
      ] as [THREE.Vector3, THREE.Vector3, THREE.Vector3, boolean][]) {
        const cc = joined ? jointDark : endPaint;
        const c0 = P(p, lat, PROFILE[0][0], PROFILE[0][1]);
        for (let k = 1; k + 1 < PROFILE.length; k++) {
          jb.tri(c0, P(p, lat, PROFILE[k][0], PROFILE[k][1]), P(p, lat, PROFILE[k + 1][0], PROFILE[k + 1][1]), cc, dir, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
        }
      }
      runDist += len;
    });
  }

  function buildRunTyres(run: BarrierRun) {
    // contiguous stretches of tyre segments
    const n = run.segs.length;
    let i = 0;
    while (i < n) {
      if (run.segs[i].kind !== 'tires') {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < n && run.segs[j + 1].kind === 'tires') j++;
      const segs = run.segs.slice(i, j + 1);
      placeStacks(run, segs, i, j);
      i = j + 1;
    }
  }

  function placeStacks(run: BarrierRun, segs: BarrierSegment[], i0: number, i1: number) {
    const { prev } = neighbours(run, i0);
    const { next } = neighbours(run, i1);
    const extStart = prev ? 0 : COLLIDER_OVERHANG;
    const extEnd = next ? 0 : COLLIDER_OVERHANG;
    const lens = segs.map((s) => segFrame(s).len);
    const total = lens.reduce((a, b) => a + b, 0) + extStart + extEnd;
    const count = Math.max(1, Math.round(total / (TYRE_OD + 0.015)));
    const pitch = total / count;
    let stackNo = 0;
    for (let k = 0; k < count; k++) {
      let sd = (k + 0.5) * pitch - extStart;
      let si = 0;
      while (si < segs.length - 1 && sd > lens[si]) {
        sd -= lens[si];
        si++;
      }
      const s = segs[si];
      const { d } = segFrame(s);
      const p = flat(s.a).addScaledVector(d, sd);
      const mid = s.a.clone().add(s.b).multiplyScalar(0.5);
      const top = site.track.heightAt(mid.x, mid.z) + TYRE_H;
      const bottom = site.groundMin(p.x, p.z, 0.33) - 0.04;
      const nT = Math.max(3, Math.round((top - bottom) / 0.215));
      const th = (top - bottom) / nT;
      // stack paint pattern
      const pat = rng.next();
      const stackCol = TYRE_COLS[Math.floor(rng.next() * TYRE_COLS.length)];
      for (let t = 0; t < nT; t++) {
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rng.next() - 0.5) * 0.02, rng.next() * Math.PI * 2, (rng.next() - 0.5) * 0.02));
        const sc = 0.96 + rng.next() * 0.06;
        const jx = (rng.next() - 0.5) * 0.03, jz = (rng.next() - 0.5) * 0.03;
        // each tyre a touch taller than its slot so neighbours overlap (no slivers between them)
        m.compose(new THREE.Vector3(p.x + jx, bottom + t * th - 0.006, p.z + jz), q, new THREE.Vector3(sc, (th + 0.012) / 0.2, sc));
        tyreM.push(m);
        const black = 0.03 + rng.next() * 0.018;
        let c = new THREE.Color(black, black, black * 1.05);
        const topTyre = t === nT - 1;
        if (pat < 0.08) c = TYRE_COLS[(t + stackNo) % 2 === 0 ? 0 : 2].clone(); // red/white striped stack
        else if (pat < 0.2 && topTyre) c = stackCol.clone();
        else if (pat < 0.3 && rng.next() < 0.3) c = TYRE_COLS[Math.floor(rng.next() * TYRE_COLS.length)].clone();
        if (c.r > 0.1 || c.g > 0.1 || c.b > 0.1) c.multiplyScalar(0.8 + rng.next() * 0.2); // faded paint
        tyreC.push(c);
        if (topTyre) {
          topM.push(m);
          topC.push(c);
        }
      }
      stackNo++;
    }
  }

  function buildRunBanners(run: BarrierRun) {
    // walk the run in stretches of one kind, drop banners with gaps between them
    const n = run.segs.length;
    let i = 0;
    while (i < n) {
      const kind = run.segs[i].kind;
      let j = i;
      while (j + 1 < n && run.segs[j + 1].kind === kind) j++;
      const segs = run.segs.slice(i, j + 1);
      const tyres = kind === 'tires';
      const hBan = tyres ? 0.62 : 0.5;
      const y0 = tyres ? 0.3 : 0.4;
      const off = tyres ? 0.365 : 0.2;
      const lenBan = hBan * 8;
      const lens = segs.map((s) => segFrame(s).len);
      const total = lens.reduce((a, b) => a + b, 0);
      let at = 1.5 + rng.next() * 6;
      while (at + lenBan < total - 1) {
        if (rng.next() < (tyres ? 0.5 : 0.42)) {
          const pts: THREE.Vector3[] = [];
          const fac: THREE.Vector3[] = [];
          const steps = Math.max(2, Math.ceil(lenBan / 0.8));
          let side = 1;
          for (let k = 0; k <= steps; k++) {
            let sd = at + (lenBan * k) / steps;
            let si = 0;
            while (si < segs.length - 1 && sd > lens[si]) {
              sd -= lens[si];
              si++;
            }
            const s = segs[si];
            const { d, l } = segFrame(s);
            side = trackSide(site, s);
            const mid = s.a.clone().add(s.b).multiplyScalar(0.5);
            const base = site.track.heightAt(mid.x, mid.z);
            const p = flat(s.a).addScaledVector(d, sd).addScaledVector(l, side * off);
            p.y = base + y0;
            pts.push(p);
            fac.push(l.clone().multiplyScalar(side));
          }
          const id = signPool[Math.floor(rng.next() * signPool.length)];
          polylineSign(signs, id, pts, fac, hBan, side > 0);
          at += lenBan + 0.6 + rng.next() * 7;
        } else at += 3 + rng.next() * 6;
      }
      i = j + 1;
    }
  }

  // ---- jersey mesh ----------------------------------------------------------------------------------------------
  const jgeo = disposer.add(jb.build());
  const scuff = disposer.add(scuffTexture(rng));
  const jmat = new THREE.MeshStandardMaterial({ vertexColors: true, map: scuff, roughness: 0.86, metalness: 0 });
  patchMaterial(jmat, {
    key: 'jersey',
    fragDecl: 'uniform vec3 uConcrete;\n',
    uniforms: { uConcrete: { value: new THREE.Color(0.36, 0.35, 0.33) } },
    fragColor: /* glsl */ `
      {
        // map_fragment multiplied the paint by the scuff texture; redo it with the chip mask
        vec4 sc = texture2D(map, vMapUv);
        vec3 paint = diffuseColor.rgb / max(sc.rgb, vec3(0.02));
        float chip = clamp(1.0 - sc.a, 0.0, 1.0);
        diffuseColor.rgb = mix(paint, uConcrete, chip) * sc.rgb;
        diffuseColor.a = 1.0;
      }
    `,
  });
  disposer.add(jmat);
  const jersey = new THREE.Mesh(jgeo, jmat);
  jersey.name = 'F8JerseyBarriers';
  jersey.receiveShadow = true;
  jersey.castShadow = false;

  // ---- tyres (instanced: tread bands of every tyre + the tops of the stacks) --------------------------------------------
  const segs = quality === 'high' ? 12 : 8;
  // double-sided: through the gaps between tyres (and down the hole) you see dark rubber, not the background
  const tmat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  patchMaterial(tmat, {
    key: 'tyres',
    vertDecl: 'varying vec2 vF8Uv;\n',
    vertBegin: 'vF8Uv = uv;\n',
    fragDecl: 'varying vec2 vF8Uv;\n',
    fragColor: /* glsl */ `
      {
        float body = step(vF8Uv.y, 1.5);
        // tread blocks and a centre groove on the band
        float blocks = step(0.7, fract(vF8Uv.x * 36.0)) + (1.0 - smoothstep(0.03, 0.07, abs(vF8Uv.y - 0.5)));
        diffuseColor.rgb *= 1.0 - 0.42 * body * clamp(blocks, 0.0, 1.0);
        // raised lettering ring on the top sidewall
        float ring = (1.0 - body) * step(2.12, vF8Uv.y) * step(vF8Uv.y, 2.3);
        diffuseColor.rgb += vec3(0.025) * ring * step(0.5, fract(vF8Uv.x * 7.0));
        // dust settles on up-facing rubber
        float up = clamp(vF8Normal.y / max(length(vF8Normal), 1e-4), 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.15, 0.1), 0.1 + 0.32 * up * up);
      }
    `,
  });
  disposer.add(tmat);
  const inst = (geo: THREE.BufferGeometry, ms: THREE.Matrix4[], cs: THREE.Color[], name: string) => {
    disposer.add(geo);
    const mesh = new THREE.InstancedMesh(geo, tmat, Math.max(1, ms.length));
    mesh.name = name;
    ms.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, cs[i]);
    });
    mesh.count = ms.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    disposer.add(mesh);
    return mesh;
  };
  const tyres = inst(tyreBodyGeometry(segs), tyreM, tyreC, 'F8TyreWalls');
  const tyreTops = inst(tyreTopGeometry(segs), topM, topC, 'F8TyreTops');

  return { jersey, tyres, tyreTops, tyreCount: tyreM.length };
}
