import { overlay, esc, pct } from './overlay.js';
import { PERKS, perksByTier, xpProgress, MAX_LEVEL } from '../data/perks.js';
import { CAPTAIN_BRANCHES, nodeAvailable, RENOWN_PER_POINT } from '../data/captainTree.js';
import { wageOf } from '../campaign/company.js';

/**
 * Roster screen. One tab per concern: a brother's own perks, and the captain's
 * tree, which belongs to the company rather than to any one man.
 */
export class CharacterPanel {
  constructor(campaign, opts = {}) {
    this.campaign = campaign;
    this.onChange = opts.onChange || (() => {});
    this.onClose = opts.onClose || (() => {});
    this.tab = opts.tab || 'roster';
    this.selected = opts.unit || campaign.company.alive[0] || null;
    this.flash = null;
  }

  open() { this.render(); }

  render() {
    overlay.modal('용병단', this.body(), this.onClose, '닫기', 'wide');
    this.bind();
  }

  body() {
    const c = this.campaign.company;
    const tabs = [['roster', '단원'], ['captain', '단장 특성']]
      .map(([id, name]) => `<button class="seg-btn ${this.tab === id ? 'active' : ''}" data-tab="${id}">${name}</button>`)
      .join('');

    return `
      <div class="sp-bar">
        <div class="seg">${tabs}</div>
        <div class="sp-purse">
          <span>명성</span><b>${c.renown}</b>
          <span class="sp-sep"></span>
          <span>단장 점수</span><b>${this.campaign.captainPoints}</b>
        </div>
      </div>
      ${this.flash ? `<div class="sp-flash">${this.flash}</div>` : ''}
      ${this.tab === 'roster' ? this.roster() : this.captain()}`;
  }

  // ------------------------------------------------------------- roster
  roster() {
    const c = this.campaign.company;
    if (!c.alive.length) return '<div class="sp-empty">단원이 없다.</div>';

    const list = c.alive.map((u) => {
      const p = xpProgress(u);
      return `<button class="cp-pick ${u === this.selected ? 'active' : ''}" data-pick="${u.id}">
        <span class="cp-lv">${u.level}</span>
        <span class="cp-who">
          <span class="cp-nm">${esc(u.name)}${u.isCaptain ? ' <span class="cp-cap">단장</span>' : ''}</span>
          <span class="cp-bg">${esc(u.title)}</span>
        </span>
        ${u.perkPoints ? `<span class="cp-pts">+${u.perkPoints}</span>` : ''}
        <span class="cp-xp"><i style="width:${p ? pct(p.have, p.need) : 100}%"></i></span>
      </button>`;
    }).join('');

    return `<div class="cp-split">
      <div class="cp-list">${list}</div>
      <div class="cp-detail">${this.selected ? this.detail(this.selected) : '<div class="sp-empty">단원을 고르세요.</div>'}</div>
    </div>`;
  }

  detail(u) {
    const p = xpProgress(u);
    const stat = (label, value) => `<div class="stat"><span>${label}</span><b>${value}</b></div>`;

    return `
      <div class="cp-head">
        <div>
          <div class="cp-title">${esc(u.name)}${u.isCaptain ? ' <span class="cp-cap">단장</span>' : ''}</div>
          <div class="cp-sub">${esc(u.title)} · ${u.level} 레벨 · 처치 ${u.kills} · 일당 ${wageOf(u)}</div>
        </div>
        <div class="cp-points ${u.perkPoints ? 'on' : ''}">특성 점수 <b>${u.perkPoints}</b></div>
      </div>

      <div class="meter">
        <div class="meter-top">
          <span>경험치</span>
          <b>${p ? `${p.have} / ${p.need}` : `최고 레벨 (${MAX_LEVEL})`}</b>
        </div>
        <div class="meter-bar"><div class="meter-fill f-xp" style="width:${p ? pct(p.have, p.need) : 100}%"></div></div>
      </div>

      <div class="stat-grid">
        ${stat('체력', `${Math.round(u.hp)} / ${u.hpMax}`)}
        ${stat('최대 피로도', u.fatigueMax)}
        ${stat('근접 숙련', u.meleeSkill)}
        ${stat('근접 방어', u.meleeDefense)}
        ${stat('원거리 숙련', u.rangedSkill)}
        ${stat('원거리 방어', u.rangedDefense)}
        ${stat('결의', u.resolve)}
        ${stat('주도권', u.initiative)}
      </div>

      <h3 class="sp-h">특성</h3>
      ${this.perkGrid(u)}`;
  }

