// Sound pass 1 (PLAN.md M4; KB recipe step 8): every sound is synthesized in Web Audio, no samples, so the repo
// holds no audio files and the owner judges each by ear on sounds.html before any generated audio replaces it.
// Everything here is a pure function of (context, destination, time); the director (director.ts) decides when.
// Register: the D11 console. Agency arms crack and ring like period small arms through a radio compressor; alien
// sounds are wet, glassy and low; the console itself clacks and chimes (two-tone alert, presentation concept 3).

export type SoundName =
  | 'fire-pistol'
  | 'fire-carbine'
  | 'fire-scatter'
  | 'fire-whip'
  | 'bite'
  | 'hit-armour'
  | 'hit-flesh'
  | 'hit-alien'
  | 'breach'
  | 'collapse'
  | 'taking'
  | 'revealed'
  | 'alert'
  | 'down-agent'
  | 'down-hostile'
  | 'pause'
  | 'resume'
  | 'click'
  | 'paddle'
  | 'order'
  | 'refused'
  | 'raid-over'
  | 'ambient';

export interface SoundInfo {
  name: SoundName;
  group: 'fire' | 'hit' | 'structure' | 'alien' | 'console' | 'ambient';
  /** What drives it in the game. */
  cue: string;
  /** How it is made, for the ear and the record (KB gotchas, audio: describe the mechanism). */
  mechanism: string;
  seconds: number;
}

export const SOUNDS: SoundInfo[] = [
  { name: 'fire-pistol', group: 'fire', cue: 'shot event, service or pocket pistol', mechanism: 'short noise burst through a 1.6 kHz band-pass with a fast pitch-dropping sine thump', seconds: 0.25 },
  { name: 'fire-carbine', group: 'fire', cue: 'shot event, patrol carbine', mechanism: 'sharper noise crack, 2.4 kHz band-pass, deeper thump and a short slap-back echo', seconds: 0.35 },
  { name: 'fire-scatter', group: 'fire', cue: 'shot event, scatter gun', mechanism: 'wide low noise bloom, 500 Hz low-pass, long thump, longer tail', seconds: 0.5 },
  { name: 'fire-whip', group: 'fire', cue: 'shot event, lash whip (the fighter)', mechanism: 'rising sine sweep 300 to 1800 Hz then a wet snap: filtered noise with a 90 Hz amplitude wobble', seconds: 0.45 },
  { name: 'bite', group: 'alien', cue: 'shot event, taker bite', mechanism: 'two detuned low saws with a chewing tremolo and a clicky noise tick', seconds: 0.4 },
  { name: 'hit-armour', group: 'hit', cue: 'damaged event on an agent', mechanism: 'metallic ping: three inharmonic sines (2.1, 3.3, 5.2 kHz) decaying fast under a noise tick', seconds: 0.3 },
  { name: 'hit-flesh', group: 'hit', cue: 'damaged event on a citizen', mechanism: 'dull thud: low-passed noise with a 120 Hz sine, very short', seconds: 0.2 },
  { name: 'hit-alien', group: 'hit', cue: 'damaged event on a hostile', mechanism: 'glassy splash: band-passed noise sweeping down from 3 kHz with a 700 Hz ring', seconds: 0.35 },
  { name: 'breach', group: 'structure', cue: 'blast event and a wall, door or window destroyed', mechanism: 'low boom (sine 60 to 30 Hz) under a wide noise crash with a rubble rattle of random short clicks', seconds: 1.4 },
  { name: 'collapse', group: 'structure', cue: 'a floor collapses into void', mechanism: 'longer rumble: brown-ish noise through a falling low-pass, then a scatter of impacts', seconds: 1.8 },
  { name: 'taking', group: 'alien', cue: 'taken event the squad watched', mechanism: 'wet rising chord of three detuned sines with a slow tremolo and a breathy noise layer', seconds: 1.2 },
  { name: 'revealed', group: 'alien', cue: 'revealed event (a host shows itself)', mechanism: 'a glassy shimmer (filtered noise) with a low amber hum rising a fifth', seconds: 0.9 },
  { name: 'alert', group: 'console', cue: 'an alert slip: agent down, host revealed, taking', mechanism: 'two-tone chime: 880 then 660 Hz sines with soft attacks, a touch of 2nd harmonic', seconds: 0.7 },
  { name: 'down-agent', group: 'console', cue: 'down event on an agent', mechanism: 'the alert chime, then a low two-note fall (330 to 220 Hz)', seconds: 1.1 },
  { name: 'down-hostile', group: 'alien', cue: 'down event on a hostile', mechanism: 'a glassy collapse: band-passed noise falling with a detuned low pair', seconds: 0.7 },
  { name: 'pause', group: 'console', cue: 'the paddle goes down (pause)', mechanism: 'relay clack: a 4 ms noise click into a 1.2 kHz resonance, then a soft low hum fading in', seconds: 0.35 },
  { name: 'resume', group: 'console', cue: 'the paddle comes up (time running)', mechanism: 'the clack in reverse order: hum out, then a brighter 1.8 kHz click', seconds: 0.3 },
  { name: 'click', group: 'console', cue: 'any console switch', mechanism: 'a 3 ms click with a 2.5 kHz body', seconds: 0.06 },
  { name: 'paddle', group: 'console', cue: 'a big switch (start raid, continue)', mechanism: 'heavier clack: two clicks 40 ms apart with an 800 Hz body', seconds: 0.15 },
  { name: 'order', group: 'console', cue: 'an accepted order', mechanism: 'a short soft tick at 1.4 kHz', seconds: 0.08 },
  { name: 'refused', group: 'console', cue: 'an order the engine refused', mechanism: 'a dull double buzz at 180 Hz', seconds: 0.25 },
  { name: 'raid-over', group: 'console', cue: 'the over event', mechanism: 'three-note chime, major for a cleared building, minor otherwise', seconds: 1.6 },
  { name: 'ambient', group: 'ambient', cue: 'the battle screen (loops; pauses with the sim)', mechanism: 'city bed: filtered noise wind with slow swells, a 55 Hz transformer hum with a 110 Hz partial, and sparse distant traffic swells', seconds: 8 },
];

