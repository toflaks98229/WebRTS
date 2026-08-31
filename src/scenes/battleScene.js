import { Battle } from '../battle/battle.js';
import { AI } from '../battle/ai.js';
import { SKILLS } from '../data/skills.js';
import { Layout } from '../hex/layout.js';
import { key } from '../hex/hex.js';
import { pathTo } from '../hex/pathfind.js';
import { Camera } from '../render/camera.js';
import { Renderer, ELEV_RATIO } from '../render/renderer.js';
import { Effects } from '../render/effects.js';
import { salvage } from '../campaign/loot.js';
import { overlay, esc } from '../ui/overlay.js';

const AI_STEP_DELAY = 380;   // ms between AI actions, so the player can follow along
/** Grace period before a turn with no moves left in it passes on its own. */
const AUTO_END_DELAY = 420;

/**
 * The tactical fight. Owns its own camera and renderer; the app drives it and
 * `onFinish(result, report)` hands control back once the player dismisses the
 * after-action report.
 */
export class BattleScene {
  /**
   * Pass `battle` to fight on a board that is already laid out (the lab does
   * this); otherwise a fresh one is generated and both sides are deployed.
   */
  constructor(app, { roster, enemies, biome = 'plains', onFinish, battle = null }) {
    this.app = app;
    this.canvas = app.canvas;
    this.hud = app.battleHud;
    this.roster = roster;
    this.onFinish = onFinish;

    this.layout = new Layout(42);
    this.camera = new Camera();
    this.effects = new Effects();

    if (battle) {
      this.battle = battle;
    } else {
      this.battle = new Battle({ cols: 15, rows: 9, seed: app.rng.int(0, 1e9), biome });
      this.battle.deploy(roster, 0, 2);
      this.battle.deploy(enemies, this.battle.grid.cols - 3, this.battle.grid.cols - 1);
    }

    this.renderer = new Renderer(this.canvas, this.battle, this.layout, this.camera, this.effects);
    this.renderer.dolls = app.dollBank || null;
    this.renderer.atlas = app.terrainAtlas || null;
    this.ai = new AI(this.battle);

    this.activeSkill = null;
    this.inspected = null;
    this.reach = null;
    this.fitted = false;
    this.userMovedCamera = false;
    this.finished = false;
  }

  // ------------------------------------------------------------ lifecycle
  enter() {
    this.app.setMode('battle');
    this.hud.attach(this.battle, this);
    this.wire();
    this.battle.start();
    this.hud.refresh();
  }

  exit() { overlay.hideTip(); }

  wire() {
    const b = this.battle;
    const px = (u) => this.renderer.pixelOf(u);

    b.bus.on('attack:hit', (res) => {
      const p = px(res.target);
      this.renderer.flash(res.target);
      this.effects.floatText(p.x, p.y - 30, `-${res.hpDamage}`, res.head ? '#ffd36b' : '#ff9c86', res.head ? 21 : 17);
      if (res.armorDamage) this.effects.floatText(p.x + 22, p.y - 12, `-${res.armorDamage}`, '#a9b3bb', 12);
      if (res.skill.type === 'ranged') this.effects.projectile(px(res.attacker), p);
      else this.effects.slash(p.x, p.y - 18, Math.atan2(p.y - px(res.attacker).y, p.x - px(res.attacker).x));
    });

    b.bus.on('attack:miss', (res) => {
      const p = px(res.target);
      this.effects.floatText(p.x, p.y - 30, '빗나감', '#9a9184', 14);
      if (res.skill.type === 'ranged') this.effects.projectile(px(res.attacker), p, '#6f6858');
    });

    b.bus.on('unit:death', ({ unit }) => {
      const p = px(unit);
      this.effects.ring(p.x, p.y, '#c2453a', 48);
      this.effects.floatText(p.x, p.y - 46, '전사', '#d1705d', 16);
    });

    b.bus.on('morale:change', ({ unit, direction }) => {
      const p = px(unit);
      this.effects.floatText(p.x, p.y - 52, direction > 0 ? '▲ 사기' : '▼ 사기',
        direction > 0 ? '#7fb069' : '#b79ad0', 13);
    });

    b.bus.on('turn:start', ({ unit }) => {
      this.ai.beginTurn();
      this.aiClock = performance.now() + 220;
      this.idleSince = 0;
      this.activeSkill = this.defaultSkill(unit);
      this.inspected = null;
      this.camera.centerOn(this.layout.toPixel(unit.hex), 0.35);
      this.hud.refresh();
    });

    b.bus.on('round:start', ({ round }) => {
      if (round > 1) this.hud.showBanner(`${round} 라운드`, 900);
    });

    b.bus.on('battle:over', ({ result }) => this.finish(result));
  }

