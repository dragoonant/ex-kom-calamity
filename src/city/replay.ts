// CARCH-7: the compressed action log, replay and the state hash.
import { createCity } from './game';
import { cityStep } from './step';
import type { CityAction, CityLogEntry, CitySetup, CityState } from './types';

/** Returns a new array; consecutive ticks merge into one entry. */
export function appendCityLog(log: CityLogEntry[], action: CityAction): CityLogEntry[] {
  const last = log[log.length - 1];
  if (action.type === 'tick') {
    if (last && last.type === 'tick') {
      const out = log.slice(0, -1);
      out.push({ type: 'tick', count: last.count + 1 });
      return out;
    }
    return [...log, { type: 'tick', count: 1 }];
  }
  return [...log, action];
}

export function expandCityLog(log: CityLogEntry[]): CityAction[] {
  const out: CityAction[] = [];
  for (const e of log) {
    if (e.type === 'tick') for (let i = 0; i < e.count; i++) out.push({ type: 'tick' });
    else out.push(e);
  }
  return out;
}

/** Rebuilds a state from its setup and log. Throws on an entry the engine rejects (a programmer error). */
export function replayCity(setup: CitySetup, log: CityLogEntry[]): CityState {
  let s = createCity(setup);
  for (const a of expandCityLog(log)) {
    const r = cityStep(s, a);
    if (!r.ok) throw new Error(`city replay rejected ${JSON.stringify(a)}: ${r.reason}`);
    s = r.state;
  }
  return s;
}

/** 32-bit FNV-1a of the state's JSON text, as 8 hex digits. */
export function hashCity(state: CityState): string {
  const text = JSON.stringify(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
