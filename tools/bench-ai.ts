// npm run bench:ai: normal AI against random in both seats; gate: normal wins at least 90% over 200 battles.
import { replay, runBattle } from '../src/sim/run';
const n = 100;
let hostileSeat = 0, playerSeat = 0;
for (let seed = 1; seed <= n; seed++) {
  if (runBattle(seed, 'random', 'normal', false).state.result?.winner === 'hostile') hostileSeat++;
  if (runBattle(seed, 'normal', 'random', false).state.result?.winner === 'player') playerSeat++;
}
const r = runBattle(7, 'normal', 'normal', false);
const det = replay(7, r.actions) === replay(7, r.actions);
const rate = (hostileSeat + playerSeat) / (2 * n);
console.log(`| seat | battles | normal wins |\n|---|---|---|\n| hostile (normal vs random) | ${n} | ${hostileSeat} |\n| player (normal vs random) | ${n} | ${playerSeat} |\n| **both** | ${2 * n} | **${(100 * rate).toFixed(1)}%** |`);
console.log(`determinism (seed 7 replay): ${det ? 'ok' : 'FAIL'}`);
if (rate < 0.9 || !det) process.exit(1);
