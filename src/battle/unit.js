import { WEAPONS, SHIELDS, BODY_ARMOR, HELMETS, item } from '../data/items.js';
import { SKILLS } from '../data/skills.js';
import { randomName } from '../data/units.js';
import { levelForXP, MAX_LEVEL, PERKS } from '../data/perks.js';
import { injuryMod } from '../data/injuries.js';

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

/** Attribute gain rolled at each level-up, as [min, max]. */
const LEVEL_GAINS = {
  hpBase: [2, 5], fatigueBase: [2, 6], resolveBase: [1, 3], initiativeBase: [1, 4],
  meleeSkillBase: [1, 3], rangedSkillBase: [1, 3], meleeDefenseBase: [0, 2], rangedDefenseBase: [0, 2],
};

let nextId = 1;

/**
 * Keep freshly minted units clear of ids restored from a save. Called once on
 * load with the highest id that came back.
 */
export function reserveUnitIds(highest) { nextId = Math.max(nextId, (highest | 0) + 1); }

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

    // Base attributes. Perks scale several of these, so the rolled value is
    // kept as `*Base` and the effective number is a getter.
    this.hpBase = roll(tpl.hp);
    this.fatigueBase = roll(tpl.fatigue);
    this.resolveBase = roll(tpl.resolve);
    this.initiativeBase = roll(tpl.initiative);
    this.meleeSkillBase = roll(tpl.meleeSkill);
    this.rangedSkillBase = roll(tpl.rangedSkill);
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

    // Progression
    this.level = 1;
    this.xp = 0;
    this.perkPoints = 0;
    this.perks = new Set();
    this.isCaptain = !!opts.captain;
    /**
     * Lasting wounds, by id. Unlike hit points these never come back on their
     * own - a healer has to take them off. See data/injuries.js.
     */
    this.injuries = new Set();
    /** Captain-tree nodes in force for this unit's side; set when a battle starts. */
    this.companyPerks = new Set();

    // Battle state
    this.hp = this.hpMax;
    this.fatigue = 0;
    this.ap = MAX_AP;
    this.hex = null;
    this.morale = 'steady';
    this.alive = true;
    this.stunned = 0;
    this.withdrawn = false;     // ran off the field; out of the fight, not dead
    this.overwhelmed = 0;       // rounds of the Overwhelm penalty left
    this.livesUsed = false;     // Nine Lives, once per battle
    this.injuryRisk = 0;        // banked by heavy blows; cashed in when the fight ends
    this.stances = new Set();
    this.hasActed = false;
    this.waited = false;
    this.kills = 0;
  }

  // ---- perks ---------------------------------------------------------
  hasPerk(id) { return this.perks.has(id); }
  /** Captain-tree node active for this unit's company. */
  hasCompany(id) { return this.companyPerks.has(id); }
  /** Captain-tree nodes that only apply to the captain themselves. */
  hasCaptainPerk(id) { return this.isCaptain && this.companyPerks.has(id); }

  takePerk(id) {
    if (!PERKS[id] || this.perks.has(id)) return false;
    if (this.perkPoints < 1) return false;
    if (PERKS[id].tier > this.level) return false;
    this.perks.add(id);
    this.perkPoints--;
    return true;
  }

  /**
   * Award experience and apply any level-ups. Returns how many levels were
   * gained so the caller can announce them.
   */
  gainXP(amount, rng) {
    if (this.level >= MAX_LEVEL) return 0;
    const bonus = this.hasPerk('student') ? 1.3 : 1;
    this.xp += Math.round(amount * bonus);
    const target = Math.min(MAX_LEVEL, levelForXP(this.xp));
    let gained = 0;
    while (this.level < target) {
      this.level++;
      this.perkPoints++;
      gained++;
      if (rng) {
        for (const [attr, [lo, hi]] of Object.entries(LEVEL_GAINS)) this[attr] += rng.int(lo, hi);
        this.hp = Math.min(this.hpMax, this.hp + 4);
      }
    }
    return gained;
  }

  // ---- derived stats -------------------------------------------------
  /** What a fighter's wounds take off one stat. Zero for the unhurt. */
  hurt(stat) { return injuryMod(this, stat); }

  get hpMax() { return Math.round(this.hpBase * (this.hasPerk('colossus') ? 1.2 : 1)); }

  get meleeSkill() { return Math.max(0, this.meleeSkillBase + this.hurt('melee')); }
  get rangedSkill() { return Math.max(0, this.rangedSkillBase + this.hurt('ranged')); }

  get resolve() {
    let r = this.resolveBase + this.hurt('resolve');
    if (this.hasCompany('rally')) r += 10;
    if (this.hasPerk('fortifiedMind')) r = Math.round(r * 1.25);
    return r;
  }

  get gearFatigue() {
    const handHeld = (this.weapon?.fatigue || 0) + (this.shield?.fatigue || 0);
    const worn = (this.body?.fatigue || 0) + (this.head?.fatigue || 0);
    let total = (this.hasPerk('bagsAndBelts') ? handHeld * 0.5 : handHeld) + worn;
    if (this.hasPerk('brawny')) total *= 0.8;
    return Math.round(total);
  }

  get fatigueMax() {
    let base = this.fatigueBase;
    if (this.hasCompany('discipline')) base += 10;
    if (this.hasPerk('brawny')) base = Math.round(base * 1.15);
    return Math.max(20, base - this.gearFatigue + this.hurt('fatigue'));
  }
  get fatigueLeft() { return Math.max(0, this.fatigueMax - this.fatigue); }
  /** 0..1 - how spent the unit is. Drives the defense penalty. */
  get exhaustion() { return this.fatigueMax ? this.fatigue / this.fatigueMax : 0; }

  get maxAP() {
    return Math.max(4, MAX_AP + (this.hasCaptainPerk('warlord') ? 1 : 0) + this.hurt('ap'));
  }

  get fatigueRecovery() { return this.hasPerk('relentless') ? 25 : FATIGUE_RECOVERY; }

  get initiative() {
    return Math.max(0, Math.round(this.initiativeBase + this.hurt('initiative')
      - this.fatigue - this.gearFatigue * 0.5));
  }

  get moraleDef() { return MORALE[this.morale]; }

  /** Morale penalties, halved by Indomitable and ignored by the captain's node. */
  get moraleHit() {
    const v = this.moraleDef.hit;
    if (v >= 0) return v;
    return this.hasPerk('indomitable') ? Math.round(v / 2) : v;
  }

  get moraleDefense() {
    const v = this.moraleDef.defense;
    if (v >= 0) return v;
    return this.hasPerk('indomitable') ? Math.round(v / 2) : v;
  }

  /** Shield contribution, boosted by Shield Expert. */
  shieldBonus(kind) {
    if (!this.shield || this.shield.durability <= 0) return 0;
    const base = kind === 'ranged' ? this.shield.rangedDefense : this.shield.meleeDefense;
    const grip = 1 + this.hurt('shield');       // a ruined hand cannot brace a shield
    return Math.max(0, Math.round(base * (this.hasPerk('shieldExpert') ? 1.25 : 1) * grip));
  }

  /** Extra defense as wounds mount, from Last Stand. */
  get lastStandBonus() {
    if (!this.hasPerk('lastStand')) return 0;
    return Math.round((1 - this.hp / this.hpMax) * 20);
  }

  defenseCommon() {
    let d = this.moraleDefense - Math.round(this.exhaustion * 15) + this.lastStandBonus;
    if (this.stunned > 0) d -= 20;
    if (this.hasCaptainPerk('champion')) d += 8;
    return d;
  }

  get meleeDefense() {
    let d = this.meleeDefenseBase + this.shieldBonus('melee');
    if (this.stances.has('shieldwall')) d += this.shieldBonus('melee');
    return d + this.defenseCommon();
  }

  get rangedDefense() {
    let d = this.rangedDefenseBase + this.shieldBonus('ranged');
    if (this.stances.has('shieldwall')) d += this.shieldBonus('ranged');
    if (this.hasPerk('anticipation')) d += 12;
    return d + this.defenseCommon();
  }

  get armorTotal() { return (this.body?.armor || 0) + (this.head?.armor || 0); }
  get armorMax() { return (this.body?.max || 0) + (this.head?.max || 0); }
  /** Total worn armour, used by Nimble - light kit, big reduction. */
  get armorWeight() { return (this.body?.fatigue || 0) + (this.head?.fatigue || 0); }

  /** Skills currently usable: weapon skills plus innate ones. */
  get skills() {
    const ids = [];
    if (this.weapon?.skills) ids.push(...this.weapon.skills);
    if (this.shield && this.shield.durability > 0) ids.push('shieldwall', 'shieldBash');
    ids.push('recover');
    return ids.map((id) => SKILLS[id]).filter(Boolean);
  }

  /**
   * How far this skill can strike. A bow or a javelin's `range` is how far the
   * missile flies, not how far its owner can stab with it, so anything with a
   * minimum range falls back to arm's length in melee.
   */
  /**
   * The plain swing this fighter counters with. Skills that carry an effect -
   * a shield bash, a shield split - are set-up moves, not reactions.
   */
  counterSkill() {
    return this.skills.find((s) => s.type === 'melee' && !s.effect) || null;
  }

  reach(sk) {
    const w = this.weapon;
    if (!w) return 1;
    if (sk?.type === 'ranged') return w.range || 1;
    return w.minRange ? 1 : (w.range || 1);
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

  /**
   * Clear per-battle state without touching wounds. Used when a campaign fight
   * starts: injuries and battered armour are supposed to carry over.
   */
  prepareForBattle() {
    this.fatigue = 0;
    this.ap = this.maxAP;
    this.morale = 'steady';
    this.stunned = 0;
    this.withdrawn = false;
    this.overwhelmed = 0;
    this.livesUsed = false;
    this.injuryRisk = 0;
    this.stances.clear();
    this.hasActed = false;
    this.waited = false;
    this.turnRound = -1;
    if (this.weapon?.ammo) this.ammo = this.weapon.ammo;
    if (this.weapon?.kind === 'xbow') this.loaded = true;
    return this;
  }

  /** Patch a survivor all the way back up (armour repaired, wounds tended). */
  resetForBattle() {
    this.prepareForBattle();
    this.hp = this.hpMax;
    this.alive = true;
    if (this.body) this.body.armor = this.body.max;
    if (this.head) this.head.armor = this.head.max;
    if (this.shield) this.shield.durability = this.shield.max;
    return this;
  }

  // ---- turn lifecycle ------------------------------------------------
  beginTurn() {
    this.ap = this.maxAP;
    this.fatigue = Math.max(0, this.fatigue - this.fatigueRecovery);
    this.stances.clear();
    this.waited = false;
    if (this.overwhelmed > 0) this.overwhelmed--;
    if (this.stunned > 0) { this.stunned--; this.ap = Math.floor(this.maxAP / 2); }
  }

  endTurn() { this.hasActed = true; }

  // ---- morale --------------------------------------------------------
  shiftMorale(steps) {
    // The captain's own resolve is a company fixture.
    if (steps < 0 && this.hasCaptainPerk('unbreakable')) return false;
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
