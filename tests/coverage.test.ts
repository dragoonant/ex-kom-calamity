import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
// Every rule id in the spec has a test named by it (KB rule 2).
it('every spec rule id has a test', () => {
  const spec = readFileSync('docs/spec/10-rules.md', 'utf8');
  const ids = [...spec.matchAll(/^- \*\*([A-Z]+-\d+)\*\*/gm)].map((m) => m[1]!);
  const tests = readFileSync('tests/rules.test.ts', 'utf8');
  const missing = ids.filter((id) => !tests.includes(`'${id} `));
  expect(ids.length).toBeGreaterThan(30);
  expect(missing).toEqual([]);
});
