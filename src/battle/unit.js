import { WEAPONS, SHIELDS, BODY_ARMOR, HELMETS, item } from '../data/items.js';
import { SKILLS } from '../data/skills.js';
import { randomName } from '../data/units.js';

export const MAX_AP = 9;
export const FATIGUE_RECOVERY = 15;

export const MORALE = {
  confident: { id: 'confident', name: '확신',   order: 4, hit: 5,   defense: 5,   color: '#7fb069' },
  steady:    { id: 'steady',    name: '침착',   order: 3, hit: 0,   defense: 0,   color: '#c8c0ae' },
  wavering:  { id: 'wavering',  name: '동요',   order: 2, hit: -10, defense: -10, color: '#d8b447' },
  breaking:  { id: 'breaking',  name: '붕괴',   order: 1, hit: -25, defense: -20, color: '#d97a2b' },
  fleeing:   { id: 'fleeing',   name: '패주',   order: 0, hit: -40, defense: -30, color: '#c2453a' },
};
const MORALE_LADDER = ['fleeing', 'breaking', 'wavering', 'steady', 'confident'];

let nextId = 1;

export class Unit {
  constructor(tpl, rng, opts = {}) {
    const roll = (range) => rng.int(range[0], range[1]);

    this.id = nextId++;
    this.template = tpl;
    this.faction = opts.faction || tpl.faction;
    this.name = opts.name || (this.faction === 'player' ? randomName(rng) : tpl.name);
    this.title = tpl.name;
    this.portrait = tpl.portrait;
    this.isBeast = !!tpl.beast;

    // Base attributes
    this.hpMax = roll(tpl.hp);
    this.fatigueBase = roll(tpl.fatigue);
    this.resolve = roll(tpl.resolve);
    this.initiativeBase = roll(tpl.initiative);
    this.meleeSkill = roll(tpl.meleeSkill);
    this.rangedSkill = roll(tpl.rangedSkill);
    this.meleeDefenseBase = roll(tpl.meleeDefense);
    this.rangedDefenseBase = roll(tpl.rangedDefense);

    // Equipment
    const g = tpl.gear || {};
    this.weapon = g.weapon ? { ...WEAPONS[g.weapon] } : null;
    this.shield = g.shield ? { ...SHIELDS[g.shield], max: SHIELDS[g.shield].durability } : null;
    this.body = g.body ? { ...BODY_ARMOR[g.body], max: BODY_ARMOR[g.body].armor } : null;
    this.head = g.head ? { ...HELMETS[g.head], max: HELMETS[g.head].armor } : null;
    if (this.weapon?.ammo) this.ammo = this.weapon.ammo;
    if (this.weapon?.kind === 'xbow') this.loaded = true;

    // Battle state
    this.hp = this.hpMax;
    this.fatigue = 0;
    this.ap = MAX_AP;
    this.hex = null;
    this.morale = 'steady';
    this.alive = true;
    this.stunned = 0;
    this.stances = new Set();   // shieldwall / spearwall / riposte, cleared each turn
    this.hasActed = false;
    this.waited = false;
    this.level = 1;
    this.xp = 0;
    this.kills = 0;
  }

  // ---- derived stats -------------------------------------------------
  get gearFatigue() {
    return (this.weapon?.fatigue || 0) + (this.shield?.fatigue || 0)
         + (this.body?.fatigue || 0) + (this.head?.fatigue || 0);
  }
  get fatigueMax() { return Math.max(20, this.fatigueBase - this.gearFatigue); }
  get fatigueLeft() { return Math.max(0, this.fatigueMax - this.fatigue); }
  /** 0..1 — how spent the unit is. Drives the defense penalty. */
  get exhaustion() { return this.fatigueMax ? this.fatigue / this.fatigueMax : 0; }

  get initiative() {
    return Math.max(0, Math.round(this.initiativeBase - this.fatigue - this.gearFatigue * 0.5));
  }

  get moraleDef() { return MORALE[this.morale]; }

