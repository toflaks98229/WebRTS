/**
 * Screen furniture shared by both scenes: the hover tooltip, the big centred
 * banner and the modal. Kept in one place so the battle and campaign HUDs do
 * not each grow their own copy.
 */
const $ = (sel) => document.querySelector(sel);

let bannerTimer = null;
let modalOk = null;

function els() {
  return {
    tip: $('#hover-tip'),
    banner: $('#banner'),
    modal: $('#modal'),
    title: $('#modal-title'),
    body: $('#modal-body'),
    ok: $('#modal-ok'),
  };
}

export const overlay = {
  init() {
    const e = els();
    e.ok.addEventListener('click', () => {
      e.modal.classList.add('hidden');
      const fn = modalOk;
      modalOk = null;
      fn?.();
    });
  },

  /** Position a tooltip near (x, y) in viewport coords, clamped to the stage. */
  tip(html, x, y, above = false) {
    const t = els().tip;
    t.innerHTML = html;
    t.classList.remove('hidden');
    const stage = $('#stage').getBoundingClientRect();
    const r = t.getBoundingClientRect();
    let px = x - stage.left + 16;
    let py = above ? y - stage.top - r.height - 4 : y - stage.top + 16;
    px = Math.min(px, stage.width - r.width - 8);
    py = Math.max(4, Math.min(py, stage.height - r.height - 8));
    t.style.left = `${px}px`;
    t.style.top = `${py}px`;
  },

  hideTip() { els().tip.classList.add('hidden'); },

  banner(text, ms = 1400) {
    const b = els().banner;
    b.textContent = text;
    b.classList.remove('hidden');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.add('hidden'), ms);
  },

  /** `onOk` fires after the modal closes - used to gate scene transitions. */
  modal(title, bodyHTML, onOk = null, okLabel = '확인') {
    const e = els();
    e.title.textContent = title;
    e.body.innerHTML = bodyHTML;
    e.ok.textContent = okLabel;
    modalOk = onOk;
    e.modal.classList.remove('hidden');
  },

  closeModal() { els().modal.classList.add('hidden'); modalOk = null; },
};

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function pct(v, max) { return Math.max(0, Math.min(100, (v / max) * 100)); }
