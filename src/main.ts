import './style.css';
import { Sound } from './audio';
import { BELT_CAPACITY, TICK_HZ } from './config';
import { Game } from './game';
import { historyChart } from './history-chart';
import type { Collector } from './level';
import { LEVELS } from './levels';
import { parFor } from './par';
import { clearLog, getTester, loadLog, recordGame, setAnswer, setTester, toCsv, type Answer } from './playtest';
import { Records, type ResultSummary } from './records';
import { BoardRenderer, computeLayout, isLight, OverlayRenderer, type Layout } from './render';
import { isRule, RULES, type Rule } from './rules';
import { gameEfficiency, starsFor, starString, twoStarThreshold, type Stars } from './score';
import { movesEmoji, resendText, share, shareText } from './share';

const MAX_TICKS_PER_FRAME = 5;
const LANE_PREVIEW = 3;
const LEVEL_KEY = 'sandfall.level';
const RULE_KEY = 'sandfall.rule';
/** Pause after the last grain before the results card, so the pop and confetti can play. */
const WIN_CARD_DELAY_MS = 1100;
const LOSE_CARD_DELAY_MS = 700;
const STAR_DELAY_MS = 280;
/** Re-send rings in the moves list grow with the capacity they brought back, up to this many grains. */
const RESEND_DOT_FULL = 300;
const RESEND_DOT_MIN = 10;
const RESEND_DOT_MAX = 20;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $<HTMLElement>('stage');
const boardCanvas = $<HTMLCanvasElement>('board');
const slotsEl = $<HTMLElement>('slots');
const lanesEl = $<HTMLElement>('lanes');
const hudScore = $<HTMLElement>('hud-score');
const beltCount = $<HTMLElement>('belt-count');
const titleEl = $<HTMLElement>('level-title');
const ruleSelect = $<HTMLSelectElement>('rule-select');
const modal = $<HTMLElement>('modal');
const modalCard = $<HTMLElement>('modal-card');
const overlay = new OverlayRenderer($<HTMLCanvasElement>('overlay'));
const records = new Records();
const sound = new Sound();
/** Pending delayed actions for the current level (see `later`). */
let timers: number[] = [];

let levelIndex = 0;
let rule: Rule = 'line';
let game!: Game;
let board!: BoardRenderer;
let layout!: Layout;
let par = 0;
let renderedVersion = -1;
let endShown = false;
/** Playtest log index of the attempt that just ended. */
let endRecord = -1;
/** Personal-best comparison for the attempt that just ended. */
let endSummary: ResultSummary | null = null;
let endStars: Stars = 0;
let paused = false;

function start(index: number, nextRule: Rule): void {
  levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
  rule = nextRule;
  game = new Game(LEVELS[levelIndex]!, rule);
  board = new BoardRenderer(boardCanvas, game);
  par = parFor(game.def, rule) ?? fallbackPar(game);
  timers.forEach(clearTimeout);
  timers = [];
  sound.reset();
  overlay.reset();
  renderedVersion = -1;
  endShown = false;
  endSummary = null;
  paused = false;
  hideModal();
  titleEl.textContent = `${levelIndex + 1} · ${game.def.name}`;
  ruleSelect.value = rule;
  localStorage.setItem(LEVEL_KEY, String(levelIndex));
  localStorage.setItem(RULE_KEY, rule);
  history.replaceState(null, '', levelUrl());
  if (import.meta.env.DEV) Object.assign(window, { game });
  resize();
}

/** Only reachable while editing levels or config.ts before re-running `npm run par`. */
function fallbackPar(g: Game): number {
  console.warn(`Par table is stale for ${g.def.name} (${g.rule}); run "npm run par".`);
  return 50;
}

function levelUrl(): string {
  return `${location.pathname}?level=${levelIndex + 1}&rule=${rule}`;
}

