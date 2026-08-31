/**
 * Post-battle salvage. Survivors strip the better gear off the fallen, which is
 * the company's only source of progression until levelling lands.
 */

const MELEE_KINDS = ['sword', 'axe', 'mace', 'spear', 'dagger'];
const isMelee = (w) => w && MELEE_KINDS.includes(w.kind);
const value = (it) => (it ? it.value || 0 : 0);

/**
 * @param {Unit[]} survivors  living company members
 * @param {Unit[]} fallen     dead enemies to loot
 * @returns {{unit, slot, from, to}[]} what changed, for the after-action report
 */
export function salvage(survivors, fallen) {
  const changes = [];
  if (!survivors.length) return changes;

  const drops = { weapon: [], shield: [], body: [], head: [] };
  for (const d of fallen) {
    for (const slot of Object.keys(drops)) {
      if (d[slot]) drops[slot].push(d[slot]);
    }
  }

  for (const slot of ['body', 'head', 'weapon', 'shield']) {
    const items = drops[slot].sort((a, b) => value(b) - value(a));
    for (const item of items) {
      const taker = bestTaker(survivors, slot, item);
      if (!taker) continue;
      const old = taker[slot];
      changes.push({ unit: taker, slot, from: old?.name || '없음', to: item.name });
      equip(taker, slot, item);
    }
  }
  return changes;
}

/** The survivor who gains the most from this item, or null if nobody does. */
function bestTaker(survivors, slot, item) {
  let best = null;
  for (const u of survivors) {
    if (!canUse(u, slot, item)) continue;
    const gain = value(item) - value(u[slot]);
    if (gain <= 0) continue;
    if (!best || gain > best.gain) best = { u, gain };
  }
  return best?.u || null;
}

function canUse(u, slot, item) {
  if (slot === 'weapon') {
    // Keep specialists specialised: archers stay archers, brawlers stay brawlers.
    if (isMelee(u.weapon) !== isMelee(item)) return false;
    // A two-hander means giving up the shield, so only offer it to a shieldless hand.
    if (item.twoHanded && u.shield) return false;
    return true;
  }
  if (slot === 'shield') return !u.weapon?.twoHanded;
  return true;
}

function equip(u, slot, item) {
  if (slot === 'body' || slot === 'head') {
    u[slot] = { ...item, armor: item.max ?? item.armor, max: item.max ?? item.armor };
  } else if (slot === 'shield') {
    u.shield = { ...item, durability: item.max ?? item.durability, max: item.max ?? item.durability };
  } else {
    u.weapon = { ...item };
    if (u.weapon.ammo) u.ammo = u.weapon.ammo;
    if (u.weapon.kind === 'xbow') u.loaded = true;
    if (u.weapon.twoHanded) u.shield = null;
  }
}
