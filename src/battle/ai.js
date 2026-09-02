import { distance, key } from '../hex/hex.js';
import { findPath } from '../hex/pathfind.js';
import { SKILLS } from '../data/skills.js';

/**
 * Utility-scoring AI. `step()` performs at most one action so the caller can
 * pace the turn with animation delays; it returns false when the unit is done.
 */
export class AI {
  constructor(battle) {
    this.battle = battle;
    this.actionsThisTurn = 0;
  }

  beginTurn() { this.actionsThisTurn = 0; }

  step(unit) {
    const b = this.battle;
    if (!unit || !unit.alive || b.phase !== 'playing') return false;
    // A unit that has already routed off the map is still `battle.current`
    // until the turn is handed back, and it no longer stands anywhere.
    if (unit.withdrawn || !unit.hex) return false;
    if (this.actionsThisTurn++ > 8) return false;

    // A rout runs for the nearest edge; an ordered retreat goes home.
    if (b.retreating === unit.faction) return this.flee(unit, b.homeCol(unit.faction));
    if (unit.isFleeing) return this.flee(unit);

    const foes = b.enemiesOf(unit);
    if (!foes.length) return false;

    // 1. Best attack available from where we stand.
    const attack = this.bestAttack(unit);
    if (attack && attack.score > 0) {
      b.useSkill(unit, attack.skill.id, attack.target.hex);
      return true;
    }

    // 2. Crossbowmen reload rather than stand idle.
    if (unit.loaded === false && unit.canAfford(SKILLS.reload)) {
      b.useSkill(unit, 'reload');
      return true;
    }

    // 3. Reposition.
    const move = this.bestMove(unit);
    if (move) {
      b.moveUnit(unit, move.hex);
      return true;
    }

    // 4. Brace or catch breath if that is genuinely the best use of the turn.
    if (this.holdPosition(unit)) return true;

    // 5. Last resort: never let two armies stare at each other forever.
    return this.advance(unit);
  }

  // ------------------------------------------------------------ attacking
  /** Score every (skill, target) pair reachable without moving. */
  bestAttack(unit) {
    const b = this.battle;
    let best = null;
    for (const sk of unit.skills) {
      if (sk.type !== 'melee' && sk.type !== 'ranged') continue;
      if (!unit.canAfford(sk)) continue;
      for (const target of b.targetsFor(unit, sk)) {
        const score = this.scoreAttack(unit, target, sk);
        if (!best || score > best.score) best = { skill: sk, target, score };
      }
    }
    return best;
  }

  scoreAttack(unit, target, sk) {
    const b = this.battle;
    const { chance } = b.preview(unit, target, sk);
    const w = unit.weapon;
    const avgRaw = w ? ((w.damage[0] + w.damage[1]) / 2) * (sk.damageMult ?? 1) : 12;

    const armor = (target.body?.armor || 0) + (target.head?.armor || 0);
    // Rough expected HP damage: heavy armour blunts everything but penetrators.
    const armorFactor = sk.effect === 'ignoreArmor'
      ? 1
      : Math.max(w?.armorPen ?? 0.2, 1 - armor / 200);
    let score = (chance / 100) * avgRaw * armorFactor;

    // Finish the wounded first.
    if (avgRaw * armorFactor >= target.hp) score *= 2.2;
    score *= 1 + (1 - target.hp / target.hpMax) * 0.6;

    // Archers and leaders are worth more than another sword.
    if (target.weapon && ['bow', 'xbow', 'thrown'].includes(target.weapon.kind)) score *= 1.35;
    if (target.template.id === 'banditLeader') score *= 1.2;

    // Don't waste an expensive skill on a nearly-free kill.
    score -= sk.ap * 0.4 + sk.fatigue * 0.05;

    // Shield-breaking is only worth it against an intact shield.
    if (sk.effect === 'shieldBreak') {
      score = target.shield?.durability > 0 ? score + 8 : -1;
    }
    return score;
  }

