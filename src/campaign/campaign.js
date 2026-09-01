import { key, distance, eq, neighbors } from '../hex/hex.js';
import { EventBus } from '../core/events.js';
import { RNG } from '../core/rng.js';
import { World, SETTLEMENTS } from './world.js';
import { bandComposition, bandName } from './bands.js';
import { Company } from './company.js';
import { generateContracts, boardSize, daysLeft } from './contracts.js';
import { WEAPONS, SHIELDS, BODY_ARMOR, HELMETS } from '../data/items.js';
import { Unit } from '../battle/unit.js';
import { TEMPLATES } from '../data/units.js';
import { hireCostOf, itemValue, slotOf, equipItem } from './company.js';
import { CAPTAIN_NODES, nodeAvailable, pointsFromRenown } from '../data/captainTree.js';
import { THREAT_MAX, THREAT_PER_CLEAR, threatRise } from './threat.js';
import { DEFAULT_AMBITION, ambitionProgress } from '../data/ambitions.js';

/** Backgrounds that turn up looking for work, roughly worst to best. */
const RECRUIT_POOL = ['daytaler', 'farmhand', 'militia', 'brawler', 'poacher', 'sellsword', 'hedgeKnight'];

export const HOURS_PER_DAY = 24;
/** Real seconds per in-game hour at normal speed. */
export const HOUR_SECONDS = 0.22;
const DETECT_RANGE = 4;
const CAMP_RESPAWN_DAYS = 4;
const BOARD_REFRESH_DAYS = 6;

/** A token moving on the overworld: the company, or a roaming band. */
export class Party {
  constructor({ id, faction, name, hex, speed = 1, roster = [], camp = null, strength = 1 }) {
    this.id = id;
    this.faction = faction;
    this.name = name;
    this.hex = hex;
    this.speed = speed;
    this.roster = roster;        // template ids, for enemy bands
    this.camp = camp;
    this.strength = strength;
    this.path = [];
    this.spent = 0;              // hours accumulated toward the next tile
    this.sub = 0;                // 0..1 between hex and path[0], for rendering
    this.alive = true;
  }

  get moving() { return this.path.length > 0; }
  get target() { return this.path.length ? this.path[this.path.length - 1] : null; }

  stop() { this.path = []; this.spent = 0; this.sub = 0; }
}

/**
 * The campaign layer: world map, travel, roaming bands, contracts, wages and
 * the passage of time. It never touches the DOM, so it can be stepped headlessly.
 *
 * `party` is the token on the map; `company` is the roster, purse and stash it
 * carries.
 */
export class Campaign {
  constructor({ seed, cols = 28, rows = 18, roster = [], crowns = 900,
    ambition = DEFAULT_AMBITION } = {}) {
    this.rng = new RNG(seed);
    /** The world is regenerated from this on load, never stored. */
    this.seed = this.rng.seed;
    this.bus = new EventBus();
    this.world = new World(cols, rows).generate(this.rng);
    this.company = new Company(roster, crowns);
    this.time = 6;               // hours since the campaign began; start at dawn
    this.lastPaidDay = 1;
    this.paused = false;
    this.log = [];
    this.bands = [];
    this.contracts = [];         // taken contracts, in progress
    this.pendingEncounter = null;

    /** What this run is played for; the only thing that ends it. */
    this.ambitionId = ambition;
    this.ambitionDone = false;
    /** 0-100. Drives band composition; see campaign/threat.js. */
    this.threat = 0;
    this.campsCleared = 0;
    this.battlesFought = 0;
    this.fallen = 0;

    const start = this.world.startingSettlement();
    this.party = new Party({
      id: 'company',
      faction: 'player',
      name: '용병단',
      hex: start ? start.hex : this.world.all().find((t) => this.world.passable(t.hex)).hex,
      speed: 1,
    });
    this.homeSettlement = start;

    for (const camp of this.world.camps) this.spawnBand(camp);
    for (const s of this.world.settlements) this.refreshSettlement(s);
    this.note(start ? `${start.name} 에서 용병단을 꾸렸다.` : '용병단이 길을 나섰다.', 'start');
  }

  get roster() { return this.company.roster; }
  get day() { return Math.floor(this.time / HOURS_PER_DAY) + 1; }
  get hourOfDay() { return Math.floor(this.time % HOURS_PER_DAY); }
  get isNight() { const h = this.hourOfDay; return h < 6 || h >= 20; }

