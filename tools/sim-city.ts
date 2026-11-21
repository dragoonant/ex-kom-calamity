// npm run sim:city [-- --campaigns N --seed S --gate P]
// Plays seeded campaigns of each agency driver against the organism's planner (docs/spec/20-city.md CSIM-1..3;
// KB rule 30) and prints outcomes. Exit 1 if an invariant breaks or a CSIM-2 target is missed.
import { CITY_AGENCY_DRIVERS, CITY_HOSTILE_DRIVERS } from '../src/ai/city';
import { cityQuery, hashCity, replayCity } from '../src/city';
import { runCity } from '../src/sim/city';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const campaigns = Number(args.get('campaigns') ?? 40);
const seed0 = Number(args.get('seed') ?? 1);
const t0 = Date.now();
let failed = false;
const rows: Record<string, unknown>[] = [];
const rates: Record<string, number> = {};
for (const [name, agency] of Object.entries(CITY_AGENCY_DRIVERS)) {
  const reasons: Record<string, number> = {};
  let wins = 0;
  let days = 0;
  let raids = 0;
  let won = 0;
  let clean = 0;
  let dead = 0;
  let taken = 0;
  let confidence = 0;
  for (let i = 0; i < campaigns; i++) {
    const seed = seed0 + i;
    const r = runCity({ seed, agency, hostile: CITY_HOSTILE_DRIVERS.planner });
    if (r.broken.length) {
      failed = true;
      console.error(`[${name}] seed ${seed}: ${r.broken.slice(0, 4).join('; ')}`);
    }
    const o = cityQuery.outcome(r.state);
    const key = o.over ? `${o.over.winner}:${o.over.reason}` : 'unfinished';
    reasons[key] = (reasons[key] ?? 0) + 1;
    if (o.over?.winner === 'agency') wins += 1;
    days += cityQuery.clock(r.state).day;
    raids += o.score.raids;
    won += o.score.raidsWon;
    clean += o.score.cleanRaids;
    dead += o.score.agentsDead;
    taken += o.score.taken;
    confidence += o.confidence;
  }
  rates[name] = (100 * wins) / campaigns;
  rows.push({ agency: name, campaigns, 'agency wins': `${rates[name]!.toFixed(1)}%`, 'mean days': +(days / campaigns).toFixed(1), raids: +(raids / campaigns).toFixed(1), 'raids won': +(won / campaigns).toFixed(1), 'clean raids': +(clean / campaigns).toFixed(1), 'agents dead': +(dead / campaigns).toFixed(1), taken: +(taken / campaigns).toFixed(0), 'end confidence': +(confidence / campaigns).toFixed(0), ends: Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(', ') });
}
console.table(rows);
// CSIM-3: a seed replays to the same hash.
const one = runCity({ seed: seed0, agency: CITY_AGENCY_DRIVERS.careful, hostile: CITY_HOSTILE_DRIVERS.planner });
const again = replayCity({ seed: seed0 }, one.state.log);
const same = hashCity(again) === hashCity(one.state);
console.log(`replay of seed ${seed0} (careful): ${same ? 'same hash' : 'DIFFERENT'} ${hashCity(one.state)}; ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (!same) failed = true;
// CSIM-2: the targets.
const targets: [string, boolean][] = [
  ['passive never wins', rates.passive === 0],
  ['random wins at most 10%', (rates.random ?? 100) <= 10],
  ['careful wins 55% to 90%', (rates.careful ?? 0) >= 55 && (rates.careful ?? 0) <= 90],
];
for (const [label, ok] of targets) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failed = true;
}
console.log(failed ? 'city sim: FAILED' : 'city sim: all invariants held, targets met');
process.exit(failed ? 1 : 0);