  // ------------------------------------------------------------ movement
  bestMove(unit) {
    const b = this.battle;
    const map = b.reachableFor(unit);
    if (!map.size) return null;

    const foes = b.enemiesOf(unit);
    const ranged = this.isRanged(unit);
    let best = null;

    for (const node of map.values()) {
      const score = ranged
        ? this.scoreRangedTile(unit, node, foes)
        : this.scoreMeleeTile(unit, node, foes);
      if (!best || score > best.score) best = { hex: node.hex, score, node };
    }

    // Standing still is an option too - compare against the current tile.
    const stayScore = ranged
      ? this.scoreRangedTile(unit, { hex: unit.hex, ap: 0 }, foes)
      : this.scoreMeleeTile(unit, { hex: unit.hex, ap: 0 }, foes);
    if (!best || best.score <= stayScore + 0.5) return null;
    return best;
  }

  /** How hard the AI pushes toward contact; ramps up so fights always resolve. */
  aggression() { return 6 + Math.min(10, this.battle.round * 0.7); }

  /**
   * Fallback when scoring finds nothing better than standing still: step as far
   * toward the nearest enemy as the remaining AP allows.
   *
   * Route first, straight line second. Around a rock wall, *every* tile that
   * makes progress is the same distance from the enemy or further, so a
   * distance-only rule sees no move worth making and both armies stand there
   * for the rest of the battle.
   */
  advance(unit) {
    const b = this.battle;
    const foes = b.enemiesOf(unit);
    if (!foes.length) return false;
    const map = b.reachableFor(unit);
    if (!map.size) return false;

    const goal = foes.reduce((a, f) => (distance(unit.hex, f.hex) < distance(unit.hex, a.hex) ? f : a));
    const route = findPath(unit.hex, goal.hex, b.moveContext(unit));
    if (route && route.length > 2) {
      // Furthest point of the route we can still pay for this turn; the last
      // entry is the enemy's own tile, which nobody can step onto.
      for (let i = route.length - 2; i >= 1; i--) {
        if (map.has(key(route[i]))) return b.moveUnit(unit, route[i]);
      }
    }

    const distOf = (h) => Math.min(...foes.map((f) => distance(h, f.hex)));
    const here = distOf(unit.hex);
    let best = null;
    for (const node of map.values()) {
      const d = distOf(node.hex);
      if (d >= here) continue;
      if (!best || d < best.d || (d === best.d && node.ap < best.ap)) {
        best = { hex: node.hex, d, ap: node.ap };
      }
    }
    if (!best) return false;
    return b.moveUnit(unit, best.hex);
  }

  isRanged(unit) {
    return !!unit.weapon && ['bow', 'xbow', 'thrown'].includes(unit.weapon.kind);
  }

  scoreMeleeTile(unit, node, foes) {
    const b = this.battle;
    const reach = unit.reach();
    let score = 0;

    const inReach = foes.filter((f) => distance(node.hex, f.hex) <= reach);
    if (inReach.length) {
      score += 40;
      // Prefer the softest target we can actually engage.
      const softest = inReach.reduce((a, f) => Math.min(a, f.hp / f.hpMax), 1);
      score += (1 - softest) * 20;
      // Flanking: a target already busy with someone else is easier.
      for (const f of inReach) {
        const engaged = b.alliesOf(unit).filter((a) => distance(a.hex, f.hex) <= 1).length;
        score += Math.min(engaged, 3) * 6;
      }
    } else {
      // Closing the distance matters more the longer the battle drags on.
      const nearest = Math.min(...foes.map((f) => distance(node.hex, f.hex)));
      score += 40 - nearest * this.aggression();
    }

    // Terrain preferences.
    score += b.grid.elevation(node.hex) * 5;
    const t = b.grid.terrainAt(node.hex);
    score -= (t.moveCost - 3) * 2;

    // Getting mobbed is bad.
    const adjacentFoes = foes.filter((f) => distance(node.hex, f.hex) <= 1).length;
    if (adjacentFoes > 1) score -= (adjacentFoes - 1) * 7;

    // Movement is not free.
    score -= node.ap * 0.6;
    return score;
  }

