import { key, neighbors, distance, range as hexRange } from '../hex/hex.js';
import { findPath } from '../hex/pathfind.js';
import { WORLD_TERRAIN, worldTerrain, ROAD_SPEEDUP, SETTLEMENTS, settlementName } from '../data/worldTerrain.js';

/** Smoothstep-interpolated value noise over a coarse random grid. */
function makeNoise(rng, gw, gh) {
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  const smooth = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * (gw - 1);
    const y = v * (gh - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(gw - 1, x0 + 1);
    const y1 = Math.min(gh - 1, y0 + 1);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const a = g[y0 * gw + x0];
    const b = g[y0 * gw + x1];
    const c = g[y1 * gw + x0];
    const d = g[y1 * gw + x1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
}

/** Sum of a few noise octaves - broad shapes plus fine detail. */
function fbm(rng, octaves = 4) {
  const layers = [];
  for (let o = 0; o < octaves; o++) {
    layers.push({ n: makeNoise(rng, 3 + o * 4, 3 + o * 4), amp: 1 / (o + 1) });
  }
  const total = layers.reduce((s, l) => s + l.amp, 0);
  return (u, v) => layers.reduce((s, l) => s + l.n(u, v) * l.amp, 0) / total;
}

/**
 * The overworld: one landmass of hex regions, its settlements and the roads
 * between them. Uses the same axial hex maths as the battlefield, just at a
 * coarser scale where one tile is a day's march rather than a step.
 */
export class World {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.tiles = new Map();
    this.settlements = [];
    this.camps = [];
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const h = { q: col, r: row - ((col - (col & 1)) >> 1) };
        this.tiles.set(key(h), { hex: h, col, row, terrain: 'ocean', road: false, settlement: null, decor: 0 });
      }
    }
  }

  get(h) { return this.tiles.get(key(h)); }
  has(h) { return this.tiles.has(key(h)); }
  all() { return [...this.tiles.values()]; }
  terrainAt(h) { return worldTerrain(this.get(h)?.terrain); }
  passable(h) { const t = this.get(h); return !!t && worldTerrain(t.terrain).passable; }

  /** Hours to enter this tile, halved where a road runs through it. */
  travelCost(h) {
    const t = this.get(h);
    if (!t) return null;
    const def = worldTerrain(t.terrain);
    if (!def.passable) return null;
    return def.travel * (t.road ? ROAD_SPEEDUP : 1);
  }

  /** Path context shared by the company, roaming bands and the road builder. */
  pathContext() {
    return { costOf: (h) => { const c = this.travelCost(h); return c == null ? null : { ap: c, fat: 0 }; } };
  }

  findPath(from, to) { return findPath(from, to, this.pathContext()); }

  // ---------------------------------------------------------------- generation
  generate(rng) {
    const elevation = fbm(rng, 4);
    const moisture = fbm(rng, 3);

    for (const t of this.all()) {
      const u = t.col / (this.cols - 1);
      const v = t.row / (this.rows - 1);
      // Push the coast inwards at the borders so the land reads as one island.
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const falloff = Math.min(1, edge / 0.18);
      const e = elevation(u, v) * 0.72 + 0.28 * falloff - (1 - falloff) * 0.35;
      const m = moisture(u, v);
      t.elev = e;
      t.terrain = classify(e, m);
    }

    this.despeckle();
    this.placeSettlements(rng);
    this.buildRoads();
    this.placeCamps(rng);
    for (const t of this.all()) t.decor = rng.next();
    return this;
  }

  /** Remove single-tile islands and lakes; they read as noise, not geography. */
  despeckle() {
    for (const t of this.all()) {
      const ns = neighbors(t.hex).map((h) => this.get(h)).filter(Boolean);
      if (!ns.length) continue;
      const water = ns.filter((n) => !worldTerrain(n.terrain).passable).length;
      if (worldTerrain(t.terrain).passable && water === ns.length) t.terrain = 'shallows';
      if (!worldTerrain(t.terrain).passable && water === 0) t.terrain = 'plains';
    }
  }

  placeSettlements(rng) {
    const used = new Set();
    const candidates = this.all().filter((t) => ['plains', 'steppe', 'beach'].includes(t.terrain)
      && t.col > 2 && t.col < this.cols - 3 && t.row > 1 && t.row < this.rows - 2);
    if (!candidates.length) return;

    const target = Math.max(4, Math.round(this.cols * this.rows / 90));
    const shuffled = rng.shuffle(candidates);

    for (const t of shuffled) {
      if (this.settlements.length >= target) break;
      // Keep them a few days' march apart so travel actually matters.
      if (this.settlements.some((s) => distance(s.hex, t.hex) < 5)) continue;

      const tier = this.settlements.length === 0 ? SETTLEMENTS.city
        : rng.chance(30) ? SETTLEMENTS.town : SETTLEMENTS.village;
      const s = {
        id: `s${this.settlements.length}`,
        name: settlementName(rng, used),
        tier: tier.id,
        hex: t.hex,
        tile: t,
      };
      t.settlement = s;
      this.settlements.push(s);

      // Farmland fans out around anything bigger than a hamlet.
      if (tier.size > 1) {
        for (const h of hexRange(t.hex, tier.size - 1)) {
          const n = this.get(h);
          if (n && ['plains', 'steppe'].includes(n.terrain)) n.terrain = 'farmland';
        }
      }
    }
  }

  /** Link every settlement to its two nearest neighbours. */
  buildRoads() {
    for (const a of this.settlements) {
      const others = this.settlements
        .filter((b) => b !== a)
        .sort((x, y) => distance(a.hex, x.hex) - distance(a.hex, y.hex))
        .slice(0, 2);
      for (const b of others) {
        const path = this.findPath(a.hex, b.hex);
        if (!path) continue;
        for (const h of path) {
          const t = this.get(h);
          if (t && worldTerrain(t.terrain).passable) t.road = true;
        }
      }
    }
  }

  /** Bandit camps hide in rough country, well away from the roads. */
  placeCamps(rng) {
    const spots = this.all().filter((t) => ['forest', 'hills', 'swamp', 'mountain'].includes(t.terrain)
      && !t.road && !t.settlement
      && this.settlements.every((s) => distance(s.hex, t.hex) >= 3));
    const count = Math.max(2, Math.round(this.settlements.length * 0.8));
    for (const t of rng.shuffle(spots).slice(0, count)) {
      if (this.camps.some((c) => distance(c.hex, t.hex) < 4)) continue;
      const camp = { id: `c${this.camps.length}`, hex: t.hex, tile: t, strength: rng.int(1, 3) };
      this.camps.push(camp);
      t.camp = camp;
    }
  }

  /** A settlement to start the company at - the largest one available. */
  startingSettlement() {
    return this.settlements.slice().sort((a, b) =>
      SETTLEMENTS[b.tier].size - SETTLEMENTS[a.tier].size)[0] || null;
  }
}

function classify(e, m) {
  if (e < 0.30) return 'ocean';
  if (e < 0.36) return 'shallows';
  if (e < 0.41) return 'beach';
  if (e > 0.82) return 'peak';
  if (e > 0.70) return 'mountain';
  if (e > 0.58) return 'hills';
  if (m > 0.62 && e < 0.48) return 'swamp';
  if (m > 0.52) return 'forest';
  if (m > 0.34) return 'plains';
  return 'steppe';
}

export { WORLD_TERRAIN, worldTerrain, SETTLEMENTS };
