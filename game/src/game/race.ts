import type * as THREE from 'three';
import type { Car } from '../car/car';
import type { Figure8Track } from '../arena/figure8/track';

export interface RaceState {
  car: Car;
  idx: number; // nearest centreline sample (tracked continuously so the crossing can't confuse it)
  s: number;
  lastS: number;
  /** metres driven since the start line (negative on the grid) */
  progress: number;
  lap: number; // laps completed
  lapStart: number;
  lastLap: number;
  best: number;
  finished: boolean;
  finishTime: number;
  place: number;
  wrongWay: number;
  offTrack: number;
  stuck: number;
  respawns: number;
  lateral: number;
  dist: number;
  /** watchdog: best progress so far and when it last grew */
  mark: number;
  markTime: number;
  /** seconds since the car was wrecked (wrecks get towed off the track) */
  wreckedFor: number;
  towed: boolean;
}

export type RespawnReason = 'thrown' | 'flipped' | 'stuck' | 'lost' | 'manual';

export interface RaceEvents {
  lap(st: RaceState, lapTime: number, best: boolean): void;
  finish(st: RaceState): void;
  respawn(st: RaceState, reason: RespawnReason): void;
}

/**
 * Lap counting and positions on the figure 8. Each car's place on the centreline is tracked from its
 * previous sample (a ±25 m window), so at the X a car stays on its own straight; progress is the
 * signed distance driven along the track, which makes laps, positions and gaps straightforward.
 */
export class RaceController {
  readonly states: RaceState[] = [];
  finishedCount = 0;
  firstFinishTime = -1;
  private now = 0;
  constructor(
    readonly track: Figure8Track,
    cars: Car[],
    readonly laps: number,
    private events: RaceEvents,
  ) {
    for (const car of cars) {
      const near = track.nearest(car.curPos.x, car.curPos.z);
      const s = track.samples[near.index].s;
      const behind = track.ahead(s, track.startS); // distance to the start line
      this.states.push({
        car,
        idx: near.index,
        s,
        lastS: s,
        progress: behind < track.length / 2 ? -behind : track.length - behind,
        lap: 0,
        lapStart: 0,
        lastLap: 0,
        best: Infinity,
        finished: false,
        finishTime: 0,
        place: 0,
        wrongWay: 0,
        offTrack: 0,
        stuck: 0,
        respawns: 0,
        lateral: 0,
        dist: 0,
        mark: -Infinity,
        markTime: 0,
        wreckedFor: 0,
        towed: false,
      });
    }
  }

  of(car: Car): RaceState {
    return this.states.find((s) => s.car === car)!;
  }

  get totalDistance() {
    return this.laps * this.track.length;
  }

  /** after every physics step; `racing` is false during the countdown */
  update(dt: number, clock: number, racing: boolean) {
    const tr = this.track;
    this.now = clock;
    for (const st of this.states) {
      const car = st.car;
      const near = tr.nearest(car.curPos.x, car.curPos.z, st.idx, 25);
      st.idx = near.index;
      st.dist = near.dist;
      st.lateral = near.lateral;
      st.lastS = st.s;
      st.s = tr.samples[near.index].s;
      let ds = st.s - st.lastS;
      if (ds > tr.length / 2) ds -= tr.length;
      if (ds < -tr.length / 2) ds += tr.length;
      const before = st.progress;
      st.progress += ds;
      if (car.wrecked) {
        st.wreckedFor += dt;
        // wrecks are towed to the scrapyard in a loop's infield so they don't block the track (the
        // camera has moved on from the player's by then)
        if (!st.towed && st.wreckedFor > (car.isPlayer ? 4.5 : 4)) this.tow(st);
        continue;
      }
      if (!racing || st.finished) continue;

      // lap completed?
      const lapsDone = Math.max(0, Math.floor(st.progress / tr.length));
      if (before < 0 && st.progress >= 0) st.lapStart = clock; // crossed the line for the first time
      if (lapsDone > st.lap) {
        st.lap = lapsDone;
        const t = clock - st.lapStart;
        st.lastLap = t;
        const isBest = t < st.best;
        if (isBest) st.best = t;
        st.lapStart = clock;
        // the chequered flag: the winner after the full distance, then everyone else the next time
        // they cross the line (lapped cars finish a lap or more down)
        if (st.lap >= this.laps || this.firstFinishTime >= 0) {
          st.finished = true;
          st.finishTime = clock;
          this.finishedCount++;
          st.place = this.standings().indexOf(st) + 1; // provisional for lapped cars: lead-lap cars still to come are ahead
          if (this.firstFinishTime < 0) this.firstFinishTime = clock;
          this.events.finish(st);
        } else this.events.lap(st, t, isBest);
      }

      // wrong way: moving against the track direction
      const smp = tr.samples[st.idx];
      const v = car.velocity;
      const along = v.x * smp.t.x + v.z * smp.t.z;
      if (along < -2) st.wrongWay += dt;
      else st.wrongWay = Math.max(0, st.wrongWay - dt * 3);

      // thrown over a barrier (or shoved down the other straight at the X), upside down, or stuck:
      // put it back on the track
      const W = tr.opts.width / 2;
      st.offTrack = st.dist > W + 3 || this.outside(st) ? st.offTrack + dt : 0;
      const flipped = car.vehicle.upDot < 0.35;
      const slow = car.velocity.lengthSq() < 1;
      st.stuck = flipped || (slow && Math.abs(car.input.throttle) + car.input.brake > 0.3) ? st.stuck + dt : 0;
      // AI that hasn't gained ground for a while (wedged in a pile-up, lost behind a wall) goes back too
      if (st.progress > st.mark + 4 || st.mark === -Infinity) {
        st.mark = st.progress;
        st.markTime = clock;
      }
      if (st.offTrack > (car.isPlayer ? 2 : 1.2)) this.respawn(st, 'thrown');
      else if (st.stuck > (flipped ? 2.2 : car.isPlayer ? 6 : 3.5)) this.respawn(st, flipped ? 'flipped' : 'stuck');
      else if (!car.isPlayer && clock - st.markTime > 8) this.respawn(st, 'lost');
    }
  }

