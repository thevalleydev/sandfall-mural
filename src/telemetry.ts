/**
 * Minimal, provider-neutral telemetry: is the game being played, and how?
 *
 * Off unless the build sets VITE_ANALYTICS_PROVIDER ('goatcounter' or
 * 'umami') and VITE_ANALYTICS_ID (see .env.production). Both providers are
 * cookie-free and count page visits on their own; this module adds a handful
 * of game events. Nothing is sent from local dev, or for players with Do Not
 * Track / Global Privacy Control turned on. No personal data is collected.
 */

export type Props = Record<string, string | number | boolean>;

interface Provider {
  scriptUrl: string;
  attributes: Record<string, string>;
  /** Sends one event; returns false if the provider script isn't ready yet. */
  send(name: string, props: Props): boolean;
}

declare global {
  interface Window {
    goatcounter?: { count?: (vars: { path: string; title: string; event: boolean }) => void };
    umami?: { track: (name: string, data: Props) => void };
  }
}

/** Props that GoatCounter (which has no event properties) folds into the event path. */
const GOATCOUNTER_PATH_PROPS = ['mode', 'level', 'rule', 'result', 'stars', 'outcome', 'muted'];

function provider(kind: string | undefined, id: string | undefined): Provider | null {
  if (!id) return null;
  if (kind === 'goatcounter') {
    return {
      scriptUrl: 'https://gc.zgo.at/count.js',
      attributes: { 'data-goatcounter': `https://${id}.goatcounter.com/count` },
      send(name, props) {
        if (!window.goatcounter?.count) return false;
        const parts = GOATCOUNTER_PATH_PROPS.filter((k) => k in props).map((k) => String(props[k]));
        window.goatcounter.count({ path: [name, ...parts].join('/'), title: JSON.stringify(props), event: true });
        return true;
      },
    };
  }
  if (kind === 'umami') {
    return {
      scriptUrl: 'https://cloud.umami.is/script.js',
      attributes: { 'data-website-id': id },
      send(name, props) {
        if (!window.umami) return false;
        window.umami.track(name, props);
        return true;
      },
    };
  }
  return null;
}

let active: Provider | null = null;
const queue: [string, Props][] = [];

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

/** Loads the configured provider's script. Call once at startup. */
export function initTelemetry(): void {
  if (import.meta.env.DEV || optedOut()) return;
  active = provider(import.meta.env.VITE_ANALYTICS_PROVIDER, import.meta.env.VITE_ANALYTICS_ID);
  if (!active) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = active.scriptUrl;
  for (const [k, v] of Object.entries(active.attributes)) script.setAttribute(k, v);
  script.addEventListener('load', flush);
  document.head.append(script);
}

/** Records a game event. Safe to call anytime; it's a no-op when telemetry is off. */
export function track(name: string, props: Props = {}): void {
  if (import.meta.env.DEV) console.debug('[telemetry]', name, props);
  if (!active) return;
  queue.push([name, props]);
  flush();
}

function flush(): void {
  while (active && queue.length && active.send(...queue[0]!)) queue.shift();
}
