// The switchboard's words for the city's slips and events (docs/spec/20-city.md RULING SIGN-2: the engine carries
// ids, the client words them). The spread reads as "too perfect" by day and "the hum" by night (PLAN.md D25).
// Every name is a placeholder (D10).
import { CITY, RESEARCH } from '../../data/city';
import type { Band, CityEvent, CityState, Slip } from '../../city';
import { clockOf } from '../../city';

export type Tone = 'note' | 'ok' | 'caution' | 'alert';

export interface TraySlip {
  id: number;
  tick: number;
  stamp: string;
  text: string;
  tone: Tone;
  /** The building to light when the slip is hovered, if it names one. */
  building: string | null;
  kind: string;
}

const pick = <T,>(items: T[], n: number): T => items[Math.abs(n) % items.length]!;

export function buildingName(id: string | null): string {
  return CITY.buildings.find((b) => b.id === id)?.name ?? 'a building';
}
export function orgName(id: string | null): string {
  return CITY.orgs.find((o) => o.id === id)?.name ?? 'an organisation';
}
export function districtName(id: string | null): string {
  return CITY.districts.find((d) => d.id === id)?.name ?? 'the city';
}

export function stampOf(state: CityState, tick: number): string {
  const c = clockOf(state.tuning, tick);
  return `D${c.day + 1} ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
}

export function projectName(id: string): string {
  return RESEARCH.projects.find((p) => p.id === id)?.name ?? id;
}
export function itemName(id: string): string {
  return (RESEARCH.items.find((i) => i.id === id)?.name ?? id).toLowerCase();
}

/** What each finished project tells the agency (the lab reports carry the story, docs/strategic-layer.md 2). */
export const LAB_REPORT: Record<string, string> = {
  restraints: 'A host can now be brought in alive. They do not struggle; they wait.',
  'host-tells': 'A host blinks a little too rarely and never shivers. Watchers will be surer.',
  interrogation: 'A captive can be made to speak. What it says is always about someone else.',
  'hand-scanner': 'The scanner reads the amber thread under the skin. Watchers will see hosts more often.',
  antiserum: 'A bitten agent can be saved if the dose goes in at once.',
  'taker-cage': 'A taker can be caged alive. It never stops reaching for the nearest neck.',
  evacuation: 'Citizens can be cleared from a building faster than the takers move.',
  'shell-plate': 'The fighter\u2019s chitin, pressed into plates, stops a pistol round. The workshop can make suits.',
  'arc-carbine': 'The amber core discharges like a capacitor. The workshop can make a weapon of it.',
  'core-study': 'Every core is grown from the same seed. They all lean toward one place in the city.',
  'source-trace': 'The cores point to one organisation. Its walls can now be broken all the way down.',
};

export const BAND_WORDS: Record<Band, string> = {
  clean: 'nothing out of place',
  low: 'faint signs',
  some: 'clear signs',
  heavy: 'a heavy infestation',
};

/** SIGN-2: one slip in the switchboard's words. The variant is fixed by the slip id, so a reload words it the same. */
export function slipText(sl: Slip): string {
  const b = buildingName(sl.building);
  const o = orgName(sl.org);
  const d = districtName(sl.district);
  switch (sl.kind) {
    case 'missing':
      return pick(
        [
          `Missing persons: another report from ${d}. Last seen walking home in a straight line.`,
          `Missing persons: a family in ${d} reports a son who came home and is not the same.`,
          `Missing persons: two shift workers in ${d} did not come home; their coats were found folded.`,
        ],
        sl.id,
      );
    case 'purchase':
      return pick(
        [
          `${o} placed an odd order: forty crates of cold storage and mineral salts.`,
          `${o} bought amber resin by the drum through a holding company.`,
          `${o} ordered sealed refrigerated vans with no windows.`,
        ],
        sl.id,
      );
    case 'power':
      return pick(
        [
          `${b}: the power draw spiked after dark; its lamps flickered amber in time with a building across town.`,
          `${b}: the night meter reads three times the day's load, and the hall lights pulse.`,
        ],
        sl.id,
      );
    case 'perfect':
      return pick(
        [
          `${b}: no sick days in sixty days, and not one complaint filed.`,
          `${b}: the staff arrive and leave in step, and all of them smile.`,
          `${b}: the windows are spotless, the lawn is greener than the street's, and nobody remembers a bad day.`,
        ],
        sl.id,
      );
    case 'vote':
      return pick([`${o} lobbied the council to cut the agency's budget.`, `${o} raised its prices to the agency without notice.`], sl.id);
    case 'hum':
      return `${b}: a low hum on the wireless band after dark; every window pulses amber in unison.`;
    case 'spotted':
      return `${b}: a watcher saw one of the staff stand without blinking for an hour. A host, most likely.`;
    case 'confession':
      return `The captive talked before it went still: its cell answers to ${o}.`;
    default:
      return `${b}: an unusual report.`;
  }
}

function slipTone(sl: Slip): Tone {
  if (sl.kind === 'hum' || sl.kind === 'spotted' || sl.kind === 'confession') return 'alert';
  if (sl.kind === 'power' || sl.kind === 'perfect' || sl.kind === 'vote') return 'caution';
  return 'note';
}

function agentName(s: CityState, id: string): string {
  return s.agents.find((a) => a.id === id)?.name ?? id;
}

