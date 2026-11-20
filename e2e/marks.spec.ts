// VIEW-5 in the playable: with two hostiles left the board shows a coral beacon on each unseen one, the floor
// switch of its level lights, and the console says where. The raid is brought to its last two hostiles by
// editing the save (the engine's own hash is recomputed by tsx, since the engine's JSON imports do not load in the
// test runner), then reopened through Continue (SAV-4).

/** hashState of the snapshot on its map's pristine tiles (the save's tile diff is empty at the start). */
function hashOf(snapshot: State): string {
  const code = "import { hashState, parseMap } from './src/engine'; import { MAPS } from './src/data'; let t = ''; process.stdin.on('data', (d) => (t += d)); process.stdin.on('end', () => { const s = JSON.parse(t); process.stdout.write(hashState({ ...s, tiles: parseMap(MAPS[s.mapId]) })); });";
  return execFileSync('npx', ['tsx', '--eval', code], { input: JSON.stringify(snapshot) }).toString().trim();
}
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import type { State } from '../src/engine';
import { openTitle, startRaid, sweepText, waitForBoard, watchErrors } from './helpers';

test('two hostiles left: beacons on the board, a lamp on their floor switches, a line on the console', async ({ page }) => {
  const errors = watchErrors(page);
  await openTitle(page);
  await startRaid(page, 'savings-raid');
  const text = await page.evaluate(() => localStorage.getItem('ekc-save')!);
  const env = JSON.parse(text) as { snapshot: State; hash: string; tileDiff: unknown[] };
  expect(env.tileDiff).toEqual([]);
  // Keep the roof taker and the host on level 2; every other hostile is down.
  const keep = env.snapshot.units.filter((u) => u.side === 'hostile' && (u.template === 'taker' ? u.level === 3 : u.template === 'host' && u.level === 2));
  expect(keep).toHaveLength(2);
  for (const u of env.snapshot.units) if (u.side === 'hostile' && !keep.includes(u)) Object.assign(u, { hp: 0, down: true });
  env.hash = hashOf(env.snapshot);
  await page.evaluate((t) => localStorage.setItem('ekc-save', t), JSON.stringify(env));
  await page.reload();
  await page.getByTestId('continue').click();
  await waitForBoard(page);
  const marks = await page.evaluate(() => window.__ekc!.getView()!.marks);
  expect(marks).toEqual(keep.map((u) => ({ x: u.x, y: u.y, level: u.level })));
  // Continue does not slip; the first tick after it does, since the marks are new to the console then.
  await expect(page.getByTestId('marks')).toHaveText('LAST HOSTILES MARKED: LEVEL 2, LEVEL 3');
  await expect(page.getByTestId('mark-on-2')).toBeVisible();
  await expect(page.getByTestId('mark-on-3')).toBeVisible();
  await expect(page.getByTestId('mark-on-0')).toHaveCount(0);
  await page.evaluate(() => {
    const h = window.__ekc!;
    h.setLevel(3);
    h.setCamera({ yaw: 0.6, pitch: 0.7, distance: 34, target: { x: 13, z: 12 } });
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/screenshots/last-hostiles-marked.png' });
  // A beacon never takes the pointer (KB rule 25): the tile under a mark is what a tap meets.
  const roof = keep.find((u) => u.level === 3)!;
  const hit = await page.evaluate((p) => {
    const h = window.__ekc!;
    const pt = h.screenPointOfTile(p);
    return pt ? h.tileAtScreen(pt.x, pt.y) : null;
  }, { x: roof.x, y: roof.y, level: 3 });
  expect(hit).toMatchObject({ level: 3 });
  await sweepText(page);
  expect(errors).toEqual([]);
});
