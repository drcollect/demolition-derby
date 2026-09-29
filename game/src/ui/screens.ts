import { ACCENTS, CAR_SPECS, PAINTS, STRIPES, defaultLivery, stripeColorFor, type LiveryChoice } from '../car/specs';
import { DIFFICULTIES } from '../ai/driver';
import type { Match } from '../game/match';
import { escapeHtml } from './hud';
import { formatLap } from '../game/race';

export type EventId = 'race' | 'derby' | 'total';

/** The events in the garage, in menu order (the first is the default). */
export const EVENTS: { id: EventId; label: string; info: string }[] = [
  { id: 'race', label: 'FIGURE 8 RACE', info: 'A dirt figure 8 at dusk. Race to the flag, but the straights cross in the middle.' },
  { id: 'derby', label: 'DERBY', info: 'The Bowl at night. Last car running wins.' },
  { id: 'total', label: 'TOTAL DESTRUCTION', info: 'The Bowl. Every other car is coming for you. Last as long as you can.' },
];

export interface GarageState {
  event: EventId;
  laps: number;
  carIndex: number;
  /** each car keeps its own paint job */
  liveries: Record<string, LiveryChoice>;
  number: number;
  opponents: number;
  difficulty: number;
}

export interface Settings {
  volume: number;
  quality: 'low' | 'medium' | 'high';
}

const el = (tag: string, cls: string, parent: HTMLElement, html = '') => {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  parent.appendChild(e);
  return e;
};

type MenuItem = { label: string; action: () => void };

export class Screens {
  private root: HTMLElement;
  private current: HTMLElement | null = null;
  private menuItems: MenuItem[] = [];
  private menuSel = 0;
  private menuButtons: HTMLElement[] = [];
  garage: GarageState = { event: EVENTS[0].id, laps: 10, carIndex: 0, liveries: {}, number: 7, opponents: 7, difficulty: 1 };
  private garageRefs: { modeInfo?: HTMLElement; lapsRow?: HTMLElement; laps?: HTMLElement[]; go?: HTMLElement; accents?: HTMLElement[]; stripes?: HTMLElement[]; mode?: HTMLElement[]; name?: HTMLElement; style?: HTMLElement; blurb?: HTMLElement; bars?: HTMLElement[]; swatches?: HTMLElement[]; source?: HTMLElement; opp?: HTMLElement; num?: HTMLInputElement; diff?: HTMLElement[] } = {};
  onGarageChange: (s: GarageState) => void = () => {};
  onGarageStart: (s: GarageState) => void = () => {};
  sourceOf: (id: string) => string = () => '';

  constructor(root: HTMLElement) {
    this.root = root;
    try {
      const saved = JSON.parse(localStorage.getItem('dd.garage') ?? 'null');
      if (saved && typeof saved.carIndex === 'number' && saved.liveries) this.garage = { ...this.garage, ...saved };
      this.garage.carIndex = Math.min(Math.max(0, this.garage.carIndex), CAR_SPECS.length - 1);
      this.garage.laps ??= 10;
      // saves from before the Figure 8 became the default kept a numeric `mode`: start them on the 8
      delete (this.garage as { mode?: number }).mode;
      if (!EVENTS.some((e) => e.id === this.garage.event)) this.garage.event = EVENTS[0].id;
    } catch {
      /* ignore */
    }
  }

  private open(cls: string) {
    this.close();
    const s = el('div', `screen ${cls} interactive`, this.root);
    this.current = s;
    this.menuItems = [];
    this.menuButtons = [];
    return s;
  }

  close() {
    this.current?.remove();
    this.current = null;
    this.menuItems = [];
    this.menuButtons = [];
  }

  get isOpen() {
    return !!this.current;
  }

  // ------------------------------------------------------------------------------------ title
  title(onStart: () => void) {
    const s = this.open('title-screen');
    el('div', 'logo', s, 'DEMOLITION<span>DERBY</span>');
    el('div', 'tagline', s, 'FIGURE 8 RACE · THE BOWL · TOTAL DESTRUCTION');
    const load = el('div', 'loading', s, '<div></div>');
    const press = el('div', 'press', s, 'PRESS ENTER');
    press.style.display = 'none';
    s.addEventListener('click', () => {
      if (press.style.display !== 'none') onStart();
    });
    return {
      progress: (f: number) => ((load.firstChild as HTMLElement).style.width = `${Math.round(f * 100)}%`),
      ready: () => {
        load.style.display = 'none';
        press.style.display = '';
      },
    };
  }