function resize(): void {
  const rect = stage.getBoundingClientRect();
  layout = computeLayout(rect.width, rect.height, game);
  Object.assign(boardCanvas.style, {
    left: `${layout.left}px`,
    top: `${layout.top}px`,
    width: `${game.grid.width * layout.cell}px`,
    height: `${game.grid.height * layout.cell}px`,
  });
  overlay.resize(rect.width, rect.height);
}

// --- Main loop: fixed-rate logic, render every frame ---

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  acc += (now - last) / 1000;
  last = now;
  let ticks = 0;
  while (acc >= 1 / TICK_HZ && ticks < MAX_TICKS_PER_FRAME) {
    if (!paused) game.tick();
    acc -= 1 / TICK_HZ;
    ticks++;
  }
  if (ticks === MAX_TICKS_PER_FRAME) acc = 0; // Fell behind (e.g. tab was hidden); don't try to catch up.

  board.draw();
  playEffects();
  overlay.draw(game, layout);
  if (game.version !== renderedVersion) {
    renderedVersion = game.version;
    renderCollectors();
  }
  if (game.state !== 'playing' && !endShown) {
    endShown = true;
    finishAttempt();
    later(showEnd, game.state === 'won' ? WIN_CARD_DELAY_MS : LOSE_CARD_DELAY_MS);
  }
  requestAnimationFrame(frame);
}

/** Turns this frame's game events into sound and effects. */
function playEffects(): void {
  sound.eat(game.eatEvents.length);
  for (const e of game.events) {
    if (e.type === 'deploy') sound.deploy();
    else if (e.type === 'parked') sound.parked();
    else if (e.type === 'lost') sound.lose();
    else if (e.type === 'emptied') {
      sound.emptied();
      overlay.burst(e.collectorId, game.palette[e.color]!);
    } else if (e.type === 'won') {
      sound.win();
      overlay.celebrate(game, layout);
    }
  }
  game.events.length = 0;
}

function finishAttempt(): void {
  const won = game.state === 'won';
  const efficiency = gameEfficiency(game);
  endStars = starsFor(won, efficiency, par);
  endSummary = records.add(game.def, rule, won, { efficiency, resends: game.resends, seconds: seconds(), stars: endStars });
  endRecord = recordGame(game, levelIndex + 1, par, endStars);
}

function seconds(): number {
  return Math.round((game.tickCount / TICK_HZ) * 10) / 10;
}

// --- Collectors in slots and lanes ---

function chip(collector: Collector, onTap: () => boolean, enabled: boolean): HTMLButtonElement {
  const color = game.palette[collector.color]!;
  const el = document.createElement('button');
  el.className = isLight(color) ? 'chip light' : 'chip';
  el.style.setProperty('--c', color);
  el.textContent = String(collector.capacity);
  el.disabled = !enabled;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!onTap()) {
      sound.refused();
      el.classList.remove('refused');
      void el.offsetWidth; // Restart the animation.
      el.classList.add('refused');
    }
  });
  return el;
}

function renderCollectors(): void {
  const playing = game.state === 'playing';
  slotsEl.replaceChildren(
    ...game.slots.map((collector, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      if (collector) slot.append(chip(collector, () => game.deployFromSlot(i), playing));
      return slot;
    }),
  );
  lanesEl.replaceChildren(
    ...game.lanes.map((lane, i) => {
      const col = document.createElement('div');
      col.className = 'lane';
      lane.slice(0, LANE_PREVIEW).forEach((collector, j) => {
        const el = chip(collector, () => game.deployFromLane(i), playing && j === 0);
        // First level, nothing deployed yet: show where to tap instead of a text tutorial.
        if (levelIndex === 0 && game.stats.deploys === 0 && i === 0 && j === 0) el.classList.add('hint');
        col.append(el);
      });
      if (lane.length > LANE_PREVIEW) {
        const more = document.createElement('div');
        more.className = 'more';
        more.textContent = `+${lane.length - LANE_PREVIEW}`;
        col.append(more);
      }
      return col;
    }),
  );
  renderHud();
}

