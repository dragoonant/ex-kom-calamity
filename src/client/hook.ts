// window.__ib: the deterministic test hook (KB recipe section 11). `advance(seconds)` steps the presenter (and the
// hostile AI) without the render loop, which a hidden or headless pane throttles.
import { update, skipAll } from './presenter';
import { useGame } from './store';
import { screenOf, tileToWorld } from './board/world';
import { audio } from './audio';
import { chooseAction } from '../ai';
import { view } from '../engine/step';

declare global { interface Window { __ib: unknown; __ibManual?: boolean } }

export function installHook(): void {
  window.__ib = {
    state: () => { const g = useGame.getState(); return { screen: g.screen, live: g.live, shown: g.shown, campaign: g.campaign, selected: g.selected, target: g.target, presenting: g.presenting, queue: g.queue.length }; },
    advance: (seconds: number) => { window.__ibManual = true; for (let t = 0; t < seconds; t += 1 / 30) update(1 / 30); window.__ibManual = false; },
    skip: () => skipAll(),
    tapTile: (x: number, y: number) => useGame.getState().tapTile(x, y),
    dispatch: (a: never) => useGame.getState().dispatch(a),
    screenPointOfTile: (x: number, y: number) => { const s = useGame.getState().shown; const h = s?.tiles[y * s.w + x]?.h ?? 0; return screenOf(tileToWorld(x, y, h)); },
    audioEvents: () => audio.events,
    suggest: () => { const g = useGame.getState(); return g.live ? chooseAction(view(g.live, 'player'), 'normal') : null; },
    /** Let the AI play the player's side for up to n orders, presenting each (tests and screenshots). */
    autoplay: (n: number, present = 0) => {
      window.__ibManual = true;
      for (let i = 0; i < n; i++) {
        const g = useGame.getState();
        if (!g.live || g.live.result) break;
        if (g.live.phase === 'player' && !g.queue.length && !g.presenting) g.dispatch(chooseAction(view(g.live, 'player'), 'normal'));
        else if (g.live.phase === 'hostile') update(0.4);
        if (present > 0) for (let t = 0; t < present; t += 1 / 30) update(1 / 30); else skipAll();
      }
      window.__ibManual = false;
    },
  };
}
