/**
 * DCSS tile icons for the interface.
 *
 * Every call takes an emoji fallback, so the UI is fully usable before the
 * manifest loads and stays usable if `assets/dcss/` was never fetched.
 *
 * Art: Dungeon Crawl Stone Soup (CC0). See CREDITS.md.
 */
const BASE = 'assets/dcss';

export const icons = {
  map: null,

  async load(base = BASE) {
    try {
      const res = await fetch(`${base}/manifest.json`);
      if (!res.ok) return false;
      const manifest = await res.json();
      this.base = base;
      this.map = manifest.icons || {};
      return true;
    } catch {
      return false;
    }
  },

  has(id) { return !!(this.map && this.map[id]); },

  /** Inline markup for one icon; `fallback` is drawn when the tile is absent. */
  html(id, fallback = '', cls = '') {
    if (this.has(id)) {
      return `<img class="ic ${cls}" src="${this.base}/${encodeURIComponent(id)}.png" alt="" draggable="false">`;
    }
    return fallback ? `<span class="ic ic-emoji ${cls}">${fallback}</span>` : '';
  },
};

export function perkIcon(perk, cls = '') { return icons.html(`perk.${perk.id}`, perk.icon, cls); }
export function captainIcon(node, cls = '') { return icons.html(`captain.${node.id}`, node.icon, cls); }
export function skillIcon(skill, cls = '') { return icons.html(skill.tile || '', skill.icon, cls); }
export function itemIcon(itemId, fallback = '', cls = '') { return icons.html(`item.${itemId}`, fallback, cls); }
