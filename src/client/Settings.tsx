import { useState } from 'react';
import { audio } from './audio';
import { useGame } from './store';

export function Settings({ onClose, inBattle }: { onClose: () => void; inBattle?: boolean }) {
  const [a, setA] = useState(() => audio.settings());
  const closeups = useGame((g) => g.settings.closeups);
  const set = (p: Partial<typeof a>) => { audio.setSettings(p); setA(audio.settings()); };
  const slider = (k: 'master' | 'music' | 'sfx' | 'voice', label: string) => (
    <label className="slider"><span>{label}</span><input type="range" min={0} max={1} step={0.05} value={a[k]} onChange={(e) => set({ [k]: Number(e.target.value) })} /><b>{Math.round(a[k] * 100)}</b></label>
  );
  return (
    <div className="card settings" data-testid="settings">
      <div className="ap-title">SETTINGS</div>
      {slider('master', 'Master')}
      {slider('music', 'Music')}
      {slider('sfx', 'Sound')}
      {slider('voice', 'Voices')}
      <label className="check"><input type="checkbox" checked={a.muted} onChange={(e) => set({ muted: e.target.checked })} /> Mute everything</label>
      <label className="check"><input type="checkbox" checked={closeups} onChange={(e) => useGame.getState().setSettings({ closeups: e.target.checked })} /> Camera close-ups on attacks</label>
      <p className="hint">Mouse: wheel zooms, right-drag turns, middle-drag pans (left-drag pans until you press the middle button), left picks. Touch: one finger pans, two twist and pinch. WASD pans.</p>
      <div className="brief-buttons">
        {inBattle && <button className="ghost" onClick={() => { useGame.getState().save(); useGame.getState().setScreen('title'); }}>Save and quit to title</button>}
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
