// Sound pass 1 and 2 (PLAN.md M4, Q19, Q21; KB recipe step 8): sounds.html plays every sound (the generated take
// where the bank has one, else the synth) and auditions the music states; the console's mute, volume, music level and
// source persist in the browser under ekc-audio; the director plays from engine events: a breach, the pause paddle,
// console clicks; the bank reads public/audio/index.json and decodes every take. Headless Chromium has no speakers;
// the hook's audio() report counts the plays and says what the bank and the music player hold.
import { expect, test } from '@playwright/test';
import { noNativeTooltips, openTitle, startRaid, sweepText, watchErrors } from './helpers';

const NAMES = ['fire-pistol', 'fire-carbine', 'fire-scatter', 'fire-whip', 'bite', 'hit-armour', 'hit-flesh', 'hit-alien', 'breach', 'collapse', 'taking', 'revealed', 'alert', 'down-agent', 'down-hostile', 'pause', 'resume', 'click', 'paddle', 'order', 'refused', 'raid-over'];

test('sounds.html lists every sound with its cue and mechanism, plays each, and keeps volume and mute', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./sounds.html');
  await expect(page.getByTestId('sounds')).toBeVisible();
  for (const n of NAMES) await expect(page.getByTestId(`sound-${n}`)).toBeVisible();
  await expect(page.getByTestId('sound-ambient')).toBeVisible();
  for (const m of ['calm', 'battle', 'tense', 'victory', 'defeat']) await expect(page.getByTestId(`music-${m}`)).toBeVisible();
  // The bank's index is read on load: this build carries the generated takes (public/audio).
  await expect(page.getByTestId('sounds-sub')).toContainText('generated takes');
  await expect(page.getByTestId('sound-how-fire-carbine')).toContainText('generated: 3 takes');
  // The source switch flips every card to the synth and back, and persists.
  await page.getByTestId('sounds-source').click();
  await expect(page.getByTestId('sounds-source')).toContainText('SYNTH');
  await expect(page.getByTestId('sound-how-fire-carbine')).toContainText('synth:');
  await page.getByTestId('sounds-source').click();
  await expect(page.getByTestId('sound-how-fire-carbine')).toContainText('generated:');
  // Music: a state toggles on and off.
  await page.getByTestId('music-battle').click();
  await expect(page.getByTestId('music-battle')).toContainText('PLAYING');
  await page.getByTestId('music-battle').click();
  await expect(page.getByTestId('music-battle')).not.toContainText('PLAYING');
  // Play a few: the page counts and names the last one; no error either way (an AudioContext may stay suspended headless).
  await page.getByTestId('sound-fire-carbine').click();
  await page.getByTestId('sound-breach').click();
  await page.getByTestId('sound-alert').click();
  await expect(page.getByTestId('sounds-last')).toContainText('last: alert (1)');
  await page.getByTestId('sound-ambient').click();
  await expect(page.getByTestId('sound-ambient')).toContainText('PLAYING');
  await page.getByTestId('sound-ambient').click();
  await expect(page.getByTestId('sound-ambient')).toContainText('PLAY');
  // Settings persist under the game's own key (Q19).
  await page.getByTestId('sounds-mute').click();
  await page.getByTestId('sounds-volume').fill('35');
  await page.getByTestId('sounds-music-volume').fill('45');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ekc-audio')!));
  expect(saved).toEqual({ volume: 0.35, muted: true, music: 0.45, source: 'auto' });
  await sweepText(page);
  await noNativeTooltips(page);
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/kom|calamity/i);
  await page.screenshot({ path: 'docs/art/shots/m4-sounds.png' });
  expect(errors).toEqual([]);
});

test('the console plays from engine events, the paddle and the switches; mute and volume persist and reload', async ({ page }) => {
  const errors = watchErrors(page);
  await openTitle(page);
  const before = await page.evaluate(() => window.__ekc!.audio()!);
  expect(before.settings).toEqual({ volume: 0.7, muted: false, music: 0.6, source: 'auto' });
  expect(before.music.state).toBe('calm'); // the title wants the calm theme; it plays once a gesture unlocks the context
  await startRaid(page); // a click on a big switch: the paddle clack
  const afterStart = await page.evaluate(() => window.__ekc!.audio()!);
  expect(afterStart.played.paddle ?? 0).toBeGreaterThanOrEqual(1);
  expect(afterStart.music.state).toBe('battle');
  // The bank read the index on load and decodes every take once the first gesture made a context (Q21).
  await page.waitForFunction(() => {
    const b = window.__ekc!.audio()!.bank;
    return b.status === 'ready' && b.total > 0 && b.loaded === b.total;
  });
  const bank = (await page.evaluate(() => window.__ekc!.audio()!)).bank;
  expect(bank.sfx).toBeGreaterThanOrEqual(23);
  expect(bank.music).toBe(5);
  // A breach: blast and breach events become one 'breach' sound; the pause paddle clacks both ways.
  await page.evaluate(() => {
    const h = window.__ekc!;
    h.order({ type: 'blast', side: 'agency', unit: 'a3', at: { x: 4, y: 10, level: 0 } });
    h.advance(1);
  });
  await page.getByTestId('pause').click(); // resume
  await page.getByTestId('pause').click(); // pause
  await page.getByTestId('speed-2').click(); // two plain switches: the click sound
  await page.getByTestId('level-1').click();
  const report = await page.evaluate(() => window.__ekc!.audio()!);
  expect(report.played.breach ?? 0).toBeGreaterThanOrEqual(1);
  expect(report.played.order ?? 0).toBeGreaterThanOrEqual(1); // the accepted blast order ticked
  expect(report.played.resume ?? 0).toBeGreaterThanOrEqual(1);
  expect(report.played.pause ?? 0).toBeGreaterThanOrEqual(1);
  expect(report.played.click ?? 0).toBeGreaterThanOrEqual(2);
  // A refused order buzzes.
  await page.evaluate(() => window.__ekc!.order({ type: 'move', side: 'agency', unit: 'a1', to: { x: 4, y: 7, level: 0 } }));
  expect((await page.evaluate(() => window.__ekc!.audio()!)).played.refused ?? 0).toBeGreaterThanOrEqual(1);
  // Mute from the console, set the volume, reload: both come back (Q19, under ekc-audio, apart from the save).
  await page.getByTestId('mute').click();
  await expect(page.getByTestId('mute')).toHaveText('MUTED');
  await page.getByTestId('volume').fill('40');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ekc-audio')!))).toEqual({ volume: 0.4, muted: true, music: 0.6, source: 'auto' });
  expect(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('ekc-save')!)).includes('"muted"'))).toBe(false);
  await page.reload();
  await expect(page.getByTestId('title')).toBeVisible();
  expect((await page.evaluate(() => window.__ekc!.audio()!)).settings).toEqual({ volume: 0.4, muted: true, music: 0.6, source: 'auto' });
  // Muted still counts plays (the test's ear) but schedules nothing.
  await page.evaluate(() => window.__ekc!.setAudio({ muted: false, volume: 0.7, music: 0.3, source: 'synth' }));
  expect((await page.evaluate(() => window.__ekc!.audio()!)).settings).toEqual({ volume: 0.7, muted: false, music: 0.3, source: 'synth' });
  await sweepText(page);
  expect(errors).toEqual([]);
});
