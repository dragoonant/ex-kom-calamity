// The headquarters screens (RULING CSAV-3): the LAB (research, spec section 17), the ARMOURY (buying and making
// kit, section 18 and the cars of section 20) and the SQUAD (who carries what, SHOP-5), each a sheet of its own over
// the city instead of tabs crowded into the console's card. The city holds still while one is open. Every number is
// an engine field or a rule helper's result (CARCH-4). No title attributes (KB rule 8).
import { useEffect } from 'react';
import { RESEARCH, type Evidence } from '../../data/city';
import { cityQuery, equipBlock, hasDone, issued, ITEMS, itemCost, projectDef, researchBlock, spare, supplierOrg, ticksPerHour, type Agent, type CityState, type ItemId } from '../../city';
import { CITY_SCREENS, useCity, type CityScreen } from './store';
import { LAB_REPORT, orgName } from './text';

const SCREEN_NAME: Record<CityScreen, string> = { lab: 'LAB', armoury: 'ARMOURY', squad: 'SQUAD' };
const SCREEN_LINE: Record<CityScreen, string> = {
  lab: 'Evidence from the raids, and what the scientists can learn from it.',
  armoury: 'Kit the workshop can make, or the supplier can sell, once the lab has the design.',
  squad: 'Who carries what. Kit changes hands only at headquarters.',
};

const EVIDENCE_NAME: Record<Evidence, [string, string]> = {
  host: ['host body', 'host bodies'],
  taker: ['taker body', 'taker bodies'],
  fighter: ['fighter body', 'fighter bodies'],
  core: ['amber core', 'amber cores'],
  liveHost: ['live host', 'live hosts'],
  liveTaker: ['live taker', 'live takers'],
};
const SHELF_ORDER: Evidence[] = ['host', 'taker', 'fighter', 'core', 'liveHost', 'liveTaker'];

function count(n: number, k: Evidence): string {
  return `${n} ${EVIDENCE_NAME[k][n === 1 ? 0 : 1]}`;
}

const ITEM_NAME: Record<ItemId, string> = { 'shell-plate': 'SHELL PLATE SUIT', 'arc-carbine': 'ARC CARBINE' };
const ITEM_SHORT: Record<ItemId, string> = { 'shell-plate': 'PLATE', 'arc-carbine': 'CARBINE' };

/** SHOP-4: what an item does on an auto-resolved raid, from the tuning. */
function itemEffect(view: CityState, item: ItemId): string {
  const t = view.tuning.shop;
  return item === 'shell-plate'
    ? `+${t.plateWin}% to a raid's odds per wearer, and the wearer is ${t.plateDownCutPercent}% less likely to go down. In a fought battle the wearer is armoured.`
    : `+${t.carbineWin}% to a raid's odds per carrier. In a fought battle the carrier fires the carbine.`;
}

function Meter({ value, max, testId }: { value: number; max: number; testId?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((100 * value) / max)) : 0;
  return (
    <span className="meter-bar hq-meter" data-testid={testId}>
      <span className="meter-fill" style={{ width: `${pct}%` }} />
    </span>
  );
}