  /** Is the car outside the barriers (on no stretch of track at all, which also covers the open X)? */
  outside(st: RaceState): boolean {
    const lim = this.track.opts.width / 2 + this.track.barrierOffset + 0.5;
    if (st.dist < lim) return false;
    const p = st.car.curPos;
    return this.track.nearest(p.x, p.z).dist > lim;
  }

  private towedCount = 0;

  /** Drop a wreck in the scrapyard: rows around the two loop centres. */
  private tow(st: RaceState) {
    const k = this.towedCount++;
    const c = this.track.loopCenters[k % 2];
    const a = -Math.PI / 2 + Math.floor(k / 2) * 0.95;
    const r = 7;
    const p = c.clone().add({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r } as THREE.Vector3);
    p.y = this.track.heightAt(p.x, p.z) + 0.8;
    st.car.teleport(p, a + Math.PI / 2 + (k % 3) * 0.3);
    st.towed = true;
  }

  /** Put a car back on the centreline a little behind where it was. */
  respawn(st: RaceState, reason: RespawnReason = 'manual') {
    const tr = this.track;
    let s = st.s - 4;
    // keep clear of other cars
    for (let tries = 0; tries < 8; tries++) {
      const spot = tr.respawnAt(s);
      const clear = this.states.every((o) => o === st || o.car.curPos.distanceTo(spot.position) > 5);
      if (clear) break;
      s -= 6;
    }
    const spot = tr.respawnAt(s);
    const diff = tr.ahead(s, st.s);
    st.progress -= diff < tr.length / 2 ? diff : 0;
    st.car.teleport(spot.position, spot.yaw);
    const near = tr.nearest(spot.position.x, spot.position.z);
    st.idx = near.index;
    st.s = st.lastS = tr.samples[near.index].s;
    st.offTrack = st.stuck = st.wrongWay = 0;
    st.mark = st.progress;
    st.markTime = this.now;
    st.respawns++;
    this.events.respawn(st, reason);
  }

  /**
   * Race order by distance covered (a finisher counts exactly its completed laps, so a lead-lap car
   * still running ranks ahead of a lapped car that already took the flag), ties to whoever crossed the
   * line first; cars wrecked before the flag last, latest wreck first.
   */
  standings(): RaceState[] {
    const L = this.track.length;
    const dist = (x: RaceState) => (x.finished ? x.lap * L : x.progress);
    return this.states.slice().sort((a, b) => {
      const aw = a.car.wrecked && !a.finished, bw = b.car.wrecked && !b.finished;
      if (aw !== bw) return aw ? 1 : -1;
      if (aw) return b.car.wreckTime - a.car.wreckTime;
      const d = dist(b) - dist(a);
      if (Math.abs(d) > 1e-6) return d;
      return (a.finished ? a.finishTime : Infinity) - (b.finished ? b.finishTime : Infinity);
    });
  }

  /** Gap to the car ahead in metres (for the HUD), or 0 for the leader. */
  gapAhead(st: RaceState): number {
    const order = this.standings();
    const i = order.indexOf(st);
    return i > 0 ? order[i - 1].progress - st.progress : 0;
  }
}

export const formatLap = (t: number) => {
  if (!isFinite(t) || t <= 0) return '--:--.-';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};