  scoreRangedTile(unit, node, foes) {
    const b = this.battle;
    const max = unit.weapon?.range || 5;
    const min = unit.weapon?.minRange || 1;
    let score = 0;

    const shootable = foes.filter((f) => {
      const d = distance(node.hex, f.hex);
      return d >= min && d <= max && b.grid.hasLineOfSight(node.hex, f.hex);
    });
    score += Math.min(shootable.length, 3) * 14;
    if (shootable.length) {
      const closest = Math.min(...shootable.map((f) => distance(node.hex, f.hex)));
      score += (max - closest) * 2;   // closer inside range = better odds
    } else {
      // Nothing in sight: walk forward until someone is.
      const nearest = Math.min(...foes.map((f) => distance(node.hex, f.hex)));
      score += 30 - nearest * this.aggression() * 0.6;
    }

    // Archers hate melee.
    const adjacent = foes.filter((f) => distance(node.hex, f.hex) <= 1).length;
    score -= adjacent * 35;
    const near = foes.filter((f) => distance(node.hex, f.hex) <= 2).length;
    score -= near * 8;

    score += b.grid.elevation(node.hex) * 6;
    score += b.grid.terrainAt(node.hex).cover * 0.4;
    score -= node.ap * 0.5;
    return score;
  }

  // ------------------------------------------------------------ fallbacks
  holdPosition(unit) {
    const b = this.battle;
    const foes = b.enemiesOf(unit);
    const nearest = foes.length ? Math.min(...foes.map((f) => distance(unit.hex, f.hex))) : 99;

    // Bracing is only worth it while the fight is still coming to you. Two
    // spear lines two hexes apart will otherwise stand there bracing at each
    // other forever - measured at 667 rounds - because holding position returns
    // true and the advance fallback below never gets a turn. The same ramp that
    // pushes the line forward eventually stops it digging in.
    const braceWorthIt = this.aggression() < 12;

    if (braceWorthIt && nearest === 2 && unit.stances.size === 0 && unit.weapon?.kind === 'spear'
        && unit.canAfford(SKILLS.spearwall)) {
      b.useSkill(unit, 'spearwall');
      return true;
    }
    if (braceWorthIt && nearest <= 1 && unit.stances.size === 0 && unit.canAfford(SKILLS.riposte)
        && unit.skills.some((s) => s.id === 'riposte')) {
      b.useSkill(unit, 'riposte');
      return true;
    }
    if (braceWorthIt && nearest <= 1 && unit.shield?.durability > 0 && unit.stances.size === 0
        && unit.ap >= SKILLS.shieldwall.ap && unit.canAfford(SKILLS.shieldwall)) {
      b.useSkill(unit, 'shieldwall');
      return true;
    }
    if (nearest > 2 && unit.exhaustion > 0.5 && unit.canAfford(SKILLS.recover)) {
      b.useSkill(unit, 'recover');
      return true;
    }
    return false;
  }

  /**
   * Get off the field. `homeCol` names the edge to leave by when the withdrawal
   * was ordered; without it the unit has broken and runs for whichever edge is
   * nearest, enemy side included.
   */
  flee(unit, homeCol = null) {
    const b = this.battle;
    const map = b.reachableFor(unit);
    if (!map.size) return false;
    const foes = b.enemiesOf(unit);
    const edgeOf = (hex) => (homeCol === null
      ? this.edgeDistance(hex)
      : Math.abs((b.grid.get(hex)?.col ?? homeCol) - homeCol));
    let best = null;
    for (const node of map.values()) {
      const d = foes.reduce((s, f) => s + distance(node.hex, f.hex), 0);
      const edge = edgeOf(node.hex);
      const score = d * 2 - edge * 3 - node.ap * 0.2;
      if (!best || score > best.score) best = { hex: node.hex, score };
    }
    if (!best) return false;
    b.moveUnit(unit, best.hex);

    // Made it off the field. The unit is out of this fight but not dead: a
    // brother who breaks and runs still walks back to the company afterwards.
    if (edgeOf(unit.hex) === 0) {
      unit.withdrawn = true;
      unit.hex = null;
      b.log(homeCol === null
        ? `${unit.name} 이(가) 전장에서 달아났다.`
        : `${unit.name} 이(가) 전장을 빠져나왔다.`, 'death', unit.faction);
      b.bus.emit('unit:flee', { unit });
      b.checkBattleOver();
    }
    return true;
  }

  edgeDistance(hex) {
    const t = this.battle.grid.get(hex);
    if (!t) return 0;
    return Math.min(t.col, this.battle.grid.cols - 1 - t.col);
  }
}
