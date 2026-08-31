/**
 * LPC spritesheet compositor.
 *
 * Every LPC sheet is a grid of square frames: 4 rows (up / left / down / right)
 * by N columns of animation frames. A character is a stack of such sheets drawn
 * in z-order - body, legs, boots, armour, head, helmet, shield, weapon.
 *
 * Compositing every layer every frame would be wasteful, so a unit's whole
 * equipment set is flattened into one offscreen sheet per animation and cached
 * by an equipment key. Re-equipping a brother simply produces a new key.
 *
 * Art: Universal-LPC-Spritesheet-Character-Generator (CC-BY-SA 3.0 / GPL-3.0).
 */

export const DIR = { up: 0, left: 1, down: 2, right: 3 };

/**
 * LPC sorts shield foreground layers (z=110) below headwear (z=125-135). That
 * reads fine for a buckler held at chest height, but a kite shield reaches the
 * shoulder and then the helmet punches through it. A shield raised in front of
 * the body occludes the head too, so lift it above headwear - still behind the
 * weapon hand (z=140) so a swing stays in front of the shield.
 */
const SHIELD_FG_Z = 137;

/** Which LPC animation a weapon attacks with. */
export function attackAnim(weapon) {
  if (!weapon) return 'slash';
  if (['bow', 'xbow', 'thrown'].includes(weapon.kind)) return 'shoot';
  if (weapon.kind === 'spear') return 'thrust';
  return 'slash';
}

export class SpriteBank {
  constructor(base, manifest, images) {
    this.base = base;
    this.manifest = manifest;
    this.images = images;      // relative path -> HTMLImageElement
    this.cache = new Map();    // equipment key -> { [anim]: canvas }
  }

  /**
   * Load the manifest and every sheet it references.
   * Returns null (rather than throwing) when the assets are absent, so the game
   * falls back to the procedural figures instead of failing to start.
   */
  static async load(base = 'assets/lpc') {
    let manifest;
    try {
      const res = await fetch(`${base}/manifest.json`);
      if (!res.ok) return null;
      manifest = await res.json();
    } catch { return null; }

    const paths = new Set();
    for (const item of Object.values(manifest.items)) {
      for (const layer of item.layers) for (const f of Object.values(layer.frames)) paths.add(f);
    }

    const images = new Map();
    await Promise.all([...paths].map((p) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { images.set(p, img); resolve(); };
      img.onerror = () => resolve();          // a missing sheet just goes undrawn
      img.src = `${base}/${p.split('/').map(encodeURIComponent).join('/')}`;
    })));

    if (!images.size) return null;
    return new SpriteBank(base, manifest, images);
  }

  has(id) { return !!this.manifest.items[id]; }

  // ------------------------------------------------------------ layer set
  /** Equipment ids that make up this unit's silhouette, bottom layer first. */
  itemsFor(unit) {
    const ids = ['body'];
    const heavy = (unit.body?.max || 0) >= 140;
    ids.push(heavy ? 'legsArmor' : 'legs', 'feet');
    if (unit.body?.id) ids.push(unit.body.id);
    ids.push('head');
    if (unit.head?.id) ids.push(unit.head.id);
    if (unit.shield?.id && unit.shield.durability > 0) ids.push(unit.shield.id);
    if (unit.weapon?.id) ids.push(unit.weapon.id);
    return ids.filter((id) => this.has(id));
  }

  key(unit) { return this.itemsFor(unit).join('|'); }

  /**
   * Resolve one layer to a sheet for `anim`.
   * A weapon's attack sheets are pose-locked - never borrow them for idle -
   * but the walk sheet doubles as the idle pose, which is how LPC ships it.
   */
  sheetFor(layer, anim) {
    const direct = layer.frames[anim];
    if (direct) return direct;
    if (anim === 'idle' && layer.frames.walk && !layer.frames.walk.includes('attack_')) {
      return layer.frames.walk;
    }
    return null;
  }

  /** Flatten a unit's layers into a single sheet for one animation. */
  compose(unit, anim) {
    const key = this.key(unit);
    let byAnim = this.cache.get(key);
    if (!byAnim) { byAnim = {}; this.cache.set(key, byAnim); }
    if (byAnim[anim] !== undefined) return byAnim[anim];

    const layers = [];
    let bodyFrame = 0;
    for (const id of this.itemsFor(unit)) {
      const isShield = id === unit.shield?.id;
      for (const layer of this.manifest.items[id].layers) {
        const path = this.sheetFor(layer, anim);
        const img = path && this.images.get(path);
        if (!img) continue;
        const f = Math.round(img.height / 4);
        if (id === 'body') bodyFrame = f;
        // Only the foreground half of a shield moves; its behind-the-body
        // layer (low z) must stay behind the body.
        const z = isShield && layer.z >= 100 ? SHIELD_FG_Z : layer.z;
        layers.push({ z, img, f, cols: Math.round(img.width / f) });
      }
    }
    if (!layers.length) { byAnim[anim] = null; return null; }
    layers.sort((a, b) => a.z - b.z);

    // Some sheets (bows mid-shot) use oversized frames with the character still
    // drawn at body scale, so normalise everything onto the body's frame and
    // centre the larger ones - otherwise the whole sprite renders double size.
    const frame = bodyFrame || layers[0].f;
    const cols = Math.max(...layers.map((l) => l.cols));
    const canvas = document.createElement('canvas');
    canvas.width = cols * frame;
    canvas.height = 4 * frame;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (const layer of layers) {
      const { img, f, cols: c } = layer;
      const off = (frame - f) / 2;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < cols; col++) {
          const src = Math.min(col, c - 1);   // short sheets hold their last frame
          if (f === frame) {
            ctx.drawImage(img, src * f, row * f, f, f, col * frame, row * frame, frame, frame);
          } else {
            ctx.save();
            ctx.beginPath();
            ctx.rect(col * frame, row * frame, frame, frame);
            ctx.clip();
            ctx.drawImage(img, src * f, row * f, f, f, col * frame + off, row * frame + off, f, f);
            ctx.restore();
          }
        }
      }
    }

    const sheet = { canvas, frame, cols };
    byAnim[anim] = sheet;
    return sheet;
  }

  /**
   * Draw one frame. `x, y` is the tile centre; the sprite is anchored so the
   * character's feet land there.
   */
  draw(ctx, unit, { anim = 'idle', dir = DIR.right, frame = 0, x, y, scale = 1 }) {
    const sheet = this.compose(unit, anim);
    if (!sheet) return false;
    const col = Math.min(frame, sheet.cols - 1);
    const size = sheet.frame * scale;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sheet.canvas,
      col * sheet.frame, dir * sheet.frame, sheet.frame, sheet.frame,
      x - size / 2, y - size * 0.86, size, size,
    );
    return true;
  }
}
