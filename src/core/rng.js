/** Deterministic RNG (mulberry32) so battles can be replayed / debugged from a seed. */
export class RNG {
  constructor(seed = Date.now() >>> 0) { this.seed = seed >>> 0; }

  next() {
    this.seed = (this.seed + 0x6D2B79F5) >>> 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  float(min, max) { return min + this.next() * (max - min); }
  /** Percent roll: true if a d100 comes in at or under `chance`. */
  chance(percent) { return this.next() * 100 < percent; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

export const rng = new RNG();
