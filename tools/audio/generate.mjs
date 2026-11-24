#!/usr/bin/env node
// Audio generator for IRON BASIN. Idempotent: skips existing files; --force remakes.
// Usage: node tools/audio/generate.mjs [music|sfx|voice|index|measure] [--force] [--only id,id]
import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public/audio');
const API = 'https://api.elevenlabs.io';
const KEY = process.env.ELEVENLABS_API_KEY || 'dummy'; // a proxy injects the real key
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const onlyArg = args.indexOf('--only');
const ONLY = onlyArg >= 0 ? new Set(args[onlyArg + 1].split(',')) : null;
const phase = args.find((a) => !a.startsWith('--') && a !== (onlyArg >= 0 ? args[onlyArg + 1] : '')) || 'all';

const exists = (p) => access(p).then(() => true, () => false);
const hdr = { 'xi-api-key': KEY, 'content-type': 'application/json' };

async function post(url, body, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(API + url, { method: 'POST', headers: hdr, body: JSON.stringify(body) });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const t = await r.text();
    if (r.status >= 500 || r.status === 429) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; }
    throw new Error(`${url} ${r.status} ${t.slice(0, 300)}`);
  }
  throw new Error(`${url} failed after retries`);
}

const STYLE = 'Grounded near-future industrial war drama, cold wet northern winter, no sci-fi lasers, no orchestral fantasy. Instrumental only.';
export const MUSIC = {
  hangar: { seconds: 90, loop: true, prompt: `Slow brooding industrial ambient: low cello drones, distant clanking metal, soft sparse piano notes, cold and weary, dark pad, very slow tempo, seamless loop feel. ${STYLE}` },
  briefing: { seconds: 60, loop: true, prompt: `Tense low pulse, muted snare rolls, low sustained strings, radio-room tension, restrained and sparse, slow build, steady loop feel. ${STYLE}` },
  battle: { seconds: 120, loop: true, prompt: `Driving martial percussion, taiko-like low drums, low brass stabs, distorted synth bass, steady mid tempo around 100 bpm, gritty and relentless, loopable. ${STYLE}` },
  victory: { seconds: 12, loop: false, prompt: `Short sting: weary but proud brass and strings resolve to a major-minor cadence, slow, dignified, ends cleanly. ${STYLE}` },
  defeat: { seconds: 12, loop: false, prompt: `Short sting: low dissonant strings and a sinking drone, fading out to silence, bleak. ${STYLE}` },
};

