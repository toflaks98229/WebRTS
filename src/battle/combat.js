import { distance, neighbors } from '../hex/hex.js';
import { MORALE } from './unit.js';

export const HEAD_HIT_CHANCE = 25;
export const HEAD_DAMAGE_MULT = 1.5;
export const HEIGHT_HIT_BONUS = 10;
export const HEIGHT_DAMAGE_BONUS = 0.15;
export const SURROUND_BONUS = 5;
export const RANGED_FALLOFF = 4;

/**
 * A blow has to be this big a share of a man to be worth remembering.
 *
 * What counts is the whole force of it, not just what reached flesh: armour
 * that stops an axe still leaves the arm underneath broken, so the part the
 * mail ate is counted at half weight. Measured over 200 battles, this marks
 * about a third of survivors and leaves roughly 0.4 lasting wounds per fight -
 * a handful over a campaign, which is what makes the trip to a surgeon a thing
 * you plan for rather than a thing that never comes up.
 */
const LASTING_BLOW = 0.15;
/** Share of the armour's share that still reaches the bone. */
const LASTING_THROUGH_ARMOUR = 0.5;
/** How much of the blow carries over as risk of a lasting wound. */
const LASTING_WEIGHT = 55;
/** A blow to the head is the one most likely to leave something behind. */
const LASTING_HEAD = 8;

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

  // Ground that is hard to fight on. The defender's getters have no idea which
  // tile they are standing on, so the terrain is priced here instead.
  const footing = battle.grid.terrainAt(target.hex);
  const foot = footing.penalty && (ranged ? footing.penalty.rangedDefense : footing.penalty.meleeDefense);
  if (foot) parts.push({ label: `${footing.name} 지형`, value: -foot });

  const morHit = attacker.moraleHit;
  if (morHit) parts.push({ label: `사기(${MORALE[attacker.morale].name})`, value: morHit });

  if (attacker.hasPerk('killerInstinct')) parts.push({ label: '살수 본능', value: 10 });
  if (attacker.overwhelmed > 0) parts.push({ label: '압도당함', value: -10 });
  if (attacker.hasCompany('veterans')) parts.push({ label: '노련한 부대', value: 5 });
  if (attacker.hasCaptainPerk('champion')) parts.push({ label: '투사', value: 8 });
  if (attacker.hasCompany('inspiring') && !attacker.isCaptain) {
    const cap = battle.living.find((u) => u.faction === attacker.faction && u.isCaptain);
    if (cap && distance(cap.hex, attacker.hex) <= 1) parts.push({ label: '단장의 고무', value: 5 });
  }

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
    // Underdog denies the ganging-up bonus outright; Backstabber doubles it.
    if (extra > 0 && !target.hasPerk('underdog')) {
      const mult = attacker.hasPerk('backstabber') ? 2 : 1;
      parts.push({ label: `포위 +${extra}${mult > 1 ? ' (협공)' : ''}`, value: extra * SURROUND_BONUS * mult });
    }
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
function rollDamage(battle, attacker, target, sk) {
  const w = attacker.weapon;
  const [lo, hi] = w ? w.damage : [10, 14];
  let dmg = battle.rng.int(lo, hi) * (sk.damageMult ?? 1);
  if (w?.twoHanded && attacker.hasPerk('bruteForce')) dmg *= 1.15;
  if (attacker.hasPerk('executioner') && target.hp < target.hpMax * 0.5) dmg *= 1.2;
  return dmg;
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
    const dmg = Math.round(battle.rng.int(12, 20) * (target.hasPerk('shieldExpert') ? 0.75 : 1));
    target.shield.durability = Math.max(0, target.shield.durability - dmg);
    res.shieldDamage = dmg;
    battle.log(`${attacker.name} 이(가) ${target.name} 의 방패를 내리쳤다 (-${dmg})`, 'hit', attacker.faction);
    if (target.shield.durability === 0) battle.log(`${target.name} 의 방패가 부서졌다!`, 'crit', attacker.faction);
  }

  const w = attacker.weapon;
  const raw = rollDamage(battle, attacker, target, sk);

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
    let armorMult = (w?.armorMult ?? 1) * (sk.armorMult ?? 1);
    if (attacker.hasPerk('duelist') && w && !w.twoHanded) armorMult *= 1.25;
    if (target.hasPerk('battleForged')) armorMult *= 0.75;

    const armorDmg = total * armorMult;
    const absorbed = Math.min(armorNow, armorDmg);
    const through = (armorDmg - absorbed) / armorMult; // raw-damage equivalent that got past
    hpDmg = total * (w?.armorPen ?? 0.2) + through;

    const applied = Math.round(absorbed);
    if (slot) slot.armor = Math.max(0, slot.armor - applied);
    res.armorDamage = applied;
  }

  if (head) hpDmg *= HEAD_DAMAGE_MULT * (target.hasPerk('steelBrow') ? 0.75 : 1);
  // Nimble trades armour for flesh: the lighter the kit, the bigger the cut.
  if (target.hasPerk('nimble')) hpDmg *= Math.max(0.55, 1 - (40 - Math.min(40, target.armorWeight)) / 40 * 0.45);
  if (target.hasPerk('killerInstinct')) hpDmg *= 1.1;
  res.hpDamage = Math.max(1, Math.round(hpDmg));

  target.hp -= res.hpDamage;

  const where = head ? '머리' : '몸통';
  battle.log(
    `${attacker.name} → ${target.name} ${where} 명중 (체력 -${res.hpDamage}${res.armorDamage ? `, 방어구 -${res.armorDamage}` : ''})`,
    head ? 'crit' : 'hit', attacker.faction,
  );

  const stunChance = 50 - target.resolve / 3 + (attacker.hasPerk('crippling') ? 25 : 0);
  if (sk.effect === 'stun' && head && battle.rng.chance(stunChance)) {
    target.stunned = 2;
    battle.log(`${target.name} 이(가) 기절했다!`, 'crit', attacker.faction);
  }

  if (attacker.hasPerk('overwhelm')) target.overwhelmed = 2;

  battle.bus.emit('attack:hit', res);

  if (target.hp <= 0 && target.hasPerk('nineLives') && !target.livesUsed) {
    target.livesUsed = true;
    target.hp = 1;
    battle.log(`${target.name} 이(가) 죽음의 문턱에서 버텼다!`, 'crit', target.faction);
  }

  // Whether this leaves a mark is settled after the battle, but the reason is
  // recorded here: end-of-fight health cannot tell a man who was nearly taken
  // apart from one who was never touched, because armour means most fighters
  // finish either dead or barely scratched.
  if (target.hp > 0 && target.faction === 'player') {
    const share = (res.hpDamage + res.armorDamage * LASTING_THROUGH_ARMOUR) / target.hpMax;
    if (share >= LASTING_BLOW || res.head) {
      target.injuryRisk = (target.injuryRisk || 0)
        + Math.round(share * LASTING_WEIGHT) + (res.head ? LASTING_HEAD : 0);
    }
  }

  if (target.hp <= 0) {
    res.killed = true;
    battle.killUnit(target, attacker);
    if (attacker.hasPerk('berserk')) attacker.ap = Math.min(attacker.maxAP, attacker.ap + 4);
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
  const banner = unit.hasCompany('banner') ? 10 : 0;
  const chance = clamp(50 + (unit.resolve - 40) + mod + banner, 5, 95);
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