export const SOUND_NAMES: SoundName[] = SOUNDS.map((s) => s.name);

// ---------------------------------------------------------------------------------------------------------

let noiseBuffer: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const n = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    d[i] = (s / 4294967296) * 2 - 1;
  }
  noiseBuffer = b;
  return b;
}

/** A gain that ramps in and out, connected to `out`. */
function env(ctx: BaseAudioContext, out: AudioNode, t0: number, attack: number, hold: number, release: number, peak = 1): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.max(0.001, attack));
  g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  g.connect(out);
  return g;
}

function tone(ctx: BaseAudioContext, out: AudioNode, t0: number, type: OscillatorType, f0: number, f1: number, dur: number, attack: number, peak: number): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = env(ctx, out, t0, attack, 0, dur - attack, peak);
  o.connect(g);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function burst(ctx: BaseAudioContext, out: AudioNode, t0: number, dur: number, peak: number, filter: { type: BiquadFilterType; f0: number; f1?: number; q?: number }, attack = 0.002): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter.type;
  f.frequency.setValueAtTime(filter.f0, t0);
  if (filter.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, filter.f1), t0 + dur);
  f.Q.value = filter.q ?? 1;
  const g = env(ctx, out, t0, attack, 0, dur - attack, peak);
  src.connect(f);
  f.connect(g);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

function click(ctx: BaseAudioContext, out: AudioNode, t0: number, body: number, peak: number, ms = 4): void {
  burst(ctx, out, t0, ms / 1000 + 0.03, peak, { type: 'bandpass', f0: body, q: 6 }, 0.001);
}

function rattle(ctx: BaseAudioContext, out: AudioNode, t0: number, count: number, over: number, peak: number, seed: number): void {
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const at = t0 + (i / count) * over + (s / 4294967296) * (over / count);
    s = (s * 1664525 + 1013904223) >>> 0;
    click(ctx, out, at, 600 + (s / 4294967296) * 1800, peak * (1 - i / count), 6);
  }
}

/**
 * Plays one sound into `out` at `t0`. Returns the nodes that must be stopped for a loop (ambient), else nothing.
 * `variant` nudges pitch so repeated shots do not sound stamped.
 */
