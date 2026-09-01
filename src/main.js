import { Unit } from './battle/unit.js';
import { TEMPLATES } from './data/units.js';
import { RNG } from './core/rng.js';
import { UnitArt } from './render/unitArt.js';
import { icons } from './ui/icons.js';
import { TerrainAtlas } from './render/terrainAtlas.js';
import { HUD } from './ui/hud.js';
import { WorldHud } from './ui/worldHud.js';
import { overlay, esc } from './ui/overlay.js';
import { Campaign } from './campaign/campaign.js';
import { CampaignScene } from './scenes/campaignScene.js';
import { BattleScene } from './scenes/battleScene.js';
import { LabScene } from './scenes/labScene.js';
import { AMBITIONS, ambition } from './data/ambitions.js';
import { readSave, writeSave, clearSave, savePeek } from './campaign/save.js';

/** How many brothers the company can field at once. */
export const MAX_COMPANY_SIZE = 9;
const STARTING_KINDS = ['sellsword', 'brawler', 'militia', 'militia', 'poacher', 'daytaler'];
const STARTING_CROWNS = 900;

/**
 * Application shell. Owns the canvas, the persistent company and the two
 * scenes, and routes input to whichever one is active. Scenes never talk to
 * each other - they hand control back through here.
 */
class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.rng = new RNG();
    this.keys = new Set();
    this.mouse = null;
    this.dragging = null;
    this.unitArt = null;
    this.maxCompanySize = MAX_COMPANY_SIZE;

    overlay.init();
    this.battleHud = new HUD();
    this.worldHud = new WorldHud();

    this.bootCampaign();
    this.bindInput();
    this.loadSprites();

    this.loop = this.loop.bind(this);
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  /**
   * A run outlives a browser tab. If there is a campaign in the slot, offer it
   * back before starting over - losing fifty days to a closed tab is the one
   * failure the player cannot do anything about.
   */
  bootCampaign() {
    const peek = savePeek();
    if (!peek) { this.newCampaign(); return; }
    const a = ambition(peek.ambitionId);
    overlay.choose('용병단', `
      <p style="color:var(--muted);margin:0 0 14px">지난 여정이 남아 있다.</p>
      <div class="ambitions">
        <button class="ambition" data-choice="resume">
          <span class="am-icon">${a.icon}</span>
          <span class="am-text"><b>여정을 이어간다</b>
            <em>${peek.day}일차 · 단원 ${peek.size}명 · ${peek.crowns.toLocaleString()} 크라운</em>
            <span class="am-goal">${esc(a.name)}</span></span>
        </button>
        <button class="ambition" data-choice="fresh">
          <span class="am-icon">✧</span>
          <span class="am-text"><b>새 용병단을 꾸린다</b>
            <em>지난 기록은 사라진다.</em></span>
        </button>
      </div>`,
    (pick) => {
      const restored = pick === 'resume' ? readSave() : null;
      if (restored) { this.useCampaign(restored); this.campaign.note('여정을 이어간다.', 'start'); }
      else { clearSave(); this.newCampaign(); }
    }, 'wide');
  }

  newCampaign() {
    // The first sword is the captain; the tree they feed belongs to the outfit,
    // so a successor inherits everything the company has learned.
    const roster = STARTING_KINDS.map((k, i) =>
      new Unit(TEMPLATES[k], this.rng, { faction: 'player', captain: i === 0 }));
    this.useCampaign(new Campaign({
      seed: this.rng.int(0, 1e9), cols: 28, rows: 18, roster, crowns: STARTING_CROWNS,
    }));
    this.askAmbition();
  }

  /** Put a campaign - new or restored - in charge, and keep it written down. */
  useCampaign(campaign) {
    this.campaign = campaign;
    this.campaignScene = new CampaignScene(this, campaign);
    campaign.bus.on('ambition:done', ({ progress }) => this.runComplete(progress));
    campaign.bus.on('day', () => this.autosave());
    this.setScene(this.campaignScene);
  }

  autosave() { if (this.campaign && !this.campaign.ambitionDone) writeSave(this.campaign); }

  /**
   * A company with no goal is a sandbox. The choice is made before the clock
   * starts and cannot be skipped, because it decides how the run is played.
   */
  askAmbition() {
    const cards = Object.values(AMBITIONS).map((a) => `
      <button class="ambition" data-choice="${a.id}">
        <span class="am-icon">${a.icon}</span>
        <span class="am-text">
          <b>${esc(a.name)}</b>
          <em>${esc(a.blurb)}</em>
          <span class="am-goal">${a.unit} <b>${a.goal.toLocaleString()}</b></span>
        </span>
      </button>`).join('');

    overlay.choose('무엇을 위해 싸우는가', `
      <p style="color:var(--muted);margin:0 0 14px">
        용병단이 이루려는 것을 하나 고른다. 이룬 순간 여정이 끝나고, 고른 것이
        이 판을 어떻게 살아갈지를 정한다.
      </p>
      <div class="ambitions">${cards}</div>`,
    (id) => {
      this.campaign.ambitionId = id;
      const a = AMBITIONS[id];
      this.campaign.note(`용병단의 뜻을 세웠다 — ${a.name} (${a.unit} ${a.goal}).`, 'renown');
      this.worldHud.refresh();
      this.autosave();
    }, 'wide');
  }

  /** The ambition is met: the run is over, and this is the reckoning. */
  runComplete(p) {
    const c = this.campaign;
    const alive = c.company.alive;
    const best = alive.slice().sort((a, b) => b.level - a.level)[0];
    const row = (k, v) => `<div class="gear-row"><i>${k}</i><em>${v}</em></div>`;
    overlay.modal(`${p.def.icon} ${p.def.name}`, `
      뜻을 이루었다. ${c.day}일간의 여정이 여기서 끝난다.
      <hr style="border:0;border-top:1px solid var(--edge);margin:10px 0">
      ${row(p.def.unit, `${p.have.toLocaleString()} / ${p.goal.toLocaleString()}`)}
      ${row('버틴 날', `${c.day}일`)}
      ${row('치른 전투', `${c.battlesFought}회`)}
      ${row('소탕한 야영지', `${c.campsCleared}곳`)}
      ${row('잃은 단원', `${c.fallen}명`)}
      ${row('남은 단원', `${alive.length}명`)}
      ${best ? row('최고참', `${esc(best.name)} · ${best.level} 레벨`) : ''}
      ${row('금고', `${c.company.crowns.toLocaleString()} 크라운`)}`,
    () => { clearSave(); this.newCampaign(); }, '새 용병단');
  }

  /** The company's roster, purse and stash - the state that outlives a battle. */
  get company() { return this.campaign.company; }

  /** Art is optional throughout; without it the game draws its own shapes. */
  async loadSprites() {
    // Icons arrive after the first paint; nudge the live HUD so they appear.
    icons.load('assets/dcss').then((ok) => { if (ok) this.scene?.hud?.refresh?.(); });
    TerrainAtlas.load('assets/dcss').then((atlas) => {
      this.terrainAtlas = atlas;
      if (atlas && this.scene?.renderer && 'atlas' in this.scene.renderer) {
        this.scene.renderer.atlas = atlas;
      }
    });
    const art = await UnitArt.load('assets/dcss');
    if (!art) return;
    this.unitArt = art;
    if (this.scene?.renderer && 'art' in this.scene.renderer) this.scene.renderer.art = art;
  }

  setMode(mode) { document.getElementById('app').className = `mode-${mode}`; }

  setScene(scene) {
    this.scene?.exit?.();
    this.scene = scene;
    scene.enter();
    scene.resize();
  }

  // ------------------------------------------------------------ transitions
  /** Overworld contact -> tactical battle. */
  startBattle(band, biome) {
    const fighters = this.company.alive;
    if (!fighters.length) { this.gameOver(); return; }
    // Wounds and battered armour carry into the fight; only turn state resets.
    fighters.forEach((u) => {
      u.prepareForBattle();
      u.companyPerks = this.company.captainPerks;
    });

    const enemies = band.roster.map((id) => new Unit(TEMPLATES[id], this.rng, { faction: 'enemy' }));
    this.setScene(new BattleScene(this, {
      roster: fighters,
      enemies,
      biome,
      onFinish: (result, report) => this.endBattle(result, report),
    }));
    overlay.banner(band.name, 1400);
  }

  /** Battle over -> back to the map, carrying wounds, losses and loot with us. */
  endBattle(result, report = {}) {
    // Resolve first so the journal reads in the order things happened:
    // the outcome, then the butcher's bill, then what was carried off.
    this.campaign.resolveEncounter(result);
    for (const u of this.company.buryDead()) {
      this.campaign.fallen++;
      this.campaign.note(`${u.name} 이(가) 전사했다.`, 'death');
    }
    const promoted = this.company.ensureCaptain();
    if (promoted) this.campaign.note(`${promoted.name} 이(가) 새 단장이 되었다.`, 'renown');
    for (const id of report.leftovers || []) this.company.stashItem(id);
    if (report.leftovers?.length) {
      this.campaign.note(`노획품 ${report.leftovers.length}점을 창고에 넣었다.`, 'loot');
    }

    this.setScene(this.campaignScene);
    if (!this.company.size) { this.gameOver(); return; }
    this.autosave();
  }

  /** Debug sandbox. Does not touch the campaign; Esc or the button returns. */
  openLab() {
    if (this.scene instanceof LabScene) return;
    this.returnScene = this.scene;
    this.labScene = new LabScene(this, { onExit: () => this.setScene(this.returnScene) });
    this.setScene(this.labScene);
  }

  gameOver() {
    overlay.modal('용병단의 최후', `
      마지막 단원까지 쓰러졌다. ${this.campaign.day}일간의 여정이 여기서 끝났다.
      <hr style="border:0;border-top:1px solid var(--edge);margin:10px 0">
      새 용병단을 꾸려 다시 시작한다.`,
    () => { clearSave(); this.newCampaign(); }, '새로 시작');
  }

  // ------------------------------------------------------------ input
  bindInput() {
    const c = this.canvas;

    c.addEventListener('mousemove', (e) => {
      const r = c.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY };
      if (this.dragging) {
        this.scene?.camera.pan(e.clientX - this.dragging.x, e.clientY - this.dragging.y);
        this.dragging = { x: e.clientX, y: e.clientY, moved: true };
        this.scene?.onDrag?.();
      }
      this.scene?.onMouseMove?.(e);
    });

    c.addEventListener('mousedown', (e) => {
      this.dragging = { x: e.clientX, y: e.clientY, button: e.button };
    });

    window.addEventListener('mouseup', (e) => {
      const d = this.dragging;
      this.dragging = null;
      if (!d || d.moved) return;              // it was a camera drag, not a click
      if (e.button === 2) { this.scene?.onSecondaryClick?.(); return; }
      if (e.button === 0 && e.target === this.canvas) this.scene?.onClick?.();
    });

    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.scene?.onWheel?.(e); }, { passive: false });
    c.addEventListener('mouseleave', () => this.scene?.onMouseLeave?.());

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      this.keys.add(e.key.toLowerCase());
      // The lab is reachable from anywhere except mid-battle.
      if (e.key.toLowerCase() === 'l' && !(this.scene instanceof BattleScene)) { this.openLab(); return; }
      this.scene?.onKeyDown?.(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('resize', () => this.scene?.resize());
    document.getElementById('btn-help').addEventListener('click', () => this.scene?.showHelp?.());
    document.getElementById('btn-lab').addEventListener('click', () => this.openLab());

    // Fires once as soon as the canvas has real layout, which the constructor does not.
    if (window.ResizeObserver) new ResizeObserver(() => this.scene?.resize()).observe(c);
  }

  // ------------------------------------------------------------ loop
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.scene?.update(dt, now);
    this.scene?.draw();
    requestAnimationFrame(this.loop);
  }
}

const app = new App(document.getElementById('board'));
window.app = app;   // handy for tinkering in the console
