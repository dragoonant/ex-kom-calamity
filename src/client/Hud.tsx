import { useState } from 'react';
import { MISSIONS, pack, pilot as pilotDef } from '../engine/data';
import { dist } from '../engine/grid';
import { canTarget, damageRange, living, maxHp, preview, stats, unitById, weapons } from '../engine/query';
import type { BattleState, PartSlot, Unit } from '../engine/types';
import { audio } from './audio';
import { skipAll } from './presenter';
import { allActed, useGame } from './store';
import { Settings } from './Settings';

const PARTS: [PartSlot, string][] = [['body', 'BODY'], ['armL', 'L.ARM'], ['armR', 'R.ARM'], ['legs', 'LEGS']];
const PORTRAITS = new Set(['marlow', 'okonjo', 'varga', 'haldane', 'hallen', 'aske']);

export function Portrait({ id, small }: { id: string; small?: boolean }) {
  if (PORTRAITS.has(id)) return <img className={`portrait${small ? ' small' : ''}`} src={`art/portraits/${id}.jpg`} alt="" draggable={false} />;
  return <div className={`portrait blank${small ? ' small' : ''}`}><span>DIR</span></div>;
}

export function PartBars({ u }: { u: Unit }) {
  return (
    <div className="partbars">
      {PARTS.map(([p, label]) => {
        const max = maxHp(u, p), hp = u.hp[p];
        const r = hp / max;
        return (
          <div key={p} className={`pb ${hp <= 0 ? 'lost' : r < 0.34 ? 'low' : r < 0.67 ? 'mid' : ''}`}>
            <span className="pl">{label}</span>
            <span className="track"><span className="fill" style={{ width: `${Math.max(0, r) * 100}%` }} /></span>
            <span className="pv">{hp <= 0 ? 'LOST' : `${hp}/${max}`}</span>
          </div>
        );
      })}
    </div>
  );
}

function UnitCard({ s, u, compact }: { s: BattleState; u: Unit; compact?: boolean }) {
  const st = stats(s, u);
  const p = pilotDef(u.pilot);
  return (
    <div className={`card unit-card ${u.side}${compact ? ' compact' : ''}`} data-testid={`card-${u.id}`}>
      <div className="uc-head">
        <Portrait id={u.pilot} small={compact} />
        <div>
          <div className="call">{p.call}</div>
          <div className="pname">{p.name}</div>
          <div className="stats"><b>MOVE</b> {st.move} <b>EVADE</b> {st.evade} <b>WT</b> {st.weight}/{st.power}{st.overweight ? ' OVER' : ''}</div>
          {u.side === 'player' && <div className="state">{!u.alive ? 'EJECTED' : u.acted ? 'DONE' : u.moved ? 'MOVED' : 'READY'}</div>}
        </div>
      </div>
      <PartBars u={u} />
      {!compact && (
        <div className="weps">
          {weapons(u).map((w) => (
            <div key={w.slot} className={`wep${w.usable ? '' : ' off'}`}>
              <span className="ws">{w.slot === 'P' ? 'PACK' : w.slot === 'L' ? 'L.HAND' : 'R.HAND'}</span>
              <span className="wn">{w.def.name}</span>
              {w.def.class !== 'shield' ? <span className="wd">{w.def.min}-{w.def.max} · {w.def.shots}×{damageRange(w.def, null)[0]}-{damageRange(w.def, null)[1]}{w.ammo !== null ? ` · ${w.ammo} left` : ''}</span> : <span className="wd">guards body and left arm {w.def.guard}%</span>}
            </div>
          ))}
          {pack(u.build.pack).kind === 'repair' && <div className="wep"><span className="ws">PACK</span><span className="wn">{pack(u.build.pack).name}</span><span className="wd">+{pack(u.build.pack).heal} · {u.charges} left</span></div>}
          {pack(u.build.pack).kind === 'sensor' && <div className="wep"><span className="ws">PACK</span><span className="wn">{pack(u.build.pack).name}</span><span className="wd">spots for mortars to {pack(u.build.pack).sensorRange}</span></div>}
        </div>
      )}
    </div>
  );
}