/** LAB (spec section 17): the shelf, the project under way with its progress, what can start and why not, and what is done. */
function LabScreen({ view }: { view: CityState }) {
  const { order } = useCity.getState();
  const p = view.lab.project ? projectDef(view.lab.project) : null;
  const open = RESEARCH.projects.filter((x) => !hasDone(view, x.id) && x.id !== view.lab.project);
  const done = RESEARCH.projects.filter((x) => hasDone(view, x.id));
  return (
    <div className="hq-body hq-body-lab" data-testid="lab-screen">
      <section className="panel" aria-label="Shelf">
        <div className="panel-title">THE SHELF</div>
        <table className="hq-table" data-testid="shelf">
          <tbody>
            {SHELF_ORDER.map((k) => (
              <tr key={k}>
                <th>{EVIDENCE_NAME[k][1]}</th>
                <td className="num">{view.shelf[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="hint">Raids bring bodies and cores; with restraints, live captives. A project needs its evidence on the shelf; live captives are used up.</div>
        {hasDone(view, 'interrogation') && (
          <div className="hq-block">
            <div className="panel-title">QUESTIONING</div>
            <button type="button" className="toggle toggle-alert" data-testid="question" disabled={view.shelf.liveHost < 1 || !!view.over} onClick={() => order({ type: 'question', side: 'agency' })}>
              QUESTION A CAPTIVE ({view.shelf.liveHost})
            </button>
            <div className="hint">A live host names the organisation most deeply taken.</div>
          </div>
        )}
      </section>

      <section className="panel" aria-label="Projects">
        <div className="panel-title">UNDER WAY</div>
        <div className="hq-current" data-testid="lab-project">
          {p ? (
            <>
              <div className="card-title">{p.name.toUpperCase()}</div>
              <div className="hq-progress num">
                <Meter value={view.lab.progress} max={p.hours} testId="lab-meter" /> {view.lab.progress} of {p.hours} h
              </div>
            </>
          ) : (
            <div className="hint">
              The lab is idle. Done: {view.lab.done.length} of {RESEARCH.projects.length}.
            </div>
          )}
        </div>
        <div className="panel-title">PROJECTS</div>
        <ul className="hq-list" data-testid="lab-list">
          {open.map((x) => {
            const why = researchBlock(view, x.id);
            const needs = [
              ...Object.entries(x.needs ?? {}).map(([k, n]) => `needs ${count(n ?? 0, k as Evidence)}`),
              ...Object.entries(x.consumes ?? {}).map(([k, n]) => `uses up ${count(n ?? 0, k as Evidence)}`),
              ...(x.requires ?? []).map((r) => `after ${projectDef(r)?.name ?? r}`),
            ].join(' · ');
            return (
              <li key={x.id} className={`hq-row ${why ? 'hq-row-blocked' : ''}`}>
                <div className="hq-row-main">
                  <span className="hq-row-name">{x.name.toUpperCase()}</span>
                  <span className="hint">
                    {x.hours} h{needs ? ` · ${needs}` : ''}
                  </span>
                </div>
                <button type="button" className="toggle" data-testid={`research-${x.id}`} disabled={!!why || !!view.over} onClick={() => order({ type: 'research', side: 'agency', project: x.id })}>
                  START
                </button>
              </li>
            );
          })}
          {open.length === 0 && <li className="hint">Every project is done or under way.</li>}
        </ul>
      </section>

      <section className="panel" aria-label="Findings">
        <div className="panel-title">FINDINGS</div>
        <ul className="hq-list" data-testid="lab-done">
          {done.map((x) => (
            <li key={x.id} className="hq-finding">
              <span className="hq-row-name">{x.name.toUpperCase()}</span>
              <span>{LAB_REPORT[x.id] ?? ''}</span>
            </li>
          ))}
          {done.length === 0 && <li className="hint">Nothing learned yet.</li>}
        </ul>
      </section>
    </div>
  );
}

/** ARMOURY (spec sections 18 and 20): the workshop's job, the orders on the way, each design with BUILD and BUY, and the cars. */
function ArmouryScreen({ view }: { view: CityState }) {
  const { order } = useCity.getState();
  const sup = supplierOrg(view);
  const supName = orgName(sup?.id ?? null);
  const job = view.shop.item;
  const jobHours = job ? itemCost(view, job).hours : 0;
  const tph = ticksPerHour(view.tuning);
  const air = view.tuning.air;
  const cars = view.cars.filter((c) => c.status !== 'lost').length;
  return (
    <div className="hq-body hq-body-armoury" data-testid="armoury-screen">
      <section className="panel" aria-label="Catalogue">
        <div className="panel-title">CATALOGUE</div>
        <ul className="hq-list">
          {ITEMS.map((it) => {
            const designed = hasDone(view, it);
            const { cost, hours } = itemCost(view, it);
            const price = Math.floor((cost * view.tuning.shop.supplierPricePercent) / 100);
            return (
              <li key={it} className={`hq-item ${designed ? '' : 'hq-row-blocked'}`} data-testid={`item-${it}`}>
                <div className="card-title">{ITEM_NAME[it]}</div>
                <div>{itemEffect(view, it)}</div>
                <div className="num" data-testid={`stock-${it}`}>
                  Owned {view.shop.stock[it]} · in the store {spare(view, it)} · carried {issued(view, it)}
                  {view.shop.orders.filter((o) => o.item === it).length > 0 && ` · ${view.shop.orders.filter((o) => o.item === it).length} on order`}
                </div>
                {designed ? (
                  <div className="switch-row">
                    <button type="button" className="toggle" data-testid={`build-${it}`} disabled={!!job || view.money < cost || !!view.over} onClick={() => order({ type: 'build', side: 'agency', item: it })}>
                      BUILD · {cost} · {hours} H
                    </button>
                    <button type="button" className="toggle" data-testid={`order-${it}`} disabled={!sup || sup.turned || view.money < price || !!view.over} onClick={() => order({ type: 'order', side: 'agency', item: it })}>
                      BUY FROM {supName.toUpperCase()} · {price} · {view.tuning.shop.supplierHours} H
                    </button>
                  </div>
                ) : (
                  <div className="lab-why">No design yet: the lab must finish {projectDef(it)?.name ?? it} first.</div>
                )}
              </li>
            );
          })}
        </ul>
        {sup?.turned && <div className="warn">{supName} has turned and will not sell to the agency.</div>}
      </section>

      <section className="panel" aria-label="Workshop">
        <div className="panel-title">WORKSHOP</div>
        <div className="hq-current" data-testid="stock">
          {job ? (
            <>
              <div className="card-title">MAKING A {ITEM_NAME[job]}</div>
              <div className="hq-progress num">
                <Meter value={view.shop.progress} max={jobHours} testId="shop-meter" /> {view.shop.progress} of {jobHours} h
              </div>
            </>
          ) : (
            <div className="hint">The workshop is idle.</div>
          )}
        </div>
        <div className="panel-title">ON ORDER</div>
        <ul className="hq-list" data-testid="orders">
          {view.shop.orders.map((o, i) => (
            <li key={i} className="num">
              {ITEM_NAME[o.item]} from {supName}, in {Math.max(0, Math.ceil((o.arriveTick - view.tick) / tph))} h
            </li>
          ))}
          {view.shop.orders.length === 0 && <li className="hint">Nothing on order.</li>}
        </ul>
        <div className="hint">A new item goes to the first agent at headquarters without one; the SQUAD screen moves it.</div>
      </section>

      <section className="panel" aria-label="Motor pool">
        <div className="panel-title">MOTOR POOL</div>
        <div className="num" data-testid="armoury-cars">
          {cars} of {air.carCap} flying cars ·{' '}
          {view.cars
            .filter((c) => c.status !== 'lost')
            .map((c) => c.status)
            .join(', ')}
        </div>
        <button type="button" className="toggle" data-testid="armoury-buy-car" disabled={view.money < air.carCost || cars >= air.carCap || !!view.over} onClick={() => order({ type: 'buyCar', side: 'agency' })}>
          BUY A CAR · {air.carCost}
        </button>
        <div className="hint">Cars intercept craft over the city (the SKY card on the switchboard).</div>
      </section>
    </div>
  );
}

const STATUS_WORD: Record<Agent['status'], string> = { ready: 'READY', travelling: 'DRIVING OUT', watching: 'WATCHING', raiding: 'ON RAID', returning: 'DRIVING HOME', wounded: 'WOUNDED', dead: 'KILLED' };

/** SQUAD (SHOP-5): each living agent with its kit switches and the raid pick; the store's counts and RECRUIT. */
function SquadScreen({ view }: { view: CityState }) {
  const squad = useCity((s) => s.squad);
  const { order, toggleSquad } = useCity.getState();
  const roster = cityQuery.roster(view);
  const living = view.agents.filter((a) => a.status !== 'dead');
  return (
    <div className="hq-body hq-body-squad" data-testid="squad-screen">
      <section className="panel" aria-label="Agents">
        <div className="panel-title">AGENTS · {roster.living} OF {roster.cap}</div>
        <table className="hq-table hq-squad">
          <thead>
            <tr>
              <th>RAID</th>
              <th>AGENT</th>
              <th>STATUS</th>
              <th className="num">RAIDS</th>
              {ITEMS.map((it) => (
                <th key={it}>{ITEM_SHORT[it]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {living.map((a) => (
              <tr key={a.id} data-testid={`squad-${a.id}`}>
                <td>
                  <button type="button" className={`toggle hq-pick ${squad.includes(a.id) ? 'toggle-on' : ''}`} data-testid={`pick-${a.id}`} aria-pressed={squad.includes(a.id)} disabled={a.status !== 'ready'} onClick={() => toggleSquad(a.id)}>
                    {squad.includes(a.id) ? 'GOING' : 'PICK'}
                  </button>
                </td>
                <td className="hq-agent">{a.name}</td>
                <td className="hq-status-word">{STATUS_WORD[a.status]}</td>
                <td className="num">{a.raids}</td>
                {ITEMS.map((it) => {
                  const has = a.kit.includes(it);
                  const blocked = equipBlock(view, a.id, it, !has);
                  return (
                    <td key={it}>
                      <button
                        type="button"
                        className={`toggle hq-kit ${has ? 'toggle-on' : ''}`}
                        data-testid={`kit-${a.id}-${it}`}
                        aria-pressed={has}
                        disabled={!!blocked || !!view.over}
                        onClick={() => order({ type: has ? 'unequip' : 'equip', side: 'agency', agent: a.id, item: it })}
                      >
                        {has ? 'CARRIES' : 'NONE'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="hint">Ticked agents go on the next raid; with none ticked, the first ready go. An agent away from headquarters keeps its kit.</div>
      </section>

      <section className="panel" aria-label="Store">
        <div className="panel-title">THE STORE</div>
        <table className="hq-table" data-testid="squad-store">
          <tbody>
            {ITEMS.map((it) => (
              <tr key={it}>
                <th>{ITEM_NAME[it]}</th>
                <td className="num">
                  {spare(view, it)} spare of {view.shop.stock[it]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="hint">The ARMOURY builds and buys more.</div>
        <div className="hq-block">
          <div className="panel-title">RECRUITING</div>
          <button type="button" className="toggle" data-testid="squad-recruit" disabled={view.money < roster.recruitCost || roster.living >= roster.cap || !!view.over} onClick={() => order({ type: 'recruit', side: 'agency' })}>
            RECRUIT · {roster.recruitCost}
          </button>
        </div>
      </section>
    </div>
  );
}

/** The sheet over the city with its own header: which screen, the clock and funds, the other screens, and the way back. */
export function HqScreen() {
  const screen = useCity((s) => s.screen);
  const view = useCity((s) => s.view);
  const { openScreen, closeScreen } = useCity.getState();
  useEffect(() => {
    if (!screen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        closeScreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, closeScreen]);
  if (!screen || !view) return null;
  const c = cityQuery.clock(view);
  return (
    <div className="hq" data-testid="hq-screen" role="dialog" aria-modal="true" aria-label={SCREEN_NAME[screen]}>
      <div className="hq-sheet">
        <div className="console-bead" />
        <header className="hq-head">
          <div>
            <div className="hq-title" data-testid="hq-title">
              {SCREEN_NAME[screen]}
            </div>
            <div className="hint">{SCREEN_LINE[screen]}</div>
          </div>
          <div className="hq-head-right">
            <div className="num hq-status" data-testid="hq-status">
              ACT {view.act} · DAY {c.day + 1} · {String(c.hour).padStart(2, '0')}:{String(c.minute).padStart(2, '0')} · FUNDS {view.money}
              <span className="hq-held">
                <span className="lamp lamp-caution" /> THE CITY HOLDS STILL
              </span>
            </div>
            <div className="switch-row" role="group" aria-label="Headquarters screens">
              {CITY_SCREENS.map((sc) => (
                <button type="button" key={sc} className={`toggle tab ${screen === sc ? 'toggle-on' : ''}`} data-testid={`hq-go-${sc}`} aria-pressed={screen === sc} onClick={() => openScreen(sc)}>
                  {SCREEN_NAME[sc]}
                </button>
              ))}
              <button type="button" className="toggle toggle-alert" data-testid="hq-close" onClick={closeScreen}>
                BACK TO THE CITY
              </button>
            </div>
          </div>
        </header>
        {screen === 'lab' ? <LabScreen view={view} /> : screen === 'armoury' ? <ArmouryScreen view={view} /> : <SquadScreen view={view} />}
      </div>
    </div>
  );
}
