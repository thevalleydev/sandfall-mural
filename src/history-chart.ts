import type { Attempt } from './records';

const SVG = 'http://www.w3.org/2000/svg';
/** Internal drawing size; the SVG scales to fill its container. */
const WIDTH = 300;
const HEIGHT = 72;
const PAD_TOP = 18; // room for the latest value's label
const PAD_BOTTOM = 6;
const PAD_X = 8;
const PAR_LABEL_WIDTH = 52;
const DOT_RADIUS = 4;
/** Invisible hover/tap target around each dot, larger than the dot itself. */
const HIT_RADIUS = 11;

/**
 * Efficiency over recent clears (higher is better) as a line with dots, plus a
 * par reference line. Efficiency values sit close together, so this zooms the
 * y-range to the data instead of starting at zero (fine for a line; bars would
 * have to start at zero). Earlier clears are muted, the latest is the accent
 * and the only labeled point; every dot has a hover/tap tooltip.
 */
export function historyChart(recent: Attempt[], par: number): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `Efficiency in your last ${recent.length} clears: ${recent.map((a) => `${a.efficiency}%`).join(', ')}. Par ${par}%.`,
  );
  svg.classList.add('history-chart');

  const values = recent.map((a) => a.efficiency);
  const lo = Math.max(0, Math.floor(Math.min(par, ...values) - 3));
  const hi = Math.min(100, Math.ceil(Math.max(par, ...values) + 1));
  const plotRight = WIDTH - PAR_LABEL_WIDTH;
  const x = (i: number) => (recent.length === 1 ? plotRight / 2 : PAD_X + (i * (plotRight - 2 * PAD_X)) / (recent.length - 1));
  const y = (v: number) => PAD_TOP + ((hi - v) / Math.max(1, hi - lo)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const parY = y(par);
  svg.append(line(0, parY, plotRight, parY, 'par'), text(plotRight + 4, parY + 4, `par ${par}%`, 'start', 'par-label'));

  const path = document.createElementNS(SVG, 'polyline');
  path.setAttribute('points', recent.map((a, i) => `${x(i)},${y(a.efficiency)}`).join(' '));
  path.setAttribute('class', 'trend-line');
  svg.append(path);

  recent.forEach((attempt, i) => {
    const latest = i === recent.length - 1;
    const cx = x(i);
    const cy = y(attempt.efficiency);
    const group = document.createElementNS(SVG, 'g');
    const title = document.createElementNS(SVG, 'title');
    title.textContent = `${latest ? 'This clear' : `Clear ${i + 1}`}: ${attempt.efficiency}% efficient, ${attempt.resends} re-sends, ${Math.round(attempt.seconds)}s`;
    group.append(title, circle(cx, cy, HIT_RADIUS, 'hit'), circle(cx, cy, DOT_RADIUS, latest ? 'dot latest' : 'dot'));
    svg.append(group);
    if (latest) svg.append(text(cx, cy - 8, `${attempt.efficiency}%`, cx > plotRight - 20 ? 'end' : 'middle', 'value'));
  });
  return svg;
}

function circle(cx: number, cy: number, r: number, className: string): SVGCircleElement {
  const el = document.createElementNS(SVG, 'circle');
  el.setAttribute('cx', String(cx));
  el.setAttribute('cy', String(cy));
  el.setAttribute('r', String(r));
  el.setAttribute('class', className);
  return el;
}

function line(x1: number, y1: number, x2: number, y2: number, className: string): SVGLineElement {
  const el = document.createElementNS(SVG, 'line');
  Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => el.setAttribute(k, String(v)));
  el.setAttribute('class', className);
  return el;
}

function text(x: number, y: number, content: string, anchor: string, className: string): SVGTextElement {
  const el = document.createElementNS(SVG, 'text');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('text-anchor', anchor);
  el.setAttribute('class', className);
  el.textContent = content;
  return el;
}
