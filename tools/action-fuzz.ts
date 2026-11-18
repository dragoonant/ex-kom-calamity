// npm run action-fuzz [-- --ticks N --seed S --runs R]
// Throws random legal actions (and a share of malformed ones) at the engine for many ticks and
// asserts the invariants of docs/spec/10-rules.md section 16 after every step. Exit 1 on a break.
import { legalActions, step, createGame, SIDES, type Action, type State } from '../src/engine';
import { checkInvariants, checkReplay } from '../src/sim/invariants';
import { makeRng, pick, chance } from '../src/sim/policies';
import { nextInt } from '../src/engine/rng';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const ticks = Number(args.get('ticks') ?? 3000);
const runs = Number(args.get('runs') ?? 3);
const seed0 = Number(args.get('seed') ?? 11);

const malformed: unknown[] = [
  null,
  42,
  {},
  { type: 'dance' },
  { type: 'move', side: 'agency', unit: 'a1', to: { x: -1, y: 0, level: 0 } },
  { type: 'move', side: 'agency', unit: 'a1', to: { x: 0.5, y: 0, level: 0 } },
  { type: 'move', side: 'agency', unit: 'a1', to: { x: 0, y: 0, level: 9 } },
  { type: 'move', side: 'hostile', unit: 'a1', to: { x: 0, y: 0, level: 0 } },
  { type: 'move', side: 'civilian', unit: 'u1', to: { x: 0, y: 0, level: 0 } },
  { type: 'fire', side: 'agency', unit: 'a1', target: 'a2' },
  { type: 'fire', side: 'agency', unit: 'a1', target: 'nobody' },
  { type: 'fire', side: 'agency', unit: 'a1' },
  { type: 'stance', side: 'agency', unit: 'a1', stance: 'prone' },
  { type: 'halt', side: 'agency', unit: 'zzz' },
  { type: 'blast', side: 'agency', unit: 'a1' },
  { type: 'blast', side: 'agency', unit: 'a1', at: { x: 0, y: 0, level: 5 } },
  { type: 'blast', side: 'agency', unit: 'a1', at: { x: 0.5, y: 2, level: 0 } },
  { type: 'blast', side: 'civilian', unit: 'u1', at: { x: 1, y: 1, level: 0 } },
  { type: 'blast', side: 'agency', unit: 'a1', at: 'here' },
  { type: 'withdraw', side: 'hostile' },
  { type: 'tick', extra: true },
];

let failed = false;
let totalSteps = 0;
let totalRejected = 0;
const t0 = Date.now();
for (let run = 0; run < runs; run++) {
  const seed = seed0 + run;
  let setup = { battleId: 'first-raid', seed };
  let state: State = createGame(setup);
  const rng = makeRng(seed * 7919 + 1);
  let steps = 0;
  let rejected = 0;
  const broken: string[] = [];
  const over: string[] = [];
  const counts: Record<string, number> = {};
  for (let t = 0; t < ticks && broken.length === 0; t++) {
    // A handful of orders per tick from random sides, then one tick; sometimes a malformed action.
    const n = nextInt(rng, 4);
    for (let k = 0; k < n; k++) {
      let action: Action;
      if (chance(rng, 0.1)) action = pick(rng, malformed) as Action;
      else {
        const side = pick(rng, SIDES)!;
        const acts = legalActions(state, side).filter((a) => a.type !== 'tick' && (a.type !== 'withdraw' || chance(rng, 0.001)));
        const a = pick(rng, acts);
        if (!a) continue;
        action = a;
      }
      const prev = state;
      let r;
      try {
        r = step(state, action);
      } catch (e) {
        broken.push(`step threw on ${JSON.stringify(action)}: ${(e as Error).message}`);
        break;
      }
      if (!r.ok) {
        rejected += 1;
        if (r.state !== prev) broken.push('ARCH-2 a rejection returned a different state object');
        continue;
      }
      state = r.state;
      steps += 1;
      counts[action.type] = (counts[action.type] ?? 0) + 1;
      for (const b of checkInvariants(state, { prev, ticked: action.type === 'tick', deep: true })) broken.push(`tick ${state.tick}: ${b}`);
    }
    const prev = state;
    const r = step(state, { type: 'tick' });
    if (!r.ok) {
      broken.push('tick rejected');
      break;
    }
    state = r.state;
    steps += 1;
    for (const b of checkInvariants(state, { prev, ticked: true, deep: true })) broken.push(`tick ${state.tick}: ${b}`);
    if (state.over) {
      // A finished battle only no-ops from here: record it, check the replay, start another one.
      over.push(`${state.over.winner}/${state.over.reason} at tick ${state.over.tick}`);
      broken.push(...checkReplay(setup, state));
      setup = { battleId: 'first-raid', seed: setup.seed + 1000 };
      state = createGame(setup);
    }
  }
  if (broken.length === 0) broken.push(...checkReplay(setup, state));
  totalSteps += steps;
  totalRejected += rejected;
  const status = broken.length ? 'BROKEN' : 'ok';
  console.log(`run ${run} seed ${seed}: ${status}; ${steps} accepted steps, ${rejected} rejected, ${over.length} battles finished (${over.slice(0, 3).join('; ')}${over.length > 3 ? '; ...' : ''}), last at tick ${state.tick}; orders ${JSON.stringify(counts)}`);
  if (broken.length) {
    failed = true;
    for (const b of broken.slice(0, 10)) console.error('  ' + b);
  }
}
console.log(`${failed ? 'FAILED' : 'all invariants held'}: ${totalSteps} steps, ${totalRejected} rejections, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
