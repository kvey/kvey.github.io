// Tiny seedable RNG (mulberry32) and helpers.

export function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function rngInt(rng, min, max) {
  return Math.floor(min + rng() * (max - min + 1));
}

export function rngPick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function rngChance(rng, p) {
  return rng() < p;
}

// Hash-based deterministic sub-seed
export function subSeed(seed, salt) {
  let h = (seed ^ (salt * 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
