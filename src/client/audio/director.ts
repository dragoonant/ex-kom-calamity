// The audio director: subscribes to the client store and plays sounds for its fx queue (fx.ts), the pause paddle,
// orders and the screen; one AudioContext for the session, unlocked by the first pointerup, touchend, click or keydown
// and retried after (KB gotchas: iOS Safari resumes only from those). Volume, mute, music level and the source switch
// come from settings.ts. Pass 2 (PLAN.md Q21): every name plays its generated take from the sample bank (bank.ts)
// when the file is there and decoded, else the pass 1 synth (synth.ts); the music player (music.ts) follows the
// screen: calm on the title, battle in the raid, tense once the last hostiles are marked, a stinger on the report.
// Nothing here touches the engine; everything it plays, the agency could see (fx.ts filters).
// Headless tests read `window.__ekc.audio()` (played counts, bank and music reports) instead of listening.
import { WEAPONS } from '../../data';
import type { Fx } from '../fx';
import type { StorageLike } from '../save';
import { useClient } from '../store';
import { SampleBank, type BankReport } from './bank';
import { MusicPlayer, musicStateFor, type MusicReport } from './music';
import { DEFAULT_AUDIO, readAudioSettings, writeAudioSettings, type AudioSettings } from './settings';
import { play, type SoundName } from './synth';

export interface AudioReport {
  settings: AudioSettings;
  unlocked: boolean;
  /** Plays per sound since the page loaded, counted whether or not the context is running (so tests hear them). */
  played: Record<string, number>;
  /** Of those, plays that used a generated take rather than the synth. */
  sampled: Record<string, number>;
  ambient: boolean;
  contextState: string;
  bank: BankReport;
  music: MusicReport;
}

type Ctx = AudioContext;

/** A generated gunshot with less crest than this (in dB; crest factor 8) gets the synth's transient layered on top (KB gotchas). */
export const CREST_FLOOR_DB = 18;

export class Director {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private settings: AudioSettings;
  private played: Record<string, number> = {};
  private sampled: Record<string, number> = {};
  private ambient: { stop: (at: number) => void } | null = null;
  private lastFx = 0;
  private variant = 0;
  private lastShotAt = -1;
  private unsub: (() => void) | null = null;
  private storage: StorageLike | null;
  readonly bank: SampleBank;
  readonly music: MusicPlayer;
  private preloading: Promise<void> | null = null;

  constructor(storage: StorageLike | null, baseURI: string = (globalThis as { document?: { baseURI: string } }).document?.baseURI ?? 'http://localhost/') {
    this.storage = storage;
    this.settings = readAudioSettings(storage);
    this.bank = new SampleBank(baseURI);
    this.music = new MusicPlayer(this.bank, this.settings.music);
  }

