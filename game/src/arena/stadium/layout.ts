/**
 * All stadium dimensions, derived from the wall options. Angles are measured from +X towards +Z
 * (a = atan2(z, x)); y is up; metres.
 */
export interface StandRow {
  tier: 0 | 1;
  index: number; // row index within tier
  rFront: number;
  rBack: number;
  y: number; // foot level (front half of the step)
  depth: number;
  rise: number;
}

export interface Layout {
  wallR: number;
  wallT: number;
  baseY: number;
  topY: number;
  outerR: number;
  fenceR: number;
  fenceMeshR: number;
  fenceTopY: number;
  apronR0: number;
  apronR1: number;
  apronY: number;
  lowerFrontY: number;
  rows: StandRow[];
  crossR0: number;
  crossR1: number;
  crossY: number;
  upperFrontTopY: number;
  backR: number;
  backTopY: number;
  facadeR: number;
  gateAngle: number;
  gateHalfWidth: number;
  scoreboardAngle: number;
  towerAngles: number[];
  towerR: number;
  lampY: number;
  /** Angles of the aisle centres (between seating sections). */
  aisles: number[];
  aisleHalfAngle: number;
  /** Angular start/end of the stands (at the minimum radius); the gap is outside [standA0, standA1]. */
  standA0: number;
  standA1: number;
}

export interface LayoutInput {
  wallRadius: number;
  wallThickness: number;
  wallBaseY: number;
  wallTopY: number;
  gateAngle: number;
}

export function computeLayout(o: LayoutInput): Layout {
  const wallR = o.wallRadius;
  const wallT = o.wallThickness;
  const baseY = o.wallBaseY;
  const topY = o.wallTopY;
  const outerR = wallR + wallT;

  const apronR0 = outerR - 0.05;
  const apronR1 = outerR + 1.25;
  const apronY = topY - 0.02;
  const lowerFrontY = topY + 0.95;

  const rows: StandRow[] = [];
  const nLower = 10;
  const d1 = 0.86;
  const h1 = 0.4;
  for (let i = 0; i < nLower; i++) {
    rows.push({ tier: 0, index: i, rFront: apronR1 + i * d1, rBack: apronR1 + (i + 1) * d1, y: lowerFrontY + i * h1, depth: d1, rise: h1 });
  }
  const crossR0 = apronR1 + nLower * d1;
  const crossY = lowerFrontY + nLower * h1;
  const crossR1 = crossR0 + 1.8;
  const upperFrontTopY = crossY + 2.5;
  const nUpper = 10;
  const d2 = 0.82;
  const h2 = 0.47;
  for (let j = 0; j < nUpper; j++) {
    rows.push({ tier: 1, index: j, rFront: crossR1 + j * d2, rBack: crossR1 + (j + 1) * d2, y: upperFrontTopY + j * h2, depth: d2, rise: h2 });
  }
  const last = rows[rows.length - 1];
  const backR = last.rBack;
  const backTopY = last.y + last.rise * 0.5 + 1.15;
  const facadeR = backR + 0.35;

  const gateAngle = o.gateAngle;
  const gateHalfWidth = 5.0;
  const TAU = Math.PI * 2;
  const standA0 = gateAngle + Math.asin(Math.min(0.99, gateHalfWidth / apronR0));
  const standA1 = gateAngle + TAU - Math.asin(Math.min(0.99, gateHalfWidth / apronR0));

  // Seating sections: ~11 degrees each, aisles between them.
  const usable = standA1 - standA0;
  const nSec = Math.max(4, Math.round(usable / ((11 * Math.PI) / 180)));
  const aisles: number[] = [];
  for (let k = 1; k < nSec; k++) aisles.push(standA0 + (usable * k) / nSec);
  const aisleHalfAngle = 0.62 / apronR1;

  const towerR = facadeR + 4.2;
  const lampY = backTopY + 19;
  const towerAngles: number[] = [];
  for (let k = 0; k < 6; k++) towerAngles.push(gateAngle + Math.PI / 6 + (k * Math.PI) / 3);

  return {
    wallR,
    wallT,
    baseY,
    topY,
    outerR,
    fenceR: wallR + wallT * 0.5,
    fenceMeshR: wallR + wallT * 0.5 - 0.07,
    fenceTopY: Math.max(topY + 2.5, 6.0),
    apronR0,
    apronR1,
    apronY,
    lowerFrontY,
    rows,
    crossR0,
    crossR1,
    crossY,
    upperFrontTopY,
    backR,
    backTopY,
    facadeR,
    gateAngle,
    gateHalfWidth,
    scoreboardAngle: gateAngle + Math.PI,
    towerAngles,
    towerR,
    lampY,
    aisles,
    aisleHalfAngle,
    standA0,
    standA1,
  };
}

/** Angle of the gate-gap cut plane at radius r (side = +1: start of stands, -1: end). */
export function gapCutAngle(L: Layout, r: number, side: 1 | -1): number {
  const off = Math.asin(Math.min(0.999, L.gateHalfWidth / r));
  return side === 1 ? L.gateAngle + off : L.gateAngle + Math.PI * 2 - off;
}
