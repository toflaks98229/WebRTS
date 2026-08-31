import { Unit } from './battle/unit.js';
import { TEMPLATES } from './data/units.js';
import { RNG } from './core/rng.js';
import { SpriteBank } from './render/sprites.js';
import { HUD } from './ui/hud.js';
import { WorldHud } from './ui/worldHud.js';
import { overlay } from './ui/overlay.js';
import { Campaign } from './campaign/campaign.js';
import { CampaignScene } from './scenes/campaignScene.js';
import { BattleScene } from './scenes/battleScene.js';

export const COMPANY_SIZE = 6;
const STARTING_KINDS = ['sellsword', 'brawler', 'militia', 'militia', 'poacher', 'daytaler'];
const RECRUIT_KINDS = ['brawler', 'militia', 'poacher', 'daytaler', 'farmhand'];

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
    this.spriteBank = null;

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
    this.roster = STARTING_KINDS.map((k) => new Unit(TEMPLATES[k], this.rng, { faction: 'player' }));
    this.campaign = new Campaign({ seed: this.rng.int(0, 1e9), cols: 28, rows: 18, roster: this.roster });
    this.campaignScene = new CampaignScene(this, this.campaign);
    this.setScene(this.campaignScene);
  }

  /** LPC sheets are optional: without them the renderer draws its own figures. */
  async loadSprites() {
    const bank = await SpriteBank.load('assets/lpc');
    if (!bank) return;
    this.spriteBank = bank;
    if (this.scene?.renderer && 'sprites' in this.scene.renderer) this.scene.renderer.sprites = bank;
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
    const fighters = this.roster.filter((u) => u.alive);
    if (!fighters.length) { this.gameOver(); return; }
    // Wounds and battered armour carry into the fight; only turn state resets.
    fighters.forEach((u) => u.prepareForBattle());

    const enemies = band.roster.map((id) => new Unit(TEMPLATES[id], this.rng, { faction: 'enemy' }));
    this.setScene(new BattleScene(this, {
      roster: fighters,
      enemies,
      biome,
      onFinish: (result) => this.endBattle(result),
    }));
    overlay.banner(band.name, 1400);
  }

  /** Battle over -> back to the map, carrying wounds and losses with us. */
  endBattle(result) {
    const fallen = this.roster.filter((u) => !u.alive);
    this.roster = this.roster.filter((u) => u.alive);
    this.campaign.roster = this.roster;
    for (const u of fallen) this.campaign.note(`${u.name} 이(가) 전사했다.`, 'death');

    this.campaign.resolveEncounter(result);
    this.setScene(this.campaignScene);
    if (!this.roster.length) this.gameOver();
  }

  /** A day in a settlement patches people up and, if there is room, hires one. */
  hireAtSettlement() {
    if (this.roster.length >= COMPANY_SIZE) return null;
    const u = new Unit(TEMPLATES[this.rng.pick(RECRUIT_KINDS)], this.rng, { faction: 'player' });
    this.roster.push(u);
    this.campaign.roster = this.roster;
    return u;
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
      this.scene?.onKeyDown?.(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('resize', () => this.scene?.resize());
    document.getElementById('btn-help').addEventListener('click', () => this.scene?.showHelp?.());

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
