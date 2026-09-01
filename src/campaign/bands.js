import { TEMPLATES } from '../data/units.js';
import { threatTier } from './threat.js';

/**
 * Enemy band composition. A band's roster is rolled once when it spawns and
 * kept, so what the player scouts on the map is what they meet in battle.
 *
 * Scaling reads the world's threat rather than the date. The calendar was not
 * something the player could act on - day 30 was day 30 however they had spent
 * it - whereas threat answers to camps left standing.
 */
export function bandComposition(rng, strength, threat = 0) {
  const t = threatTier(threat);
  const tier = [TEMPLATES.banditThug, TEMPLATES.banditThug, TEMPLATES.banditRaider];
  if (strength >= 2 || t >= 1) tier.push(TEMPLATES.banditArcher, TEMPLATES.wolf);
  if (strength >= 3 || t >= 2) tier.push(TEMPLATES.banditVeteran);

  const pool = [];
  if (strength >= 2) pool.push(TEMPLATES.banditVeteran);
  if (strength >= 3) pool.push(TEMPLATES.banditLeader);

  const size = 2 + strength + Math.min(3, t);
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
