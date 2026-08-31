import { Unit } from './battle/unit.js';
import { TEMPLATES } from './data/units.js';
import { RNG } from './core/rng.js';
import { DollBank } from './render/dollBank.js';
import { icons } from './ui/icons.js';
import { TerrainAtlas } from './render/terrainAtlas.js';
import { HUD } from './ui/hud.js';
import { WorldHud } from './ui/worldHud.js';
import { overlay } from './ui/overlay.js';
import { Campaign } from './campaign/campaign.js';
import { CampaignScene } from './scenes/campaignScene.js';
import { BattleScene } from './scenes/battleScene.js';
import { LabScene } from './scenes/labScene.js';

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
    this.dollBank = null;
    this.maxCompanySize = MAX_COMPANY_SIZE;

    overlay.init();
    this.battleHud = new HUD();
    this.worldHud = new WorldHud();

    this.newCampaign();
    this.bindInput();
    this.loadSprites();

    this.loop = this.loop.bind(this);
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  newCampaign() {
    // The first sword is the captain; the tree they feed belongs to the outfit,
    // so a successor inherits everything the company has learned.
    const roster = STARTING_KINDS.map((k, i) =>
      new Unit(TEMPLATES[k], this.rng, { faction: 'player', captain: i === 0 }));
    this.campaign = new Campaign({
      seed: this.rng.int(0, 1e9), cols: 28, rows: 18, roster, crowns: STARTING_CROWNS,
    });
    this.campaignScene = new CampaignScene(this, this.campaign);
    this.setScene(this.campaignScene);
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
    const bank = await DollBank.load('assets/dcss');
    if (!bank) return;
    this.dollBank = bank;
    if (this.scene?.renderer && 'dolls' in this.scene.renderer) this.scene.renderer.dolls = bank;
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
      this.campaign.note(`${u.name} 이(가) 전사했다.`, 'death');
    }
    const promoted = this.company.ensureCaptain();
    if (promoted) this.campaign.note(`${promoted.name} 이(가) 새 단장이 되었다.`, 'renown');
    for (const id of report.leftovers || []) this.company.stashItem(id);
    if (report.leftovers?.length) {
      this.campaign.note(`노획품 ${report.leftovers.length}점을 창고에 넣었다.`, 'loot');
    }

    this.setScene(this.campaignScene);
    if (!this.company.size) this.gameOver();
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
    () => this.newCampaign(), '새로 시작');
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