  /** Attaches to the store and the unlock listeners. Call once from App. */
  attach(): () => void {
    let prevPaused = useClient.getState().paused;
    let prevScreen = useClient.getState().screen;
    let prevSlipId = useClient.getState().slips.at(-1)?.id ?? 0;
    this.unsub = useClient.subscribe((s) => {
      // New fx: play each kind once per commit per kind, so a volley of eight hits is one sound, not eight.
      if (s.fx.length && s.fx[s.fx.length - 1]!.id > this.lastFx) {
        const fresh = s.fx.filter((f) => f.id > this.lastFx);
        this.lastFx = s.fx[s.fx.length - 1]!.id;
        this.playFx(fresh);
      }
      if (s.screen !== prevScreen) {
        if (s.screen === 'battle') this.startAmbient();
        else this.stopAmbient();
        if (s.screen === 'report') this.sound('raid-over', s.report?.over?.winner === 'agency' ? 1 : -1);
        prevScreen = s.screen;
      }
      if (s.paused !== prevPaused && s.screen === 'battle') {
        this.sound(s.paused ? 'pause' : 'resume');
        this.setAmbientPaused(s.paused);
        prevPaused = s.paused;
      }
      this.music.duck(s.screen === 'battle' && s.paused);
      this.music.set(musicStateFor(s.screen, s.agency?.marks !== undefined, s.report?.over?.winner));
      // Order and refusal slips (the console's own feedback), never a hostile's (AI-9 keeps those out of the tray).
      const last = s.slips[s.slips.length - 1];
      if (last && last.id !== prevSlipId) {
        const fresh = s.slips.filter((x) => x.id > prevSlipId);
        prevSlipId = last.id;
        for (const sl of fresh) {
          if (/^Order refused:/.test(sl.text)) this.sound('refused');
          else if (/: (move to|fire at|stance|halt\.|arming a charge)/.test(sl.text)) this.sound('order');
        }
      }
    });
    const s0 = useClient.getState();
    this.music.set(musicStateFor(s0.screen, s0.agency?.marks !== undefined, s0.report?.over?.winner));
    // The index is one small fetch; the takes decode after the first gesture, when a context exists.
    void this.bank.load();
    const unlock = () => void this.unlock();
    const onPointer = (e: Event) => {
      unlock();
      // Console clicks: any button on the page (KB rule 8 keeps the HUD to buttons and toggles).
      const t = e.target as HTMLElement | null;
      const b = t?.closest?.('button, a.toggle');
      if (b) this.sound(b.classList.contains('toggle-big') || b.classList.contains('paddle') ? 'paddle' : 'click');
    };
    document.addEventListener('pointerdown', onPointer, { capture: true });
    for (const ev of ['pointerup', 'touchend', 'click', 'keydown'] as const) document.addEventListener(ev, unlock, { capture: true, passive: true });
    return () => {
      this.unsub?.();
      document.removeEventListener('pointerdown', onPointer, { capture: true });
      for (const ev of ['pointerup', 'touchend', 'click', 'keydown'] as const) document.removeEventListener(ev, unlock, { capture: true });
      this.stopAmbient();
      this.music.stop();
    };
  }

