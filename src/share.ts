import type { Move } from './game';
import { starString, type Stars } from './score';

export interface ShareInfo {
  levelNumber: number;
  levelName: string;
  ruleLabel: string;
  stars: Stars;
  /** Efficiency percent, and par efficiency. */
  efficiency: number;
  par: number;
  resends: number;
  seconds: number;
  perfect: boolean;
  newBest: boolean;
  /** Emoji summary of the moves (see movesEmoji). */
  movesLine: string;
  /** Link that opens the same level and rule. */
  url: string;
}

/** Text for sharing a result: short enough for a chat message, with a link to play the same level. */
export function shareText(s: ShareInfo): string {
  const flags = [s.perfect && 'Perfect!', s.newBest && 'New personal best'].filter(Boolean);
  return [
    `Sandfall Mural #${s.levelNumber} ${s.levelName} (${s.ruleLabel})`,
    `${starString(s.stars)} ${s.efficiency}% efficient (par ${s.par}%) · ${resendText(s.resends)} · ${Math.round(s.seconds)}s${flags.length ? ` · ${flags.join(' · ')}` : ''}`,
    s.movesLine,
    `Can you beat it? ${s.url}`,
  ].join('\n');
}

export function resendText(n: number): string {
  return n === 0 ? 'no re-sends' : `${n} re-send${n === 1 ? '' : 's'}`;
}

export interface DailyShareInfo {
  number: number;
  weekday: string;
  stars: Stars;
  efficiency: number;
  par: number;
  resends: number;
  seconds: number;
  /** Attempt the daily was won on (1 = first try). */
  attempts: number;
  streak: number;
  movesLine: string;
  /** Link that opens this exact daily. */
  url: string;
}

/** Daily Mural share text: same day, same puzzle for everyone, so results compare directly. */
export function dailyShareText(s: DailyShareInfo): string {
  const extras = [s.streak > 1 && `🔥 ${s.streak}-day streak`, s.attempts > 1 && `solved on try ${s.attempts}`].filter(Boolean);
  return [
    `Sandfall Mural Daily #${s.number} (${s.weekday})`,
    `${starString(s.stars)} ${s.efficiency}% efficient (par ${s.par}%) · ${resendText(s.resends)} · ${Math.round(s.seconds)}s`,
    ...(extras.length ? [extras.join(' · ')] : []),
    s.movesLine,
    `Play it: ${s.url}`,
  ].join('\n');
}

/** Emoji colors (Twemoji approximations) for each square/circle pair. */
const EMOJI: [hex: string, square: string, circle: string][] = [
  ['#dd2e44', '🟥', '🔴'],
  ['#f4900c', '🟧', '🟠'],
  ['#fdcb58', '🟨', '🟡'],
  ['#78b159', '🟩', '🟢'],
  ['#55acee', '🟦', '🔵'],
  ['#aa8ed6', '🟪', '🟣'],
  ['#c1694f', '🟫', '🟤'],
  ['#31373d', '⬛', '⚫'],
  ['#e6e7e8', '⬜', '⚪'],
];
const EMOJI_PER_LINE = 10;

/**
 * One emoji per move in the nearest emoji color: a square for a collector's
 * first trip, a circle for re-sending a parked one. A run with few circles
 * reads as efficient at a glance.
 */
export function movesEmoji(moves: readonly Move[], palette: readonly string[]): string {
  const symbols = moves.map((m) => {
    const [, square, circle] = nearestEmoji(palette[m.color] ?? '#000000');
    return m.source === 'lane' ? square : circle;
  });
  const lines: string[] = [];
  for (let i = 0; i < symbols.length; i += EMOJI_PER_LINE) lines.push(symbols.slice(i, i + EMOJI_PER_LINE).join(''));
  return lines.join('\n');
}

function nearestEmoji(hex: string): (typeof EMOJI)[number] {
  const [r, g, b] = rgb(hex);
  let best = EMOJI[0]!;
  let bestDistance = Infinity;
  for (const entry of EMOJI) {
    const [er, eg, eb] = rgb(entry[0]);
    const d = (r - er) ** 2 + (g - eg) ** 2 + (b - eb) ** 2;
    if (d < bestDistance) [best, bestDistance] = [entry, d];
  }
  return best;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'manual';

/**
 * Uses the phone's share sheet where available, otherwise the clipboard.
 * Both need a secure context (https or localhost); over plain LAN http the
 * caller has to show the text for manual copying ('manual').
 */
export async function share(text: string): Promise<ShareOutcome> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'manual';
  }
}
