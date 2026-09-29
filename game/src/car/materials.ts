import * as THREE from 'three';
import { makeGrunge, makeNumberTexture, makeWood } from '../render/textures';

let grunge: THREE.DataTexture | null = null;
let wood: THREE.CanvasTexture | null = null;
const getGrunge = () => (grunge ??= makeGrunge());
const getWood = () => (wood ??= makeWood());

export interface PaintUniforms {
  uWear: { value: number }; // 0..1 how rusty/beaten the car starts
  uDirt: { value: number }; // 0..1 mud build-up, grows during a match
  uHeat: { value: number }; // 0..1 scorched when burning
}

export interface Livery {
  color: THREE.ColorRepresentation;
  stripe: 'none' | 'center' | 'twin' | 'side';
  stripeColor: THREE.ColorRepresentation;
  metallic: number;
  /** width of the centre/twin stripes and height of the side stripe (car space, m) */
  stripeWidth?: number;
  sideStripeY?: number;
}

/**
 * Car paint: glossy clear-coated enamel that turns into scraped bare metal, primer and soot where the
 * vertex attribute `dmg` says the panel was hit, plus rust spots and mud from the bottom up. Grunge is
 * sampled triplanar in car space, so it needs no UVs and sticks to the panels as they deform.
 */
export function makePaint(livery: Livery, wear: number): { mat: THREE.MeshPhysicalMaterial; u: PaintUniforms } {
  const mat = new THREE.MeshPhysicalMaterial({
    color: livery.color,
    metalness: livery.metallic,
    roughness: 0.34 - livery.metallic * 0.1,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.25,
  });
  const u: PaintUniforms = { uWear: { value: wear }, uDirt: { value: 0.1 }, uHeat: { value: 0 } };
  const stripeMode = { none: 0, center: 1, twin: 2, side: 3 }[livery.stripe];
  const stripeColor = new THREE.Color(livery.stripeColor);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWear = u.uWear;
    sh.uniforms.uDirt = u.uDirt;
    sh.uniforms.uHeat = u.uHeat;
    sh.uniforms.uStripe = { value: stripeMode };
    sh.uniforms.uStripeColor = { value: stripeColor };
    sh.uniforms.uStripeW = { value: livery.stripeWidth ?? 0.16 };
    sh.uniforms.uStripeY = { value: livery.sideStripeY ?? 0.55 };
    sh.uniforms.uGrunge = { value: getGrunge() };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float dmg;
varying float vDmg;
varying vec3 vCarPos;
varying vec3 vCarNrm;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vDmg = dmg;
vCarPos = position;
vCarNrm = normal;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWear;
uniform float uDirt;
uniform float uHeat;
uniform float uStripe;
uniform vec3 uStripeColor;
uniform float uStripeW;
uniform float uStripeY;
uniform sampler2D uGrunge;
varying float vDmg;
varying vec3 vCarPos;
varying vec3 vCarNrm;
vec4 triGrunge(vec3 p, vec3 n, float s) {
  vec3 w = abs(n) + vec3(1e-3); w = w * w; w = w * w; w /= (w.x + w.y + w.z);
  return texture2D(uGrunge, p.zy * s) * w.x + texture2D(uGrunge, p.xz * s) * w.y + texture2D(uGrunge, p.xy * s) * w.z;
}
float gDamage; float gRust; float gMud; float gBare;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (uStripe > 0.5) {
  float ax = abs(vCarPos.x);
  float aa = fwidth(ax) + 1e-4;
  float top = smoothstep(-0.15, 0.35, normalize(vCarNrm + vec3(0.0, 1e-4, 0.0)).y);
  float m = 0.0;
  if (uStripe < 1.5) m = smoothstep(uStripeW + aa, uStripeW - aa, ax) * top;
  else if (uStripe < 2.5) {
    float c = uStripeW * 0.9;
    m = smoothstep(uStripeW * 0.55 + aa, uStripeW * 0.55 - aa, abs(ax - c)) * top;
  } else {
    float side = smoothstep(0.35, 0.75, abs(vCarNrm.x) / (length(vCarNrm) + 1e-4));
    float dy = abs(vCarPos.y - uStripeY);
    float ay = fwidth(vCarPos.y) + 1e-4;
    m = side * (smoothstep(0.07 + ay, 0.07 - ay, dy) - smoothstep(0.03 + ay, 0.03 - ay, dy) * 0.0);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, uStripeColor, m);
}
{
  vec4 gr = triGrunge(vCarPos, vCarNrm, 0.9);
  vec4 grFine = triGrunge(vCarPos, vCarNrm, 3.1);
  float d = clamp(vDmg, 0.0, 1.0);
  // bare metal where scratches cut through; primer/soot in the middle of big dents
  gBare = smoothstep(0.15, 0.75, d * (0.55 + grFine.b * 0.9 + grFine.g * 0.4));
  float soot = smoothstep(0.55, 1.0, d) * (0.5 + 0.5 * gr.g);
  vec4 grRust = triGrunge(vCarPos + vec3(3.7, 1.3, 5.1), vCarNrm, 1.5);
  gRust = smoothstep(0.69 - uWear * 0.08, 0.77 - uWear * 0.07, grRust.r) * min(1.0, uWear * 1.3) * 0.85;
  float lowness = 1.0 - smoothstep(0.25, 1.05, vCarPos.y);
  gMud = clamp(uDirt * lowness * (0.55 + 0.9 * gr.g) + uDirt * 0.25 * grFine.r, 0.0, 1.0);
  vec3 bare = vec3(0.52, 0.52, 0.5) * (0.8 + 0.4 * grFine.g);
  vec3 rust = mix(vec3(0.2, 0.085, 0.035), vec3(0.36, 0.16, 0.07), grFine.g);
  vec3 mud = mix(vec3(0.24, 0.17, 0.11), vec3(0.34, 0.26, 0.18), grFine.r);
  diffuseColor.rgb = mix(diffuseColor.rgb, rust, gRust);
  diffuseColor.rgb = mix(diffuseColor.rgb, bare, gBare);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.045, 0.04), soot * 0.7);
  diffuseColor.rgb = mix(diffuseColor.rgb, mud, gMud);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.028, 0.025), uHeat * (0.6 + 0.4 * gr.r));
  gDamage = max(max(gBare, gRust), max(gMud, soot));
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.38, gBare);
roughnessFactor = mix(roughnessFactor, 0.95, max(gRust, gMud));`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.85, gBare);
metalnessFactor = mix(metalnessFactor, 0.0, max(gRust, gMud));`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
material.clearcoat *= (1.0 - gDamage);`,
      );
  };
  mat.customProgramCacheKey = () => 'derby-paint';
  return { mat, u };
}

export interface SharedCarMaterials {
  Trim: THREE.MeshStandardMaterial;
  Carbon: THREE.MeshPhysicalMaterial;
  Metal: THREE.MeshStandardMaterial;
  Void: THREE.MeshStandardMaterial;
  Chrome: THREE.MeshStandardMaterial;
  Steel: THREE.MeshStandardMaterial;
  Tire: THREE.MeshStandardMaterial;
  Rim: THREE.MeshStandardMaterial;
  Grille: THREE.MeshStandardMaterial;
  Interior: THREE.MeshStandardMaterial;
  EngineBay: THREE.MeshStandardMaterial;
  Underbody: THREE.MeshStandardMaterial;
  Wood: THREE.MeshStandardMaterial;
  Glass: THREE.MeshPhysicalMaterial;
}

let shared: SharedCarMaterials | null = null;
export function sharedMaterials(): SharedCarMaterials {
  if (shared) return shared;
  shared = {
    Trim: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, metalness: 0.2, roughness: 0.55, name: 'Trim' }),
    Carbon: new THREE.MeshPhysicalMaterial({ color: 0x141518, metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05, name: 'Carbon' }),
    Metal: new THREE.MeshStandardMaterial({ color: 0xa9abae, metalness: 1, roughness: 0.32, name: 'Metal' }),
    Void: new THREE.MeshStandardMaterial({ color: 0x030303, metalness: 0, roughness: 1, name: 'Void' }),
    Chrome: new THREE.MeshStandardMaterial({ color: 0xe9e9ec, metalness: 1, roughness: 0.14, name: 'Chrome' }),
    Steel: new THREE.MeshStandardMaterial({ color: 0x6e7072, metalness: 0.75, roughness: 0.48, name: 'Steel' }),
    Tire: new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0, roughness: 0.93, name: 'Tire' }),
    Rim: new THREE.MeshStandardMaterial({ color: 0xb4b5b7, metalness: 0.85, roughness: 0.3, name: 'Rim' }),
    Grille: new THREE.MeshStandardMaterial({ color: 0x1d1e20, metalness: 0.6, roughness: 0.42, name: 'Grille' }),
    Interior: new THREE.MeshStandardMaterial({ color: 0x2b2926, metalness: 0, roughness: 0.92, name: 'Interior' }),
    EngineBay: new THREE.MeshStandardMaterial({ color: 0x38393b, metalness: 0.55, roughness: 0.6, name: 'EngineBay' }),
    Underbody: new THREE.MeshStandardMaterial({ color: 0x131313, metalness: 0.1, roughness: 0.9, name: 'Underbody' }),
    Wood: new THREE.MeshStandardMaterial({ map: getWood(), roughness: 0.7, metalness: 0, name: 'Wood' }),
    Glass: new THREE.MeshPhysicalMaterial({
      color: 0x223038,
      metalness: 0,
      roughness: 0.03,
      transparent: true,
      opacity: 0.42,
      envMapIntensity: 1.8,
      depthWrite: false,
      side: THREE.DoubleSide,
      name: 'Glass',
    }),
  };
  return shared;
}

/** Neon accent for light strips and wheel rings (per car). */
export function makeGlow(color: THREE.ColorRepresentation) {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.6), emissive: c, emissiveIntensity: 2.6, roughness: 0.3, metalness: 0, name: 'Glow' });
}

export function makeHeadlight() {
  return new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff0c8, emissiveIntensity: 2.4, roughness: 0.2, metalness: 0.1, name: 'Headlight' });
}
export function makeTaillight() {
  return new THREE.MeshStandardMaterial({ color: 0x5c0b08, emissive: 0xff1c0a, emissiveIntensity: 0.9, roughness: 0.25, name: 'Taillight' });
}
export function makeHelmet(color: THREE.ColorRepresentation) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, name: 'Helmet' });
}
export function makeNumberMaterial(num: number) {
  return new THREE.MeshStandardMaterial({
    map: makeNumberTexture(num),
    transparent: false,
    alphaTest: 0.35,
    roughness: 0.62,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    name: 'Number',
  });
}
