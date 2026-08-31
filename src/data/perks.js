/**
 * Perk catalogue. Perks are deliberately *not* a generic effect engine - each
 * one is read explicitly at the place it matters (combat maths, unit getters,
 * movement cost), so what a perk does is greppable from its id.
 *
 * `tier` is the level a brother must reach before the row opens.
 */
export const PERKS = {
  // ---- tier 1 ---------------------------------------------------------
  brawny: {
    id: 'brawny', tier: 1, name: '강골', icon: '💪',
    desc: '최대 피로도 +15%. 장비가 매기는 피로 부담을 20% 덜 받는다.',
  },
  colossus: {
    id: 'colossus', tier: 1, name: '거구', icon: '🗿',
    desc: '최대 체력 +20%.',
  },
  steelBrow: {
    id: 'steelBrow', tier: 1, name: '무쇠 이마', icon: '🪖',
    desc: '머리에 맞는 피해를 25% 덜 받는다.',
  },
  pathfinder: {
    id: 'pathfinder', tier: 1, name: '길잡이', icon: '🥾',
    desc: '거친 지형의 이동 비용이 1 줄고(최소 2), 오르막 비용도 1 준다.',
  },

  // ---- tier 2 ---------------------------------------------------------
  bagsAndBelts: {
    id: 'bagsAndBelts', tier: 2, name: '짐과 허리띠', icon: '🎒',
    desc: '무기와 방패가 매기는 피로 부담이 절반이 된다.',
  },
  fortifiedMind: {
    id: 'fortifiedMind', tier: 2, name: '굳은 심지', icon: '🧠',
    desc: '결의 +25%.',
  },
  student: {
    id: 'student', tier: 2, name: '수련생', icon: '📖',
    desc: '얻는 경험치 +30%.',
  },
  crippling: {
    id: 'crippling', tier: 2, name: '급소 노리기', icon: '🎯',
    desc: '머리를 때렸을 때 기절시킬 확률이 크게 오른다.',
  },

  // ---- tier 3 ---------------------------------------------------------
  shieldExpert: {
    id: 'shieldExpert', tier: 3, name: '방패 숙련', icon: '🛡',
    desc: '방패가 주는 방어력 +25%. 방패 내구도가 25% 덜 깎인다.',
  },
  underdog: {
    id: 'underdog', tier: 3, name: '역경', icon: '⛓',
    desc: '여럿에게 둘러싸여도 적이 포위 보정을 받지 못한다.',
  },
  backstabber: {
    id: 'backstabber', tier: 3, name: '협공', icon: '🔀',
    desc: '적을 포위했을 때 얻는 명중 보정이 두 배가 된다.',
  },
  anticipation: {
    id: 'anticipation', tier: 3, name: '예측', icon: '👁',
    desc: '원거리 방어 +12.',
  },

  // ---- tier 4 ---------------------------------------------------------
  duelist: {
    id: 'duelist', tier: 4, name: '결투가', icon: '🤺',
    desc: '한손 무기로 방어구에 주는 피해 +25%.',
  },
  bruteForce: {
    id: 'bruteForce', tier: 4, name: '완력', icon: '🪓',
    desc: '양손 무기 피해 +15%.',
  },
  battleForged: {
    id: 'battleForged', tier: 4, name: '단련된 몸', icon: '⚒',
    desc: '방어구가 받는 피해 25% 감소.',
  },
  nimble: {
    id: 'nimble', tier: 4, name: '날렵함', icon: '🍃',
    desc: '가벼운 차림일수록 체력 피해를 크게 줄인다. 무거운 갑옷과는 상성이 나쁘다.',
  },

  // ---- tier 5 ---------------------------------------------------------
  berserk: {
    id: 'berserk', tier: 5, name: '광전사', icon: '🔥',
    desc: '적을 쓰러뜨리면 행동력 4를 되찾는다.',
  },
  overwhelm: {
    id: 'overwhelm', tier: 5, name: '압도', icon: '💢',
    desc: '적을 맞히면 그 적의 명중률이 다음 차례까지 10 떨어진다.',
  },
  lastStand: {
    id: 'lastStand', tier: 5, name: '최후의 저항', icon: '🩸',
    desc: '체력이 낮을수록 방어력이 오른다 (최대 +20).',
  },
  killerInstinct: {
    id: 'killerInstinct', tier: 5, name: '살수 본능', icon: '🗡',
    desc: '명중 +10. 대신 받는 체력 피해가 10% 늘어난다.',
  },

  // ---- tier 6 ---------------------------------------------------------
  nineLives: {
    id: 'nineLives', tier: 6, name: '아홉 목숨', icon: '🐈',
    desc: '치명상을 한 전투에 한 번 견뎌내고 체력 1로 버틴다.',
  },
  indomitable: {
    id: 'indomitable', tier: 6, name: '불굴', icon: '🏰',
    desc: '사기가 흔들려도 명중과 방어에 받는 벌점이 절반이 된다.',
  },
  executioner: {
    id: 'executioner', tier: 6, name: '처형자', icon: '☠',
    desc: '체력이 절반 아래인 적에게 주는 피해 +20%.',
  },
  relentless: {
    id: 'relentless', tier: 6, name: '지치지 않는', icon: '♾',
    desc: '턴마다 회복하는 피로도가 15에서 25로 늘어난다.',
  },
};

export const MAX_TIER = 6;

/** Perks grouped by the level that unlocks them, for the tree view. */
export function perksByTier() {
  const rows = Array.from({ length: MAX_TIER }, () => []);
  for (const p of Object.values(PERKS)) rows[p.tier - 1].push(p);
  return rows;
}

export function perk(id) { return PERKS[id] || null; }

/**
 * Experience needed to *reach* each level. Index 0 is level 1.
 * A skirmish is worth roughly 60-90 a head, so the first perk lands after two
 * fights and the pace stretches out from there.
 */
export const XP_TABLE = [0, 100, 240, 440, 720, 1100, 1600, 2250, 3100, 4200, 5600];
export const MAX_LEVEL = XP_TABLE.length;

export function levelForXP(xp) {
  let lvl = 1;
  for (let i = 1; i < XP_TABLE.length; i++) if (xp >= XP_TABLE[i]) lvl = i + 1;
  return lvl;
}

export function xpForLevel(level) { return XP_TABLE[Math.min(level, MAX_LEVEL) - 1] ?? 0; }

/** Progress within the current level, as {have, need} - null once maxed. */
export function xpProgress(unit) {
  if (unit.level >= MAX_LEVEL) return null;
  const base = xpForLevel(unit.level);
  const next = xpForLevel(unit.level + 1);
  return { have: unit.xp - base, need: next - base };
}
