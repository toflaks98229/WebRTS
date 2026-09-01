/**
 * How bad the country has got: one number, 0-100, that decides how rough the
 * bands a camp puts out are.
 *
 * It replaces the day counter the roster used to scale off. A calendar is not a
 * dial the player can turn - day 30 is day 30 whatever they did with it - so
 * the world got harder for no reason anyone could act on. Threat rises on its
 * own but rises faster for every camp still standing, and clearing a camp is
 * the only thing that brings it down. Sitting in town nursing wounds is
 * therefore a real decision: the roads are worse when you come back out.
 */
export const THREAT_MAX = 100;

/**
 * Baseline drift per day, with nothing on the map at all.
 *
 * The camp term carries half the rise on a typical map, which is the point -
 * most of what makes the country worse is something the player can go and burn.
 * Clearing is deliberately not enough to hold the line, only to halve the pace:
 * a run should still end somewhere rougher than it started.
 */
const PER_DAY = 0.9;
/** Added per day for each camp that still has a band in it. */
const PER_CAMP_DAY = 0.55;
/** Burning a camp out buys this much peace. */
export const THREAT_PER_CLEAR = 4;

/**
 * The four steps of the ladder. A band's composition reads the *index*, so a
 * tier is a real threshold rather than a smooth curve - the player should be
 * able to feel the country turn.
 */
export const THREAT_TIERS = [
  { at: 0,  name: '평온', color: '#7fb069', note: '길에 산적이 드물다.' },
  { at: 25, name: '불온', color: '#d8b447', note: '무리가 커지고 궁수가 섞인다.' },
  { at: 50, name: '험악', color: '#d97a2b', note: '고참이 무리를 이끈다.' },
  { at: 75, name: '무법', color: '#c2453a', note: '두목이 직접 길을 막는다.' },
];

/** 0-3. Everything that scales with the world reads this, not the calendar. */
export function threatTier(threat) {
  let tier = 0;
  for (let i = 0; i < THREAT_TIERS.length; i++) if (threat >= THREAT_TIERS[i].at) tier = i;
  return tier;
}

export function threatDef(threat) { return THREAT_TIERS[threatTier(threat)]; }

/** How much threat `days` of doing nothing adds, with `liveCamps` left standing. */
export function threatRise(days, liveCamps) {
  return (PER_DAY + PER_CAMP_DAY * Math.max(0, liveCamps)) * days;
}