  // ------------------------------------------------------------------------------------ garage
  showGarage() {
    const s = this.open('garage');
    const head = el('div', 'garage-head', s);
    el('h1', '', head, 'PICK YOUR RIDE');
    el('div', 'source-tag', head, '');
    const body = el('div', 'garage-body', s);

    const info = el('div', 'car-info', body);
    const nav = el('div', 'car-nav', info);
    const prev = el('button', 'arrow', nav, '‹');
    const name = el('div', 'car-name', nav, '');
    const next = el('button', 'arrow', nav, '›');
    prev.onclick = () => this.cycleCar(-1);
    next.onclick = () => this.cycleCar(1);
    const style = el('div', 'car-style', info);
    const blurb = el('div', 'car-blurb', info);
    const stats = el('div', 'stats', info);
    const bars: HTMLElement[] = [];
    for (const label of ['SPEED', 'ACCEL', 'HANDLING', 'TOUGHNESS', 'WEIGHT']) {
      el('div', '', stats, label);
      const b = el('div', 'bar', stats, '<div></div>');
      bars.push(b.firstChild as HTMLElement);
    }
    const source = el('div', 'source-tag', info, '');

    const setup = el('div', 'setup', body);
    const modeWrap = el('div', '', setup);
    el('div', 'field-label', modeWrap, 'EVENT');
    const modeSeg = el('div', 'seg mode', modeWrap);
    const mode = EVENTS.map((ev) => {
      const b = el('button', '', modeSeg, ev.label);
      b.onclick = () => {
        this.garage.event = ev.id;
        this.refreshGarage();
      };
      return b;
    });
    const modeInfo = el('div', 'mode-info', modeWrap, '');
    const lapsRow = el('div', '', setup);
    el('div', 'field-label', lapsRow, 'LAPS');
    const lapsSeg = el('div', 'seg', lapsRow);
    const lapChoices = [3, 5, 10, 15];
    const laps = lapChoices.map((n) => {
      const b = el('button', '', lapsSeg, String(n));
      b.onclick = () => {
        this.garage.laps = n;
        this.refreshGarage();
      };
      return b;
    });
    const paintWrap = el('div', '', setup);
    el('div', 'field-label', paintWrap, 'PAINT');
    const sw = el('div', 'swatches', paintWrap);
    const swatches = PAINTS.map((c) => {
      const d = el('div', 'swatch', sw);
      d.style.background = c;
      d.onclick = () => this.setLivery({ color: c });
      return d;
    });
    const accWrap = el('div', '', setup);
    el('div', 'field-label', accWrap, 'NEON');
    const aw = el('div', 'swatches accents', accWrap);
    const accents = ACCENTS.map((c) => {
      const d = el('div', 'swatch glow', aw);
      d.style.background = c;
      d.style.boxShadow = `0 0 10px ${c}`;
      d.onclick = () => this.setLivery({ accent: c });
      return d;
    });
    const stWrap = el('div', '', setup);
    el('div', 'field-label', stWrap, 'STRIPES');
    const stSeg = el('div', 'seg mode', stWrap);
    const stripes = STRIPES.map((st) => {
      const b = el('button', '', stSeg, st.toUpperCase());
      b.onclick = () => this.setLivery({ stripe: st });
      return b;
    });
    const numWrap = el('div', '', setup);
    el('div', 'field-label', numWrap, 'DOOR NUMBER');
    const num = el('input', 'num-input', numWrap) as HTMLInputElement;
    num.type = 'number';
    num.min = '1';
    num.max = '99';
    num.onchange = () => {
      this.garage.number = Math.max(1, Math.min(99, Math.round(Number(num.value) || 7)));
      this.refreshGarage();
    };
    num.onkeydown = (e) => e.stopPropagation();
    const oppWrap = el('div', '', setup);
    el('div', 'field-label', oppWrap, 'OPPONENTS');
    const step = el('div', 'step', oppWrap);
    const minus = el('button', '', step, '−');
    const opp = el('div', 'val', step, '');
    const plus = el('button', '', step, '+');
    minus.onclick = () => {
      this.garage.opponents = Math.max(1, this.garage.opponents - 1);
      this.refreshGarage();
    };
    plus.onclick = () => {
      this.garage.opponents = Math.min(11, this.garage.opponents + 1);
      this.refreshGarage();
    };
    const diffWrap = el('div', '', setup);
    el('div', 'field-label', diffWrap, 'DIFFICULTY');
    const seg = el('div', 'seg', diffWrap);
    const diff = DIFFICULTIES.map((d, i) => {
      const b = el('button', '', seg, d.name.toUpperCase());
      b.onclick = () => {
        this.garage.difficulty = i;
        this.refreshGarage();
      };
      return b;
    });
    const go = el('button', 'go-btn', setup, 'TO THE STARTING GRID ›');
    go.dataset.go = '1';
    go.onclick = () => this.onGarageStart(this.garage);
    el('div', 'garage-foot', s, '← → pick a car · ↑ ↓ paint · ENTER start · cars: the Collect Car collection, built in Blender');
    this.garageRefs = { lapsRow, laps, go, accents, stripes, mode, modeInfo, name, style, blurb, bars, swatches, source, opp, num, diff };
    this.refreshGarage();
  }

