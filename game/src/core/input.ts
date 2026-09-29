import { clamp } from './math';

/** What any driver (keyboard, gamepad, AI, later a network peer) feeds a car every physics step. */
export interface DriverInput {
  /** 0..1 */
  throttle: number;
  /** 0..1 — brakes, and reverses once the car has (nearly) stopped. */
  brake: number;
  /** -1..1, positive = steer left. */
  steer: number;
  handbrake: boolean;
  horn: boolean;
}

export const emptyInput = (): DriverInput => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false });

export type Action = 'camera' | 'pause' | 'reset' | 'mute' | 'confirm' | 'back' | 'left' | 'right' | 'up' | 'down' | 'debug';

const ACTION_KEYS: Record<Action, string[]> = {
  camera: ['KeyC'],
  pause: ['Escape', 'KeyP'],
  reset: ['KeyR'],
  mute: ['KeyM'],
  confirm: ['Enter', 'NumpadEnter'],
  back: ['Escape', 'Backspace'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  debug: ['F3', 'Backquote'],
};

// Standard gamepad mapping
const GP = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export class Input {
  private down = new Set<string>();
  private pressed = new Set<Action>();
  private steerKb = 0;
  private gpPrev: boolean[] = [];
  lookBack = false;
  usingGamepad = false;
  /** Called on the first real user gesture (audio unlock). */
  onFirstGesture: (() => void) | null = null;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.gesture();
      this.down.add(e.code);
      for (const a of Object.keys(ACTION_KEYS) as Action[]) if (ACTION_KEYS[a].includes(e.code)) this.pressed.add(a);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'].includes(e.code)) e.preventDefault();
      this.usingGamepad = false;
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
    target.addEventListener('pointerdown', () => this.gesture());
  }

  private gesture() {
    if (this.onFirstGesture) {
      const f = this.onFirstGesture;
      this.onFirstGesture = null;
      f();
    }
  }

  isDown(code: string) {
    return this.down.has(code);
  }

  /** One-shot actions since the last call to endFrame(). */
  wasPressed(a: Action) {
    return this.pressed.has(a);
  }

  endFrame() {
    this.pressed.clear();
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Poll the gamepad once per frame: turns its buttons into actions. */
  pollGamepad() {
    const p = this.pad();
    if (!p) return;
    const map: [number, Action][] = [
      [GP.Y, 'camera'], [GP.START, 'pause'], [GP.BACK, 'reset'], [GP.A, 'confirm'], [GP.B, 'back'],
      [GP.LEFT, 'left'], [GP.RIGHT, 'right'], [GP.UP, 'up'], [GP.DOWN, 'down'],
    ];
    for (const [i, a] of map) {
      const now = !!p.buttons[i]?.pressed;
      if (now && !this.gpPrev[i]) {
        this.pressed.add(a);
        this.usingGamepad = true;
        this.gesture();
      }
      this.gpPrev[i] = now;
    }
    // stick as menu navigation
    const ax = p.axes[0] ?? 0;
    const was = this.gpPrev[100] ?? false;
    const now = Math.abs(ax) > 0.6;
    if (now && !was) this.pressed.add(ax < 0 ? 'left' : 'right');
    this.gpPrev[100] = now;
  }

  /** Read the player's driving input. `dt` smooths keyboard steering. */
  driver(dt: number): DriverInput {
    const k = (c: string) => this.down.has(c);
    let throttle = k('KeyW') || k('ArrowUp') ? 1 : 0;
    let brake = k('KeyS') || k('ArrowDown') ? 1 : 0;
    const left = k('KeyA') || k('ArrowLeft');
    const right = k('KeyD') || k('ArrowRight');
    let handbrake = k('Space');
    let horn = k('KeyH');
    this.lookBack = k('KeyV') || k('KeyB');

    // Keyboard steering ramps in, and snaps back faster than it ramps in.
    const target = (left ? 1 : 0) - (right ? 1 : 0);
    const rate = target === 0 ? 7 : Math.sign(target) !== Math.sign(this.steerKb) ? 9 : 4.5;
    const diff = target - this.steerKb;
    this.steerKb += clamp(diff, -rate * dt, rate * dt);
    let steer = this.steerKb;

    const p = this.pad();
    if (p) {
      const rt = p.buttons[GP.RT]?.value ?? 0;
      const lt = p.buttons[GP.LT]?.value ?? 0;
      const sx = p.axes[0] ?? 0;
      const dead = 0.12;
      const sAdj = Math.abs(sx) < dead ? 0 : (Math.sign(sx) * (Math.abs(sx) - dead)) / (1 - dead);
      if (rt > 0.05 || lt > 0.05 || Math.abs(sAdj) > 0 || p.buttons[GP.A]?.pressed) {
        this.usingGamepad = true;
      }
      if (this.usingGamepad) {
        throttle = Math.max(throttle, rt);
        brake = Math.max(brake, lt);
        // gentle response curve
        steer = -Math.sign(sAdj) * Math.pow(Math.abs(sAdj), 1.4);
        handbrake = handbrake || !!p.buttons[GP.A]?.pressed || !!p.buttons[GP.RB]?.pressed;
        horn = horn || !!p.buttons[GP.X]?.pressed;
        this.lookBack = this.lookBack || !!p.buttons[GP.B]?.pressed || !!p.buttons[GP.LB]?.pressed;
      }
    }
    return { throttle, brake, steer: clamp(steer, -1, 1), handbrake, horn };
  }
}
