// sounds.html: every sound playable from a console panel, so the owner judges each by ear (KB rule 9; recipe step 8).
// Pass 2: each name plays its generated take (public/audio, from ElevenLabs through tools/audio/) when the SOURCE
// switch says SAMPLE and the file decoded, else the pass 1 synth; a MUSIC panel auditions the five states through the
// same player the game uses. Not verified by ear until the owner listens. The same bank, music and synth the game plays.
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './base.css';
import './styles.css';
import { SOUNDS, play, type SoundName } from './client/audio/synth';
import { SampleBank, type BankReport } from './client/audio/bank';
import { MUSIC_STATES, MusicPlayer, type MusicState } from './client/audio/music';
import { browserStorage } from './client/save';
import { readAudioSettings, writeAudioSettings } from './client/audio/settings';

const MUSIC_CUES: Record<MusicState, string> = {
  calm: 'the title: period optimism under the skyline poster',
  battle: 'the raid: the same palette soured, driving but restrained',
  tense: 'the last hostiles marked (VIEW-5): sparse and anxious',
  victory: 'the report, building cleared: one fanfare, then silence',
  defeat: 'the report, raid lost: one solemn sting, then silence',
  silent: '',
};

function SoundsPage() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const ambientRef = useRef<{ stop: (at: number) => void } | null>(null);
  const storage = useMemo(() => browserStorage(), []);
  const bank = useMemo(() => new SampleBank(document.baseURI), []);
  const [settings, setSettings] = useState(() => readAudioSettings(storage));
  const music = useMemo(() => new MusicPlayer(bank, settings.music), [bank]); // eslint-disable-line react-hooks/exhaustive-deps
  const [bankReport, setBankReport] = useState<BankReport>(() => bank.report());
  const [ambient, setAmbient] = useState(false);
  const [musicState, setMusicState] = useState<MusicState>('silent');
  const [last, setLast] = useState<string>('');
  const [lastSource, setLastSource] = useState<'sample' | 'synth' | ''>('');
  const [played, setPlayed] = useState<Record<string, number>>({});

  // The index is one small fetch; the takes decode once a context exists (after the first tap).
  useEffect(() => {
    void bank.load().then(() => setBankReport(bank.report()));
  }, [bank]);

  const ctx = (): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    const AC = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!AC) return null;
    const c = new AC();
    const g = c.createGain();
    g.gain.value = settings.muted ? 0.0001 : settings.volume;
    g.connect(c.destination);
    ctxRef.current = c;
    masterRef.current = g;
    music.bind(c, g);
    void bank.preload(c).then(() => {
      setBankReport(bank.report());
      music.tryStart();
    });
    return c;
  };

  useEffect(() => {
    writeAudioSettings(storage, settings);
    if (masterRef.current) masterRef.current.gain.value = settings.muted ? 0.0001 : Math.max(0.0001, settings.volume);
    music.setVolume(settings.music);
  }, [settings, storage, music]);

  // What the card says and what a tap plays: the index names the take; the tap waits for its decode (one-off).
  const useSample = (name: SoundName): boolean => settings.source !== 'synth' && !!bank.index?.sfx[name];

  const fire = async (name: SoundName, variant = 0) => {
    const c = ctx();
    setPlayed((p) => ({ ...p, [name]: (p[name] ?? 0) + 1 }));
    setLast(name);
    if (!c || !masterRef.current) return;
    if (c.state !== 'running') await c.resume().catch(() => undefined);
    if (useSample(name) && !bank.has(name)) await bank.preload(c, false);
    const sample = useSample(name) && bank.has(name);
    setLastSource(sample ? 'sample' : 'synth');
    if (name === 'ambient') {
      if (ambientRef.current) {
        ambientRef.current.stop(c.currentTime);
        ambientRef.current = null;
        setAmbient(false);
      } else {
        ambientRef.current = (sample ? bank.play(c, masterRef.current, 'ambient', c.currentTime) : null) ?? play(c, masterRef.current, 'ambient', c.currentTime);
        setAmbient(true);
      }
      return;
    }
    if (sample && bank.play(c, masterRef.current, name, c.currentTime, variant)) return;
    play(c, masterRef.current, name, c.currentTime, variant);
  };

  const playMusic = async (state: MusicState) => {
    const c = ctx();
    if (c && c.state !== 'running') await c.resume().catch(() => undefined);
    const next = musicState === state ? 'silent' : state;
    setMusicState(next);
    music.set(next);
  };

  const groups = [...new Set(SOUNDS.map((s) => s.group))];
  const samplesReady = bankReport.status === 'ready';
  return (
    <div className="sounds" data-testid="sounds">
      <div className="console console-title sounds-console">
        <div className="console-bead" />
        <div className="title-block">
          <h1 className="title-name sounds-title">SOUND DESK</h1>
          <div className="title-sub" data-testid="sounds-sub">
            pass 2 · {SOUNDS.length} names · {samplesReady ? `${bankReport.sfx} generated takes and ${bankReport.music} music states (${bankReport.loaded}/${bankReport.total} decoded)` : bankReport.status === 'missing' ? 'no generated audio on this build: synth only' : 'reading the audio index'} · judged by ear
          </div>
        </div>
        <div className="switch-row sounds-controls">
          <button type="button" className={`toggle ${settings.muted ? 'toggle-alert' : ''}`} data-testid="sounds-mute" aria-pressed={settings.muted} onClick={() => setSettings((s) => ({ ...s, muted: !s.muted }))}>
            {settings.muted ? 'MUTED' : 'MUTE'}
          </button>
          <label className="volume">
            VOLUME <span className="num">{Math.round(settings.volume * 100)}</span>
            <input type="range" min={0} max={100} value={Math.round(settings.volume * 100)} data-testid="sounds-volume" onChange={(e) => setSettings((s) => ({ ...s, volume: Number(e.target.value) / 100 }))} />
          </label>
          <label className="volume">
            MUSIC <span className="num">{Math.round(settings.music * 100)}</span>
            <input type="range" min={0} max={100} value={Math.round(settings.music * 100)} data-testid="sounds-music-volume" onChange={(e) => setSettings((s) => ({ ...s, music: Number(e.target.value) / 100 }))} />
          </label>
          <button type="button" className={`toggle ${settings.source === 'synth' ? 'toggle-alert' : 'toggle-on'}`} data-testid="sounds-source" aria-pressed={settings.source === 'synth'} onClick={() => setSettings((s) => ({ ...s, source: s.source === 'synth' ? 'auto' : 'synth' }))}>
            {settings.source === 'synth' ? 'SOURCE: SYNTH (pass 1)' : 'SOURCE: SAMPLE (generated)'}
          </button>
          <button type="button" className={`toggle ${ambient ? 'toggle-on' : ''}`} data-testid="sound-ambient" aria-pressed={ambient} onClick={() => fire('ambient')}>
            {ambient ? 'CITY BED: PLAYING (stop)' : 'CITY BED: PLAY'}
          </button>
          <a className="toggle" href="./" data-testid="sounds-back">
            BACK TO THE CONSOLE
          </a>
          <a className="toggle" href="./?gallery">
            FIGURE GALLERY
          </a>
          <span className="hint num" data-testid="sounds-last">
            {last ? `last: ${last} (${played[last] ?? 0})${lastSource ? ` ${lastSource}` : ''}` : 'tap a sound'}
          </span>
        </div>
        <section className="panel sounds-group" aria-label="music">
          <div className="panel-title">MUSIC</div>
          <div className="sounds-grid">
            {MUSIC_STATES.map((st) => {
              const entry = bank.index?.music[st];
              const on = musicState === st;
              return (
                <div className="sound" key={st}>
                  <button type="button" className={`toggle ${on ? 'toggle-on' : ''}`} data-testid={`music-${st}`} aria-pressed={on} onClick={() => playMusic(st)}>
                    {st.toUpperCase()}
                    <span className="num sound-count">{on ? ' PLAYING' : ''}</span>
                  </button>
                  <div className="sound-cue">{MUSIC_CUES[st]}</div>
                  <div className="sound-how hint">{entry ? `${entry.take.seconds.toFixed(0)} s${entry.loop ? ', crossfade loop' : ', once'}; peak ${entry.take.peakDb.toFixed(1)} dB, rms ${entry.take.rmsDb.toFixed(1)} dB, played at ${entry.take.gainDb >= 0 ? '+' : ''}${entry.take.gainDb.toFixed(1)} dB` : 'no file on this build'}</div>
                </div>
              );
            })}
          </div>
        </section>
        {groups
          .filter((g) => g !== 'ambient')
          .map((g) => (
            <section className="panel sounds-group" key={g} aria-label={g}>
              <div className="panel-title">{g.toUpperCase()}</div>
              <div className="sounds-grid">
                {SOUNDS.filter((s) => s.group === g).map((s) => {
                  const entry = bank.index?.sfx[s.name];
                  const sample = useSample(s.name);
                  return (
                    <div className="sound" key={s.name}>
                      <button type="button" className="toggle" data-testid={`sound-${s.name}`} onClick={() => fire(s.name, s.name === 'raid-over' ? ((played[s.name] ?? 0) % 2 === 0 ? 1 : -1) : (played[s.name] ?? 0) % 7)}>
                        {s.name.toUpperCase()}
                        <span className="num sound-count">{played[s.name] ? ` ×${played[s.name]}` : ''}</span>
                      </button>
                      <div className="sound-cue">{s.cue}</div>
                      <div className="sound-how hint" data-testid={`sound-how-${s.name}`}>
                        {sample && entry
                          ? `generated: ${entry.takes.length} take${entry.takes.length > 1 ? 's' : ''}, ${entry.takes.map((t) => `${(t.end - t.offset).toFixed(2)} s`).join(' / ')}; crest ${Math.min(...entry.takes.map((t) => t.crestDb)).toFixed(0)} dB and up; peak set to ${entry.level} dB`
                          : `synth: ${s.mechanism}; about ${s.seconds} s`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        <div className="title-foot">
          Generated takes live in public/audio (made by tools/audio/generate.ts from tools/audio/manifest.ts, measured into index.json); each is a Web Audio buffer trimmed and normalized by src/client/audio/bank.ts, with the synth of src/client/audio/synth.ts behind it. Music crossfades between states in src/client/audio/music.ts. Volume, music level, mute and the source switch are saved in this browser (PLAN.md Q19). Sounds a hidden shooter would make are never played (VIEW-2).
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SoundsPage />
  </StrictMode>,
);
