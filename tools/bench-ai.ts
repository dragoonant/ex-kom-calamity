// npm run bench:ai [-- --battles N --seed S --battle ID --block B --gate P]
// The AI bench (docs/spec/10-rules.md AI-10; KB rule 30): seeded battles of the `normal` AI against the `random`
// AI in both seats (normal hostiles against random agents, then normal agents against random hostiles), with the
// invariants checked after every step (INV-1 on the deep passes, as the block sweep does). Prints the normal side's win rate per seat and overall, checks that a seed
// replays to the same hash, and exits 1 below the gate (PLAN.md M3: 95% over at least 200 battles) or on a break.
import { hashState, query } from '../src/engine';
import { makeAi, type Difficulty } from '../src/ai';
import { aiPolicy } from '../src/sim/policies';
import { runBattle } from '../src/sim/run';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const battles = Number(args.get('battles') ?? 200);
const seed0 = Number(args.get('seed') ?? 1);
const battleId = args.get('battle') ?? 'bench-raid';
const gate = Number(args.get('gate') ?? 95);
const blockBattles = Number(args.get('block') ?? 0);

interface Seat {
  name: string;
  normal: 'hostile' | 'agency';
  wins: number;
  losses: number;
  draws: number;
  timeouts: number;
  ticks: number[];
  agentsDown: number;
  hostilesDown: number;
  taken: number;
  civilianHits: number;
  orders: number;
  rejected: number;
}

function play(battle: string, seed: number, normalSide: 'hostile' | 'agency', lightLegal = true) {
  const agency: Difficulty = normalSide === 'agency' ? 'normal' : 'random';
  const hostile: Difficulty = normalSide === 'hostile' ? 'normal' : 'random';
  return runBattle({
    setup: { battleId: battle, seed },
    agency: aiPolicy(makeAi('agency', agency)),
    hostile: aiPolicy(makeAi('hostile', hostile)),
    deepEvery: 50,
    lightLegal,
  });
}

function bench(battle: string, count: number, lightLegal: boolean): { rate: number; failed: boolean } {
  const seats: Seat[] = (['hostile', 'agency'] as const).map((normal) => ({
    name: normal === 'hostile' ? 'normal hostiles vs random agents' : 'normal agents vs random hostiles',
    normal,
    wins: 0,
    losses: 0,
    draws: 0,
    timeouts: 0,
    ticks: [],
    agentsDown: 0,
    hostilesDown: 0,
    taken: 0,
    civilianHits: 0,
    orders: 0,
    rejected: 0,
  }));
  let failed = false;
  const t0 = Date.now();
  for (let i = 0; i < count; i++) {
    const seed = seed0 + Math.floor(i / 2);
    const seat = seats[i % 2]!;
    const r = play(battle, seed, seat.normal, lightLegal);
    if (r.broken.length) {
      failed = true;
      console.error(`[${seat.name}] seed ${seed}: ${r.broken.slice(0, 5).join('; ')}`);
    }
    const o = query.outcome(r.state);
    if (o.over?.winner === seat.normal) seat.wins += 1;
    else if (o.over?.winner && o.over.winner !== 'none') seat.losses += 1;
    else {
      seat.draws += 1;
      if (o.over?.reason === 'timeout') seat.timeouts += 1;
    }
    seat.ticks.push(r.ticks);
    seat.agentsDown += o.score.agentsDown;
    seat.hostilesDown += o.score.hostilesDown;
    seat.taken += o.score.taken;
    seat.civilianHits += o.score.civilianHits;
    seat.orders += r.orders;
    seat.rejected += r.rejected;
  }
  const rows: Record<string, unknown> = {};
  let wins = 0;
  for (const s of seats) {
    const n = s.ticks.length;
    wins += s.wins;
    rows[s.name] = {
      battles: n,
      'normal wins': pct(s.wins, n),
      'random wins': pct(s.losses, n),
      draws: s.draws,
      timeouts: s.timeouts,
      'mean sim s': r2(s.ticks.reduce((a, b) => a + b, 0) / Math.max(1, n) / 10),
      'agents down': r2(s.agentsDown / Math.max(1, n)),
      'hostiles down': r2(s.hostilesDown / Math.max(1, n)),
      taken: r2(s.taken / Math.max(1, n)),
      'civilian hits': r2(s.civilianHits / Math.max(1, n)),
      'orders / battle': r2(s.orders / Math.max(1, n)),
      rejected: s.rejected,
    };
  }
  console.log(`\nbench:ai on ${battle}: ${count} battles, seeds ${seed0}..${seed0 + Math.ceil(count / 2) - 1}, both seats`);
  console.table(rows);
  const rate = (100 * wins) / count;
  console.log(`normal beats random: ${rate.toFixed(1)}% (${wins}/${count}); ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { rate, failed };
}

// Determinism (AI-1, ARCH-7): the same seed in the same seat replays to the same hash.
const d1 = play(battleId, seed0, 'hostile', false);
const d2 = play(battleId, seed0, 'hostile', false);
const same = hashState(d1.state) === hashState(d2.state) && d1.ticks === d2.ticks;
console.log(`determinism: seed ${seed0} twice -> ${hashState(d1.state)} / ${hashState(d2.state)} at tick ${d1.ticks} / ${d2.ticks}: ${same ? 'same' : 'DIFFERENT'}`);

const main = bench(battleId, battles, true);
let failed = main.failed || !same;
if (blockBattles > 0) {
  const b = bench('block-raid', blockBattles, true);
  failed = failed || b.failed;
}
const pass = main.rate >= gate;
console.log(`\n${failed ? 'INVARIANT OR DETERMINISM FAILURE' : 'all invariants held'}; gate ${gate}%: ${pass ? 'PASS' : 'FAIL'} (${main.rate.toFixed(1)}%)`);
process.exit(failed || !pass ? 1 : 0);

function pct(a: number, b: number): string {
  return `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
}
function r2(x: number): number {
  return Math.round(x * 100) / 100;
}