/** Live efficiency starts at 100% and only drops, by each re-sent collector's leftover capacity. */
function renderHud(): void {
  const best = records.get(game.def, rule).bestEfficiency;
  const efficiency = gameEfficiency(game);
  hudScore.replaceChildren(
    el('span', `Efficiency ${efficiency}%`, efficiency < par ? 'over-par' : ''),
    ` · Par ${par}%`,
    best === null ? '' : ` · Best ${best}%`,
  );
  beltCount.textContent = `Belt ${game.belt.length}/${BELT_CAPACITY}`;
}

// --- Modals ---

function showModal(...children: (Node | string)[]): void {
  modalCard.replaceChildren(...children);
  modal.hidden = false;
}

function hideModal(): void {
  modal.hidden = true;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text: string, onClick: () => void, className = 'btn'): HTMLButtonElement {
  const b = el('button', text, className);
  b.addEventListener('click', onClick);
  return b;
}

function row(...children: Node[]): HTMLDivElement {
  const div = el('div', '', 'row');
  div.append(...children);
  return div;
}

/** A stat tile: label, value, the change against your previous best, and an optional note. */
function statTile(
  label: string,
  value: string,
  current: number,
  best: number | null,
  unit: string,
  better: 'higher' | 'lower',
  note = '',
): HTMLDivElement {
  const tile = el('div', '', 'tile');
  let delta: HTMLElement;
  if (best === null) {
    delta = el('div', 'First clear', 'delta');
  } else {
    const diff = Math.round((current - best) * 10) / 10;
    const improved = better === 'higher' ? diff > 0 : diff < 0;
    const arrow = diff > 0 ? '▲' : '▼';
    if (diff === 0) delta = el('div', '= your best', 'delta');
    else delta = el('div', `${arrow} ${Math.abs(diff)}${unit} vs best`, improved ? 'delta good' : 'delta bad');
  }
  tile.append(el('div', label, 'tile-label'), el('div', value, 'tile-value'), delta);
  if (note) tile.append(el('div', note, 'delta'));
  return tile;
}

const ANSWERS: [Answer, string][] = [
  ['planned', 'Planned ahead'],
  ['both', 'A bit of both'],
  ['tapped', 'Just tapped'],
];

/** The playtest question, kept small under the results so it doesn't get in the way. */
function playtestQuestion(): HTMLElement {
  const box = el('div', '', 'playtest');
  const choices = ANSWERS.map(([answer, label]) => {
    const b = button(label, () => {
      setAnswer(endRecord, answer);
      choices.forEach((c) => c.classList.toggle('selected', c === b));
    }, 'btn small');
    return b;
  });
  box.append(el('p', 'Playtest: how did you play that level?'), row(...choices));
  return box;
}

/**
 * Every move in order: a filled dot for a collector's first trip, a ring for
 * re-sending a parked one. Each dot's tooltip gives the moment it was made,
 * since timing changes the outcome as much as order does.
 */
function movesList(): HTMLElement {
  const box = el('div', '', 'trend');
  box.append(el('div', `Your moves · ${game.moves.length - game.resends} sends, ${resendText(game.resends)}`, 'tile-label'));
  const strip = el('div', '', 'moves');
  game.moves.forEach((m, i) => {
    const resend = m.source === 'slot';
    const dot = el('span', '', resend ? 'move-dot resend' : 'move-dot');
    dot.style.setProperty('--c', game.palette[m.color]!);
    if (resend) {
      // Bigger ring = more capacity brought back unused = a costlier re-send.
      const size = `${RESEND_DOT_MIN + (RESEND_DOT_MAX - RESEND_DOT_MIN) * Math.min(1, m.capacity / RESEND_DOT_FULL)}px`;
      Object.assign(dot.style, { width: size, height: size });
    }
    dot.title = `Move ${i + 1} at ${clock(m.tick / TICK_HZ)}: ${resend ? `re-sent with ${m.capacity} left (wasted)` : `sent a ${m.capacity}`}`;
    strip.append(dot);
  });
  const legend = el('div', '', 'legend');
  legend.append(el('span', '', 'move-dot'), ' first send ', el('span', '', 'move-dot resend'), ' re-send');
  box.append(strip, legend);
  return box;
}

