export type EngineProfile = 'v8big' | 'v8wagon' | 'v8muscle' | 'i4' | 'v8truck';

/** Gameplay tuning for one car. Geometry (size, wheel positions) comes from the model. */
export interface CarSpec {
  id: string;
  name: string;
  style: string;
  blurb: string;
  mass: number; // kg
  power: number; // W at the wheels, sets the force at speed (F = P / v)
  maxDriveForce: number; // N, traction-ish cap at low speed
  topSpeed: number; // m/s (soft limiter)
  reverseSpeed: number; // m/s
  brakeForce: number; // N total
  grip: number; // lateral friction coefficient
  longGrip: number; // longitudinal friction coefficient
  steerMax: number; // rad at a standstill
  steerFade: number; // m/s at which max steering has halved
  drive: 'RWD' | 'FWD' | 'AWD';
  comHeight: number; // centre of mass above the ground (m)
  comForward: number; // shift of the centre of mass toward the nose (m)
  suspFreq: number; // suspension natural frequency (Hz)
  suspDamping: number; // damping ratio
  /** Damage taken per zone relative to the average car (lower = tougher). */
  toughness: { front: number; rear: number; side: number };
  engine: EngineProfile;
  gears: number[];
  finalDrive: number;
  redline: number;
  /** 1..10 for the garage screen */
  stats: { speed: number; accel: number; handling: number; toughness: number; weight: number };
  /** default livery */
  paint: string;
  accent: string; // glow colour of light strips and wheel rings
  stripe: StripeStyle;
  metallic: number;
}

export type StripeStyle = 'none' | 'center' | 'twin' | 'side';

export const CAR_SPECS: CarSpec[] = [
  {
    id: 'hypercar',
    name: 'Hypercar',
    style: 'Mid-engine hypercar',
    blurb: 'Carbon tub, glowing wheel rings and far too much power. The quickest thing in the Bowl, and it bends like foil.',
    mass: 1380,
    power: 330_000,
    maxDriveForce: 12_500,
    topSpeed: 54,
    reverseSpeed: 13,
    brakeForce: 17_000,
    grip: 1.12,
    longGrip: 1.1,
    steerMax: 0.6,
    steerFade: 30,
    drive: 'RWD',
    comHeight: 0.42,
    comForward: -0.15,
    suspFreq: 2.0,
    suspDamping: 0.5,
    toughness: { front: 1.2, rear: 1.15, side: 1.2 },
    engine: 'v8muscle',
    gears: [2.4, 1.75, 1.35, 1.1, 0.9],
    finalDrive: 3.6,
    redline: 7800,
    stats: { speed: 10, accel: 10, handling: 8, toughness: 3, weight: 4 },
    paint: '#d01f1c',
    accent: '#ffffff',
    stripe: 'twin',
    metallic: 0.45,
  },
  {
    id: 'wedge',
    name: "Wedge '84",
    style: '80s wedge supercar',
    blurb: 'All flat panels and sharp edges, built like a doorstop. Tougher than it looks and happy to go sideways.',
    mass: 1480,
    power: 250_000,
    maxDriveForce: 11_500,
    topSpeed: 48,
    reverseSpeed: 12,
    brakeForce: 16_000,
    grip: 1.02,
    longGrip: 1.02,
    steerMax: 0.62,
    steerFade: 27,
    drive: 'RWD',
    comHeight: 0.42,
    comForward: -0.1,
    suspFreq: 1.8,
    suspDamping: 0.45,
    toughness: { front: 0.85, rear: 0.95, side: 0.95 },
    engine: 'v8big',
    gears: [2.3, 1.6, 1.2, 0.95],
    finalDrive: 3.5,
    redline: 7000,
    stats: { speed: 8, accel: 7, handling: 7, toughness: 6, weight: 5 },
    paint: '#ffc21a',
    accent: '#39e7ff',
    stripe: 'side',
    metallic: 0.15,
  },
  {
    id: 'rally',
    name: 'Rally Raid',
    style: 'Desert rally truck',
    blurb: 'Dakar truck on big knobblies with a steel skid plate. The heaviest car here: it shrugs off hits and flattens the small stuff.',
    mass: 2250,
    power: 270_000,
    maxDriveForce: 14_500,
    topSpeed: 42,
    reverseSpeed: 13,
    brakeForce: 19_000,
    grip: 0.98,
    longGrip: 1.05,
    steerMax: 0.58,
    steerFade: 24,
    drive: 'AWD',
    comHeight: 0.66,
    comForward: 0.1,
    suspFreq: 1.35,
    suspDamping: 0.42,
    toughness: { front: 0.7, rear: 0.8, side: 0.82 },
    engine: 'v8truck',
    gears: [2.9, 1.8, 1.25, 1.0],
    finalDrive: 3.4,
    redline: 5600,
    stats: { speed: 5, accel: 6, handling: 5, toughness: 10, weight: 10 },
    paint: '#1f5bd8',
    accent: '#ffb020',
    stripe: 'center',
    metallic: 0.2,
  },
  {
    id: 'endurance',
    name: 'Endurance',
    style: 'Le Mans prototype',
    blurb: 'A 24-hour racer with downforce for days. Corners like it’s on rails, but that fin and splitter won’t last long in here.',
    mass: 1150,
    power: 300_000,
    maxDriveForce: 11_500,
    topSpeed: 52,
    reverseSpeed: 12,
    brakeForce: 16_500,
    grip: 1.22,
    longGrip: 1.15,
    steerMax: 0.6,
    steerFade: 32,
    drive: 'RWD',
    comHeight: 0.38,
    comForward: -0.1,
    suspFreq: 2.2,
    suspDamping: 0.55,
    toughness: { front: 1.15, rear: 1.1, side: 1.15 },
    engine: 'v8muscle',
    gears: [2.5, 1.85, 1.45, 1.18, 0.98],
    finalDrive: 3.7,
    redline: 8200,
    stats: { speed: 9, accel: 9, handling: 10, toughness: 4, weight: 3 },
    paint: '#86c8f2',
    accent: '#ff7a1a',
    stripe: 'center',
    metallic: 0.3,
  },
  {
    id: 'streamliner',
    name: 'Streamliner',
    style: 'Bubble streamliner',
    blurb: 'A land-speed teardrop with a narrow rear track. Slippery and fast in a straight line, twitchy everywhere else.',
    mass: 1050,
    power: 200_000,
    maxDriveForce: 9_800,
    topSpeed: 50,
    reverseSpeed: 11,
    brakeForce: 13_000,
    grip: 1.0,
    longGrip: 1.0,
    steerMax: 0.55,
    steerFade: 26,
    drive: 'RWD',
    comHeight: 0.36,
    comForward: 0.0,
    suspFreq: 1.9,
    suspDamping: 0.5,
    toughness: { front: 1.1, rear: 1.2, side: 1.25 },
    engine: 'i4',
    gears: [3.1, 2.0, 1.45, 1.1, 0.9],
    finalDrive: 3.9,
    redline: 7500,
    stats: { speed: 9, accel: 6, handling: 4, toughness: 3, weight: 2 },
    paint: '#8a3cff',
    accent: '#40f0ff',
    stripe: 'none',
    metallic: 0.6,
  },
];

