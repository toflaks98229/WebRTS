import { key, distance, neighbors, eq } from '../hex/hex.js';
import { reachable, pathTo } from '../hex/pathfind.js';
import { Grid } from './grid.js';
import { Unit, MAX_AP, MORALE } from './unit.js';
import { SKILLS } from '../data/skills.js';
import { resolveAttack, hitChance, checkMorale, boostMorale } from './combat.js';
import { EventBus } from '../core/events.js';
import { RNG } from '../core/rng.js';

export const PHASE = { deploy: 'deploy', playing: 'playing', over: 'over' };

/**
 * A riposte is a reaction, not a set-up blow: it swings a little wilder and
 * lands a little lighter than the same attack made on your own time. It costs
 * no AP - it is not your turn - but it costs breath, and that is what stops a
 * single greatsword from cutting down a whole line unanswered.
 */
const RIPOSTE = { hit: -10, damage: 0.75, fatigue: 12 };

export class Battle {
  constructor({ cols = 16, rows = 11, seed, biome = 'plains' } = {}) {
    this.rng = new RNG(seed);
    this.bus = new EventBus();
    this.grid = new Grid(cols, rows).generate(this.rng, biome);
    this.units = [];
    this.order = [];
    this.turnIndex = 0;
    this.round = 0;
    this.phase = PHASE.deploy;
    this.logLines = [];
    this.result = null;
    this.xpPool = 0;          // experience the fallen are worth, split at the end
    this.levelUps = [];
  }

  // ---------------------------------------------------------------- setup
  addUnit(unit, hex) {
    unit.hex = hex;
    this.units.push(unit);
    return unit;
  }

  /** Spread a group of units over the free tiles of a deployment column band. */
  deploy(units, colFrom, colTo) {
    const spots = this.grid.all()
      .filter((t) => t.col >= colFrom && t.col <= colTo && this.grid.passable(t.hex) && !this.unitAt(t.hex))
      .sort((a, b) => a.row - b.row || a.col - b.col);
    // Fill outward from the middle of the band so formations look deliberate.
    const mid = Math.floor(spots.length / 2);
    const ordered = [];
    for (let i = 0; i < spots.length; i++) {
      const idx = mid + (i % 2 === 0 ? i / 2 : -Math.ceil(i / 2));
      if (spots[idx]) ordered.push(spots[idx]);
    }
    units.forEach((u, i) => { if (ordered[i]) this.addUnit(u, ordered[i].hex); });
  }

  start() {
    this.phase = PHASE.playing;
    this.round = 0;
    this.nextRound();
    this.bus.emit('battle:start', this);
  }

  // ---------------------------------------------------------------- queries
  /** Everyone still in the fight. A unit that routed off the field is not. */
  get living() { return this.units.filter((u) => u.alive && !u.withdrawn); }
  get players() { return this.living.filter((u) => u.faction === 'player'); }
  get enemies() { return this.living.filter((u) => u.faction === 'enemy'); }
  get current() { return this.order[this.turnIndex] || null; }

  unitAt(hex) {
    if (!hex) return null;
    return this.units.find((u) => u.alive && !u.withdrawn && u.hex && eq(u.hex, hex)) || null;
  }

  enemiesOf(unit) { return this.living.filter((u) => u.faction !== unit.faction); }
  alliesOf(unit) { return this.living.filter((u) => u.faction === unit.faction && u !== unit); }

  /** Tiles threatened by units hostile to `unit` - used for the ZOC penalty. */
  zocFor(unit) {
    const set = new Set();
    for (const e of this.enemiesOf(unit)) {
      if (e.isFleeing) continue;
      for (const nb of neighbors(e.hex)) set.add(key(nb));
    }
    return set;
  }

  moveContext(unit) {
    const zoc = this.zocFor(unit);
    return {
      costOf: (h, from) => {
        if (!this.grid.passable(h)) return null;
        if (this.unitAt(h)) return null;
        return this.stepCost(from, h, unit);
      },
      inZOC: (h) => zoc.has(key(h)),
    };
  }

  /** Terrain cost of entering `to`, plus the climb if `from` sits lower. */
  stepCost(from, to, unit) {
    const t = this.grid.terrainAt(to);
    const climb = from ? this.grid.climbCost(from, to) : { ap: 0, fat: 0 };
    let ap = t.moveCost;
    let climbAP = climb.ap;
    if (unit?.hasPerk('pathfinder')) { ap = Math.max(2, ap - 1); climbAP = Math.max(0, climbAP - 1); }
    return { ap: ap + climbAP, fat: t.moveFatigue + climb.fat };
  }

  reachableFor(unit) {
    if (!unit) return new Map();
    return reachable(unit.hex, unit.ap, unit.fatigueLeft, this.moveContext(unit));
  }

  /** Targets `unit` could hit right now with `sk`, respecting range and LOS. */
  targetsFor(unit, sk) {
    if (!sk || (sk.type !== 'melee' && sk.type !== 'ranged')) return [];
    const max = unit.reach(sk);
    const min = unit.minRange(sk);
    return this.enemiesOf(unit).filter((e) => {
      const d = distance(unit.hex, e.hex);
      if (d > max || d < min) return false;
      if (sk.type === 'ranged' && !this.grid.hasLineOfSight(unit.hex, e.hex)) return false;
      return true;
    });
  }