  note(text, kind = 'info') {
    const entry = { text, kind, day: this.day };
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
    this.bus.emit('log', entry);
  }

  // ---------------------------------------------------------------- parties
  spawnBand(camp) {
    const roster = bandComposition(this.rng, camp.strength, this.threat);
    const band = new Party({
      id: `band${this.bands.length}-${Math.floor(this.time)}`,
      faction: 'enemy',
      name: bandName(camp.strength),
      hex: camp.hex,
      speed: 0.9 + camp.strength * 0.06,
      roster,
      camp,
      strength: camp.strength,
    });
    this.bands.push(band);
    camp.cooldown = 0;
    return band;
  }

  partyAt(hex) {
    if (eq(this.party.hex, hex)) return this.party;
    return this.bands.find((b) => b.alive && eq(b.hex, hex)) || null;
  }

  settlementAt(hex) { return this.world.get(hex)?.settlement || null; }
  settlementById(id) { return this.world.settlements.find((s) => s.id === id) || null; }
  campById(id) { return this.world.camps.find((c) => c.id === id) || null; }

  /** Order the company somewhere. Returns false when there is no route. */
  setDestination(hex) {
    if (!this.world.has(hex) || !this.world.passable(hex)) return false;
    if (eq(hex, this.party.hex)) { this.party.stop(); return true; }
    const path = this.world.findPath(this.party.hex, hex);
    if (!path || path.length < 2) return false;
    this.party.path = path.slice(1);        // path[0] is where we already stand
    this.party.spent = 0;
    this.party.sub = 0;
    return true;
  }

  /** Preview the route and its cost without committing to it. */
  previewRoute(hex) {
    if (!this.world.has(hex) || !this.world.passable(hex)) return null;
    const path = this.world.findPath(this.party.hex, hex);
    if (!path || path.length < 2) return null;
    const steps = path.slice(1);
    const hours = steps.reduce((s, h) => s + (this.world.travelCost(h) ?? 0), 0) / this.party.speed;
    return { path: steps, hours };
  }

  // ---------------------------------------------------------------- tick
  /**
   * Advance the world by `hours`. Stops early - and returns - the moment an
   * encounter triggers, so no time passes while the player is in a fight.
   */
  update(hours) {
    if (this.paused || this.pendingEncounter) return;

    const step = Math.min(hours, 0.5);       // keep encounter checks fine-grained
    let left = hours;
    while (left > 0 && !this.pendingEncounter) {
      const dt = Math.min(step, left);
      left -= dt;
      this.time += dt;

      this.advance(this.party, dt);
      for (const b of this.bands) if (b.alive) { this.steerBand(b); this.advance(b, dt); }

      this.rest(dt);
      this.raiseThreat(dt);
      this.checkContact();
      this.respawnCamps(dt);
      this.checkDayRollover();
      this.checkAmbition();
    }
  }

  /** Camps left standing make the country worse, a little at a time. */
  raiseThreat(hours) {
    const live = this.bands.filter((b) => b.alive && b.camp).length;
    this.threat = Math.min(THREAT_MAX, this.threat + threatRise(hours / HOURS_PER_DAY, live));
  }

  /** Fires once, when the company has done what it set out to do. */
  checkAmbition() {
    if (this.ambitionDone) return;
    const p = ambitionProgress(this);
    if (!p.done) return;
    this.ambitionDone = true;
    this.paused = true;
    this.note(`${p.def.name} — 뜻을 이루었다.`, 'renown');
    this.bus.emit('ambition:done', { progress: p, campaign: this });
  }

  advance(party, hours) {
    if (!party.path.length) { party.sub = 0; return; }
    const next = party.path[0];
    const cost = this.world.travelCost(next);
    if (cost == null) { party.stop(); return; }

    const need = cost / party.speed;
    party.spent += hours;
    party.sub = Math.min(1, party.spent / need);
    if (party.spent < need) return;

    party.hex = next;
    party.path.shift();
    party.spent = 0;
    party.sub = 0;

    if (party === this.party) {
      const s = this.settlementAt(party.hex);
      if (s) { this.note(`${s.name} 에 도착했다.`, 'arrive'); this.onEnterSettlement(s); }
      if (!party.path.length) this.bus.emit('company:arrived', { hex: party.hex, settlement: s });
    }
  }

