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
 * Everything is optional: with no atlas the renderer falls back to flat colours.
 */
const SHEET = 4;          // variants stitched per side
const TILE = 32;          // DCSS source tile size

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

  /** One decor sprite (trees), chosen from `r` in 0..1 so a tile keeps its own. */
  decor(kind, r) {
    const list = this.terrain[`decor.${kind}`] || [];
    if (!list.length) return null;
    const i = Math.min(list.length - 1, Math.floor(r * list.length));
    return this.images.get(`decor.${kind}.${i}`) || null;
  }
}
