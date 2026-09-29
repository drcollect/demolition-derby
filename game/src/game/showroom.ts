import * as THREE from 'three';
import { RAPIER, createWorld } from '../physics/world';
import { Car, type CarHost } from '../car/car';
import type { CarTemplate } from '../car/carAsset';
import type { LiveryChoice } from '../car/specs';
import { Effects } from '../fx/particles';
import { Skidmarks } from '../fx/skidmarks';
import { DebrisManager } from '../fx/debris';
import { makeConcrete } from '../render/textures';

/** The garage: one car on a slowly turning platform under a work light. */
export class Showroom {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private world: RAPIER.World;
  private host: CarHost;
  private car: Car | null = null;
  readonly turntable = new THREE.Group();
  private t = 0;
  private key = '';

  constructor(env: THREE.Texture, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(34, aspect, 0.1, 200);
    this.world = createWorld();
    this.host = {
      world: this.world,
      fx: new Effects(),
      skids: new Skidmarks(16),
      debris: new DebrisManager(this.world, 1),
      sound: null,
      groundHeight: () => 0,
      now: () => this.t,
    };
    const s = this.scene;
    s.environment = env;
    s.environmentIntensity = 0.8;
    s.background = new THREE.Color(0x07080b);
    s.fog = new THREE.Fog(0x07080b, 14, 34);
    // floor
    const conc = makeConcrete(512, 12);
    conc.repeat.set(6, 6);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.MeshStandardMaterial({ map: conc, color: 0x5a5856, roughness: 0.55, metalness: 0.1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.7, 0.08, 72),
      new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.35, metalness: 0.7 }),
    );
    plate.position.y = -0.03;
    plate.receiveShadow = true;
    this.turntable.add(plate);
    s.add(this.turntable);
    // lights: overhead work lamp, warm rim, cool fill
    const spot = new THREE.SpotLight(0xfff1dc, 380, 30, 0.62, 0.55, 2);
    spot.position.set(1.5, 9, 3);
    spot.target.position.set(0, 0.4, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.0002;
    spot.shadow.normalBias = 0.02;
    s.add(spot, spot.target);
    const rim = new THREE.SpotLight(0xff9a4a, 240, 30, 0.7, 0.8, 2);
    rim.position.set(-6, 4, -6);
    rim.target.position.set(0, 0.6, 0);
    s.add(rim, rim.target);
    const fill = new THREE.SpotLight(0x8fb4ff, 150, 30, 0.8, 0.9, 2);
    fill.position.set(7, 3, -2);
    fill.target.position.set(0, 0.5, 0);
    s.add(fill, fill.target);
    s.add(new THREE.HemisphereLight(0x39415a, 0x1a1410, 0.4));
    // a lamp you can see
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 0.35, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x222222, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }));
    lamp.position.set(1.5, 9.1, 3);
    const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.48, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 7, 6) }));
    bulb.rotation.x = Math.PI / 2;
    bulb.position.set(1.5, 8.95, 3);
    s.add(lamp, bulb);
  }

  show(template: CarTemplate, livery: LiveryChoice, number: number) {
    const key = `${template.id}|${JSON.stringify(livery)}|${number}|${template.source}`;
    if (key === this.key) return;
    const keepAngle = this.turntable.rotation.y;
    if (this.car) {
      this.turntable.remove(this.car.root);
      this.car.dispose();
    }
    this.key = key;
    this.car = new Car(
      this.host,
      { index: 0, template, ...livery, number, helmet: '#f2f2f2', isPlayer: true, driverName: 'You', wear: 0.05, toughnessMul: 1 },
      { position: new THREE.Vector3(0, 0, 0), yaw: 0 },
    );
    // freeze physics; we just want the visuals
    this.car.body.setEnabled(false);
    this.car.root.position.set(0, 0, 0);
    this.car.root.quaternion.identity();
    this.turntable.add(this.car.root);
    this.turntable.rotation.y = keepAngle;
  }

  update(dt: number, aspect: number) {
    this.t += dt;
    this.turntable.rotation.y += dt * 0.32;
    if (this.car) {
      this.car.root.position.set(0, 0, 0);
      this.car.root.quaternion.identity();
      // wheels at rest
      for (let i = 0; i < this.car.wheelPivots.length; i++) this.car.wheelPivots[i].position.copy(this.car.template.wheels[i].center);
    }
    const L = this.car ? this.car.template.size.z : 5;
    const d = 7.2 + L * 0.9;
    this.camera.aspect = aspect;
    this.camera.position.set(0, 1.9 + L * 0.08, d);
    this.camera.lookAt(0, 0.62, 0);
    this.camera.updateProjectionMatrix();
  }
}
