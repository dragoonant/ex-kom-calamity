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
    const out_ = a.status === 'watching' || a.status === 'travelling';
    if (out_ !== (a.building !== null)) out.push(`${a.id} watch building mismatch`);
    if (out_ && !CITY.buildings.some((b) => b.id === a.building)) out.push(`${a.id} watches no building`);
    // CINV-12: a drive is under way exactly when the agent is driving (a squad until it reaches the door).
    const driving = a.status === 'travelling' || a.status === 'returning' || (a.status === 'raiding' && !!s.raid && !s.raid.arrived);
    if (driving !== (a.leg !== null)) out.push(`${a.id} leg mismatch (${a.status})`);
    if (a.leg && (a.status === 'travelling' || a.status === 'returning') && a.leg.arrive !== a.until) out.push(`${a.id} leg ends off its until`);
    if (a.leg && (a.leg.arrive <= a.leg.depart || [a.leg.fx, a.leg.fy, a.leg.tx, a.leg.ty].some((v) => v < 0 || v > CITY.size * 10))) out.push(`${a.id} leg out of range`);
  }
  if (new Set(s.agents.map((a) => a.id)).size !== s.agents.length) out.push('agent ids repeat');
  if (s.agents.filter((a) => a.status !== 'dead').length > t.roster.cap) out.push('roster over cap');
  // CINV-6
  if (s.slips.length > t.signs.keep) out.push('too many slips kept');
  for (let i = 1; i < s.slips.length; i++) if (s.slips[i]!.id <= s.slips[i - 1]!.id) out.push('slip ids not increasing');
  // CINV-7
  if (s.orgs.length !== CITY.orgs.length || s.buildings.length !== CITY.buildings.length) out.push('city shape changed');
  // CINV-9: the shelf, the lab and the workshop stay sane.
  for (const [k, v] of Object.entries(s.shelf)) if (!Number.isInteger(v) || v < 0) out.push(`shelf ${k} is ${v}`);
  if (new Set(s.lab.done).size !== s.lab.done.length) out.push('a project is done twice');
  if (s.lab.project && s.lab.done.includes(s.lab.project)) out.push('the lab works on a done project');
  for (const k of ['shell-plate', 'arc-carbine'] as const) if (s.shop.sabotaged[k] > s.shop.stock[k] || s.shop.stock[k] < 0) out.push(`stock of ${k} is broken`);
  if (s.raid && s.raid.arrived && s.raid.takers + s.raid.fighters > s.raid.hostiles) out.push('raid composition exceeds its hostiles');
  // CINV-10: the air war's cars, craft and crash sites agree.
  for (const car of s.cars) {
    if ((car.status === 'flying') !== (car.craft !== null)) out.push(`${car.id} flying without a craft or the reverse`);
    if (car.craft && !s.craft.some((c) => c.id === car.craft)) out.push(`${car.id} chases a craft that is gone`);
    if (car.hp < 0 || car.hp > t.air.carHp) out.push(`${car.id} hp ${car.hp}`);
  }
  for (const c of s.craft) {
    if (c.hp <= 0 || c.hp > c.maxHp) out.push(`${c.id} hp ${c.hp}`);
    if (c.x < 0 || c.y < 0 || c.x > CITY.size * 10 || c.y > CITY.size * 10) out.push(`${c.id} off the map`);
  }
  if (new Set(s.crashes.map((c) => c.id)).size !== s.crashes.length) out.push('crash ids repeat');
  // CINV-11
  if (![1, 2, 3].includes(s.act)) out.push(`act ${s.act}`);
  if (s.defence && s.act !== 3) out.push('an assault outside act 3');
  if (s.hqFound && s.act < 2) out.push('headquarters found in act 1');
  // CINV-8
  if (s.over && s.over.tick > s.tick) out.push('over in the future');
  return out;
}