function AttackPanel({ s, a, t }: { s: BattleState; a: Unit; t: Unit }) {
  const fire = useGame((g) => g.fire);
  const cancel = () => useGame.getState().setTarget(null);
  const rows = weapons(a).filter((w) => canTarget(s, a, w.slot, t));
  return (
    <div className="card attack-panel" data-testid="attack-panel">
      <div className="ap-title">FIRE ON {t.id === 'hallen' ? 'HALLEN' : pilotDef(t.pilot).call} <span className="dist">{dist(a, t)} tiles</span></div>
      <UnitCard s={s} u={t} compact />
      {rows.map((w) => {
        const p = preview(s, a, w.slot, t)!;
        return (
          <button key={w.slot} className="fire-row" data-testid={`fire-${w.slot}`} onClick={() => { audio.play('confirm'); fire(w.slot); }}>
            <span className="fr-w">{w.def.name}</span>
            <span className="fr-c">{p.chance}%</span>
            <span className="fr-d">{p.shots}× {p.dmg[0]}-{p.dmg[1]}</span>
            <span className="fr-n">{p.cover ? 'target in cover −20 · ' : ''}{p.spotted ? 'spotted +20 · ' : ''}{w.def.class === 'indirect' ? 'no counter' : p.counter ? `counter ${p.counter.chance}% ${p.counter.shots}× ${p.counter.dmg[0]}-${p.counter.dmg[1]}` : 'no counter'}</span>
          </button>
        );
      })}
      <button className="ghost" onClick={cancel}>Cancel</button>
    </div>
  );
}

function ObjectPanel({ s, a, x, y }: { s: BattleState; a: Unit; x: number; y: number }) {
  const t = s.tiles[y * s.w + x]!;
  const rows = weapons(a).filter((w) => w.usable && (w.def.class === 'direct' || w.def.class === 'melee') && dist(a, { x, y }) >= w.def.min && dist(a, { x, y }) <= w.def.max);
  return (
    <div className="card attack-panel">
      <div className="ap-title">FIRE ON THE {t.obj?.toUpperCase()} <span className="dist">{t.objHp} HP</span></div>
      <p className="hint">Every shot hits a standing object. At 0 HP it falls to rubble and stops giving cover.</p>
      {rows.map((w) => (
        <button key={w.slot} className="fire-row" onClick={() => { audio.play('confirm'); useGame.getState().fireObject(w.slot); }}>
          <span className="fr-w">{w.def.name}</span><span className="fr-c">100%</span><span className="fr-d">{w.def.shots * w.def.dmg} dmg</span><span className="fr-n">{w.def.shots * w.def.dmg >= t.objHp ? 'breaks it' : `${t.objHp - w.def.shots * w.def.dmg} HP left`}</span>
        </button>
      ))}
      <button className="ghost" onClick={() => useGame.setState({ targetObj: null })}>Cancel</button>
    </div>
  );
}

function RepairPanel({ s, a, close }: { s: BattleState; a: Unit; close: () => void }) {
  const pk = pack(a.build.pack);
  const rows: { t: Unit; p: PartSlot; amt: number }[] = [];
  for (const t of living(s, 'player')) if (dist(a, t) <= 1) for (const [p] of PARTS) if (t.hp[p] > 0 && t.hp[p] < maxHp(t, p)) rows.push({ t, p, amt: Math.min(pk.heal ?? 0, maxHp(t, p) - t.hp[p]) });
  return (
    <div className="card attack-panel">
      <div className="ap-title">REPAIR <span className="dist">{a.charges} charges</span></div>
      {rows.length === 0 && <p className="hint">No damaged part within reach. Lost parts wait for the hangar.</p>}
      {rows.map((r) => (
        <button key={r.t.id + r.p} className="fire-row" onClick={() => { useGame.getState().dispatch({ type: 'repair', unit: a.id, target: r.t.id, part: r.p }); close(); }}>
          <span className="fr-w">{pilotDef(r.t.pilot).call}</span><span className="fr-c">{PARTS.find((x) => x[0] === r.p)![1]}</span><span className="fr-d">+{r.amt}</span><span className="fr-n">{r.t.hp[r.p]}/{maxHp(r.t, r.p)}</span>
        </button>
      ))}
      <button className="ghost" onClick={close}>Cancel</button>
    </div>
  );
}

