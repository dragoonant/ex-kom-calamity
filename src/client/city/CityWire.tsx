// The city wire (CWIRE-1..3): a news crawl across the top of the city view that carries the organism's slips
// (SIGN-2) instead of the message tray. Every building name on it is a button: it selects the building, opens its
// file card with WATCH and RAID, and brings the camera round (CWIRE-3). An organisation's or a district's name
// opens the list of its buildings (CWIRE-2). The crawl holds while the pointer or the keyboard is on it, while a
// list is open, and on the HOLD switch (for touch). Under reduced motion it stands still and scrolls by hand.
// No title attributes (KB rule 8).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { buildingsOf, districtName, orgName, wireParts, type TraySlip } from './text';
import { useCity } from './store';

/** How many of the newest slips run on the crawl at once. */
const SHOWN = 12;
/** Crawl speed in CSS pixels a second. */
const PX_PER_SECOND = 55;
/** A slip this young (in city ticks, 6 an hour) wears the NEW tab. */
const FRESH_TICKS = 6 * 6;
/** How long a touch on the crawl holds it. */
const TOUCH_HOLD_MS = 4000;

type ListOf = { link: 'org' | 'district'; id: string } | null;

function WireItem({ sl, live, fresh, onList }: { sl: TraySlip; live: boolean; fresh: boolean; onList: (l: ListOf) => void }) {
  const selected = useCity((s) => s.selected);
  const { focusBuilding } = useCity.getState();
  const tab = live ? 0 : -1;
  return (
    <span className={`wire-item wire-${sl.tone}`} data-testid={live ? 'wire-item' : undefined}>
      {fresh && <span className="wire-new">NEW</span>}
      <span className="wire-stamp num">{sl.stamp}</span>
      {wireParts(sl).map((p, i) =>
        'link' in p ? (
          p.link === 'building' ? (
            <button
              type="button"
              key={i}
              tabIndex={tab}
              className={`wire-link ${p.id === selected ? 'wire-link-picked' : ''}`}
              data-testid={live ? `wire-building-${p.id}` : undefined}
              onClick={() => focusBuilding(p.id)}
            >
              {p.text}
            </button>
          ) : (
            <button type="button" key={i} tabIndex={tab} className="wire-link wire-link-list" data-testid={live ? `wire-${p.link}-${p.id}` : undefined} onClick={() => onList({ link: p.link as 'org' | 'district', id: p.id })}>
              {p.text}
            </button>
          )
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

export function CityWire() {
  const wire = useCity((s) => s.wire);
  const tick = useCity((s) => s.view?.tick ?? 0);
  const selected = useCity((s) => s.selected);
  const { focusBuilding } = useCity.getState();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [held, setHeld] = useState(false);
  const [touched, setTouched] = useState(0);
  const [list, setList] = useState<ListOf>(null);
  // While the crawl holds, the slips under the pointer stay put; the newest ones join when it rolls again.
  const holding = hover || focus || held || touched > 0 || list !== null;
  const frozen = useRef<TraySlip[] | null>(null);
  if (holding && !frozen.current) frozen.current = wire;
  if (!holding) frozen.current = null;
  const items = (frozen.current ?? wire).slice(-SHOWN).reverse();
  const newest = items[0]?.id ?? 0;

  // A touch on the crawl holds it for a few seconds, so a finger can land on a name.
  useEffect(() => {
    if (!touched) return;
    const t = window.setTimeout(() => setTouched(0), TOUCH_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [touched]);

  const win = useRef<HTMLDivElement>(null);
  const half = useRef<HTMLDivElement>(null);
  const [seconds, setSeconds] = useState(40);
  const [minWidth, setMinWidth] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      // Each copy is at least as wide as the window, so a short crawl leaves the screen before it comes round again.
      const ww = win.current?.clientWidth ?? 0;
      const w = Math.max(half.current?.scrollWidth ?? 0, ww);
      setMinWidth(ww);
      if (w > 0) setSeconds(Math.max(12, w / PX_PER_SECOND));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [newest, items.length]);

  const copy = (live: boolean) => (
    <div className="wire-half" ref={live ? half : undefined} aria-hidden={live ? undefined : true} style={{ minWidth }}>
      {items.map((sl) => (
        <WireItem key={sl.id} sl={sl} live={live} fresh={tick - sl.tick <= FRESH_TICKS} onList={setList} />
      ))}
    </div>
  );

  return (
    <div className="wire" data-testid="city-wire" role="region" aria-label="City wire">
      <div className="wire-tag">
        <span className="wire-lamp" />
        CITY WIRE
      </div>
      <div
        className="wire-window"
        ref={win}
        onPointerDown={(e) => e.pointerType !== 'mouse' && setTouched(Date.now())}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false);
        }}
      >
        {items.length === 0 ? (
          <div className="wire-quiet">Nothing on the wire yet. Odd goings-on across the city run here as they come in.</div>
        ) : (
          // Two copies side by side roll left by one copy's width, so the loop has no seam. Keyed by the newest
          // slip, so a new report starts the crawl again with itself at the front.
          <div key={newest} className={`wire-track ${holding ? 'wire-track-held' : ''}`} style={{ animationDuration: `${seconds}s` }} data-testid="wire-track">
            {copy(true)}
            {copy(false)}
          </div>
        )}
      </div>
      <button type="button" className={`wire-hold ${held ? 'toggle-on' : ''}`} data-testid="wire-hold" aria-pressed={held} onClick={() => setHeld(!held)}>
        {held ? 'ROLL' : 'HOLD'}
      </button>
      {list && (
        <div className="wire-list" data-testid="wire-list" role="dialog" aria-label={list.link === 'org' ? orgName(list.id) : districtName(list.id)}>
          <div className="wire-list-title">
            {(list.link === 'org' ? orgName(list.id) : districtName(list.id)).toUpperCase()}
            {list.link === 'org' ? ': ITS BUILDINGS' : ': BUILDINGS IN THE DISTRICT'}
          </div>
          <div className="wire-list-row">
            {buildingsOf(list.link, list.id).map((b) => (
              <button
                type="button"
                key={b.id}
                className={`toggle wire-list-pick ${b.id === selected ? 'toggle-on' : ''}`}
                data-testid={`wire-pick-${b.id}`}
                onClick={() => {
                  focusBuilding(b.id);
                  setList(null);
                }}
              >
                {b.name.toUpperCase()}
              </button>
            ))}
            <button type="button" className="toggle" data-testid="wire-list-close" onClick={() => setList(null)}>
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
