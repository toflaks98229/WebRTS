// Axial hex coordinates (q, r) with flat-top orientation.
// Cube form is derived as (x=q, z=r, y=-q-r) for distance / rounding math.

export const DIRS = [
  { q: +1, r: 0 }, { q: +1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: +1 }, { q: 0, r: +1 },
];

export function hex(q, r) { return { q, r }; }
export function key(h) { return h.q + ',' + h.r; }
export function fromKey(k) { const [q, r] = k.split(',').map(Number); return { q, r }; }
export function eq(a, b) { return !!a && !!b && a.q === b.q && a.r === b.r; }
export function add(a, b) { return { q: a.q + b.q, r: a.r + b.r }; }
export function sub(a, b) { return { q: a.q - b.q, r: a.r - b.r }; }

export function neighbor(h, dir) { return add(h, DIRS[dir]); }
export function neighbors(h) { return DIRS.map((d) => add(h, d)); }

export function distance(a, b) {
  const dq = a.q - b.q, dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/** Direction index 0..5 from `a` towards `b`, used for facing / knockback. */
export function directionTo(a, b) {
  const d = sub(b, a);
  let best = 0, bestDot = -Infinity;
  for (let i = 0; i < 6; i++) {
    const dot = DIRS[i].q * d.q + DIRS[i].r * d.r + (DIRS[i].q + DIRS[i].r) * (d.q + d.r) * 0.5;
    if (dot > bestDot) { bestDot = dot; best = i; }
  }
  return best;
}

function cubeRound(x, y, z) {
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

export function round(q, r) { return cubeRound(q, -q - r, r); }

/** Straight line of hexes from a to b, inclusive. Used for line-of-sight. */
export function line(a, b) {
  const n = distance(a, b);
  if (n === 0) return [{ q: a.q, r: a.r }];
  const ax = a.q, az = a.r, ay = -ax - az;
  const bx = b.q, bz = b.r, by = -bx - bz;
  const out = [];
  // Nudge to avoid landing exactly on hex edges.
  const e = 1e-6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(round(
      ax + (bx - ax) * t + e,
      az + (bz - az) * t + e,
    ));
  }
  void ay; void by;
  return out;
}

/** All hexes within `radius` of center (inclusive). */
export function range(center, radius) {
  const out = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) out.push({ q: center.q + dq, r: center.r + dr });
  }
  return out;
}
