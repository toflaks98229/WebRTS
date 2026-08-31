import { neighbors, key } from '../hex/hex.js';
import { worldTerrain, SETTLEMENTS } from '../data/worldTerrain.js';

const FACTION = {
  player: { main: '#d8b45a', dark: '#6b5324' },
  enemy: { main: '#b0503f', dark: '#5e2820' },
};

/** Canvas renderer for the overworld. */
export class WorldRenderer {
  constructor(canvas, campaign, layout, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.campaign = campaign;
    this.layout = layout;
    this.camera = camera;
    this.time = 0;

    this.view = { hover: null, route: null, showGrid: true };
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width || this.canvas.parentElement?.clientWidth || window.innerWidth || 960;
    this.h = rect.height || this.canvas.parentElement?.clientHeight || window.innerHeight || 540;
    this.dpr = dpr;
    this.canvas.width = Math.floor(this.w * dpr);
    this.canvas.height = Math.floor(this.h * dpr);
  }

  update(dt) { this.time += dt; }

  /** World position of a party, interpolated between tiles while travelling. */
  partyPos(p) {
    const a = this.layout.toPixel(p.hex);
    if (!p.path.length || !p.sub) return a;
    const b = this.layout.toPixel(p.path[0]);
    return { x: a.x + (b.x - a.x) * p.sub, y: a.y + (b.y - a.y) * p.sub };
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0c1017';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    const z = this.camera.zoom * this.dpr;
    ctx.setTransform(
      z, 0, 0, z,
      (this.w / 2 - this.camera.x * this.camera.zoom) * this.dpr,
      (this.h / 2 - this.camera.y * this.camera.zoom) * this.dpr,
    );

    this.drawTiles(ctx);
    this.drawRoads(ctx);
    this.drawSites(ctx);
    this.drawRoute(ctx);
    this.drawParties(ctx);
    this.drawHover(ctx);

    ctx.restore();
    this.drawNightTint(ctx);
  }

  hexPath(ctx, h, inset = 0) {
    const pts = this.layout.corners(h);
    const c = this.layout.toPixel(h);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = p.x + (c.x - p.x) * inset;
      const y = p.y + (c.y - p.y) * inset;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
  }

