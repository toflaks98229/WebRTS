import { distance, neighbors } from '../hex/hex.js';
import { MORALE } from './unit.js';

export const HEAD_HIT_CHANCE = 25;
export const HEAD_DAMAGE_MULT = 1.5;
export const HEIGHT_HIT_BONUS = 10;
export const HEIGHT_DAMAGE_BONUS = 0.15;
export const SURROUND_BONUS = 5;
export const RANGED_FALLOFF = 4;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Full hit-chance breakdown so the UI can show players *why* a shot is bad.
 * @returns {{chance:number, parts:{label:string, value:number}[]}}
 */
export function hitChance(battle, attacker, target, sk) {
  const ranged = sk.type === 'ranged';
  const parts = [];

  const base = ranged ? attacker.rangedSkill : attacker.meleeSkill;
  parts.push({ label: ranged ? '원거리 숙련' : '근접 숙련', value: base });

  if (sk.hitBonus) parts.push({ label: sk.name, value: sk.hitBonus });

  const def = ranged ? target.rangedDefense : target.meleeDefense;
  parts.push({ label: ranged ? '대상 원거리 방어' : '대상 근접 방어', value: -def });

  const mor = MORALE[attacker.morale];
  if (mor.hit) parts.push({ label: `사기(${mor.name})`, value: mor.hit });

  const dh = battle.grid.elevation(attacker.hex) - battle.grid.elevation(target.hex);
  if (dh > 0) parts.push({ label: '고지대', value: dh * HEIGHT_HIT_BONUS });
  else if (dh < 0) parts.push({ label: '저지대', value: dh * HEIGHT_HIT_BONUS });

  if (ranged) {
    const d = distance(attacker.hex, target.hex);
    if (d > 1) parts.push({ label: `거리 ${d}`, value: -(d - 1) * RANGED_FALLOFF });
    const cover = battle.grid.terrainAt(target.hex).cover;
    if (cover) parts.push({ label: '엄폐', value: -cover });
    const blocked = countAdjacent(battle, target.hex, attacker.faction);
    if (blocked) parts.push({ label: '아군 오사 위험', value: -10 });
  } else {
    const extra = countAdjacent(battle, target.hex, attacker.faction) - 1;
    if (extra > 0) parts.push({ label: `포위 +${extra}`, value: extra * SURROUND_BONUS });
    if (target.stunned > 0) parts.push({ label: '기절', value: 15 });
  }

  const total = parts.reduce((s, p) => s + p.value, 0);
  return { chance: clamp(Math.round(total), 5, 95), parts };
}

function countAdjacent(battle, hex, faction) {
  let n = 0;
  for (const nb of neighbors(hex)) {
    const u = battle.unitAt(nb);
    if (u && u.alive && u.faction === faction) n++;
  }
  return n;
}

/** Roll the raw damage number for one swing, before armour. */
function rollDamage(battle, attacker, sk) {
  const [lo, hi] = attacker.weapon ? attacker.weapon.damage : [10, 14];
  return battle.rng.int(lo, hi) * (sk.damageMult ?? 1);
}

/**
 * Resolve one attack. Mutates attacker/target and returns a structured result
 * that the log, the floating numbers and the AI scorer all read from.
 */
