import { key, distance, eq, neighbors } from '../hex/hex.js';
import { EventBus } from '../core/events.js';
import { RNG } from '../core/rng.js';
import { World, SETTLEMENTS } from './world.js';
import { bandComposition, bandName } from './bands.js';

export const HOURS_PER_DAY = 24;
/** Real seconds per in-game hour at normal speed. */
export const HOUR_SECONDS = 0.22;
const DETECT_RANGE = 4;
const CAMP_RESPAWN_DAYS = 4;

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
 * The campaign layer: world map, the company's travel, roaming bands and the
 * passage of time. It never touches the DOM, so it can be stepped headlessly.
 */
export class Campaign {
  constructor({ seed, cols = 34, rows = 22, roster = [] } = {}) {
    this.rng = new RNG(seed);
    this.bus = new EventBus();
    this.world = new World(cols, rows).generate(this.rng);
    this.roster = roster;
    this.time = 6;               // hours since the campaign began; start at dawn
    this.paused = false;
    this.log = [];
    this.bands = [];
    this.pendingEncounter = null;

    const start = this.world.startingSettlement();
    this.company = new Party({
      id: 'company',
      faction: 'player',
      name: '용병단',
      hex: start ? start.hex : this.world.all().find((t) => this.world.passable(t.hex)).hex,
      speed: 1,
    });
    this.homeSettlement = start;

    for (const camp of this.world.camps) this.spawnBand(camp);
    this.note(start ? `${start.name} 에서 용병단을 꾸렸다.` : '용병단이 길을 나섰다.', 'start');
  }

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
    const roster = bandComposition(this.rng, camp.strength, this.day);
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
    if (eq(this.company.hex, hex)) return this.company;
    return this.bands.find((b) => b.alive && eq(b.hex, hex)) || null;
  }

  settlementAt(hex) { return this.world.get(hex)?.settlement || null; }

  /** Order the company somewhere. Returns false when there is no route. */
  setDestination(hex) {
    if (!this.world.has(hex) || !this.world.passable(hex)) return false;
    if (eq(hex, this.company.hex)) { this.company.stop(); return true; }
    const path = this.world.findPath(this.company.hex, hex);
    if (!path || path.length < 2) return false;
    this.company.path = path.slice(1);      // path[0] is where we already stand
    this.company.spent = 0;
    this.company.sub = 0;
    return true;
  }

  /** Preview the route and its cost without committing to it. */
  previewRoute(hex) {
    if (!this.world.has(hex) || !this.world.passable(hex)) return null;
    const path = this.world.findPath(this.company.hex, hex);
    if (!path || path.length < 2) return null;
    const steps = path.slice(1);
    const hours = steps.reduce((s, h) => s + (this.world.travelCost(h) ?? 0), 0) / this.company.speed;
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

      this.advance(this.company, dt);
      for (const b of this.bands) if (b.alive) { this.steerBand(b); this.advance(b, dt); }

      this.rest(dt);
      this.checkContact();
      this.respawnCamps(dt);
    }
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

    if (party === this.company) {
      const s = this.settlementAt(party.hex);
      if (s) this.note(`${s.name} 에 도착했다.`, 'arrive');
      if (!party.path.length) this.bus.emit('company:arrived', { hex: party.hex, settlement: s });
    }
  }

  /** Bands loiter near their camp until the company strays too close. */
  steerBand(band) {
    const toCompany = distance(band.hex, this.company.hex);
    if (toCompany <= DETECT_RANGE) {
      // Re-path each time the quarry moves, otherwise the chase goes stale.
      const t = band.target;
      if (!t || !eq(t, this.company.hex)) {
        const path = this.world.findPath(band.hex, this.company.hex);
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
    const dest = this.rng.pick(spots);
    const path = this.world.findPath(band.hex, dest);
    if (path && path.length > 1) { band.path = path.slice(1); band.spent = 0; }
  }

  checkContact() {
    for (const b of this.bands) {
      if (!b.alive) continue;
      if (distance(b.hex, this.company.hex) > 0) continue;
      this.beginEncounter(b);
      return;
    }
  }

  beginEncounter(band) {
    this.company.stop();
    band.stop();
    this.pendingEncounter = band;
    const tile = this.world.get(this.company.hex);
    this.note(`${band.name} 와(과) 마주쳤다!`, 'battle');
    this.bus.emit('encounter', {
      band,
      biome: this.world.terrainAt(this.company.hex).biome,
      tile,
    });
  }

  /** Called by the battle scene once the fight is over. */
  resolveEncounter(result) {
    const band = this.pendingEncounter;
    this.pendingEncounter = null;
    if (!band) return;

    if (result === 'victory') {
      band.alive = false;
      if (band.camp) band.camp.cooldown = CAMP_RESPAWN_DAYS * HOURS_PER_DAY;
      this.note(`${band.name} 을(를) 물리쳤다.`, 'victory');
    } else {
      // Survivors scatter back the way they came rather than being wiped out.
      const away = neighbors(this.company.hex)
        .filter((h) => this.world.passable(h))
        .sort((a, c) => distance(c, band.hex) - distance(a, band.hex))[0];
      if (away) this.company.hex = away;
      this.company.stop();
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
    if (this.company.moving) return;
    const s = this.settlementAt(this.company.hex);
    if (!s) return;
    const rate = SETTLEMENTS[s.tier].size;   // village 1, town 2, city 3
    for (const u of this.roster) {
      if (!u.alive) continue;
      u.hp = Math.min(u.hpMax, u.hp + hours * rate * 0.25);
      if (u.body) u.body.armor = Math.min(u.body.max, u.body.armor + hours * rate * 0.6);
      if (u.head) u.head.armor = Math.min(u.head.max, u.head.armor + hours * rate * 0.5);
      if (u.shield) u.shield.durability = Math.min(u.shield.max, u.shield.durability + hours * rate * 0.3);
    }
  }

  /** Hexes the company has any business clicking on. */
  isReachable(hex) { return this.world.passable(hex); }
}

export { World, SETTLEMENTS, key };