  /** The current car's paint job (defaults to the car's own livery). */
  livery(carIndex = this.garage.carIndex): LiveryChoice {
    const spec = CAR_SPECS[carIndex];
    return (this.garage.liveries[spec.id] ??= defaultLivery(spec));
  }

  private setLivery(patch: Partial<LiveryChoice>) {
    const l = { ...this.livery(), ...patch };
    l.stripeColor = stripeColorFor(l.color, l.accent, l.stripe);
    this.garage.liveries[CAR_SPECS[this.garage.carIndex].id] = l;
    this.refreshGarage();
  }

  cycleCar(d: number) {
    this.garage.carIndex = (this.garage.carIndex + d + CAR_SPECS.length) % CAR_SPECS.length;
    this.refreshGarage();
  }

  cyclePaint(d: number) {
    const i = PAINTS.indexOf(this.livery().color);
    this.setLivery({ color: PAINTS[(i + d + PAINTS.length) % PAINTS.length] });
  }

  private refreshGarage() {
    const r = this.garageRefs;
    const spec = CAR_SPECS[this.garage.carIndex];
    if (!r.name) return;
    r.name.textContent = spec.name.toUpperCase();
    r.style!.textContent = spec.style;
    r.blurb!.textContent = spec.blurb;
    const vals = [spec.stats.speed, spec.stats.accel, spec.stats.handling, spec.stats.toughness, spec.stats.weight];
    r.bars!.forEach((b, i) => (b.style.width = `${vals[i] * 10}%`));
    const lv = this.livery();
    r.swatches!.forEach((s, i) => s.classList.toggle('on', PAINTS[i] === lv.color));
    r.accents!.forEach((s, i) => s.classList.toggle('on', ACCENTS[i] === lv.accent));
    r.stripes!.forEach((b, i) => b.classList.toggle('on', STRIPES[i] === lv.stripe));
    r.opp!.textContent = String(this.garage.opponents);
    r.num!.value = String(this.garage.number);
    r.diff!.forEach((b, i) => b.classList.toggle('on', i === this.garage.difficulty));
    r.mode!.forEach((b, i) => b.classList.toggle('on', EVENTS[i].id === this.garage.event));
    const race = this.garage.event === 'race';
    r.lapsRow!.style.display = race ? '' : 'none';
    r.modeInfo!.textContent = (EVENTS.find((e) => e.id === this.garage.event) ?? EVENTS[0]).info;
    r.laps!.forEach((b) => b.classList.toggle('on', Number(b.textContent) === (this.garage.laps ?? 10)));
    r.go!.textContent = race ? 'TO THE STARTING GRID ›' : 'ENTER THE BOWL ›';
    r.source!.textContent = this.sourceOf(spec.id);
    try {
      localStorage.setItem('dd.garage', JSON.stringify(this.garage));
    } catch {
      /* ignore */
    }
    this.onGarageChange(this.garage);
  }

  // ------------------------------------------------------------------------------------ menus
  private menu(parent: HTMLElement, items: MenuItem[]) {
    this.menuItems = items;
    this.menuSel = 0;
    this.menuButtons = items.map((it, i) => {
      const b = el('button', 'menu-btn', parent, it.label);
      b.onclick = it.action;
      b.onmouseenter = () => this.selectMenu(i);
      return b;
    });
    this.selectMenu(0);
  }

  private selectMenu(i: number) {
    this.menuSel = (i + this.menuItems.length) % this.menuItems.length;
    this.menuButtons.forEach((b, k) => b.classList.toggle('sel', k === this.menuSel));
  }

  menuMove(d: number) {
    if (this.menuItems.length) this.selectMenu(this.menuSel + d);
  }

  menuConfirm() {
    this.menuItems[this.menuSel]?.action();
  }

  get hasMenu() {
    return this.menuItems.length > 0;
  }