  get meleeDefense() {
    let d = this.meleeDefenseBase;
    if (this.shield && this.shield.durability > 0) d += this.shield.meleeDefense;
    if (this.stances.has('shieldwall') && this.shield?.durability > 0) d += this.shield.meleeDefense;
    d += this.moraleDef.defense;
    d -= Math.round(this.exhaustion * 15);
    if (this.stunned > 0) d -= 20;
    return d;
  }

  get rangedDefense() {
    let d = this.rangedDefenseBase;
    if (this.shield && this.shield.durability > 0) d += this.shield.rangedDefense;
    if (this.stances.has('shieldwall') && this.shield?.durability > 0) d += this.shield.rangedDefense;
    d += this.moraleDef.defense;
    d -= Math.round(this.exhaustion * 15);
    if (this.stunned > 0) d -= 20;
    return d;
  }

  get armorTotal() { return (this.body?.armor || 0) + (this.head?.armor || 0); }
  get armorMax() { return (this.body?.max || 0) + (this.head?.max || 0); }

  /** Skills currently usable: weapon skills plus innate ones. */
  get skills() {
    const ids = [];
    if (this.weapon?.skills) ids.push(...this.weapon.skills);
    if (this.shield && this.shield.durability > 0) ids.push('shieldwall', 'shieldBash');
    ids.push('recover');
    return ids.map((id) => SKILLS[id]).filter(Boolean);
  }

  reach(sk) {
    if (!this.weapon) return 1;
    if (sk?.type === 'ranged') return this.weapon.range;
    return this.weapon.range || 1;
  }

  minRange(sk) {
    if (sk?.type === 'ranged') return this.weapon?.minRange || 1;
    return 1;
  }

  canAfford(sk) {
    if (this.ap < sk.ap) return false;
    if (sk.fatigue > this.fatigueLeft) return false;
    if (sk.consumes && (this.ammo || 0) < sk.consumes) return false;
    if (sk.effect === 'needsReload' && this.loaded === false) return false;
    if (sk.id === 'reload' && this.loaded !== false) return false;
    return true;
  }

  spend(sk) {
    this.ap -= sk.ap;
    this.fatigue = Math.min(this.fatigueMax, this.fatigue + sk.fatigue);
    if (sk.consumes) this.ammo -= sk.consumes;
    if (sk.effect === 'needsReload') this.loaded = false;
    if (sk.effect === 'reload') this.loaded = true;
  }

  /** Patch a survivor back up between battles (armour repaired, wounds tended). */
  resetForBattle() {
    this.hp = this.hpMax;
    this.fatigue = 0;
    this.ap = MAX_AP;
    this.morale = 'steady';
    this.alive = true;
    this.stunned = 0;
    this.stances.clear();
    this.hasActed = false;
    this.waited = false;
    if (this.body) this.body.armor = this.body.max;
    if (this.head) this.head.armor = this.head.max;
    if (this.shield) this.shield.durability = this.shield.max;
    if (this.weapon?.ammo) this.ammo = this.weapon.ammo;
    if (this.weapon?.kind === 'xbow') this.loaded = true;
    return this;
  }

  // ---- turn lifecycle ------------------------------------------------
  beginTurn() {
    this.ap = MAX_AP;
    this.fatigue = Math.max(0, this.fatigue - FATIGUE_RECOVERY);
    this.stances.clear();
    this.waited = false;
    if (this.stunned > 0) { this.stunned--; this.ap = Math.floor(MAX_AP / 2); }
  }

  endTurn() { this.hasActed = true; }

  // ---- morale --------------------------------------------------------
  shiftMorale(steps) {
    const i = MORALE_LADDER.indexOf(this.morale);
    const n = Math.max(0, Math.min(MORALE_LADDER.length - 1, i + steps));
    const changed = MORALE_LADDER[n] !== this.morale;
    this.morale = MORALE_LADDER[n];
    return changed;
  }

  get isFleeing() { return this.morale === 'fleeing'; }
}

export function makeUnit(tpl, rng, opts) { return new Unit(tpl, rng, opts); }
export { item };
