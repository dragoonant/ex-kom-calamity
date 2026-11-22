// Effects queue: engine events turned into short-lived things the board draws and the audio director plays
// (KB recipe step 3: events drive sounds and animation). Pure functions; the store appends to the queue in commit,
// Effects.tsx and audio/director.ts consume by id. Hidden information stays hidden (VIEW-2, AI-9): a shot by a
// shooter the squad cannot see makes no flash and no sound; structure events are public (VIEW-1).
import type { GameEvent, Pos, State, Unit } from '../engine';
import { view } from '../engine';

export type FxKind =
  | 'muzzle' // a shot: flash at the shooter, tracer towards the target
  | 'hit' // a round or a bite lands on a unit
  | 'blast' // a charge goes off
  | 'breach' // a wall, door or window becomes rubble
  | 'collapse' // a floor falls into void
  | 'down' // a unit goes down
  | 'revealed' // a host drops its disguise
  | 'taken' // a citizen is taken, watched by the squad
  | 'fell' // a unit drops with a floor
  | 'chip'; // a stray round or a blow strikes a wall, door or window (D21: sparks and a puff of its material)

export interface Fx {
  id: number;
  kind: FxKind;
  tick: number;
  at: Pos;
  /** For a muzzle flash: where the round goes. */
  to?: Pos;
  /** Weapon id for a shot or a hit; material of what broke for a breach. */
  weapon?: string;
  material?: string;
  side?: Unit['side'];
  /** Rounds that missed still flash; the hit spark is its own fx. */
  hit?: boolean;
  /** The unit the effect belongs to (shooter, unit hit, unit down, thrower, revealed host), for the figure's animation. */
  unit?: string;
  /** For a taking: the taker that bit. */
  by?: string;
}

let fxSeq = 0;

export const MAX_FX = 240;

function unitPos(s: State, id: string): Pos | null {
  const u = s.units.find((x) => x.id === id);
  return u ? { x: u.x, y: u.y, level: u.level } : null;
}

/** Turns one commit's events into effects the agency may see. */
export function fxFor(events: GameEvent[], before: State, after: State): Fx[] {
  const out: Fx[] = [];
  const seen = new Set(view(after, 'agency').units.map((u) => u.id));
  const seenBefore = new Set(view(before, 'agency').units.map((u) => u.id));
  const visible = (id: string) => seen.has(id) || seenBefore.has(id) || after.units.find((u) => u.id === id)?.side === 'agency';
  const push = (f: Omit<Fx, 'id'>) => out.push({ id: ++fxSeq, ...f });
  // A blast damages many tiles at once and draws its own debris; chips are for rounds striking walls.
  const blastTicks = new Set(events.filter((e) => e.type === 'blast').map((e) => e.tick));
  for (const e of events) {
    switch (e.type) {
      case 'shot': {
        if (!visible(e.shooter) && !visible(e.target)) break;
        const at = unitPos(after, e.shooter) ?? unitPos(before, e.shooter);
        const to = unitPos(after, e.target) ?? unitPos(before, e.target);
        if (!at) break;
        push({ kind: 'muzzle', tick: e.tick, at, to: to ?? undefined, weapon: e.weapon, side: after.units.find((u) => u.id === e.shooter)?.side, hit: e.hit, unit: e.shooter });
        break;
      }
      case 'suppressFire': {
        if (!visible(e.unit)) break;
        const at = unitPos(after, e.unit) ?? unitPos(before, e.unit);
        if (at) push({ kind: 'muzzle', tick: e.tick, at, to: e.at, weapon: e.weapon, side: after.units.find((u) => u.id === e.unit)?.side, hit: false, unit: e.unit });
        break;
      }
      case 'damaged': {
        if (!visible(e.unit)) break;
        const at = unitPos(after, e.unit);
        if (at) push({ kind: 'hit', tick: e.tick, at, side: after.units.find((u) => u.id === e.unit)?.side, unit: e.unit });
        break;
      }
      case 'down': {
        if (!visible(e.unit)) break;
        const at = unitPos(after, e.unit);
        if (at) push({ kind: 'down', tick: e.tick, at, side: after.units.find((u) => u.id === e.unit)?.side, unit: e.unit });
        break;
      }
      case 'blast':
        push({ kind: 'blast', tick: e.tick, at: e.at, unit: e.unit });
        break;
      case 'tileDamaged': {
        if (blastTicks.has(e.tick)) break;
        const was = after.tiles.find((t) => t.x === e.at.x && t.y === e.at.y && t.level === e.at.level);
        push({ kind: 'chip', tick: e.tick, at: e.at, material: was?.material });
        break;
      }
      case 'tileDestroyed': {
        const was = before.tiles.find((t) => t.x === e.at.x && t.y === e.at.y && t.level === e.at.level);
        push({ kind: e.now === 'void' ? 'collapse' : 'breach', tick: e.tick, at: e.at, material: was?.material });
        break;
      }
      case 'fell': {
        if (!visible(e.unit)) break;
        push({ kind: 'fell', tick: e.tick, at: e.to, side: after.units.find((u) => u.id === e.unit)?.side });
        break;
      }
      case 'revealed': {
        const at = unitPos(after, e.unit);
        if (at) push({ kind: 'revealed', tick: e.tick, at, unit: e.unit });
        break;
      }
      case 'taken': {
        if (!e.seen) break;
        const at = unitPos(after, e.unit);
        if (at) push({ kind: 'taken', tick: e.tick, at, unit: e.unit, by: e.by });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

export function appendFx(old: Fx[], add: Fx[]): Fx[] {
  if (add.length === 0) return old;
  const all = [...old, ...add];
  return all.length > MAX_FX ? all.slice(all.length - MAX_FX) : all;
}