  private raceResults(m: Match, actions: { again: () => void; garage: () => void }) {
    const race = m.race!;
    const s = this.open('overlay');
    const p = el('div', 'panel', s);
    const order = race.standings();
    const w = order[0].car;
    const me = race.of(m.player);
    const myPos = order.indexOf(me) + 1;
    el('h2', '', p, w.isPlayer ? 'YOU WIN!' : me.car.wrecked && !me.finished ? `WRECKED · P${myPos}` : `YOU FINISHED P${myPos}`);
    el('div', 'winner-line', p, escapeHtml(`FIGURE 8 · ${race.laps} LAPS · WINNER #${w.number} ${w.isPlayer ? 'YOU' : w.name.toUpperCase()}`));
    const L = race.track.length;
    const rows = order
      .map((st, i) => {
        const c = st.car;
        let result: string;
        const down = order[0].lap - st.lap;
        if (st.finished && down > 0) result = `+${down} LAP${down > 1 ? 'S' : ''}`;
        else if (st.finished) result = i === 0 ? formatLap(st.finishTime) : `+${formatLap(st.finishTime - order[0].finishTime)}`;
        else if (c.wrecked) result = 'WRECKED';
        else {
          const behind = Math.max(0, (order[0].progress - st.progress) / L);
          result = behind >= 1 ? `+${Math.floor(behind)} LAP${behind >= 2 ? 'S' : ''}` : `LAP ${Math.min(race.laps, st.lap + 1)}`;
        }
        return `<tr class="${c.isPlayer ? 'me' : ''}"><td class="num">${i + 1}</td><td><span class="chip" style="background:#${c.color.getHexString()}"></span>#${c.number} ${escapeHtml(c.isPlayer ? 'YOU' : c.name)}</td><td>${escapeHtml(c.spec.name)}</td><td>${result}</td><td>${formatLap(st.best)}</td><td>${c.wrecksScored}</td></tr>`;
      })
      .join('');
    el('table', 'results-table', p, `<tr><th>#</th><th>DRIVER</th><th>CAR</th><th>RESULT</th><th>BEST LAP</th><th>WRECKS</th></tr>${rows}`);
    this.menu(p, [
      { label: 'RACE AGAIN', action: actions.again },
      { label: 'BACK TO GARAGE', action: actions.garage },
    ]);
  }

  pause(actions: { resume: () => void; restart: () => void; garage: () => void }, settings: Settings, onSettings: (s: Settings) => void) {
    const s = this.open('overlay');
    const p = el('div', 'panel', s);
    el('h2', '', p, 'PAUSED');
    const vol = el('div', 'settings-row', p, '<span>VOLUME</span>');
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '1';
    range.step = '0.05';
    range.value = String(settings.volume);
    range.oninput = () => onSettings({ ...settings, volume: Number(range.value) });
    vol.appendChild(range);
    const q = el('div', 'settings-row', p, '<span>GRAPHICS</span>');
    const seg = el('div', 'seg', q);
    for (const level of ['low', 'medium', 'high'] as const) {
      const b = el('button', level === settings.quality ? 'on' : '', seg, level.toUpperCase());
      b.onclick = () => {
        settings = { ...settings, quality: level };
        onSettings(settings);
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      };
    }
    this.menu(p, [
      { label: 'RESUME', action: actions.resume },
      { label: 'RESTART', action: actions.restart },
      { label: 'BACK TO GARAGE', action: actions.garage },
    ]);
  }

  results(m: Match, actions: { again: () => void; garage: () => void }) {
    if (m.race) return this.raceResults(m, actions);
    const s = this.open('overlay');
    const p = el('div', 'panel', s);
    const w = m.winner!;
    el('h2', '', p, w.isPlayer ? 'YOU WIN!' : 'DERBY OVER');
    el('div', 'winner-line', p, escapeHtml(`${m.overReason.toUpperCase()} · WINNER #${w.number} ${w.isPlayer ? 'YOU' : w.name.toUpperCase()}`));
    const rows = m
      .standings()
      .map(
        (c, i) =>
          `<tr class="${c.isPlayer ? 'me' : ''}"><td class="num">${i + 1}</td><td><span class="chip" style="background:#${c.color.getHexString()}"></span>#${c.number} ${escapeHtml(c.isPlayer ? 'YOU' : c.name)}</td><td>${escapeHtml(c.spec.name)}</td><td>${c.wrecked ? 'WRECKED' : 'RUNNING'}</td><td>${c.spinsScored}</td><td>${c.wrecksScored}</td><td class="num">${c.points}</td></tr>`,
      )
      .join('');
    el('table', 'results-table', p, `<tr><th>#</th><th>DRIVER</th><th>CAR</th><th>STATUS</th><th>SPINS</th><th>WRECKS</th><th>PTS</th></tr>${rows}`);
    this.menu(p, [
      { label: 'RUN IT BACK', action: actions.again },
      { label: 'BACK TO GARAGE', action: actions.garage },
    ]);
  }
}
