/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'goatcounter' or 'umami'; telemetry is off when unset. */
  readonly VITE_ANALYTICS_PROVIDER?: string;
  /** GoatCounter site code, or Umami website ID. */
  readonly VITE_ANALYTICS_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
