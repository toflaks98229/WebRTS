import { Layout } from '../hex/layout.js';
import { Camera } from '../render/camera.js';
import { WorldRenderer } from '../render/worldRenderer.js';
import { HOUR_SECONDS, HOURS_PER_DAY } from '../campaign/campaign.js';
import { overlay } from '../ui/overlay.js';
import { SettlementPanel } from '../ui/settlementPanel.js';
import { CharacterPanel } from '../ui/characterPanel.js';

const SPEEDS = [0, 1, 3];

/**
 * The overworld. Time runs while the company travels; walking onto a band hands
 * control to a BattleScene and picks up again when it returns.
 */
export class CampaignScene {
  constructor(app, campaign) {
    this.app = app;
    this.canvas = app.canvas;
    this.campaign = campaign;
    this.hud = app.worldHud;

    this.layout = new Layout(30);
    this.camera = new Camera();
    this.camera.minZoom = 0.35;
    this.camera.maxZoom = 2.4;
    this.renderer = new WorldRenderer(this.canvas, campaign, this.layout, this.camera);
    this.renderer.atlas = app.terrainAtlas || null;

    this.speed = 1;
    this.userMovedCamera = false;
    this.hoverHex = null;

    campaign.bus.on('encounter', ({ band, biome }) => this.app.startBattle(band, biome));
    campaign.bus.on('company:arrived', () => this.hud.refresh());
  }

  // ------------------------------------------------------------ lifecycle
  enter() {
    this.app.setMode('campaign');
    this.hud.attach(this.campaign, this);
    this.hud.setSpeedButtons(this.speed);
    this.hud.refresh();
    this.centerOnCompany(1);
  }

  exit() { overlay.hideTip(); }

  setSpeed(v) {
    this.speed = SPEEDS.includes(v) ? v : 1;
    this.hud.setSpeedButtons(this.speed);
  }

  /** Open the roster screen, optionally focused on one brother. */
  openRoster(unitId = null) {
    const resume = this.speed;
    this.setSpeed(0);
    new CharacterPanel(this.campaign, {
      unit: unitId ? this.campaign.company.alive.find((u) => u.id === unitId) : null,
      onChange: () => this.hud.refresh(),
      onClose: () => { this.setSpeed(resume); this.hud.refresh(); },
    }).open();
  }

  action(id) {
    if (id === 'roster') { this.openRoster(); return; }
    if (id === 'town') {
      const site = this.campaign.settlementAt(this.campaign.party.hex);
      if (!site) return;
      // Time must not pass while the player is haggling.
      const resume = this.speed;
      this.setSpeed(0);
      this.campaign.party.stop();
      new SettlementPanel(this.campaign, site, {
        maxSize: this.app.maxCompanySize,
        onChange: () => this.hud.refresh(),
        onClose: () => { this.setSpeed(resume); this.hud.refresh(); },
      }).open();
      return;
    }
    if (id === 'rest') {
      // Skip a day in one go rather than making the player watch the clock.
      this.campaign.party.stop();
      for (let i = 0; i < HOURS_PER_DAY; i++) this.campaign.update(1);
      this.campaign.note('하루를 머물며 상처를 다스렸다.', 'rest');
      this.hud.refresh();
    }
  }

  // ------------------------------------------------------------ camera
  resize() {
    this.renderer.resize();
    // The canvas has no layout in the constructor, so keep re-framing until the
    // player takes the camera over themselves.
    if (this.renderer.w < 200 || this.renderer.h < 150) return;   // no real layout yet
    if (!this.userMovedCamera) this.fitWorld();
  }

  fitWorld() {
    const pts = this.campaign.world.all().map((t) => this.layout.toPixel(t.hex));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    this.camera.x = (Math.min(...xs) + Math.max(...xs)) / 2;
    this.camera.y = (Math.min(...ys) + Math.max(...ys)) / 2;
    const pad = this.layout.size * 2;
    const availW = Math.max(320, this.renderer.w - (258 + 288) * 0.75 - 32);
    const availH = Math.max(240, this.renderer.h - 24);
    const zoom = Math.min(availW / (Math.max(...xs) - Math.min(...xs) + pad),
      availH / (Math.max(...ys) - Math.min(...ys) + pad));
    // Start close enough to read the map, then let the player zoom out.
    this.camera.zoom = Math.max(this.camera.minZoom, Math.min(1.15, zoom * 1.35));
    this.centerOnCompany(1);
  }

  centerOnCompany(lerp = 0.2) {
    this.camera.centerOn(this.renderer.partyPos(this.campaign.party), lerp);
  }

  // ------------------------------------------------------------ input
  hexUnderMouse() {
    const m = this.app.mouse;
    if (!m) return null;
    const r = this.canvas.getBoundingClientRect();
    const w = this.camera.screenToWorld(m.x, m.y, r.width, r.height);
    return this.layout.toHex(w.x, w.y);
  }

  onMouseMove() {
    const m = this.app.mouse;
    const h = this.hexUnderMouse();
    this.hoverHex = h;
    this.renderer.view.hover = h;

    const tile = h && this.campaign.world.get(h);
    if (!tile) { this.renderer.view.route = null; this.hud.hideTip(); return; }

    this.renderer.view.route = this.campaign.previewRoute(h);
    this.hud.showTileTip(tile, m.cx, m.cy);
  }

  onMouseLeave() {
    this.renderer.view.hover = null;
    this.renderer.view.route = null;
    this.hud.hideTip();
  }

  onDrag() { this.userMovedCamera = true; }

  onWheel(e) {
    const r = this.canvas.getBoundingClientRect();
    this.camera.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY, r.width, r.height);
    this.userMovedCamera = true;
  }

  onSecondaryClick() { this.campaign.party.stop(); this.hud.refresh(); }

  onClick() {
    const h = this.hexUnderMouse();
    if (!h) return;
    if (!this.campaign.setDestination(h)) return;
    if (this.speed === 0) this.setSpeed(1);
    this.hud.refresh();
  }

  onKeyDown(e) {
    if (e.code === 'Space') { e.preventDefault(); this.setSpeed(this.speed === 0 ? 1 : 0); }
    else if (e.key === '1') this.setSpeed(1);
    else if (e.key === '2') this.setSpeed(3);
    else if (e.key === 'Tab') { e.preventDefault(); this.centerOnCompany(1); }
    else if (e.key.toLowerCase() === 'c') this.openRoster();
    else if (e.key === 'Escape') this.campaign.party.stop();
  }

  showHelp() { this.hud.showHelp(); }

  // ------------------------------------------------------------ loop
  update(dt) {
    this.panWithKeys(dt);
    this.renderer.update(dt);

    if (this.speed > 0 && !this.campaign.pendingEncounter) {
      this.campaign.update((dt / HOUR_SECONDS) * this.speed);
      // Keep the company in view while it marches, unless the player is looking elsewhere.
      if (this.campaign.party.moving && !this.app.keys.size) this.centerOnCompany(0.03);
      this.hudTick = (this.hudTick || 0) + dt;
      if (this.hudTick > 0.2) { this.hudTick = 0; this.hud.refresh(); }
    }
  }

  draw() { this.renderer.draw(); }

  panWithKeys(dt) {
    const sp = 620 * dt / this.camera.zoom;
    const k = this.app.keys;
    if (k.size) this.userMovedCamera = true;
    if (k.has('a') || k.has('arrowleft')) this.camera.x -= sp;
    if (k.has('d') || k.has('arrowright')) this.camera.x += sp;
    if (k.has('w') || k.has('arrowup')) this.camera.y -= sp;
    if (k.has('s') || k.has('arrowdown')) this.camera.y += sp;
  }
}
