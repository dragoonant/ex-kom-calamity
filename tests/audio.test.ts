// Audio pass 2 (PLAN.md Q21; docs/audio.md): the manifest covers every synth name once, the prompts keep the game
// our own (KB rule 29), the music rule is pure, the bank's arithmetic holds, and the generated files on disk match the
// index. Files are media the repo carries like the GLBs; where they are missing (a checkout without them, CI) the
// file checks warn instead of failing (KB recipe step 8).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CITY_MUSIC, CITY_SFX, MUSIC, SFX, musicFile, sfxFile, sfxPrompt } from '../tools/audio/manifest';
import { promptHash, statsOf } from '../tools/audio/measure';
import { audioUrl, dbToGain, parseIndex, takeFor, type AudioIndex } from '../src/client/audio/bank';
import { MUSIC_STATES, musicStateFor } from '../src/client/audio/music';
import { SOUND_NAMES } from '../src/client/audio/synth';

const AUDIO = join(process.cwd(), 'public', 'audio');
const index = (): AudioIndex | null => (existsSync(join(AUDIO, 'index.json')) ? parseIndex(readFileSync(join(AUDIO, 'index.json'), 'utf8')) : null);

describe('audio manifest (tools/audio/manifest.ts)', () => {
  it('names every synth sound exactly once and every music state once, with takes, seconds and a level in range', () => {
    expect(SFX.map((s) => s.name).sort()).toEqual([...SOUND_NAMES].sort());
    expect(MUSIC.map((m) => m.state).sort()).toEqual([...MUSIC_STATES].sort());
    for (const s of SFX) {
      expect(s.takes).toBeGreaterThanOrEqual(1);
      expect(s.seconds).toBeGreaterThanOrEqual(0.5);
      expect(s.seconds).toBeLessThanOrEqual(30);
      expect(s.influence).toBeGreaterThanOrEqual(0);
      expect(s.influence).toBeLessThanOrEqual(1);
      expect(s.level).toBeLessThanOrEqual(0);
      if (Array.isArray(s.prompt)) expect(s.prompt.length).toBe(s.takes);
      for (let i = 0; i < s.takes; i++) expect(sfxPrompt(s, i).length).toBeGreaterThan(30);
    }
    for (const m of MUSIC) {
      expect(m.seconds).toBeGreaterThanOrEqual(3);
      expect(m.seconds).toBeLessThanOrEqual(600);
      expect(m.prompt).toMatch(/^Instrumental\./);
    }
    const files = [...SFX.flatMap((s) => Array.from({ length: s.takes }, (_, i) => sfxFile(s.name, i))), ...MUSIC.map((m) => musicFile(m.state))];
    expect(new Set(files).size).toBe(files.length);
  });

  it('keeps the prompts our own: no codename, no inspiration, no sibling look (KB rule 29; PLAN.md D10)', () => {
    const banned = /kom|calamity|x-?com|apocalypse|ultraman|bodycam|scanline|parchment|neon/i;
    for (const s of SFX) for (let i = 0; i < s.takes; i++) expect(sfxPrompt(s, i)).not.toMatch(banned);
    for (const m of MUSIC) expect(m.prompt).not.toMatch(banned);
  });

  it('every sound prompt states its exclusion and shots get several takes so a volley is not stamped', () => {
    for (const s of SFX) for (let i = 0; i < s.takes; i++) expect(sfxPrompt(s, i)).toMatch(/no (other )?music|no melody/i);
    for (const s of SFX.filter((x) => x.name.startsWith('fire-'))) expect(s.takes).toBeGreaterThanOrEqual(2);
    expect(SFX.find((s) => s.name === 'ambient')!.loop).toBe(true);
  });

  it('the prompt hash is stable and changes with the prompt', () => {
    expect(promptHash(['a', 1])).toBe(promptHash(['a', 1]));
    expect(promptHash(['a', 1])).not.toBe(promptHash(['a', 2]));
    expect(promptHash(['x'])).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('measure (tools/audio/measure.ts)', () => {
  it('peak, RMS, crest and the trims come out of plain samples', () => {
    const rate = 1000;
    const samples = new Float32Array(rate);
    samples[100] = 1; // one full-scale click at 0.1 s
    samples[200] = 0.5;
    const s = statsOf(samples, rate);
    expect(s.seconds).toBe(1);
    expect(s.peakDb).toBeCloseTo(0, 5);
    expect(s.head).toBeCloseTo(0.1, 5);
    expect(s.tail).toBeCloseTo(0.2, 5);
    expect(s.crestDb).toBeGreaterThan(18);
    const quiet = statsOf(new Float32Array(10), rate);
    expect(quiet.peakDb).toBe(-120);
    expect(quiet.head).toBe(0);
  });
});

describe('music rule and bank arithmetic (src/client/audio)', () => {
  it('calm on the title, battle in the raid, tense once the last hostiles are marked, a stinger on the report', () => {
    expect(musicStateFor('title', false, undefined)).toBe('calm');
    expect(musicStateFor('battle', false, null)).toBe('battle');
    expect(musicStateFor('battle', true, null)).toBe('tense');
    expect(musicStateFor('report', false, 'agency')).toBe('victory');
    expect(musicStateFor('report', false, 'hostile')).toBe('defeat');
    expect(musicStateFor('report', false, 'none')).toBe('defeat');
  });

  it('variants cycle the takes, a negative variant picks the last, dB converts, urls resolve beside the page', () => {
    expect([0, 1, 2, 3, 4].map((v) => takeFor(3, v))).toEqual([0, 1, 2, 0, 1]);
    expect(takeFor(2, -1)).toBe(1);
    expect(takeFor(0, 5)).toBe(0);
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 2);
    expect(dbToGain(20)).toBeCloseTo(10, 6);
    expect(audioUrl('sfx/click-1.mp3', 'https://example.test/game/index.html')).toBe('https://example.test/game/audio/sfx/click-1.mp3');
    expect(audioUrl('index.json', 'https://example.test/game/sounds.html')).toBe('https://example.test/game/audio/index.json');
    expect(parseIndex('{"version":2}')).toBeNull();
    expect(parseIndex('nope')).toBeNull();
    expect(parseIndex('{"version":1,"sfx":{},"music":{}}')?.version).toBe(1);
  });
});

describe('generated files (public/audio; warn, never fail, where they are missing)', () => {
  it('the index lists only files that exist, with sane trims and gains, and every manifest take', () => {
    const idx = index();
    if (!idx) {
      console.warn('public/audio/index.json missing: run `npm run audio:gen`; the client falls back to the synth');
      return;
    }
    let takes = 0;
    for (const [name, e] of Object.entries(idx.sfx)) {
      // The city set (docs/audio.md 6) is merged in by parseIndex; its names come from its own manifest list.
      if (name.startsWith('city-')) expect(CITY_SFX.map((c) => c.name)).toContain(name);
      else expect(SOUND_NAMES).toContain(name);
      for (const t of e!.takes) {
        takes++;
        const path = join(AUDIO, t.file);
        if (!existsSync(path)) {
          console.warn(`${t.file} is in the index but not on disk`);
          continue;
        }
        expect(statSync(path).size).toBeGreaterThan(1000);
        expect(t.offset).toBeGreaterThanOrEqual(0);
        expect(t.end).toBeGreaterThan(t.offset);
        expect(t.end).toBeLessThanOrEqual(t.seconds + 0.001);
        expect(t.gainDb).toBeLessThanOrEqual(12);
        expect(t.promptHash).toMatch(/^[0-9a-f]{8}$/);
      }
    }
    for (const [state, e] of Object.entries(idx.music)) {
      if (state.startsWith('city-')) expect(CITY_MUSIC.map((c) => c.state)).toContain(state);
      else expect(MUSIC_STATES).toContain(state);
      if (!existsSync(join(AUDIO, e!.take.file))) console.warn(`${e!.take.file} is in the index but not on disk`);
      else expect(e!.take.seconds).toBeGreaterThan(5);
    }
    const wanted = [...SFX, ...CITY_SFX].reduce((a, s) => a + s.takes, 0);
    if (takes < wanted) console.warn(`${wanted - takes} of ${wanted} sound takes are not generated yet`);
    else expect(takes).toBe(wanted);
    // KB gotchas: a generated gunshot should carry a real transient (crest factor 8, 18 dB); below that the director layers the synth.
    for (const name of ['fire-pistol', 'fire-carbine', 'fire-scatter'] as const) {
      for (const t of idx.sfx[name]?.takes ?? []) if (t.crestDb < 18) console.warn(`${t.file}: crest ${t.crestDb} dB, below 18: layered`);
    }
  });
});
