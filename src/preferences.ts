import type { Preferences } from './types';

const defaults: Preferences = { interval: 2, theme: 'dark' };
export function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem('systempanel.preferences') ?? '{}') as Partial<Preferences>;
    return {
      interval: value.interval === 1 || value.interval === 5 ? value.interval : 2,
      theme: value.theme === 'light' || value.theme === 'system' ? value.theme : 'dark',
    };
  } catch { return defaults; }
}
export function writePreferences(preferences: Preferences) {
  try { localStorage.setItem('systempanel.preferences', JSON.stringify(preferences)); }
  catch { /* Preferences remain usable for this session if storage is unavailable. */ }
}
