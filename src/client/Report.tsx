// End screen: an incident report form with a Copy report button (docs/presentation-concept.md; KB recipe.md
// step 6). Every number is query.outcome(state) on the final state kept in memory (SAV-5).
import { useMemo, useState } from 'react';
import { BATTLES } from '../data';
import { query } from '../engine';
import { useClient } from './store';

export function Report() {
  const report = useClient((s) => s.report);
  const closeReport = useClient((s) => s.closeReport);
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no');
  const o = useMemo(() => (report ? query.outcome(report) : null), [report]);
  if (!report || !o) return null;
  const name = BATTLES[report.battleId]?.name ?? report.battleId;
  const verdict =
    o.over?.winner === 'agency' ? 'BUILDING CLEARED' : o.over?.winner === 'hostile' ? 'SQUAD LOST' : o.over?.reason === 'withdrawn' ? 'SQUAD WITHDRAWN' : o.over?.reason === 'timeout' ? 'TIME LIMIT REACHED' : 'BOTH SIDES LOST';
  const lines = [
    `INCIDENT REPORT: ${name}`,
    `Result: ${verdict} (${o.over?.reason ?? 'unknown'}) at ${o.seconds.toFixed(1)} s`,
    `Seed ${report.seed}, tick ${o.tick}`,
    `Agents standing ${o.living.agency}, agents down ${o.score.agentsDown}`,
    `Hostiles down ${o.score.hostilesDown}, hostiles standing ${o.living.hostile}`,
    `Shots ${o.score.shotsFired}, hits ${o.score.hits}, civilian hits ${o.score.civilianHits}, citizens down ${o.score.civiliansDown}`,
    `Citizens taken ${o.score.taken}`,
  ];
  const copy = async () => {
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  };
  return (
    <div className="report-wrap" data-testid="report">
      <div className="report">
        <div className="report-head">
          <span className="stamp">CIVIL DEFENCE</span>
          <h2>INCIDENT REPORT</h2>
        </div>
        <table className="report-table num">
          <tbody>
            {lines.slice(1).map((l) => {
              const [k, ...rest] = l.split(': ');
              return (
                <tr key={l}>
                  <th>{rest.length ? k : ''}</th>
                  <td>{rest.length ? rest.join(': ') : k}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="verdict" data-testid="verdict">{verdict}</div>
        <div className="switch-row">
          <button type="button" className="toggle" data-testid="copy-report" onClick={copy}>
            {copied === 'yes' ? 'COPIED' : copied === 'failed' ? 'COPY FAILED, SELECT THE TEXT ABOVE' : 'COPY REPORT'}
          </button>
          <button type="button" className="toggle toggle-on" data-testid="close-report" onClick={closeReport}>
            RETURN TO CONSOLE
          </button>
        </div>
      </div>
    </div>
  );
}