/** Turns city events into tray slips. Reads only what the agency's view carries (CVIEW-1). */
export function traySlipsFor(events: CityEvent[], after: CityState, nextId: () => number): TraySlip[] {
  const out: TraySlip[] = [];
  const add = (text: string, tone: Tone, building: string | null, kind: string, tick = after.tick) => out.push({ id: nextId(), tick, stamp: stampOf(after, tick), text, tone, building, kind });
  for (const e of events) {
    switch (e.type) {
      case 'slip':
        add(slipText(e.slip), slipTone(e.slip), e.slip.building ?? CITY.buildings.find((b) => b.org === e.slip.org)?.id ?? null, `slip-${e.slip.kind}`, e.slip.tick);
        break;
      case 'watched':
        add(`${agentName(after, e.agent)} reports from ${buildingName(e.building)}: ${BAND_WORDS[e.band]}.`, e.band === 'heavy' || e.band === 'some' ? 'alert' : e.band === 'low' ? 'caution' : 'ok', e.building, 'watched');
        break;
      case 'watchSent':
        add(`${agentName(after, e.agent)} is watching ${buildingName(e.building)}.`, 'note', e.building, 'order');
        break;
      case 'recalled':
        add(`${agentName(after, e.agent)} called back.`, 'note', null, 'order');
        break;
      case 'raidOrdered':
        add(`Squad of ${e.agents.length} lifting off for ${buildingName(e.building)}.`, 'note', e.building, 'launch');
        break;
      case 'raidArrived':
        add(`The squad is at the door of ${buildingName(e.building)}.`, 'alert', e.building, 'door');
        break;
      case 'raidResolved': {
        const r = e.result;
        const text = e.scandal
          ? `${buildingName(e.building)} was clean. The papers call it a raid on innocent citizens.`
          : r.won
            ? `Raid on ${buildingName(e.building)} won: ${r.hostilesDown} hostiles down${r.agentsDown.length ? `, ${r.agentsDown.length} agents down` : ''}${r.civiliansDown ? `, ${r.civiliansDown} citizens killed` : ''}.`
            : `Raid on ${buildingName(e.building)} failed: ${r.hostilesDown} hostiles down, ${r.agentsDown.length} agents down. The squad pulled out.`;
        add(text, e.scandal ? 'alert' : r.won ? 'ok' : 'alert', e.building, 'resolved');
        break;
      }
      case 'agentDown':
        add(e.dead ? `${agentName(after, e.agent)} was killed in the raid.` : `${agentName(after, e.agent)} is wounded and off the roster for a few days.`, e.dead ? 'alert' : 'caution', null, 'down');
        break;
      case 'healed':
        add(`${agentName(after, e.agent)} is back on duty.`, 'ok', null, 'healed');
        break;
      case 'recruited':
        add(`${agentName(after, e.agent)} joins the agency.`, 'ok', null, 'recruit');
        break;
      case 'turned':
        add(`${orgName(e.org)} has turned. Its guards now stand with the hosts, and it works openly against the agency.`, 'alert', CITY.buildings.find((b) => b.org === e.org)?.id ?? null, 'turned');
        break;
      case 'month':
        add(`Month's end: the council's grant is ${e.grant}, salaries ${e.salaries}.`, e.grant >= e.salaries ? 'ok' : 'caution', null, 'month');
        break;
      case 'researchStarted':
        add(`The lab starts on ${projectName(e.project)}.`, 'note', null, 'research');
        break;
      case 'researchDone':
        add(`The lab reports: ${projectName(e.project)} is done. ${LAB_REPORT[e.project] ?? ''}`.trim(), 'ok', null, 'research-done');
        break;
      case 'shelved': {
        const parts = [e.liveHost && `${e.liveHost} live host`, e.liveTaker && `${e.liveTaker} live taker`, e.host && `${e.host} host bodies`, e.taker && `${e.taker} taker bodies`, e.fighter && `${e.fighter} fighter bodies`, e.core && `${e.core} amber cores`].filter(Boolean);
        if (parts.length) add(`To the lab's shelf: ${parts.join(', ')}.`, 'note', null, 'shelved');
        break;
      }
      case 'buildStarted':
        add(`The workshop starts a ${itemName(e.item)} (${e.cost}).`, 'note', null, 'build');
        break;
      case 'built':
        add(`The workshop finished a ${itemName(e.item)}.`, 'ok', null, 'built');
        break;
      case 'ordered':
        add(`Ordered a ${itemName(e.item)} from ${orgName(CITY.orgs.find((o) => o.kind === 'arms')?.id ?? null)} (${e.cost}).`, 'note', null, 'ordered');
        break;
      case 'delivered':
        add(`A ${itemName(e.item)} was delivered. It looks fine.`, 'note', null, 'delivered');
        break;
      case 'cityOver':
        add(e.over.winner === 'agency' ? 'The council reports the city quiet. Act one is over.' : 'The switchboard goes dark.', e.over.winner === 'agency' ? 'ok' : 'alert', null, 'over');
        break;
      default:
        break;
    }
  }
  return out;
}

export const OVER_TEXT: Record<string, string> = {
  contained: 'The spread is contained. The source still waits under the city, but the whispers have stopped for now.',
  spread: 'Ninety days on, the organism is everywhere. The city still smiles; it no longer belongs to its citizens.',
  confidence: 'The council has withdrawn the agency’s charter.',
  turned: 'Half the city’s organisations work openly for the organism. The agency cannot operate.',
  squad: 'No agents left and no money to hire more. The agency is finished.',
};