  preview(unit, target, sk) { return hitChance(this, unit, target, sk); }

  // ---------------------------------------------------------------- actions
  /** Move along a reachable path. Returns false when the move is illegal. */
  moveUnit(unit, target) {
    const map = this.reachableFor(unit);
    if (!map.get(key(target))) return false;
    const path = pathTo(map, unit.hex, target);
    if (!path || !path.length) return false;

    const walked = [];
    let spentAP = 0;
    let spentFat = 0;
    let prev = unit.hex;

    for (const step of path) {
      const zoc = this.zocFor(unit);
      const cost = this.stepCost(prev, step, unit);
      let ap = cost.ap;
      let fat = cost.fat;
      if (zoc.has(key(prev))) { ap += 2; fat += 5; }
      if (spentAP + ap > unit.ap || spentFat + fat > unit.fatigueLeft) break;

      spentAP += ap;
      spentFat += fat;
      unit.hex = step;
      walked.push(step);
      prev = step;

      // Stepping into a braced spear stops the advance cold.
      const stopped = this.checkSpearwall(unit);
      if (stopped || !unit.alive) break;
    }

    if (!walked.length) return false;
    unit.ap -= spentAP;
    unit.fatigue = Math.min(unit.fatigueMax, unit.fatigue + spentFat);
    this.bus.emit('unit:move', { unit, path: walked });
    return true;
  }

  /** A spearwall holder skewers anyone stepping into its reach. */
  checkSpearwall(mover) {
    for (const e of this.enemiesOf(mover)) {
      if (!e.stances.has('spearwall')) continue;
      if (distance(e.hex, mover.hex) > e.reach(SKILLS.spearThrust)) continue;
      this.log(`${e.name} 의 창벽이 ${mover.name} 을(를) 저지했다!`, 'special', e.faction);
      resolveAttack(this, e, mover, SKILLS.spearThrust, { free: true });
      return true;
    }
    return false;
  }

  useSkill(unit, skillId, targetHex) {
    const sk = SKILLS[skillId];
    if (!sk || !unit.canAfford(sk)) return false;

    if (sk.type === 'melee' || sk.type === 'ranged') {
      const target = this.unitAt(targetHex);
      if (!target || target.faction === unit.faction) return false;
      const d = distance(unit.hex, target.hex);
      if (d > unit.reach(sk) || d < unit.minRange(sk)) return false;
      if (sk.type === 'ranged' && !this.grid.hasLineOfSight(unit.hex, target.hex)) return false;

      unit.spend(sk);
      const res = resolveAttack(this, unit, target, sk);
      if (res.hit && sk.effect === 'push') this.pushUnit(unit, target);
      if (sk.type === 'melee') this.checkRiposte(unit, target);
      this.checkBattleOver();
      return true;
    }

    // Self / stance skills
    unit.spend(sk);
    switch (sk.effect) {
      case 'recover':
        unit.fatigue = Math.max(0, unit.fatigue - 45);
        unit.ap = 0;
        this.log(`${unit.name} 이(가) 숨을 고른다.`, 'special', unit.faction);
        break;
      case 'shieldwall':
      case 'spearwall':
      case 'riposte':
        unit.stances.add(sk.effect);
        this.log(`${unit.name} - ${sk.name}`, 'special', unit.faction);
        break;
      case 'reload':
        this.log(`${unit.name} 이(가) 석궁을 재장전했다.`, 'special', unit.faction);
        break;
      default: break;
    }
    this.bus.emit('unit:skill', { unit, skill: sk });
    return true;
  }

  /**
   * A fighter holding a riposte answers every melee blow aimed at them, hit or
   * miss, until their next turn. The counter itself never provokes another one:
   * it is resolved directly rather than through `useSkill`.
   */
  checkRiposte(attacker, defender) {
    if (!defender.alive || !attacker.alive) return;
    if (!defender.stances.has('riposte')) return;
    if (defender.isFleeing || defender.stunned > 0) return;
    if (RIPOSTE.fatigue > defender.fatigueLeft) return;

    const base = defender.counterSkill();
    if (!base) return;
    if (distance(defender.hex, attacker.hex) > defender.reach(base)) return;

    const counter = {
      ...base,
      name: SKILLS.riposte.name,
      hitBonus: (base.hitBonus || 0) + RIPOSTE.hit,
      damageMult: (base.damageMult ?? 1) * RIPOSTE.damage,
    };
    defender.fatigue = Math.min(defender.fatigueMax, defender.fatigue + RIPOSTE.fatigue);
    this.log(`${defender.name} 이(가) 받아친다!`, 'special', defender.faction);
    resolveAttack(this, defender, attacker, counter, { free: true });
  }

