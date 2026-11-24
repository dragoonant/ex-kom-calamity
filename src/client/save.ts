// SAV-1, SAV-2 (KB rule 22): one versioned envelope under localStorage['ib-save']; the snapshot is what reopens.
import type { Campaign } from '../engine/campaign';
import type { Action, BattleState } from '../engine/types';

export const SAVE_KEY = 'ib-save';
export type Screen = 'briefing' | 'battle' | 'debrief' | 'hangar';
export interface Envelope { v: 1; savedAt: number; screen: Screen; campaign: Campaign; battle: { seed: number; actions: Action[]; snapshot: BattleState } | null }
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export type LoadResult = { ok: true; env: Envelope } | { ok: false; reason: string } | { ok: false; reason: 'none' };

function store(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function writeSave(env: Envelope, s: StorageLike | null = store()): string | null {
  if (!s) return 'This browser refuses storage, so the game cannot be saved.';
  try { s.setItem(SAVE_KEY, JSON.stringify(env)); return null; } catch (e) { return `The save could not be written (${(e as Error).name}).`; }
}

export function readSave(s: StorageLike | null = store()): LoadResult {
  if (!s) return { ok: false, reason: 'none' };
  let text: string | null = null;
  try { text = s.getItem(SAVE_KEY); } catch { return { ok: false, reason: 'Storage could not be read.' }; }
  if (!text) return { ok: false, reason: 'none' };
  try {
    const env = JSON.parse(text) as Envelope;
    if (env?.v !== 1 || !env.campaign || !env.screen) return { ok: false, reason: 'The save is from another version of the game.' };
    if (env.screen === 'battle' && !env.battle?.snapshot) return { ok: false, reason: 'The save is missing its battle.' };
    return { ok: true, env };
  } catch { return { ok: false, reason: 'The save is damaged and cannot be read.' }; }
}

export function clearSave(s: StorageLike | null = store()): void { try { s?.removeItem(SAVE_KEY); } catch { /* refused storage: nothing to clear */ } }

/** SAV-2: what Continue names. */
export function describe(env: Envelope): string {
  const when = new Date(env.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  if (env.screen === 'battle' && env.battle) {
    const b = env.battle.snapshot;
    const ours = b.units.filter((u) => u.side === 'player' && u.alive).length, theirs = b.units.filter((u) => u.side === 'hostile' && u.alive).length;
    return `Marrow Yard, round ${b.round}, ${b.phase === 'player' ? 'your phase' : 'Directorate phase'}: ${ours} Lanterns vs ${theirs} walkers. Saved ${when}.`;
  }
  const label = { briefing: 'Briefing, Marrow Yard', debrief: 'Debrief, Marrow Yard', hangar: 'The hangar', battle: 'Battle' }[env.screen];
  return `${label}, ${env.campaign.credits.toLocaleString()} credits. Saved ${when}.`;
}
