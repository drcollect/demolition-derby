import type { Match } from '../game/match';
import type { Car } from '../car/car';
import { formatTime, clamp } from '../core/math';
import { formatLap } from '../game/race';
import { CAMERA_MODES } from '../render/camera';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};

export function damageColor(d: number): string {
  if (d >= 0.999) return '#2a0b0b';
  const stops: [number, number[]][] = [
    [0, [58, 209, 74]],
    [0.35, [240, 214, 46]],
    [0.65, [242, 130, 30]],
    [0.9, [224, 42, 26]],
  ];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (d >= stops[i][0] && d <= stops[i + 1][0]) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const t = clamp((d - a[0]) / Math.max(1e-4, b[0] - a[0]), 0, 1);
  const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const DAMAGE_SVG = `
<svg viewBox="0 0 120 200" class="dmg-svg">
  <defs>
    <filter id="glow"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect class="dw" data-w="0" x="8" y="36" width="14" height="30" rx="3"/>
  <rect class="dw" data-w="1" x="98" y="36" width="14" height="30" rx="3"/>
  <rect class="dw" data-w="2" x="8" y="134" width="14" height="30" rx="3"/>
  <rect class="dw" data-w="3" x="98" y="134" width="14" height="30" rx="3"/>
  <path class="dz" data-z="front" d="M30 22 Q60 4 90 22 L90 58 L30 58 Z"/>
  <path class="dz" data-z="rear" d="M30 142 L90 142 L90 176 Q60 194 30 176 Z"/>
  <path class="dz" data-z="left" d="M24 60 L42 60 L42 140 L24 140 Z"/>
  <path class="dz" data-z="right" d="M78 60 L96 60 L96 140 L78 140 Z"/>
  <rect x="44" y="62" width="32" height="76" rx="6" class="dcab"/>
  <text x="60" y="106" class="dnum" text-anchor="middle">00</text>
</svg>`;

export class Hud {
  readonly root: HTMLElement;
  private pts: HTMLElement;
  private rank: HTMLElement;
  private alive: HTMLElement;
  private timer: HTMLElement;
  private feed: HTMLElement;
  private speed: HTMLElement;
  private gear: HTMLElement;
  private tach: HTMLElement;
  private center: HTMLElement;
  private popups: HTMLElement;
  private banner: HTMLElement;
  private dmgZones = new Map<string, SVGPathElement>();
  private dmgWheels: SVGRectElement[] = [];
  private dmgNum: SVGTextElement;
  private dmgStatus: HTMLElement;
  private map: HTMLCanvasElement;
  private mapCtx: CanvasRenderingContext2D;
  private hint: HTMLElement;
  private camLabel: HTMLElement;
  private labels: HTMLElement[] = [];
  private mode = '';
  private lastFeedKey = '';
  private lastPopupKey = '';
  private camShownAt = -10;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    const tl = el('div', 'hud-tl', this.root);
    const ptsBox = el('div', 'hud-box', tl);
    this.labels.push(el('div', 'hud-label', ptsBox, 'POINTS'));
    this.pts = el('div', 'hud-big', ptsBox, '0');
    const row = el('div', 'hud-row', tl);
    const rk = el('div', 'hud-box small', row);
    this.labels.push(el('div', 'hud-label', rk, 'RANK'));
    this.rank = el('div', 'hud-mid', rk, '1/8');
    const al = el('div', 'hud-box small', row);
    this.labels.push(el('div', 'hud-label', al, 'RUNNING'));
    this.alive = el('div', 'hud-mid', al, '8');

    const tc = el('div', 'hud-tc', this.root);
    this.timer = el('div', 'hud-timer', tc, '4:00');
    this.camLabel = el('div', 'hud-cam', tc, '');

    this.feed = el('div', 'hud-feed', this.root);

    const bl = el('div', 'hud-bl', this.root);
    this.map = el('canvas', 'hud-map', bl) as HTMLCanvasElement;
    this.map.width = 176;
    this.map.height = 176;
    this.mapCtx = this.map.getContext('2d')!;
    const spd = el('div', 'hud-speed', bl);
    this.speed = el('span', 'hud-speed-num', spd, '0');
    el('span', 'hud-speed-unit', spd, 'KM/H');
    this.gear = el('span', 'hud-gear', spd, '1');
    const tachWrap = el('div', 'hud-tach', bl);
    this.tach = el('div', 'hud-tach-fill', tachWrap);

    const br = el('div', 'hud-br', this.root);
    const dmg = el('div', 'hud-dmg', br, DAMAGE_SVG);
    this.dmgStatus = el('div', 'hud-dmg-status', br, '');
    dmg.querySelectorAll<SVGPathElement>('.dz').forEach((p) => this.dmgZones.set(p.dataset.z!, p));
    dmg.querySelectorAll<SVGRectElement>('.dw').forEach((r) => (this.dmgWheels[Number(r.dataset.w)] = r));
    this.dmgNum = dmg.querySelector('.dnum') as SVGTextElement;

    this.center = el('div', 'hud-center', this.root);
    this.popups = el('div', 'hud-popups', this.root);
    this.banner = el('div', 'hud-banner', this.root);
    this.hint = el('div', 'hud-hint', this.root, 'W/S drive · A/D steer · SPACE handbrake · C camera · V look back · R flip · ESC pause');
  }

  show(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }

  flashCamera(mode: number, now: number) {
    this.camLabel.textContent = CAMERA_MODES[mode].toUpperCase();
    this.camShownAt = now;
  }

  update(m: Match, viewCar: Car, now: number) {
    const p = m.player;
    const st = m.standings();
    const mode = m.race ? 'race' : 'derby';
    if (mode !== this.mode) {
      this.mode = mode;
      const names = m.race ? ['POSITION', 'LAP', 'LAP TIME'] : ['POINTS', 'RANK', 'RUNNING'];
      this.labels.forEach((l, i) => (l.textContent = names[i]));
      this.hint.textContent = `W/S drive · A/D steer · SPACE handbrake · C camera · V look back · R ${m.race ? 'back on track' : 'flip'} · ESC pause`;
    }
    if (m.race) {
      const rs = m.race.of(p);
      this.pts.textContent = `${st.indexOf(p) + 1}/${m.cars.length}`;
      this.rank.textContent = `${Math.min(m.race.laps, rs.lap + 1)}/${m.race.laps}`;
      this.alive.textContent = m.phase === 'run' && rs.progress >= 0 && !rs.finished ? formatLap(m.clock - rs.lapStart) : rs.finished ? 'DONE' : '0:00.0';
      this.timer.textContent = formatTime(m.phase === 'run' || m.phase === 'over' ? m.clock : 0);
    } else {
      this.pts.textContent = String(p.points);
      this.rank.textContent = `${st.indexOf(p) + 1}/${m.cars.length}`;
      this.alive.textContent = String(m.aliveCount);
      this.timer.textContent = m.phase === 'run' || m.phase === 'over' ? formatTime(m.timeLeft) : formatTime(m.config.timeLimit);
    }
    this.timer.classList.toggle('warn', !m.race && m.phase === 'run' && m.timeLeft < 30);
    this.camLabel.style.opacity = now - this.camShownAt < 1.5 ? '1' : '0';

    // speed
    const kmh = Math.abs(viewCar.vehicle.speed) * 3.6;
    this.speed.textContent = String(Math.round(kmh));
    this.gear.textContent = viewCar.vehicle.reversing ? 'R' : String(viewCar.vehicle.gear);
    const rpmT = viewCar.vehicle.rpm / viewCar.spec.redline;
    this.tach.style.width = `${clamp(rpmT, 0, 1) * 100}%`;
    this.tach.classList.toggle('red', rpmT > 0.9);

    // damage diagram (player's car, or the car being watched)
    for (const [z, path] of this.dmgZones) {
      const d = viewCar.zones[z as 'front'];
      path.style.fill = damageColor(d);
      path.classList.toggle('flash', viewCar.hitFlash[z as 'front'] > 0.5);
    }
    for (let i = 0; i < 4; i++) {
      const w = this.dmgWheels[i];
      const attached = viewCar.vehicle.wheels[i]?.attached ?? true;
      w.style.fill = attached ? damageColor(viewCar.wheelDmg[i]) : 'transparent';
      w.style.stroke = attached ? '#000' : '#e02a1a';
      w.style.strokeDasharray = attached ? '' : '3 3';
    }
    this.dmgNum.textContent = String(viewCar.number);
    const z = viewCar.zones;
    let status = '';
    if (viewCar.wrecked) status = 'WRECKED';
    else if (z.front > 0.85) status = 'ENGINE FAILING';
    else if (z.front > 0.55) status = 'OVERHEATING';
    else if (z.front > 0.45) status = 'RADIATOR HIT';
    else if (z.rear > 0.7) status = 'DRIVETRAIN DAMAGED';
    this.dmgStatus.textContent = status;
    this.dmgStatus.className = 'hud-dmg-status' + (status ? ' on' : '');

    // feed
    const fk = m.feed.map((f) => f.time + f.text).join('|');
    if (fk !== this.lastFeedKey) {
      this.lastFeedKey = fk;
      this.feed.innerHTML = m.feed
        .slice(-6)
        .map((f) => `<div class="feed-item ${f.kind}">${escapeHtml(f.text)}</div>`)
        .join('');
    }
    for (const [i, child] of Array.from(this.feed.children).entries()) {
      const item = m.feed.slice(-6)[i];
      if (item) (child as HTMLElement).style.opacity = String(clamp(1 - (m.time - item.time - 6) / 2, 0.25, 1));
    }

    // popups
    const pk = m.popups.map((x) => x.time + x.text).join('|');
    if (pk !== this.lastPopupKey) {
      this.lastPopupKey = pk;
      this.popups.innerHTML = m.popups
        .map((x) => `<div class="popup" style="--c:${x.color ?? '#ffd23f'}"><div class="popup-t">${escapeHtml(x.text)}</div>${x.sub ? `<div class="popup-s">${escapeHtml(x.sub)}</div>` : ''}</div>`)
        .join('');
    }

    // countdown / banners
    let c = '';
    if (m.phase === 'intro')
      c = m.race
        ? `<div class="intro-title">FIGURE 8</div><div class="intro-sub">${m.race.laps} laps · watch the crossing · ENTER to skip</div>`
        : m.config.mode === 'total'
          ? '<div class="intro-title">TOTAL DESTRUCTION</div><div class="intro-sub">Everyone is after you · survive · ENTER to skip</div>'
          : '<div class="intro-title">THE BOWL</div><div class="intro-sub">Last car running wins · ENTER to skip</div>';
    else if (m.phase === 'countdown') {
      const n = Math.ceil(3 - m.phaseTime);
      c = `<div class="count">${n > 0 ? n : 'GO!'}</div>`;
    } else if (m.phase === 'run' && m.clock < 1.0) c = '<div class="count go">GO!</div>';
    if (this.center.innerHTML !== c) this.center.innerHTML = c;
    let b = '';
    if (m.phase === 'run' && p.wrecked) b = '<div class="wrecked">YOU\'RE WRECKED</div><div class="banner-sub">Spectating · ENTER for results</div>';
    else if (m.race && m.phase === 'run' && m.race.of(p).wrongWay > 1.2) b = '<div class="wrecked">WRONG WAY</div><div class="banner-sub">Turn around · R puts you back on the track</div>';
    if (this.banner.innerHTML !== b) this.banner.innerHTML = b;

    this.drawMap(m, viewCar);
  }

  private drawMap(m: Match, view: Car) {
    if (m.track) return this.drawTrackMap(m, view);
    const g = this.mapCtx;
    const W = this.map.width;
    const R = m.bowl!.opts.wallRadius;
    const s = (W / 2 - 8) / R;
    g.clearRect(0, 0, W, W);
    g.save();
    g.translate(W / 2, W / 2);
    g.fillStyle = 'rgba(40,28,18,0.72)';
    g.beginPath();
    g.arc(0, 0, R * s, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 2.5;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, m.bowl!.opts.floorRadius * s, 0, Math.PI * 2);
    g.stroke();
    // rotate the arena so the watched car always points up; its left (+X) is screen-left
    const f = view.forward();
    const psi = Math.atan2(f.x, f.z);
    const cs = Math.cos(psi), sn = Math.sin(psi);
    for (const c of m.cars) {
      const x = c.curPos.x * cs - c.curPos.z * sn;
      const z = c.curPos.x * sn + c.curPos.z * cs;
      const cf = c.forward();
      const d = Math.atan2(cf.x, cf.z) - psi;
      g.save();
      g.translate(-x * s, -z * s);
      g.rotate(Math.PI - d);
      if (c.wrecked) {
        g.strokeStyle = 'rgba(170,170,170,0.85)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(-4, -4);
        g.lineTo(4, 4);
        g.moveTo(4, -4);
        g.lineTo(-4, 4);
        g.stroke();
      } else {
        g.fillStyle = c.isPlayer ? '#ffd23f' : '#' + c.color.getHexString();
        g.strokeStyle = c.isPlayer ? '#000' : 'rgba(0,0,0,0.8)';
        g.lineWidth = 1.5;
        g.beginPath();
        const sz = c.isPlayer ? 7 : 5.5;
        g.moveTo(0, sz);
        g.lineTo(sz * 0.7, -sz * 0.8);
        g.lineTo(-sz * 0.7, -sz * 0.8);
        g.closePath();
        g.fill();
        g.stroke();
      }
      g.restore();
    }
    g.restore();
  }

  /** Figure 8 map: north-up, the whole track, cars as arrows. */
  private drawTrackMap(m: Match, view: Car) {
    const g = this.mapCtx;
    const W = this.map.width;
    const tr = m.track!;
    const b = tr.bounds;
    const s = (W - 16) / (b.maxX - b.minX);
    const cz = W / 2;
    const X = (x: number) => W / 2 + x * s;
    const Z = (z: number) => cz + z * s;
    g.clearRect(0, 0, W, W);
    g.fillStyle = 'rgba(30,24,16,0.55)';
    g.beginPath();
    g.roundRect(4, cz - ((b.maxZ - b.minZ) / 2) * s - 6, W - 8, (b.maxZ - b.minZ) * s + 12, 10);
    g.fill();
    g.lineJoin = 'round';
    for (const [w, c] of [[tr.opts.width * s + 3, 'rgba(0,0,0,0.6)'], [tr.opts.width * s, 'rgba(190,150,105,0.95)']] as const) {
      g.strokeStyle = c;
      g.lineWidth = w;
      g.beginPath();
      tr.samples.forEach((smp, i) => (i === 0 ? g.moveTo(X(smp.p.x), Z(smp.p.z)) : g.lineTo(X(smp.p.x), Z(smp.p.z))));
      g.closePath();
      g.stroke();
    }
    // start line
    const st = tr.sampleAt(tr.startS);
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(X(st.p.x + st.n.x * 7), Z(st.p.z + st.n.z * 7));
    g.lineTo(X(st.p.x - st.n.x * 7), Z(st.p.z - st.n.z * 7));
    g.stroke();
    for (const c of m.cars) {
      if (c.wrecked && m.race?.of(c).towed) continue; // off in the scrapyard
      const f = c.forward();
      g.save();
      g.translate(X(c.curPos.x), Z(c.curPos.z));
      g.rotate(Math.atan2(f.z, f.x) - Math.PI / 2);
      if (c.wrecked) {
        g.strokeStyle = 'rgba(170,170,170,0.85)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(-3, -3);
        g.lineTo(3, 3);
        g.moveTo(3, -3);
        g.lineTo(-3, 3);
        g.stroke();
      } else {
        const sz = c === view ? 6.5 : 5;
        g.fillStyle = c.isPlayer ? '#ffd23f' : '#' + c.color.getHexString();
        g.strokeStyle = '#000';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(0, sz);
        g.lineTo(sz * 0.7, -sz * 0.8);
        g.lineTo(-sz * 0.7, -sz * 0.8);
        g.closePath();
        g.fill();
        g.stroke();
      }
      g.restore();
    }
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