  pushUnit(pusher, target) {
    const away = neighbors(target.hex)
      .filter((h) => this.grid.passable(h) && !this.unitAt(h))
      .sort((a, b) => distance(b, pusher.hex) - distance(a, pusher.hex))[0];
    if (away && distance(away, pusher.hex) > distance(target.hex, pusher.hex)) {
      target.hex = away;
      this.bus.emit('unit:move', { unit: target, path: [away] });
      this.log(`${target.name} 이(가) 밀려났다.`, 'special', pusher.faction);
    }
  }

  // ---------------------------------------------------------------- deaths & morale
  killUnit(unit, killer) {
    unit.alive = false;
    unit.hp = 0;
    this.log(`${unit.name} 이(가) 쓰러졌다.`, 'death', unit.faction);
    this.bus.emit('unit:death', { unit, killer });

    // Experience is banked and only applied once the fight is over, so nobody
    // grows mid-battle.
    const worth = 45 + unit.level * 15 + Math.round(unit.hpBase / 3);
    if (unit.faction === 'enemy') this.xpPool += worth;

    if (killer) {
      killer.kills++;
      killer.pendingXP = (killer.pendingXP || 0) + Math.round(worth * 0.5);
      boostMorale(this, killer, 20, '적을 쓰러뜨림');
      for (const ally of this.alliesOf(killer)) {
        if (distance(ally.hex, unit.hex) <= 4) boostMorale(this, ally, -10, '아군의 전공');
      }
    }
    for (const ally of this.living) {
      if (ally.faction !== unit.faction) continue;
      const d = distance(ally.hex, unit.hex);
      if (d <= 5) checkMorale(this, ally, d <= 1 ? -20 : -8, '아군의 죽음');
    }
    this.checkBattleOver();
  }

  moraleCheck(unit, mod, reason) { checkMorale(this, unit, mod, reason); }

  // ---------------------------------------------------------------- turn flow
  nextRound() {
    this.round++;
    for (const u of this.living) u.hasActed = false;
    this.order = this.living
      .map((u) => ({ u, i: u.initiative + this.rng.int(0, 10) }))
      .sort((a, b) => b.i - a.i)
      .map((x) => x.u);
    this.turnIndex = -1;
    this.log(`- ${this.round} 라운드 -`, 'round');
    this.bus.emit('round:start', { round: this.round });
    this.advance();
  }

  /** Move to the next unit that can still act, starting a new round if needed. */
  advance() {
    if (this.phase === PHASE.over) return;
    for (;;) {
      this.turnIndex++;
      if (this.turnIndex >= this.order.length) { this.nextRound(); return; }
      const u = this.order[this.turnIndex];
      if (!u || !u.alive || u.withdrawn) continue;
      // A unit that used "wait" resumes its existing AP instead of a fresh turn.
      if (u.turnRound !== this.round) { u.beginTurn(); u.turnRound = this.round; }
      this.bus.emit('turn:start', { unit: u });
      return;
    }
  }

  endTurn() {
    const u = this.current;
    if (u) { u.endTurn(); this.bus.emit('turn:end', { unit: u }); }
    if (this.phase === PHASE.playing) this.advance();
  }

  /** Push the current unit to the back of this round's order. */
  wait() {
    const u = this.current;
    if (!u || u.waited) return false;
    u.waited = true;
    this.order.splice(this.turnIndex, 1);
    this.order.push(u);
    this.turnIndex--;
    this.advance();
    return true;
  }

  checkBattleOver() {
    if (this.phase === PHASE.over) return true;
    const standingPlayers = this.players.filter((u) => !u.isFleeing).length;
    const standingEnemies = this.enemies.filter((u) => !u.isFleeing).length;
    if (standingEnemies === 0) { this.finish('victory'); return true; }
    if (standingPlayers === 0) { this.finish('defeat'); return true; }
    return false;
  }

  /**
   * Split the pool: half goes to whoever landed the killing blows, half is
   * shared evenly so the shield wall grows too.
   */
  awardExperience() {
    const survivors = this.units.filter((u) => u.faction === 'player' && u.alive);
    if (!survivors.length) return [];
    const share = Math.round((this.xpPool * 0.5) / survivors.length);
    const ups = [];
    for (const u of survivors) {
      const gained = u.gainXP(share + (u.pendingXP || 0), this.rng);
      u.pendingXP = 0;
      if (gained) {
        ups.push({ unit: u, levels: gained });
        this.log(`${u.name} 이(가) ${u.level} 레벨이 되었다.`, 'special', 'player');
      }
    }
    return ups;
  }

  finish(result) {
    this.phase = PHASE.over;
    this.result = result;
    this.levelUps = this.awardExperience();
    this.log(result === 'victory' ? '전투에서 승리했다!' : '부대가 패주했다...', 'round');
    this.bus.emit('battle:over', { result, battle: this });
  }

  // ---------------------------------------------------------------- log
  log(text, kind = 'info', faction = null) {
    const entry = { text, kind, faction, round: this.round };
    this.logLines.push(entry);
    if (this.logLines.length > 400) this.logLines.shift();
    this.bus.emit('log', entry);
  }
}

export { MAX_AP, MORALE, Unit, SKILLS };
