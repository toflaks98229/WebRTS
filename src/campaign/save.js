/**
 * One save slot in localStorage.
 *
 * The world is not stored. It is generated from a seed, so the save keeps the
 * seed and rebuilds the identical island on load, then paints back the parts
 * that changed while it was played: contract boards, shop stock, who is
 * standing where. That keeps a save small and, more usefully, keeps it honest -
 * there is no way for a stored map to drift out of step with the generator.
 *
 * Everything here is explicit rather than a blind object dump. A save that
 * quietly carries half a class across a version boundary is worse than no save,
 * so `VERSION` is checked on the way in and anything that does not match is
 * discarded rather than patched.
 */
import { Campaign } from './campaign.js';
import { Unit, reserveUnitIds } from '../battle/unit.js';
import { TEMPLATES } from '../data/units.js';
import { WEAPONS, SHIELDS, BODY_ARMOR, HELMETS } from '../data/items.js';
import { RNG } from '../core/rng.js';

export const SAVE_KEY = 'mercenary-company/save';
export const VERSION = 1;

/** Units are rebuilt through the constructor, which wants an RNG it never uses. */
const scratch = new RNG(1);

// ------------------------------------------------------------------ units
function saveUnit(u) {
  return {
    id: u.id,
    tpl: u.template.id,
    name: u.name,
    faction: u.faction,
    hpBase: u.hpBase,
    fatigueBase: u.fatigueBase,
    resolveBase: u.resolveBase,
    initiativeBase: u.initiativeBase,
    meleeSkill: u.meleeSkill,
    rangedSkill: u.rangedSkill,
    meleeDefenseBase: u.meleeDefenseBase,
    rangedDefenseBase: u.rangedDefenseBase,
    level: u.level,
    xp: u.xp,
    perkPoints: u.perkPoints,
    perks: [...u.perks],
    isCaptain: u.isCaptain,
    hp: u.hp,
    kills: u.kills,
    // Only the parts of a kit that wear down need storing; the rest is a lookup.
    weapon: u.weapon ? u.weapon.id : null,
    shield: u.shield ? { id: u.shield.id, durability: u.shield.durability } : null,
    body: u.body ? { id: u.body.id, armor: u.body.armor } : null,
    head: u.head ? { id: u.head.id, armor: u.head.armor } : null,
    ammo: u.ammo ?? null,
    loaded: u.loaded ?? null,
  };
}

function reviveUnit(d) {
  const tpl = TEMPLATES[d.tpl] || TEMPLATES.militia;
  const u = new Unit(tpl, scratch, { faction: d.faction, name: d.name });
  u.id = d.id;
  for (const k of ['hpBase', 'fatigueBase', 'resolveBase', 'initiativeBase', 'meleeSkill',
    'rangedSkill', 'meleeDefenseBase', 'rangedDefenseBase', 'level', 'xp', 'perkPoints',
    'kills']) u[k] = d[k];
  u.isCaptain = !!d.isCaptain;
  u.perks = new Set(d.perks || []);

  u.weapon = d.weapon && WEAPONS[d.weapon] ? { ...WEAPONS[d.weapon] } : null;
  u.shield = d.shield && SHIELDS[d.shield.id]
    ? { ...SHIELDS[d.shield.id], max: SHIELDS[d.shield.id].durability, durability: d.shield.durability }
    : null;
  u.body = d.body && BODY_ARMOR[d.body.id]
    ? { ...BODY_ARMOR[d.body.id], max: BODY_ARMOR[d.body.id].armor, armor: d.body.armor }
    : null;
  u.head = d.head && HELMETS[d.head.id]
    ? { ...HELMETS[d.head.id], max: HELMETS[d.head.id].armor, armor: d.head.armor }
    : null;

  if (d.ammo != null) u.ammo = d.ammo;
  if (d.loaded != null) u.loaded = d.loaded;
  u.hp = Math.min(d.hp, u.hpMax);      // after perks, so Colossus is accounted for
  u.alive = u.hp > 0;
  return u;
}

// ----------------------------------------------------------------- parties
function saveParty(p) {
  return {
    id: p.id, name: p.name, hex: p.hex, path: p.path, spent: p.spent, sub: p.sub,
    alive: p.alive, roster: p.roster, strength: p.strength, speed: p.speed,
    campId: p.camp ? p.camp.id : null,
  };
}

function applyParty(target, d) {
  target.hex = d.hex;
  target.path = d.path || [];
  target.spent = d.spent || 0;
  target.sub = d.sub || 0;
  target.alive = d.alive !== false;
}

