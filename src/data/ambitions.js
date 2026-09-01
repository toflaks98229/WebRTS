/**
 * What the company is playing for.
 *
 * One ambition is chosen when a campaign starts and it is the only thing that
 * ends a run, so it decides how the whole game gets played: renown wants
 * contracts taken and fights accepted, coffers want loot sold and expensive
 * fights declined, roots want camps hunted down one by one.
 *
 * Every goal is a number the campaign already tracked for other reasons, which
 * is the point - an ambition is a lens on the existing game, not a new economy
 * bolted beside it.
 */
export const AMBITIONS = {
  renown: {
    id: 'renown',
    name: '이름을 떨친다',
    icon: '🏳',
    blurb: '섬 끝까지 이름이 닿을 때까지. 계약을 물고 싸움을 마다하지 않는 판이 된다.',
    unit: '명성',
    goal: 1200,
    have: (c) => c.company.renown,
  },
  coffers: {
    id: 'coffers',
    name: '금고를 채운다',
    icon: '👑',
    blurb: '싸움은 수단일 뿐이다. 노획을 팔고 삯을 아껴 금고를 불리는 판이 된다.',
    unit: '크라운',
    goal: 8000,
    have: (c) => c.company.crowns,
  },
  roots: {
    id: 'roots',
    name: '뿌리를 뽑는다',
    icon: '🔥',
    blurb: '야영지를 하나씩 태워 없앤다. 가장 험한 길이지만 세계가 조용해진다.',
    unit: '야영지',
    goal: 12,
    have: (c) => c.campsCleared,
  },
};

export const DEFAULT_AMBITION = 'renown';

export function ambition(id) { return AMBITIONS[id] || AMBITIONS[DEFAULT_AMBITION]; }

/** Where the company stands against its ambition, for the HUD and the ending. */
export function ambitionProgress(campaign) {
  const def = ambition(campaign.ambitionId);
  const have = Math.max(0, Math.round(def.have(campaign)));
  return {
    def,
    have,
    goal: def.goal,
    ratio: Math.min(1, have / def.goal),
    done: have >= def.goal,
  };
}
