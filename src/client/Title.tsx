// Title screen: a flat-colour skyline poster under the console; menu items are labelled toggle switches
// (docs/presentation-concept.md). The title is a placeholder (PLAN.md D10, Q2). Continue names what it
// reopens (SAV-4); an unreadable save says why and offers Discard (SAV-6); the start switch waits for the
// model preload and says so (KB rule 26).
import { useEffect, useState } from 'react';
import { BATTLES, MAPS, RAID_SITES } from '../data';
import { useClient } from './store';
import { useCity } from './city/store';

/** MAP-10: the title offers each raid site with its building and floor count (M7 will pick from the alert). */
const SITES = RAID_SITES.map((id) => {
  const b = MAPS[BATTLES[id]!.map]!.buildings![0]!;
  return { id, building: b.name.toUpperCase(), floors: b.floors };
});

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function Title() {
  const summary = useClient((s) => s.continueSummary);
  const loadError = useClient((s) => s.loadError);
  const modelsReady = useClient((s) => s.modelsReady);
  const modelsLoaded = useClient((s) => s.modelsLoaded);
  const modelsTotal = useClient((s) => s.modelsTotal);
  const { newBattle, continueBattle, discardSave, refreshTitle } = useClient.getState();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const campaign = useCity((s) => s.summary);
  const campaignError = useCity((s) => s.loadError);
  const city = useCity.getState();
  useEffect(() => {
    refreshTitle();
    useCity.getState().refresh();
  }, [refreshTitle]);

  return (
    <div className="title" data-testid="title">
      <div className="poster" aria-hidden="true">
        <div className="sky" />
        <div className="skyline">
          {[7, 11, 5, 14, 9, 17, 6, 12, 8, 15, 10, 4, 13].map((h, i) => (
            <span key={i} className="tower" style={{ height: `${h * 5 + 10}%`, width: `${5 + (i % 3)}%` }} />
          ))}
        </div>
      </div>
      <div className="console console-title">
        <div className="console-bead" />
        <div className="title-block">
          <h1 className="title-name">CITY OF TOMORROW</h1>
          <div className="title-sub">(working title) · Civil Defence switchboard</div>
        </div>
        <div className="title-switches">
          <div className="title-campaign" data-testid="campaign">
            <button type="button" className="toggle toggle-big toggle-on" data-testid="campaign-new" onClick={() => city.start()}>
              NEW CAMPAIGN: THE CITY
            </button>
            {campaign && (
              <>
                <button type="button" className="toggle toggle-big" data-testid="campaign-continue" onClick={() => city.resume()}>
                  CONTINUE CAMPAIGN
                </button>
                <div className="continue-summary num" data-testid="campaign-summary">
                  Day {campaign.day}, funds {campaign.money}, confidence {campaign.confidence}, {campaign.agents} agents. Saved {fmtWhen(campaign.savedAt)}.
                </div>
              </>
            )}
            {campaignError && (
              <div className="error-band" data-testid="campaign-error">
                <div>The saved campaign cannot be reopened: {campaignError}.</div>
                <button type="button" className="toggle toggle-alert" onClick={() => city.discard()}>
                  DISCARD IT
                </button>
              </div>
            )}
          </div>
          {modelsReady ? (
            <div className="site-switches" role="group" aria-label="Raid site" data-testid="sites">
              {SITES.map((site) => (
                <button type="button" key={site.id} className="toggle toggle-big site-switch" data-testid={`start-${site.id}`} onClick={() => newBattle(site.id)}>
                  <span>RAID {site.building}</span>
                  <span className="site-floors num">{site.floors} {site.floors === 1 ? 'FLOOR' : 'FLOORS'} + ROOF</span>
                </button>
              ))}
            </div>
          ) : (
            <button type="button" className="toggle toggle-big" data-testid="loading" disabled>
              LOADING MODELS {modelsLoaded}/{modelsTotal}
            </button>
          )}
          {summary && (
            <div className="continue-box" data-testid="continue-box">
              <button type="button" className="toggle toggle-big toggle-on" data-testid="continue" onClick={() => continueBattle()}>
                CONTINUE
              </button>
              <div className="continue-summary num" data-testid="continue-summary">
                {summary.battleName}, {summary.seconds.toFixed(1)} s in, paused. Agents standing {summary.agentsStanding}/{summary.agentsTotal}, hostiles down {summary.hostilesDown}. Saved {fmtWhen(summary.savedAt)}.
              </div>
              {confirmDiscard ? (
                <div className="switch-row">
                  <button type="button" className="toggle toggle-alert" data-testid="discard-confirm" onClick={() => { discardSave(); setConfirmDiscard(false); }}>
                    DISCARD THE SAVED RAID
                  </button>
                  <button type="button" className="toggle" onClick={() => setConfirmDiscard(false)}>
                    KEEP IT
                  </button>
                </div>
              ) : (
                <button type="button" className="toggle" data-testid="discard" onClick={() => setConfirmDiscard(true)}>
                  DISCARD
                </button>
              )}
            </div>
          )}
          {loadError && (
            <div className="error-band" data-testid="load-error">
              <div>The saved raid cannot be reopened: {loadError}.</div>
              <button type="button" className="toggle toggle-alert" data-testid="discard-broken" onClick={() => discardSave()}>
                DISCARD IT
              </button>
            </div>
          )}
        </div>
        <div className="title-foot">
          Real time with pause. Space pauses, 1 to 6 pick an agent and again centre on them, B arms a charge, C crouches, R or Shift-click runs, PgUp and PgDn change floor; wheel zooms, right-drag turns, middle-drag or WASD pans. Hostiles fight back: hosts ambush, takers hunt, fighters breach. Each raid is one building; when two hostiles are left, the switchboard marks where they are. The campaign runs the city: read the switchboard's slips, send agents to watch, raid what they confirm, and fight the raid yourself or let the squad handle it. Early build M6: the city's first act; single raids below.
        </div>
      </div>
    </div>
  );
}
