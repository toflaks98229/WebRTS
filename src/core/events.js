/** Minimal pub/sub so the renderer and UI can react without the battle knowing about them. */
export class EventBus {
  constructor() { this.handlers = new Map(); }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) { this.handlers.get(type)?.delete(fn); }

  emit(type, payload) {
    this.handlers.get(type)?.forEach((fn) => fn(payload));
    this.handlers.get('*')?.forEach((fn) => fn({ type, payload }));
  }
}

export const bus = new EventBus();
