/**
 * Scenery for the figure-8 track: a small-town county-fair speedway at golden hour.
 *
 * Sky (low sun, clouds, horizon silhouettes) and a big farmland ground plane; barrier visuals exactly on
 * track.barriers (jersey blocks, tyre walls, sponsor banners); catch fence; the covered main grandstand with
 * the announcer booth and open bleachers with an instanced crowd; people on pickups and hay wagons; a
 * start/finish gantry; a flagman stand at the crossing; light poles with lamps just coming on; an LED
 * scoreboard; hay bales, flags, pennants; pits, parking and concessions; a Ferris wheel out on the fair;
 * farms, trees and power lines; dust in the air.
 *
 * Adds no lights and casts no shadows. Nothing solid sits on the drivable width + shoulders (or on the
 * embankment, or in the loop infields that are kept clear for wrecks). Animated things run on uniforms;
 * the only per-frame CPU work is the Ferris wheel (16 gondola matrices).
 */
import * as THREE from 'three';
import type { Figure8Track } from './track';
import { Disposer, GeoBuilder, MAX_CHEERS, Rng, createSharedUniforms, hashSeed, lin, smoothstep } from '../stadium/util';
import { buildCrowd } from '../stadium/crowd';
import type { Seat } from '../stadium/stands';
import { Site } from './venue/site';
import { buildSky, skyEnvironment, skyHorizonColor } from './venue/sky';
import { buildTerrain } from './venue/terrain';
import { makeNoiseTexture, patchMaterial, type HazeUniforms } from './venue/materials';
import { computeLayout } from './venue/layout';
import { F8_ROTATION, createF8SignAtlas } from './venue/signs';
import { buildBarriers } from './venue/barriers';
import { buildBleachers, buildCatchFence, buildMainStand, fenceStanders, type Builders, type Lamp } from './venue/stands';
import { FlagBuilder, strawTexture } from './venue/flags';
import { buildScoreboardFace } from './venue/scoreboard';
import { buildFarSideTrucks, buildFlagPoles, buildFlagman, buildGantry, buildHayLines, buildLightPoles, buildSafetyCrew, buildScoreboardFrame, type PropCtx } from './venue/props';
import { buildConcessions, buildFair, buildFarm, buildParking, buildPits, buildPowerLine } from './venue/fair';
import { buildTrees, planTrees } from './venue/trees';
import { buildDust } from './venue/dust';

export interface VenueOptions {
  quality?: 'low' | 'high';
  seed?: number;
  /** Extra: sun elevation in degrees (default 7.5, clamped 3..20); the sky, dust and layout follow it. */
  sunElevationDeg?: number;
}

export interface Figure8Venue {
  group: THREE.Group;
  update(dt: number, time: number, excitement: number): void;
  cheer(strength: number, at?: THREE.Vector3): void;
  setScoreboard(lines: string[]): void;
  /** unit vector toward the sun (point the key light along it) */
  sunDirection: THREE.Vector3;
  dispose(): void;
  /** Extra: suggested fog colour (the average horizon colour of the sky). */
  fogColor: THREE.Color;
  /** Extra: suggested colour for the key (sun) light. */
  sunColor: THREE.Color;
  /** Extra: an environment map rendered from this sky (the caller owns / disposes the texture). */
  makeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture;
  /** Extra: light-pole lamp heads (position + aim point), if you want real lights there. */
  floodlights: { position: THREE.Vector3; target: THREE.Vector3 }[];
  crowdCount: number;
}

