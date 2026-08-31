import { terrain } from '../data/terrain.js';
import { DIRS, add } from '../hex/hex.js';
import { MORALE } from '../battle/unit.js';
import { UnitArt } from './unitArt.js';

const FACTION = {
  player: { main: '#4d7ea8', dark: '#2c4a63', light: '#8fb8d8', banner: '#c8a24a' },
  enemy:  { main: '#a3493a', dark: '#5f2a22', light: '#d18b76', banner: '#7a3a30' },
};

const MOVE_STEP_TIME = 0.16;   // seconds per hex when a unit walks
/** World pixels per source pixel of a DCSS tile. */
/**
 * World pixels per source pixel - shared by the ground, the trees and the
 * fighters. Every piece of art is 32px DCSS work, so one ratio keeps every
 * pixel the same size on screen; scaling one layer and not another is what
 * makes a tiled scene look wrong.
 */
export const PIXEL = 2;
/** Screen height of one height-map level, as a fraction of the hex size. */
export const ELEV_RATIO = 0.45;
const ATTACK_TIME = 0.45;      // seconds an attack animation plays

/** Canvas renderer for the tactical layer. Owns unit visual interpolation. */
export class Renderer {
  constructor(canvas, battle, layout, camera, effects) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.battle = battle;
    this.layout = layout;
    this.camera = camera;
    this.effects = effects;
    this.visuals = new Map();
    this.time = 0;
    /** DCSS unit sprites, set once loaded; null = procedural figures. */
    this.art = null;
    /** DCSS ground textures; null = flat colours. */
    this.atlas = null;

    /** Mutated by the controller each frame to drive overlays. */
    this.view = {
      reachable: new Map(),
      path: [],
      hover: null,
      selected: null,
      previewChance: null,
      targets: [],
      showGrid: true,
    };