  /** Bands loiter near their camp until the company strays too close. */
  steerBand(band) {
    if (distance(band.hex, this.party.hex) <= DETECT_RANGE) {
      // Re-path each time the quarry moves, otherwise the chase goes stale.
      const t = band.target;
      if (!t || !eq(t, this.party.hex)) {
        const path = this.world.findPath(band.hex, this.party.hex);
        if (path && path.length > 1) { band.path = path.slice(1); band.spent = 0; }
      }
      return;
    }
    if (band.moving) return;

    const home = band.camp ? band.camp.hex : band.hex;
    const spots = neighbors(home)
      .concat(neighbors(band.hex))
      .filter((h) => this.world.passable(h) && distance(h, home) <= 3);
    if (!spots.length) return;
    const path = this.world.findPath(band.hex, this.rng.pick(spots));
    if (path && path.length > 1) { band.path = path.slice(1); band.spent = 0; }
  }

  checkContact() {
    for (const b of this.bands) {
      if (!b.alive) continue;
      if (distance(b.hex, this.party.hex) > 0) continue;
      this.beginEncounter(b);
      return;
    }
  }

  beginEncounter(band) {
    this.party.stop();
    band.stop();
    this.pendingEncounter = band;
    this.note(`${band.name} 와(과) 마주쳤다!`, 'battle');
    this.bus.emit('encounter', {
      band,
      biome: this.world.terrainAt(this.party.hex).biome,
      tile: this.world.get(this.party.hex),
    });
  }

  /** Called by the battle scene once the fight is over. */
  resolveEncounter(result) {
    const band = this.pendingEncounter;
    this.pendingEncounter = null;
    if (!band) return;

    this.battlesFought++;
    if (result === 'victory') {
      band.alive = false;
      if (band.camp) {
        band.camp.cooldown = CAMP_RESPAWN_DAYS * HOURS_PER_DAY;
        this.campsCleared++;
        this.threat = Math.max(0, this.threat - THREAT_PER_CLEAR);
        this.onCampCleared(band.camp);
      }
      this.gainRenown(band.roster.length * 4, false);
      this.note(`${band.name} 을(를) 물리쳤다.`, 'victory');
    } else {
      // Survivors scatter back the way they came rather than being wiped out.
      const away = neighbors(this.party.hex)
        .filter((h) => this.world.passable(h))
        .sort((a, c) => distance(c, band.hex) - distance(a, band.hex))[0];
      if (away) this.party.hex = away;
      this.party.stop();
      band.stop();
      this.time += 8;
      this.note('간신히 몸을 빼냈다. 부대가 흩어졌다 다시 모였다.', 'defeat');
    }
    this.bus.emit('encounter:resolved', { result, band });
  }

  respawnCamps(hours) {
    for (const camp of this.world.camps) {
      if (this.bands.some((b) => b.alive && b.camp === camp)) continue;
      camp.cooldown = (camp.cooldown ?? 0) - hours;
      if (camp.cooldown <= 0) {
        this.spawnBand(camp);
        camp.cooldown = CAMP_RESPAWN_DAYS * HOURS_PER_DAY;
      }
    }
  }

  /**
   * Idling in a settlement patches the company up. Deliberately slow - a bad
   * mauling should cost days, otherwise wounds carry no weight.
   */
  rest(hours) {
    if (this.party.moving) return;
    const s = this.settlementAt(this.party.hex);
    if (!s) return;
    const rate = SETTLEMENTS[s.tier].size    // village 1, town 2, city 3
      * (this.company.captainPerks.has('surgeon') ? 2 : 1);
    for (const u of this.roster) {
      if (!u.alive) continue;
      u.hp = Math.min(u.hpMax, u.hp + hours * rate * 0.25);
      if (u.body) u.body.armor = Math.min(u.body.max, u.body.armor + hours * rate * 0.6);
      if (u.head) u.head.armor = Math.min(u.head.max, u.head.armor + hours * rate * 0.5);
      if (u.shield) u.shield.durability = Math.min(u.shield.max, u.shield.durability + hours * rate * 0.3);
    }
  }

