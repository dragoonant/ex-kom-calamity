// The audio manifest (PLAN.md Q21, KB recipe step 8): one entry per sound name of src/client/audio/synth.ts and one
// per music state, each with the prompt ElevenLabs generates it from. Prompts describe the mechanism and state the
// exclusions ("no music, no voices"); the register is the D11 console: period small arms through a radio
// compressor, wet glassy aliens, a clacking and chiming switchboard, and period orchestral optimism that sours in
// combat (docs/presentation-concept.md 3). generate.ts turns this into public/audio/**.mp3 and measure.ts into
// public/audio/index.json; the client (bank.ts, music.ts) reads only the index.
import type { SoundName } from '../../src/client/audio/synth';
import type { MusicState } from '../../src/client/audio/music';

export interface SfxSpec {
  name: SoundName;
  /** One prompt for every take, or one prompt per take (raid-over: a cleared and a lost building). */
  prompt: string | string[];
  /** Takes per name: shots and hits get several so a volley is not stamped. */
  takes: number;
  seconds: number;
  /** ElevenLabs prompt influence, 0 to 1 (0.3 default; higher follows the prompt more closely). */
  influence: number;
  loop?: boolean;
  /** Playback peak the client normalizes the take to, in dBFS. */
  level: number;
}

export interface MusicSpec {
  state: MusicState;
  prompt: string;
  seconds: number;
  loop: boolean;
  level: number;
}

export const SFX_MODEL = 'eleven_text_to_sound_v3';
export const MUSIC_MODEL = 'music_v2_5';

const NO = 'No music, no voices.';

export const SFX: SfxSpec[] = [
  { name: 'fire-pistol', takes: 3, seconds: 1.0, influence: 0.6, level: -1, prompt: `A single gunshot from a mid-century service revolver fired indoors in a tiled hallway: a hard dry crack with a short slap-back echo, heard through a period radio compressor, slightly band-limited. One shot only, starting immediately. ${NO}` },
  { name: 'fire-carbine', takes: 3, seconds: 1.0, influence: 0.6, level: -1, prompt: `A single rifle shot from a short-barrelled 1950s patrol carbine fired indoors: a sharp loud crack with a deeper mechanical thump and a quick echo off concrete, through a period radio compressor. One shot only, starting immediately. ${NO}` },
  { name: 'fire-scatter', takes: 3, seconds: 1.2, influence: 0.6, level: -1, prompt: `A single shotgun blast from a short double-barrelled scatter gun fired indoors: a wide heavy boom with a low thud, then a short dusty tail. One shot only, starting immediately. ${NO}` },
  { name: 'fire-whip', takes: 2, seconds: 1.0, influence: 0.55, level: -2, prompt: `An alien lash whip: a fast rising whoosh through the air ending in a wet heavy snap, like a thick rubbery tentacle cracking against a metal cabinet. One strike only, starting immediately. ${NO}` },
  { name: 'bite', takes: 2, seconds: 0.8, influence: 0.55, level: -3, prompt: `A large alien creature biting: a wet crunching chomp with chitin clicks and a low guttural snarl, close and visceral. One bite only, starting immediately. ${NO}` },
  { name: 'hit-armour', takes: 2, seconds: 0.6, influence: 0.6, level: -4, prompt: `A bullet striking a moulded hard-shell armour plate: a short metallic clang with a bright ping and a tiny fragment tick. One impact only, very short, starting immediately. ${NO}` },
  { name: 'hit-flesh', takes: 2, seconds: 0.5, influence: 0.6, level: -5, prompt: `A dull heavy body thud: a close soft impact with a slight cloth rustle, very short. One impact only, starting immediately. ${NO}` },
  { name: 'hit-alien', takes: 2, seconds: 0.7, influence: 0.55, level: -4, prompt: `A round striking a glassy alien body: a wet splash of shattering thick glass with a brief resonant ring, short. One impact only, starting immediately. ${NO}` },
  { name: 'breach', takes: 1, seconds: 2.0, influence: 0.5, level: -1, prompt: `A demolition charge detonating indoors in a mid-century concrete building: a deep punchy explosion, a wall of brick and plaster bursting into rubble, then a rattle of falling debris and settling dust. Starts immediately. ${NO}` },
  { name: 'collapse', takes: 1, seconds: 2.5, influence: 0.5, level: -2, prompt: `A concrete floor giving way and collapsing into the storey below: a deep groaning rumble, cracking, then a cascade of heavy debris impacts and settling dust. Starts immediately. ${NO}` },
  { name: 'taking', takes: 1, seconds: 1.5, influence: 0.5, level: -6, prompt: `A person being taken over by an alien parasite: a wet rising shimmer of glassy tones, a bubbling breathy swell and a low throbbing hum climbing in pitch, eerie and organic. No melody, no speech, no music.` },
  { name: 'revealed', takes: 1, seconds: 1.0, influence: 0.5, level: -6, prompt: `An alien disguise dropping away: a glassy shimmering crackle like a membrane peeling, over a low hum that rises a fifth. Short, starting immediately. No melody, no speech, no music.` },
  { name: 'alert', takes: 1, seconds: 1.0, influence: 0.6, level: -8, prompt: `A 1950s telephone switchboard alert chime: two soft bell tones, a higher then a lower one, struck on a small brass bar, with a faint relay click just before. Clean and short, starting immediately. No other music, no voices.` },
  { name: 'down-agent', takes: 1, seconds: 1.4, influence: 0.6, level: -8, prompt: `A 1950s switchboard alert chime of two soft brass bell tones, followed by a low falling two-note tone from a valve oscillator, solemn and quiet. Starting immediately. No other music, no voices.` },
  { name: 'down-hostile', takes: 2, seconds: 1.0, influence: 0.55, level: -4, prompt: `A glassy alien body collapsing and shattering: a wet crumbling crash of thick glass with a low deflating groan. Short, starting immediately. ${NO}` },
  { name: 'pause', takes: 1, seconds: 0.6, influence: 0.7, level: -8, prompt: `A heavy bakelite toggle switch on a 1950s control console thrown down: a solid relay clack, then a soft low electrical hum fading in. Very short, starting immediately. ${NO}` },
  { name: 'resume', takes: 1, seconds: 0.5, influence: 0.7, level: -8, prompt: `A 1950s control console switch thrown back up: a soft low electrical hum cutting out, then a bright crisp relay click. Very short, starting immediately. ${NO}` },
  { name: 'click', takes: 1, seconds: 0.5, influence: 0.8, level: -12, prompt: `A single small bakelite push button on a 1950s control console pressed once: a crisp tiny click. One click only, starting immediately. ${NO}` },
  { name: 'paddle', takes: 1, seconds: 0.5, influence: 0.8, level: -8, prompt: `A large lever switch on a 1950s control console thrown once with a heavy double clack, metal on bakelite. One throw only, starting immediately. ${NO}` },
  { name: 'order', takes: 1, seconds: 0.5, influence: 0.8, level: -14, prompt: `A tiny soft electronic tick acknowledging an order on a 1950s control console: a single relay pulse through a small speaker. Very short, one tick, starting immediately. ${NO}` },
  { name: 'refused', takes: 1, seconds: 0.6, influence: 0.8, level: -12, prompt: `A dull low double buzz from a 1950s console buzzer, a refusal signal: two short buzzes, starting immediately. ${NO}` },
  {
    name: 'raid-over',
    takes: 2,
    seconds: 1.6,
    influence: 0.6,
    level: -8,
    prompt: [
      `A 1950s switchboard chime of three soft rising brass bell tones, a bright major arpeggio, a job done: struck on small brass bars, clean, starting immediately. No other music, no voices.`,
      `A 1950s switchboard chime of three soft brass bell tones in a dark minor shape, the last one lower and longer, a job failed: struck on small brass bars, clean, starting immediately. No other music, no voices.`,
    ],
  },
  { name: 'ambient', takes: 1, seconds: 20, influence: 0.5, loop: true, level: -14, prompt: `A quiet evening city bed of a 1950s metropolis heard from a top-floor window: distant traffic swells, a low transformer hum, soft wind, an occasional far-off tram bell and a distant car horn. Steady and seamless, no events that stand out. ${NO}` },
];

