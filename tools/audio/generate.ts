// Generates the manifest's sounds and music through ElevenLabs and writes public/audio/**.mp3, then the index.
// Idempotent: a take whose file exists and whose prompt hash in the index matches is skipped, so a rerun only makes
// what changed or is missing (KB recipe step 8: "an idempotent generator").
//   npm run audio:gen                       everything missing or changed
//   npm run audio:gen -- --only fire-pistol  one name or music state (or `sfx` / `music` for the raid set, `city` for the city set)
//   npm run audio:gen -- --force             remake even when the hash matches
//   npm run audio:gen -- --dry               print what would be made
// The key: ELEVENLABS_API_KEY from .env.local, loaded by `node --env-file` (never read or printed here).
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CITY_MUSIC, CITY_SFX, MUSIC, MUSIC_MODEL, SFX, SFX_MODEL, musicFile, sfxFile, sfxPrompt, type MusicSpec, type SfxSpec } from './manifest';
import { AUDIO_DIR, musicHash, readIndex, sfxHash, writeIndex } from './measure';

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const only = args[args.indexOf('--only') + 1];
const wantOnly = args.includes('--only') ? only : undefined;
const force = flag('force');
const dry = flag('dry');

interface Job {
  file: string;
  label: string;
  hash: string;
  run: () => Promise<ReadableStream<Uint8Array>>;
}

async function bytesOf(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function main(): Promise<void> {
  if (!process.env.ELEVENLABS_API_KEY && !dry) {
    console.error('ELEVENLABS_API_KEY is not set: run through `npm run audio:gen` (node --env-file=.env.local).');
    process.exit(2);
  }
  const client = dry ? null : new ElevenLabsClient();
  const index = readIndex();
  const jobs: Job[] = [];
  const sfxSets: [string, SfxSpec<string>[]][] = [['sfx', SFX], ['city', CITY_SFX]];
  const musicSets: [string, MusicSpec<string>[]][] = [['music', MUSIC], ['city', CITY_MUSIC]];
  for (const [set, specs] of sfxSets) for (const spec of specs) {
    if (wantOnly && wantOnly !== set && wantOnly !== spec.name) continue;
    for (let i = 0; i < spec.takes; i++) {
      const file = sfxFile(spec.name as Parameters<typeof sfxFile>[0], i);
      const hash = sfxHash(spec, i);
      const text = sfxPrompt(spec, i);
      jobs.push({
        file,
        hash,
        label: `${spec.name} take ${i + 1}/${spec.takes} (${spec.seconds} s${spec.loop ? ', loop' : ''})`,
        run: () => client!.textToSoundEffects.convert({ text, modelId: SFX_MODEL, durationSeconds: spec.seconds, promptInfluence: spec.influence, loop: !!spec.loop, outputFormat: 'mp3_44100_128' }),
      });
    }
  }
  for (const [set, specs] of musicSets) for (const spec of specs) {
    if (wantOnly && wantOnly !== set && wantOnly !== spec.state) continue;
    jobs.push({
      file: musicFile(spec.state as Parameters<typeof musicFile>[0]),
      hash: musicHash(spec),
      label: `music ${spec.state} (${spec.seconds} s${spec.loop ? ', loop' : ''})`,
      run: () => client!.music.compose({ prompt: spec.prompt, musicLengthMs: spec.seconds * 1000, modelId: MUSIC_MODEL, forceInstrumental: true, outputFormat: 'mp3_44100_128' }),
    });
  }
  const known = new Map<string, string>();
  for (const e of Object.values(index?.sfx ?? {})) for (const t of e?.takes ?? []) known.set(t.file, t.promptHash);
  for (const e of Object.values(index?.music ?? {})) if (e) known.set(e.take.file, e.take.promptHash);
  for (const e of Object.values(index?.city?.sfx ?? {})) for (const t of e?.takes ?? []) known.set(t.file, t.promptHash);
  for (const e of Object.values(index?.city?.music ?? {})) if (e) known.set(e.take.file, e.take.promptHash);

  let made = 0;
  let skipped = 0;
  let failed = 0;
  for (const job of jobs) {
    const path = join(AUDIO_DIR, job.file);
    const fresh = existsSync(path) && known.get(job.file) === job.hash;
    if (fresh && !force) {
      skipped++;
      continue;
    }
    if (dry) {
      console.log(`would make ${job.label} -> ${job.file}${existsSync(path) ? ' (prompt changed)' : ''}`);
      made++;
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    const t0 = Date.now();
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const stream = await job.run();
        const bytes = await bytesOf(stream);
        if (bytes.length < 1000) throw new Error(`only ${bytes.length} bytes`);
        writeFileSync(path, bytes);
        console.log(`made ${job.label} -> ${job.file}  ${(bytes.length / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        ok = true;
        made++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const status = (err as { statusCode?: number }).statusCode;
        console.error(`  ${job.label}: attempt ${attempt} failed${status ? ` (${status})` : ''}: ${msg.slice(0, 300)}`);
        if (status === 401 || status === 402 || status === 403) break; // no key, no credit, no plan: do not retry
        await new Promise((r) => setTimeout(r, status === 429 ? 15000 : 3000));
      }
    }
    if (!ok) failed++;
  }
  console.log(`generate: ${made} made, ${skipped} up to date, ${failed} failed`);
  if (!dry) {
    writeIndex();
    console.log('index written: public/audio/index.json');
  }
  if (failed) process.exit(1);
}

void main();
