import { round } from './hex.js';

const SQRT3 = Math.sqrt(3);

/**
 * Flat-top hex layout. `size` is the distance from center to a corner,
 * so a tile is 2*size wide and sqrt(3)*size tall.
 */
export class Layout {
  constructor(size = 40) { this.size = size; }

  toPixel(h) {
    return {
      x: this.size * 1.5 * h.q,
      y: this.size * SQRT3 * (h.r + h.q / 2),
    };
  }

  toHex(x, y) {
    const q = (2 / 3) * x / this.size;
    const r = (-1 / 3) * x / this.size + (SQRT3 / 3) * y / this.size;
    return round(q, r);
  }

  /** Six corner points of a hex, in world space. */
  corners(h) {
    const c = this.toPixel(h);
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i);
      pts.push({ x: c.x + this.size * Math.cos(a), y: c.y + this.size * Math.sin(a) });
    }
    return pts;
  }

  get width() { return this.size * 2; }
  get height() { return this.size * SQRT3; }
}
