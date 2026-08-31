/** Pan/zoom camera over the battlefield, in world pixels. */
export class Camera {
  constructor() {
    this.x = 0; this.y = 0; this.zoom = 1;
    this.minZoom = 0.5; this.maxZoom = 2.2;
  }

  apply(ctx, w, h) {
    ctx.setTransform(this.zoom, 0, 0, this.zoom, w / 2 - this.x * this.zoom, h / 2 - this.y * this.zoom);
  }

  screenToWorld(sx, sy, w, h) {
    return { x: (sx - w / 2) / this.zoom + this.x, y: (sy - h / 2) / this.zoom + this.y };
  }

  worldToScreen(wx, wy, w, h) {
    return { x: (wx - this.x) * this.zoom + w / 2, y: (wy - this.y) * this.zoom + h / 2 };
  }

  pan(dx, dy) { this.x -= dx / this.zoom; this.y -= dy / this.zoom; }

  zoomAt(sx, sy, delta, w, h) {
    const before = this.screenToWorld(sx, sy, w, h);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * (delta > 0 ? 0.9 : 1.1)));
    const after = this.screenToWorld(sx, sy, w, h);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  centerOn(p, lerp = 1) {
    this.x += (p.x - this.x) * lerp;
    this.y += (p.y - this.y) * lerp;
  }
}