export function resolveAttack(battle, attacker, target, sk, opts = {}) {
  const res = {
    attacker, target, skill: sk, hit: false, head: false,
    hpDamage: 0, armorDamage: 0, killed: false, shieldDamage: 0, chance: 0,
  };

  const hc = hitChance(battle, attacker, target, sk);
  res.chance = hc.chance;

  if (!battle.rng.chance(hc.chance)) {
    battle.log(`${attacker.name} 의 ${sk.name} — 빗나감`, 'miss', attacker.faction);
    battle.bus.emit('attack:miss', res);
    return res;
  }
  res.hit = true;

  // --- shield-breaking attacks hit the shield instead of the body ---
  if (sk.effect === 'shieldBreak' && target.shield && target.shield.durability > 0) {
    const dmg = Math.round(battle.rng.int(12, 20));
    target.shield.durability = Math.max(0, target.shield.durability - dmg);
    res.shieldDamage = dmg;
    battle.log(`${attacker.name} 이(가) ${target.name} 의 방패를 내리쳤다 (-${dmg})`, 'hit', attacker.faction);
    if (target.shield.durability === 0) battle.log(`${target.name} 의 방패가 부서졌다!`, 'crit', attacker.faction);
  }

  const w = attacker.weapon;
  const raw = rollDamage(battle, attacker, sk);

  const dh = battle.grid.elevation(attacker.hex) - battle.grid.elevation(target.hex);
  const heightMult = 1 + Math.max(0, dh) * HEIGHT_DAMAGE_BONUS;

  const head = battle.rng.chance(HEAD_HIT_CHANCE);
  res.head = head;
  const slot = head ? target.head : target.body;
  const armorNow = slot?.armor || 0;

  let total = raw * heightMult;
  let hpDmg;

  if (sk.effect === 'ignoreArmor') {
    hpDmg = total;                                   // puncture: straight to flesh
  } else if (armorNow <= 0) {
    hpDmg = total;
  } else {
    const armorMult = (w?.armorMult ?? 1) * (sk.armorMult ?? 1);
    const armorDmg = total * armorMult;
    const absorbed = Math.min(armorNow, armorDmg);
    const through = (armorDmg - absorbed) / armorMult; // raw-damage equivalent that got past
    hpDmg = total * (w?.armorPen ?? 0.2) + through;

    const applied = Math.round(absorbed);
    if (slot) slot.armor = Math.max(0, slot.armor - applied);
    res.armorDamage = applied;
  }

  if (head) hpDmg *= HEAD_DAMAGE_MULT;
  res.hpDamage = Math.max(1, Math.round(hpDmg));

  target.hp -= res.hpDamage;

  const where = head ? '머리' : '몸통';
  battle.log(
    `${attacker.name} → ${target.name} ${where} 명중 (체력 -${res.hpDamage}${res.armorDamage ? `, 방어구 -${res.armorDamage}` : ''})`,
    head ? 'crit' : 'hit', attacker.faction,
  );

  if (sk.effect === 'stun' && head && battle.rng.chance(50 - target.resolve / 3)) {
    target.stunned = 2;
    battle.log(`${target.name} 이(가) 기절했다!`, 'crit', attacker.faction);
  }

  battle.bus.emit('attack:hit', res);

  if (target.hp <= 0) {
    res.killed = true;
    battle.killUnit(target, attacker);
  } else {
    // Only a genuinely serious wound rattles a fighter.
    const severity = res.hpDamage / target.hpMax;
    if (severity > 0.25) battle.moraleCheck(target, -Math.round(severity * 30), '큰 부상');
  }

  if (!opts.free) attacker.hasAttacked = true;
  return res;
}

/**
 * Morale check. A fighter of average resolve (40) passes an unmodified check
 * half the time; `mod` shifts those odds. Failing drops one step down the
 * ladder, so it takes several bad moments to rout someone.
 */
export function checkMorale(battle, unit, mod, reason) {
  if (!unit.alive) return;
  const chance = clamp(50 + (unit.resolve - 40) + mod, 5, 95);
  if (!battle.rng.chance(chance)) {
    if (unit.shiftMorale(-1)) {
      battle.log(`${unit.name} — 사기 하락: ${MORALE[unit.morale].name} (${reason})`, 'morale', unit.faction);
      battle.bus.emit('morale:change', { unit, direction: -1 });
    }
  }
}

export function boostMorale(battle, unit, mod, reason) {
  if (!unit.alive) return;
  if (battle.rng.chance(clamp(50 + (unit.resolve - 40) + mod, 5, 95))) {
    if (unit.shiftMorale(1)) {
      battle.log(`${unit.name} — 사기 상승: ${MORALE[unit.morale].name} (${reason})`, 'morale', unit.faction);
      battle.bus.emit('morale:change', { unit, direction: 1 });
    }
  }
}
