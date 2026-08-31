import { Battle } from './battle/battle.js';
import { Unit } from './battle/unit.js';
import { AI } from './battle/ai.js';
import { TEMPLATES } from './data/units.js';
import { SKILLS } from './data/skills.js';
import { Layout } from './hex/layout.js';
import { key } from './hex/hex.js';
import { pathTo } from './hex/pathfind.js';
import { Camera } from './render/camera.js';
import { Renderer, ELEV_RATIO } from './render/renderer.js';
import { Effects } from './render/effects.js';
import { HUD } from './ui/hud.js';
import { SpriteBank } from './render/sprites.js';
import { RNG } from './core/rng.js';
import { salvage } from './campaign/loot.js';

const COMPANY_SIZE = 6;
const AI_STEP_DELAY = 380;   // ms between AI actions, so the player can follow along

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.rng = new RNG();
    this.layout = new Layout(42);
    this.camera = new Camera();
    this.roster = this.recruitCompany();
    this.activeSkill = null;
    this.inspected = null;
    this.hover = null;
    this.dragging = null;
    this.keys = new Set();

    this.newBattle();
    this.bindInput();
    this.loadSprites();
    this.loop = this.loop.bind(this);
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  /** LPC sheets are optional: without them the renderer draws its own figures. */
  async loadSprites() {
    const bank = await SpriteBank.load('assets/lpc');
    if (!bank) return;
    this.spriteBank = bank;
    this.renderer.sprites = bank;
  }

  // ------------------------------------------------------------ setup
  recruitCompany() {
    const kinds = ['sellsword', 'brawler', 'militia', 'militia', 'poacher', 'daytaler'];
    return kinds.map((k) => new Unit(TEMPLATES[k], this.rng, { faction: 'player' }));
  }

  /** Opposition ramps with the battle count: more bodies, then better ones. */
  rollEnemies(n) {
    const size = 3 + Math.min(5, Math.ceil(n / 2));
    const tier = [TEMPLATES.banditThug, TEMPLATES.banditThug, TEMPLATES.banditRaider];
    if (n >= 2) tier.push(TEMPLATES.banditArcher, TEMPLATES.wolf);
    if (n >= 3) tier.push(TEMPLATES.banditVeteran);

    const pool = [];
    if (n >= 3) pool.push(TEMPLATES.banditVeteran);
    if (n >= 4) pool.push(TEMPLATES.banditVeteran);
    if (n >= 5) pool.push(TEMPLATES.banditLeader);
    while (pool.length < size) pool.push(this.rng.pick(tier));
    return pool.map((t) => new Unit(t, this.rng, { faction: 'enemy' }));
  }

  newBattle() {
    // Permadeath: the fallen are gone, fresh blood fills the ranks.
    this.roster = this.roster.filter((u) => u.alive).map((u) => u.resetForBattle());
    const fillers = ['brawler', 'militia', 'poacher', 'daytaler', 'farmhand'];
    while (this.roster.length < COMPANY_SIZE) {
      this.roster.push(new Unit(TEMPLATES[this.rng.pick(fillers)], this.rng, { faction: 'player' }));
    }
    this.battleCount = (this.battleCount || 0) + 1;

    const biome = this.rng.pick(['plains', 'plains', 'forest', 'hills', 'swamp']);
    this.battle = new Battle({ cols: 15, rows: 9, seed: this.rng.int(0, 1e9), biome });
    this.battle.deploy(this.roster, 0, 2);
    this.battle.deploy(this.rollEnemies(this.battleCount), this.battle.grid.cols - 3, this.battle.grid.cols - 1);

    this.effects = new Effects();
    this.renderer = new Renderer(this.canvas, this.battle, this.layout, this.camera, this.effects);
    this.renderer.sprites = this.spriteBank || null;
    this.ai = new AI(this.battle);
    if (this.hud) this.hud.attach(this.battle);
    else this.hud = new HUD(this.battle, this);
    this.wireBattle();

    this.activeSkill = null;
    this.inspected = null;
    this.fitted = false;
    this.userMovedCamera = false;
    this.battle.start();
    this.hud.refresh();
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

  wireBattle() {
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
      this.activeSkill = this.defaultSkill(unit);
      this.inspected = null;
      this.camera.centerOn(this.layout.toPixel(unit.hex), 0.35);
      this.hud.refresh();
    });

    b.bus.on('round:start', ({ round }) => {
      if (round > 1) this.hud.showBanner(`${round} 라운드`, 900);
    });

    b.bus.on('battle:over', ({ result }) => {
      this.hud.showBanner(result === 'victory' ? '승리' : '패배', 2600);
      this.loot = result === 'victory'
        ? salvage(this.roster.filter((u) => u.alive), b.units.filter((u) => u.faction === 'enemy' && !u.alive))
        : [];
      setTimeout(() => this.showResult(result), 1200);
    });
  }

  showResult(result) {
    const survivors = this.roster.filter((u) => u.alive);
    const fallen = this.roster.filter((u) => !u.alive);
    const rows = survivors.map((u) =>
      `<div class="gear-row"><i>${u.name}</i><em>체력 ${Math.max(0, u.hp)}/${u.hpMax} · 처치 ${u.kills}</em></div>`).join('');
    this.hud.modal(result === 'victory' ? '전투 승리' : '부대 전멸', `
      ${result === 'victory'
        ? '적을 몰아냈다. 상처를 싸매고 다음 계약을 준비하자.'
        : '용병단이 무너졌다. 살아남은 자들이 새 동료를 모은다.'}
      <hr style="border:0;border-top:1px solid var(--edge);margin:10px 0">
      <b>생존자 ${survivors.length}명</b>${rows || '<div class="gear-row"><i>없음</i></div>'}
      ${fallen.length ? `<hr style="border:0;border-top:1px solid var(--edge);margin:10px 0">
        <b style="color:#d1705d">전사자 ${fallen.length}명</b>
        ${fallen.map((u) => `<div class="gear-row"><i>${u.name}</i><em>${u.title}</em></div>`).join('')}` : ''}
      ${this.loot?.length ? `<hr style="border:0;border-top:1px solid var(--edge);margin:10px 0">
        <b style="color:#c8a24a">전리품</b>
        ${this.loot.map((c) => `<div class="gear-row"><i>${c.unit.name}</i><em>${c.from} → ${c.to}</em></div>`).join('')}` : ''}
      <p style="color:var(--muted);font-size:12px">‘새 전투’ 를 누르면 다음 교전이 시작된다.</p>`);
  }

  defaultSkill(unit) {
    if (!unit || unit.faction !== 'player') return null;
    const atk = unit.skills.find((s) => s.type === 'melee' || s.type === 'ranged');
    return atk ? atk.id : null;
  }

  // ------------------------------------------------------------ input
  bindInput() {
    const c = this.canvas;

    c.addEventListener('mousemove', (e) => {
      const r = c.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY };
      if (this.dragging) {
        this.camera.pan(e.clientX - this.dragging.x, e.clientY - this.dragging.y);
        this.dragging = { x: e.clientX, y: e.clientY, moved: true };
        this.userMovedCamera = true;
      }
      this.updateHover();
    });

    c.addEventListener('mousedown', (e) => {
      if (e.button === 1 || e.button === 2) { this.dragging = { x: e.clientX, y: e.clientY }; return; }
      this.dragging = { x: e.clientX, y: e.clientY, primary: true };
    });

    window.addEventListener('mouseup', (e) => {
      const d = this.dragging;
      this.dragging = null;
      if (!d) return;
      if (d.moved) return;                       // it was a camera drag, not a click
      if (e.button === 2) { this.activeSkill = this.defaultSkill(this.battle.current); this.hud.refresh(); return; }
      if (e.button === 0 && e.target === this.canvas) this.click();
    });

    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.camera.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY, r.width, r.height);
      this.userMovedCamera = true;
    }, { passive: false });

    c.addEventListener('mouseleave', () => { this.hover = null; this.hud.hideTip(); });

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      this.keys.add(e.key.toLowerCase());
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
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('resize', () => this.refit());

    // Fires once as soon as the canvas has real layout, which the constructor does not.
    if (window.ResizeObserver) new ResizeObserver(() => this.refit()).observe(this.canvas);
  }

  /** Re-measure and re-frame the board, unless the player has moved the camera. */
  refit() {
    this.renderer.resize();
    if (!this.userMovedCamera) { this.centerOnField(); this.fitted = true; }
  }

  /**
   * Raised tiles are drawn shifted upward, so a naive pixel-to-hex lookup would
   * pick the tile below them. Test each height level from the top down and take
   * the first tile that actually sits at that height.
   */
  hexUnderMouse() {
    if (!this.mouse) return null;
    const r = this.canvas.getBoundingClientRect();
    const w = this.camera.screenToWorld(this.mouse.x, this.mouse.y, r.width, r.height);
    const step = this.layout.size * ELEV_RATIO;
    for (let level = 3; level >= 1; level--) {
      const h = this.layout.toHex(w.x, w.y + level * step);
      if (this.battle.grid.elevation(h) === level) return h;
    }
    return this.layout.toHex(w.x, w.y);
  }

  updateHover() {
    const h = this.hexUnderMouse();
    this.hover = h;
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
      this.hud.showAttackTip(u, target, sk, this.mouse.cx, this.mouse.cy);
      return;
    }
    if (target) {
      this.hud.renderCard(target);
      this.hud.hideTip();
      return;
    }
    this.hud.renderCard(this.inspected || b.current);
    if (myTurn && this.reach?.has(key(h))) view.path = pathTo(this.reach, u.hex, h) || [];
    this.hud.showTerrainTip(b.grid.get(h), b.grid.terrainAt(h), this.mouse.cx, this.mouse.cy);
  }

  click() {
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

    if (this.reach?.has(key(h))) {
      b.moveUnit(u, h);
      this.afterAction();
    }
  }

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
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    if (!this.fitted) this.refit();

    this.panWithKeys(dt);
    this.renderer.update(dt);
    this.tickAI(now);
    this.refreshReach();
    this.renderer.draw();

    requestAnimationFrame(this.loop);
  }

  panWithKeys(dt) {
    const sp = 700 * dt;
    if (this.keys.has('a') || this.keys.has('arrowleft')) this.camera.x -= sp;
    if (this.keys.has('d') || this.keys.has('arrowright')) this.camera.x += sp;
    if (this.keys.has('w') || this.keys.has('arrowup')) this.camera.y -= sp;
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.camera.y += sp;
  }

  tickAI(now) {
    const b = this.battle;
    if (b.phase !== 'playing') return;
    const u = b.current;
    if (!u) return;
    const autoplay = u.faction === 'enemy' || u.isFleeing;
    if (!autoplay) return;
    if (this.renderer.animating) { this.aiClock = now + AI_STEP_DELAY; return; }
    if (now < (this.aiClock ?? 0)) return;

    this.aiClock = now + AI_STEP_DELAY;
    const acted = this.ai.step(u);
    if (!acted) b.endTurn();
    else this.hud.refresh();
  }
}

const canvas = document.getElementById('board');
const game = new Game(canvas);
window.game = game;   // handy for tinkering in the console
