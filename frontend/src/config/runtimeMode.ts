/** Public build-time marker. It contains no credential and is safe to expose. */
export const APP_RUNTIME_MODE = import.meta.env.VITE_AULIA_APP_MODE === 'demo'
  ? 'demo'
  : 'standard';

export const IS_DEMO_MODE = APP_RUNTIME_MODE === 'demo';
