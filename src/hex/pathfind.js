import { neighbors, key, distance } from './hex.js';

/** Extra cost paid for stepping out of a tile that an enemy threatens. */
export const ZOC_AP_PENALTY = 2;
export const ZOC_FATIGUE_PENALTY = 5;

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node) {
    this.a.push(node);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.a[p].ap <= this.a[i].ap) break;
      [this.a[p], this.a[i]] = [this.a[i], this.a[p]];
      i = p;
    }
  }
  pop() {
    const top = this.a[0];
    const last = this.a.pop();
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let s = i;
        if (l < this.a.length && this.a[l].ap < this.a[s].ap) s = l;
        if (r < this.a.length && this.a[r].ap < this.a[s].ap) s = r;
        if (s === i) break;
        [this.a[s], this.a[i]] = [this.a[i], this.a[s]];
        i = s;
      }
    }
    return top;
  }
}

/**
 * Dijkstra over the hex grid, bounded by AP and fatigue budgets.
 * `ctx.costOf(to, from)` returns `{ ap, fat }` or null when the tile cannot be
 * entered; `from` lets it price climbing.
 * `ctx.inZOC(hex)` marks tiles threatened by an enemy.
 *
 * @returns {Map<string, {hex, ap, fat, from}>} reachable tiles keyed by hex key.
 */
export function reachable(start, budgetAP, budgetFat, ctx) {
  const seen = new Map();
  const startNode = { hex: start, ap: 0, fat: 0, from: null };
  seen.set(key(start), startNode);

  const heap = new Heap();
  heap.push(startNode);

  while (heap.size) {
    const cur = heap.pop();
    if (cur.ap > (seen.get(key(cur.hex))?.ap ?? Infinity)) continue;

    const leavingZOC = ctx.inZOC(cur.hex);
    for (const nb of neighbors(cur.hex)) {
      const step = ctx.costOf(nb, cur.hex);
      if (!step) continue;

      let ap = cur.ap + step.ap;
      let fat = cur.fat + step.fat;
      if (leavingZOC) { ap += ZOC_AP_PENALTY; fat += ZOC_FATIGUE_PENALTY; }
      if (ap > budgetAP || fat > budgetFat) continue;

      const k = key(nb);
      const prev = seen.get(k);
      if (prev && (prev.ap < ap || (prev.ap === ap && prev.fat <= fat))) continue;

      const node = { hex: nb, ap, fat, from: cur.hex };
      seen.set(k, node);
      heap.push(node);
    }
  }
  seen.delete(key(start));
  return seen;
}

/**
 * Walk a `reachable` result backwards into an ordered list of hexes.
 * The start tile is not included; the last entry is `target`.
 */
export function pathTo(map, start, target) {
  const out = [];
  let cur = map.get(key(target));
  if (!cur) return null;
  while (cur) {
    out.push(cur.hex);
    if (!cur.from || key(cur.from) === key(start)) break;
    cur = map.get(key(cur.from));
  }
  out.reverse();
  return out;
}

/**
 * Unbounded A* used by the AI to find an approach route even when the target
 * is further than a single turn of movement.
 */
export function findPath(start, goal, ctx) {
  const open = new Heap();
  const gScore = new Map([[key(start), 0]]);
  const cameFrom = new Map();
  open.push({ hex: start, ap: distance(start, goal) });

  const goalKey = key(goal);
  let guard = 20000;
  while (open.size && guard-- > 0) {
    const cur = open.pop();
    const ck = key(cur.hex);
    if (ck === goalKey) break;

    for (const nb of neighbors(cur.hex)) {
      const nk = key(nb);
      const step = nk === goalKey ? { ap: 1, fat: 0 } : ctx.costOf(nb, cur.hex);
      if (!step) continue;
      const tentative = (gScore.get(ck) ?? Infinity) + step.ap;
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;
      gScore.set(nk, tentative);
      cameFrom.set(nk, cur.hex);
      open.push({ hex: nb, ap: tentative + distance(nb, goal) * 2 });
    }
  }

  if (!cameFrom.has(goalKey) && key(start) !== goalKey) return null;
  const path = [goal];
  let k = goalKey;
  while (cameFrom.has(k)) {
    const p = cameFrom.get(k);
    path.push(p);
    k = key(p);
    if (path.length > 500) break;
  }
  path.reverse();
  return path;
}
