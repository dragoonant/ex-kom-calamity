// The console strip (docs/presentation-concept.md section 3): agent lamps, stance switches, the PAUSE paddle,
// a time dial, the message-slip tray and a file card for the hovered tile; a floor selector rides on the
// board for the cut-away (up to 7 levels, MAP-7). Every number is an engine field or a query.* result
// (KB rule 8). No title attributes anywhere (rule 8).
import { useEffect, useMemo, useState } from 'react';
import { MAPS, WEAPONS } from '../data';
import { query, STANCES, type Stance, type Unit } from '../engine';
import { unitLabel, useClient, type Speed } from './store';
import { director } from './App';
import { browserStorage } from './save';
import { readViewSettings, writeViewSettings } from './viewSettings';
import { setShadows, shake, view } from './board/world';

function levelName(level: number): string {
  return level === 0 ? 'GROUND' : `LEVEL ${level}`;
}

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

function agentStatus(u: Unit): string {
  if (u.down) return '';
  if (u.blast) return 'ARMING';
  if (u.fireTarget) return 'FIRING';
  if (u.order) return 'MOVING';
  return u.stance.toUpperCase();
}

export function Hud() {
  const agency = useClient((s) => s.agency);
  const paused = useClient((s) => s.paused);
  const speed = useClient((s) => s.speed);
  const selected = useClient((s) => s.selected);
  const level = useClient((s) => s.level);
  const hover = useClient((s) => s.hover);
  const mode = useClient((s) => s.mode);
  const run = useClient((s) => s.run);
  const slips = useClient((s) => s.slips);
  const saveStatus = useClient((s) => s.saveStatus);
  const { togglePause, setSpeed, select, setLevel, setMode, setRun, focusUnit, order, leaveBattle } = useClient.getState();
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [audio, setAudio] = useState(() => director.getSettings());
  // D21 f: the camera shake switch, kept per browser under ekc-view.
  const [shakeOn, setShakeOn] = useState(() => readViewSettings(browserStorage()).shake);
  useEffect(() => {
    shake.enabled = shakeOn;
    if (!shakeOn) shake.amp = 0;
  }, [shakeOn]);
  const [shadowsOn, setShadowsOn] = useState(() => readViewSettings(browserStorage()).shadows);
  useEffect(() => setShadows(shadowsOn), [shadowsOn]);
  const toggleShake = () => {
    const next = !shakeOn;
    writeViewSettings(browserStorage(), { shake: next, shadows: shadowsOn });
    setShakeOn(next);
  };
  const toggleShadows = () => {
    const next = !shadowsOn;
    writeViewSettings(browserStorage(), { shake: shakeOn, shadows: next });
    setShadowsOn(next);
  };
  const setMuted = (muted: boolean) => {
    director.setMuted(muted);
    setAudio(director.getSettings());
  };
  const setVolume = (volume: number) => {
    director.setVolume(volume);
    setAudio(director.getSettings());
  };

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
        // First press selects; pressing the same number again centres the camera on that agent.
        if (u && !u.down) {
          if (s.selected === u.id) s.focusUnit(u.id);
          else s.select(u.id);
        }
      } else if (e.code === 'Escape') {
        if (s.mode === 'blast') s.setMode('normal');
        else s.select(null);
        setConfirmWithdraw(false);
      } else if (e.code === 'PageUp' || e.code === 'BracketRight') {
        s.setLevel(s.level + 1);
      } else if (e.code === 'PageDown' || e.code === 'BracketLeft') {
        s.setLevel(s.level - 1);
      } else if (e.code === 'KeyH' && s.selected) {
        s.order({ type: 'halt', side: 'agency', unit: s.selected });
      } else if (e.code === 'KeyB' && s.selected) {
        s.setMode(s.mode === 'blast' ? 'normal' : 'blast');
      } else if (e.code === 'KeyF' && s.selected) {
        s.focusUnit(s.selected);
      } else if (e.code === 'KeyC' && s.selected) {
        // POSE-2: C crouches the selected agent, or stands it up.
        const u = s.agency?.units.find((x) => x.id === s.selected);
        if (u && !u.down) s.order({ type: 'posture', side: 'agency', unit: u.id, posture: u.posture === 'crouch' ? 'stand' : 'crouch' });
      } else if (e.code === 'KeyR') {
        s.setRun(!s.run);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const agents = useMemo(() => agency?.units.filter((u) => u.side === 'agency') ?? [], [agency]);
  const sel = selected ? agents.find((u) => u.id === selected) : undefined;
  const outcome = agency ? query.outcome(agency) : null;
  const buildings = agency ? (MAPS[agency.mapId]?.buildings ?? []) : [];

  const hoverInfo = useMemo(() => {
    if (!agency || !hover) return null;
    const tile = query.tileInfo(agency, hover);
    const unit = agency.units.find((u) => !u.down && u.x === hover.x && u.y === hover.y && u.level === hover.level);
    const body = !unit ? agency.units.find((u) => u.down && u.x === hover.x && u.y === hover.y && u.level === hover.level) : undefined;
    const blast = sel && mode === 'blast' ? query.blastPreview(agency, sel.id, hover) : null;
    const path = sel && !unit && mode === 'normal' ? query.path(agency, sel.id, hover) : null;
    const hit = sel && unit && unit.side !== 'agency' && mode === 'normal' ? query.hitChance(agency, sel.id, unit.id) : null;
    const dmg = hit ? query.damageRange(agency, sel!.id, unit!.id) : null;
    const building = buildings.find((b) => hover.x >= b.x && hover.x < b.x + b.w && hover.y >= b.y && hover.y < b.y + b.d && hover.level <= b.floors);
    return { tile, unit: unit ?? body, path, hit, dmg, blast, building };
  }, [agency, hover, sel, mode, buildings]);

  if (!agency || !outcome) return null;
  const tps = agency.tuning.time.ticksPerSecond;

  return (
    <>
      <div className="floors" role="group" aria-label="Floor shown" data-testid="floors">
        <div className="floors-title">FLOOR</div>
        {Array.from({ length: agency.levels }, (_, i) => agency.levels - 1 - i).map((l) => (
          <button type="button" key={l} className={`toggle floor ${level === l ? 'toggle-on' : ''}`} data-testid={`level-${l}`} aria-pressed={level === l} onClick={() => setLevel(l)}>
            {levelName(l)}
            <span className="floor-count num">{agents.filter((u) => !u.down && u.level === l).length || ''}</span>
            {agency.marks?.some((m) => m.level === l) && <span className="floor-mark" data-testid={`mark-on-${l}`} aria-label="A last hostile is marked here" />}
          </button>
        ))}
      </div>
      {mode === 'blast' && sel && (
        <div className="mode-banner" data-testid="mode-banner">
          CHARGE: tap a tile {sel.name} can see within {agency.tuning.blast.throwRange} tiles. Esc cancels.
        </div>
      )}
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
            <div className="switch-row sound-row" role="group" aria-label="Sound">
              <button type="button" className={`toggle ${audio.muted ? 'toggle-alert' : ''}`} data-testid="mute" aria-pressed={audio.muted} onClick={() => setMuted(!audio.muted)}>
                {audio.muted ? 'MUTED' : 'SOUND'}
              </button>
              <input className="volume-slider" type="range" min={0} max={100} value={Math.round(audio.volume * 100)} aria-label="Volume" data-testid="volume" onChange={(e) => setVolume(Number(e.target.value) / 100)} />
              <button type="button" className={`toggle ${shakeOn ? '' : 'toggle-alert'}`} data-testid="shake" aria-pressed={shakeOn} onClick={toggleShake}>
                {shakeOn ? 'SHAKE' : 'NO SHAKE'}
              </button>
              {/* On a software renderer (view.detail low) no shadow map is made, so the switch says so and stays off. */}
              <button type="button" className={`toggle ${shadowsOn && view.detail === 'full' ? '' : 'toggle-alert'}`} data-testid="shadows" aria-pressed={shadowsOn && view.detail === 'full'} disabled={view.detail !== 'full'} onClick={toggleShadows}>
                {shadowsOn && view.detail === 'full' ? 'SHADOWS' : 'NO SHADOWS'}
              </button>
            </div>
            <div className={`save-lamp ${saveStatus.ok ? '' : 'save-lamp-alert'}`} data-testid="save-lamp">
              <span className={`lamp ${saveStatus.ok ? 'lamp-ok' : 'lamp-alert'}`} />
              {saveStatus.ok ? (saveStatus.tick === null ? 'NOT SAVED YET' : `SAVED AT ${fmtSeconds(saveStatus.tick / tps)}`) : `NOT SAVED: ${saveStatus.reason}`}
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
                  onClick={() => {
                    select(u.id);
                    focusUnit(u.id);
                  }}
                >
                  <span className={lampClass(u)} />
                  <span className="agent-name">
                    <span className="agent-key num">{i + 1}</span> {u.name}
                  </span>
                  <span className="agent-hp num">{u.down ? 'DOWN' : `${u.hp}/${u.maxHp}`}</span>
                  <span className="agent-weapon">{weaponName(u)}</span>
                  <span className="agent-order">{agentStatus(u)}</span>
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
                  <button
                    type="button"
                    className={`toggle ${mode === 'blast' ? 'toggle-alert' : ''}`}
                    data-testid="charge"
                    aria-pressed={mode === 'blast'}
                    disabled={sel.charges <= 0}
                    onClick={() => setMode(mode === 'blast' ? 'normal' : 'blast')}
                  >
                    CHARGE <span className="num">{sel.charges}</span>
                  </button>
                </div>
                <div className="switch-row" role="group" aria-label="Posture and pace">
                  <button
                    type="button"
                    className={`toggle ${sel.posture === 'crouch' ? 'toggle-on' : ''}`}
                    data-testid="posture"
                    aria-pressed={sel.posture === 'crouch'}
                    onClick={() => order({ type: 'posture', side: 'agency', unit: sel.id, posture: sel.posture === 'crouch' ? 'stand' : 'crouch' })}
                  >
                    {sel.posture === 'crouch' ? 'CROUCHED' : 'CROUCH'}
                  </button>
                  <button type="button" className={`toggle ${run ? 'toggle-on' : ''}`} data-testid="run" aria-pressed={run} onClick={() => setRun(!run)}>
                    {run ? 'RUN ON' : 'RUN'}
                  </button>
                </div>
                <div className="order-line num" data-testid="order-line">
                  {sel.blast
                    ? `Arming a charge for ${sel.blast.at.x},${sel.blast.at.y}: ${sel.blast.progress}/${agency.tuning.blast.armTicks} ticks`
                    : sel.order
                      ? `Moving to ${sel.order.to.x},${sel.order.to.y} on ${levelName(sel.order.to.level).toLowerCase()}`
                      : `Holding at ${sel.x},${sel.y} on ${levelName(sel.level).toLowerCase()}`}
                  {sel.fireTarget ? `, target ${sel.fireTarget}` : ''}
                </div>
              </>
            ) : (
              <div className="hint">Select an agent: tap one on the board or press 1 to 6. Tap a tile to move, an enemy to fire.</div>
            )}
            <div className="switch-row">
              {confirmWithdraw ? (
                <>
                  <button
                    type="button"
                    className="toggle toggle-alert"
                    data-testid="withdraw-confirm"
                    onClick={() => {
                      order({ type: 'withdraw', side: 'agency' });
                      setConfirmWithdraw(false);
                    }}
                  >
                    CONFIRM WITHDRAWAL
                  </button>
                  <button type="button" className="toggle" onClick={() => setConfirmWithdraw(false)}>
                    KEEP FIGHTING
                  </button>
                </>
              ) : (
                <button type="button" className="toggle" data-testid="withdraw" onClick={() => setConfirmWithdraw(true)}>
                  WITHDRAW
                </button>
              )}
              <button type="button" className="toggle" data-testid="leave" onClick={leaveBattle}>
                LEAVE CONSOLE
              </button>
            </div>
          </section>

          <section className="panel panel-card" aria-label="File card" data-testid="hover-card">
            <div className="panel-title">FILE CARD</div>
            {hoverInfo && hoverInfo.tile ? (
              <div className="card">
                <div className="num" data-testid="tile-line">
                  {hoverInfo.building ? `${hoverInfo.building.name}, ` : ''}
                  {levelName(hover!.level).toLowerCase()}, tile {hover!.x},{hover!.y}: {hoverInfo.tile.kind}
                  {hoverInfo.tile.kind === 'door' ? (hoverInfo.tile.open ? ' (open)' : ' (closed)') : ''}
                  {hoverInfo.tile.breakable ? `, ${hoverInfo.tile.materialName.toLowerCase()} ${hoverInfo.tile.hp}/${hoverInfo.tile.maxHp}` : ''}
                </div>
                {hoverInfo.unit && (
                  <div className="card-unit">
                    <strong>{unitLabel(hoverInfo.unit)}</strong> {hoverInfo.unit.side === 'agency' ? 'agency' : hoverInfo.unit.side === 'hostile' ? 'HOSTILE' : 'citizen'}
                    {hoverInfo.unit.down ? ' (down)' : ''}{' '}
                    <span className="num">
                      hp {hoverInfo.unit.hp}/{hoverInfo.unit.maxHp}, armour {hoverInfo.unit.armour}
                    </span>
                    {hoverInfo.unit.side === 'civilian' && !hoverInfo.unit.down && sel && mode === 'normal' && <div className="warn">Firing here counts as a civilian hit.</div>}
                  </div>
                )}
                {hoverInfo.hit && (
                  <div className="num" data-testid="hit-chance">
                    {hoverInfo.hit.ok
                      ? `${sel!.name}: ${hoverInfo.hit.chance}% to hit (${hoverInfo.hit.accuracy} + ${hoverInfo.hit.aim} aim - ${hoverInfo.hit.falloff} range${hoverInfo.hit.movingPenalty ? ` - ${hoverInfo.hit.movingPenalty} moving` : ''}${hoverInfo.hit.crouchPenalty ? ` - ${hoverInfo.hit.crouchPenalty} crouched` : ''}${hoverInfo.hit.crouchBonus ? ` + ${hoverInfo.hit.crouchBonus} steady` : ''}${hoverInfo.hit.runPenalty ? ` - ${hoverInfo.hit.runPenalty} winded` : ''})${hoverInfo.dmg ? `, ${hoverInfo.dmg.min}-${hoverInfo.dmg.max} damage` : ''}`
                      : `${sel!.name} cannot fire: ${hoverInfo.hit.reason}`}
                  </div>
                )}
                {hoverInfo.blast && (
                  <div className="num" data-testid="blast-preview">
                    {hoverInfo.blast.ok
                      ? `Charge: ${hoverInfo.blast.tiles[0]!.structureDamage} to this tile, ${hoverInfo.blast.tiles[1]?.structureDamage ?? 0} around it; ${hoverInfo.blast.tiles[0]!.unitDamage} and ${hoverInfo.blast.tiles[1]?.unitDamage ?? 0} to anyone there, less armour. Goes off after ${hoverInfo.blast.armTicks} ticks.`
                      : `No charge here: ${hoverInfo.blast.reason}.`}
                  </div>
                )}
                {hoverInfo.path && (
                  <div className="num">
                    Path: {hoverInfo.path.ticks} ticks ({(hoverInfo.path.ticks / tps).toFixed(1)} s)
                  </div>
                )}
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
            {agency.marks && agency.marks.length > 0 && (
              <div className="marks-line num" data-testid="marks">
                LAST HOSTILES MARKED: {agency.marks.map((m) => levelName(m.level)).join(', ')}
              </div>
            )}
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
    </>
  );
}