export const MUSIC: MusicSpec[] = [
  { state: 'calm', seconds: 90, loop: true, level: -6, prompt: `Instrumental. Mid-century civil-defence newsreel optimism for a futuristic 1950s city: a bright, confident light orchestra with warm strings, muted brass, vibraphone and glockenspiel over a gentle marching pulse, major key, hopeful and clean, as if under a poster of a skyline. No vocals. Steady throughout and loopable: no slow fade-in, no fade-out ending.` },
  { state: 'battle', seconds: 90, loop: true, level: -7, prompt: `Instrumental. A mid-century orchestral underscore for an urgent raid on a city building: the light-orchestra palette soured with dissonant muted brass stabs, tremolo strings, timpani, a ticking snare pulse and low piano clusters; tense, driving but restrained, minor key. No vocals. Steady throughout and loopable: no fade-in, no fade-out ending.` },
  { state: 'tense', seconds: 75, loop: true, level: -8, prompt: `Instrumental. Sparse, anxious mid-century orchestral suspense: a held low string drone, a slow ticking woodblock, isolated clarinet and vibraphone notes, distant timpani rolls, dissonant and quiet, as a hunt closes on the last hidden enemy in a dark building. No vocals. Steady throughout and loopable: no fade-in, no fade-out ending.` },
  { state: 'victory', seconds: 12, loop: false, level: -5, prompt: `Instrumental. A short bright mid-century orchestral fanfare of resolution: brass and strings rising to a warm major chord with a glockenspiel sparkle, then a clean full stop and silence. One statement, no vocals.` },
  { state: 'defeat', seconds: 12, loop: false, level: -6, prompt: `Instrumental. A short solemn mid-century orchestral sting of loss: low brass and strings falling to a dark minor chord, a soft timpani stroke, then silence. One statement, no vocals.` },
];

export function sfxFile(name: SoundName, take: number): string {
  return `sfx/${name}-${take + 1}.mp3`;
}

export function musicFile(state: MusicState): string {
  return `music/${state}.mp3`;
}

export function sfxPrompt(spec: SfxSpec, take: number): string {
  return Array.isArray(spec.prompt) ? (spec.prompt[take] ?? spec.prompt[0]!) : spec.prompt;
}
