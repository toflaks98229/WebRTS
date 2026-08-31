import { Battle } from '../battle/battle.js';
import { Unit } from '../battle/unit.js';
import { TEMPLATES } from '../data/units.js';
import { PERKS, xpForLevel, MAX_TIER } from '../data/perks.js';
import { perkGridHTML, perkTipHTML } from '../ui/perkView.js';
import { WEAPONS, SHIELDS, BODY_ARMOR, HELMETS } from '../data/items.js';
import { Layout } from '../hex/layout.js';
import { Camera } from '../render/camera.js';
import { Renderer, ELEV_RATIO } from '../render/renderer.js';
import { Effects } from '../render/effects.js';
import { BattleScene } from './battleScene.js';
import { overlay, esc } from '../ui/overlay.js';

const BIOMES = ['plains', 'forest', 'hills', 'swamp'];
const $ = (sel) => document.querySelector(sel);

/**
 * Debug sandbox. Place any template on any hex, dial its level, gear and perks,
 * then run the fight. Nothing here touches the campaign - it exists so combat
 * maths and perks can be exercised in isolation.
 */
export class LabScene {
  constructor(app, opts = {}) {
    this.app = app;
    this.canvas = app.canvas;
    this.onExit = opts.onExit || (() => {});

    this.layout = new Layout(42);
    this.camera = new Camera();
    this.effects = new Effects();

    this.biome = 'plains';
    this.brush = { templateId: 'sellsword', faction: 'player', level: 1, perks: new Set() };
    this.placed = [];
    this.userMovedCamera = false;

    this.newField();
  }

  // ------------------------------------------------------------ lifecycle
  newField(keepUnits = false) {
    const kept = keepUnits ? this.placed.map((p) => ({ tpl: p.unit.template.id, faction: p.unit.faction, hex: p.hex, level: p.unit.level, perks: [...p.unit.perks] })) : [];
    this.battle = new Battle({ cols: 15, rows: 9, seed: this.app.rng.int(0, 1e9), biome: this.biome });
    this.renderer = new Renderer(this.canvas, this.battle, this.layout, this.camera, this.effects);
    this.renderer.dolls = this.app.dollBank || null;
    this.renderer.atlas = this.app.terrainAtlas || null;
    this.placed = [];
    for (const k of kept) this.place(k.hex, k);
  }

  enter() {
    this.app.setMode('lab');
    this.renderPalette();
    this.renderActions();
    this.renderInfo();
  }

  exit() { overlay.hideTip(); }

  resize() {
    this.renderer.resize();
    if (this.renderer.w < 200 || this.renderer.h < 150) return;
    if (!this.userMovedCamera) this.fit();
  }

  fit() {
    const pts = this.battle.grid.all().map((t) => this.layout.toPixel(t.hex));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    this.camera.x = (Math.min(...xs) + Math.max(...xs)) / 2;
    this.camera.y = (Math.min(...ys) + Math.max(...ys)) / 2;
    const pad = this.layout.size * 2;
    const availW = Math.max(320, this.renderer.w - (258 + 288) * 0.8 - 32);
    const availH = Math.max(240, this.renderer.h - 24);
    this.camera.zoom = Math.max(0.4, Math.min(1.4, Math.min(
      availW / (Math.max(...xs) - Math.min(...xs) + pad),
      availH / (Math.max(...ys) - Math.min(...ys) + pad * 0.6),
    )));
  }

  // ------------------------------------------------------------ placement
  /** Build a unit from the brush (or a saved spec) and put it on the board. */
  place(hex, spec = null) {
    if (!this.battle.grid.passable(hex) || this.battle.unitAt(hex)) return null;
    const src = spec || this.brush;
    const tplId = spec ? spec.tpl : this.brush.templateId;
    const unit = new Unit(TEMPLATES[tplId], this.app.rng, { faction: src.faction });

    // Keep level and experience consistent, or gainXP() would be a no-op on
    // anything the slider promoted.
    const level = src.level ?? 1;
    unit.level = level;
    unit.xp = xpForLevel(level);
    unit.perkPoints = level - 1;
    for (const id of (spec ? spec.perks : this.brush.perks)) { unit.perks.add(id); unit.perkPoints = Math.max(0, unit.perkPoints - 1); }
    unit.hp = unit.hpMax;

    this.battle.addUnit(unit, hex);
    this.placed.push({ unit, hex });
    return unit;
  }

  removeAt(hex) {
    const u = this.battle.unitAt(hex);
    if (!u) return false;
    this.battle.units = this.battle.units.filter((x) => x !== u);
    this.placed = this.placed.filter((p) => p.unit !== u);
    return true;
  }

  clear() {
    this.battle.units = [];
    this.placed = [];
    this.renderInfo();
  }

  get sides() {
    return {
      player: this.placed.filter((p) => p.unit.faction === 'player').map((p) => p.unit),
      enemy: this.placed.filter((p) => p.unit.faction === 'enemy').map((p) => p.unit),
    };
  }