export function Hud() {
  const s = useGame((g) => g.shown);
  const liveState = useGame((g) => g.live);
  const selected = useGame((g) => g.selected);
  const hover = useGame((g) => g.hover);
  const target = useGame((g) => g.target);
  const targetObj = useGame((g) => g.targetObj);
  const banner = useGame((g) => g.banner);
  const clock = useGame((g) => g.clock);
  const feed = useGame((g) => g.feed);
  const presenting = useGame((g) => g.presenting || g.queue.length > 0);
  const saveError = useGame((g) => g.saveError);
  const [menu, setMenu] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  if (!s || !liveState) return null;
  const m = MISSIONS[s.mission]!;
  const sel = selected ? unitById(s, selected) : null;
  const hov = hover ? s.units.find((u) => u.alive && u.x === hover.x && u.y === hover.y) ?? null : null;
  const tgt = target ? unitById(s, target) : null;
  const myPhase = s.phase === 'player' && liveState.phase === 'player' && !liveState.result;
  const canAct = myPhase && !presenting && sel && sel.side === 'player' && sel.alive && !sel.acted;
  const canRepair = canAct && sel && pack(sel.build.pack).kind === 'repair' && sel.charges > 0;
  const ours = living(s, 'player').length, theirs = living(s, 'hostile').length;
  const done = liveState.result && !presenting;
  const nextReady = () => living(liveState, 'player').find((u) => !u.acted && u.id !== selected) ?? living(liveState, 'player').find((u) => !u.acted);
  const endPhase = () => {
    if (!allActed(liveState) && !confirmEnd) { setConfirmEnd(true); return; }
    setConfirmEnd(false);
    audio.play('confirm');
    useGame.setState({ selected: null, target: null, targetObj: null });
    useGame.getState().dispatch({ type: 'endPhase' });
  };

  return (
    <div className="hud" data-testid="hud">
      <div className="strip">
        <span className="op">MARROW YARD</span>
        <span>ROUND <b data-testid="round">{s.round}</b> / {m.roundLimit}</span>
        <span className={`phase ${s.phase}`} data-testid="phase">{s.phase === 'player' ? 'YOUR PHASE' : 'DIRECTORATE PHASE'}</span>
        <span className="count"><i className="dot p" />{ours} <i className="dot h" />{theirs}</span>
        <span className="bonus">{s.round <= m.bonusRound ? `speed bonus by round ${m.bonusRound}` : 'speed bonus missed'}</span>
      </div>
      <button className="menu-btn" aria-label="Menu" onClick={() => setMenu(!menu)}>≡</button>
      {menu && <Settings onClose={() => setMenu(false)} inBattle />}
      {saveError && <div className="save-warn">{saveError}</div>}

      <div className="feed">{feed.slice(-6).map((f, i) => <div key={i} className={`fl ${f.side}`}>{f.text}</div>)}</div>

      {banner && clock < banner.until && <div className={`banner ${s.phase}`}><div className="bt">{banner.text}</div><div className="bs">{banner.sub}</div></div>}

      <div className="left-col">
        {sel && <UnitCard s={s} u={sel} />}
        {hov && hov.id !== selected && hov.id !== target && <UnitCard s={s} u={hov} compact />}
      </div>

      <div className="right-col">
        {canAct && tgt && sel && <AttackPanel s={s} a={sel} t={tgt} />}
        {canAct && targetObj && sel && <ObjectPanel s={s} a={sel} x={targetObj.x} y={targetObj.y} />}
        {canAct && repairing && sel && !tgt && <RepairPanel s={s} a={sel} close={() => setRepairing(false)} />}
      </div>

      <div className="orders">
        {myPhase && !presenting && (
          <>
            {canAct && sel && (
              <>
                <span className="hint">{!sel.moved ? 'Blue squares: move. Red: in range. Tap an enemy to see the odds.' : 'Fire, repair or wait.'}</span>
                {sel.moved && sel.from && <button data-testid="undo" onClick={() => { audio.play('cancel'); useGame.getState().dispatch({ type: 'undoMove', unit: sel.id }); }}>Undo move</button>}
                {canRepair && <button onClick={() => { useGame.setState({ target: null }); setRepairing(true); }}>Repair</button>}
                <button data-testid="wait" onClick={() => { audio.play('confirm'); useGame.getState().dispatch({ type: 'wait', unit: sel.id }); const n = nextReady(); useGame.getState().select(n && n.id !== sel.id ? n.id : null); }}>Wait</button>
              </>
            )}
            {!canAct && <span className="hint">{ours ? 'Select a Lantern walker.' : ''}</span>}
            <button className="next" onClick={() => { const n = nextReady(); if (n) useGame.getState().select(n.id); }}>Next ready</button>
            <button data-testid="end-phase" className={`end${allActed(liveState) ? ' pulse' : ''}${confirmEnd ? ' confirm' : ''}`} onClick={endPhase}>{confirmEnd ? 'Walkers still ready. End anyway?' : 'End phase'}</button>
          </>
        )}
        {presenting && <button className="skip" data-testid="skip" onClick={() => skipAll()}>Skip ▸▸</button>}
        {!myPhase && !presenting && !liveState.result && <span className="hint">The Directorate is moving.</span>}
      </div>

      {done && liveState.result && (
        <div className="result" data-testid="result">
          <div className="rt">{liveState.result.winner === 'player' ? 'CONTRACT FULFILLED' : 'WITHDRAWN'}</div>
          <div className="rs">{liveState.result.winner === 'player' ? `Marrow Yard is clear in ${liveState.result.rounds} rounds.` : liveState.result.reason === 'timeout' ? 'The supply train could not wait any longer.' : 'Every Lantern walker is down.'}</div>
          <button data-testid="to-debrief" onClick={() => { audio.play('confirm'); useGame.getState().finishBattle(); }}>Debrief</button>
        </div>
      )}
    </div>
  );
}