  // ---------------------------------------------------------------- upkeep
  checkDayRollover() {
    const before = this.lastPaidDay;
    while (this.lastPaidDay < this.day) {
      this.lastPaidDay++;
      this.payWages();
      this.expireContracts();
      this.refreshBoards();
    }
    if (this.lastPaidDay !== before) this.bus.emit('day', { day: this.day });
  }

  /** Wages come out every dawn. Miss too many and people walk. */
  payWages() {
    const due = this.company.dailyWage;
    if (!due) return;
    if (this.company.spend(due)) {
      this.company.debtDays = 0;
      this.bus.emit('wages', { paid: due });
      return;
    }
    this.company.debtDays++;
    this.note(`급여 ${due} 크라운을 치르지 못했다. (${this.company.debtDays}일째)`, 'debt');
    if (this.company.debtDays >= 2 && this.company.size > 1) {
      const quitter = this.rng.pick(this.company.alive);
      this.company.remove(quitter);
      this.company.debtDays = 0;
      this.note(`${quitter.name} 이(가) 삯을 못 받고 떠났다.`, 'debt');
      const promoted = this.company.ensureCaptain();
      if (promoted) this.note(`${promoted.name} 이(가) 새 단장이 되었다.`, 'renown');
      this.bus.emit('desertion', { unit: quitter });
    }
  }

  // ---------------------------------------------------------------- settlements
  /** Roll a settlement's contract board and shop stock. */
  refreshSettlement(s) {
    s.board = generateContracts(this, s, boardSize(s));
    s.refreshedDay = this.day;
    s.stock = this.rollStock(s);
    s.recruits = this.rollRecruits(s);
  }

  refreshBoards() {
    for (const s of this.world.settlements) {
      if (this.day - (s.refreshedDay ?? 0) < BOARD_REFRESH_DAYS) continue;
      // Keep anything the player has already taken; replace the rest.
      s.board = generateContracts(this, s, boardSize(s));
      s.refreshedDay = this.day;
      s.stock = this.rollStock(s);
      s.recruits = this.rollRecruits(s);
    }
  }

  /**
   * People looking for work. Rolled as real Units so the player can read their
   * actual numbers before paying - a recruit is a gamble, not a template.
   */
  rollRecruits(s) {
    const tier = SETTLEMENTS[s.tier].size;
    const reach = 3 + tier;      // bigger places attract better swords
    const out = [];
    for (let i = 0, n = 1 + tier; i < n; i++) {
      const id = RECRUIT_POOL[this.rng.int(0, Math.min(RECRUIT_POOL.length - 1, reach))];
      out.push(new Unit(TEMPLATES[id], this.rng, { faction: 'player' }));
    }
    return out;
  }

  hire(unit, settlement, maxSize) {
    const cost = hireCostOf(unit.template.id);
    if (maxSize && this.company.size >= maxSize) return { ok: false, reason: 'full' };
    if (!this.company.canAfford(cost)) return { ok: false, reason: 'crowns', cost };
    this.company.spend(cost);
    this.company.add(unit);
    settlement.recruits = settlement.recruits.filter((r) => r !== unit);
    this.note(`${unit.name} (${unit.title}) 을(를) ${cost} 크라운에 고용했다.`, 'hire');
    this.bus.emit('roster:change', { unit });
    return { ok: true, cost };
  }

  buy(itemId, settlement) {
    const price = this.priceOf(itemId);
    if (!this.company.canAfford(price)) return { ok: false, reason: 'crowns', price };
    this.company.spend(price);
    this.company.stashItem(itemId);
    settlement.stock = settlement.stock.filter((id) => id !== itemId);
    return { ok: true, price };
  }

  /** What a shop actually charges, after the captain's haggling. */
  priceOf(itemId) {
    return Math.round(itemValue(itemId) * (this.company.captainPerks.has('haggler') ? 0.85 : 1));
  }

  /** Move a stashed item onto a brother; anything it displaces goes back in. */
  equipFromStash(index, unit) {
    const id = this.company.stash[index];
    if (!id || !slotOf(id)) return false;
    const displaced = equipItem(unit, id);
    if (!displaced) return false;
    this.company.stash.splice(index, 1);
    for (const old of displaced) this.company.stashItem(old);
    this.bus.emit('roster:change', { unit });
    return true;
  }

