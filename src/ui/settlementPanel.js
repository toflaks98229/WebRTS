import { overlay, esc } from './overlay.js';
import { SETTLEMENTS } from '../data/worldTerrain.js';
import { CONTRACT_TYPES, daysLeft } from '../campaign/contracts.js';
import { hireCostOf, wageOf, itemDef, itemValue, slotOf, SELL_RATE } from '../campaign/company.js';

const TABS = [
  { id: 'contracts', name: '계약' },
  { id: 'hire', name: '고용' },
  { id: 'shop', name: '상점' },
  { id: 'stash', name: '창고' },
];

const SLOT_NAME = { weapon: '무기', shield: '방패', body: '갑옷', head: '투구' };

/**
 * The settlement screen: contract board, recruits, shop and the company stash.
 * Rendered into the shared modal, re-rendering itself after every action so the
 * purse and the lists never drift out of sync.
 */
export class SettlementPanel {
  constructor(campaign, settlement, opts = {}) {
    this.campaign = campaign;
    this.settlement = settlement;
    this.maxSize = opts.maxSize ?? 12;
    this.onChange = opts.onChange || (() => {});
    this.onClose = opts.onClose || (() => {});
    this.tab = 'contracts';
    this.equipping = null;      // stash index awaiting a brother to be picked
    this.flash = null;          // one-line feedback for the last action
  }

  open() { this.render(); }

  render() {
    const s = this.settlement;
    const tier = SETTLEMENTS[s.tier];
    overlay.modal(`${s.name}`, this.body(), this.onClose, '나가기', 'wide');
    document.querySelector('#modal-title').textContent = `${s.name} · ${tier.name}`;
    this.bind();
  }

  body() {
    const c = this.campaign.company;
    const tabs = TABS.map((t) =>
      `<button class="seg-btn ${this.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.name}</button>`).join('');

    return `
      <div class="sp-bar">
        <div class="seg">${tabs}</div>
        <div class="sp-purse">
          <span>보유</span><b>${c.crowns}</b><span>크라운</span>
          <span class="sp-sep"></span>
          <span>일당</span><b>${c.dailyWage}</b>
        </div>
      </div>
      ${this.flash ? `<div class="sp-flash">${this.flash}</div>` : ''}
      <div class="sp-body">${this[this.tab]()}</div>`;
  }

  // ------------------------------------------------------------- contracts
  contracts() {
    const cam = this.campaign;
    const board = this.settlement.board || [];
    const mine = cam.contracts;

    const offer = board.length ? board.map((k) => {
      const t = CONTRACT_TYPES[k.type];
      return `<div class="sp-row">
        <div class="sp-main">
          <div class="sp-name">${t.icon} ${esc(k.title)}</div>
          <div class="sp-sub">${esc(k.detail)}</div>
          <div class="sp-meta">기한 ${k.days}일 · 보수 <b>${k.reward}</b> 크라운</div>
        </div>
        <button class="btn" data-take="${k.id}">수락</button>
      </div>`;
    }).join('') : '<div class="sp-empty">지금은 걸린 일이 없다.</div>';

    const active = mine.length ? mine.map((k) => {
      const left = daysLeft(k, cam.day);
      const state = k.state === 'reported' ? `<b style="color:#7fb069">완수 — ${esc(k.issuerName)} 로 보고</b>`
        : `남은 기한 <b class="${left <= 2 ? 'sp-warn' : ''}">${left}일</b>`;
      return `<div class="sp-row">
        <div class="sp-main">
          <div class="sp-name">${CONTRACT_TYPES[k.type].icon} ${esc(k.title)}</div>
          <div class="sp-meta">${state} · 보수 <b>${k.reward}</b></div>
        </div>
      </div>`;
    }).join('') : '<div class="sp-empty">진행 중인 계약이 없다.</div>';

    return `<h3 class="sp-h">게시판</h3>${offer}
            <h3 class="sp-h">맡은 일</h3>${active}`;
  }

  // ------------------------------------------------------------- hire
  hire() {
    const cam = this.campaign;
    const list = this.settlement.recruits || [];
    if (!list.length) return '<div class="sp-empty">일자리를 찾는 사람이 없다.</div>';

    return list.map((u, i) => {
      const cost = hireCostOf(u.template.id);
      const full = cam.company.size >= this.maxSize;
      const poor = !cam.company.canAfford(cost);
      return `<div class="sp-row">
        <div class="sp-main">
          <div class="sp-name">${esc(u.name)} <span class="sp-tag">${esc(u.title)}</span></div>
          <div class="sp-meta">
            체력 <b>${u.hpMax}</b> · 근접 <b>${u.meleeSkill}</b> · 원거리 <b>${u.rangedSkill}</b>
            · 방어 <b>${u.meleeDefenseBase}</b> · 결의 <b>${u.resolve}</b> · 주도권 <b>${u.initiativeBase}</b>
          </div>
          <div class="sp-sub">일당 ${wageOf(u)} 크라운 · 장비 ${esc(u.weapon?.name || '맨손')}</div>
        </div>
        <button class="btn" data-hire="${i}" ${full || poor ? 'disabled' : ''}>${cost} 크라운</button>
      </div>`;
    }).join('');
  }

