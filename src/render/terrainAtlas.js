/**
 * Ground texture from DCSS tiles.
 *
 * DCSS art is 32x32 squares meant for a square grid, so it cannot be dropped
 * onto a hexagon as-is. Two things make it work:
 *
 *  1. Several variants are stitched into one larger sheet (4x4 = 128px) and
 *     used as a repeating pattern. A 32px repeat reads as obvious wallpaper;
 *     a 128px repeat built from four different tiles does not.
 *  2. The pattern is filled through the hex path, so the *shape* comes from the
 *     hexagon while the texture stays anchored to world space. Neighbouring
 *     hexes of the same terrain therefore share one continuous field instead of
 *     each showing its own stamped square.
 *
 * Boundaries are the third piece. DCSS ships directional transition tiles, but
 * they are cut for a square grid's eight neighbours and do not map onto a hex's
 * six. So instead of borrowing those, each tile is composed once into its own
 * small canvas: the base texture, then every higher-priority neighbour feathered
 * in from the edge they share. The result is cached on the tile, so the cost is
 * paid at map generation and drawing becomes one drawImage per hex.
 *
 * Everything is optional: with no atlas the renderer falls back to flat colours.
 */
import { DIRS } from '../hex/hex.js';

const SHEET = 4;          // variants stitched per side
const TILE = 32;          // DCSS source tile size
/** How far a neighbour's ground creeps in, as a fraction of the hex radius. */
const BLEED = 0.62;

/**
 * One scratch canvas, reused while composing; never drawn directly.
 * Resizing a canvas resets its context, but reusing one at the same size does
 * not - so every piece of state this function relies on is set explicitly.
 * Leaving `globalCompositeOperation` on its previous value silently turns the
 * next mask into a no-op.
 */
