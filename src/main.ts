import './style.css';
import { Sound } from './audio';
import { BELT_CAPACITY, TICK_HZ } from './config';
import { dailyFor, dailyPar, isDateKey, todayKey, type Daily } from './daily';
import { DailyResults, type DailyOutcome } from './daily-results';
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
import { dailyShareText, movesEmoji, resendText, share, shareText } from './share';
import { initTelemetry, track, type Props } from './telemetry';

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
const dailyResults = new DailyResults();
const sound = new Sound();
/** Pending delayed actions for the current level (see `later`). */
let timers: number[] = [];

/** Ladder position and rule; kept while playing a daily so "Play levels" returns to them. */
let levelIndex = 0;
let rule: Rule = 'line';
/** The daily being played, or null when playing the level ladder. */
let daily: Daily | null = null;
let game!: Game;
let board!: BoardRenderer;
let layout!: Layout;
let par = 0;
let renderedVersion = -1;
let endShown = false;
/** Playtest log index of the attempt that just ended. */
let endRecord = -1;
/** Personal-best comparison for the ladder attempt that just ended. */
let endSummary: ResultSummary | null = null;
/** Daily result for the daily attempt that just ended. */
let dailyOutcome: DailyOutcome | null = null;
let endStars: Stars = 0;
let paused = false;

/** Starts a ladder level. */
function start(index: number, nextRule: Rule): void {
  levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
  rule = nextRule;
  daily = null;
  localStorage.setItem(LEVEL_KEY, String(levelIndex));
  localStorage.setItem(RULE_KEY, rule);
  const def = LEVELS[levelIndex]!;
  begin(
    new Game(def, rule),
    parFor(def, rule) ?? stalePar(`${def.name} (${rule})`, 'npm run par'),
    `${levelIndex + 1} · ${def.name}`,
    levelUrl(),
  );
}

/** Starts the Daily Mural for a date (today unless following a link to another day). */
function startDaily(date: string): void {
  daily = dailyFor(date);
  begin(
    new Game(daily.def, daily.rule, daily.seed),
    dailyPar(daily) ?? stalePar(`the ${date} daily`, 'npm run dailies'),
    `Daily #${daily.number} · ${daily.weekday}`,
    dailyUrl(date),
  );
}

function restart(): void {
  if (daily) startDaily(daily.date);
  else start(levelIndex, rule);
}

function begin(next: Game, nextPar: number, title: string, url: string): void {
  game = next;
  board = new BoardRenderer(boardCanvas, game);
  par = nextPar;
  timers.forEach(clearTimeout);
  timers = [];
  sound.reset();
  overlay.reset();
  renderedVersion = -1;
  endShown = false;
  endSummary = null;
  dailyOutcome = null;
  paused = false;
  hideModal();
  titleEl.textContent = title;
  ruleSelect.value = game.rule;
  ruleSelect.disabled = daily !== null; // Every daily uses the same rule.
  history.replaceState(null, '', url);
  if (import.meta.env.DEV) Object.assign(window, { game });
  resize();
  track('level_start', modeProps());
}

/** Only reachable while editing levels or config.ts before regenerating the par tables. */
function stalePar(what: string, command: string): number {
  console.warn(`Par is missing or stale for ${what}; run "${command}".`);
  return 50;
}

function levelUrl(): string {
  return `${location.pathname}?level=${levelIndex + 1}&rule=${rule}`;
}

function dailyUrl(date: string): string {
  return `${location.pathname}?daily=${date}`;
}

