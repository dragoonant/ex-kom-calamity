// CINV-1..8: what must hold after every city step.
import { CITY } from '../data/city';
import type { CityState } from '../city';

export function cityInvariants(s: CityState): string[] {
  const out: string[] = [];
  const t = s.tuning;
  const text = JSON.stringify(s);
  // CINV-1
  if (/NaN|Infinity|null,null/.test(text) && /NaN|Infinity/.test(text)) out.push('state holds NaN or Infinity');
  const ints: [string, number][] = [['tick', s.tick], ['money', s.money], ['confidence', s.confidence], ['biomass', s.biomass]];
  for (const o of s.orgs) ints.push([`${o.id}.infiltration`, o.infiltration], [`${o.id}.standing`, o.standing]);
  for (const [k, v] of ints) if (!Number.isInteger(v)) out.push(`${k} is not an integer: ${v}`);
  // CINV-2
  if (s.confidence < 0 || s.confidence > 100) out.push(`confidence ${s.confidence} out of 0..100`);
  // CINV-3
  for (const o of s.orgs) {
    if (o.infiltration < 0 || o.infiltration > t.spread.cap) out.push(`${o.id} infiltration ${o.infiltration} out of range`);
    if (o.standing < 0 || o.standing > 100) out.push(`${o.id} standing ${o.standing} out of range`);
    if (o.turned && o.infiltration === 0) out.push(`${o.id} turned at 0`);
  }
  if (s.biomass < 0) out.push('biomass below 0');
  // CINV-4: the raid and the roster agree.
  const raiding = s.agents.filter((a) => a.status === 'raiding').map((a) => a.id).sort();
  const onRaid = (s.raid?.agents ?? []).slice().sort();
  if (JSON.stringify(raiding) !== JSON.stringify(onRaid)) out.push(`raiding agents ${raiding} != raid ${onRaid}`);
  if (s.raid && (s.raid.agents.length < 1 || s.raid.agents.length > t.raid.maxAgents)) out.push('raid squad size out of range');
  // CINV-5
  for (const a of s.agents) {
    if ((a.status === 'watching') !== (a.building !== null)) out.push(`${a.id} watch building mismatch`);
    if (a.status === 'watching' && !CITY.buildings.some((b) => b.id === a.building)) out.push(`${a.id} watches no building`);
  }
  if (new Set(s.agents.map((a) => a.id)).size !== s.agents.length) out.push('agent ids repeat');
  if (s.agents.filter((a) => a.status !== 'dead').length > t.roster.cap) out.push('roster over cap');
  // CINV-6
  if (s.slips.length > t.signs.keep) out.push('too many slips kept');
  for (let i = 1; i < s.slips.length; i++) if (s.slips[i]!.id <= s.slips[i - 1]!.id) out.push('slip ids not increasing');
  // CINV-7
  if (s.orgs.length !== CITY.orgs.length || s.buildings.length !== CITY.buildings.length) out.push('city shape changed');
  // CINV-8
  if (s.over && s.over.tick > s.tick) out.push('over in the future');
  return out;
}