let scratch = null;
function scratchCtx(w, h) {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
  const ctx = scratch.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export class TerrainAtlas {
  constructor(base, manifest, images) {
    this.base = base;
    this.terrain = manifest.terrain || {};
    this.images = images;      // 'terrain.grass.0' -> HTMLImageElement
    this.sheets = new Map();   // terrain id -> stitched canvas
    this.patterns = new Map(); // `${id}|${scale}` -> CanvasPattern
  }

  static async load(base = 'assets/dcss') {
    let manifest;
    try {
      const res = await fetch(`${base}/manifest.json`);
      if (!res.ok) return null;
      manifest = await res.json();
    } catch { return null; }
    if (!manifest.terrain || !Object.keys(manifest.terrain).length) return null;

    const images = new Map();
    const jobs = [];
    for (const [id, list] of Object.entries(manifest.terrain)) {
      list.forEach((_, i) => {
        const key = `${id}.${i}`;
        jobs.push(new Promise((resolve) => {
          const img = new Image();
          img.onload = () => { images.set(key, img); resolve(); };
          img.onerror = () => resolve();
          img.src = `${base}/${encodeURIComponent(key)}.png`;
        }));
      });
    }
    await Promise.all(jobs);
    if (!images.size) return null;
    return new TerrainAtlas(base, manifest, images);
  }

  has(id) { return !!this.terrain[`terrain.${id}`]; }

  variants(id) {
    const list = this.terrain[`terrain.${id}`] || [];
    return list.map((_, i) => this.images.get(`terrain.${id}.${i}`)).filter(Boolean);
  }

  /** Stitch the variants into one repeating sheet. Deterministic, built once. */
  sheet(id) {
    if (this.sheets.has(id)) return this.sheets.get(id);
    const imgs = this.variants(id);
    if (!imgs.length) { this.sheets.set(id, null); return null; }

    const canvas = document.createElement('canvas');
    canvas.width = SHEET * TILE;
    canvas.height = SHEET * TILE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // A cheap fixed hash keeps the layout stable between sessions.
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    for (let y = 0; y < SHEET; y++) {
      for (let x = 0; x < SHEET; x++) {
        h = (h * 1103515245 + 12345) >>> 0;
        ctx.drawImage(imgs[(h >>> 16) % imgs.length], x * TILE, y * TILE);
      }
    }
    this.sheets.set(id, canvas);
    return canvas;
  }

  /**
   * A world-space pattern for one terrain. `scale` is world pixels per source
   * pixel, so the texture zooms with the map rather than with the screen.
   */
  pattern(ctx, id, scale = 2) {
    const key = `${id}|${scale}`;
    if (this.patterns.has(key)) return this.patterns.get(key);

    const sheet = this.sheet(id);
    if (!sheet) { this.patterns.set(key, null); return null; }
    const pat = ctx.createPattern(sheet, 'repeat');
    if (pat && typeof DOMMatrix === 'function' && pat.setTransform) {
      pat.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
    }
    this.patterns.set(key, pat);
    return pat;
  }

  /**
   * Compose one hex: its own ground, plus each neighbour that outranks it
   * feathered in from their shared edge. Cached on the tile - terrain does not
   * change once a map is generated.
   *
   * @param layout   hex layout (for size and world position)
   * @param tile     grid tile; must carry `hex` and `terrain`
   * @param edges    six entries in hex-DIRS order: `null` or the neighbour's
   *                 terrain def. The matching hex edge is worked out from the
   *                 geometry rather than assumed.
   * @param scale    world pixels per source pixel
   * @returns {{canvas, ox, oy}} canvas and the world position of its top-left
   */
  tileCanvas(layout, tile, edges, def, scale = 2) {
    if (tile._tex && tile._texKey === this.keyFor(tile, edges, scale)) return tile._tex;

    const s = layout.size;
    const w = Math.ceil(s * 2) + 2;
    const h = Math.ceil(s * Math.sqrt(3)) + 2;
    const centre = layout.toPixel(tile.hex);
    const ox = centre.x - w / 2;
    const oy = centre.y - h / 2;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // Draw in world coordinates so every pattern keeps its world-space phase.
    ctx.translate(-ox, -oy);
    this.hexPath(ctx, layout, tile.hex);
    ctx.clip();

    const base = this.pattern(ctx, def.id, scale);
    if (!base) return null;
    ctx.fillStyle = base;
    ctx.fillRect(ox, oy, w, h);

    const order = this.edgeOrder(layout);
    for (let d = 0; d < 6; d++) {
      const other = edges[d];
      if (!other || other.id === def.id) continue;
      if ((other.blend ?? 0) <= (def.blend ?? 0)) continue;
      this.paintEdge(ctx, layout, tile, order[d], other, scale, { w, h, ox, oy });
    }

    tile._tex = { canvas, ox, oy };
    tile._texKey = this.keyFor(tile, edges, scale);
    return tile._tex;
  }

  keyFor(tile, edges, scale) {
    return `${tile.terrain}|${edges.map((e) => (e ? e.id : '-')).join(',')}|${scale}`;
  }

  /**
   * Which hex edge faces each of the six neighbour directions. Derived from the
   * layout once, so a change to the corner order or hex orientation cannot
   * silently put a shoreline on the wrong side.
   */
  edgeOrder(layout) {
    if (this._edgeOrder) return this._edgeOrder;
    const origin = { q: 0, r: 0 };
    const c = layout.toPixel(origin);
    const pts = layout.corners(origin);
    const mids = pts.map((p, i) => {
      const q = pts[(i + 1) % 6];
      return { x: (p.x + q.x) / 2 - c.x, y: (p.y + q.y) / 2 - c.y };
    });

    this._edgeOrder = DIRS.map((d) => {
      const n = layout.toPixel({ q: d.q, r: d.r });
      const vx = n.x - c.x;
      const vy = n.y - c.y;
      let best = 0;
      let bestDot = -Infinity;
      mids.forEach((m, i) => {
        const dot = (m.x * vx + m.y * vy) / Math.hypot(m.x, m.y);
        if (dot > bestDot) { bestDot = dot; best = i; }
      });
      return best;
    });
    return this._edgeOrder;
  }

  hexPath(ctx, layout, hex) {
    const pts = layout.corners(hex);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  }

  /** Feather one neighbour's ground in from the edge we share with it. */
  paintEdge(ctx, layout, tile, dir, other, scale, box) {
    const { w, h, ox, oy } = box;
    const pts = layout.corners(tile.hex);
    const centre = layout.toPixel(tile.hex);
    // Edge `dir` runs between corners dir and dir+1.
    const a = pts[dir];
    const b = pts[(dir + 1) % 6];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    const sctx = scratchCtx(w, h);
    sctx.translate(-ox, -oy);
    const pat = this.pattern(sctx, other.id, scale);
    if (!pat) return;
    sctx.fillStyle = pat;
    sctx.fillRect(ox, oy, w, h);

    // Keep only what is near the shared edge, fading toward the middle.
    const reach = layout.size * BLEED;
    const grad = sctx.createLinearGradient(
      mid.x, mid.y,
      mid.x + (centre.x - mid.x) / layout.size * reach,
      mid.y + (centre.y - mid.y) / layout.size * reach,
    );
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.globalCompositeOperation = 'destination-in';
    sctx.fillStyle = grad;
    sctx.fillRect(ox, oy, w, h);

    ctx.drawImage(scratch, ox, oy);
  }

  /** One decor sprite (trees), chosen from `r` in 0..1 so a tile keeps its own. */
  decor(kind, r) {
    const list = this.terrain[`decor.${kind}`] || [];
    if (!list.length) return null;
    const i = Math.min(list.length - 1, Math.floor(r * list.length));
    return this.images.get(`decor.${kind}.${i}`) || null;
  }
}
