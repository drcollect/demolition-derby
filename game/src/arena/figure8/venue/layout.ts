import * as THREE from 'three';
import type { Site } from './site';

/*
 The venue plan, derived from the track bounds (x = +-74, z = +-42 for the default track):
 - catch fence on the bounds (the physics perimeter walls sit just outside it);
 - -z side: the covered main grandstand (facing +z), open bleachers either side of it;
 - +z side: open bleacher sections with pickups / hay wagons in the gaps and the scoreboard in the middle;
 - +x end: the pits; -x end: concessions, and the fair (Ferris wheel) further out toward the sun;
 - parking behind the main grandstand.
*/

export interface StandSpec {
  /** centre of the front edge at ground level */
  cx: number;
  frontZ: number;
  /** +1: the stand faces +z (it is on the -z side); -1: faces -z */
  face: 1 | -1;
  length: number;
  rows: number;
  depth: number;
  rise: number;
  firstY: number;
  aisles: number[];
}

export interface Layout {
  fence: { minX: number; maxX: number; minZ: number; maxZ: number };
  main: StandSpec;
  sideStands: StandSpec[];
  farStands: StandSpec[];
  /** gaps on the +z side for trucks / hay wagons (x centre, width) */
  farGaps: { cx: number; width: number }[];
  scoreboard: { x: number; z: number; bottom: number };
  pits: { minX: number; maxX: number; minZ: number; maxZ: number };
  pitGateZ: number;
  concessions: { x: number; z0: number; z1: number };
  parking: { minX: number; maxX: number; minZ: number; maxZ: number };
  ferris: THREE.Vector3;
}

export function computeLayout(site: Site, sunDir: THREE.Vector3): Layout {
  const b = site.bounds;
  const fence = { minX: b.minX - 0.03, maxX: b.maxX + 0.03, minZ: b.minZ - 0.03, maxZ: b.maxZ + 0.03 };
  const main: StandSpec = { cx: 0, frontZ: fence.minZ - 3.6, face: 1, length: 88, rows: 14, depth: 0.8, rise: 0.38, firstY: 1.5, aisles: [-22, 0, 22] };
  const sideLen = Math.max(8, (b.maxX - b.minX) / 2 - main.length / 2 - 5);
  const sideStands: StandSpec[] = [-1, 1].map((sx) => ({
    cx: sx * (main.length / 2 + 3 + sideLen / 2),
    frontZ: fence.minZ - 3.2,
    face: 1 as const,
    length: sideLen,
    rows: 9,
    depth: 0.72,
    rise: 0.32,
    firstY: 0.45,
    aisles: [],
  }));
  const farDefs: [number, number][] = [
    [-54, 28],
    [-22, 20],
    [22, 20],
    [54, 28],
  ];
  const farStands: StandSpec[] = farDefs.map(([cx, len]) => ({ cx, frontZ: fence.maxZ + 3.2, face: -1 as const, length: len, rows: 9, depth: 0.72, rise: 0.32, firstY: 0.45, aisles: len > 24 ? [0] : [] }));
  const farGaps = [
    { cx: -36, width: 8 },
    { cx: 0, width: 24 },
    { cx: 36, width: 8 },
  ];
  // Ferris wheel: out on the fairground toward the low sun, so it stands against the sunset
  const sh = new THREE.Vector2(sunDir.x, sunDir.z).normalize();
  const ferris = new THREE.Vector3(sh.x * 205, 0, sh.y * 205);
  const mainBack = main.frontZ - main.rows * main.depth;
  return {
    fence,
    main,
    sideStands,
    farStands,
    farGaps,
    scoreboard: { x: 0, z: fence.maxZ + 12.5, bottom: 7.2 },
    pits: { minX: fence.maxX + 6, maxX: fence.maxX + 62, minZ: -46, maxZ: 46 },
    pitGateZ: -18,
    concessions: { x: fence.minX - 9, z0: -26, z1: 26 },
    parking: { minX: -105, maxX: 105, minZ: mainBack - 72, maxZ: mainBack - 14 },
    ferris,
  };
}
