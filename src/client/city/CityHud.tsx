// The switchboard for the city (docs/presentation-concept.md): a time dial and PAUSE paddle, the agency's money,
// confidence and roster, a file card for the chosen building with WATCH and RAID, the message tray, and a hinged
// cover over the console when a squad stands at a door or the act ends. Every number is an engine field or a
// cityQuery result (CARCH-4). No title attributes (KB rule 8).
import { useEffect, useState } from 'react';
import { CITY, RESEARCH } from '../../data/city';
import { buildingUnder, cityQuery, hasDone, itemCost, projectDef, researchBlock, supplierOrg, type Agent, type CityState } from '../../city';
import { BAND_WORDS, buildingName, districtName, itemName, orgName, OVER_TEXT } from './text';
import { CITY_SPEEDS, useCity } from './store';
import { SceneryToggle } from '../scenery';

const STATUS_WORD: Record<Agent['status'], string> = { ready: 'READY', travelling: 'DRIVING OUT', watching: 'WATCHING', raiding: 'ON RAID', returning: 'DRIVING HOME', wounded: 'WOUNDED', dead: 'KILLED' };

function lampFor(a: Agent): string {
  if (a.status === 'dead') return 'lamp lamp-off';
  if (a.status === 'wounded') return 'lamp lamp-alert';
  if (a.status === 'ready') return 'lamp lamp-ok';
  return 'lamp lamp-caution';
}