  finish(result) {
    if (this.finished) return;
    this.finished = true;
    this.hud.showBanner(result === 'victory' ? '승리' : '패배', 2400);
    const fallenEnemies = this.battle.units.filter((u) => u.faction === 'enemy' && !u.alive);
    const spoils = result === 'victory'
      ? salvage(this.roster.filter((u) => u.alive && !u.withdrawn), fallenEnemies)
      : { changes: [], leftovers: [] };
    this.loot = spoils.changes;
    this.leftovers = spoils.leftovers;
    setTimeout(() => this.showReport(result), 1100);
  }

  showReport(result) {
    const survivors = this.roster.filter((u) => u.alive);
    const fallen = this.roster.filter((u) => !u.alive);
    const rule = '<hr style="border:0;border-top:1px solid var(--edge);margin:10px 0">';
    const ups = this.battle.levelUps || [];
    const rows = survivors.map((u) =>
      `<div class="gear-row"><i>${esc(u.name)}${u.withdrawn ? ' <b style="color:#d8b447">이탈</b>' : ''}</i>`
      + `<em>체력 ${Math.max(0, Math.round(u.hp))}/${u.hpMax} · 처치 ${u.kills}</em></div>`).join('');

    overlay.modal(result === 'victory' ? '전투 승리' : '패주', `
      ${result === 'victory'
        ? '적을 몰아냈다. 쓸 만한 장비를 챙겨 길을 이었다.'
        : '전열이 무너졌다. 살아남은 자들이 흩어졌다 다시 모였다.'}
      ${rule}<b>생존자 ${survivors.length}명</b>${rows || '<div class="gear-row"><i>없음</i></div>'}
      ${fallen.length ? `${rule}<b style="color:#d1705d">전사자 ${fallen.length}명</b>
        ${fallen.map((u) => `<div class="gear-row"><i>${esc(u.name)}</i><em>${esc(u.title)}</em></div>`).join('')}` : ''}
      ${this.loot?.length ? `${rule}<b style="color:#c8a24a">현장에서 갖춘 장비</b>
        ${this.loot.map((c) => `<div class="gear-row"><i>${esc(c.unit.name)}</i><em>${esc(c.from)} → ${esc(c.to)}</em></div>`).join('')}` : ''}
      ${ups.length ? `${rule}<b style="color:#7fb069">레벨 상승</b>
        ${ups.map((l) => `<div class="gear-row"><i>${esc(l.unit.name)}</i><em>${l.unit.level} 레벨 · 특성 점수 ${l.unit.perkPoints}</em></div>`).join('')}` : ''}
      ${this.leftovers?.length ? `${rule}<b style="color:#c8a24a">창고로 보낸 노획품 ${this.leftovers.length}점</b>
        <div class="gear-row"><i>마을 상점에서 팔거나 다른 단원에게 넘길 수 있다.</i></div>` : ''}`,
      () => this.onFinish?.(result, { loot: this.loot, leftovers: this.leftovers }),
      '지도로 돌아가기');
  }

  defaultSkill(unit) {
    if (!unit || unit.faction !== 'player') return null;
    const atk = unit.skills.find((s) => s.type === 'melee' || s.type === 'ranged');
    return atk ? atk.id : null;
  }

  // ------------------------------------------------------------ camera fit
  resize() {
    this.renderer.resize();
    if (this.renderer.w < 200 || this.renderer.h < 150) return;   // no real layout yet
    if (!this.userMovedCamera) { this.centerOnField(); this.fitted = true; }
  }

  /** Frame the whole battlefield in the gap left between the side panels. */
  centerOnField() {
    const tiles = this.battle.grid.all().map((t) => this.layout.toPixel(t.hex));
    const xs = tiles.map((p) => p.x);
    const ys = tiles.map((p) => p.y);
    this.camera.x = (Math.min(...xs) + Math.max(...xs)) / 2;
    this.camera.y = (Math.min(...ys) + Math.max(...ys)) / 2;

    const pad = this.layout.size * 2;
    const spanX = Math.max(...xs) - Math.min(...xs) + pad;
    const spanY = Math.max(...ys) - Math.min(...ys) + pad * 0.6;
    // The panels are translucent overlays, so a little overlap is fine.
    const availW = Math.max(320, this.renderer.w - (258 + 288) * 0.8 - 32);
    const availH = Math.max(240, this.renderer.h - 24);
    this.camera.zoom = Math.max(0.4, Math.min(1.4, Math.min(availW / spanX, availH / spanY)));
  }