/** Telemetry props identifying what's being played. */
function modeProps(): Props {
  return daily
    ? { mode: 'daily', level: daily.number, rule: daily.rule }
    : { mode: 'ladder', level: levelIndex + 1, rule };
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
  const time = seconds();
  endStars = starsFor(won, efficiency, par);
  if (daily) {
    dailyOutcome = dailyResults.record(daily.date, todayKey(), won, {
      efficiency,
      stars: endStars,
      seconds: time,
      resends: game.resends,
      movesLine: movesEmoji(game.moves, game.palette),
    });
  } else {
    endSummary = records.add(game.def, rule, won, { efficiency, resends: game.resends, seconds: time, stars: endStars });
  }
  // Level 0 in the playtest log means a daily.
  endRecord = recordGame(game, daily ? 0 : levelIndex + 1, par, endStars);
  track('level_end', {
    ...modeProps(),
    result: won ? 'won' : 'lost',
    stars: endStars,
    efficiency,
    resends: game.resends,
    seconds: Math.round(time),
    ...(dailyOutcome && { official: dailyOutcome.official, attempts: dailyOutcome.result.attempts, streak: dailyOutcome.streak.current }),
  });
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
        if (!daily && levelIndex === 0 && game.stats.deploys === 0 && i === 0 && j === 0) el.classList.add('hint');
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
  const efficiency = gameEfficiency(game);
  const extra = daily
    ? (() => {
        const streak = dailyResults.streak(todayKey()).current;
        return streak > 0 ? ` · 🔥 ${streak}` : '';
      })()
    : (() => {
        const best = records.get(game.def, rule).bestEfficiency;
        return best === null ? '' : ` · Best ${best}%`;
      })();
  hudScore.replaceChildren(
    el('span', `Efficiency ${efficiency}%`, efficiency < par ? 'over-par' : ''),
    ` · Par ${par}%`,
    extra,
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

/** A stat tile without a comparison: label, value and a note. */
function plainTile(label: string, value: string, note: string): HTMLDivElement {
  const tile = el('div', '', 'tile');
  tile.append(el('div', label, 'tile-label'), el('div', value, 'tile-value'), el('div', note, 'delta'));
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

/** Stars that pop in one at a time, each with its own ding. */
function starsReveal(stars: Stars): HTMLElement {
  const box = el('div', '', 'stars');
  box.setAttribute('aria-label', `${stars} of 3 stars`);
  for (let i = 0; i < 3; i++) {
    const star = el('span', i < stars ? '★' : '☆', i < stars ? 'star on' : 'star');
    star.style.animationDelay = `${STAR_DELAY_MS * (i + 1)}ms`;
    box.append(star);
    if (i < stars) later(() => sound.star(i), STAR_DELAY_MS * (i + 1));
  }
  return box;
}

function goalText(stars: Stars, perfect: boolean): string {
  if (stars === 3) return perfect ? 'Perfect: nothing re-sent, nothing wasted.' : `At or above par (${par}%).`;
  return `Reach ${par}% for ★★★${stars < 2 ? `, ${twoStarThreshold(par)}% for ★★` : ''}.`;
}

/** Share button plus the status line and manual-copy box it reports into. */
function shareControls(text: () => string): { shareButton: HTMLButtonElement; status: HTMLElement; box: HTMLTextAreaElement } {
  const status = el('p', '', 'share-status');
  const box = el('textarea');
  box.readOnly = true;
  box.hidden = true;
  box.addEventListener('focus', () => box.select());
  const shareButton = button('Share', async () => {
    const value = text();
    const outcome = await share(value);
    track('share', { ...modeProps(), outcome });
    status.textContent = { shared: 'Shared!', copied: 'Copied! Paste it anywhere.', cancelled: '', manual: 'Copy this:' }[outcome];
    box.hidden = outcome !== 'manual';
    box.value = value;
    if (outcome === 'manual') box.focus();
  });
  return { shareButton, status, box };
}

function loseText(): [string, string] {
  return game.loseReason === 'overflow'
    ? ['Out of slots', 'A collector came back with nowhere to park.']
    : ['No moves left', 'None of your collectors can reach their color.'];
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
  if (daily) showDailyEnd(daily);
  else showLadderEnd();
}

function showLadderEnd(): void {
  const summary = endSummary!;
  const won = game.state === 'won';
  const isLast = levelIndex === LEVELS.length - 1;
  const efficiency = gameEfficiency(game);
  const time = seconds();

  if (!won) {
    const { bestEfficiency, bestStars } = summary.before;
    const [title, detail] = loseText();
    showModal(
      el('h2', title),
      el('p', detail),
      el('p', bestEfficiency === null ? `Par is ${par}% efficiency.` : `Your best: ${bestEfficiency}% ${starString(bestStars)} · Par ${par}%`),
      movesList(),
      row(button('Retry', restart, 'btn primary'), button('Levels', showLevels)),
      playtestQuestion(),
    );
    return;
  }

  const perfect = game.resends === 0;
  const badge = summary.firstClear ? 'First clear!' : summary.newBestEfficiency ? 'New best!' : '';
  const { shareButton, status, box } = shareControls(() =>
    shareText({
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
    }),
  );

  const card: Node[] = [
    el('h2', 'Mural complete!'),
    ...(badge ? [el('div', badge, 'badge')] : []),
    starsReveal(endStars),
    el('p', goalText(endStars, perfect)),
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
    status,
    box,
    row(button('Replay', restart, 'btn link'), button('Levels', showLevels, 'btn link')),
    playtestQuestion(),
  );
  showModal(...card);
}

function showDailyEnd(d: Daily): void {
  const outcome = dailyOutcome!;
  const won = game.state === 'won';
  const isToday = d.date === todayKey();
  const official = outcome.result;
  const backToLevels = button('Play levels', () => start(levelIndex, rule), 'btn');

  if (!won) {
    const [title, detail] = loseText();
    showModal(
      el('h2', title),
      el('p', detail),
      el(
        'p',
        !isToday
          ? 'This is a past daily; only today’s counts toward your streak.'
          : official.won
            ? `Practice run. Your daily score is still ${official.efficiency}% ${starString(official.stars ?? 0)}.`
            : 'Your daily score is your first win. Keep trying!',
      ),
      movesList(),
      row(button('Retry', restart, 'btn primary'), backToLevels),
      playtestQuestion(),
    );
    return;
  }

  const efficiency = gameEfficiency(game);
  const time = seconds();
  const perfect = game.resends === 0;
  const streak = outcome.streak;
  const badge = !isToday
    ? 'Past daily · doesn’t count toward your streak'
    : !outcome.official
      ? 'Practice run'
      : streak.current > 1
        ? `🔥 ${streak.current}-day streak`
        : 'Streak started!';
  // Sharing always shows the day's official result (your first win), not a practice run.
  const shareSource = outcome.official || !official.won ? null : official;
  const { shareButton, status, box } = shareControls(() =>
    dailyShareText({
      number: d.number,
      weekday: d.weekday,
      stars: shareSource?.stars ?? endStars,
      efficiency: shareSource?.efficiency ?? efficiency,
      par,
      resends: shareSource?.resends ?? game.resends,
      seconds: shareSource?.seconds ?? time,
      attempts: isToday ? official.attempts : 1,
      streak: isToday ? streak.current : 0,
      movesLine: shareSource?.movesLine ?? movesEmoji(game.moves, game.palette),
      url: location.origin + dailyUrl(d.date),
    }),
  );

  showModal(
    el('h2', `Daily Mural #${d.number} complete!`),
    el('div', badge, 'badge'),
    starsReveal(endStars),
    el('p', goalText(endStars, perfect)),
    ...(isToday && !outcome.official && official.won
      ? [el('p', `Your daily score is your first win: ${official.efficiency}% ${starString(official.stars ?? 0)}.`)]
      : []),
    row(
      plainTile('Efficiency', `${efficiency}%`, game.wasted ? `${resendText(game.resends)} · ${game.wasted} grains wasted` : 'no re-sends'),
      plainTile('Streak', `🔥 ${streak.current}`, `best ${streak.best} · ${clockUntilTomorrow()} to the next daily`),
    ),
    weekStrip(),
    movesList(),
    row(shareButton, backToLevels),
    status,
    box,
    row(button('Replay (practice)', restart, 'btn link')),
    playtestQuestion(),
  );
}

/** Monday–Sunday of this week: stars for each daily you've won, ✗ for tried-but-not-won, · for not played. */
function weekStrip(): HTMLElement {
  const today = todayKey();
  const box = el('div', '', 'week');
  for (const { date, result } of dailyResults.week(today)) {
    const cell = el('div', '', date === today ? 'day today' : 'day');
    const label = dailyFor(date).weekday.slice(0, 2);
    const mark = result?.won ? '★'.repeat(result.stars ?? 0) || '✓' : result ? '✗' : '·';
    cell.append(el('div', label, 'day-label'), el('div', mark, result?.won ? 'day-mark won' : 'day-mark'));
    cell.title = result?.won ? `${date}: ${result.efficiency}%` : date;
    box.append(cell);
  }
  return box;
}

/** "5h 12m" until local midnight, when the next daily unlocks. */
function clockUntilTomorrow(): string {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const minutes = Math.ceil((midnight.getTime() - now.getTime()) / 60_000);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function showLevels(): void {
  paused = game.state === 'playing';
  const log = loadLog();
  const ruleInfo = RULES.find((r) => r.id === rule)!;

  // Today's daily first: it's the same puzzle for everyone.
  const today = todayKey();
  const todays = dailyFor(today);
  const todaysResult = dailyResults.get(today);
  const streak = dailyResults.streak(today);
  const dailyButton = button(`📅 Daily Mural #${todays.number} · ${todays.weekday}`, () => startDaily(today), 'btn daily-btn');
  dailyButton.append(
    el(
      'span',
      todaysResult?.won ? `${starString(todaysResult.stars ?? 0)} ${todaysResult.efficiency}%` : 'Not played yet',
      'done',
    ),
  );

  const grid = el('div', '', 'level-grid');
  LEVELS.forEach((def, i) => {
    const record = records.get(def, rule);
    const b = button(`${i + 1} · ${def.name}`, () => start(i, rule), !daily && i === levelIndex ? 'btn primary' : 'btn');
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
    dailyButton,
    el('p', streak.current > 0 ? `🔥 ${streak.current}-day streak (best ${streak.best})` : 'Same puzzle for everyone, new every day.'),
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
$('btn-restart').addEventListener('click', restart);
$('btn-levels').addEventListener('click', showLevels);
$('btn-daily').addEventListener('click', () => startDaily(todayKey()));
const soundButton = $<HTMLButtonElement>('btn-sound');
const showSoundState = () => {
  soundButton.textContent = sound.muted ? '🔇' : '🔊';
  soundButton.setAttribute('aria-label', sound.muted ? 'Sound off' : 'Sound on');
};
soundButton.addEventListener('click', () => {
  track('mute', { muted: sound.toggleMute() });
  showSoundState();
});
showSoundState();
// Browsers only start audio after a user gesture; any tap will do.
document.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
// The stage is whatever space the slots and lanes leave, so re-measure whenever it changes size.
new ResizeObserver(() => resize()).observe(stage);

initTelemetry();
const params = new URLSearchParams(location.search);
const urlLevel = Number(params.get('level'));
const urlRule = params.get('rule');
const savedRule = localStorage.getItem(RULE_KEY);
levelIndex = Number(localStorage.getItem(LEVEL_KEY) ?? 0);
rule = isRule(urlRule) ? urlRule : isRule(savedRule) ? savedRule : 'line';
if (params.has('daily')) {
  // ?daily opens today's; ?daily=YYYY-MM-DD opens that day's (shared links), but never a future one.
  const asked = params.get('daily');
  const today = todayKey();
  startDaily(isDateKey(asked) && asked <= today ? asked : today);
} else {
  start(urlLevel > 0 ? urlLevel - 1 : levelIndex, rule);
}
requestAnimationFrame(frame);