// -------------------------------------------------------------- serialise
export function serialize(c) {
  return {
    version: VERSION,
    seed: c.seed,
    cols: c.world.cols,
    rows: c.world.rows,
    rngSeed: c.rng.seed,

    time: c.time,
    lastPaidDay: c.lastPaidDay,
    ambitionId: c.ambitionId,
    ambitionDone: c.ambitionDone,
    threat: c.threat,
    campsCleared: c.campsCleared,
    battlesFought: c.battlesFought,
    fallen: c.fallen,
    log: c.log.slice(-60),

    company: {
      crowns: c.company.crowns,
      stash: c.company.stash.slice(),
      debtDays: c.company.debtDays,
      renown: c.company.renown,
      captainPerks: [...c.company.captainPerks],
      captainSpent: c.company.captainSpent,
      roster: c.company.roster.map(saveUnit),
    },

    party: saveParty(c.party),
    bands: c.bands.filter((b) => b.alive).map(saveParty),
    contracts: c.contracts,
    homeSettlementId: c.homeSettlement ? c.homeSettlement.id : null,

    // What the player changed about the places on the map.
    settlements: c.world.settlements.map((s) => ({
      id: s.id,
      board: s.board || [],
      stock: s.stock || [],
      refreshedDay: s.refreshedDay ?? 0,
      recruits: (s.recruits || []).map(saveUnit),
    })),
    camps: c.world.camps.map((k) => ({ id: k.id, cooldown: k.cooldown ?? 0 })),
  };
}

// ---------------------------------------------------------------- restore
export function deserialize(data) {
  if (!data || data.version !== VERSION) return null;

  // Same seed, same constructor: the island comes back identical, along with
  // its settlements and camps. Everything after this is repainting.
  const c = new Campaign({
    seed: data.seed,
    cols: data.cols,
    rows: data.rows,
    roster: [],
    crowns: 0,
    ambition: data.ambitionId,
  });

  const units = data.company.roster.map(reviveUnit);
  const recruits = data.settlements.map((s) => (s.recruits || []).map(reviveUnit));
  const highest = [...units, ...recruits.flat()].reduce((m, u) => Math.max(m, u.id), 0);
  reserveUnitIds(highest);

  c.rng.seed = data.rngSeed >>> 0;
  c.time = data.time;
  c.lastPaidDay = data.lastPaidDay;
  c.ambitionId = data.ambitionId;
  c.ambitionDone = !!data.ambitionDone;
  c.threat = data.threat || 0;
  c.campsCleared = data.campsCleared || 0;
  c.battlesFought = data.battlesFought || 0;
  c.fallen = data.fallen || 0;
  c.log = data.log || [];
  c.contracts = data.contracts || [];
  c.pendingEncounter = null;

  const co = c.company;
  co.roster = units;
  co.crowns = data.company.crowns;
  co.stash = data.company.stash || [];
  co.debtDays = data.company.debtDays || 0;
  co.renown = data.company.renown || 0;
  co.captainPerks = new Set(data.company.captainPerks || []);
  co.captainSpent = data.company.captainSpent || 0;

  applyParty(c.party, data.party);

  // Bands are rebuilt against the camps the generator just made.
  c.bands = (data.bands || []).map((b) => {
    const party = Object.create(Object.getPrototypeOf(c.party));
    Object.assign(party, {
      id: b.id, faction: 'enemy', name: b.name, speed: b.speed,
      roster: b.roster, strength: b.strength,
      camp: c.campById(b.campId) || null,
    });
    applyParty(party, b);
    return party;
  });

  c.homeSettlement = c.settlementById(data.homeSettlementId);

  for (const s of data.settlements) {
    const live = c.settlementById(s.id);
    if (!live) continue;
    live.board = s.board || [];
    live.stock = s.stock || [];
    live.refreshedDay = s.refreshedDay ?? 0;
    live.recruits = recruits[data.settlements.indexOf(s)] || [];
  }
  for (const k of data.camps || []) {
    const live = c.campById(k.id);
    if (live) live.cooldown = k.cooldown;
  }

  return c;
}

// ------------------------------------------------------------- the slot
export function writeSave(campaign) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(campaign)));
    return true;
  } catch { return false; }        // private mode, quota, anything: play on
}

/** The stored campaign, or null. A save we cannot read is a save we discard. */
export function readSave() {
  let raw;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    return deserialize(JSON.parse(raw));
  } catch {
    clearSave();                   // half a restored campaign is worse than none
    return null;
  }
}

export function hasSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return !!raw && JSON.parse(raw).version === VERSION;
  } catch { return false; }
}

/** A summary for the "carry on?" prompt, without building the campaign. */
export function savePeek() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!d || d.version !== VERSION) return null;
    return {
      day: Math.floor(d.time / 24) + 1,
      size: d.company.roster.filter((u) => u.hp > 0).length,
      crowns: d.company.crowns,
      ambitionId: d.ambitionId,
    };
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to do */ }
}