  // ------------------------------------------------------------- shop
  shop() {
    const cam = this.campaign;
    const stock = this.settlement.stock || [];
    if (!stock.length) return '<div class="sp-empty">팔 물건이 남지 않았다.</div>';

    return stock.map((id) => {
      const def = itemDef(id);
      if (!def) return '';
      return `<div class="sp-row">
        <div class="sp-main">
          <div class="sp-name">${esc(def.name)} <span class="sp-tag">${SLOT_NAME[slotOf(id)] || ''}</span></div>
          <div class="sp-meta">${itemSummary(id, def)}</div>
        </div>
        <button class="btn" data-buy="${id}" ${cam.company.canAfford(def.value) ? '' : 'disabled'}>${def.value} 크라운</button>
      </div>`;
    }).join('');
  }

  // ------------------------------------------------------------- stash
  stash() {
    const c = this.campaign.company;
    if (!c.stash.length) return '<div class="sp-empty">창고가 비어 있다.</div>';

    const rows = c.stash.map((id, i) => {
      const def = itemDef(id);
      if (!def) return '';
      const slot = slotOf(id);
      const picker = this.equipping === i
        ? `<div class="sp-picker">${c.alive.map((u, ui) =>
            `<button class="btn ghost" data-equip-on="${ui}">${esc(u.name)}<em> ${esc(u[slot]?.name || '없음')}</em></button>`).join('')
          || '<span class="sp-empty">단원이 없다.</span>'}</div>`
        : '';
      return `<div class="sp-row">
        <div class="sp-main">
          <div class="sp-name">${esc(def.name)} <span class="sp-tag">${SLOT_NAME[slot] || ''}</span></div>
          <div class="sp-meta">${itemSummary(id, def)}</div>
          ${picker}
        </div>
        <div class="sp-btns">
          <button class="btn" data-equip="${i}">${this.equipping === i ? '취소' : '장착'}</button>
          <button class="btn" data-sell="${i}">${Math.round(itemValue(id) * SELL_RATE)} 크라운에 판매</button>
        </div>
      </div>`;
    }).join('');

    return `${rows}
      <div class="sp-row">
        <div class="sp-main"><div class="sp-sub">창고를 전부 정리한다.</div></div>
        <button class="btn primary" data-sell-all="1">모두 판매 (${Math.round(c.stashValue())} 크라운)</button>
      </div>`;
  }

  // ------------------------------------------------------------- events
  bind() {
    const root = document.querySelector('#modal-body');
    root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      this.tab = b.dataset.tab; this.equipping = null; this.flash = null; this.render();
    }));

    root.querySelectorAll('[data-take]').forEach((b) => b.addEventListener('click', () => {
      const k = (this.settlement.board || []).find((x) => x.id === b.dataset.take);
      if (k && this.campaign.takeContract(k)) this.flash = `계약을 맡았다 — ${esc(k.title)}`;
      this.after();
    }));

    root.querySelectorAll('[data-hire]').forEach((b) => b.addEventListener('click', () => {
      const u = (this.settlement.recruits || [])[Number(b.dataset.hire)];
      if (!u) return;
      const r = this.campaign.hire(u, this.settlement, this.maxSize);
      this.flash = r.ok ? `${esc(u.name)} 이(가) 합류했다.`
        : r.reason === 'full' ? '더 받을 자리가 없다.' : '크라운이 모자란다.';
      this.after();
    }));

    root.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const r = this.campaign.buy(b.dataset.buy, this.settlement);
      this.flash = r.ok ? `${esc(itemDef(b.dataset.buy).name)} 을(를) 사서 창고에 넣었다.` : '크라운이 모자란다.';
      this.after();
    }));

    root.querySelectorAll('[data-sell]').forEach((b) => b.addEventListener('click', () => {
      const gain = this.campaign.company.sellFromStash(Number(b.dataset.sell));
      this.equipping = null;
      this.flash = gain ? `${gain} 크라운을 받았다.` : null;
      this.after();
    }));

    root.querySelector('[data-sell-all]')?.addEventListener('click', () => {
      const gain = this.campaign.company.sellAllStash();
      this.equipping = null;
      this.flash = gain ? `창고를 정리해 ${gain} 크라운을 받았다.` : null;
      this.after();
    });

    root.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.equip);
      this.equipping = this.equipping === i ? null : i;
      this.render();
    }));

    root.querySelectorAll('[data-equip-on]').forEach((b) => b.addEventListener('click', () => {
      const unit = this.campaign.company.alive[Number(b.dataset.equipOn)];
      const i = this.equipping;
      if (unit != null && i != null) {
        this.flash = this.campaign.equipFromStash(i, unit)
          ? `${esc(unit.name)} 이(가) 장비를 갖췄다.` : '이 사람에게는 맞지 않는다.';
      }
      this.equipping = null;
      this.after();
    }));
  }

  after() { this.onChange(); this.render(); }
}

/** One-line stat readout so the player can compare gear without a wiki. */
function itemSummary(id, def) {
  const slot = slotOf(id);
  if (slot === 'weapon') {
    return `피해 <b>${def.damage[0]}-${def.damage[1]}</b> · 방어구 <b>×${def.armorMult}</b>`
      + ` · 관통 <b>${Math.round(def.armorPen * 100)}%</b> · 사거리 <b>${def.range}</b>`
      + ` · 피로 ${def.fatigue}${def.twoHanded ? ' · 양손' : ''}`;
  }
  if (slot === 'shield') {
    return `내구 <b>${def.durability}</b> · 근접방어 <b>+${def.meleeDefense}</b>`
      + ` · 원거리방어 <b>+${def.rangedDefense}</b> · 피로 ${def.fatigue}`;
  }
  return `방어 <b>${def.armor}</b> · 피로 ${def.fatigue}`;
}
