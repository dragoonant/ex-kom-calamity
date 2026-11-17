import { describe, expect, it } from 'vitest';
import { initialState, legalActions, step } from '../src/engine';

describe('engine seam (M0 stub)', () => {
  it('step is pure and a tick advances time', () => {
    const s = initialState(1);
    const r = step(s, { type: 'tick' });
    expect(r.ok).toBe(true);
    expect(r.state.tick).toBe(1);
    expect(s.tick).toBe(0);
  });
  it('state is plain JSON', () => {
    const s = step(initialState(7), { type: 'tick' }).state;
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
  it('legalActions is never empty', () => {
    expect(legalActions(initialState(1)).length).toBeGreaterThan(0);
  });
});
