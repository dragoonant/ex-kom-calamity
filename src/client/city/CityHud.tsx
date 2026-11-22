// The switchboard for the city (docs/presentation-concept.md): a time dial and PAUSE paddle, the agency's money,
// confidence and roster, a file card for the chosen building with WATCH and RAID, the message tray, and a hinged
// cover over the console when a squad stands at a door or the act ends. Every number is an engine field or a
// cityQuery result (CARCH-4). No title attributes (KB rule 8).
import { useEffect, useState } from 'react';
import { CITY, ITEMS, RESEARCH } from '../../data/city';
import { buildableItems, buildingUnder, cityQuery, hasDone, itemCost, projectDef, researchBlock, supplierOrg, type Agent, type CityState, type EquipSlot } from '../../city';
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

function BuildingCard({ view, toArmoury }: { view: CityState; toArmoury: () => void }) {
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
        {view.act === 3 && row.id === CITY.agency.final && <span className="warn"> · THE SOURCE: RAID IT TO END THIS</span>}
      </div>
      <div className="num" data-testid="building-report">
        {row.band ? `Last report: ${BAND_WORDS[row.band]} (${ago(view, row.bandTick!)})` : 'No report yet'}
      </div>
      <div className="num">
        Slips this run: {row.slips} on the building or its owner, {row.districtSlips} missing-persons in the district
        {row.raidedTick !== null && ` · raided ${ago(view, row.raidedTick)}`}
      </div>
      {row.watching.length > 0 && <div className="num">Watching: {row.watching.map((id) => view.agents.find((a) => a.id === id)?.name).join(', ')}</div>}
      {raiders.length > 0 && !view.raid && (
        <div className="num kit-row" data-testid="raid-kit">
          Squad kit:{' '}
          {raiders
            .map((id) => {
              const k = cityQuery.kit(view, id);
              return k ? `${k.name} (${k.slots[0]!.name.toLowerCase()}, ${k.slots[1]!.name.toLowerCase()})` : id;
            })
            .join('; ')}
          <button type="button" className="toggle toggle-small" data-testid="change-kit" onClick={toArmoury}>
            CHANGE KIT
          </button>
        </div>
      )}
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

/** CQRY-8: the limited kit on the armoury shelf, in words. */
function shelfWords(view: CityState): string {
  return cityQuery
    .armoury(view)
    .filter((r) => !r.free && r.built + r.ordered > 0)
    .map((r) => `${r.built + r.ordered} ${r.name.toLowerCase()}${r.built + r.ordered > 1 ? 's' : ''}`)
    .join(', ');
}

const SLOT_WORDS: Record<EquipSlot | 'belt', string> = { suit: 'SUIT', long: 'LONG ARM', side: 'SIDEARM', belt: 'BELT' };

/** ARMOURY (spec section 23, KIT; docs/tech-tree.md 7): a sheet above the console with the roster, the chosen agent's
 * kit fitted from the free issue and the shelf, and the shelf itself. Every number is a cityQuery result (CQRY-7, CQRY-8). */
function ArmourySheet({ view, onClose }: { view: CityState; onClose: () => void }) {
  const { order, bestFit } = useCity.getState();
  const living = view.agents.filter((a) => a.status !== 'dead');
  const [picked, setPicked] = useState<string | null>(null);
  const id = picked && living.some((a) => a.id === picked) ? picked : (living[0]?.id ?? null);
  const k = id ? cityQuery.kit(view, id) : null;
  const shelf = cityQuery.armoury(view);
  const home = k?.status === 'ready' && !view.over;
  const anyOnShelf = shelf.some((r) => !r.free && r.built + r.ordered > 0);
  return (
    <div className="armoury-sheet" data-testid="armoury-card" role="dialog" aria-label="Armoury">
      <div className="armoury-head">
        <span className="cover-title">ARMOURY</span>
        <span className="switch-row">
          <button type="button" className="toggle" data-testid="best-fit" disabled={!!view.over || !anyOnShelf} onClick={() => bestFit()}>
            BEST FIT FOR EVERYONE AT HOME
          </button>
          <button type="button" className="toggle" data-testid="armoury-close" onClick={onClose}>
            CLOSE
          </button>
        </span>
      </div>
      <div className="armoury-grid">
        <div className="armoury-agents" role="group" aria-label="Agent">
          {living.map((a) => {
            const ak = cityQuery.kit(view, a.id)!;
            return (
              <button type="button" key={a.id} className={`agent ${a.id === id ? 'agent-selected' : ''}`} data-testid={`kit-agent-${a.id}`} aria-pressed={a.id === id} onClick={() => setPicked(a.id)}>
                <span className={lampFor(a)} />
                <span className="agent-name">{a.name}</span>
                <span className="agent-order">{ak.slots[0]!.free ? '' : 'PLATE '}{ak.slots[1]!.name.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
        {k && (
          <div className="armoury-card">
            <div className="card-title">
              {k.name.toUpperCase()} · {STATUS_WORD[k.status]}
            </div>
            <div className="num" data-testid="kit-numbers">
              HP {k.hp} · ARMOUR {k.armour} · {k.longName}: range {k.range}, damage {k.damage.min}-{k.damage.max}, hits {k.hitNear}% at 5 tiles{k.hitFar > 0 ? `, ${k.hitFar}% at 15` : ', out of range at 15'} · sidearm {k.sideName}
            </div>
            <div className="meter" data-testid="kit-carry" aria-label={`Carrying ${k.weight} of ${k.carry}`}>
              <span className="meter-label">CARRY</span>
              <span className="meter-bar">
                <span className={`meter-fill ${k.over > 0 ? 'meter-alert' : ''}`} style={{ width: `${Math.min(100, (100 * k.weight) / Math.max(1, k.carry))}%` }} />
              </span>
              <span className="num">
                {k.weight}/{k.carry}
              </span>
            </div>
            {!home && <div className="hint">{k.name} is away; kit changes only at headquarters.</div>}
            {k.slots.map((row) => {
              const slot = row.slot as EquipSlot;
              const options = shelf
                .filter((r) => r.slot === slot && (r.free ? r.item !== row.item || !row.free : r.built + r.ordered > 0))
                .flatMap((r) => {
                  if (r.free) return [{ key: r.item, label: r.name, piece: undefined as string | undefined, item: r.item }];
                  const out = [];
                  const built = r.pieces.find((p) => p.source === 'built');
                  const ordered = r.pieces.find((p) => p.source === 'ordered');
                  if (built) out.push({ key: `${r.item}-built`, label: `${r.name} (built, ${r.built})`, piece: built.id, item: r.item });
                  if (ordered) out.push({ key: `${r.item}-ordered`, label: `${r.name} (bought, ${r.ordered})`, piece: ordered.id, item: r.item });
                  return out;
                });
              return (
                <div key={slot} className="kit-slot" data-testid={`kit-slot-${slot}`}>
                  <span className="kit-slot-name">{SLOT_WORDS[slot]}</span>
                  <span className="kit-slot-item" data-testid={`kit-${slot}`}>
                    {row.name}
                    {row.source && <span className="lab-why"> {row.source === 'built' ? 'built' : 'bought'}</span>}
                  </span>
                  {home &&
                    options.map((o) => (
                      <button type="button" key={o.key} className="toggle toggle-small" data-testid={`fit-${slot}-${o.key}`} onClick={() => order({ type: 'equip', side: 'agency', agent: k.agent, slot, item: o.item, ...(o.piece ? { piece: o.piece } : {}) })}>
                        {o.label.toUpperCase()}
                      </button>
                    ))}
                </div>
              );
            })}
            {k.belt.map((b, i) => (
              <div key={`belt-${i}`} className="kit-slot" data-testid={`kit-belt-${i}`}>
                <span className="kit-slot-name">BELT {i + 1}</span>
                <span className="kit-slot-item">{b.item ? b.name : <span className="lab-why">empty: belt items come with the lab's work</span>}</span>
              </div>
            ))}
            <div className="switch-row">
              <button type="button" className="toggle" data-testid="strip" disabled={!home || k.slots.every((r) => r.free)} onClick={() => order({ type: 'strip', side: 'agency', agent: k.agent })}>
                STRIP {k.name.toUpperCase()} TO THE ISSUE
              </button>
            </div>
          </div>
        )}
        <div className="armoury-shelf" data-testid="armoury-shelf">
          <div className="meter-label">ON THE SHELF</div>
          {shelf.filter((r) => !r.free).length === 0 && <div className="hint">Nothing yet: the lab's designs, built or bought, come here.</div>}
          {shelf
            .filter((r) => !r.free)
            .map((r) => (
              <div key={r.item} className="shelf-row num">
                <strong>{r.name}</strong> · {r.built} built, {r.ordered} bought · {r.carried} carried
              </div>
            ))}
          <div className="meter-label">FREE ISSUE</div>
          <div className="num">{ITEMS.items.filter((i) => i.kind === 'free').map((i) => i.name).join(', ')}</div>
          <div className="hint">A bought piece may come from an infiltrated supplier; a built one never does.</div>
        </div>
      </div>
    </div>
  );
}

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
        Workshop: {view.shop.item ? `making a ${itemName(view.shop.item)} (${view.shop.progress} of ${itemCost(view.shop.item).hours} h)` : 'idle'} · armoury shelf{' '}
        {shelfWords(view) || 'empty'}
        {view.shop.orders.length > 0 && ` · ${view.shop.orders.length} on order`}
      </div>
      <div className="switch-row">
        {buildableItems(view)
          .map((d) => d.id)
          .map((it) => {
            const { cost } = itemCost(it);
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
              <strong>{c.kind.toUpperCase()}</strong> {overWhat(c.x, c.y)} · hull {Math.round((100 * c.hp) / c.maxHp)}% · {chasing ? `${chasing} car${chasing > 1 ? 's' : ''} on it` : 'unchallenged'}
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
      <div className="cover-title">SQUAD AT THE DOOR: {(view.raid.building.startsWith('crash') ? 'THE WRECK' : view.act === 3 && view.raid.building === CITY.agency.final ? `${buildingName(view.raid.building)}, THE SOURCE` : buildingName(view.raid.building)).toUpperCase()}</div>
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

const ACT_CARDS: Record<2 | 3, { title: string; text: string }> = {
  2: {
    title: 'ACT TWO: OPEN SKY',
    text: 'The council reports the city quiet, and for a week it is. Then the craft come by daylight: pale scouts looking for us, and slow seeders settling on rooftops. The organism has stopped whispering. Trace the amber cores to where they all lead before the city is lost.',
  },
  3: {
    title: 'ACT THREE: PERFECT DAY',
    text: 'Every core leans toward one place: the tower of the company that sold the city its miracle amber. The organism knows we know. Carriers drop fighters into the streets, and once it finds our headquarters it will come for it. Take a full squad into the tower and end it.',
  },
};

/** ACT-1: a card between acts; it shows once per act and the city stays paused until it is closed. */
function ActCover({ view }: { view: CityState }) {
  const [seen, setSeen] = useState(view.act);
  if (view.act <= seen || view.over) return null;
  const card = ACT_CARDS[view.act as 2 | 3];
  return (
    <div className="cover" data-testid="act-cover">
      <div className="cover-title">{card.title}</div>
      <div>{card.text}</div>
      <div className="switch-row">
        <button type="button" className="toggle toggle-big" data-testid="act-continue" onClick={() => setSeen(view.act)}>
          TO THE SWITCHBOARD
        </button>
      </div>
    </div>
  );
}

/** ACT-5: headquarters under assault; it is fought, or left to the agents at home. */
function DefenceCover({ view }: { view: CityState }) {
  const { order, beginFight } = useCity.getState();
  if (!view.defence) return null;
  const home = view.agents.filter((a) => a.status === 'ready');
  return (
    <div className="cover" data-testid="defence">
      <div className="cover-title">HEADQUARTERS UNDER ASSAULT</div>
      <div className="num">
        {view.defence.hostiles} hostiles at the doors. At home: {home.length ? home.map((a) => a.name).join(', ') : 'nobody'}.
      </div>
      <div className="warn">If headquarters falls, the campaign is lost.</div>
      <div className="switch-row">
        <button type="button" className="toggle toggle-big" data-testid="defence-fight" disabled={home.length === 0} onClick={() => beginFight()}>
          FIGHT IT
        </button>
        <button type="button" className="toggle toggle-big" data-testid="defence-auto" onClick={() => order({ type: 'defend', side: 'agency' })}>
          LET THE AGENTS AT HOME HOLD IT
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
      <div className="cover-title">{view.over.winner === 'agency' ? 'THE CITY IS SAVED' : `ACT ${view.act === 1 ? 'ONE' : view.act === 2 ? 'TWO' : 'THREE'}: THE CITY IS LOST`}</div>
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
  const [tab, setTab] = useState<'file' | 'lab' | 'kit' | 'sky'>('file');
  const seeders = view?.craft.filter((c) => c.kind !== 'scout').length ?? 0;
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
      <DefenceCover view={view} />
      <ActCover view={view} />
      <OverCover view={view} />
      {tab === 'kit' && !view.raid?.arrived && !view.defence && <ArmourySheet view={view} onClose={() => setTab('file')} />}
      <div className="console city-console" data-testid="city-console">
        <div className="console-bead" />
        <div className="console-row">
          <section className="panel panel-time" aria-label="Time">
            <div className="dial" data-testid="city-clock">
              <span className="dial-label">ACT {view.act} · {c.night ? 'NIGHT' : 'DAY'} {c.day + 1}</span>
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
              <button type="button" className={`toggle tab ${tab === 'kit' ? 'toggle-on' : ''}`} data-testid="tab-kit" aria-pressed={tab === 'kit'} onClick={() => setTab('kit')}>
                ARMOURY
              </button>
              <button type="button" className={`toggle tab ${tab === 'sky' ? 'toggle-on' : ''} ${view.craft.length || view.crashes.length ? 'tab-alert' : ''}`} data-testid="tab-sky" aria-pressed={tab === 'sky'} onClick={() => setTab('sky')}>
                SKY{view.craft.length ? ` (${view.craft.length})` : ''}
              </button>
            </div>
            {tab === 'file' ? <BuildingCard view={view} toArmoury={() => setTab('kit')} /> : tab === 'lab' ? <LabCard view={view} /> : tab === 'kit' ? <div className="hint" data-testid="armoury-open">The armoury is open above the console. {shelfWords(view) ? `On the shelf: ${shelfWords(view)}.` : 'The shelf is empty.'}</div> : <SkyCard view={view} />}
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