export const specById = (id: string) => CAR_SPECS.find((s) => s.id === id) ?? CAR_SPECS[0];

/** Paint colours for the garage picker and for the AI field. */
export const PAINTS = [
  '#d01f1c', '#ff6a13', '#ffc21a', '#9bdc28', '#1fbf6a', '#12b5b0', '#86c8f2', '#1f5bd8',
  '#3b2bb8', '#8a3cff', '#e0339a', '#f2f2f2', '#9aa3a8', '#2a2c30', '#111214', '#c7a15a',
];

/** Neon accents for light strips and wheel rings. */
export const ACCENTS = ['#ffffff', '#39e7ff', '#ff7a1a', '#ffb020', '#40f0ff', '#ff3df0', '#7dff5a', '#ff2a2a'];
export const STRIPES: StripeStyle[] = ['none', 'center', 'twin', 'side'];

/** A car's paint job: body colour, neon accent, stripe style and stripe colour. */
export interface LiveryChoice {
  color: string;
  accent: string;
  stripe: StripeStyle;
  stripeColor: string;
}

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

/** Stripes in the accent colour, unless that would vanish against the paint. */
export function stripeColorFor(color: string, accent: string, stripe: StripeStyle): string {
  if (stripe === 'side') return luminance(color) > 0.55 ? '#141414' : '#f2f2f2';
  if (Math.abs(luminance(color) - luminance(accent)) < 0.25) return luminance(color) > 0.5 ? '#141414' : '#f2f2f2';
  return accent;
}

export function defaultLivery(spec: CarSpec): LiveryChoice {
  return { color: spec.paint, accent: spec.accent, stripe: spec.stripe, stripeColor: stripeColorFor(spec.paint, spec.accent, spec.stripe) };
}
