/**
 * Equipment tables.
 *  - `armorMult` : how hard the weapon chews through armour durability.
 *  - `armorPen`  : fraction of the raw damage roll that reaches HP through armour.
 *  - `fatigue`   : permanent max-fatigue penalty while equipped.
 */
export const WEAPONS = {
  // --- Swords ---
  shortSword:   { id: 'shortSword',   name: '숏소드',       kind: 'sword', damage: [22, 30], armorMult: 1.0,  armorPen: 0.20, range: 1, fatigue: 6,  skills: ['slash', 'thrust'], value: 250 },
  armingSword:  { id: 'armingSword',  name: '아밍소드',     kind: 'sword', damage: [30, 40], armorMult: 1.0,  armorPen: 0.20, range: 1, fatigue: 8,  skills: ['slash', 'thrust'], value: 900 },
  greatsword:   { id: 'greatsword',   name: '그레이트소드', kind: 'sword', damage: [45, 65], armorMult: 1.1,  armorPen: 0.20, range: 2, fatigue: 18, twoHanded: true, skills: ['slash', 'thrust'], value: 3800 },

  // --- Axes ---
  handAxe:      { id: 'handAxe',      name: '손도끼',       kind: 'axe',   damage: [25, 40], armorMult: 1.35, armorPen: 0.10, range: 1, fatigue: 7,  skills: ['chop', 'splitShield'], value: 300 },
  battleAxe:    { id: 'battleAxe',    name: '전투도끼',     kind: 'axe',   damage: [45, 70], armorMult: 1.5,  armorPen: 0.10, range: 1, fatigue: 16, twoHanded: true, skills: ['chop', 'splitShield'], value: 2200 },

  // --- Blunt ---
  woodenClub:   { id: 'woodenClub',   name: '나무 몽둥이', kind: 'mace',  damage: [18, 26], armorMult: 0.8,  armorPen: 0.30, range: 1, fatigue: 5,  skills: ['strike', 'knockOut'], value: 60 },
  mace:         { id: 'mace',         name: '메이스',       kind: 'mace',  damage: [28, 38], armorMult: 1.0,  armorPen: 0.35, range: 1, fatigue: 9,  skills: ['strike', 'knockOut'], value: 1100 },
  warhammer:    { id: 'warhammer',    name: '워해머',       kind: 'mace',  damage: [40, 60], armorMult: 1.1,  armorPen: 0.45, range: 1, fatigue: 17, twoHanded: true, skills: ['strike', 'knockOut'], value: 3200 },

  // --- Spears / polearms ---
  spear:        { id: 'spear',        name: '창',           kind: 'spear', damage: [22, 32], armorMult: 0.9,  armorPen: 0.20, range: 1, fatigue: 7,  skills: ['spearThrust', 'spearwall'], value: 200 },
  pike:         { id: 'pike',         name: '파이크',       kind: 'spear', damage: [28, 40], armorMult: 0.9,  armorPen: 0.20, range: 2, fatigue: 14, twoHanded: true, skills: ['spearThrust', 'spearwall'], value: 1500 },

  // --- Daggers ---
  dagger:       { id: 'dagger',       name: '단검',         kind: 'dagger',damage: [18, 24], armorMult: 0.5,  armorPen: 0.30, range: 1, fatigue: 3,  skills: ['stab', 'puncture'], value: 120 },

  // --- Ranged ---
  shortBow:     { id: 'shortBow',     name: '단궁',         kind: 'bow',   damage: [22, 32], armorMult: 0.7,  armorPen: 0.10, range: 5, minRange: 2, fatigue: 6,  twoHanded: true, skills: ['quickShot', 'aimedShot'], value: 400 },
  warBow:       { id: 'warBow',       name: '전투용 활',    kind: 'bow',   damage: [32, 45], armorMult: 0.75, armorPen: 0.10, range: 6, minRange: 2, fatigue: 10, twoHanded: true, skills: ['quickShot', 'aimedShot'], value: 1600 },
  crossbow:     { id: 'crossbow',     name: '석궁',         kind: 'xbow',  damage: [45, 60], armorMult: 1.0,  armorPen: 0.25, range: 6, minRange: 2, fatigue: 12, twoHanded: true, skills: ['boltShot', 'reload'], value: 2000 },
  javelin:      { id: 'javelin',      name: '투창',         kind: 'thrown',damage: [30, 42], armorMult: 1.1,  armorPen: 0.25, range: 4, minRange: 2, fatigue: 8,  ammo: 4, skills: ['throwJavelin', 'spearThrust'], value: 500 },
};

export const SHIELDS = {
  woodenShield: { id: 'woodenShield', name: '나무 방패',   durability: 18, meleeDefense: 12, rangedDefense: 12, fatigue: 6,  value: 200 },
  heaterShield: { id: 'heaterShield', name: '히터 실드',   durability: 30, meleeDefense: 15, rangedDefense: 15, fatigue: 10, value: 900 },
  kiteShield:   { id: 'kiteShield',   name: '카이트 실드', durability: 42, meleeDefense: 18, rangedDefense: 25, fatigue: 16, value: 2400 },
};

export const BODY_ARMOR = {
  rags:         { id: 'rags',         name: '누더기',       armor: 10,  fatigue: 2,  value: 20 },
  gambeson:     { id: 'gambeson',     name: '갬비슨',       armor: 45,  fatigue: 8,  value: 350 },
  leatherArmor: { id: 'leatherArmor', name: '가죽 갑옷',    armor: 65,  fatigue: 12, value: 700 },
  mailShirt:    { id: 'mailShirt',    name: '사슬 갑옷',    armor: 110, fatigue: 22, value: 2500 },
  scaleArmor:   { id: 'scaleArmor',   name: '비늘 갑옷',    armor: 150, fatigue: 32, value: 5200 },
  plateArmor:   { id: 'plateArmor',   name: '판금 갑옷',    armor: 220, fatigue: 48, value: 12000 },
};

export const HELMETS = {
  hood:         { id: 'hood',         name: '두건',         armor: 8,   fatigue: 1,  value: 20 },
  leatherCap:   { id: 'leatherCap',   name: '가죽 모자',    armor: 25,  fatigue: 3,  value: 180 },
  mailCoif:     { id: 'mailCoif',     name: '사슬 두건',    armor: 48,  fatigue: 7,  value: 700 },
  kettleHat:    { id: 'kettleHat',    name: '케틀 햇',      armor: 70,  fatigue: 10, value: 1500 },
  nasalHelm:    { id: 'nasalHelm',    name: '노즈 헬름',    armor: 95,  fatigue: 14, value: 3000 },
  greatHelm:    { id: 'greatHelm',    name: '그레이트 헬름',armor: 140, fatigue: 20, value: 6500 },
};

export const ITEMS = { ...WEAPONS, ...SHIELDS, ...BODY_ARMOR, ...HELMETS };
export function item(id) { return id ? ITEMS[id] : null; }