  /** Gear a settlement has for sale, weighted by how big the place is. */
  rollStock(s) {
    const tier = SETTLEMENTS[s.tier].size;
    const cap = [900, 2600, 6000][tier - 1] ?? 900;
    const pool = [...Object.values(WEAPONS), ...Object.values(SHIELDS),
      ...Object.values(BODY_ARMOR), ...Object.values(HELMETS)]
      .filter((it) => it.value <= cap);
    const stock = [];
    for (let i = 0, n = 3 + tier * 2; i < n; i++) stock.push(this.rng.pick(pool).id);
    return [...new Set(stock)];
  }

  onEnterSettlement(s) {
    // Hand in anything that was waiting on a return trip.
    for (const c of this.contracts.filter((x) => x.state === 'reported' && x.issuerId === s.id)) {
      this.completeContract(c);
    }
    for (const c of this.contracts.filter((x) => x.state === 'active' && x.type === 'escort' && x.destId === s.id)) {
      this.completeContract(c);
    }
  }

  // ---------------------------------------------------------------- contracts
  takeContract(contract) {
    const s = this.settlementById(contract.issuerId);
    if (!s) return false;
    if (this.contracts.some((c) => c.id === contract.id)) return false;
    contract.state = 'active';
    contract.issuedDay = this.day;
    s.board = s.board.filter((c) => c.id !== contract.id);
    this.contracts.push(contract);
    this.note(`계약을 맡았다 — ${contract.title} (${contract.reward} 크라운)`, 'contract');
    this.bus.emit('contract:taken', { contract });
    return true;
  }

  /** A bandit contract's objective is met the moment its camp is cleared. */
  onCampCleared(camp) {
    for (const c of this.contracts) {
      if (c.state !== 'active' || c.type !== 'bandits' || c.campId !== camp.id) continue;
      c.state = 'reported';
      this.note(`${c.title} — 목표 완수. ${c.issuerName} 로 돌아가 보고하라.`, 'contract');
      this.bus.emit('contract:objective', { contract: c });
    }
  }

  completeContract(c) {
    c.state = 'done';
    this.contracts = this.contracts.filter((x) => x !== c);
    const pay = Math.round(c.reward * (this.company.captainPerks.has('negotiator') ? 1.2 : 1));
    this.company.earn(pay);
    this.gainRenown(Math.round(c.reward / 10));
    this.note(`계약 완료 — ${c.title}. ${pay} 크라운을 받았다.`, 'reward');
    this.bus.emit('contract:done', { contract: c });
  }

  // ---------------------------------------------------------------- captain
  /** Renown buys points on the captain's tree. */
  gainRenown(amount, announce = true) {
    if (amount <= 0) return;
    const before = this.captainPoints;
    this.company.renown += amount;
    const after = this.captainPoints;
    if (after > before) {
      this.note(`용병단의 이름이 알려졌다. 단장 특성 점수 ${after - before} 점을 얻었다.`, 'renown');
      this.bus.emit('captain:point', { points: after });
    } else if (announce) {
      this.bus.emit('renown', { renown: this.company.renown });
    }
  }

  /** Unspent captain points. Never negative, however renown moves. */
  get captainPoints() {
    return Math.max(0, pointsFromRenown(this.company.renown) - this.company.captainSpent);
  }

  takeCaptainNode(id) {
    if (!CAPTAIN_NODES[id]) return false;
    if (this.captainPoints < 1) return false;
    if (!nodeAvailable(id, this.company.captainPerks)) return false;
    this.company.captainPerks.add(id);
    this.company.captainSpent++;
    this.note(`단장 특성 — ${CAPTAIN_NODES[id].name} 을(를) 익혔다.`, 'renown');
    this.bus.emit('captain:change', { id });
    return true;
  }

  expireContracts() {
    for (const c of [...this.contracts]) {
      if (daysLeft(c, this.day) >= 0) continue;
      this.contracts = this.contracts.filter((x) => x !== c);
      c.state = 'failed';
      this.note(`계약 기한이 지났다 — ${c.title}`, 'fail');
      this.bus.emit('contract:failed', { contract: c });
    }
  }

  /** Hexes the company has any business clicking on. */
  isReachable(hex) { return this.world.passable(hex); }
}

export { World, SETTLEMENTS, key };
