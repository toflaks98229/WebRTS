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
 * Where a held item sits when DCSS lists no offset for that tile and slot.
 * Zero is DCSS's own "no shift necessary" case: the paper doll's hand.
 */
const NO_OFFSET = [0, 0];

export class UnitArt {
  constructor(base, manifest, images) {
    this.base = base;
    this.sets = manifest.units || {};
    this.held = manifest.gear || {};
    /** tile name -> {weapon, shield} pixel offsets, straight from DCSS. */
    this.hands = manifest.hands || {};
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
    const i = unit.id % set.length;
    const img = this.images.get(`${key}.${i}`) || null;
    return img && { img, tile: set[i].split('/').pop().replace(/\.png$/, '') };
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
   * weapon keeps a clear silhouette. Held items are shifted onto this figure's
   * hands by DCSS's own per-tile offsets; without them the axe hangs where the
   * paper doll's arm would have been, which is what made some fighters look
   * like they were holding their weapon a hand's width off to one side.
   *
   * Every layer stands on the same ground line - monster tiles are not all 32
   * square, so each image is measured rather than assumed.
   */
  draw(ctx, unit, { x, y, scale = 2, flip = false } = {}) {
    const body = this.spriteFor(unit);
    if (!body) return false;
    const { weapon, shield } = this.gearFor(unit);
    const hands = this.hands[body.tile] || {};

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    const layers = [
      [weapon, hands.weapon || NO_OFFSET],
      [body.img, NO_OFFSET],
      [shield, hands.shield || NO_OFFSET],
    ];
    for (const [img, [dx, dy]] of layers) {
      if (!img) continue;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, -w / 2 + dx * scale, -h + dy * scale, w, h);
    }
    ctx.restore();
    return true;
  }
}