function ago(view: CityState, tick: number): string {
  const h = Math.floor((view.tick - tick) / 6);
  if (h < 1) return 'just now';
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

function BuildingCard({ view }: { view: CityState }) {
  const selected = useCity((s) => s.selected);
  const squad = useCity((s) => s.squad);
  const { order, select } = useCity.getState();
  if (!selected) return <div className="hint">Tap a building on the map for its file card. Watch it to learn more; raid it when a report says it is infested.</div>;
  const row = cityQuery.board(view).find((b) => b.id === selected);
  if (!row) return null;
  const def = CITY.buildings.find((b) => b.id === selected)!;
  const ready = view.agents.filter((a) => a.status === 'ready');
  const raiders = squad.length ? squad : ready.slice(0, view.tuning.raid.maxAgents).map((a) => a.id);
  const watcher = ready.find((a) => !squad.includes(a.id)) ?? ready[0];
  return (
    <div className="card" data-testid="building-card">
      <div className="card-title" data-testid="building-name">{row.name.toUpperCase()}</div>
      <div className="num">
        {orgName(row.org)} · {districtName(row.district)} · {def.floors} {def.floors === 1 ? 'floor' : 'floors'}
        {row.turned && <span className="warn"> · TURNED</span>}
      </div>
      <div className="num" data-testid="building-report">
        {row.band ? `Last report: ${BAND_WORDS[row.band]} (${ago(view, row.bandTick!)})` : 'No report yet'}
      </div>
      <div className="num">
        Slips this run: {row.slips} on the building or its owner, {row.districtSlips} missing-persons in the district
        {row.raidedTick !== null && ` · raided ${ago(view, row.raidedTick)}`}
      </div>
      {row.watching.length > 0 && <div className="num">Watching: {row.watching.map((id) => view.agents.find((a) => a.id === id)?.name).join(', ')}</div>}
      <div className="switch-row">
        <button type="button" className="toggle" data-testid="watch" disabled={!watcher || !!view.over} onClick={() => watcher && order({ type: 'watch', side: 'agency', agent: watcher.id, building: selected })}>
          WATCH{watcher ? ` (${watcher.name.toUpperCase()})` : ''}
        </button>
        <button
          type="button"
          className="toggle toggle-alert"
          data-testid="raid"
          disabled={!!view.raid || raiders.length === 0 || !!view.over}
          onClick={() => order({ type: 'raid', side: 'agency', building: selected, agents: raiders })}
        >
          RAID WITH {raiders.length}
        </button>
        <button type="button" className="toggle" onClick={() => select(null)}>
          CLOSE
        </button>
      </div>
    </div>
  );
}

const SHELF_WORDS: [keyof CityState['shelf'], string][] = [
  ['host', 'host bodies'],
  ['taker', 'taker bodies'],
  ['fighter', 'fighter bodies'],
  ['core', 'amber cores'],
  ['liveHost', 'live hosts'],
  ['liveTaker', 'live takers'],
];

/** LAB and WORKSHOP (spec sections 17 and 18): the shelf, the project under way, what can start, and the kit. */
function LabCard({ view }: { view: CityState }) {
  const { order } = useCity.getState();
  const p = view.lab.project ? projectDef(view.lab.project) : null;
  const open = RESEARCH.projects.filter((x) => !hasDone(view, x.id));
  const sup = supplierOrg(view);
  return (
    <div className="card" data-testid="lab-card">
      <div className="num" data-testid="shelf">
        Shelf: {SHELF_WORDS.map(([k, w]) => `${view.shelf[k]} ${w}`).join(', ')}
      </div>
      <div className="num" data-testid="lab-project">
        {p ? `Working on ${p.name}: ${view.lab.progress} of ${p.hours} h` : `The lab is idle. Done: ${view.lab.done.length} of ${RESEARCH.projects.length}.`}
      </div>
      <div className="switch-row lab-list">
        {open.map((x) => {
          const why = researchBlock(view, x.id);
          return (
            <button type="button" key={x.id} className="toggle lab-project" data-testid={`research-${x.id}`} disabled={!!why || !!view.over} onClick={() => order({ type: 'research', side: 'agency', project: x.id })}>
              {x.name.toUpperCase()} <span className="num">{x.hours} H</span>
              {why && <span className="lab-why">{why}</span>}
            </button>
          );
        })}
      </div>
      {hasDone(view, 'interrogation') && (
        <button type="button" className="toggle toggle-alert" data-testid="question" disabled={view.shelf.liveHost < 1} onClick={() => order({ type: 'question', side: 'agency' })}>
          QUESTION A CAPTIVE ({view.shelf.liveHost})
        </button>
      )}
      <div className="num" data-testid="stock">
        Workshop: {view.shop.item ? `making a ${itemName(view.shop.item)} (${view.shop.progress} h)` : 'idle'} · stock {view.shop.stock['shell-plate']} plates, {view.shop.stock['arc-carbine']} carbines
        {view.shop.orders.length > 0 && ` · ${view.shop.orders.length} on order`}
      </div>
      <div className="switch-row">
        {(['shell-plate', 'arc-carbine'] as const)
          .filter((it) => hasDone(view, it))
          .map((it) => {
            const { cost } = itemCost(view, it);
            const price = Math.floor((cost * view.tuning.shop.supplierPricePercent) / 100);
            return (
              <span key={it} className="switch-row">
                <button type="button" className="toggle" data-testid={`build-${it}`} disabled={!!view.shop.item || view.money < cost} onClick={() => order({ type: 'build', side: 'agency', item: it })}>
                  BUILD {itemName(it).toUpperCase()} ({cost})
                </button>
                <button type="button" className="toggle" data-testid={`order-${it}`} disabled={!sup || sup.turned || view.money < price} onClick={() => order({ type: 'order', side: 'agency', item: it })}>
                  BUY FROM {orgName(sup?.id ?? null).toUpperCase()} ({price})
                </button>
              </span>
            );
          })}
      </div>
    </div>
  );
}

function overWhat(x: number, y: number): string {
  const b = buildingUnder(x, y);
  return b ? `over ${buildingName(b)}` : 'over open ground';
}

/** SKY (spec section 20): the craft in the air with INTERCEPT and PRESS or SHADOW, the cars, the crash sites. */
function SkyCard({ view }: { view: CityState }) {
  const { order } = useCity.getState();
  const ready = view.cars.filter((c) => c.status === 'ready').map((c) => c.id);
  const squad = view.agents.filter((a) => a.status === 'ready').slice(0, view.tuning.raid.maxAgents).map((a) => a.id);
  return (
    <div className="card" data-testid="sky-card">
      <div className="num" data-testid="cars">
        Cars:{' '}
        {view.cars.map((c) => (
          <span key={c.id} className="car-lamp">
            <span className={`lamp ${c.status === 'ready' ? 'lamp-ok' : c.status === 'lost' ? 'lamp-off' : c.status === 'repair' ? 'lamp-alert' : 'lamp-caution'}`} /> {c.status.toUpperCase()}
          </span>
        ))}
        <button type="button" className="toggle" data-testid="buy-car" disabled={view.money < view.tuning.air.carCost || view.cars.filter((c) => c.status !== 'lost').length >= view.tuning.air.carCap} onClick={() => order({ type: 'buyCar', side: 'agency' })}>
          BUY A CAR ({view.tuning.air.carCost})
        </button>
      </div>
      {view.craft.length === 0 && view.crashes.length === 0 && <div className="hint">The sky is clear. From the end of the first month the organism may send craft over the city.</div>}
      {view.craft.map((c) => {
        const chasing = view.cars.filter((car) => car.craft === c.id).length;
        return (
          <div key={c.id} className="sky-row" data-testid={`craft-${c.id}`}>
            <div className="num">
              <strong>{c.kind === 'seeder' ? 'SEEDER' : 'SCOUT'}</strong> {overWhat(c.x, c.y)} · hull {Math.round((100 * c.hp) / c.maxHp)}% · {chasing ? `${chasing} car${chasing > 1 ? 's' : ''} on it` : 'unchallenged'}
            </div>
            <div className="switch-row">
              <button type="button" className="toggle toggle-alert" data-testid={`intercept-${c.id}`} disabled={ready.length === 0} onClick={() => order({ type: 'intercept', side: 'agency', craft: c.id, cars: ready })}>
                INTERCEPT ({ready.length})
              </button>
              <button type="button" className={`toggle ${c.posture === 'press' ? 'toggle-on' : ''}`} data-testid={`press-${c.id}`} aria-pressed={c.posture === 'press'} onClick={() => order({ type: 'posture', side: 'agency', craft: c.id, posture: 'press' })}>
                PRESS
              </button>
              <button type="button" className={`toggle ${c.posture === 'shadow' ? 'toggle-on' : ''}`} data-testid={`shadow-${c.id}`} aria-pressed={c.posture === 'shadow'} onClick={() => order({ type: 'posture', side: 'agency', craft: c.id, posture: 'shadow' })}>
                SHADOW
              </button>
            </div>
          </div>
        );
      })}
      {view.crashes.map((cr) => (
        <div key={cr.id} className="sky-row" data-testid={`crash-${cr.id}`}>
          <div className="num">
            WRECK of a {cr.kind} {cr.building ? `on ${buildingName(cr.building)}` : 'on open ground'} · {cr.survivors} survivors · {Math.max(0, Math.ceil((cr.until - view.tick) / 6))} h before they scatter
          </div>
          <button type="button" className="toggle toggle-alert" data-testid={`raid-${cr.id}`} disabled={!!view.raid || squad.length === 0} onClick={() => order({ type: 'raid', side: 'agency', building: cr.id, agents: squad })}>
            RAID THE WRECK WITH {squad.length}
          </button>
        </div>
      ))}
      <div className="hint">Press to fire on contact, shadow to follow: a craft falls where it is, and a wreck on a building is billed to its owner.</div>
    </div>
  );
}

function DoorCover({ view }: { view: CityState }) {
  const { order, beginFight } = useCity.getState();
  // CVIEW-1 hides the hostiles only while the squad travels; at the door the view carries them (RAID-3, CQRY-3).
  const odds = cityQuery.raidOdds(view);
  if (!view.raid?.arrived || !odds.ok) return null;
  const hostiles = odds.hostiles;
  const chance = odds;
  return (
    <div className="cover" data-testid="door">
      <div className="cover-title">SQUAD AT THE DOOR: {(view.raid.building.startsWith('crash') ? 'THE WRECK' : buildingName(view.raid.building)).toUpperCase()}</div>
      <div className="num">
        {view.raid.agents.length} agents: {view.raid.agents.map((id) => view.agents.find((a) => a.id === id)?.name).join(', ')}
      </div>
      <div className="num" data-testid="door-odds">
        {hostiles === 0 ? 'The building looks quiet from the door.' : `Movement inside. The switchboard's estimate: ${chance.ok ? chance.winChance : 0}% to clear it without help.`}
      </div>
      <div className="switch-row">
        <button type="button" className="toggle toggle-big" data-testid="fight" onClick={() => beginFight()}>
          FIGHT IT
        </button>
        <button type="button" className="toggle toggle-big" data-testid="auto-resolve" onClick={() => order({ type: 'resolve', side: 'agency' })}>
          LET THE SQUAD HANDLE IT
        </button>
      </div>
    </div>
  );
}

function OverCover({ view }: { view: CityState }) {
  const { leave, discard } = useCity.getState();
  if (!view.over) return null;
  const s = view.score;
  return (
    <div className="cover" data-testid="city-over">
      <div className="cover-title">{view.over.winner === 'agency' ? 'ACT ONE: THE CITY HOLDS' : 'ACT ONE: THE CITY IS LOST'}</div>
      <div>{OVER_TEXT[view.over.reason]}</div>
      <div className="num">
        Day {cityQuery.clock(view).day + 1}. Raids {s.raids}, won {s.raidsWon}, on clean buildings {s.cleanRaids}. Hostiles down {s.hostilesDown}, agents killed {s.agentsDead}, citizens killed {s.civiliansDown}.
      </div>
      <div className="switch-row">
        <button
          type="button"
          className="toggle toggle-big"
          data-testid="city-over-leave"
          onClick={() => {
            leave();
            discard();
          }}
        >
          RETURN TO THE TITLE
        </button>
      </div>
    </div>
  );
}

export function CityHud() {
  const view = useCity((s) => s.view);
  const paused = useCity((s) => s.paused);
  const speed = useCity((s) => s.speed);
  const tray = useCity((s) => s.tray);
  const squad = useCity((s) => s.squad);
  const selected = useCity((s) => s.selected);
  const saveOk = useCity((s) => s.saveOk);
  const { togglePause, setSpeed, leave, order, toggleSquad, select } = useCity.getState();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [tab, setTab] = useState<'file' | 'lab' | 'sky'>('file');
  const seeders = view?.craft.filter((c) => c.kind === 'seeder').length ?? 0;
  useEffect(() => {
    if (seeders > 0) setTab('sky');
  }, [seeders]);
  useEffect(() => {
    if (selected) setTab('file');
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePause]);

  if (!view) return null;
  const c = cityQuery.clock(view);
  const roster = cityQuery.roster(view);
  const grant = cityQuery.grant(view);
  return (
    <>
      <DoorCover view={view} />
      <OverCover view={view} />
      <div className="console city-console" data-testid="city-console">
        <div className="console-bead" />
        <div className="console-row">
          <section className="panel panel-time" aria-label="Time">
            <div className="dial" data-testid="city-clock">
              <span className="dial-label">{c.night ? 'NIGHT' : 'DAY'} {c.day + 1}</span>
              <span className="dial-value num">
                {String(c.hour).padStart(2, '0')}:{String(c.minute).padStart(2, '0')}
              </span>
            </div>
            <button type="button" className={`paddle ${paused ? 'paddle-down' : ''}`} data-testid="city-pause" aria-pressed={paused} onClick={togglePause}>
              {paused ? 'PAUSED' : 'RUNNING'}
            </button>
            <div className="switch-row" role="group" aria-label="Speed">
              {CITY_SPEEDS.map((sp) => (
                <button type="button" key={sp} className={`toggle ${speed === sp ? 'toggle-on' : ''}`} data-testid={`city-speed-${sp}`} aria-pressed={speed === sp} onClick={() => setSpeed(sp)}>
                  ×{sp}
                </button>
              ))}
            </div>
            <div className={`save-lamp ${saveOk ? '' : 'save-lamp-alert'}`}>
              <span className={`lamp ${saveOk ? 'lamp-ok' : 'lamp-alert'}`} /> {saveOk ? 'SAVED' : 'NOT SAVED'}
            </div>
            {confirmLeave ? (
              <div className="switch-row">
                <button type="button" className="toggle toggle-alert" data-testid="city-leave-confirm" onClick={leave}>
                  SAVE AND LEAVE
                </button>
                <button type="button" className="toggle" onClick={() => setConfirmLeave(false)}>
                  STAY
                </button>
              </div>
            ) : (
              <div className="switch-row">
                <button type="button" className="toggle" data-testid="city-leave" onClick={() => setConfirmLeave(true)}>
                  LEAVE
                </button>
                <SceneryToggle testId="city-scenery" />
              </div>
            )}
          </section>

          <section className="panel panel-squad" aria-label="Agency">
            <div className="panel-title">AGENCY</div>
            <div className="num" data-testid="money">
              FUNDS {view.money} · NEXT GRANT ABOUT {grant}
            </div>
            <div className="meter" data-testid="confidence" aria-label={`Public confidence ${view.confidence} of 100`}>
              <span className="meter-label">CONFIDENCE</span>
              <span className="meter-bar">
                <span className={`meter-fill ${view.confidence < view.tuning.end.confidenceFloor + 10 ? 'meter-alert' : ''}`} style={{ width: `${view.confidence}%` }} />
              </span>
              <span className="num">{view.confidence}</span>
            </div>
            <div className="lamps" data-testid="roster">
              {view.agents
                .filter((a) => a.status !== 'dead')
                .map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    className={`agent ${squad.includes(a.id) ? 'agent-selected' : ''}`}
                    data-testid={`agent-${a.id}`}
                    aria-pressed={squad.includes(a.id)}
                    disabled={a.status !== 'ready'}
                    onClick={() => toggleSquad(a.id)}
                  >
                    <span className={lampFor(a)} />
                    <span className="agent-name">{a.name}</span>
                    <span className="agent-order">{STATUS_WORD[a.status]}</span>
                  </button>
                ))}
            </div>
            <button type="button" className="toggle" data-testid="recruit" disabled={view.money < roster.recruitCost || roster.living >= roster.cap} onClick={() => order({ type: 'recruit', side: 'agency' })}>
              RECRUIT ({roster.recruitCost})
            </button>
            <div className="hint">Tick agents to pick a raid squad; with none ticked, the first ready go.</div>
          </section>

          <section className="panel panel-card" aria-label="File card and lab">
            <div className="switch-row" role="group" aria-label="Card">
              <button type="button" className={`toggle tab ${tab === 'file' ? 'toggle-on' : ''}`} data-testid="tab-file" aria-pressed={tab === 'file'} onClick={() => setTab('file')}>
                FILE CARD
              </button>
              <button type="button" className={`toggle tab ${tab === 'lab' ? 'toggle-on' : ''}`} data-testid="tab-lab" aria-pressed={tab === 'lab'} onClick={() => setTab('lab')}>
                LAB AND WORKSHOP{view.lab.project ? ' ·' : ''}
              </button>
              <button type="button" className={`toggle tab ${tab === 'sky' ? 'toggle-on' : ''} ${view.craft.length || view.crashes.length ? 'tab-alert' : ''}`} data-testid="tab-sky" aria-pressed={tab === 'sky'} onClick={() => setTab('sky')}>
                SKY{view.craft.length ? ` (${view.craft.length})` : ''}
              </button>
            </div>
            {tab === 'file' ? <BuildingCard view={view} /> : tab === 'lab' ? <LabCard view={view} /> : <SkyCard view={view} />}
          </section>

          <section className="panel panel-tray" aria-label="Message slips">
            <div className="panel-title">MESSAGE TRAY</div>
            <ol className="tray" data-testid="city-tray">
              {tray
                .slice()
                .reverse()
                .map((s) => (
                  <li key={s.id} className={`slip slip-${s.tone} ${s.building && s.building === selected ? 'slip-picked' : ''}`} onClick={() => s.building && select(s.building)}>
                    <span className="slip-time num">{s.stamp}</span>
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