export function createFigure8Venue(track: Figure8Track, opts: VenueOptions = {}): Figure8Venue {
  const seed = opts.seed ?? 1987;
  const hi = (opts.quality ?? 'high') === 'high';
  const rng = (tag: string) => new Rng(hashSeed(seed, tag));
  const disposer = new Disposer();
  const shared = createSharedUniforms();
  const site = new Site(track);
  const group = new THREE.Group();
  group.name = 'Figure8Venue';

  // ---- sun, sky, haze ------------------------------------------------------------------------------------------
  const sunEl = THREE.MathUtils.degToRad(Math.min(20, Math.max(3, Number.isFinite(opts.sunElevationDeg) ? (opts.sunElevationDeg as number) : 7.5)));
  const sunH = new THREE.Vector2(-0.75, 0.66).normalize();
  const sunDirection = new THREE.Vector3(sunH.x * Math.cos(sunEl), Math.sin(sunEl), sunH.y * Math.cos(sunEl)).normalize();
  const sky = buildSky(sunDirection, seed, 0.55, disposer);
  const haze: HazeUniforms = { uSunDir: sky.uniforms.uSunDir, uHaze: { value: new THREE.Vector3(80, 1 / 1500, 0.92) } };
  const windAngle = Math.atan2(sunH.y, sunH.x) + Math.PI + (rng('wind').next() - 0.5) * 0.8; // blowing roughly away from the sun
  const wind = new THREE.Vector3(Math.cos(windAngle), 0, Math.sin(windAngle));

  const noiseRng = rng('noise');
  const noiseTex = disposer.add(makeNoiseTexture(() => noiseRng.next(), 256, 5));
  const L = computeLayout(site, sunDirection);

  // ---- shared builders -----------------------------------------------------------------------------------------
  const B: Builders = {
    matte: new GeoBuilder(),
    metal: new GeoBuilder(),
    paint: new GeoBuilder(),
    lamps: new GeoBuilder(),
    signs: new GeoBuilder(),
    glow: new GeoBuilder(),
  };
  const far = new GeoBuilder();
  const hay = new GeoBuilder();
  const flags = new FlagBuilder();
  const seats: Seat[] = [];
  const lamps: Lamp[] = [];
  const floodlights: { position: THREE.Vector3; target: THREE.Vector3 }[] = [];
  const v = { b: B.paint, lamps: B.lamps };
  const signPool = F8_ROTATION;

  // ---- barriers ----------------------------------------------------------------------------------------------------
  const barriers = buildBarriers(site, rng('barriers'), B.signs, signPool, hi ? 'high' : 'low', disposer);

  // ---- stands, fence, crowd seats ---------------------------------------------------------------------------------
  const fence = buildCatchFence(L, B, rng('fence'), signPool, disposer);
  const main = buildMainStand(L.main, B, rng('main'), 0, seats, signPool, lamps);
  L.sideStands.forEach((s, i) => buildBleachers(s, B, rng(`side${i}`), 1 + i, seats));
  L.farStands.forEach((s, i) => buildBleachers(s, B, rng(`far${i}`), 3 + i, seats));
  fenceStanders(L, rng('standers'), seats, hi ? 26 : 12);

  // ---- props --------------------------------------------------------------------------------------------------------
  const ctx: PropCtx = { site, L, B, hay, flags, seats, lamps, wind, hi };
  buildGantry(ctx);
  buildFlagman(ctx, rng('flagman'));
  buildLightPoles(ctx, rng('poles'), floodlights);
  const board = buildScoreboardFace(128, 48, 0.1, disposer);
  const boardFrame = buildScoreboardFrame(ctx, board.width, board.height);
  board.mesh.position.copy(boardFrame.center);
  board.mesh.rotation.y = boardFrame.yaw;
  buildFarSideTrucks(ctx, v, rng('trucks'));
  buildSafetyCrew(ctx, v, rng('crew'));
  buildHayLines(ctx, rng('hay'));
  buildFlagPoles(ctx, rng('flags'), main.flagPoles);
  {
    // pennant strings along the top rails of the long sides
    const ropeCol = lin(0x303030);
    fence.railRuns.slice(0, 2).forEach(([a, b], i) => {
      const n = 10;
      for (let k = 0; k < n; k++) flags.pennants(a.clone().lerp(b, k / n), a.clone().lerp(b, (k + 1) / n), 0.35, 0.55, B.metal, ropeCol, i * 3 + k);
    });
  }

  // ---- beyond the fence: pits, parking, concessions, the fair, farms, power lines, trees --------------------------
  buildPits(L, B, v, seats, lamps, rng('pits'), hi);
  buildParking(L, v, rng('parking'), hi);
  buildConcessions(L, B, v, seats, lamps, rng('concessions'));
  const ferris = buildFair(L, far, B.lamps, lamps, rng('fair'));
  buildFarm(far, new THREE.Vector3(265, 0, -175), 0.35, rng('farm1'));
  buildFarm(far, new THREE.Vector3(-250, 0, -265), -0.6, rng('farm2'));
  buildPowerLine(far, [new THREE.Vector3(-420, 0, -148), new THREE.Vector3(420, 0, -148)], 46);
  buildPowerLine(far, [new THREE.Vector3(158, 0, -148), new THREE.Vector3(158, 0, 330)], 46);
  const sunAz = Math.atan2(sunH.y, sunH.x);
  const trees = buildTrees(
    planTrees(
      rng('trees'),
      (x, z) => {
        const windbreak = (z > 80 && z < 102 && x > -60 && x < 120) || (x > 166 && x < 186 && Math.abs(z) < 80);
        if (!windbreak && Math.abs(x) < 165 && Math.abs(z) < 105) return true; // venue, pits
        if (z < -55 && z > -140 && Math.abs(x) < 120) return true; // parking
        if (Math.hypot(x - L.ferris.x, z - L.ferris.z) < 75) return true; // the fair
        if (Math.hypot(x - 265, z + 175) < 38 || Math.hypot(x + 250, z + 265) < 38) return true; // farm yards
        if (Math.abs(z + 148) < 6 || Math.abs(x - 158) < 6) return true; // roads
        const r = Math.hypot(x, z);
        const da = Math.abs(Math.atan2(Math.sin(Math.atan2(z, x) - sunAz), Math.cos(Math.atan2(z, x) - sunAz)));
        return r < 290 && da < 0.2; // keep the view to the Ferris wheel open
      },
      hi,
    ),
    rng('treeInst'),
    shared,
    haze,
    disposer,
  );

  // ---- ground (painted with the lots / walkways laid out above) -----------------------------------------------------
  const terrain = buildTerrain(
    site,
    rng('terrain'),
    haze,
    (g, r) => paintGround(g, r, L),
    noiseTex,
    hi ? 'high' : 'low',
    disposer,
  );

  // ---- crowd -----------------------------------------------------------------------------------------------------------
  const crowd = buildCrowd(seats, hi ? 3300 : 1200, hi ? 260 : 90, rng('crowd'), shared, disposer);
  disposer.add(crowd.mesh);

  // ---- materials + meshes from the builders ---------------------------------------------------------------------------
  const mk = (b: GeoBuilder, mat: THREE.Material, name: string, receive = true): THREE.Mesh => {
    const geo = disposer.add(b.build());
    disposer.add(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = receive;
    return mesh;
  };
  const matte = mk(B.matte, patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }), { key: 'matte', noise: { tex: noiseTex, scale: 0.35, amount: 0.22 } }), 'F8Structures');
  const metal = mk(B.metal, patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3, envMapIntensity: 0.7 }), { key: 'metal', noise: { tex: noiseTex, scale: 0.6, amount: 0.12 } }), 'F8Metal');
  const paint = mk(B.paint, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }), 'F8Vehicles');
  const farMesh = mk(far, patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.15 }), { key: 'far', haze, noise: { tex: noiseTex, scale: 0.2, amount: 0.15 } }), 'F8Farstructures', false);
  const lampMesh = mk(B.lamps, new THREE.MeshBasicMaterial({ vertexColors: true }), 'F8Lamps', false);
  const atlas = disposer.add(createF8SignAtlas());
  const signMat = new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.06, roughness: 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const signMesh = mk(B.signs, signMat, 'F8SponsorBoards');
  const glowMesh = mk(B.glow, new THREE.MeshBasicMaterial({ map: atlas, color: new THREE.Color(1.12, 1.12, 1.12), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 'F8LitSigns', false);
  const strawRng = rng('straw');
  const straw = disposer.add(strawTexture(() => strawRng.next()));
  const hayMesh = mk(hay, new THREE.MeshStandardMaterial({ map: straw, vertexColors: true, roughness: 0.95, metalness: 0 }), 'F8HayBales');
  const flagEnergy = { value: 0.3 };
  const flagMesh = flags.build(shared, flagEnergy, disposer);

  // Ferris wheel (rotating) + gondolas
  const wheelMetal = mk(ferris.metal, patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 }), { key: 'wheel', haze }), 'F8FerrisWheel', false);
  const wheelLamps = mk(ferris.lamps, new THREE.MeshBasicMaterial({ vertexColors: true }), 'F8FerrisLights', false);
  ferris.group.add(wheelMetal, wheelLamps);
  const baseQ = ferris.group.quaternion.clone();
  const gondolaGeo = (() => {
    const gb = new GeoBuilder();
    gb.box(new THREE.Matrix4(), [-0.8, -2.0, -0.7], [0.8, -0.6, 0.7], [1, 1, 1], []);
    gb.box(new THREE.Matrix4(), [-0.95, -0.62, -0.85], [0.95, -0.45, 0.85], [0.9, 0.9, 0.9], []);
    gb.beam(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, 0, 0), 0.08, [0.8, 0.8, 0.8]);
    return disposer.add(gb.build());
  })();
  const gondolaMat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }), { key: 'gondola', haze });
  disposer.add(gondolaMat);
  const gondolas = new THREE.InstancedMesh(gondolaGeo, gondolaMat, ferris.gondolaPivots.length);
  gondolas.name = 'F8FerrisGondolas';
  {
    const cols = [0xc8241c, 0xf2c61f, 0x1f47a8, 0x2e8a44].map((h) => new THREE.Color(h));
    ferris.gondolaPivots.forEach((_, i) => gondolas.setColorAt(i, cols[i % cols.length]));
    if (gondolas.instanceColor) gondolas.instanceColor.needsUpdate = true;
  }
  gondolas.frustumCulled = false;
  disposer.add(gondolas);
  let wheelAngle = rng('wheel').next() * Math.PI * 2;
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _rz = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const gondolaYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(ferris.axis.x, ferris.axis.z));
  const one = new THREE.Vector3(1, 1, 1);
  const placeWheel = () => {
    _rz.setFromAxisAngle(zAxis, wheelAngle);
    ferris.group.quaternion.copy(baseQ).multiply(_rz);
    ferris.group.updateMatrix();
    ferris.gondolaPivots.forEach((pv, i) => {
      _p.copy(pv).applyQuaternion(ferris.group.quaternion).add(ferris.hub);
      _q.copy(gondolaYaw);
      _m.compose(_p, _q, one);
      gondolas.setMatrixAt(i, _m);
    });
    gondolas.instanceMatrix.needsUpdate = true;
  };
  placeWheel();

  // dust & lamp glows
  const b = site.bounds;
  const dust = buildDust({ minX: b.minX - 20, maxX: b.maxX + 20, minZ: b.minZ - 12, maxZ: b.maxZ + 12 }, lamps, sunDirection, wind, shared, rng('dust'), hi, disposer);

  group.add(
    sky.mesh,
    terrain.mesh,
    barriers.jersey,
    barriers.tyres,
    barriers.tyreTops,
    matte,
    metal,
    paint,
    farMesh,
    hayMesh,
    signMesh,
    glowMesh,
    lampMesh,
    board.mesh,
    flagMesh,
    crowd.mesh,
    fence.mesh,
    ferris.group,
    gondolas,
    ...trees,
    dust.haze,
    dust.motes,
    dust.glows,
    crowd.flashes,
  );
  board.setLines(['TRI-COUNTY', 'FIGURE 8', 'TONIGHT']);

  // ---- suggested fog colour: average horizon colour all round -------------------------------------------------------
  const fogColor = new THREE.Color(0, 0, 0);
  {
    const c = new THREE.Color();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      skyHorizonColor(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), sunDirection, c);
      fogColor.r += c.r / 16;
      fogColor.g += c.g / 16;
      fogColor.b += c.b / 16;
    }
  }

  // ---- runtime --------------------------------------------------------------------------------------------------------
  let t = 0;
  let ex = 0;
  let waveAmp = 0;
  let cheerIdx = 0;
  let flagBoost = 0;
  const TWRAP = 3600;

  const update = (dt: number, _time: number, excitement: number) => {
    const d = Math.min(Math.max(Number.isFinite(dt) ? dt : 0, 0), 0.1);
    t += d;
    if (t > TWRAP) {
      t -= TWRAP;
      for (const c of shared.uCheer.value) c.z -= TWRAP;
    }
    const target = Math.min(1, Math.max(0, Number.isFinite(excitement) ? excitement : 0));
    ex += (target - ex) * (1 - Math.exp(-d * 1.8));
    shared.uTime.value = t;
    shared.uExcite.value = ex;
    const wt = smoothstep(0.4, 0.6, ex) * (1 - 0.6 * smoothstep(0.85, 1.0, ex));
    waveAmp += (wt - waveAmp) * (1 - Math.exp(-d * 0.7));
    shared.uWaveAmp.value = waveAmp;
    shared.uWaveAng.value = (shared.uWaveAng.value + d * 0.45) % (Math.PI * 2);
    flagBoost = Math.max(0, flagBoost - d * 0.25);
    flagEnergy.value = Math.min(1, 0.3 + 0.55 * ex + flagBoost);
    board.update(d, ex);
    sky.update(t);
    wheelAngle = (wheelAngle + d * 0.07) % (Math.PI * 2);
    placeWheel();
  };

  const cheer = (strength: number, at?: THREE.Vector3) => {
    const s = Math.min(2, Math.max(0, Number.isFinite(strength) ? strength : 0));
    cheerIdx = (cheerIdx + 1) % MAX_CHEERS;
    const ok = at && Number.isFinite(at.x) && Number.isFinite(at.z);
    shared.uCheer.value[cheerIdx].set(ok ? at!.x : 0, ok ? at!.z : 0, t, s);
    shared.uCheerR.value[cheerIdx] = ok ? 58 : 1e5;
    board.flash(s);
    flagBoost = Math.max(flagBoost, s * 0.35);
  };

  return {
    group,
    update,
    cheer,
    setScoreboard: (lines: string[]) => board.setLines(Array.isArray(lines) ? lines : []),
    sunDirection: sunDirection.clone(),
    fogColor,
    sunColor: new THREE.Color(1.0, 0.7, 0.44),
    makeEnvironment: (renderer: THREE.WebGLRenderer) => skyEnvironment(renderer, sky),
    floodlights,
    crowdCount: crowd.count,
    dispose: () => {
      group.removeFromParent();
      group.clear();
      ferris.group.clear();
      disposer.dispose();
    },
  };
}

