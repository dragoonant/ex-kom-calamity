// npm run sim [-- --battles N --seed S --battle ID]
// Plays seeded battles to completion under two policy pairs and reports outcomes (KB rule 30).
// Exit code 1 if any invariant breaks. The policies are sim drivers, not the game's AI (M3).
import { query } from '../src/engine';
import { demolitionPolicy, randomPolicy, standPolicy, sweepPolicy } from '../src/sim/policies';
import { runBattle } from '../src/sim/run';
import { RAID_SITES } from '../src/data';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const battles = Number(args.get('battles') ?? 40);
const seed0 = Number(args.get('seed') ?? 1);
const battleId = args.get('battle') ?? 'first-raid';

interface Row {
  name: string;
  agencyWins: number;
  hostileWins: number;
  timeouts: number;
  mutual: number;
  ticks: number[];
  agentsDown: number;
  hostilesDown: number;
  civilianHits: number;
  civiliansDown: number;
  shots: number;
  hits: number;
  orders: number;
  rejected: number;
}

const pairs: { name: string; agency: () => ReturnType<typeof randomPolicy>; hostile: () => ReturnType<typeof randomPolicy> }[] = [
  { name: 'random vs random', agency: () => randomPolicy(0.1), hostile: () => randomPolicy(0.1) },
  { name: 'sweep vs stand', agency: () => sweepPolicy(), hostile: () => standPolicy() },
];

let failed = false;
const t0 = Date.now();
for (const pair of pairs) {
  const row: Row = { name: pair.name, agencyWins: 0, hostileWins: 0, timeouts: 0, mutual: 0, ticks: [], agentsDown: 0, hostilesDown: 0, civilianHits: 0, civiliansDown: 0, shots: 0, hits: 0, orders: 0, rejected: 0 };
  for (let i = 0; i < battles; i++) {
    const seed = seed0 + i;
    const r = runBattle({ setup: { battleId, seed }, agency: pair.agency(), hostile: pair.hostile(), deepEvery: 50 });
    if (r.broken.length) {
      failed = true;
      console.error(`[${pair.name}] seed ${seed}: ${r.broken.slice(0, 5).join('; ')}`);
    }
    const o = query.outcome(r.state);
    if (o.over?.winner === 'agency') row.agencyWins += 1;
    else if (o.over?.winner === 'hostile') row.hostileWins += 1;
    else if (o.over?.reason === 'mutual') row.mutual += 1;
    else row.timeouts += 1;
    row.ticks.push(r.ticks);
    row.agentsDown += o.score.agentsDown;
    row.hostilesDown += o.score.hostilesDown;
    row.civilianHits += o.score.civilianHits;
    row.civiliansDown += o.score.civiliansDown;
    row.shots += o.score.shotsFired;
    row.hits += o.score.hits;
    row.orders += r.orders;
    row.rejected += r.rejected;
  }
  const mean = row.ticks.reduce((a, b) => a + b, 0) / Math.max(1, row.ticks.length);
  const tps = r2(mean / 10);
  console.log(`\n${row.name} (${battles} battles, seeds ${seed0}..${seed0 + battles - 1}, battle ${battleId})`);
  console.table({
    'agency wins': pct(row.agencyWins, battles),
    'hostile wins': pct(row.hostileWins, battles),
    timeouts: pct(row.timeouts, battles),
    mutual: pct(row.mutual, battles),
    'mean ticks': r2(mean),
    'mean sim seconds': tps,
    'agents down / battle': r2(row.agentsDown / battles),
    'hostiles down / battle': r2(row.hostilesDown / battles),
    'civilian hits / battle': r2(row.civilianHits / battles),
    'civilians down / battle': r2(row.civiliansDown / battles),
    'hit rate': pct(row.hits, Math.max(1, row.shots)),
    'orders / battle': r2(row.orders / battles),
    'rejected orders': row.rejected,
  });
}
// The city block (MAP-7): a short demolition sweep per seed, to keep pathing over 7 levels, stray rounds,
// charges and collapses under the invariants. Capped in ticks: it is a smoke test, not a balance figure.
const blockBattles = Number(args.get('block') ?? 4);
const blockTicks = Number(args.get('blockticks') ?? 500);
// MAP-10: the same sweep over the block and every playable raid site.
for (const sweepId of blockBattles > 0 ? ['block-raid', ...RAID_SITES] : []) {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < blockBattles; i++) {
    const seed = seed0 + i;
    let blasts = 0;
    let destroyed = 0;
    let fell = 0;
    let levelSteps = 0;
    const r = runBattle({
      setup: { battleId: sweepId, seed },
      agency: demolitionPolicy(0.05),
      hostile: standPolicy(),
      maxTicks: blockTicks,
      deepEvery: 100,
      lightLegal: true,
      onEvent: (e) => {
        if (e.type === 'blast') blasts += 1;
        else if (e.type === 'tileDestroyed') destroyed += 1;
        else if (e.type === 'fell') fell += 1;
        else if (e.type === 'moved' && e.from.level !== e.to.level) levelSteps += 1;
      },
    });
    if (r.broken.length) {
      failed = true;
      console.error(`[${sweepId}] seed ${seed}: ${r.broken.slice(0, 5).join('; ')}`);
    }
    const o = query.outcome(r.state);
    rows.push({ seed, ticks: r.ticks, orders: r.orders, blasts, 'tiles destroyed': destroyed, falls: fell, 'level steps': levelSteps, shots: o.score.shotsFired, 'hostiles down': o.score.hostilesDown, 'agents down': o.score.agentsDown, over: o.over ? o.over.reason : 'cap' });
  }
  console.log(`\n${sweepId} demolition sweep (${blockBattles} battles of at most ${blockTicks} ticks)`);
  console.table(rows);
}
console.log(`\n${failed ? 'INVARIANT FAILURES (see above)' : 'all invariants held'}; ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);

function pct(a: number, b: number): string {
  return `${((100 * a) / b).toFixed(1)}%`;
}
function r2(x: number): number {
  return Math.round(x * 100) / 100;
}