  // ------------------------------------------------------------ input
  /**
   * Raised tiles are drawn shifted upward, so a naive pixel-to-hex lookup picks
   * the tile below them. Test each height level from the top down.
   */
  hexUnderMouse() {
    const m = this.app.mouse;
    if (!m) return null;
    const r = this.canvas.getBoundingClientRect();
    const w = this.camera.screenToWorld(m.x, m.y, r.width, r.height);
    const step = this.layout.size * ELEV_RATIO;
    for (let level = 3; level >= 1; level--) {
      const h = this.layout.toHex(w.x, w.y + level * step);
      if (this.battle.grid.elevation(h) === level) return h;
    }
    return this.layout.toHex(w.x, w.y);
  }

  onMouseMove() {
    const m = this.app.mouse;
    const h = this.hexUnderMouse();
    const b = this.battle;
    const u = b.current;
    const view = this.renderer.view;
    view.hover = h;
    view.path = [];

    if (!h || !b.grid.has(h)) { this.hud.hideTip(); return; }

    const target = b.unitAt(h);
    const sk = this.activeSkill ? SKILLS[this.activeSkill] : null;
    const myTurn = u && u.faction === 'player' && b.phase === 'playing';

    if (target && myTurn && sk && target.faction !== u.faction
        && b.targetsFor(u, sk).includes(target) && u.canAfford(sk)) {
      this.hud.showAttackTip(u, target, sk, m.cx, m.cy);
      return;
    }
    if (target) { this.hud.renderCard(target); this.hud.hideTip(); return; }

    this.hud.renderCard(this.inspected || b.current);
    if (myTurn && this.reach?.has(key(h))) view.path = pathTo(this.reach, u.hex, h) || [];
    this.hud.showTerrainTip(b.grid.get(h), b.grid.terrainAt(h), m.cx, m.cy);
  }

  onDrag() { this.userMovedCamera = true; }
  onMouseLeave() { this.renderer.view.hover = null; this.hud.hideTip(); }

