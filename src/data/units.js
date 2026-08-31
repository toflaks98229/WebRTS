/**
 * Unit templates. Attributes are given as [min, max] and rolled at creation.
 * Values are tuned to sit in the same ballpark as Battle Brothers' humans:
 * ~50-70 HP, 100 max fatigue, 50-60 melee skill, single-digit defenses.
 */
export const TEMPLATES = {
  // ---------------- Player-side backgrounds ----------------
  sellsword: {
    id: 'sellsword', name: '용병', faction: 'player', portrait: 'human',
    hp: [60, 70], fatigue: [100, 115], resolve: [45, 55], initiative: [100, 115],
    meleeSkill: [58, 68], rangedSkill: [45, 52], meleeDefense: [8, 14], rangedDefense: [3, 8],
    gear: { weapon: 'shortSword', shield: 'heaterShield', body: 'gambeson', head: 'leatherCap' },
  },
  hedgeKnight: {
    id: 'hedgeKnight', name: '떠돌이 기사', faction: 'player', portrait: 'human',
    hp: [70, 82], fatigue: [105, 120], resolve: [50, 62], initiative: [95, 108],
    meleeSkill: [62, 72], rangedSkill: [40, 48], meleeDefense: [10, 16], rangedDefense: [4, 9],
    gear: { weapon: 'greatsword', body: 'mailShirt', head: 'nasalHelm' },
  },
  brawler: {
    id: 'brawler', name: '싸움꾼', faction: 'player', portrait: 'human',
    hp: [65, 78], fatigue: [110, 125], resolve: [38, 48], initiative: [90, 105],
    meleeSkill: [52, 62], rangedSkill: [35, 45], meleeDefense: [5, 10], rangedDefense: [2, 6],
    gear: { weapon: 'woodenClub', shield: 'woodenShield', body: 'gambeson', head: 'leatherCap' },
  },
  poacher: {
    id: 'poacher', name: '밀렵꾼', faction: 'player', portrait: 'human',
    hp: [48, 58], fatigue: [100, 112], resolve: [35, 45], initiative: [115, 130],
    meleeSkill: [42, 50], rangedSkill: [58, 70], meleeDefense: [3, 7], rangedDefense: [5, 10],
    gear: { weapon: 'shortBow', body: 'rags', head: 'hood' },
  },
  militia: {
    id: 'militia', name: '민병대', faction: 'player', portrait: 'human',
    hp: [55, 65], fatigue: [95, 110], resolve: [40, 50], initiative: [95, 110],
    meleeSkill: [50, 58], rangedSkill: [40, 48], meleeDefense: [6, 11], rangedDefense: [3, 7],
    gear: { weapon: 'spear', shield: 'woodenShield', body: 'gambeson', head: 'hood' },
  },

  daytaler: {
    id: 'daytaler', name: '품팔이꾼', faction: 'player', portrait: 'human',
    hp: [50, 58], fatigue: [95, 108], resolve: [28, 38], initiative: [95, 110],
    meleeSkill: [42, 50], rangedSkill: [35, 44], meleeDefense: [2, 6], rangedDefense: [0, 4],
    gear: { weapon: 'handAxe', shield: 'woodenShield', body: 'rags', head: 'hood' },
  },
  farmhand: {
    id: 'farmhand', name: '농부', faction: 'player', portrait: 'human',
    hp: [58, 68], fatigue: [105, 118], resolve: [30, 40], initiative: [88, 100],
    meleeSkill: [44, 52], rangedSkill: [34, 42], meleeDefense: [3, 7], rangedDefense: [1, 5],
    gear: { weapon: 'spear', body: 'rags', head: 'hood' },
  },

  // ---------------- Enemies ----------------
  banditThug: {
    id: 'banditThug', name: '산적 폭한', faction: 'enemy', portrait: 'bandit',
    hp: [50, 60], fatigue: [95, 105], resolve: [30, 40], initiative: [90, 105],
    meleeSkill: [45, 55], rangedSkill: [35, 45], meleeDefense: [2, 7], rangedDefense: [0, 4],
    gear: { weapon: 'woodenClub', shield: 'woodenShield', body: 'rags', head: 'hood' },
  },
  banditRaider: {
    id: 'banditRaider', name: '산적 약탈자', faction: 'enemy', portrait: 'bandit',
    hp: [60, 70], fatigue: [100, 115], resolve: [40, 50], initiative: [100, 115],
    meleeSkill: [55, 65], rangedSkill: [45, 55], meleeDefense: [7, 13], rangedDefense: [3, 8],
    gear: { weapon: 'handAxe', shield: 'heaterShield', body: 'leatherArmor', head: 'leatherCap' },
  },
  banditArcher: {
    id: 'banditArcher', name: '산적 궁수', faction: 'enemy', portrait: 'bandit',
    hp: [48, 56], fatigue: [95, 108], resolve: [32, 42], initiative: [110, 125],
    meleeSkill: [40, 48], rangedSkill: [55, 65], meleeDefense: [3, 7], rangedDefense: [4, 9],
    gear: { weapon: 'shortBow', body: 'gambeson', head: 'hood' },
  },
  banditVeteran: {
    id: 'banditVeteran', name: '산적 고참', faction: 'enemy', portrait: 'bandit',
    hp: [65, 75], fatigue: [105, 118], resolve: [45, 55], initiative: [100, 112],
    meleeSkill: [58, 68], rangedSkill: [45, 55], meleeDefense: [9, 15], rangedDefense: [4, 9],
    gear: { weapon: 'mace', shield: 'heaterShield', body: 'leatherArmor', head: 'leatherCap' },
  },
  banditLeader: {
    id: 'banditLeader', name: '산적 두목', faction: 'enemy', portrait: 'bandit',
    hp: [75, 88], fatigue: [110, 125], resolve: [55, 68], initiative: [100, 112],
    meleeSkill: [62, 70], rangedSkill: [45, 55], meleeDefense: [12, 18], rangedDefense: [5, 10],
    gear: { weapon: 'battleAxe', body: 'leatherArmor', head: 'kettleHat' },
  },
  wolf: {
    id: 'wolf', name: '늑대', faction: 'enemy', portrait: 'beast', beast: true,
    hp: [40, 50], fatigue: [110, 125], resolve: [25, 35], initiative: [130, 150],
    meleeSkill: [50, 60], rangedSkill: [0, 0], meleeDefense: [10, 16], rangedDefense: [8, 14],
    gear: { weapon: 'dagger' },
  },
};

const FIRST = ['한스', '오토', '군터', '루드비히', '베른트', '카를', '디트리히', '에곤', '프란츠', '게오르크',
  '하인리히', '요한', '클라우스', '로타르', '만프레트', '니클라스', '오스발트', '폴커', '빌헬름', '유르겐'];
const LAST = ['검은손', '외눈', '늑대', '망치', '까마귀', '떡갈나무', '재빠른', '무쇠턱', '흉터', '조용한',
  '붉은', '방랑자', '쇠주먹', '남부인', '늙은'];

export function randomName(rng) {
  return `${rng.pick(FIRST)} '${rng.pick(LAST)}'`;
}

export function template(id) { return TEMPLATES[id]; }
