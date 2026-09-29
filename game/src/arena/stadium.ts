/**
 * Stadium dressing for "the Bowl": grandstands + crowd, catch fence, sponsor boards, floodlight towers
 * (lamp banks, fake volumetric cones, dust), dot-matrix scoreboard, flags, parking lot and night sky.
 *
 * Adds no lights. Every animated thing is driven by uniforms from update(); no per-frame CPU loops.
 */
import * as THREE from 'three';
import { computeLayout, gapCutAngle, type Layout } from './stadium/layout';
import { buildStands } from './stadium/stands';
import { buildCrowd } from './stadium/crowd';
import { ROTATION, Sign, createSignAtlas, curvedPanel, flatPanel } from './stadium/signage';
import { buildFence } from './stadium/fence';
import { buildLights } from './stadium/lights';
import { buildScoreboard } from './stadium/scoreboard';
import { buildSky } from './stadium/sky';
import { buildFlags } from './stadium/flags';
import { buildGround, noiseTexture } from './stadium/ground';
import { Disposer, GeoBuilder, MAX_CHEERS, Rng, createSharedUniforms, hashSeed, smoothstep } from './stadium/util';

export interface StadiumOptions {
  wallRadius?: number; // default 36   (inner face of the wall)
  wallThickness?: number; // default 0.6
  wallBaseY?: number; // default 1.4  (top of the bank where the wall starts)
  wallTopY?: number; // default 2.7
  quality?: 'low' | 'high'; // default 'high' (crowd density, star count)
  seed?: number;
  /** Extra: angle (radians, atan2(z, x)) of the pit gate / gap in the stands. Default +Z (PI/2). */
  gateAngle?: number;
  /** Extra: direction towards the moon (for matching a moonlight DirectionalLight). */
  moonDirection?: THREE.Vector3;
}

export interface StadiumFloodlight {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** Extras: suggested SpotLight angle/penumbra/colour matching the visual beam. */
  angle: number;
  penumbra: number;
  color: THREE.Color;
}

export interface Stadium {
  group: THREE.Group;
  update(dt: number, time: number, excitement: number): void;
  cheer(strength: number, at?: THREE.Vector3): void;
  setScoreboard(lines: string[]): void;
  floodlights: StadiumFloodlight[];
  dispose(): void;
  /** Extras for integration. */
  fence: { radius: number; meshRadius: number; bottomY: number; topY: number; lipInset: number; lipTopY: number };
  moonDirection: THREE.Vector3;
  crowdCount: number;
  layout: Layout;
}

