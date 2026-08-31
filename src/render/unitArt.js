/**
 * Unit art.
 *
 * A fighter is drawn as one hand-drawn DCSS monster tile rather than composed
 * from equipment layers.
 *
 * The paper doll that used to live here stacked six equipment layers and got the
 * shield wrong every time: DCSS cuts a shield into a piece behind the body and a
 * piece in front of the arm, and we only ever drew the behind piece, so the
 * shield sat behind the hand no matter what z-order we gave it.
 *
 * So the body is one whole figure now, and only the two things worth reading at
 * a glance are laid over it - **the weapon behind, the shield in front**. That
 * order is the one the art can actually support: a shield drawn wholly in front
 * of the torso can never be swallowed by a hand, and a weapon behind reads as
 * held in the far hand with its silhouette clear of the body. Armour is not
 * layered at all; it reads from the unit card.
 *
 * Each unit picks one sprite from its background's list by id, so a company of
 * militia is not six copies of the same man, and a given brother keeps the same
 * face for as long as he lives.
 */
export const UNIT_TILE = 32;

/** Drawn for anything with no list of its own. */
const FALLBACK = 'unit.militia';

/**
 * Source pixels the weapon is pushed out to the trailing side.
 *
 * Held items are cut to sit against the narrow shoulders of DCSS's paper doll.
 * A monster tile can be a good deal broader than that, and a weapon drawn
 * behind a broad figure - a bare-chested brawler with a hand axe - disappears
 * behind him entirely. A nudge outward keeps the blade in the silhouette
 * without moving it off the hand.
 */
const WEAPON_NUDGE = 3;

export class UnitArt {
  constructor(base, manifest, images) {
    this.base = base;
    this.sets = manifest.units || {};
    this.held = manifest.gear || {};
    this.images = images;      // 'unit.militia.0' / 'gear.weapon.mace' -> Image
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
    const load = (key) => jobs.push(new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { images.set(key, img); resolve(); };
      img.onerror = () => resolve();
      img.src = `${base}/${encodeURIComponent(key)}.png`;
    }));
    for (const [id, list] of Object.entries(manifest.units)) list.forEach((_, i) => load(`${id}.${i}`));
    for (const id of Object.keys(manifest.gear || {})) load(id);

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

  /** The held item art for one slot, or null when there is nothing to show. */
  gearFor(unit) {
    if (unit.isBeast) return { weapon: null, shield: null };   // claws are the sprite
    const pick = (id) => (id && this.images.get(id)) || null;
    return {
      weapon: pick(unit.weapon?.id && `gear.weapon.${unit.weapon.id}`),
      // A splintered shield is gone from the arm as well as from the maths.
      shield: pick(unit.shield?.id && unit.shield.durability > 0
        && `gear.shield.${unit.shield.id}`),
    };
  }

  /**
   * Draw a fighter. `x, y` is where the feet stand; `scale` is world pixels per
   * source pixel, shared with the ground so the pixel grids line up.
   *
   * Weapon, body, shield - in that order, so the shield always reads and the
   * weapon always has a clear silhouette. Every layer stands on the same ground
   * line: monster tiles are not all 32 square, so each image is measured rather
   * than assumed, while the 32px held items keep their own footing.
   */
  draw(ctx, unit, { x, y, scale = 2, flip = false } = {}) {
    const body = this.spriteFor(unit);
    if (!body) return false;
    const { weapon, shield } = this.gearFor(unit);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    for (const [img, dx] of [[weapon, -WEAPON_NUDGE], [body, 0], [shield, 0]]) {
      if (!img) continue;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, -w / 2 + dx * scale, -h, w, h);
    }
    ctx.restore();
    return true;
  }
}