  drawTiles(ctx) {
    const s = this.layout.size;
    for (const t of this.campaign.world.all()) {
      const def = worldTerrain(t.terrain);
      const c = this.layout.toPixel(t.hex);

      this.hexPath(ctx, t.hex);
      ctx.fillStyle = t.decor > 0.5 ? def.color2 : def.color;
      ctx.fill();
      if (this.view.showGrid && def.passable) {
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      this.drawTileDecor(ctx, t, c, s);
    }
  }

  drawTileDecor(ctx, t, c, s) {
    const r = t.decor;
    switch (t.terrain) {
      case 'forest':
        ctx.fillStyle = '#20321b';
        for (let i = 0; i < 3; i++) {
          const a = r * 6.28 + i * 2.1;
          const x = c.x + Math.cos(a) * s * 0.32;
          const y = c.y + Math.sin(a) * s * 0.26;
          ctx.beginPath();
          ctx.moveTo(x, y - s * 0.3);
          ctx.lineTo(x - s * 0.14, y + s * 0.1);
          ctx.lineTo(x + s * 0.14, y + s * 0.1);
          ctx.closePath();
          ctx.fill();
        }
        break;
      case 'hills':
        ctx.strokeStyle = 'rgba(255,238,190,0.22)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(c.x, c.y + s * 0.14, s * 0.34, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
        break;
      case 'mountain':
      case 'peak': {
        const tall = t.terrain === 'peak' ? 0.62 : 0.46;
        ctx.fillStyle = t.terrain === 'peak' ? '#b9b7b1' : '#7d7a73';
        ctx.beginPath();
        ctx.moveTo(c.x, c.y - s * tall);
        ctx.lineTo(c.x - s * 0.42, c.y + s * 0.3);
        ctx.lineTo(c.x + s * 0.42, c.y + s * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = t.terrain === 'peak' ? '#e6e6e2' : '#9d9a92';
        ctx.beginPath();
        ctx.moveTo(c.x, c.y - s * tall);
        ctx.lineTo(c.x - s * 0.16, c.y - s * 0.06);
        ctx.lineTo(c.x + s * 0.10, c.y - s * 0.02);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'swamp':
        ctx.fillStyle = 'rgba(130,160,120,0.22)';
        for (let i = 0; i < 3; i++) {
          const a = r * 6.28 + i * 2.4;
          ctx.beginPath();
          ctx.ellipse(c.x + Math.cos(a) * s * 0.26, c.y + Math.sin(a) * s * 0.22, s * 0.14, s * 0.07, 0, 0, 6.3);
          ctx.fill();
        }
        break;
      case 'farmland':
        ctx.strokeStyle = 'rgba(40,34,20,0.30)';
        ctx.lineWidth = 1.4;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(c.x - s * 0.4, c.y + i * s * 0.22);
          ctx.lineTo(c.x + s * 0.4, c.y + i * s * 0.22);
          ctx.stroke();
        }
        break;
      case 'ocean':
      case 'shallows':
        ctx.strokeStyle = 'rgba(170,205,230,0.16)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(c.x - s * 0.32, c.y + (r - 0.5) * s * 0.3);
        ctx.quadraticCurveTo(c.x, c.y + (r - 0.5) * s * 0.3 + s * 0.12, c.x + s * 0.32, c.y + (r - 0.5) * s * 0.3);
        ctx.stroke();
        break;
      default:
        break;
    }
  }

  drawRoads(ctx) {
    const world = this.campaign.world;
    ctx.strokeStyle = '#8a7b58';
    ctx.lineWidth = Math.max(2, this.layout.size * 0.13);
    ctx.lineCap = 'round';
    const seen = new Set();
    for (const t of world.all()) {
      if (!t.road) continue;
      const a = this.layout.toPixel(t.hex);
      for (const nb of neighbors(t.hex)) {
        const n = world.get(nb);
        if (!n?.road) continue;
        const pair = [key(t.hex), key(nb)].sort().join('>');
        if (seen.has(pair)) continue;
        seen.add(pair);
        const b = this.layout.toPixel(nb);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  drawSites(ctx) {
    const s = this.layout.size;
    for (const camp of this.campaign.world.camps) {
      const live = this.campaign.bands.some((b) => b.alive && b.camp === camp);
      const c = this.layout.toPixel(camp.hex);
      ctx.globalAlpha = live ? 1 : 0.35;
      ctx.fillStyle = '#4a2f26';
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - s * 0.3);
      ctx.lineTo(c.x - s * 0.3, c.y + s * 0.22);
      ctx.lineTo(c.x + s * 0.3, c.y + s * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#9c6a52';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const st of this.campaign.world.settlements) {
      const tier = SETTLEMENTS[st.tier];
      const c = this.layout.toPixel(st.hex);
      const w = s * (0.30 + tier.size * 0.10);

      ctx.fillStyle = '#2b241c';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + s * 0.28, w * 1.25, w * 0.42, 0, 0, 6.3);
      ctx.fill();

      // A cluster of roofs; bigger settlements get more of them.
      for (let i = 0; i < tier.size + 1; i++) {
        const ox = (i - tier.size / 2) * w * 0.62;
        const hh = w * (0.75 + (i % 2) * 0.22);
        ctx.fillStyle = '#6a5741';
        ctx.fillRect(c.x + ox - w * 0.24, c.y + s * 0.22 - hh * 0.55, w * 0.48, hh * 0.55);
        ctx.fillStyle = tier.color;
        ctx.beginPath();
        ctx.moveTo(c.x + ox - w * 0.32, c.y + s * 0.22 - hh * 0.55);
        ctx.lineTo(c.x + ox, c.y + s * 0.22 - hh);
        ctx.lineTo(c.x + ox + w * 0.32, c.y + s * 0.22 - hh * 0.55);
        ctx.closePath();
        ctx.fill();
      }

      // Labels must stay legible when the map is zoomed out, so cancel the zoom.
      ctx.font = `600 ${Math.round(Math.max(s * 0.42, 12 / this.camera.zoom))}px 'Noto Serif KR', serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(st.name, c.x, c.y + s * 0.9);
      ctx.fillStyle = '#efe2c0';
      ctx.fillText(st.name, c.x, c.y + s * 0.9);
    }
  }

  drawRoute(ctx) {
    const route = this.view.route;
    if (!route?.path?.length) return;
    const s = this.layout.size;
    ctx.strokeStyle = 'rgba(240,225,180,0.9)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    const start = this.partyPos(this.campaign.party);
    ctx.moveTo(start.x, start.y);
    for (const h of route.path) {
      const p = this.layout.toPixel(h);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const end = this.layout.toPixel(route.path[route.path.length - 1]);
    ctx.fillStyle = 'rgba(240,225,180,0.95)';
    ctx.beginPath();
    ctx.arc(end.x, end.y, s * 0.16, 0, 6.3);
    ctx.fill();
  }

  drawParties(ctx) {
    for (const b of this.campaign.bands) if (b.alive) this.drawParty(ctx, b, FACTION.enemy);
    this.drawParty(ctx, this.campaign.party, FACTION.player, true);
  }

  drawParty(ctx, p, col, isCompany = false) {
    const s = this.layout.size;
    const pos = this.partyPos(p);
    const bob = Math.sin(this.time * 2.2 + p.hex.q) * s * 0.03;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + s * 0.26, s * 0.30, s * 0.13, 0, 0, 6.3);
    ctx.fill();

    // Banner on a pole - reads at a glance even when the map is zoomed out.
    const top = pos.y - s * 0.66 + bob;
    ctx.strokeStyle = '#3a2f24';
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y + s * 0.22);
    ctx.lineTo(pos.x, top);
    ctx.stroke();

    ctx.fillStyle = col.main;
    ctx.beginPath();
    ctx.moveTo(pos.x, top);
    ctx.lineTo(pos.x + s * 0.44, top + s * 0.10);
    ctx.lineTo(pos.x + s * 0.44, top + s * 0.40);
    ctx.lineTo(pos.x, top + s * 0.30);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = col.dark;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (isCompany) {
      const pulse = 0.45 + Math.sin(this.time * 3) * 0.2;
      ctx.strokeStyle = `rgba(255,225,150,${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + s * 0.26, s * 0.36, s * 0.17, 0, 0, 6.3);
      ctx.stroke();
    } else {
      ctx.font = `600 ${Math.round(s * 0.34)}px 'Noto Serif KR', serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e6c4b6';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(String(p.roster.length), pos.x, pos.y + s * 0.62);
      ctx.fillText(String(p.roster.length), pos.x, pos.y + s * 0.62);
    }
  }

  drawHover(ctx) {
    const h = this.view.hover;
    if (!h || !this.campaign.world.has(h)) return;
    this.hexPath(ctx, h, 0.04);
    ctx.strokeStyle = 'rgba(255,245,215,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /** A cool wash over the map between dusk and dawn. */
  drawNightTint(ctx) {
    const hour = this.campaign.hourOfDay;
    let k = 0;
    if (hour < 5) k = 1;
    else if (hour < 7) k = (7 - hour) / 2;
    else if (hour > 21) k = Math.min(1, (hour - 21) / 2);
    else if (hour > 19) k = (hour - 19) / 4;
    if (k <= 0) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = `rgba(20,32,64,${0.32 * k})`;
    ctx.fillRect(0, 0, this.w, this.h);
  }
}
