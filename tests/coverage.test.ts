import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// KB lesson (project-x, 2026-11-08): a spec-id coverage test keeps the suite honest. Every
// `**ID-n**` in docs/spec/10-rules.md must appear in the name of at least one test.
describe('Spec coverage', () => {
  it.each([
    ['docs/spec/10-rules.md', 90],
    ['docs/spec/20-city.md', 80],
  ])('every rule id in %s is named by a test', (file, least) => {
    const spec = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const ids = [...new Set([...spec.matchAll(/\*\*([A-Z]+-\d+)\*\*/g)].map((m) => m[1]!))];
    expect(ids.length).toBeGreaterThan(least);
    const dir = new URL('./', import.meta.url);
    const names: string[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.test.ts')) continue;
      const text = readFileSync(new URL(f, dir), 'utf8');
      for (const m of text.matchAll(/\bit\(\s*'([^']+)'/g)) names.push(m[1]!);
      for (const m of text.matchAll(/\bit\(\s*"([^"]+)"/g)) names.push(m[1]!);
    }
    const joined = names.join('\n');
    const missing = ids.filter((id) => !new RegExp(`\\b${id}\\b`).test(joined));
    expect(missing, `rule ids without a test: ${missing.join(', ')}`).toEqual([]);
  });
});
