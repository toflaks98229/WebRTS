import { TEMPLATES } from '../data/units.js';
import { threatTier } from './threat.js';
import { faction } from '../data/factions.js';

/**
 * Enemy band composition. A band's roster is rolled once when it spawns and
 * kept, so what the player scouts on the map is what they meet in battle.
 *
 * Scaling reads the world's threat rather than the date. The calendar was not
 * something the player could act on - day 30 was day 30 however they had spent
 * it - whereas threat answers to camps left standing.
 */
export function bandComposition(rng, strength, threat = 0, kind = 'bandit') {
  const f = faction(kind);
  const t = threatTier(threat);

  const draw = [...f.core];
  if (strength >= 2 || t >= 1) draw.push(...f.mid);
  if (strength >= 3 || t >= 2) draw.push(...f.heavy);

  // The ones a band is guaranteed to field, before the rank and file.
  const roster = [];
  if (strength >= 2 && f.elite) roster.push(f.elite);
  if (strength >= 3 && f.leader) roster.push(f.leader);

  const size = f.size(strength, t);
  while (roster.length < size) roster.push(rng.pick(draw));
  return roster.filter((id) => TEMPLATES[id]);
}

export function bandName(strength, kind = 'bandit') {
  return faction(kind).names[strength] || faction(kind).names[1];
}

/** Rough threat readout for the map tooltip - the player should be able to judge. */
export function bandStrengthLabel(count) {
  if (count <= 3) return '소규모';
  if (count <= 5) return '중간 규모';
  if (count <= 7) return '대규모';
  return '대군';
}
