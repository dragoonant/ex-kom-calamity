// ARCH-9: the compressed action log, replay and the state hash.
import type { Action, LogEntry, Setup, State } from './types';
import { createGame } from './game';
import { step } from './step';

/** Returns a new array; consecutive ticks merge into one entry. */
export function appendLog(log: LogEntry[], action: Action): LogEntry[] {
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

export function expandLog(log: LogEntry[]): Action[] {
  const out: Action[] = [];
  for (const e of log) {
    if (e.type === 'tick') for (let i = 0; i < e.count; i++) out.push({ type: 'tick' });
    else out.push(e);
  }
  return out;
}

/** Rebuilds a state from its setup and log. Throws on a log entry the engine rejects (a programmer error). */
export function replay(setup: Setup, log: LogEntry[]): State {
  let s = createGame(setup);
  for (const a of expandLog(log)) {
    const r = step(s, a);
    if (!r.ok) throw new Error(`replay rejected ${JSON.stringify(a)}: ${r.reason}`);
    s = r.state;
  }
  return s;
}

/** 32-bit FNV-1a of the state's JSON text, as 8 hex digits. */
export function hashState(state: State): string {
  const text = JSON.stringify(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
