import { TEMPLATES } from '../data/units.js';

/**
 * Enemy band composition. A band's roster is rolled once when it spawns and
 * kept, so what the player scouts on the map is what they meet in battle.
 */
export function bandComposition(rng, strength, day = 1) {
  const tier = [TEMPLATES.banditThug, TEMPLATES.banditThug, TEMPLATES.banditRaider];
  if (strength >= 2 || day >= 6) tier.push(TEMPLATES.banditArcher, TEMPLATES.wolf);
  if (strength >= 3 || day >= 12) tier.push(TEMPLATES.banditVeteran);

  const pool = [];
  if (strength >= 2) pool.push(TEMPLATES.banditVeteran);
  if (strength >= 3) pool.push(TEMPLATES.banditLeader);

  const size = 2 + strength + Math.min(3, Math.floor(day / 8));
  while (pool.length < size) pool.push(rng.pick(tier));
  return pool.map((t) => t.id);
}

const BAND_NAMES = {
  1: '떠돌이 도적',
  2: '산적 무리',
  3: '산적단',
};

export function bandName(strength) { return BAND_NAMES[strength] || '적 무리'; }

/** Rough threat readout for the map tooltip - the player should be able to judge. */
export function bandStrengthLabel(count) {
  if (count <= 3) return '소규모';
  if (count <= 5) return '중간 규모';
  if (count <= 7) return '대규모';
  return '대군';
}
