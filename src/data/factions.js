/**
 * Who else is out there.
 *
 * Three kinds of trouble, and the point of having three is not that there are
 * more enemies but that a fight against each one is a different problem:
 *
 *  - **산적** are the baseline. Mixed kit, ordinary nerve, one archer at the
 *    back. Everything the game teaches first is taught here.
 *  - **짐승** have no armour and no nerve at all. They cannot be broken, only
 *    killed, and they come in numbers - so they are a lesson in not being
 *    surrounded and in what zones of control are for.
 *  - **탈영병** are the opposite: few, disciplined, and in real mail behind real
 *    shields. Hitting them at all takes a flank, and hurting them takes
 *    something that goes through plate.
 *
 * A camp's ground decides which of the three lives in it: beasts in the deep
 * woods, deserters near the roads they prey on, bandits in the rough country
 * between. So the map itself tells the player what they are walking into.
 */
export const FACTIONS = {
  bandit: {
    id: 'bandit',
    name: '산적',
    site: '야영지',
    color: '#9c6a52',
    /** Camp ground. First faction whose list matches a tile claims it. */
    terrain: ['hills', 'mountain', 'swamp'],
    names: { 1: '떠돌이 도적', 2: '산적 무리', 3: '산적단' },
    core: ['banditThug', 'banditThug', 'banditRaider'],
    mid: ['banditArcher'],
    heavy: ['banditVeteran'],
    elite: 'banditVeteran',
    leader: 'banditLeader',
    size: (strength, tier) => 2 + strength + Math.min(3, tier),
  },

  beast: {
    id: 'beast',
    name: '짐승',
    site: '소굴',
    color: '#6f8a4a',
    terrain: ['forest'],
    names: { 1: '들개 떼', 2: '늑대 무리', 3: '굶주린 무리' },
    core: ['jackal', 'jackal', 'wolf'],
    mid: ['wolf'],
    heavy: ['wolf', 'blackBear'],
    elite: 'wolf',
    leader: 'blackBear',
    // They come in numbers; that is the whole of their tactics.
    size: (strength, tier) => 4 + strength + Math.min(4, tier),
  },

  deserter: {
    id: 'deserter',
    name: '탈영병',
    site: '주둔지',
    color: '#7a8aa0',
    terrain: ['plains', 'steppe', 'farmland'],
    names: { 1: '탈영병 무리', 2: '무장 탈영대', 3: '옛 중대' },
    // A band of deserters is a sergeant and whoever followed him out, so most
    // of it is raw. Without that padding the whole band was elite and there was
    // nothing in it a company could kill first - measured at a 2% win rate,
    // because every bandit band has thugs in it and this one had none.
    core: ['deserterRecruit', 'deserterRecruit', 'deserter'],
    mid: ['deserterBowman'],
    heavy: ['deserter'],
    elite: 'deserter',
    leader: 'deserterSergeant',
    size: (strength, tier) => 1 + strength + Math.min(2, tier),
  },
};

export const FACTION_IDS = Object.keys(FACTIONS);

export function faction(id) { return FACTIONS[id] || FACTIONS.bandit; }

/** Which faction settles on this ground, or null where none of them would. */
export function factionForTerrain(terrain) {
  for (const f of Object.values(FACTIONS)) if (f.terrain.includes(terrain)) return f.id;
  return null;
}
