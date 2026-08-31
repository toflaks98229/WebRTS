import { esc } from './overlay.js';
import { perksByTier, MAX_TIER } from '../data/perks.js';
import { perkIcon } from './icons.js';

/**
 * Shared rendering for perk nodes, used by the roster screen and the lab's
 * brush dialog so both stay in step.
 *
 * Nodes are hexagons to echo the battlefield, drawn as two clipped layers - an
 * outer frame and an inset face - because a clip-path eats a normal border.
 *
 * States: `taken` (owned), `can` (affordable now), `idle` (unlocked but no
 * points), `locked` (tier not reached). Callers may append extra classes to the
 * state string - `'taken pop'` plays the unlock flourish.
 */
export function perkNodeHTML(perk, state) {
  const classes = state.split(' ');
  return `<button class="perk ${state}" data-perk="${perk.id}" ${classes.includes('can') ? '' : 'disabled'}>
    <span class="hex">
      <span class="hexb"></span><span class="hexf"></span>
      <span class="pi">${perkIcon(perk)}</span>
    </span>
    <span class="pn">${esc(perk.name)}</span>
  </button>`;
}

/**
 * The whole 6 x 4 grid with its tier rail.
 * `stateOf(perk, tier)` returns the state string for each node.
 */
export function perkGridHTML(stateOf, { level = MAX_TIER, showRail = true } = {}) {
  const rows = perksByTier().map((row, i) => {
    const tier = i + 1;
    const open = level >= tier;
    const rail = showRail
      ? `<span class="tier-rail ${open ? 'on' : ''}">
           <span class="tier-dot">${tier}</span>
           ${tier < MAX_TIER ? '<span class="tier-line"></span>' : ''}
         </span>`
      : `<span class="tier-rail on"><span class="tier-dot">${tier}</span>
         ${tier < MAX_TIER ? '<span class="tier-line"></span>' : ''}</span>`;

    return `<div class="perk-row ${open ? '' : 'shut'}">
      ${rail}
      <div class="perk-cells">${row.map((p) => perkNodeHTML(p, stateOf(p, tier))).join('')}</div>
      ${open ? '' : `<span class="tier-lock">${tier} 레벨</span>`}
    </div>`;
  }).join('');

  return `<div class="perk-tree">${rows}</div>`;
}

/** Tooltip body for a perk, shared by every surface that shows one. */
export function perkTipHTML(perk, note = '') {
  return `<h4>${perkIcon(perk, 'ic-tip')} ${esc(perk.name)}</h4>
    <div class="row"><span>티어</span><b>${perk.tier}</b></div>
    <hr><div class="note">${esc(perk.desc)}</div>
    ${note ? `<div class="tip-note">${note}</div>` : ''}`;
}