  /** Six rows of four; a row opens at the level that matches its tier. */
  perkGrid(u) {
    return perksByTier().map((row, i) => {
      const tier = i + 1;
      const open = u.level >= tier;
      const cells = row.map((pk) => {
        const taken = u.hasPerk(pk.id);
        const canTake = !taken && open && u.perkPoints > 0;
        const cls = ['perk', taken ? 'taken' : '', open ? '' : 'locked', canTake ? 'can' : ''].join(' ');
        return `<button class="${cls}" data-perk="${pk.id}" ${canTake ? '' : 'disabled'}
                  title="${esc(pk.name)} — ${esc(pk.desc)}">
          <span class="pi">${pk.icon}</span><span class="pn">${esc(pk.name)}</span>
        </button>`;
      }).join('');
      return `<div class="perk-row ${open ? '' : 'locked'}">
        <span class="perk-tier">${tier}</span>${cells}
      </div>`;
    }).join('');
  }

  // ------------------------------------------------------------- captain
  captain() {
    const c = this.campaign.company;
    const taken = c.captainPerks;
    const points = this.campaign.captainPoints;
    const toNext = RENOWN_PER_POINT - (c.renown % RENOWN_PER_POINT);
    const cap = c.captain;

    const cols = Object.values(CAPTAIN_BRANCHES).map((b) => {
      const nodes = b.nodes.map((n) => {
        const has = taken.has(n.id);
        const can = !has && points > 0 && nodeAvailable(n.id, taken);
        const needs = n.requires.length
          ? `<span class="cn-req">선행: ${n.requires.map((r) => esc(nodeName(r))).join(', ')}</span>` : '';
        const cls = ['cnode', has ? 'taken' : '', can ? 'can' : '', (!has && !can) ? 'locked' : ''].join(' ');
        return `<button class="${cls}" data-node="${n.id}" ${can ? '' : 'disabled'}>
          <span class="cn-top"><span class="cn-ic">${n.icon}</span><span class="cn-nm">${esc(n.name)}</span></span>
          <span class="cn-desc">${esc(n.desc)}</span>${needs}
        </button>`;
      }).join('');
      return `<div class="cbranch">
        <div class="cb-head">${b.icon} ${b.name}</div>
        <div class="cb-blurb">${esc(b.blurb)}</div>
        ${nodes}
      </div>`;
    }).join('');

    return `
      <div class="cp-capbar">
        현재 단장: <b>${cap ? esc(cap.name) : '없음'}</b>
        · 다음 점수까지 명성 <b>${toNext}</b>
        <span class="cp-note">단장이 쓰러져도 이 특성은 용병단에 남는다.</span>
      </div>
      <div class="ctree">${cols}</div>`;
  }

  // ------------------------------------------------------------- events
  bind() {
    const root = document.querySelector('#modal-body');
    root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      this.tab = b.dataset.tab; this.flash = null; this.render();
    }));
    root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
      this.selected = this.campaign.company.alive.find((u) => u.id === Number(b.dataset.pick)) || null;
      this.flash = null;
      this.render();
    }));
    root.querySelectorAll('[data-perk]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.perk;
      if (this.selected?.takePerk(id)) this.flash = `${esc(this.selected.name)} — ${esc(PERKS[id].name)} 습득`;
      this.after();
    }));
    root.querySelectorAll('[data-node]').forEach((b) => b.addEventListener('click', () => {
      if (this.campaign.takeCaptainNode(b.dataset.node)) this.flash = '단장 특성을 익혔다.';
      this.after();
    }));
  }

  after() { this.onChange(); this.render(); }
}

function nodeName(id) {
  for (const b of Object.values(CAPTAIN_BRANCHES)) {
    const n = b.nodes.find((x) => x.id === id);
    if (n) return n.name;
  }
  return id;
}