export function play(ctx: BaseAudioContext, out: AudioNode, name: SoundName, t0 = ctx.currentTime, variant = 0): { stop: (at: number) => void } | null {
  const v = 1 + ((variant % 7) - 3) * 0.025;
  switch (name) {
    case 'fire-pistol':
      burst(ctx, out, t0, 0.12, 0.9, { type: 'bandpass', f0: 1600 * v, f1: 900, q: 1.2 });
      tone(ctx, out, t0, 'sine', 220 * v, 60, 0.18, 0.002, 0.7);
      return null;
    case 'fire-carbine':
      burst(ctx, out, t0, 0.09, 1.0, { type: 'bandpass', f0: 2400 * v, f1: 1200, q: 1.5 });
      tone(ctx, out, t0, 'sine', 180 * v, 45, 0.22, 0.002, 0.8);
      burst(ctx, out, t0 + 0.11, 0.08, 0.25, { type: 'bandpass', f0: 1200, f1: 600, q: 1.5 }); // slap-back
      return null;
    case 'fire-scatter':
      burst(ctx, out, t0, 0.3, 1.0, { type: 'lowpass', f0: 500 * v, f1: 120, q: 0.7 });
      burst(ctx, out, t0, 0.06, 0.6, { type: 'highpass', f0: 2500, q: 0.7 });
      tone(ctx, out, t0, 'sine', 140 * v, 35, 0.4, 0.003, 0.9);
      return null;
    case 'fire-whip':
      tone(ctx, out, t0, 'sine', 300 * v, 1800 * v, 0.18, 0.02, 0.35);
      burst(ctx, out, t0 + 0.18, 0.2, 0.8, { type: 'bandpass', f0: 1400 * v, f1: 500, q: 2 });
      {
        // the wet snap: tremolo on a low noise
        const g = ctx.createGain();
        g.gain.value = 0.5;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 90;
        const lg = ctx.createGain();
        lg.gain.value = 0.5;
        lfo.connect(lg);
        lg.connect(g.gain);
        g.connect(out);
        burst(ctx, g, t0 + 0.2, 0.22, 0.8, { type: 'lowpass', f0: 900, f1: 200, q: 1 });
        lfo.start(t0);
        lfo.stop(t0 + 0.5);
      }
      return null;
    case 'bite':
      tone(ctx, out, t0, 'sawtooth', 110 * v, 80, 0.35, 0.01, 0.25);
      tone(ctx, out, t0, 'sawtooth', 116 * v, 84, 0.35, 0.01, 0.25);
      click(ctx, out, t0 + 0.05, 3000, 0.5, 5);
      click(ctx, out, t0 + 0.2, 2200, 0.4, 5);
      burst(ctx, out, t0 + 0.08, 0.25, 0.3, { type: 'lowpass', f0: 700, f1: 300, q: 1 });
      return null;
    case 'hit-armour':
      for (const f of [2100, 3300, 5200]) tone(ctx, out, t0, 'sine', f * v, f * v * 0.98, 0.25, 0.001, 0.22);
      click(ctx, out, t0, 4000, 0.6, 3);
      return null;
    case 'hit-flesh':
      burst(ctx, out, t0, 0.14, 0.7, { type: 'lowpass', f0: 600, f1: 150, q: 0.8 });
      tone(ctx, out, t0, 'sine', 120 * v, 70, 0.16, 0.002, 0.5);
      return null;
    case 'hit-alien':
      burst(ctx, out, t0, 0.3, 0.7, { type: 'bandpass', f0: 3000 * v, f1: 600, q: 3 });
      tone(ctx, out, t0, 'sine', 700 * v, 650, 0.3, 0.005, 0.3);
      return null;
    case 'breach':
      tone(ctx, out, t0, 'sine', 60, 30, 0.9, 0.005, 1.0);
      burst(ctx, out, t0, 0.5, 1.0, { type: 'lowpass', f0: 3000, f1: 200, q: 0.7 });
      burst(ctx, out, t0, 0.08, 0.8, { type: 'highpass', f0: 1500, q: 0.7 });
      rattle(ctx, out, t0 + 0.25, 14, 1.0, 0.35, 7);
      return null;
    case 'collapse':
      burst(ctx, out, t0, 1.3, 0.9, { type: 'lowpass', f0: 800, f1: 60, q: 0.8 }, 0.05);
      tone(ctx, out, t0 + 0.1, 'sine', 50, 28, 1.2, 0.05, 0.9);
      rattle(ctx, out, t0 + 0.6, 18, 1.1, 0.4, 11);
      return null;
    case 'taking':
      for (const [f, d] of [[220, 0], [277, 0.1], [330, 0.2]] as [number, number][]) tone(ctx, out, t0 + d, 'sine', f * 0.98, f * 1.5, 1.0 - d, 0.15, 0.22);
      burst(ctx, out, t0, 1.1, 0.25, { type: 'bandpass', f0: 900, f1: 2200, q: 1.5 }, 0.3);
      return null;
    case 'revealed':
      burst(ctx, out, t0, 0.8, 0.35, { type: 'bandpass', f0: 2500, f1: 4500, q: 4 }, 0.1);
      tone(ctx, out, t0, 'triangle', 110, 165, 0.85, 0.1, 0.35);
      return null;
    case 'alert':
      tone(ctx, out, t0, 'sine', 880, 880, 0.3, 0.02, 0.5);
      tone(ctx, out, t0, 'sine', 1760, 1760, 0.3, 0.02, 0.08);
      tone(ctx, out, t0 + 0.32, 'sine', 660, 660, 0.35, 0.02, 0.5);
      tone(ctx, out, t0 + 0.32, 'sine', 1320, 1320, 0.35, 0.02, 0.08);
      return null;
    case 'down-agent':
      play(ctx, out, 'alert', t0, variant);
      tone(ctx, out, t0 + 0.7, 'triangle', 330, 330, 0.2, 0.01, 0.4);
      tone(ctx, out, t0 + 0.9, 'triangle', 220, 215, 0.25, 0.01, 0.4);
      return null;
    case 'down-hostile':
      burst(ctx, out, t0, 0.6, 0.6, { type: 'bandpass', f0: 2200 * v, f1: 300, q: 2.5 });
      tone(ctx, out, t0, 'sawtooth', 90 * v, 50, 0.6, 0.01, 0.2);
      tone(ctx, out, t0, 'sawtooth', 95 * v, 52, 0.6, 0.01, 0.2);
      return null;
    case 'pause':
      click(ctx, out, t0, 1200, 0.9, 4);
      tone(ctx, out, t0 + 0.03, 'sine', 110, 110, 0.3, 0.1, 0.12);
      return null;
    case 'resume':
      tone(ctx, out, t0, 'sine', 110, 110, 0.12, 0.005, 0.12);
      click(ctx, out, t0 + 0.1, 1800, 0.9, 4);
      return null;
    case 'click':
      click(ctx, out, t0, 2500, 0.6, 3);
      return null;
    case 'paddle':
      click(ctx, out, t0, 800, 1.0, 5);
      click(ctx, out, t0 + 0.04, 1000, 0.7, 5);
      return null;
    case 'order':
      tone(ctx, out, t0, 'sine', 1400, 1400, 0.07, 0.003, 0.3);
      return null;
    case 'refused':
      tone(ctx, out, t0, 'square', 180, 180, 0.08, 0.003, 0.12);
      tone(ctx, out, t0 + 0.12, 'square', 180, 170, 0.1, 0.003, 0.12);
      return null;
    case 'raid-over': {
      const major = variant >= 0;
      const notes = major ? [523, 659, 784] : [523, 622, 740];
      notes.forEach((f, i) => tone(ctx, out, t0 + i * 0.3, 'sine', f, f, 0.9 - i * 0.1, 0.03, 0.4));
      return null;
    }
    case 'ambient': {
      // The city bed: wind, hum, distant swells. Looping sources, stopped by the returned handle.
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, t0);
      master.gain.exponentialRampToValueAtTime(1, t0 + 1.5);
      master.connect(out);
      const wind = ctx.createBufferSource();
      wind.buffer = noise(ctx);
      wind.loop = true;
      const wf = ctx.createBiquadFilter();
      wf.type = 'lowpass';
      wf.frequency.value = 420;
      wf.Q.value = 0.6;
      const wg = ctx.createGain();
      wg.gain.value = 0.11;
      const swell = ctx.createOscillator();
      swell.frequency.value = 0.09;
      const sg = ctx.createGain();
      sg.gain.value = 0.05;
      swell.connect(sg);
      sg.connect(wg.gain);
      wind.connect(wf);
      wf.connect(wg);
      wg.connect(master);
      const hum = ctx.createOscillator();
      hum.type = 'sine';
      hum.frequency.value = 55;
      const hum2 = ctx.createOscillator();
      hum2.type = 'triangle';
      hum2.frequency.value = 110;
      const hg = ctx.createGain();
      hg.gain.value = 0.045;
      const hg2 = ctx.createGain();
      hg2.gain.value = 0.012;
      hum.connect(hg);
      hum2.connect(hg2);
      hg.connect(master);
      hg2.connect(master);
      // Traffic: a band of noise whose gain swells on a slow irregular cycle.
      const traffic = ctx.createBufferSource();
      traffic.buffer = noise(ctx);
      traffic.loop = true;
      const tf = ctx.createBiquadFilter();
      tf.type = 'bandpass';
      tf.frequency.value = 180;
      tf.Q.value = 1.2;
      const tg = ctx.createGain();
      tg.gain.value = 0.0;
      const t1 = ctx.createOscillator();
      t1.frequency.value = 0.031;
      const t2 = ctx.createOscillator();
      t2.frequency.value = 0.047;
      const tga = ctx.createGain();
      tga.gain.value = 0.03;
      const tgb = ctx.createGain();
      tgb.gain.value = 0.02;
      t1.connect(tga);
      t2.connect(tgb);
      tga.connect(tg.gain);
      tgb.connect(tg.gain);
      traffic.connect(tf);
      tf.connect(tg);
      tg.connect(master);
      const nodes = [wind, swell, hum, hum2, traffic, t1, t2];
      for (const n of nodes) n.start(t0);
      return {
        stop: (at: number) => {
          master.gain.cancelScheduledValues(at);
          master.gain.setValueAtTime(master.gain.value, at);
          master.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
          for (const n of nodes) n.stop(at + 0.7);
        },
      };
    }
    default:
      return null;
  }
}

export function soundInfo(name: SoundName): SoundInfo {
  return SOUNDS.find((s) => s.name === name)!;
}