  start() {
    const { player, enemy } = this.sides;
    if (!player.length || !enemy.length) {
      overlay.modal('실험실', '양쪽에 유닛을 최소 한 기씩 배치해야 전투를 시작할 수 있다.');
      return;
    }
    // Keep everyone exactly where they were put.
    for (const p of this.placed) { p.unit.prepareForBattle(); p.unit.hex = p.hex; }
    const battle = this.battle;
    this.app.setScene(new BattleScene(this.app, {
      battle,
      roster: player,
      onFinish: () => { this.newField(true); this.app.setScene(this); },
    }));
  }

  // ------------------------------------------------------------ panels
  renderPalette() {
    const groups = [
      ['용병단', ['sellsword', 'hedgeKnight', 'brawler', 'militia', 'poacher', 'daytaler', 'farmhand']],
      ['적', ['banditThug', 'banditRaider', 'banditArcher', 'banditVeteran', 'banditLeader', 'wolf']],
    ];
    const html = groups.map(([label, ids]) => `
      <div class="lab-group">${label}</div>
      ${ids.map((id) => `<button class="lab-tpl ${this.brush.templateId === id ? 'active' : ''}" data-tpl="${id}">
        ${esc(TEMPLATES[id].name)}<em>${TEMPLATES[id].faction === 'player' ? '아군' : '적'}</em>
      </button>`).join('')}`).join('');

    $('#lab-palette').innerHTML = `
      <div class="cc-head">배치 유닛</div>
      <div class="lab-row">
        <span>진영</span>
        <div class="seg">
          <button class="seg-btn ${this.brush.faction === 'player' ? 'active' : ''}" data-fac="player">아군</button>
          <button class="seg-btn ${this.brush.faction === 'enemy' ? 'active' : ''}" data-fac="enemy">적</button>
        </div>
      </div>
      <div class="lab-row">
        <span>레벨</span>
        <input id="lab-level" type="range" min="1" max="11" value="${this.brush.level}" />
        <b>${this.brush.level}</b>
      </div>
      <button class="btn ghost lab-wide" data-open="perks">브러시 특성 (${this.brush.perks.size})</button>
      ${html}`;

    $('#lab-palette').querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => {
      this.brush.templateId = b.dataset.tpl;
      this.brush.faction = TEMPLATES[b.dataset.tpl].faction;
      this.renderPalette();
    }));
    $('#lab-palette').querySelectorAll('[data-fac]').forEach((b) => b.addEventListener('click', () => {
      this.brush.faction = b.dataset.fac;
      this.renderPalette();
    }));
    $('#lab-level').addEventListener('input', (e) => {
      this.brush.level = Number(e.target.value);
      this.renderPalette();
    });
    $('#lab-palette').querySelector('[data-open="perks"]').addEventListener('click', () => this.perkDialog());
  }

  /** Every perk is toggleable here regardless of tier - it is a debug brush. */
  perkDialog() {
    const draw = () => {
      const grid = perkGridHTML((pk) => (this.brush.perks.has(pk.id) ? 'taken' : 'can'),
        { level: MAX_TIER });
      overlay.modal('브러시 특성', `
        <div class="cp-capbar"><div>여기서 켠 특성이 이후 배치하는 유닛에 함께 붙는다.
          <span class="cp-note">티어 제한은 무시된다 — 조합을 바로 시험해 보기 위해서다.</span></div>
          <div class="cb-count">${this.brush.perks.size} / 24</div></div>
        ${grid}`, null, '닫기', 'wide');

      $('#modal-body').querySelectorAll('[data-perk]').forEach((b) => {
        const pk = PERKS[b.dataset.perk];
        b.addEventListener('mouseenter', (ev) => {
          const r = ev.currentTarget.getBoundingClientRect();
          overlay.tip(perkTipHTML(pk, this.brush.perks.has(pk.id) ? '클릭해서 해제' : '클릭해서 적용'),
            r.left + r.width / 2, r.top, true);
        });
        b.addEventListener('mouseleave', () => overlay.hideTip());
        b.addEventListener('click', () => {
          const id = b.dataset.perk;
          if (this.brush.perks.has(id)) this.brush.perks.delete(id); else this.brush.perks.add(id);
          overlay.hideTip();
          this.renderPalette();
          draw();
        });
      });
    };
    draw();
  }

  renderActions() {
    $('#lab-actions').innerHTML = `
      <div class="seg">${BIOMES.map((b) =>
        `<button class="seg-btn ${this.biome === b ? 'active' : ''}" data-biome="${b}">${b}</button>`).join('')}</div>
      <button class="btn" data-lab="regen">지형 재생성</button>
      <button class="btn" data-lab="clear">전부 지우기</button>
      <button class="btn primary" data-lab="start">전투 시작</button>
      <button class="btn" data-lab="exit">지도로</button>`;

    $('#lab-actions').querySelectorAll('[data-biome]').forEach((b) => b.addEventListener('click', () => {
      this.biome = b.dataset.biome;
      this.newField(true);
      this.userMovedCamera = false;
      this.resize();
      this.renderActions();
    }));
    $('#lab-actions').querySelectorAll('[data-lab]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.lab;
      if (a === 'regen') { this.newField(true); this.userMovedCamera = false; this.resize(); }
      else if (a === 'clear') this.clear();
      else if (a === 'start') this.start();
      else if (a === 'exit') this.onExit();
      this.renderInfo();
    }));
  }

  renderInfo() {
    const { player, enemy } = this.sides;
    $('#lab-info').innerHTML = `<b>실험실</b> · 아군 ${player.length} · 적 ${enemy.length}`;
    $('#lab-hint').innerHTML = '<b>좌클릭</b> 배치 · <b>우클릭</b> 제거 · 팔레트에서 템플릿·진영·레벨·특성을 정한다.';
  }

  // ------------------------------------------------------------ input
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
    const h = this.hexUnderMouse();
    this.renderer.view.hover = h;
    const m = this.app.mouse;
    if (!h || !this.battle.grid.has(h)) { overlay.hideTip(); return; }
    const u = this.battle.unitAt(h);
    const t = this.battle.grid.terrainAt(h);
    const tile = this.battle.grid.get(h);
    overlay.tip(u
      ? `<h4>${esc(u.name)}</h4>
         <div class="row"><span>배경</span><b>${esc(u.title)} · ${u.level}레벨</b></div>
         <div class="row"><span>체력</span><b>${u.hpMax}</b></div>
         <div class="row"><span>근접 / 원거리</span><b>${u.meleeSkill} / ${u.rangedSkill}</b></div>
         <div class="row"><span>방어</span><b>${u.meleeDefense} / ${u.rangedDefense}</b></div>
         ${u.perks.size ? `<hr><div class="note">${[...u.perks].map((p) => PERKS[p].name).join(', ')}</div>` : ''}`
      : `<h4>${t.name}</h4>
         <div class="row"><span>이동</span><b>${t.passable ? `${t.moveCost} AP` : '통과 불가'}</b></div>
         <div class="row"><span>고도</span><b>${tile.elev}</b></div>`, m.cx, m.cy);
  }

  onMouseLeave() { this.renderer.view.hover = null; overlay.hideTip(); }
  onDrag() { this.userMovedCamera = true; }

  onWheel(e) {
    const r = this.canvas.getBoundingClientRect();
    this.camera.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY, r.width, r.height);
    this.userMovedCamera = true;
  }

  onClick() {
    const h = this.hexUnderMouse();
    if (h) { this.place(h); this.renderInfo(); }
  }

  onSecondaryClick() {
    const h = this.hexUnderMouse();
    if (h) { this.removeAt(h); this.renderInfo(); }
  }

  onKeyDown(e) {
    if (e.code === 'Space') { e.preventDefault(); this.start(); }
    else if (e.key === 'Escape') this.onExit();
    else if (e.key.toLowerCase() === 'r') { this.newField(true); this.userMovedCamera = false; this.resize(); }
  }

  showHelp() {
    overlay.modal('실험실', `
      <ul>
        <li>왼쪽 팔레트에서 <b>템플릿 · 진영 · 레벨 · 특성</b>을 고른 뒤 <b>좌클릭</b>으로 배치한다.</li>
        <li><b>우클릭</b>으로 배치한 유닛을 제거한다.</li>
        <li>레벨을 올리면 특성 점수만 오르고 능력치는 그대로다 — 특성 효과만 따로 보기 위해서다.</li>
        <li><b>전투 시작</b>(Space)을 누르면 배치 그대로 전투가 열린다. 끝나면 같은 배치로 돌아온다.</li>
        <li><b>R</b> 또는 지형 재생성으로 같은 배치에 새 지형을 깐다.</li>
      </ul>`);
  }

  // ------------------------------------------------------------ loop
  update(dt) {
    this.panWithKeys(dt);
    this.renderer.update(dt);
    this.renderer.view.reachable = new Map();
    this.renderer.view.targets = [];
  }

  draw() { this.renderer.draw(); }

  panWithKeys(dt) {
    const sp = 700 * dt;
    const k = this.app.keys;
    if (k.size) this.userMovedCamera = true;
    if (k.has('a') || k.has('arrowleft')) this.camera.x -= sp;
    if (k.has('d') || k.has('arrowright')) this.camera.x += sp;
    if (k.has('w') || k.has('arrowup')) this.camera.y -= sp;
    if (k.has('s') || k.has('arrowdown')) this.camera.y += sp;
  }
}

export { WEAPONS, SHIELDS, BODY_ARMOR, HELMETS };
