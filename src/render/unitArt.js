/**
 * Unit art.
 *
 * A fighter is drawn as one hand-drawn DCSS monster tile rather than composed
 * from equipment layers.
 *
 * The paper doll that used to live here showed what a man was carrying, which
 * sounds strictly better - until you look at it. DCSS's `player/` parts are cut
 * for DCSS's own compositor, which splits a shield into a piece behind the body
 * and a piece in front of the arm and knows, per item, which goes where. Drawn
 * as one flat layer the shield always ended up behind the hand, and no z-order
 * fixes that: the art for the front half is a different file.
 *
 * A whole figure drawn by one artist has no seams to get wrong. The cost is
 * that looted gear no longer shows on the man - equipment reads from the unit
 * card and the log instead. The sprite says what he *is*, not what he picked up.
 *
 * Each unit picks one sprite from its background's list by id, so a company of
 * militia is not six copies of the same man, and a given brother keeps the same
 * face for as long as he lives.
 */
export const UNIT_TILE = 32;

/** Drawn for anything with no list of its own. */
const FALLBACK = 'unit.militia';

export class UnitArt {
  constructor(base, manifest, images) {
    this.base = base;
    this.sets = manifest.units || {};
    this.images = images;      // 'unit.militia.0' -> HTMLImageElement
  }

  static async load(base = 'assets/dcss') {
    let manifest;
    try {
      const res = await fetch(`${base}/manifest.json`);
      if (!res.ok) return null;
      manifest = await res.json();
    } catch { return null; }
    if (!manifest.units || !Object.keys(manifest.units).length) return null;

    const images = new Map();
    const jobs = [];
    for (const [id, list] of Object.entries(manifest.units)) {
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
    return new UnitArt(base, manifest, images);
  }

  /**
   * The sprite this fighter wears. Keyed on the unit id rather than rolled, so
   * it survives a reload and never changes mid-campaign.
   */
  spriteFor(unit) {
    const id = `unit.${unit.template?.id}`;
    const set = this.sets[id] || this.sets[FALLBACK];
    if (!set || !set.length) return null;
    const key = this.sets[id] ? id : FALLBACK;
    return this.images.get(`${key}.${unit.id % set.length}`) || null;
  }

  /**
   * Draw a fighter. `x, y` is where the feet stand; `scale` is world pixels per
   * source pixel, shared with the ground so the pixel grids line up.
   *
   * Monster tiles are not all 32 square - a tall figure is a taller image - so
   * the sprite is measured rather than assumed, and stood on its bottom edge.
   */
  draw(ctx, unit, { x, y, scale = 2, flip = false } = {}) {
    const img = this.spriteFor(unit);
    if (!img) return false;
    const w = img.width * scale;
    const h = img.height * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
    return true;
  }
}
