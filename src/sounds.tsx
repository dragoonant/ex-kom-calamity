// sounds.html: every synthesized sound of pass 1 playable from a console panel, so the owner judges each by ear
// (KB rule 9; recipe step 8). Not verified by ear until the owner listens. The same synth.ts the game plays.
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './base.css';
import './styles.css';
import { SOUNDS, play, type SoundName } from './client/audio/synth';
import { browserStorage } from './client/save';
import { readAudioSettings, writeAudioSettings } from './client/audio/settings';

function SoundsPage() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const ambientRef = useRef<{ stop: (at: number) => void } | null>(null);
  const storage = useMemo(() => browserStorage(), []);
  const [settings, setSettings] = useState(() => readAudioSettings(storage));
  const [ambient, setAmbient] = useState(false);
  const [last, setLast] = useState<string>('');
  const [played, setPlayed] = useState<Record<string, number>>({});

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
    return c;
  };

  useEffect(() => {
    writeAudioSettings(storage, settings);
    if (masterRef.current) masterRef.current.gain.value = settings.muted ? 0.0001 : Math.max(0.0001, settings.volume);
  }, [settings, storage]);

  const fire = async (name: SoundName, variant = 0) => {
    const c = ctx();
    setPlayed((p) => ({ ...p, [name]: (p[name] ?? 0) + 1 }));
    setLast(name);
    if (!c || !masterRef.current) return;
    if (c.state !== 'running') await c.resume().catch(() => undefined);
    if (name === 'ambient') {
      if (ambientRef.current) {
        ambientRef.current.stop(c.currentTime);
        ambientRef.current = null;
        setAmbient(false);
      } else {
        ambientRef.current = play(c, masterRef.current, 'ambient', c.currentTime);
        setAmbient(true);
      }
      return;
    }
    play(c, masterRef.current, name, c.currentTime, variant);
  };

  const groups = [...new Set(SOUNDS.map((s) => s.group))];
  return (
    <div className="sounds" data-testid="sounds">
      <div className="console console-title sounds-console">
        <div className="console-bead" />
        <div className="title-block">
          <h1 className="title-name sounds-title">SOUND DESK</h1>
          <div className="title-sub">pass 1 · {SOUNDS.length} synthesized sounds, no samples · judged by ear</div>
        </div>
        <div className="switch-row sounds-controls">
          <button type="button" className={`toggle ${settings.muted ? 'toggle-alert' : ''}`} data-testid="sounds-mute" aria-pressed={settings.muted} onClick={() => setSettings((s) => ({ ...s, muted: !s.muted }))}>
            {settings.muted ? 'MUTED' : 'MUTE'}
          </button>
          <label className="volume">
            VOLUME <span className="num">{Math.round(settings.volume * 100)}</span>
            <input type="range" min={0} max={100} value={Math.round(settings.volume * 100)} data-testid="sounds-volume" onChange={(e) => setSettings((s) => ({ ...s, volume: Number(e.target.value) / 100 }))} />
          </label>
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
            {last ? `last: ${last} (${played[last] ?? 0})` : 'tap a sound'}
          </span>
        </div>
        {groups
          .filter((g) => g !== 'ambient')
          .map((g) => (
            <section className="panel sounds-group" key={g} aria-label={g}>
              <div className="panel-title">{g.toUpperCase()}</div>
              <div className="sounds-grid">
                {SOUNDS.filter((s) => s.group === g).map((s) => (
                  <div className="sound" key={s.name}>
                    <button type="button" className="toggle" data-testid={`sound-${s.name}`} onClick={() => fire(s.name, (played[s.name] ?? 0) % 7)}>
                      {s.name.toUpperCase()}
                      <span className="num sound-count">{played[s.name] ? ` ×${played[s.name]}` : ''}</span>
                    </button>
                    <div className="sound-cue">{s.cue}</div>
                    <div className="sound-how hint">
                      {s.mechanism}; about {s.seconds} s
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        <div className="title-foot">
          Each sound is a Web Audio graph in src/client/audio/synth.ts, wired to engine events by src/client/audio/director.ts. Volume and mute are saved in this browser (PLAN.md Q19). Sounds a hidden shooter would make are never played (VIEW-2).
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
