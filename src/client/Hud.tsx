// The console strip (docs/presentation-concept.md section 3): agent lamps, stance switches, the PAUSE paddle,
// a time dial, level toggles, the message-slip tray and a personnel card for the hovered tile. Every number
// is an engine field or a query.* result (KB rule 8). No title attributes anywhere (rule 8).
import { useEffect, useMemo, useState } from 'react';
import { WEAPONS } from '../data';
import { query, STANCES, tileAt, type Stance, type Unit } from '../engine';
import { unitLabel, useClient, type Speed } from './store';

const LEVEL_NAMES = ['GROUND', 'FLOOR 1', 'ROOF'];

function fmtSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}

function weaponName(u: Unit): string {
  return u.weapon ? (WEAPONS[u.weapon]?.name ?? u.weapon) : 'unarmed';
}

function lampClass(u: Unit): string {
  if (u.down) return 'lamp lamp-off';
  if (u.hp * 2 <= u.maxHp) return 'lamp lamp-alert';
  if (u.hp < u.maxHp) return 'lamp lamp-caution';
  return 'lamp lamp-ok';
}

export function Hud() {
  const agency = useClient((s) => s.agency);
  const paused = useClient((s) => s.paused);
  const speed = useClient((s) => s.speed);
  const selected = useClient((s) => s.selected);
  const level = useClient((s) => s.level);
  const hover = useClient((s) => s.hover);
  const slips = useClient((s) => s.slips);
  const saveStatus = useClient((s) => s.saveStatus);
  const { togglePause, setSpeed, select, setLevel, order, leaveBattle } = useClient.getState();
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      const s = useClient.getState();
      if (e.code === 'Space') {
        e.preventDefault();
        s.togglePause();
      } else if (/^Digit[1-9]$/.test(e.code)) {
        const n = Number(e.code.slice(5)) - 1;
        const agents = s.agency?.units.filter((u) => u.side === 'agency') ?? [];
        const u = agents[n];
        if (u && !u.down) s.select(u.id);
      } else if (e.code === 'Escape') {
        s.select(null);
        setConfirmWithdraw(false);
      } else if (e.code === 'PageUp' || e.code === 'BracketRight') {
        s.setLevel(s.level + 1);
      } else if (e.code === 'PageDown' || e.code === 'BracketLeft') {
        s.setLevel(s.level - 1);
      } else if (e.code === 'KeyH' && s.selected) {
        s.order({ type: 'halt', side: 'agency', unit: s.selected });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const agents = useMemo(() => agency?.units.filter((u) => u.side === 'agency') ?? [], [agency]);
  const sel = selected ? agents.find((u) => u.id === selected) : undefined;
  const outcome = agency ? query.outcome(agency) : null;

  const hoverInfo = useMemo(() => {
    if (!agency || !hover) return null;
    const tile = tileAt(agency, hover);
    const unit = agency.units.find((u) => !u.down && u.x === hover.x && u.y === hover.y && u.level === hover.level);
    const body = !unit ? agency.units.find((u) => u.down && u.x === hover.x && u.y === hover.y && u.level === hover.level) : undefined;
    const path = sel && !unit ? query.path(agency, sel.id, hover) : null;
    const hit = sel && unit && unit.side !== 'agency' ? query.hitChance(agency, sel.id, unit.id) : null;
    const dmg = sel && unit && unit.side !== 'agency' ? query.damageRange(agency, sel.id, unit.id) : null;
    return { tile, unit: unit ?? body, path, hit, dmg };
  }, [agency, hover, sel]);

  if (!agency || !outcome) return null;

  return (
    <div className="console" data-testid="console">
      <div className="console-bead" />
      <div className="console-row">
        <section className="panel panel-time" aria-label="Time">
          <div className="dial" data-testid="time-dial">
            <span className="dial-label">SIM TIME</span>
            <span className="dial-value num" data-testid="sim-seconds">{fmtSeconds(outcome.seconds)}</span>
          </div>
          <button type="button" className={`paddle ${paused ? 'paddle-down' : ''}`} data-testid="pause" aria-pressed={paused} onClick={togglePause}>
            {paused ? 'PAUSED' : 'PAUSE'}
          </button>
          <div className="switch-row" role="group" aria-label="Speed">
            {([1, 2, 4] as Speed[]).map((sp) => (
              <button type="button" key={sp} className={`toggle ${speed === sp ? 'toggle-on' : ''}`} data-testid={`speed-${sp}`} aria-pressed={speed === sp} onClick={() => setSpeed(sp)}>
                {sp}x
              </button>
            ))}
          </div>
          <div className="switch-row" role="group" aria-label="Level">
            {Array.from({ length: agency.levels }, (_, i) => agency.levels - 1 - i).map((l) => (
              <button type="button" key={l} className={`toggle ${level === l ? 'toggle-on' : ''}`} data-testid={`level-${l}`} aria-pressed={level === l} onClick={() => setLevel(l)}>
                {LEVEL_NAMES[l] ?? `LEVEL ${l}`}
              </button>
            ))}
          </div>
        </section>

        <section className="panel panel-squad" aria-label="Squad">
          <div className="panel-title">SQUAD</div>
          <div className="lamps">
            {agents.map((u, i) => (
              <button
                type="button"
                key={u.id}
                className={`agent ${u.id === selected ? 'agent-selected' : ''} ${u.down ? 'agent-down' : ''}`}
                data-testid={`agent-${u.id}`}
                aria-pressed={u.id === selected}
                disabled={u.down}
                onClick={() => select(u.id)}
              >
                <span className={lampClass(u)} />
                <span className="agent-key num">{i + 1}</span>
                <span className="agent-name">{u.name}</span>
                <span className="agent-weapon">{weaponName(u)}</span>
                <span className="agent-hp num">{u.down ? 'DOWN' : `${u.hp}/${u.maxHp}`}</span>
                <span className="agent-order">{u.down ? '' : u.fireTarget ? 'FIRING' : u.order ? 'MOVING' : u.stance.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel panel-orders" aria-label="Orders">
          <div className="panel-title">{sel ? `ORDERS: ${sel.name.toUpperCase()}` : 'ORDERS'}</div>
          {sel ? (
            <>
              <div className="switch-row" role="group" aria-label="Stance">
                {STANCES.map((st: Stance) => (
                  <button
                    type="button"
                    key={st}
                    className={`toggle ${sel.stance === st ? 'toggle-on' : ''}`}
                    data-testid={`stance-${st}`}
                    aria-pressed={sel.stance === st}
                    onClick={() => sel.stance !== st && order({ type: 'stance', side: 'agency', unit: sel.id, stance: st })}
                  >
                    {st.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="switch-row">
                <button type="button" className="toggle" data-testid="halt" onClick={() => order({ type: 'halt', side: 'agency', unit: sel.id })}>
                  HALT
                </button>
                <span className="hint">Tap a tile to move, an enemy to fire. {LEVEL_NAMES[sel.level] ?? `level ${sel.level}`}, tile {sel.x},{sel.y}.</span>
              </div>
              <div className="order-line num">
                {sel.order ? `Moving to ${sel.order.to.x},${sel.order.to.y} L${sel.order.to.level}` : 'Holding position'}
                {sel.fireTarget ? ` | target ${sel.fireTarget}` : ''}
              </div>
            </>
          ) : (
            <div className="hint">Select an agent: tap one on the board or press 1 to 6.</div>
          )}
          <div className="switch-row">
            {confirmWithdraw ? (
              <>
                <button type="button" className="toggle toggle-alert" data-testid="withdraw-confirm" onClick={() => { order({ type: 'withdraw', side: 'agency' }); setConfirmWithdraw(false); }}>
                  CONFIRM WITHDRAWAL
                </button>
                <button type="button" className="toggle" onClick={() => setConfirmWithdraw(false)}>
                  KEEP FIGHTING
                </button>
              </>
            ) : (
              <button type="button" className="toggle" data-testid="withdraw" onClick={() => setConfirmWithdraw(true)}>
                WITHDRAW SQUAD
              </button>
            )}
            <button type="button" className="toggle" data-testid="leave" onClick={leaveBattle}>
              LEAVE CONSOLE
            </button>
          </div>
        </section>

        <section className="panel panel-card" aria-label="Personnel card" data-testid="hover-card">
          <div className="panel-title">FILE CARD</div>
          {hoverInfo ? (
            <div className="card">
              <div className="num">
                Tile {hover!.x},{hover!.y} {LEVEL_NAMES[hover!.level] ?? `L${hover!.level}`}: {hoverInfo.tile?.kind ?? 'off map'}
                {hoverInfo.tile?.kind === 'door' ? (hoverInfo.tile.open ? ' (open)' : ' (closed)') : ''}
              </div>
              {hoverInfo.unit && (
                <div className="card-unit">
                  <strong>{unitLabel(hoverInfo.unit)}</strong> {hoverInfo.unit.side === 'agency' ? 'agency' : hoverInfo.unit.side === 'hostile' ? 'HOSTILE' : 'citizen'}
                  {hoverInfo.unit.down ? ' (down)' : ''} <span className="num">hp {hoverInfo.unit.hp}/{hoverInfo.unit.maxHp}, armour {hoverInfo.unit.armour}</span>
                  {hoverInfo.unit.side === 'civilian' && !hoverInfo.unit.down && sel && <div className="warn">Firing here counts as a civilian hit.</div>}
                </div>
              )}
              {hoverInfo.hit && (
                <div className="num" data-testid="hit-chance">
                  {hoverInfo.hit.ok
                    ? `${sel!.name}: ${hoverInfo.hit.chance}% to hit (${hoverInfo.hit.accuracy} + ${hoverInfo.hit.aim} aim - ${hoverInfo.hit.falloff} range${hoverInfo.hit.movingPenalty ? ` - ${hoverInfo.hit.movingPenalty} moving` : ''})${hoverInfo.dmg ? `, ${hoverInfo.dmg.min}-${hoverInfo.dmg.max} damage` : ''}`
                    : `${sel!.name} cannot fire: ${hoverInfo.hit.reason}`}
                </div>
              )}
              {hoverInfo.path && <div className="num">Path: {hoverInfo.path.ticks} ticks ({(hoverInfo.path.ticks / agency.tuning.time.ticksPerSecond).toFixed(1)} s)</div>}
              {sel && !hoverInfo.unit && !hoverInfo.path && hoverInfo.tile && <div className="hint">No path there.</div>}
            </div>
          ) : (
            <div className="hint">Hover a tile for its card.</div>
          )}
          <div className="counters num" data-testid="counters">
            <span>SHOTS {outcome.score.shotsFired}</span>
            <span>HITS {outcome.score.hits}</span>
            <span>CIVILIAN HITS {outcome.score.civilianHits}</span>
            <span>HOSTILES DOWN {outcome.score.hostilesDown}</span>
            <span>AGENTS DOWN {outcome.score.agentsDown}</span>
            <span>HOSTILES SEEN {agency.units.filter((u) => u.side === 'hostile' && !u.down).length}</span>
          </div>
          <div className={`save-lamp ${saveStatus.ok ? '' : 'save-lamp-alert'}`} data-testid="save-lamp">
            <span className={`lamp ${saveStatus.ok ? 'lamp-ok' : 'lamp-alert'}`} />
            {saveStatus.ok ? (saveStatus.tick === null ? 'NOT SAVED YET' : `SAVED AT ${fmtSeconds(saveStatus.tick / agency.tuning.time.ticksPerSecond)}`) : `NOT SAVED: ${saveStatus.reason}`}
          </div>
        </section>

        <section className="panel panel-tray" aria-label="Message slips">
          <div className="panel-title">MESSAGE TRAY</div>
          <ol className="tray" data-testid="tray">
            {[...slips].reverse().map((s) => (
              <li key={s.id} className={`slip slip-${s.tone}`}>
                <span className="slip-time num">{fmtSeconds(s.seconds)}</span>
                <span className="slip-text">{s.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