  onWheel(e) {
    const r = this.canvas.getBoundingClientRect();
    this.camera.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY, r.width, r.height);
    this.userMovedCamera = true;
  }

  onSecondaryClick() {
    this.activeSkill = this.defaultSkill(this.battle.current);
    this.hud.refresh();
  }

  onClick() {
    const b = this.battle;
    const u = b.current;
    if (b.phase !== 'playing' || !u || u.faction !== 'player' || this.renderer.animating) return;

    const h = this.hexUnderMouse();
    if (!h || !b.grid.has(h)) return;

    const target = b.unitAt(h);
    if (target && target.faction === u.faction) { this.inspected = target; this.hud.refresh(); return; }

    if (target) {
      const sk = SKILLS[this.activeSkill];
      if (sk && u.canAfford(sk) && b.targetsFor(u, sk).includes(target)) {
        b.useSkill(u, sk.id, target.hex);
        this.afterAction();
      }
      return;
    }
    if (this.reach?.has(key(h))) { b.moveUnit(u, h); this.afterAction(); }
  }

  onKeyDown(e) {
    const u = this.battle.current;
    if (e.key >= '1' && e.key <= '9') {
      const sk = u?.faction === 'player' ? u.skills[+e.key - 1] : null;
      if (sk) this.selectSkill(sk.id);
    } else if (e.code === 'Space') {
      e.preventDefault(); this.endTurn();
    } else if (e.key.toLowerCase() === 'q' && !e.repeat) {
      this.wait();
    } else if (e.key === 'Escape') {
      this.activeSkill = null; this.hud.refresh();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (u) this.camera.centerOn(this.layout.toPixel(u.hex), 1);
    }
  }

  showHelp() { this.hud.showHelp(); }

  // --------------------------------------------------------- auto end turn
  /**
   * Whether this fighter still has anything it could do: a skill it can pay for
   * *and* aim somewhere, or a tile it can step onto. Affordability alone is not
   * enough - a swing with nothing in reach is not a move.
   */
  hasOptions(u) {
    if (!u || !u.alive || u.withdrawn) return false;
    for (const sk of u.skills) {
      if (sk.type === 'utility' || !u.canAfford(sk)) continue;
      if (sk.type === 'melee' || sk.type === 'ranged') {
        if (this.battle.targetsFor(u, sk).length) return true;
      } else {
        return true;              // stances and recover need no target
      }
    }
    return (this.reach?.size ?? 0) > 0;
  }

  /**
   * Pass the turn on once nothing is left in it, rather than making the player
   * confirm a choice that does not exist. A fighter at full AP can always fall
   * back on catching their breath, so this only fires when they are genuinely
   * spent - being boxed in on a fresh turn still leaves the decision to wait.
   */
  maybeAutoEndTurn(now) {
    const b = this.battle;
    const u = b.current;
    const mine = b.phase === 'playing' && u && u.faction === 'player' && !u.isFleeing;
    if (!mine || this.renderer.animating || this.hasOptions(u)) { this.idleSince = 0; return; }

    if (!this.idleSince) { this.idleSince = now; return; }
    if (now - this.idleSince < AUTO_END_DELAY) return;

    this.idleSince = 0;
    const p = this.renderer.pixelOf(u);
    this.effects.floatText(p.x, p.y - 44, '행동 종료', '#9a9184', 13);
    b.endTurn();
  }

  // ------------------------------------------------------------ actions
  afterAction() {
    const u = this.battle.current;
    if (u && !u.canAfford(SKILLS[this.activeSkill] || { ap: 99, fatigue: 0 })) {
      const fallback = this.defaultSkill(u);
      if (fallback && u.canAfford(SKILLS[fallback])) this.activeSkill = fallback;
    }
    this.refreshReach();
    this.hud.refresh();
  }

  selectSkill(id) {
    const u = this.battle.current;
    const sk = SKILLS[id];
    if (!u || u.faction !== 'player' || !sk) return;
    if (sk.type === 'self' || sk.type === 'utility') {
      if (u.canAfford(sk)) { this.battle.useSkill(u, id); this.afterAction(); }
      return;
    }
    this.activeSkill = this.activeSkill === id ? null : id;
    this.hud.refresh();
  }

  endTurn() {
    if (this.battle.phase !== 'playing' || this.renderer.animating) return;
    const u = this.battle.current;
    if (!u || u.faction !== 'player') return;
    this.battle.endTurn();
  }

  wait() {
    if (this.battle.phase !== 'playing' || this.renderer.animating) return;
    const u = this.battle.current;
    if (!u || u.faction !== 'player') return;
    this.battle.wait();
  }

  refreshReach() {
    const u = this.battle.current;
    const view = this.renderer.view;
    if (u && u.faction === 'player' && this.battle.phase === 'playing' && !u.isFleeing) {
      this.reach = this.battle.reachableFor(u);
      view.reachable = this.reach;
      view.selected = u;
      const sk = this.activeSkill ? SKILLS[this.activeSkill] : null;
      view.targets = sk && u.canAfford(sk) ? this.battle.targetsFor(u, sk) : [];
    } else {
      this.reach = null;
      view.reachable = new Map();
      view.targets = [];
      view.selected = null;
      view.path = [];
    }
  }

  // ------------------------------------------------------------ loop
  update(dt, now) {
    if (!this.fitted) this.resize();
    this.panWithKeys(dt);
    this.renderer.update(dt);
    this.tickAI(now);
    this.refreshReach();
    this.maybeAutoEndTurn(now);
  }

  draw() { this.renderer.draw(); }

  panWithKeys(dt) {
    const sp = 700 * dt;
    const k = this.app.keys;
    if (k.has('a') || k.has('arrowleft')) { this.camera.x -= sp; this.userMovedCamera = true; }
    if (k.has('d') || k.has('arrowright')) { this.camera.x += sp; this.userMovedCamera = true; }
    if (k.has('w') || k.has('arrowup')) { this.camera.y -= sp; this.userMovedCamera = true; }
    if (k.has('s') || k.has('arrowdown')) { this.camera.y += sp; this.userMovedCamera = true; }
  }

  tickAI(now) {
    const b = this.battle;
    if (b.phase !== 'playing') return;
    const u = b.current;
    if (!u) return;
    if (!(u.faction === 'enemy' || u.isFleeing)) return;
    if (this.renderer.animating) { this.aiClock = now + AI_STEP_DELAY; return; }
    if (now < (this.aiClock ?? 0)) return;

    this.aiClock = now + AI_STEP_DELAY;
    if (!this.ai.step(u)) b.endTurn();
    else this.hud.refresh();
  }
}