// takes, duration (s), prompt, crest-factor minimum, loop
export const SFX = {
  'step-heavy': { n: 2, d: 1.6, crest: 5, p: "Footfall of a 7 metre tall armoured walker machine on wet concrete: heavy hydraulic piston stomp, deep thud, metal clank, single step." },
  'step-light': { n: 2, d: 1.0, crest: 5, p: "Light mechanical footstep of a small armoured machine on wet gravel, short metal tap and crunch, single step." },
  'servo': { n: 2, d: 1.4, crest: 0, p: "Hydraulic servo whine and pneumatic hiss of a large machine arm turning, mechanical, short." },
  'autocannon': { n: 2, d: 2.0, crest: 8, p: "Three-round burst of a heavy 30 mm autocannon fired outdoors, very loud, sharp reports with a distant echo, then silence." },
  'carbine': { n: 2, d: 1.5, crest: 8, p: "Two-round burst from a lighter military carbine fired outdoors, sharp cracks with short echo." },
  'rifle': { n: 2, d: 2.5, crest: 8, p: "A single heavy long-barrel rifle shot outdoors with a long echo rolling away across an open rail yard." },
  'mortar-launch': { n: 2, d: 1.5, crest: 8, p: "Mortar tube thump: a single deep hollow bloop of a mortar shell leaving the tube, outdoors." },
  'mortar-impact': { n: 2, d: 3.0, crest: 8, p: "Mortar shell whistling down then exploding on gravel, debris rattling, outdoors." },
  'missile-launch': { n: 2, d: 2.0, crest: 6, p: "Two small rockets launching one after another with a whoosh and rocket motor roar fading away." },
  'missile-impact': { n: 2, d: 2.5, crest: 8, p: "A rocket warhead exploding against a steel target, sharp blast, metal fragments, short rumble." },
  'ram-hit': { n: 2, d: 1.6, crest: 8, p: "Hydraulic ram fist slamming into steel armour plate: huge metallic bang, deep ringing clang, one impact." },
  'armor-hit': { n: 2, d: 1.6, crest: 8, p: "Cannon shells punching into thick steel armour plate: rapid heavy metallic thuds and clangs, three hits." },
  'armor-ping': { n: 2, d: 1.2, crest: 6, p: "A bullet ricocheting off thick steel armour: sharp metallic ping with a high whining ricochet." },
  'part-tear': { n: 2, d: 2.5, crest: 5, p: "A heavy steel robot limb shearing off: screeching tearing metal, snapping steel cables, sparks fizzing, final clunk." },
  'explode-walker': { n: 2, d: 4.0, crest: 8, p: "A large machine exploding: massive fuel and ammunition blast, secondary pops, falling debris, rumbling fade, outdoors." },
  'eject': { n: 2, d: 2.0, crest: 6, p: "Cockpit ejection: explosive bolts popping, then a rocket seat whooshing upward and away." },
  'repair': { n: 2, d: 3.0, crest: 0, p: "Pneumatic impact wrench rattling bolts then a welding torch hiss, workshop, short." },
  'select': { n: 2, d: 0.6, crest: 3, p: "Short military radio squelch chirp, a quick static burst and a single beep." },
  'confirm': { n: 2, d: 0.8, crest: 5, p: "Heavy mechanical switch clunk, a solid industrial toggle thunk." },
  'cancel': { n: 2, d: 0.5, crest: 3, p: "Soft low plastic click, quiet and dull." },
  'ui-tick': { n: 2, d: 0.5, crest: 3, p: "Tiny dry click, a crisp small mechanical tick." },
  'turn-player': { n: 1, d: 1.5, crest: 0, p: "Radio squelch followed by a low two-tone alert beep, calm and military." },
  'turn-enemy': { n: 1, d: 2.0, crest: 0, p: "Low ominous klaxon horn pulse, one single cycle, industrial warning, fading." },
  'container-crash': { n: 2, d: 3.0, crest: 6, p: "A steel shipping container crumpling and crashing to the ground: groaning metal, heavy bang, rattling aftermath." },
  'salvage': { n: 2, d: 1.5, crest: 6, p: "A heavy steel machine part dropped on concrete, one satisfying low clunk with a short ring, dry." },
  'rain-loop': { n: 1, d: 20, crest: 0, loop: true, p: "Steady rain falling on concrete and corrugated metal roofs, constant, even texture, no thunder, seamless loop." },
  'yard-loop': { n: 1, d: 20, crest: 0, loop: true, p: "Distant industrial rail yard ambience, low wind, faint machinery hum, very rarely a faraway train horn, seamless loop." },
  'hangar-loop': { n: 1, d: 20, crest: 0, loop: true, p: "Interior of a large steel shed: low room tone, distant tools clanking, occasional water dripping, echoing, seamless loop." },
};

