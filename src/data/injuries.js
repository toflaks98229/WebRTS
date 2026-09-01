/**
 * Lasting wounds.
 *
 * Hit points come back on their own; these do not. A wound stays on the man
 * until someone with the training takes it off him, and only two kinds of place
 * on the map have that: a town keeps a herbalist who can deal with the light
 * ones, and the city keeps a surgeon who can deal with anything. A village can
 * offer a bed and nothing else.
 *
 * That is the whole point of the system. A mauled company cannot simply sit
 * down wherever it stands and wait - it has to cross the map to a specific
 * place, and every day of that walk is a day the country gets worse.
 */

/** What a wound costs to take off, by how bad it is. */
export const SEVERITY = {
  1: { id: 1, name: '경상', healer: 1, cost: 140, days: 2 },
  2: { id: 2, name: '중상', healer: 2, cost: 520, days: 5 },
};

/**
 * `stat` is read by the unit's getters; `value` is added, so a multiplier-style
 * effect like a ruined grip is written as the fraction it takes away.
 */
export const INJURIES = {
  brokenArm: {
    id: 'brokenArm', name: '부러진 팔', icon: '🦴', severity: 2,
    stat: 'melee', value: -10, desc: '근접 숙련 −10',
  },
  lostEye: {
    id: 'lostEye', name: '잃은 눈', icon: '👁', severity: 2,
    stat: 'ranged', value: -15, desc: '원거리 숙련 −15',
  },
  limp: {
    id: 'limp', name: '절뚝임', icon: '🦵', severity: 2,
    stat: 'ap', value: -1, desc: '최대 행동력 −1',
  },
  crackedRibs: {
    id: 'crackedRibs', name: '깨진 갈비', icon: '🩹', severity: 1,
    stat: 'fatigue', value: -15, desc: '최대 피로 −15',
  },
  cutHand: {
    id: 'cutHand', name: '베인 손', icon: '🩸', severity: 1,
    stat: 'shield', value: -0.25, desc: '방패 방어 −25%',
  },
  headWound: {
    id: 'headWound', name: '머리 부상', icon: '🤕', severity: 1,
    stat: 'resolve', value: -10, desc: '결의 −10',
  },
  tornThigh: {
    id: 'tornThigh', name: '찢긴 허벅지', icon: '🩼', severity: 1,
    stat: 'move', value: 1, desc: '이동 비용 +1',
  },
  wrenchedShoulder: {
    id: 'wrenchedShoulder', name: '뒤틀린 어깨', icon: '💢', severity: 1,
    stat: 'initiative', value: -15, desc: '주도권 −15',
  },
};

export function injury(id) { return INJURIES[id] || null; }
export function severityOf(inj) { return SEVERITY[inj.severity] || SEVERITY[1]; }

/** Total effect on one stat from everything a fighter is carrying. */
export function injuryMod(unit, stat) {
  if (!unit.injuries || !unit.injuries.size) return 0;
  let total = 0;
  for (const id of unit.injuries) {
    const inj = INJURIES[id];
    if (inj && inj.stat === stat) total += inj.value;
  }
  return total;
}

/** A wound this fighter does not already have, or null when they have them all. */
export function rollInjury(rng, unit) {
  const open = Object.values(INJURIES).filter((i) => !unit.injuries.has(i.id));
  return open.length ? rng.pick(open) : null;
}

/**
 * How good the help is in a settlement: the city keeps a surgeon, a town keeps
 * a herbalist, a village keeps neither.
 */
export function healerLevel(tierSize) { return Math.max(0, (tierSize | 0) - 1); }

export function healerName(level) {
  return ['없음', '약초상', '외과의'][Math.min(2, Math.max(0, level))];
}

/** Whether this place can take that wound off a man. */
export function canTreat(inj, healer) { return healer >= severityOf(inj).healer; }
