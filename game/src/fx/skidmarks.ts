import * as THREE from 'three';

/**
 * Tyre marks in the dirt: one ring-buffer mesh of quads. Each wheel continues its own strip while it
 * slides; old quads get overwritten.
 */
export class Skidmarks {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private nrm: Float32Array;
  private alpha: Float32Array;
  private max: number;
  private next = 0;
  private used = 0;
  private last = new Map<string, { l: THREE.Vector3; r: THREE.Vector3; a: number }>();
  private dirty = false;

  constructor(maxQuads = 4000) {
    this.max = maxQuads;
    this.pos = new Float32Array(maxQuads * 4 * 3);
    this.nrm = new Float32Array(maxQuads * 4 * 3);
    this.alpha = new Float32Array(maxQuads * 4);
    const idx = new Uint32Array(maxQuads * 6);
    for (let q = 0; q < maxQuads; q++) {
      const v = q * 4;
      idx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], q * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('skidAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1f160f,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      side: THREE.DoubleSide,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float skidAlpha;\nvarying float vSkidA;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkidA = skidAlpha;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSkidA;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vSkidA;');
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
  }

  /**
   * Continue (or start) the strip for `key` at a contact point. side = unit vector across the tyre on the
   * ground plane; width in metres; intensity 0..1 (0 ends the strip).
   */
  add(key: string, p: THREE.Vector3, normal: THREE.Vector3, side: THREE.Vector3, width: number, intensity: number) {
    const prev = this.last.get(key);
    if (intensity < 0.05) {
      this.last.delete(key);
      return;
    }
    const lift = 0.02;
    const l = p.clone().addScaledVector(side, width / 2).addScaledVector(normal, lift);
    const r = p.clone().addScaledVector(side, -width / 2).addScaledVector(normal, lift);
    const a = Math.min(0.85, intensity * 0.9);
    if (prev && prev.l.distanceToSquared(l) < 0.04) return; // wait until 20 cm travelled
    if (prev && prev.l.distanceToSquared(l) < 4) {
      const q = this.next;
      const o = q * 12;
      this.pos.set([prev.l.x, prev.l.y, prev.l.z, prev.r.x, prev.r.y, prev.r.z, l.x, l.y, l.z, r.x, r.y, r.z], o);
      this.alpha.set([prev.a, prev.a, a, a], q * 4);
      for (let k = 0; k < 4; k++) this.nrm.set([normal.x, normal.y, normal.z], o + k * 3);
      this.next = (this.next + 1) % this.max;
      this.used = Math.min(this.max, this.used + 1);
      this.dirty = true;
    }
    this.last.set(key, { l, r, a });
  }

  flush() {
    if (!this.dirty) return;
    const g = this.mesh.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.skidAlpha as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
    g.setDrawRange(0, this.used * 6);
    this.dirty = false;
  }

  clear() {
    this.used = 0;
    this.next = 0;
    this.last.clear();
    this.mesh.geometry.setDrawRange(0, 0);
  }
}