    battle.bus.on('unit:move', ({ unit, path }) => this.queueWalk(unit, path));
    battle.bus.on('attack:hit', (r) => this.playAttack(r.attacker, r.target));
    battle.bus.on('attack:miss', (r) => this.playAttack(r.attacker, r.target));
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    // A hidden/unlaid-out canvas reports 0; fall back so the camera fit stays sane.
    this.w = rect.width || this.canvas.parentElement?.clientWidth || window.innerWidth || 960;
    this.h = rect.height || this.canvas.parentElement?.clientHeight || window.innerHeight || 540;
    this.dpr = dpr;
    this.canvas.width = Math.floor(this.w * dpr);
    this.canvas.height = Math.floor(this.h * dpr);
  }

  // ------------------------------------------------------------- elevation
  /** Screen offset for a tile's height-map level (negative = raised). */
  elevY(hex) { return -this.battle.grid.elevation(hex) * this.layout.size * ELEV_RATIO; }

  /** Tile centre in world space, lifted to the top of its height column. */
  pixelOfHex(hex) {
    if (!hex) return { x: 0, y: 0 };
    const p = this.layout.toPixel(hex);
    return { x: p.x, y: p.y + this.elevY(hex) };
  }

  // ------------------------------------------------------------- visuals
  visual(unit) {
    let v = this.visuals.get(unit.id);
    if (!v) {
      const p = this.pixelOfHex(unit.hex);
      v = {
        x: p.x, y: p.y, queue: [], t: 0, from: null, to: null,
        bob: Math.random() * 6, flash: 0,
        face: unit.faction === 'player' ? 1 : -1,
        march: unit.faction === 'player' ? 1 : -1,
        attackUntil: 0, lean: 0, leanX: 0, leanY: 0, walking: false,
      };
      this.visuals.set(unit.id, v);
    }
    return v;
  }

  queueWalk(unit, path) {
    const v = this.visual(unit);
    for (const h of path) v.queue.push(this.pixelOfHex(h));
    // Two of the six hex directions are straight up and straight down, and a
    // step along one of those says nothing about which way a fighter is facing.
    // The march as a whole does, so it is remembered and used for those steps.
    const end = v.queue[v.queue.length - 1];
    if (end && Math.abs(end.x - v.x) > 0.5) v.march = end.x > v.x ? 1 : -1;
  }

  /**
   * A doll has no swing frames, so an attack is a lean into the blow: the
   * fighter drives toward the target and settles back.
   */
  playAttack(attacker, target) {
    const v = this.visual(attacker);
    v.attackUntil = this.time + ATTACK_TIME;
    const tp = this.pixelOfHex(target.hex);
    const dx = tp.x - v.x;
    const dy = tp.y - v.y;
    const len = Math.hypot(dx, dy) || 1;
    v.leanX = dx / len;
    v.leanY = dy / len;
    // Straight up or down: swinging at someone directly above tells us nothing
    // about left and right, so the fighter keeps the way they were already
    // turned rather than snapping to an arbitrary side.
    if (Math.abs(dx) > 0.5) {
      v.face = dx > 0 ? 1 : -1;
      v.march = v.face;
      const tv = this.visual(target);
      tv.face = dx > 0 ? -1 : 1;      // the defender turns on their assailant
      tv.march = tv.face;
    }
  }

  /** True while any unit is still sliding between hexes. */
  get animating() {
    for (const v of this.visuals.values()) if (v.queue.length || v.to) return true;
    return this.effects.busy;
  }

  update(dt) {
    this.time += dt;
    for (const [id, v] of this.visuals) {
      if (!v.to && v.queue.length) {
        v.from = { x: v.x, y: v.y };
        v.to = v.queue.shift();
        v.t = 0;
        const dx = v.to.x - v.from.x;
        v.face = Math.abs(dx) > 0.5 ? (dx > 0 ? 1 : -1) : (v.march ?? v.face);
      }
      if (v.to) {
        v.t += dt / MOVE_STEP_TIME;
        const k = Math.min(1, v.t);
        v.x = v.from.x + (v.to.x - v.from.x) * k;
        v.y = v.from.y + (v.to.y - v.from.y) * k;
        if (k >= 1) { v.to = null; v.from = null; }
      } else {
        // Snap to the model position if something moved a unit without an animation.
        const u = this.battle.units.find((x) => x.id === id);
        if (u && u.hex) {
          const p = this.pixelOfHex(u.hex);
          v.x += (p.x - v.x) * Math.min(1, dt * 12);
          v.y += (p.y - v.y) * Math.min(1, dt * 12);
        }
      }
      if (v.flash > 0) v.flash = Math.max(0, v.flash - dt * 3);
      this.advanceAnim(v, dt);
    }
    this.effects.update(dt);
  }

  /** Static art, so motion lives here: a lunge on the swing, a step on the march. */
  advanceAnim(v, dt) {
    void dt;
    v.walking = !!(v.to || v.queue.length);
    const left = v.attackUntil - this.time;
    v.lean = left > 0 ? Math.sin((1 - left / ATTACK_TIME) * Math.PI) : 0;
  }

  // ------------------------------------------------------------- drawing
  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#11100e';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    ctx.imageSmoothingEnabled = false;   // pixel art, at every zoom
    const z = this.camera.zoom * this.dpr;
    ctx.setTransform(
      z, 0, 0, z,
      (this.w / 2 - this.camera.x * this.camera.zoom) * this.dpr,
      (this.h / 2 - this.camera.y * this.camera.zoom) * this.dpr,
    );

    this.drawTerrain(ctx);
    this.drawOverlays(ctx);
    this.drawUnits(ctx);
    this.effects.draw(ctx);

    ctx.restore();
  }


  /**
   * World-space rectangle the camera can currently see, grown by `pad` so hexes
   * straddling the edge still draw. Composing a tile is not free, so anything
   * off screen is skipped entirely rather than built and thrown away.
   */
  viewBounds(pad = 0) {
    const hw = this.w / 2 / this.camera.zoom + pad;
    const hh = this.h / 2 / this.camera.zoom + pad;
    return {
      x0: this.camera.x - hw, x1: this.camera.x + hw,
      y0: this.camera.y - hh, y1: this.camera.y + hh,
    };
  }

  hexPath(ctx, h, inset = 0) {
    const dy = this.elevY(h);
    const pts = this.layout.corners(h);
    const c = this.layout.toPixel(h);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = p.x + (c.x - p.x) * inset;
      const y = p.y + (c.y - p.y) * inset + dy;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
  }

  drawTerrain(ctx) {
    const s = this.layout.size;
    // Painter's order: far tiles first, so raised columns occlude what is behind.
    if (!this._sorted || this._sortedFor !== this.battle) {
      this._sorted = this.battle.grid.all().slice().sort((a, b) => {
        const pa = this.layout.toPixel(a.hex);
        const pb = this.layout.toPixel(b.hex);
        return pa.y - pb.y || pa.x - pb.x;
      });
      this._sortedFor = this.battle;
    }

    const view = this.viewBounds(s * 2.5);
    for (const tile of this._sorted) {
      const c = this.layout.toPixel(tile.hex);
      if (c.x < view.x0 || c.x > view.x1 || c.y < view.y0 || c.y > view.y1) continue;
      const def = terrain(tile.terrain);
      const dy = this.elevY(tile.hex);

      if (tile.elev > 0) this.drawSkirt(ctx, tile, def, dy);

      // One pre-composed image per hex: its ground plus whatever the
      // neighbours bleed over the edges.
      const tex = this.atlas && this.atlas.tileCanvas(
        this.layout, tile, this.edgesOf(tile), def, PIXEL);
      if (tex) {
        ctx.drawImage(tex.canvas, tex.ox, tex.oy + dy);
        // A wash of the terrain colour keeps the palette coherent with the UI.
        this.hexPath(ctx, tile.hex);
        ctx.fillStyle = withAlpha(def.color, 0.24);
        ctx.fill();
      } else {
        this.hexPath(ctx, tile.hex);
        ctx.fillStyle = tile.decor > 0.5 ? def.color2 : def.color;
        ctx.fill();
      }

      // Higher ground catches more light, so it reads at a glance.
      if (tile.elev > 0) {
        ctx.fillStyle = `rgba(255,242,205,${0.055 * tile.elev})`;
        ctx.fill();
      }
      if (this.view.showGrid) {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      this.drawDecor(ctx, tile, { x: c.x, y: c.y + dy }, s);
    }
  }

  /** The extruded side of a raised tile - what turns a height map into a cliff. */
  drawSkirt(ctx, tile, def, dy) {
    const pts = this.layout.corners(tile.hex);
    const depth = -dy;
    // Corners 0..3 are the right, lower-right, lower-left and left vertices:
    // the silhouette facing the viewer.
    const front = [0, 1, 2, 3].map((i) => pts[i]);

    ctx.beginPath();
    front.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y + dy) : ctx.lineTo(p.x, p.y + dy)));
    for (let i = front.length - 1; i >= 0; i--) ctx.lineTo(front[i].x, front[i].y + dy + depth);
    ctx.closePath();

    // Cliffs are bare stone whatever grows on top of them.
    const rock = this.atlas?.pattern(ctx, 'cliff', PIXEL)
      || this.atlas?.pattern(ctx, 'rock', PIXEL);
    if (rock) { ctx.fillStyle = rock; ctx.fill(); }

    const grad = ctx.createLinearGradient(0, pts[1].y + dy, 0, pts[1].y + dy + depth);
    grad.addColorStop(0, rock ? 'rgba(20,16,12,0.35)' : shadeHex(def.color, -0.35));
    grad.addColorStop(1, rock ? 'rgba(12,10,8,0.78)' : shadeHex(def.color, -0.68));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** Neighbouring terrain in hex-direction order, for edge blending. */
  edgesOf(tile) {
    return DIRS.map((d) => {
      const n = this.battle.grid.get(add(tile.hex, d));
      return n ? terrain(n.terrain) : null;
    });
  }

  drawDecor(ctx, tile, c, s) {
    const r = tile.decor;
    if (this.atlas) {
      // With textured ground only real objects are still worth drawing.
      if (tile.terrain === 'forest') this.drawTrees(ctx, tile, c, s);
      return;
    }
    switch (tile.terrain) {
      case 'forest': {
        for (let i = 0; i < 3; i++) {
          const a = (r * 6.28) + i * 2.1;
          const x = c.x + Math.cos(a) * s * 0.35;
          const y = c.y + Math.sin(a) * s * 0.3;
          const hgt = s * (0.42 + ((r * 7 + i) % 1) * 0.18);
          ctx.fillStyle = '#1e2f1a';
          ctx.beginPath();
          ctx.moveTo(x, y - hgt);
          ctx.lineTo(x - s * 0.17, y + s * 0.1);
          ctx.lineTo(x + s * 0.17, y + s * 0.1);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#2b4425';
          ctx.beginPath();
          ctx.moveTo(x, y - hgt * 0.85);
          ctx.lineTo(x - s * 0.12, y + s * 0.02);
          ctx.lineTo(x + s * 0.12, y + s * 0.02);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'rock': {
        ctx.fillStyle = '#3a3a3e';
        ctx.beginPath();
        ctx.moveTo(c.x - s * 0.5, c.y + s * 0.3);
        ctx.lineTo(c.x - s * 0.22, c.y - s * 0.45);
        ctx.lineTo(c.x + s * 0.15, c.y - s * 0.2);
        ctx.lineTo(c.x + s * 0.5, c.y + s * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#5c5c62';
        ctx.beginPath();
        ctx.moveTo(c.x - s * 0.22, c.y - s * 0.45);
        ctx.lineTo(c.x + s * 0.15, c.y - s * 0.2);
        ctx.lineTo(c.x - s * 0.05, c.y + s * 0.05);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'hill': {
        ctx.strokeStyle = 'rgba(255,235,190,0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y + s * 0.15, s * 0.42, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        break;
      }
      case 'swamp': {
        ctx.fillStyle = 'rgba(120,150,110,0.25)';
        for (let i = 0; i < 3; i++) {
          const a = r * 6.28 + i * 2.4;
          ctx.beginPath();
          ctx.ellipse(c.x + Math.cos(a) * s * 0.3, c.y + Math.sin(a) * s * 0.25, s * 0.16, s * 0.09, 0, 0, 6.3);
          ctx.fill();
        }
        break;
      }
      case 'water': {
        ctx.strokeStyle = 'rgba(180,215,235,0.28)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 2; i++) {
          const y = c.y - s * 0.15 + i * s * 0.35;
          ctx.beginPath();
          ctx.moveTo(c.x - s * 0.4, y);
          ctx.quadraticCurveTo(c.x, y + s * 0.12 * (i ? -1 : 1), c.x + s * 0.4, y);
          ctx.stroke();
        }
        break;
      }
      default: break;
    }
  }

  /**
   * One tree per forest hex. At the shared pixel ratio a DCSS tree is already
   * most of a hex wide - it stands for the whole thicket, not a single trunk -
   * so scattering several would just pile them into the neighbours.
   */
  drawTrees(ctx, tile, c, s) {
    const img = this.atlas.decor('tree', tile.decor);
    if (!img) return;
    const w = img.width * PIXEL;                       // never rescaled
    const jitter = (tile.decor - 0.5) * s * 0.18;      // a little sway off centre
    ctx.drawImage(img, c.x - w / 2 + jitter, c.y + s * 0.3 - w, w, w);
  }

  drawOverlays(ctx) {
    const v = this.view;

    // Reachable tiles.
    if (v.reachable?.size) {
      for (const node of v.reachable.values()) {
        this.hexPath(ctx, node.hex, 0.06);
        ctx.fillStyle = 'rgba(120,180,235,0.16)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(150,205,255,0.30)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Attackable enemies.
    for (const t of v.targets) {
      this.hexPath(ctx, t.hex, 0.04);
      ctx.strokeStyle = 'rgba(220,90,70,0.85)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Movement path preview.
    if (v.path?.length) {
      ctx.strokeStyle = 'rgba(235,225,190,0.85)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      const start = this.pixelOfHex(v.selected.hex);
      ctx.moveTo(start.x, start.y);
      for (const h of v.path) {
        const p = this.pixelOfHex(h);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const last = this.pixelOfHex(v.path[v.path.length - 1]);
      ctx.fillStyle = 'rgba(235,225,190,0.9)';
      ctx.beginPath();
      ctx.arc(last.x, last.y, 5, 0, 6.3);
      ctx.fill();
    }

    // Hover highlight.
    if (v.hover && this.battle.grid.has(v.hover)) {
      this.hexPath(ctx, v.hover, 0.02);
      ctx.strokeStyle = 'rgba(255,245,215,0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  drawUnits(ctx) {
    const s = this.layout.size;
    const units = this.battle.units
      .filter((u) => u.alive && !u.withdrawn && u.hex)
      .slice()
      .sort((a, b) => this.visual(a).y - this.visual(b).y);

    for (const u of units) {
      const v = this.visual(u);
      const isCurrent = this.battle.current === u;
      this.drawUnit(ctx, u, v, s, isCurrent);
    }
  }

  drawUnit(ctx, u, v, s, isCurrent) {
    const col = FACTION[u.faction];
    const x = v.x;
    const y = v.y;
    // A monster tile is one static frame, so its life comes from here: a march
    // step while moving, a slow breath when still.
    const bob = v.walking
      ? -Math.abs(Math.sin(this.time * 13)) * s * 0.07
      : Math.sin(this.time * 2 + v.bob) * (isCurrent ? 1.5 : 0.6);

    ctx.save();
    ctx.translate(x, y + bob);

    // Shadow + base ring
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.3, s * 0.4, s * 0.16, 0, 0, 6.3);
    ctx.fill();

    if (isCurrent) {
      const pulse = 0.5 + Math.sin(this.time * 4) * 0.25;
      ctx.strokeStyle = `rgba(255,225,150,${0.5 + pulse * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, s * 0.3, s * 0.44, s * 0.19, 0, 0, 6.3);
      ctx.stroke();
    }
    // The sprites themselves are faction-neutral, so the base ring carries the side.
    ctx.fillStyle = col.main + '44';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.3, s * 0.36, s * 0.14, 0, 0, 6.3);
    ctx.fill();
    ctx.strokeStyle = col.main;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const bodyTone = u.body ? Math.min(1, u.body.max / 220) : 0;
    const armorCol = u.isBeast ? '#6a5a44' : shade('#5a5148', '#9aa3ab', bodyTone);

    let drewSprite = false;
    if (this.art) {
      const reach = v.lean * s * 0.34;
      drewSprite = this.art.draw(ctx, u, {
        x: v.leanX * reach,
        y: s * 0.3 + v.leanY * reach * 0.5,
        scale: PIXEL,
        flip: v.face < 0,
      });
    }
    if (!drewSprite) {
      ctx.save();
      ctx.translate(0, s * 0.3);        // plant the feet on the base ellipse
      if (u.isBeast) this.drawBeast(ctx, s, col, armorCol);
      else this.drawHumanoid(ctx, u, s, col, armorCol);
      ctx.restore();
    }

    // Damage flash
    if (v.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(200,40,30,${v.flash * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.2, s * 0.4, s * 0.55, 0, 0, 6.3);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();

    this.drawUnitBars(ctx, u, x, y + bob, s, drewSprite);
  }

  drawHumanoid(ctx, u, s, col, armorCol) {
    const H = s * 1.15;

    // Legs
    ctx.fillStyle = '#39322b';
    ctx.fillRect(-s * 0.16, -H * 0.28, s * 0.12, H * 0.3);
    ctx.fillRect(s * 0.04, -H * 0.28, s * 0.12, H * 0.3);

    // Torso
    ctx.fillStyle = armorCol;
    ctx.beginPath();
    ctx.moveTo(-s * 0.26, -H * 0.26);
    ctx.lineTo(-s * 0.3, -H * 0.62);
    ctx.quadraticCurveTo(0, -H * 0.74, s * 0.3, -H * 0.62);
    ctx.lineTo(s * 0.26, -H * 0.26);
    ctx.closePath();
    ctx.fill();

    // Tabard in the faction colour
    ctx.fillStyle = col.main;
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -H * 0.66);
    ctx.lineTo(s * 0.1, -H * 0.66);
    ctx.lineTo(s * 0.08, -H * 0.27);
    ctx.lineTo(-s * 0.08, -H * 0.27);
    ctx.closePath();
    ctx.fill();

    // Head + helmet
    const hy = -H * 0.82;
    ctx.fillStyle = '#c9a887';
    ctx.beginPath();
    ctx.arc(0, hy, s * 0.15, 0, 6.3);
    ctx.fill();
    if (u.head) {
      const helm = shade('#6b6055', '#b9c1c8', Math.min(1, u.head.max / 140));
      ctx.fillStyle = u.head.armor > 0 ? helm : '#4a423a';
      ctx.beginPath();
      ctx.arc(0, hy, s * 0.17, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineTo(s * 0.16, hy + s * 0.04);
      ctx.lineTo(-s * 0.16, hy + s * 0.04);
      ctx.closePath();
      ctx.fill();
    }

    // Shield (left) and weapon (right)
    if (u.shield && u.shield.durability > 0) {
      ctx.fillStyle = col.dark;
      ctx.strokeStyle = '#2a241e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.42, -H * 0.62);
      ctx.lineTo(-s * 0.16, -H * 0.6);
      ctx.lineTo(-s * 0.18, -H * 0.28);
      ctx.quadraticCurveTo(-s * 0.3, -H * 0.16, -s * 0.44, -H * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    this.drawWeapon(ctx, u, s, H);

    // Stance markers
    if (u.stances.size) {
      ctx.fillStyle = 'rgba(255,220,140,0.9)';
      ctx.font = `${Math.round(s * 0.3)}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('⛨', s * 0.42, -H * 0.72);
    }
  }

  drawWeapon(ctx, u, s, H) {
    const w = u.weapon;
    if (!w) return;
    ctx.save();
    ctx.translate(s * 0.3, -H * 0.5);
    ctx.strokeStyle = '#3a3128';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    switch (w.kind) {
      case 'bow':
        ctx.strokeStyle = '#7a5c34';
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.34, -1.3, 1.3);
        ctx.stroke();
        ctx.strokeStyle = '#d8cba8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s * 0.09, -s * 0.33);
        ctx.lineTo(s * 0.09, s * 0.33);
        ctx.stroke();
        break;
      case 'xbow':
        ctx.strokeStyle = '#6a5335';
        ctx.beginPath();
        ctx.moveTo(-s * 0.1, 0);
        ctx.lineTo(s * 0.28, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s * 0.16, -s * 0.24);
        ctx.lineTo(s * 0.16, s * 0.24);
        ctx.stroke();
        break;
      case 'spear':
      case 'thrown':
        ctx.beginPath();
        ctx.moveTo(0, s * 0.42);
        ctx.lineTo(s * 0.06, -s * 0.62);
        ctx.stroke();
        ctx.fillStyle = '#c3c8cc';
        ctx.beginPath();
        ctx.moveTo(s * 0.06, -s * 0.78);
        ctx.lineTo(s * 0.15, -s * 0.55);
        ctx.lineTo(-s * 0.02, -s * 0.55);
        ctx.closePath();
        ctx.fill();
        break;
      case 'axe':
        ctx.beginPath();
        ctx.moveTo(0, s * 0.3);
        ctx.lineTo(s * 0.05, -s * 0.4);
        ctx.stroke();
        ctx.fillStyle = '#b9c1c8';
        ctx.beginPath();
        ctx.moveTo(s * 0.05, -s * 0.42);
        ctx.quadraticCurveTo(s * 0.34, -s * 0.34, s * 0.2, -s * 0.06);
        ctx.lineTo(s * 0.05, -s * 0.14);
        ctx.closePath();
        ctx.fill();
        break;
      case 'mace':
        ctx.beginPath();
        ctx.moveTo(0, s * 0.3);
        ctx.lineTo(s * 0.05, -s * 0.34);
        ctx.stroke();
        ctx.fillStyle = '#9aa3ab';
        ctx.beginPath();
        ctx.arc(s * 0.06, -s * 0.44, s * 0.13, 0, 6.3);
        ctx.fill();
        break;
      default: {   // swords and daggers
        const len = w.kind === 'dagger' ? 0.4 : 0.72;
        ctx.strokeStyle = '#c3c8cc';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(0, s * 0.16);
        ctx.lineTo(s * 0.06, -s * len);
        ctx.stroke();
        ctx.strokeStyle = '#6b5a3a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-s * 0.09, s * 0.12);
        ctx.lineTo(s * 0.11, s * 0.12);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  drawBeast(ctx, s, col, tone) {
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.3, s * 0.38, s * 0.22, 0, 0, 6.3);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.32, -s * 0.46, s * 0.16, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#2a231c';
    ctx.beginPath();
    ctx.moveTo(s * 0.26, -s * 0.58);
    ctx.lineTo(s * 0.3, -s * 0.74);
    ctx.lineTo(s * 0.36, -s * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = col.main;
    ctx.beginPath();
    ctx.arc(s * 0.38, -s * 0.48, s * 0.035, 0, 6.3);
    ctx.fill();
    ctx.strokeStyle = tone;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-s * 0.34, -s * 0.34);
    ctx.quadraticCurveTo(-s * 0.55, -s * 0.5, -s * 0.5, -s * 0.62);
    ctx.stroke();
  }

  drawUnitBars(ctx, u, x, y, s, tall = false) {
    const w = s * 0.86;
    const top = y - s * (tall ? 1.32 : 0.98);

    // HP
    bar(ctx, x - w / 2, top, w, 5, u.hp / u.hpMax, '#1a120f', u.faction === 'player' ? '#6fae57' : '#b5533f');

    // Armour: body on the left half, head on the right.
    if (u.body || u.head) {
      const half = w / 2 - 1;
      if (u.body) bar(ctx, x - w / 2, top + 6, half, 3, u.body.armor / u.body.max, '#151313', '#9aa3ab');
      if (u.head) bar(ctx, x + 1, top + 6, half, 3, u.head.armor / u.head.max, '#151313', '#c3ccd4');
    }

    // Morale pip
    const m = MORALE[u.morale];
    if (u.morale !== 'steady') {
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(x - w / 2 - 5, top + 3, 3.2, 0, 6.3);
      ctx.fill();
    }
  }

  // Called by the controller when a unit takes a hit.
  flash(unit) { this.visual(unit).flash = 1; }

  pixelOf(unit) { const v = this.visual(unit); return { x: v.x, y: v.y }; }
}

function bar(ctx, x, y, w, h, pct, bg, fg) {
  ctx.fillStyle = bg;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = fg;
  ctx.fillRect(x, y, Math.max(0, w * Math.max(0, Math.min(1, pct))), h);
}

/** Darken (t<0) or lighten (t>0) a #rrggbb colour. */
/** #rrggbb -> rgba() at the given alpha. */
function withAlpha(hex, a) {
  const [r, g, b] = hex2rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function shadeHex(hex, t) {
  const [r, g, b] = hex2rgb(hex).map((v) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t));
  return `rgb(${r},${g},${b})`;
}

function shade(from, to, t) {
  const a = hex2rgb(from), b = hex2rgb(to);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function hex2rgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