function clock(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** setTimeout that a restart cancels, so delayed sounds and cards don't leak into the next level. */
function later(fn: () => void, ms: number): void {
  timers.push(window.setTimeout(fn, ms));
}

function showEnd(): void {
  const summary = endSummary!;
  const won = game.state === 'won';
  const isLast = levelIndex === LEVELS.length - 1;
  const efficiency = gameEfficiency(game);
  const time = seconds();

  if (!won) {
    const { bestEfficiency, bestStars } = summary.before;
    showModal(
      el('h2', game.loseReason === 'overflow' ? 'Out of slots' : 'No moves left'),
      el(
        'p',
        game.loseReason === 'overflow'
          ? 'A collector came back with nowhere to park.'
          : 'None of your collectors can reach their color.',
      ),
      el('p', bestEfficiency === null ? `Par is ${par}% efficiency.` : `Your best: ${bestEfficiency}% ${starString(bestStars)} · Par ${par}%`),
      movesList(),
      row(button('Retry', () => start(levelIndex, rule), 'btn primary'), button('Levels', showLevels)),
      playtestQuestion(),
    );
    return;
  }

  const perfect = game.resends === 0;
  const badge = summary.firstClear ? 'First clear!' : summary.newBestEfficiency ? 'New best!' : '';
  const stars = el('div', '', 'stars');
  stars.setAttribute('aria-label', `${endStars} of 3 stars`);
  // Stars pop in one at a time, each with its own ding.
  for (let i = 0; i < 3; i++) {
    const star = el('span', i < endStars ? '★' : '☆', i < endStars ? 'star on' : 'star');
    star.style.animationDelay = `${STAR_DELAY_MS * (i + 1)}ms`;
    stars.append(star);
    if (i < endStars) later(() => sound.star(i), STAR_DELAY_MS * (i + 1));
  }
  const goal =
    endStars === 3
      ? perfect
        ? 'Perfect: nothing re-sent, nothing wasted.'
        : `At or above par (${par}%).`
      : `Reach ${par}% for ★★★${endStars < 2 ? `, ${twoStarThreshold(par)}% for ★★` : ''}.`;

  const shareStatus = el('p', '', 'share-status');
  const shareBox = el('textarea');
  shareBox.readOnly = true;
  shareBox.hidden = true;
  shareBox.addEventListener('focus', () => shareBox.select());
  const shareButton = button('Share', async () => {
    const text = shareText({
      levelNumber: levelIndex + 1,
      levelName: game.def.name,
      ruleLabel: RULES.find((r) => r.id === rule)!.label,
      stars: endStars,
      efficiency,
      par,
      resends: game.resends,
      seconds: time,
      perfect,
      newBest: summary.newBestEfficiency,
      movesLine: movesEmoji(game.moves, game.palette),
      url: location.origin + levelUrl(),
    });
    const outcome = await share(text);
    shareStatus.textContent = { shared: 'Shared!', copied: 'Copied! Paste it anywhere.', cancelled: '', manual: 'Copy this:' }[outcome];
    shareBox.hidden = outcome !== 'manual';
    shareBox.value = text;
    if (outcome === 'manual') shareBox.focus();
  });

  const card: Node[] = [
    el('h2', 'Mural complete!'),
    ...(badge ? [el('div', badge, 'badge')] : []),
    stars,
    el('p', goal),
    row(
      statTile(
        'Efficiency',
        `${efficiency}%`,
        efficiency,
        summary.before.bestEfficiency,
        ' pts',
        'higher',
        game.wasted ? `${resendText(game.resends)} · ${game.wasted} grains wasted` : 'no re-sends',
      ),
      statTile('Time', `${time}s`, time, summary.before.bestSeconds, 's', 'lower'),
    ),
  ];
  if (summary.after.recent.length >= 2) {
    const trend = el('div', '', 'trend');
    trend.append(
      el('div', 'Your recent clears · efficiency, higher is better', 'tile-label'),
      historyChart(summary.after.recent, par),
    );
    card.push(trend);
  }
  card.push(
    movesList(),
    row(
      shareButton,
      button(isLast ? 'Levels' : 'Next level', isLast ? showLevels : () => start(levelIndex + 1, rule), 'btn primary'),
    ),
    shareStatus,
    shareBox,
    row(button('Replay', () => start(levelIndex, rule), 'btn link'), button('Levels', showLevels, 'btn link')),
    playtestQuestion(),
  );
  showModal(...card);
}

function showLevels(): void {
  paused = game.state === 'playing';
  const log = loadLog();
  const ruleInfo = RULES.find((r) => r.id === rule)!;

  const grid = el('div', '', 'level-grid');
  LEVELS.forEach((def, i) => {
    const record = records.get(def, rule);
    const b = button(`${i + 1} · ${def.name}`, () => start(i, rule), i === levelIndex ? 'btn primary' : 'btn');
    if (record.wins > 0) {
      const marks = el('span', starString(record.bestStars), 'done');
      marks.setAttribute('aria-label', `best ${record.bestStars} of 3 stars`);
      b.append(marks);
    }
    grid.append(b);
  });

  const tester = el('input');
  tester.placeholder = 'Tester name';
  tester.value = getTester();
  tester.addEventListener('change', () => setTester(tester.value));
  Object.assign(tester.style, { width: '100%', padding: '10px', borderRadius: '10px', border: '0', marginTop: '8px' });

  const csv = el('textarea');
  csv.readOnly = true;
  csv.hidden = true;
  csv.addEventListener('focus', () => csv.select());

  showModal(
    el('h2', 'Levels'),
    el('p', `${ruleInfo.label}: ${ruleInfo.hint}`),
    el('p', `Stars are your best under ${ruleInfo.label}.`),
    grid,
    el('h3', `Playtest log (${log.length} games)`),
    tester,
    row(
      button('Copy log', () => {
        csv.value = toCsv(loadLog());
        csv.hidden = false;
        // Clipboard needs a secure context, which LAN http isn't, so the textarea is the fallback.
        navigator.clipboard?.writeText(csv.value).catch(() => csv.select());
      }),
      button('Clear log', () => {
        if (confirm('Delete all recorded playtest games on this device?')) {
          clearLog();
          showLevels();
        }
      }),
    ),
    csv,
    row(
      button(
        'Close',
        () => {
          if (game.state === 'playing') {
            paused = false;
            hideModal();
          } else {
            showEnd();
          }
        },
        'btn primary',
      ),
    ),
  );
}

// --- Wiring ---

for (const r of RULES) {
  const option = el('option', r.label);
  option.value = r.id;
  ruleSelect.append(option);
}
ruleSelect.addEventListener('change', () => {
  if (isRule(ruleSelect.value)) start(levelIndex, ruleSelect.value);
});
$('btn-restart').addEventListener('click', () => start(levelIndex, rule));
$('btn-levels').addEventListener('click', showLevels);
const soundButton = $<HTMLButtonElement>('btn-sound');
const showSoundState = () => {
  soundButton.textContent = sound.muted ? '🔇' : '🔊';
  soundButton.setAttribute('aria-label', sound.muted ? 'Sound off' : 'Sound on');
};
soundButton.addEventListener('click', () => {
  sound.toggleMute();
  showSoundState();
});
showSoundState();
// Browsers only start audio after a user gesture; any tap will do.
document.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
// The stage is whatever space the slots and lanes leave, so re-measure whenever it changes size.
new ResizeObserver(() => resize()).observe(stage);

const params = new URLSearchParams(location.search);
const urlLevel = Number(params.get('level'));
const urlRule = params.get('rule');
const savedRule = localStorage.getItem(RULE_KEY);
start(
  urlLevel > 0 ? urlLevel - 1 : Number(localStorage.getItem(LEVEL_KEY) ?? 0),
  isRule(urlRule) ? urlRule : isRule(savedRule) ? savedRule : 'line',
);
requestAnimationFrame(frame);
