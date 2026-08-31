/**
 * Post-battle salvage. Survivors strip the better gear off the fallen, which is
 * the company's only source of progression until levelling lands.
 */

const MELEE_KINDS = ['sword', 'axe', 'mace', 'spear', 'dagger'];
const isMelee = (w) => w && MELEE_KINDS.includes(w.kind);
const value = (it) => (it ? it.value || 0 : 0);

/** Loose gear worth less than this is not worth carrying off the field. */
const KEEP_MIN_VALUE = 100;
/** How many spare pieces the company can haul away from one fight. */
const KEEP_MAX = 6;

/**
 * @param {Unit[]} survivors  living company members
 * @param {Unit[]} fallen     dead enemies to loot
 * @returns {{changes: {unit, slot, from, to}[], leftovers: string[]}}
 *   `changes` is what got worn on the spot; `leftovers` are item ids for the
 *   company stash, to be sold or handed out later.
 */
export function salvage(survivors, fallen) {
  const changes = [];
  const drops = { weapon: [], shield: [], body: [], head: [] };
  for (const d of fallen) {
    for (const slot of Object.keys(drops)) {
      if (d[slot]) drops[slot].push(d[slot]);
    }
  }

  const spare = [];
  for (const slot of ['body', 'head', 'weapon', 'shield']) {
    // Best first, so the biggest upgrade lands before the hand-me-downs.
    const queue = drops[slot].slice().sort((a, b) => value(b) - value(a));
    while (queue.length) {
      const item = queue.shift();
      const taker = survivors.length ? bestTaker(survivors, slot, item) : null;
      if (!taker) { spare.push(item); continue; }
      const old = taker[slot];
      changes.push({ unit: taker, slot, from: old?.name || '없음', to: item.name });
      equip(taker, slot, item);
      // What it replaced goes back in the queue for someone worse off. Each
      // pass strictly lowers the value on that brother, so this terminates.
      if (old?.id) queue.push({ ...old });
    }
  }

  const leftovers = spare
    .filter((it) => value(it) >= KEEP_MIN_VALUE)
    .sort((a, b) => value(b) - value(a))
    .slice(0, KEEP_MAX)
    .map((it) => it.id);

  return { changes, leftovers };
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
