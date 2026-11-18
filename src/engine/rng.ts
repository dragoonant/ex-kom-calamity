// ARCH-7: sfc32 whose four 32-bit words live in state.rng. Functions here take and return
// the word array; the tick code mutates the cloned state's array in place.

export type RngState = [number, number, number, number];

export function seedRng(seed: number): RngState {
  // Mix the seed into four words, then warm up (standard sfc32 practice).
  const s = seed >>> 0;
  const r: RngState = [s, (s ^ 0x9e3779b9) >>> 0, (s ^ 0x6a09e667) >>> 0, 1];
  for (let i = 0; i < 12; i++) nextU32(r);
  return r;
}

/** Advances the state in place and returns an unsigned 32-bit integer. */
export function nextU32(r: RngState): number {
  let a = r[0] | 0;
  let b = r[1] | 0;
  let c = r[2] | 0;
  let d = r[3] | 0;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  r[0] = a >>> 0;
  r[1] = b >>> 0;
  r[2] = c >>> 0;
  r[3] = d >>> 0;
  return t >>> 0;
}

/** Uniform integer in 0..n-1. */
export function nextInt(r: RngState, n: number): number {
  return Math.floor((nextU32(r) * n) / 4294967296);
}
