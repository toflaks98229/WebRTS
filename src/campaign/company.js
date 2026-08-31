import { WEAPONS, SHIELDS, BODY_ARMOR, HELMETS } from '../data/items.js';

/** Fraction of an item's value a settlement will pay for it. */
export const SELL_RATE = 0.4;

/** Daily pay per head, by background. Elites are worth what they cost. */
export const WAGES = {
  sellsword: 22, hedgeKnight: 34, brawler: 14, militia: 13,
  poacher: 15, daytaler: 10, farmhand: 11,
};

/** Up-front fee to sign someone on. */
export const HIRE_COST = {
  sellsword: 420, hedgeKnight: 700, brawler: 220, militia: 200,
  poacher: 260, daytaler: 140, farmhand: 160,
};

export function wageOf(unit) { return WAGES[unit.template.id] ?? 14; }
export function hireCostOf(templateId) { return HIRE_COST[templateId] ?? 250; }

/**
 * Everything the mercenary company owns: its people, its purse and the gear it
 * has not put on anyone yet. Separate from the map token that carries it around.
 */
export class Company {
  constructor(roster = [], crowns = 900) {
    this.roster = roster;
    this.crowns = crowns;
    this.stash = [];          // loose item ids, sellable at a settlement
    this.debtDays = 0;        // consecutive days wages went unpaid
  }

  get alive() { return this.roster.filter((u) => u.alive); }
  get size() { return this.alive.length; }
  get dailyWage() { return this.alive.reduce((s, u) => s + wageOf(u), 0); }

  canAfford(cost) { return this.crowns >= cost; }
  spend(cost) { if (!this.canAfford(cost)) return false; this.crowns -= cost; return true; }
  earn(amount) { this.crowns += Math.round(amount); }

  add(unit) { this.roster.push(unit); return unit; }
  remove(unit) { this.roster = this.roster.filter((u) => u !== unit); }
  /** Drop the dead from the books; returns them so the caller can report. */
  buryDead() {
    const fallen = this.roster.filter((u) => !u.alive);
    this.roster = this.roster.filter((u) => u.alive);
    return fallen;
  }

  // ---------------------------------------------------------------- stash
  stashItem(id) { if (id) this.stash.push(id); }
  stashValue() { return this.stash.reduce((s, id) => s + (itemValue(id) * SELL_RATE), 0); }

  /** Sell one stashed item; returns the crowns gained, or 0 if not held. */
  sellFromStash(index) {
    const id = this.stash[index];
    if (!id) return 0;
    this.stash.splice(index, 1);
    const gain = Math.round(itemValue(id) * SELL_RATE);
    this.earn(gain);
    return gain;
  }

  sellAllStash() {
    let total = 0;
    while (this.stash.length) total += this.sellFromStash(0);
    return total;
  }
}

const ALL_ITEMS = { ...WEAPONS, ...SHIELDS, ...BODY_ARMOR, ...HELMETS };

export function itemDef(id) { return ALL_ITEMS[id] || null; }
export function itemValue(id) { return ALL_ITEMS[id]?.value ?? 0; }

/** Which equipment slot an item id belongs in. */
export function slotOf(id) {
  if (WEAPONS[id]) return 'weapon';
  if (SHIELDS[id]) return 'shield';
  if (BODY_ARMOR[id]) return 'body';
  if (HELMETS[id]) return 'head';
  return null;
}

/** Put a shop/stash item onto a brother, returning whatever it displaced. */
export function equipItem(unit, id) {
  const slot = slotOf(id);
  const def = itemDef(id);
  if (!slot || !def) return null;

  const displaced = [];
  const push = (item) => { if (item) displaced.push(item.id); };

  if (slot === 'weapon') {
    push(unit.weapon);
    unit.weapon = { ...def };
    if (unit.weapon.ammo) unit.ammo = unit.weapon.ammo;
    if (unit.weapon.kind === 'xbow') unit.loaded = true;
    // A two-hander leaves no hand for the shield.
    if (def.twoHanded && unit.shield) { push(unit.shield); unit.shield = null; }
  } else if (slot === 'shield') {
    if (unit.weapon?.twoHanded) return null;
    push(unit.shield);
    unit.shield = { ...def, durability: def.durability, max: def.durability };
  } else {
    push(unit[slot]);
    unit[slot] = { ...def, armor: def.armor, max: def.armor };
  }
  return displaced;
}
