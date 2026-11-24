// sfc32 kept in the state (ARCH-5). `next` mutates the tuple it is given; step() only calls it on its own copy.
export type Rng = [number, number, number, number];

export function seedRng(seed: number): Rng {
  const r: Rng = [0x9e3779b9, 0x243f6a88, 0xb7e15162, seed >>> 0];
  for (let i = 0; i < 15; i++) next(r);
  return r;
}

export function next(r: Rng): number {
  let [a, b, c, d] = r;
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  let t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  t = (t + d) | 0;
  c = (c + t) | 0;
  r[0] = a >>> 0; r[1] = b >>> 0; r[2] = c >>> 0; r[3] = d >>> 0;
  return (t >>> 0) / 4294967296;
}

/** FNV-1a over the JSON text: the replay hash (ARCH-5). */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
