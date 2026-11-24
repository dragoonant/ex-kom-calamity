import { useEffect, useRef } from 'react';
import { audio } from './audio';
import { Board } from './board/Board';
import { installHook } from './hook';
import { Hud } from './Hud';
import { resetPresenter } from './presenter';
import { Briefing, Debrief, Hangar, NextContract, Title } from './Screens';
import { useGame } from './store';
import { preloadTextures, texturesReady } from './board/textures';
import { useState } from 'react';

installHook();

function Battle() {
  const seed = useGame((g) => g.seed);
  const live = useGame((g) => g.live);
  const [ready, setReady] = useState(texturesReady());
  const started = useRef<number | null>(null);
  if (started.current !== seed && live) { started.current = seed; resetPresenter(live); }
  useEffect(() => { if (!ready) void preloadTextures().then(() => setReady(true)); audio.music('battle', 1200); audio.loop('rain-loop', 1200); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready) return <div className="screen loading">Loading the yard…</div>;
  return (<div className="battle" data-testid="battle"><Board /><Hud /></div>);
}

export function App() {
  const screen = useGame((g) => g.screen);
  useEffect(() => {
    void audio.load();
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);
  return (
    <>
      {screen === 'title' && <Title />}
      {screen === 'briefing' && <Briefing />}
      {screen === 'battle' && <Battle />}
      {screen === 'debrief' && <Debrief />}
      {screen === 'hangar' && <Hangar />}
      {screen === 'next' && <NextContract />}
    </>
  );
}