const V = {
  AKSE: { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', desc: 'British, steady broadcaster, formal' },
  MARLOW: { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', desc: 'middle-aged woman, alto' },
  OKONJO: { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', desc: 'deep, resonant middle-aged man' },
  VARGA: { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', desc: 'young confident man' },
  HALDANE: { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', desc: 'British middle-aged woman, clear, dry' },
  HALLEN: { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', desc: 'husky, unsettling edge' },
};
const settingsFor = {
  AKSE: { stability: 0.6, similarity_boost: 0.8, style: 0.1 },
  MARLOW: { stability: 0.55, similarity_boost: 0.8, style: 0.2 },
  OKONJO: { stability: 0.6, similarity_boost: 0.8, style: 0.15 },
  VARGA: { stability: 0.4, similarity_boost: 0.75, style: 0.35 },
  HALDANE: { stability: 0.5, similarity_boost: 0.8, style: 0.25 },
  HALLEN: { stability: 0.65, similarity_boost: 0.8, style: 0.2 },
};
export const VOICE = {
  'brief-1': ['AKSE', 'Captain. The Directorate pushed a recon group into Marrow Yard before dawn. Five walkers, dug in among the freight lines.'],
  'brief-2': ['AKSE', 'That yard is the only rail link into Kerrow. The Concord wants it open before the supply train arrives at noon.'],
  'brief-3': ['AKSE', 'Clear every Directorate walker from the yard. Their commander will be sitting by the grain silos.'],
  'brief-4': ['MARLOW', 'Understood. Varga takes the left track. Okonjo and Haldane come up the middle with me.'],
  'brief-5': ['AKSE', 'One more thing. Whatever you strip off their machines is yours. Salvage rights are in the contract.'],
  'brief-6': ['MARLOW', "Then let's go earn it. Lanterns, move out."],
  'intercept': ['HALLEN', 'Contract dogs. Hold the silos and let them come to us.'],
  'debrief-win': ['AKSE', 'The yard is ours, and the train comes through at noon. Good work, Captain. Your salvage is on the flatbeds.'],
  'debrief-lose': ['AKSE', "Pull back, Captain. We'll find another way into Kerrow."],
  'marlow-select': ['MARLOW', 'Marlow here.'], 'marlow-attack': ['MARLOW', 'Engaging.'], 'marlow-hit': ['MARLOW', 'Taking hits, still up.'], 'marlow-down': ['MARLOW', 'Punching out!'],
  'okonjo-select': ['OKONJO', 'Okonjo. Go ahead.'], 'okonjo-attack': ['OKONJO', 'Firing now.'], 'okonjo-hit': ['OKONJO', 'Armour is going.'], 'okonjo-down': ['OKONJO', 'Eject, eject!'],
  'varga-select': ['VARGA', 'Varga, ready.'], 'varga-attack': ['VARGA', 'Say goodnight!'], 'varga-hit': ['VARGA', 'That one stung!'], 'varga-down': ['VARGA', 'I am out, I am out!'],
  'haldane-select': ['HALDANE', 'Haldane. Make it quick.'], 'haldane-attack': ['HALDANE', 'Here is yours.'], 'haldane-hit': ['HALDANE', 'Rude. Very rude.'], 'haldane-down': ['HALDANE', 'Bailing, bailing!'],
  'hallen-down': ['HALLEN', 'No... fall back!'],
};

function probe(file) {
  const dur = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const st = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'astats=measure_perchannel=none:measure_overall=Peak_level+RMS_level', '-f', 'null', '-'], { encoding: 'utf8' });
  const txt = st.stderr || '';
  const peak = parseFloat((txt.match(/Peak level dB:\s*(-?[\d.]+|-inf)/g) || []).pop()?.split(':')[1]);
  const rms = parseFloat((txt.match(/RMS level dB:\s*(-?[\d.]+|-inf)/g) || []).pop()?.split(':')[1]);
  const seconds = parseFloat(dur.stdout);
  return { seconds: +seconds.toFixed(2), peak, rms, crest: +(peak - rms).toFixed(1) };
}

const want = (id) => !ONLY || ONLY.has(id);
async function make(file, producer) {
  if (!FORCE && (await exists(file))) return false;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, await producer());
  console.log('made', path.relative(ROOT, file));
  return true;
}

async function doMusic() {
  for (const [id, m] of Object.entries(MUSIC)) {
    if (!want(id)) continue;
    await make(path.join(OUT, 'music', id + '.mp3'), () => post('/v1/music', { prompt: m.prompt, music_length_ms: m.seconds * 1000, force_instrumental: true }));
  }
}
async function doSfx() {
  for (const [id, s] of Object.entries(SFX)) {
    if (!want(id)) continue;
    for (let n = 1; n <= s.n; n++) {
      await make(path.join(OUT, 'sfx', `${id}-${n}.mp3`), () => post('/v1/sound-generation', { text: s.p, duration_seconds: s.d, prompt_influence: 0.6, ...(s.loop ? { loop: true } : {}) }));
    }
  }
}
async function doVoice() {
  for (const [id, [who, text]] of Object.entries(VOICE)) {
    if (!want(id)) continue;
    await make(path.join(OUT, 'voice', id + '.mp3'), () => post(`/v1/text-to-speech/${V[who].id}?output_format=mp3_44100_128`, { text, model_id: 'eleven_multilingual_v2', voice_settings: settingsFor[who] }));
  }
}

// Per-file gain: bring RMS toward a target; limit so peak stays under -1 dBFS. Music/loops quieter than one-shots.
function gainFor(m, target) {
  if (!isFinite(m.rms) || !isFinite(m.peak)) return 1;
  let db = target - m.rms;
  db = Math.min(db, -1 - m.peak + 0); // never push peak above -1 dBFS
  db = Math.max(-12, Math.min(db, 12));
  return +Math.pow(10, db / 20).toFixed(3);
}
async function doIndex() {
  const hasFfmpeg = spawnSync('ffprobe', ['-version']).status === 0;
  const idx = { music: {}, sfx: {}, voice: {} };
  const rows = [];
  const meas = async (rel, target, kind, id, crestMin) => {
    const f = path.join(OUT, rel);
    if (!(await exists(f))) return null;
    const m = hasFfmpeg ? probe(f) : { seconds: 0, peak: NaN, rms: NaN, crest: NaN };
    const clipped = m.peak > 2; // decoded-mp3 overshoot up to ~2 dB is normal; gain keeps peak under -1 dBFS
    const silent = m.rms < -60;
    const low = crestMin && m.crest < crestMin;
    rows.push({ kind, id, file: rel, ...m, clipped, silent, lowCrest: !!low });
    return { m, gain: gainFor(m, target) };
  };
  for (const [id, m] of Object.entries(MUSIC)) {
    const r = await meas(`music/${id}.mp3`, -20, 'music', id, 0);
    if (r) idx.music[id] = { file: `audio/music/${id}.mp3`, gain: r.gain, loop: m.loop, seconds: r.m.seconds };
  }
  for (const [id, s] of Object.entries(SFX)) {
    const list = [];
    for (let n = 1; n <= s.n; n++) {
      const r = await meas(`sfx/${id}-${n}.mp3`, s.loop ? -26 : -18, 'sfx', `${id}-${n}`, s.crest);
      if (r) list.push({ file: `audio/sfx/${id}-${n}.mp3`, gain: r.gain, seconds: r.m.seconds });
    }
    if (list.length) idx.sfx[id] = list;
  }
  for (const [id, [who, text]] of Object.entries(VOICE)) {
    const r = await meas(`voice/${id}.mp3`, -20, 'voice', id, 0);
    if (r) idx.voice[id] = { file: `audio/voice/${id}.mp3`, gain: r.gain, seconds: r.m.seconds, speaker: who, text };
  }
  await writeFile(path.join(OUT, 'index.json'), JSON.stringify(idx, null, 2) + '\n');
  await writeFile(path.join(OUT, 'measurements.json'), JSON.stringify(rows, null, 2) + '\n');
  console.log(hasFfmpeg ? 'index + measurements written' : 'ffmpeg missing: index written without measurements');
  for (const r of rows) if (r.clipped || r.silent || r.lowCrest) console.log('FLAG', r.id, r.peak, r.rms, r.crest, r.clipped ? 'clipped' : '', r.silent ? 'silent' : '', r.lowCrest ? 'lowcrest' : '');
}

if (phase === 'music' || phase === 'all') await doMusic();
if (phase === 'sfx' || phase === 'all') await doSfx();
if (phase === 'voice' || phase === 'all') await doVoice();
if (phase === 'index' || phase === 'all') await doIndex();
