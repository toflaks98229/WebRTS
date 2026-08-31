import { key, neighbors, distance, range as hexRange, line } from '../hex/hex.js';
import { terrain, TERRAIN } from '../data/terrain.js';

/** Cost of climbing one height level. */
export const CLIMB_AP = 2;
export const CLIMB_FATIGUE = 3;

/** Battlefield: a rectangular block of flat-top hexes in odd-q offset layout. */
export class Grid {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.tiles = new Map();
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const h = Grid.fromOffset(col, row);
        this.tiles.set(key(h), { hex: h, col, row, terrain: 'grass', elev: 0, decor: 0 });
      }
    }
  }

  static fromOffset(col, row) {
    return { q: col, r: row - ((col - (col & 1)) >> 1) };
  }

  get(h) { return this.tiles.get(key(h)); }
  has(h) { return this.tiles.has(key(h)); }
  terrainAt(h) { return terrain(this.get(h)?.terrain); }
  passable(h) { const t = this.get(h); return !!t && terrain(t.terrain).passable; }
  /** Height-map level of a tile (0-3). Drives cover, hit bonus and climb cost. */
  elevation(h) { const t = this.get(h); return t ? t.elev : 0; }

  /** Extra AP/fatigue for climbing from `from` up to `to`. Descending is free. */
  climbCost(from, to) {
    const up = Math.max(0, this.elevation(to) - this.elevation(from));
    return up ? { ap: up * CLIMB_AP, fat: up * CLIMB_FATIGUE } : { ap: 0, fat: 0 };
  }
  all() { return [...this.tiles.values()]; }

  /**
   * Blocked by sight-blocking terrain, or by ground that rises above both ends
   * of the line - you cannot shoot through a ridge.
   */
  hasLineOfSight(a, b) {
    if (distance(a, b) <= 1) return true;
    const crest = Math.max(this.elevation(a), this.elevation(b));
    const path = line(a, b);
    for (let i = 1; i < path.length - 1; i++) {
      const t = this.get(path[i]);
      if (!t) return false;
      if (terrain(t.terrain).blocksLOS) return false;
      if (t.elev > crest) return false;
    }
    return true;
  }

  /** Procedurally scatter terrain features across the field. */
  generate(rng, biome = 'plains') {
    const blobs = {
      plains: [['forest', 3, 2], ['hill', 2, 2], ['rock', 3, 1]],
      forest: [['forest', 7, 3], ['rock', 2, 1], ['swamp', 2, 2]],
      swamp:  [['swamp', 6, 3], ['forest', 3, 2], ['water', 2, 2]],
      hills:  [['hill', 5, 3], ['rock', 4, 2], ['forest', 2, 2]],
    }[biome] || [];

    for (const t of this.all()) t.terrain = biome === 'swamp' ? 'dirt' : 'grass';

    for (const [type, count, size] of blobs) {
      for (let i = 0; i < count; i++) {
        const origin = rng.pick(this.all()).hex;
        for (const h of hexRange(origin, rng.int(1, size))) {
          const t = this.get(h);
          if (!t) continue;
          // Keep the deployment columns clear so nobody spawns inside a rock.
          if (t.col < 2 || t.col > this.cols - 3) continue;
          if (rng.chance(72)) t.terrain = type;
        }
      }
    }

    for (const t of this.all()) t.decor = rng.next();
    this.generateHeight(rng);
    this.ensureConnected(rng);
    return this;
  }

  /**
   * Raise a few rounded ridges, then smooth so no two neighbours differ by more
   * than one level - a battlefield of sheer cliffs would just break pathing.
   */
  generateHeight(rng) {
    for (const t of this.all()) t.elev = 0;

    for (let i = 0, blobs = rng.int(3, 6); i < blobs; i++) {
      const origin = rng.pick(this.all()).hex;
      const radius = rng.int(2, 4);
      for (const h of hexRange(origin, radius)) {
        const t = this.get(h);
        if (!t) continue;
        // Each ring inward adds another level, so blobs come out as rounded hills.
        const lift = radius - distance(origin, h);
        if (lift <= 0) continue;
        if (rng.chance(80)) t.elev = Math.min(3, t.elev + 1);
        if (lift >= 2 && rng.chance(55)) t.elev = Math.min(3, t.elev + 1);
      }
    }

    for (const t of this.all()) {
      if (t.terrain === 'rock') t.elev = Math.min(3, t.elev + 1);
      if (t.terrain === 'water' || t.terrain === 'swamp') t.elev = 0;
      // Deployment zones stay gentle so neither side starts stranded on a peak.
      if (t.col < 2 || t.col > this.cols - 3) t.elev = Math.min(t.elev, 1);
    }

    for (let pass = 0; pass < 4; pass++) {
      for (const t of this.all()) {
        for (const nb of neighbors(t.hex)) {
          const n = this.get(nb);
          if (n && t.elev - n.elev > 1) n.elev = t.elev - 1;
        }
      }
    }

    // Let the ground cover follow the height so the art reads correctly.
    for (const t of this.all()) {
      if (t.elev >= 1 && (t.terrain === 'grass' || t.terrain === 'dirt')) t.terrain = 'hill';
      if (t.elev === 0 && t.terrain === 'hill') t.terrain = 'grass';
    }
  }

  /** Flood fill from the left deployment zone; carve anything unreachable. */
  ensureConnected(rng) {
    const start = this.all().find((t) => t.col === 0 && this.passable(t.hex));
    if (!start) return;
    const seen = new Set([key(start.hex)]);
    const queue = [start.hex];
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of neighbors(cur)) {
        const k = key(nb);
        if (seen.has(k) || !this.passable(nb)) continue;
        seen.add(k);
        queue.push(nb);
      }
    }
    for (const t of this.all()) {
      if (!seen.has(key(t.hex)) && !TERRAIN[t.terrain].passable) {
        t.terrain = rng.chance(50) ? 'grass' : 'dirt';
      }
    }
  }
}