/** Ground map paint (world metres, x right / z down on the canvas). */
function paintGround(g: CanvasRenderingContext2D, rng: Rng, L: ReturnType<typeof computeLayout>) {
  const f = L.fence;
  const worn = (x0: number, z0: number, x1: number, z1: number, base: string, blot: [number, number, number], n: number) => {
    g.fillStyle = base;
    g.fillRect(x0, z0, x1 - x0, z1 - z0);
    for (let i = 0; i < n; i++) {
      const x = x0 + rng.next() * (x1 - x0), z = z0 + rng.next() * (z1 - z0), r = 0.4 + rng.next() * rng.next() * 4;
      const k = 0.8 + rng.next() * 0.4;
      g.fillStyle = `rgba(${Math.round(blot[0] * k)},${Math.round(blot[1] * k)},${Math.round(blot[2] * k)},${0.15 + rng.next() * 0.3})`;
      g.beginPath();
      g.ellipse(x, z, r, r * (0.4 + rng.next()), rng.next() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  };
  // trampled dirt walkways all round the fence and under the stands
  worn(f.minX - 12, f.minZ - 20, f.maxX + 12, f.minZ + 0.5, '#8a7152', [120, 100, 72], 900);
  worn(f.minX - 12, f.maxZ - 0.5, f.maxX + 12, f.maxZ + 16, '#8d7657', [118, 102, 74], 700);
  worn(f.minX - 26, f.minZ - 2, f.minX + 0.5, f.maxZ + 2, '#8a7050', [115, 96, 70], 500);
  worn(f.maxX - 0.5, f.minZ - 2, f.maxX + 6, f.maxZ + 2, '#8a7050', [115, 96, 70], 200);
  // pits: gravel
  const P = L.pits;
  worn(P.minX - 6, P.minZ - 4, P.maxX + 4, P.maxZ + 4, '#8c877b', [110, 104, 92], 1500);
  g.fillStyle = 'rgba(96,86,70,0.5)';
  g.fillRect(f.maxX, L.pitGateZ - 4, P.maxX + 300 - f.maxX, 8);
  // parking: worn grass with dirt lanes
  const K = L.parking;
  worn(K.minX - 4, K.minZ - 4, K.maxX + 4, K.maxZ + 4, '#88814a', [140, 122, 80], 1600);
  for (let z = K.maxZ - 10.5; z > K.minZ; z -= 13) {
    g.fillStyle = 'rgba(120,98,70,0.55)';
    g.fillRect(K.minX, z - 2.2, K.maxX - K.minX, 4.4);
  }
  // roads (gravel)
  g.fillStyle = 'rgba(128,116,96,0.9)';
  g.fillRect(-4, K.minZ - 4, 8, -400);
  g.fillRect(-420, -152, 840, 8);
  g.fillRect(154, -152, 8, 500);
  // the fairground toward the sun
  g.save();
  const fg = g.createRadialGradient(L.ferris.x, L.ferris.z, 5, L.ferris.x, L.ferris.z, 75);
  fg.addColorStop(0, 'rgba(146,126,88,0.55)');
  fg.addColorStop(0.6, 'rgba(146,126,88,0.3)');
  fg.addColorStop(1, 'rgba(146,126,88,0)');
  g.fillStyle = fg;
  g.fillRect(L.ferris.x - 80, L.ferris.z - 80, 160, 160);
  g.restore();
  g.strokeStyle = 'rgba(130,110,80,0.6)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(f.minX - 18, 0);
  g.quadraticCurveTo(L.ferris.x * 0.5, L.ferris.z * 0.2, L.ferris.x, L.ferris.z);
  g.stroke();
  // farm yards
  for (const [x, z] of [[265, -175], [-250, -265]]) {
    g.fillStyle = 'rgba(120,100,70,0.6)';
    g.beginPath();
    g.ellipse(x, z, 34, 26, 0.4, 0, Math.PI * 2);
    g.fill();
  }
}
