import { TICK_HZ } from './config';
import type { Game } from './game';
import type { Rule } from './rules';
import { gameEfficiency, type Stars } from './score';

/**
 * Local playtest log. Each finished attempt is recorded so testers can export
 * a CSV after a session; the "answer" is the player's own read on whether they
 * planned their moves, which is the main question the prototype has to answer.
 */
export type Answer = 'planned' | 'both' | 'tapped';

export interface PlaytestRecord {
  at: string;
  tester: string;
  level: number;
  name: string;
  rule: Rule;
  result: 'won' | 'lost';
  reason: string;
  seconds: number;
  deploys: number;
  resends: number;
  /** Efficiency percent; par is the par efficiency. */
  efficiency: number;
  par: number;
  stars: Stars;
  /** Mean seconds between moves (from level start to first move, then between moves). */
  avgThinkSeconds: number;
  maxSlotsUsed: number;
  answer: Answer | '';
}

const LOG_KEY = 'sandfall.playtest.v1';
const TESTER_KEY = 'sandfall.tester';

export function loadLog(): PlaytestRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as PlaytestRecord[]) : [];
  } catch {
    return [];
  }
}

function saveLog(records: PlaytestRecord[]): void {
  localStorage.setItem(LOG_KEY, JSON.stringify(records));
}

export function getTester(): string {
  return localStorage.getItem(TESTER_KEY) ?? '';
}

export function setTester(name: string): void {
  localStorage.setItem(TESTER_KEY, name.trim());
}

/** Records a finished attempt and returns its index, for attaching the answer later. */
export function recordGame(game: Game, levelNumber: number, par: number, stars: Stars): number {
  const ticks = [0, ...game.stats.deployTicks];
  const gaps = ticks.slice(1).map((t, i) => t - ticks[i]!);
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const records = loadLog();
  records.push({
    at: new Date().toISOString(),
    tester: getTester(),
    level: levelNumber,
    name: game.def.name,
    rule: game.rule,
    result: game.state === 'won' ? 'won' : 'lost',
    reason: game.loseReason ?? '',
    seconds: round1(game.tickCount / TICK_HZ),
    deploys: game.stats.deploys,
    resends: game.resends,
    efficiency: gameEfficiency(game),
    par,
    stars,
    avgThinkSeconds: round1(avgGap / TICK_HZ),
    maxSlotsUsed: game.stats.maxSlotsUsed,
    answer: '',
  });
  saveLog(records);
  return records.length - 1;
}

export function setAnswer(index: number, answer: Answer): void {
  const records = loadLog();
  const record = records[index];
  if (!record) return;
  record.answer = answer;
  saveLog(records);
}

export function clearLog(): void {
  localStorage.removeItem(LOG_KEY);
}

export function toCsv(records: PlaytestRecord[]): string {
  const columns: (keyof PlaytestRecord)[] = [
    'at',
    'tester',
    'level',
    'name',
    'rule',
    'result',
    'reason',
    'seconds',
    'deploys',
    'resends',
    'efficiency',
    'par',
    'stars',
    'avgThinkSeconds',
    'maxSlotsUsed',
    'answer',
  ];
  const escape = (v: unknown) => {
    // Entries logged before a column existed leave it blank.
    const s = v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...records.map((r) => columns.map((c) => escape(r[c])).join(','))].join('\n');
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
