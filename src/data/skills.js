/**
 * Skill (action) definitions. Weapons grant skills; a few are innate.
 * `damageMult` scales the weapon's damage roll, `hitBonus` is added to the
 * attacker's effective skill before the target's defense is subtracted.
 */
export const SKILLS = {
  // --- Sword ---
  slash:      { id: 'slash',      name: '베기',       icon: '⚔', tile: 'skill.blade', type: 'melee',  ap: 4, fatigue: 15, hitBonus: 0,   damageMult: 1.0,  desc: '검으로 크게 베어 넘긴다.' },
  thrust:     { id: 'thrust',     name: '찌르기',     icon: '➤', tile: 'skill.blade', type: 'melee',  ap: 4, fatigue: 12, hitBonus: 15,  damageMult: 0.7,  armorMult: 0.5, desc: '정확하게 찌른다. 명중률이 높지만 피해가 낮다.' },
  riposte:    { id: 'riposte',    name: '받아치기',   icon: '⟲', tile: 'skill.brawl', type: 'self',   ap: 4, fatigue: 25, desc: '다음 차례까지 근접 공격을 받을 때마다 되받아친다. 명중이든 빗나감이든 반응하며, 반격 한 번마다 피로가 든다.', effect: 'riposte' },

  // --- Axe ---
  chop:       { id: 'chop',       name: '내려찍기',   icon: '🪓', tile: 'skill.axe', type: 'melee', ap: 4, fatigue: 16, hitBonus: -5,  damageMult: 1.0,  desc: '도끼로 강하게 내려찍는다. 방어구 파괴에 능하다.' },
  splitShield:{ id: 'splitShield',name: '방패 부수기',icon: '⛨', tile: 'skill.axe', type: 'melee',  ap: 4, fatigue: 25, hitBonus: 0,   damageMult: 0.4,  desc: '적의 방패를 노려 내구도를 크게 깎는다.', effect: 'shieldBreak' },

  // --- Mace / Hammer ---
  strike:     { id: 'strike',     name: '가격',       icon: '🔨', tile: 'skill.blunt', type: 'melee', ap: 4, fatigue: 15, hitBonus: 0,   damageMult: 1.0,  desc: '둔기로 후려친다. 방어구를 관통해 피해를 준다.' },
  knockOut:   { id: 'knockOut',   name: '기절시키기', icon: '💫', tile: 'skill.blunt', type: 'melee', ap: 5, fatigue: 25, hitBonus: -10, damageMult: 0.5,  desc: '머리를 노려 기절시킨다.', effect: 'stun' },

  // --- Spear ---
  spearThrust:{ id: 'spearThrust',name: '창 찌르기',  icon: '🗡', tile: 'skill.polearm', type: 'melee', ap: 4, fatigue: 12, hitBonus: 20,  damageMult: 0.85, desc: '창으로 찌른다. 명중률이 매우 높다.' },
  spearwall:  { id: 'spearwall',  name: '창벽',       icon: '⩘', tile: 'skill.polearm', type: 'self',   ap: 4, fatigue: 25, desc: '다가오는 적을 자동으로 찔러 저지한다.', effect: 'spearwall' },

  // --- Dagger ---
  stab:       { id: 'stab',       name: '단검 찌르기',icon: '🔪', tile: 'skill.knife', type: 'melee', ap: 4, fatigue: 10, hitBonus: 10,  damageMult: 1.0,  desc: '빠르게 찌른다.' },
  puncture:   { id: 'puncture',   name: '관통',       icon: '✚', tile: 'skill.knife', type: 'melee',  ap: 6, fatigue: 25, hitBonus: 0,   damageMult: 1.0,  desc: '갑옷 틈을 노려 방어구를 완전히 무시한다.', effect: 'ignoreArmor' },

  // --- Ranged ---
  quickShot:  { id: 'quickShot',  name: '속사',       icon: '🏹', tile: 'skill.bow', type: 'ranged', ap: 4, fatigue: 15, hitBonus: -10, damageMult: 1.0, desc: '빠르게 쏜다. 명중률이 낮다.' },
  aimedShot:  { id: 'aimedShot',  name: '조준 사격',  icon: '◎', tile: 'skill.bow', type: 'ranged', ap: 6, fatigue: 25, hitBonus: 10,  damageMult: 1.0, desc: '신중히 조준해 쏜다.' },
  boltShot:   { id: 'boltShot',   name: '석궁 사격',  icon: '➹', tile: 'skill.crossbow', type: 'ranged', ap: 6, fatigue: 20, hitBonus: 5,   damageMult: 1.0, desc: '석궁을 발사한다. 발사 후 재장전이 필요하다.', effect: 'needsReload' },
  reload:     { id: 'reload',     name: '재장전',     icon: '↻', tile: 'skill.crossbow', type: 'self',   ap: 4, fatigue: 10, desc: '석궁을 재장전한다.', effect: 'reload' },
  throwJavelin:{id: 'throwJavelin',name:'투창',       icon: '↗', tile: 'skill.throw', type: 'ranged', ap: 4, fatigue: 18, hitBonus: 0,   damageMult: 1.0, desc: '투창을 던진다. 방어구를 잘 뚫는다.', consumes: 1 },

  // --- Shield ---
  shieldwall: { id: 'shieldwall', name: '방패벽',     icon: '🛡', tile: 'skill.shield', type: 'self',   ap: 3, fatigue: 20, desc: '방패를 세워 방어력을 크게 올린다.', effect: 'shieldwall' },
  shieldBash: { id: 'shieldBash', name: '방패 밀치기',icon: '↦', tile: 'skill.shield', type: 'melee',  ap: 4, fatigue: 20, hitBonus: 0,   damageMult: 0.2,  desc: '적을 밀쳐낸다.', effect: 'push' },

  // --- Innate ---
  recover:    { id: 'recover',    name: '호흡 고르기',icon: '💨', tile: 'skill.breathe', type: 'self',   ap: 9, fatigue: 0,  desc: '남은 행동을 포기하고 피로를 크게 회복한다.', effect: 'recover' },
  waitTurn:   { id: 'waitTurn',   name: '대기',       icon: '⏳', type: 'utility',ap: 0, fatigue: 0,  desc: '차례를 라운드 뒤로 미룬다.', effect: 'wait' },
  endTurn:    { id: 'endTurn',    name: '턴 종료',    icon: '✔', type: 'utility', ap: 0, fatigue: 0,  desc: '이번 차례를 끝낸다.', effect: 'end' },
};

export function skill(id) { return SKILLS[id]; }
