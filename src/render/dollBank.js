/**
 * DCSS paper dolls.
 *
 * A fighter is a stack of 32x32 layers - body, legs, armour, shield, weapon,
 * helmet - composed once per equipment set and cached, so looting a mail shirt
 * changes what the man on the field is wearing.
 *
 * DCSS dolls are single static frames facing the viewer, unlike a spritesheet
 * with walk and swing cycles. Movement and attacks are therefore expressed by
 * the renderer moving the sprite (a lean into the blow, a bob on the march)
 * rather than by cycling frames, and facing is a horizontal flip.
 *
 * Everything here is 32px art at the same scale as the ground tiles, so one
 * source pixel is the same size everywhere on screen.
 */
export const DOLL_TILE = 32;

/** Bottom to top. The weapon hand sits in front, the helmet above all of it. */
const LAYERS = ['shield', 'base', 'legs', 'body', 'weapon', 'head'];

export class DollBank {
  constructor(base, manifest, images) {
    this.base = base;
    this.parts = manifest.doll || {};
    this.images = images;
    this.cache = new Map();     // equipment key -> canvas
  }

  static async load(base = 'assets/dcss') {
    let manifest;
    try {
      const res = await fetch(`${base}/manifest.json`);
      if (!res.ok) return null;
      manifest = await res.json();
    } catch { return null; }
    if (!manifest.doll || !Object.keys(manifest.doll).length) return null;

    const images = new Map();
    await Promise.all(Object.keys(manifest.doll).map((id) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { images.set(id, img); resolve(); };
      img.onerror = () => resolve();
      img.src = `${base}/${encodeURIComponent(id)}.png`;
    })));
    if (!images.size) return null;
    return new DollBank(base, manifest, images);
  }

  img(id) { return this.images.get(id) || null; }

  /** Which part id fills each layer for this unit. */
  partsFor(unit) {
    if (unit.isBeast) return { base: `doll.beast.${unit.template.id}` };
    const heavy = (unit.body?.max || 0) >= 140;
    return {
      base: `doll.base.${unit.id % 3}`,          // three faces, stable per unit
      legs: heavy ? 'doll.legsArmor' : 'doll.legs',
      body: unit.body?.id ? `doll.body.${unit.body.id}` : null,
      head: unit.head?.id ? `doll.head.${unit.head.id}` : null,
      weapon: unit.weapon?.id ? `doll.weapon.${unit.weapon.id}` : null,
      shield: unit.shield?.id && unit.shield.durability > 0
        ? `doll.shield.${unit.shield.id}` : null,
    };
  }

  key(unit) {
    const p = this.partsFor(unit);
    return LAYERS.map((l) => p[l] || '-').join('|');
  }

  /** Flatten a unit's layers into one 32x32 canvas, cached by equipment. */
  compose(unit) {
    const key = this.key(unit);
    if (this.cache.has(key)) return this.cache.get(key);

    const parts = this.partsFor(unit);
    const used = LAYERS.map((l) => parts[l] && this.img(parts[l])).filter(Boolean);
    if (!used.length) { this.cache.set(key, null); return null; }

    const canvas = document.createElement('canvas');
    canvas.width = DOLL_TILE;
    canvas.height = DOLL_TILE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    for (const img of used) ctx.drawImage(img, 0, 0, DOLL_TILE, DOLL_TILE);

    this.cache.set(key, canvas);
    return canvas;
  }

  /**
   * Draw a unit. `x, y` is where its feet stand; `scale` is world pixels per
   * source pixel, shared with the ground so the pixel grids line up.
   */
  draw(ctx, unit, { x, y, scale = 2, flip = false, lean = 0 } = {}) {
    const doll = this.compose(unit);
    if (!doll) return false;
    const size = DOLL_TILE * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x + lean, y);
    if (flip) ctx.scale(-1, 1);
    // DCSS dolls stand on the bottom edge of their tile.
    ctx.drawImage(doll, -size / 2, -size, size, size);
    ctx.restore();
    return true;
  }
}
