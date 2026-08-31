/**
 * The captain's tree. Unlike a brother's perks - which only ever change that
 * one man - these nodes act on the whole company, so the tree persists with the
 * company rather than with whoever currently wears the title. Lose the captain
 * and the next one inherits what the outfit has learned.
 *
 * Points come from renown, earned by finishing contracts and winning fights.
 */
export const CAPTAIN_BRANCHES = {
  command: {
    id: 'command', name: '지휘', icon: '🎖',
    blurb: '부대 전체가 더 단단하게 싸운다.',
    nodes: [
      { id: 'rally', name: '규합', icon: '📣', requires: [], desc: '단원 전원의 결의 +10.' },
      { id: 'discipline', name: '군율', icon: '⛨', requires: ['rally'], desc: '단원 전원의 최대 피로도 +10.' },
      { id: 'banner', name: '군기', icon: '🚩', requires: ['rally'], desc: '사기 판정에 +10 보정. 무너지기 어려워진다.' },
      { id: 'veterans', name: '노련한 부대', icon: '⚔', requires: ['discipline', 'banner'], desc: '단원 전원의 명중 +5.' },
    ],
  },
  stewardship: {
    id: 'stewardship', name: '경영', icon: '⚖',
    blurb: '같은 일로 더 많이 남기고, 더 오래 버틴다.',
    nodes: [
      { id: 'quartermaster', name: '병참관', icon: '📦', requires: [], desc: '일일 급여 20% 절감.' },
      { id: 'haggler', name: '흥정꾼', icon: '🪙', requires: ['quartermaster'], desc: '구매가 15% 인하, 판매가 15% 인상.' },
      { id: 'negotiator', name: '교섭가', icon: '🤝', requires: ['quartermaster'], desc: '계약 보수 +20%.' },
      { id: 'surgeon', name: '야전 군의관', icon: '⚕', requires: ['haggler', 'negotiator'], desc: '마을에서의 회복 속도 두 배.' },
    ],
  },
  prowess: {
    id: 'prowess', name: '무예', icon: '🗡',
    blurb: '단장 본인이 전장의 축이 된다.',
    nodes: [
      { id: 'champion', name: '투사', icon: '🏅', requires: [], desc: '단장의 명중 +8, 근접 방어 +8.' },
      { id: 'inspiring', name: '고무', icon: '✨', requires: ['champion'], desc: '단장에게 인접한 아군의 명중 +5.' },
      { id: 'unbreakable', name: '흔들리지 않는', icon: '🛡', requires: ['champion'], desc: '단장은 사기가 떨어지지 않는다.' },
      { id: 'warlord', name: '전쟁 지휘관', icon: '👑', requires: ['inspiring', 'unbreakable'], desc: '단장의 최대 행동력 +1.' },
    ],
  },
};

/** Every node keyed by id, for lookups. */
export const CAPTAIN_NODES = Object.fromEntries(
  Object.values(CAPTAIN_BRANCHES).flatMap((b) => b.nodes.map((n) => [n.id, { ...n, branch: b.id }])),
);

/** Renown needed per skill point; the cost climbs as the outfit grows famous. */
export const RENOWN_PER_POINT = 120;

export function pointsFromRenown(renown) { return Math.floor(renown / RENOWN_PER_POINT); }

/** Whether a node's prerequisites are all taken. */
export function nodeAvailable(nodeId, taken) {
  const node = CAPTAIN_NODES[nodeId];
  if (!node || taken.has(nodeId)) return false;
  return node.requires.every((r) => taken.has(r));
}