export function createStadium(opts: StadiumOptions = {}): Stadium {
  const seed = opts.seed ?? 1977;
  const quality = opts.quality ?? 'high';
  const hi = quality === 'high';
  const L = computeLayout({
    wallRadius: opts.wallRadius ?? 36,
    wallThickness: opts.wallThickness ?? 0.6,
    wallBaseY: opts.wallBaseY ?? 1.4,
    wallTopY: opts.wallTopY ?? 2.7,
    gateAngle: opts.gateAngle ?? Math.PI / 2,
  });
  const rng = (tag: string) => new Rng(hashSeed(seed, tag));
  const disposer = new Disposer();
  const shared = createSharedUniforms();
  const group = new THREE.Group();
  group.name = 'Stadium';

  const standsB = new GeoBuilder();
  const metalB = new GeoBuilder();
  const lampsB = new GeoBuilder();
  const signLitB = new GeoBuilder();
  const signGlowB = new GeoBuilder();

  // ---- structure -----------------------------------------------------------------------------
  const stands = buildStands(L, rng('stands'), standsB, metalB);
  const fence = buildFence(L, metalB, disposer);
  const lights = buildLights(L, metalB, lampsB, rng('lights'), shared, hi ? 2600 : 900, disposer);
  const board = buildScoreboard(L, metalB, signGlowB, lampsB, disposer);
  const windAngle = rng('wind').range(0, Math.PI * 2);
  const flags = buildFlags(L, rng('flags'), metalB, shared, windAngle, disposer);
  const concreteTex = disposer.add(noiseTexture(rng('concrete'), 256, 0.8, 1.0));
  const groundTex = disposer.add(noiseTexture(rng('groundtex'), 256, 0.62, 1.0));
  const ground = buildGround(L, rng('ground'), metalB, lampsB, groundTex, hi ? 1 : 0.35, disposer);

  // ---- signage ---------------------------------------------------------------------------------
  const srng = rng('signs');
  const seq: Sign[] = srng.shuffle(ROTATION.slice());
  let seqI = 0;
  const nextSign = (): Sign => {
    const s = seq[seqI % seq.length];
    seqI++;
    return s;
  };
  {
    // wall boards (1 cm proud of the inner face)
    const r = L.wallR - 0.01;
    const y0 = L.baseY + 0.12;
    const y1 = L.topY - 0.12;
    const bh = y1 - y0;
    const bw = bh * 8;
    const gateHalf = (bw * 0.5) / r;
    curvedPanel(signLitB, Sign.PitGate, L.gateAngle - gateHalf, L.gateAngle + gateHalf, r, y0, y1, 8);
    const gap = 0.45;
    const a0 = L.gateAngle + gateHalf + gap / r;
    const a1 = L.gateAngle + Math.PI * 2 - gateHalf - gap / r;
    const n = Math.floor(((a1 - a0) * r + gap) / (bw + gap));
    const slack = ((a1 - a0) * r - n * bw) / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
      const s = a0 + (i * (bw + slack)) / r;
      curvedPanel(signLitB, nextSign(), s, s + bw / r, r, y0, y1, 8);
    }
    // fascia banners along the upper-tier front wall
    const fr = L.crossR1 - 0.02;
    const fy1 = L.upperFrontTopY - 0.26;
    const fy0 = fy1 - 1.0;
    const fw = 8.0;
    const fa0 = gapCutAngle(L, fr, 1) + 1.2 / fr;
    const fa1 = gapCutAngle(L, fr, -1) - 1.2 / fr;
    const fn = Math.floor(((fa1 - fa0) * fr) / (fw + 2.0));
    const fslack = ((fa1 - fa0) * fr - fn * fw) / Math.max(1, fn - 1);
    seqI += 5;
    for (let i = 0; i < fn; i++) {
      const s = fa0 + (i * (fw + fslack)) / fr;
      const id = i % 5 === 2 ? Sign.DerbyTonight : i % 9 === 6 ? Sign.WelcomeFans : nextSign();
      curvedPanel(signLitB, id, s, s + fw / fr, fr, fy0, fy1, 8);
    }
    // backlit sign on the footbridge over the pit gap
    const G = L.gateAngle;
    const g = new THREE.Vector3(Math.cos(G), 0, Math.sin(G));
    const t = new THREE.Vector3(-Math.sin(G), 0, Math.cos(G));
    const s0 = Math.sqrt(L.crossR0 * L.crossR0 - L.gateHalfWidth * L.gateHalfWidth) - 0.2;
    const c = g.clone().multiplyScalar(s0 - 0.02).setY(L.crossY + 0.2);
    flatPanel(signGlowB, Sign.PitEntry, c, t, new THREE.Vector3(0, 1, 0), 8.8, 1.1);
    // tunnel lamp under the bridge
    const lc = g.clone().multiplyScalar(s0 + 0.6).setY(L.crossY - 1.12);
    const lampCol: [number, number, number] = [5, 3.6, 2.2];
    lampsB.quad(
      lc.clone().addScaledVector(t, -1.2).addScaledVector(g, -0.2),
      lc.clone().addScaledVector(t, 1.2).addScaledVector(g, -0.2),
      lc.clone().addScaledVector(t, 1.2).addScaledVector(g, 0.2),
      lc.clone().addScaledVector(t, -1.2).addScaledVector(g, 0.2),
      lampCol,
      new THREE.Vector3(0, -1, 0),
    );
  }
  {
    // outer facade: entrance portals + wall lamps (seen from high / outside cameras)
    const r = L.facadeR + 0.03;
    const n = Math.floor(((L.standA1 - L.standA0) * r) / 9);
    const dark: [number, number, number] = [0.02, 0.02, 0.022];
    const lamp: [number, number, number] = [6, 3.8, 1.9];
    for (let i = 0; i < n; i++) {
      const a = L.standA0 + ((i + 0.5) * (L.standA1 - L.standA0)) / n;
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const tan = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const c = out.clone().multiplyScalar(r);
      const q = (cx: THREE.Vector3, w: number, y0: number, y1: number, col: [number, number, number], b: GeoBuilder) =>
        b.quad(
          cx.clone().addScaledVector(tan, -w / 2).setY(y0),
          cx.clone().addScaledVector(tan, w / 2).setY(y0),
          cx.clone().addScaledVector(tan, w / 2).setY(y1),
          cx.clone().addScaledVector(tan, -w / 2).setY(y1),
          col,
          out,
        );
      if (i % 2 === 0) q(c, 3.0, 0.02, 3.2, dark, standsB);
      q(c.clone().addScaledVector(out, 0.02), 0.7, 3.7, 4.0, lamp, lampsB);
    }
  }
  const atlas = disposer.add(createSignAtlas());

  // ---- crowd -----------------------------------------------------------------------------------
  const crowd = buildCrowd(stands.seats, hi ? 6400 : 2100, hi ? 420 : 150, rng('crowd'), shared, disposer);
  // InstancedMesh.dispose() frees the per-instance GPU buffers
  disposer.add(crowd.mesh);
  disposer.add(ground.cars);

  // ---- sky -------------------------------------------------------------------------------------
  const moonDir =
    opts.moonDirection?.clone().normalize() ??
    new THREE.Vector3(Math.cos(L.gateAngle + 2.3) * Math.cos(0.52), Math.sin(0.52), Math.sin(L.gateAngle + 2.3) * Math.cos(0.52));
  const townAz = L.gateAngle - 0.95;
  const townDir = new THREE.Vector3(Math.cos(townAz), 0, Math.sin(townAz));
  const sky = buildSky(moonDir, townDir, hi ? 1 : 0.55, disposer);

  // ---- meshes from the shared builders -------------------------------------------------------------
  const mk = (b: GeoBuilder, mat: THREE.Material, name: string, receive = false): THREE.Mesh => {
    const geo = disposer.add(b.build());
    disposer.add(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = receive;
    return mesh;
  };
  const standsMesh = mk(standsB, new THREE.MeshStandardMaterial({ vertexColors: true, map: concreteTex, roughness: 0.93, metalness: 0 }), 'StadiumStands', true);
  const metalMesh = mk(metalB, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 }), 'StadiumMetal');
  const lampsMesh = mk(lampsB, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), 'StadiumLamps');
  const signLitMat = new THREE.MeshStandardMaterial({
    map: atlas,
    emissiveMap: atlas,
    emissive: new THREE.Color(1, 1, 1),
    emissiveIntensity: 0.16,
    roughness: 0.55,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const signLitMesh = mk(signLitB, signLitMat, 'StadiumSponsorBoards', true);
  const signGlowMesh = mk(signGlowB, new THREE.MeshBasicMaterial({ map: atlas, color: new THREE.Color(1.35, 1.35, 1.35), fog: false }), 'StadiumLitSigns');

  group.add(
    sky.mesh,
    ground.ground,
    ground.cars,
    standsMesh,
    metalMesh,
    signLitMesh,
    signGlowMesh,
    lampsMesh,
    board.screen,
    flags.mesh,
    crowd.mesh,
    fence.mesh,
    lights.cones,
    lights.dust,
    crowd.flashes,
  );

  board.setLines(['THE BOWL', 'DEMOLITION', 'DERBY']);

  // ---- runtime ---------------------------------------------------------------------------------------
  let t = 0;
  let ex = 0;
  let waveAmp = 0;
  let cheerIdx = 0;
  let flagBoost = 0;
  const TWRAP = 3600;

  const update = (dt: number, _time: number, excitement: number) => {
    const d = Math.min(Math.max(dt, 0), 0.1);
    t += d;
    if (t > TWRAP) {
      t -= TWRAP;
      for (const c of shared.uCheer.value) c.z -= TWRAP;
    }
    const target = Math.min(1, Math.max(0, excitement));
    ex += (target - ex) * (1 - Math.exp(-d * 1.8));
    shared.uTime.value = t;
    shared.uExcite.value = ex;
    // Mexican wave: rolls round at moderate-to-high excitement (a real crowd does it in the lulls)
    const wt = smoothstep(0.4, 0.6, ex) * (1 - 0.6 * smoothstep(0.85, 1.0, ex));
    waveAmp += (wt - waveAmp) * (1 - Math.exp(-d * 0.7));
    shared.uWaveAmp.value = waveAmp;
    shared.uWaveAng.value = (shared.uWaveAng.value + d * 0.45) % (Math.PI * 2);
    flagBoost = Math.max(0, flagBoost - d * 0.25);
    flags.uniforms.uFlagEnergy.value = Math.min(1, 0.22 + 0.62 * ex + flagBoost);
    board.update(d, ex);
    sky.update(t);
  };

  const cheer = (strength: number, at?: THREE.Vector3) => {
    const s = Math.min(2, Math.max(0, strength));
    cheerIdx = (cheerIdx + 1) % MAX_CHEERS;
    shared.uCheer.value[cheerIdx].set(at ? at.x : 0, at ? at.z : 0, t, s);
    shared.uCheerR.value[cheerIdx] = at ? 26 : 1e5;
    board.flash(s);
    flagBoost = Math.max(flagBoost, s * 0.35);
  };

  return {
    group,
    update,
    cheer,
    setScoreboard: (lines: string[]) => board.setLines(lines),
    floodlights: lights.floodlights,
    dispose: () => {
      group.removeFromParent();
      group.clear();
      disposer.dispose();
    },
    fence: {
      radius: L.fenceR,
      meshRadius: L.fenceMeshR,
      bottomY: L.topY,
      topY: L.fenceTopY,
      lipInset: 0.55,
      lipTopY: L.fenceTopY + 0.42,
    },
    moonDirection: moonDir.clone(),
    crowdCount: crowd.count,
    layout: L,
  };
}