  private context(): Ctx | null {
    if (this.ctx) return this.ctx;
    const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.settings.muted ? 0 : this.settings.volume;
      // A gentle compressor keeps a volley of shots from clipping (KB gotchas: measure and layer).
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.music.bind(this.ctx, this.master);
      this.preload();
    } catch {
      this.ctx = null;
      this.master = null;
    }
    return this.ctx;
  }

  /** Decodes every take once a context exists; the music starts as soon as its track lands. */
  private preload(): Promise<void> {
    if (this.preloading || !this.ctx) return this.preloading ?? Promise.resolve();
    this.preloading = this.bank.preload(this.ctx).then(() => this.music.tryStart());
    return this.preloading;
  }

  async unlock(): Promise<void> {
    const ctx = this.context();
    if (!ctx) return;
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        // iOS: try again on the next gesture (the listeners stay for the session).
      }
    }
    if (ctx.state === 'running') {
      if (useClient.getState().screen === 'battle' && !this.ambient && !useClient.getState().paused) this.startAmbient();
      if (!this.settings.muted) this.music.tryStart();
    }
  }

  get unlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  setVolume(volume: number): void {
    this.settings = { ...this.settings, volume: Math.min(1, Math.max(0, volume)) };
    this.apply();
  }

  setMuted(muted: boolean): void {
    this.settings = { ...this.settings, muted };
    this.apply();
  }

  setMusicVolume(music: number): void {
    this.settings = { ...this.settings, music: Math.min(1, Math.max(0, music)) };
    this.apply();
  }

  setSource(source: AudioSettings['source']): void {
    this.settings = { ...this.settings, source };
    this.apply();
  }

  private apply(): void {
    writeAudioSettings(this.storage, this.settings);
    if (this.master && this.ctx) {
      const v = this.settings.muted ? 0.0001 : Math.max(0.0001, this.settings.volume);
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
    }
    this.music.setVolume(this.settings.music);
    if (this.settings.muted) {
      this.stopAmbient();
      this.music.stop();
    } else {
      if (useClient.getState().screen === 'battle' && !useClient.getState().paused) this.startAmbient();
      const s = useClient.getState();
      this.music.set(musicStateFor(s.screen, s.agency?.marks !== undefined, s.report?.over?.winner));
    }
  }

  /** Whether `name` would play its generated take now. */
  private sampleFor(name: SoundName): boolean {
    return this.settings.source !== 'synth' && this.bank.has(name);
  }

  /** Counts the play and schedules it when the context runs; muted still counts (the test hears the count). */
  sound(name: SoundName, variant = this.variant++): void {
    this.played[name] = (this.played[name] ?? 0) + 1;
    const ctx = this.context();
    if (!ctx || !this.master || ctx.state !== 'running' || this.settings.muted) return;
    try {
      if (this.sampleFor(name)) {
        const h = this.bank.play(ctx, this.master, name, ctx.currentTime, variant);
        if (h) {
          this.sampled[name] = (this.sampled[name] ?? 0) + 1;
          // A soft generated gunshot gets the synth's crack under it, quietly, for the transient it lacks.
          if (name.startsWith('fire-') && h.take.crestDb < CREST_FLOOR_DB) {
            const g = ctx.createGain();
            g.gain.value = 0.35;
            g.connect(this.master);
            play(ctx, g, name, ctx.currentTime, variant);
          }
          return;
        }
      }
      play(ctx, this.master, name, ctx.currentTime, variant);
    } catch {
      // A failed node graph is a missed sound, never an error in the game.
    }
  }

  private playFx(fresh: Fx[]): void {
    const once = new Set<SoundName>();
    const fire = (n: SoundName) => {
      if (once.has(n)) return;
      once.add(n);
      this.sound(n);
    };
    for (const f of fresh) {
      switch (f.kind) {
        case 'muzzle': {
          const w = f.weapon ? WEAPONS[f.weapon] : undefined;
          // Rounds in the same tick: one report per weapon class.
          if (f.tick === this.lastShotAt && once.size) break;
          this.lastShotAt = f.tick;
          if (f.weapon === 'taker-bite') fire('bite');
          else if (f.weapon === 'lash-whip') fire('fire-whip');
          else if (f.weapon === 'scatter-gun') fire('fire-scatter');
          else if (f.weapon === 'patrol-carbine') fire('fire-carbine');
          else if (w?.kind === 'melee') fire('bite');
          else fire('fire-pistol');
          break;
        }
        case 'hit':
          fire(f.side === 'agency' ? 'hit-armour' : f.side === 'hostile' ? 'hit-alien' : 'hit-flesh');
          break;
        case 'blast':
        case 'breach':
          fire('breach');
          break;
        case 'collapse':
          fire('collapse');
          break;
        case 'down':
          fire(f.side === 'agency' ? 'down-agent' : f.side === 'hostile' ? 'down-hostile' : 'hit-flesh');
          break;
        case 'fell':
          fire('hit-flesh');
          break;
        case 'revealed':
          fire('revealed');
          fire('alert');
          break;
        case 'taken':
          fire('taking');
          fire('alert');
          break;
        default:
          break;
      }
    }
  }

  private startAmbient(): void {
    if (this.ambient || this.settings.muted) return;
    const ctx = this.context();
    if (!ctx || !this.master || ctx.state !== 'running') return;
    this.played.ambient = (this.played.ambient ?? 0) + 1;
    if (this.sampleFor('ambient')) {
      this.ambient = this.bank.play(ctx, this.master, 'ambient', ctx.currentTime);
      if (this.ambient) this.sampled.ambient = (this.sampled.ambient ?? 0) + 1;
    }
    if (!this.ambient) this.ambient = play(ctx, this.master, 'ambient');
    if (useClient.getState().paused) this.setAmbientPaused(true);
  }

  private stopAmbient(): void {
    if (this.ambient && this.ctx) this.ambient.stop(this.ctx.currentTime);
    this.ambient = null;
  }

  /** The bed dips while the sim is paused: the console is quiet when time stands still. */
  private setAmbientPaused(paused: boolean): void {
    if (!this.ambient) {
      if (!paused) this.startAmbient();
      return;
    }
    if (paused) this.stopAmbient();
  }

  report(): AudioReport {
    return {
      settings: this.getSettings(),
      unlocked: this.unlocked,
      played: { ...this.played },
      sampled: { ...this.sampled },
      ambient: !!this.ambient,
      contextState: this.ctx?.state ?? 'none',
      bank: this.bank.report(),
      music: this.music.report(),
    };
  }
}

export { DEFAULT_AUDIO };
