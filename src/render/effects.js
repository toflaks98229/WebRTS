/** Short-lived visual flourishes: floating numbers, projectiles, hit flashes. */
export class Effects {
  constructor() { this.items = []; }

  floatText(x, y, text, color = '#e8e0cc', size = 16) {
    this.items.push({ kind: 'text', x, y, vy: -34, text, color, size, life: 0, max: 1.1 });
  }

  projectile(from, to, color = '#d9c89a') {
    this.items.push({ kind: 'shot', from, to, color, life: 0, max: 0.28 });
  }

  slash(x, y, angle, color = '#f0e6d0') {
    this.items.push({ kind: 'slash', x, y, angle, color, life: 0, max: 0.25 });
  }

  ring(x, y, color = '#c2453a', radius = 42) {
    this.items.push({ kind: 'ring', x, y, color, radius, life: 0, max: 0.5 });
  }

  get busy() { return this.items.some((i) => i.kind !== 'text'); }

  update(dt) {
    for (const i of this.items) i.life += dt;
    this.items = this.items.filter((i) => i.life < i.max);
  }

  draw(ctx) {
    for (const i of this.items) {
      const t = i.life / i.max;
      ctx.save();
      switch (i.kind) {
        case 'text': {
          ctx.globalAlpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
          ctx.font = `700 ${i.size}px ui-serif, Georgia, serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          const y = i.y + i.vy * t;
          ctx.strokeText(i.text, i.x, y);
          ctx.fillStyle = i.color;
          ctx.fillText(i.text, i.x, y);
          break;
        }
        case 'shot': {
          const x = i.from.x + (i.to.x - i.from.x) * t;
          const y = i.from.y + (i.to.y - i.from.y) * t;
          const px = i.from.x + (i.to.x - i.from.x) * Math.max(0, t - 0.12);
          const py = i.from.y + (i.to.y - i.from.y) * Math.max(0, t - 0.12);
          ctx.strokeStyle = i.color;
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(x, y);
          ctx.stroke();
          break;
        }
        case 'slash': {
          ctx.globalAlpha = 1 - t;
          ctx.translate(i.x, i.y);
          ctx.rotate(i.angle);
          ctx.strokeStyle = i.color;
          ctx.lineWidth = 4 * (1 - t) + 1;
          ctx.beginPath();
          ctx.arc(0, 0, 26 + t * 10, -0.9, 0.9);
          ctx.stroke();
          break;
        }
        case 'ring': {
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = i.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(i.x, i.y, i.radius * (0.4 + t * 0.8), 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        default: break;
      }
      ctx.restore();
    }
  }
}
