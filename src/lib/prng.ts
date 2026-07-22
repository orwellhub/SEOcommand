/**
 * Small deterministic PRNG (mulberry32) + helpers.
 *
 * Seed data must be identical on every build and every render (server and
 * client) so hydration never mismatches and screenshots are reproducible.
 * We therefore never call Math.random() in data generation.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rngFor(key: string): () => number {
  return mulberry32(hashString(key));
}

export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export function intBetween(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function floatBetween(rng: () => number, min: number, max: number, dp = 2): number {
  const v = rng() * (max - min) + min;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/** A gently trending series of `n` points around `base` with `volatility`. */
export function series(
  rng: () => number,
  n: number,
  base: number,
  volatility: number,
  driftPct = 0,
): number[] {
  const out: number[] = [];
  let v = base;
  const drift = (base * driftPct) / 100 / n;
  for (let i = 0; i < n; i++) {
    v += drift + (rng() - 0.5) * volatility;
    out.push(Math.max(0, Math.round(v)));
  }
  return out;
}
