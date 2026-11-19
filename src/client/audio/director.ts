// The audio director: subscribes to the client store and plays synth.ts sounds for its fx queue (fx.ts), the pause
// paddle, orders and the screen; one AudioContext for the session, unlocked by the first pointerup, touchend, click
// or keydown and retried after (KB gotchas: iOS Safari resumes only from those). Volume and mute come from
// settings.ts. Nothing here touches the engine; everything it plays, the agency could see (fx.ts filters).
// Headless tests read `window.__ekc.audio()` (played counts) instead of listening.
import { WEAPONS } from '../../data';
import type { Fx } from '../fx';
import type { StorageLike } from '../save';
import { useClient } from '../store';
import { DEFAULT_AUDIO, readAudioSettings, writeAudioSettings, type AudioSettings } from './settings';
import { play, type SoundName } from './synth';

export interface AudioReport {
  settings: AudioSettings;
  unlocked: boolean;
  /** Plays per sound since the page loaded, counted whether or not the context is running (so tests hear them). */
  played: Record<string, number>;
  ambient: boolean;
  contextState: string;
}

type Ctx = AudioContext;

export class Director {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private settings: AudioSettings;
  private played: Record<string, number> = {};
  private ambient: { stop: (at: number) => void } | null = null;
  private lastFx = 0;
  private variant = 0;
  private lastShotAt = -1;
  private unsub: (() => void) | null = null;
  private storage: StorageLike | null;
  private hadBattle = false;

  constructor(storage: StorageLike | null) {
    this.storage = storage;
    this.settings = readAudioSettings(storage);
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
      if (s.screen === 'battle') this.hadBattle = true;
    });
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
    } catch {
      this.ctx = null;
      this.master = null;
    }
    return this.ctx;
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
    if (ctx.state === 'running' && useClient.getState().screen === 'battle' && !this.ambient && !useClient.getState().paused) this.startAmbient();
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

  private apply(): void {
    writeAudioSettings(this.storage, this.settings);
    if (this.master && this.ctx) {
      const v = this.settings.muted ? 0.0001 : Math.max(0.0001, this.settings.volume);
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
    }
    if (this.settings.muted) this.stopAmbient();
    else if (useClient.getState().screen === 'battle' && !useClient.getState().paused) this.startAmbient();
  }

  /** Counts the play and schedules it when the context runs; muted still counts (the test hears the count). */
  sound(name: SoundName, variant = this.variant++): void {
    this.played[name] = (this.played[name] ?? 0) + 1;
    const ctx = this.context();
    if (!ctx || !this.master || ctx.state !== 'running' || this.settings.muted) return;
    try {
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
    this.ambient = play(ctx, this.master, 'ambient');
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
    return { settings: this.getSettings(), unlocked: this.unlocked, played: { ...this.played }, ambient: !!this.ambient, contextState: this.ctx?.state ?? 'none' };
  }
}

export { DEFAULT_AUDIO };
