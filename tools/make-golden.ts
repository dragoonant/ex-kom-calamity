// npm run golden:make -- regenerates tests/golden/first-raid-seed-7.json (ARCH-9 golden replay).
// Only run it on purpose: a changed hash means the rules changed, and the test is there to say so.
import { writeFileSync } from 'node:fs';
import { hashState } from '../src/engine';
import { randomPolicy, sweepPolicy } from '../src/sim/policies';
import { runBattle } from '../src/sim/run';

const setup = { battleId: 'first-raid', seed: 7 };
const r = runBattle({ setup, agency: sweepPolicy(), hostile: randomPolicy(0.05), maxTicks: 400 });
if (r.broken.length) throw new Error(r.broken.join('\n'));
const out = { setup, ticks: r.state.tick, over: r.state.over, hash: hashState(r.state), log: r.state.log };
const path = new URL('../tests/golden/first-raid-seed-7.json', import.meta.url);
writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
console.log(`golden: ${out.log.length} log entries, tick ${out.ticks}, over ${JSON.stringify(out.over)}, hash ${out.hash}`);
