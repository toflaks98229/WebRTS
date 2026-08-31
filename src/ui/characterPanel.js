import { overlay, esc, pct } from './overlay.js';
import { PERKS, xpProgress, MAX_LEVEL } from '../data/perks.js';
import { CAPTAIN_BRANCHES, CAPTAIN_NODES, nodeAvailable, RENOWN_PER_POINT } from '../data/captainTree.js';
import { wageOf } from '../campaign/company.js';
import { perkGridHTML, perkTipHTML } from './perkView.js';

/**
 * Roster screen. One tab per concern: a brother's own perks, and the captain's
 * tree, which belongs to the company rather than to any one man.
 *
 * The captain tree lays each branch out as a diamond (root, two middles, capstone)
 * and draws its prerequisite edges as bezier curves on an SVG layer measured from
 * the real node boxes, so the picture stays correct whatever the panel width.
 */
export class CharacterPanel {
  constructor(campaign, opts = {}) {
    this.campaign = campaign;
    this.onChange = opts.onChange || (() => {});
    const close = opts.onClose || (() => {});
    this.onClose = () => { this.edgeObserver?.disconnect(); this.edgeObserver = null; close(); };
    this.tab = opts.tab || 'roster';
    this.selected = opts.unit || campaign.company.alive[0] || null;
    this.flash = null;
    this.justTook = null;      // node/perk id to play the unlock flourish on
  }

  open() { this.render(); }

  render() {
    overlay.modal('용병단', this.body(), this.onClose, '닫기', 'wide');
    this.bind();
    this.edgeObserver?.disconnect();
    this.edgeObserver = null;
    if (this.tab === 'captain') {
      // getBoundingClientRect forces layout, so the nodes can be measured right
      // away - waiting on rAF would leave the edges undrawn in a hidden tab.
      this.drawEdges();
      // Late web fonts and scrollbars reflow the boxes after that first pass,
      // so keep the geometry in step with whatever the browser settles on.
      if (window.ResizeObserver) {
        this.edgeObserver = new ResizeObserver(() => this.drawEdges());
        document.querySelectorAll('#modal-body .cb-graph').forEach((g) => this.edgeObserver.observe(g));
      }
    }
  }

  body() {
    const c = this.campaign.company;
    const unspent = c.alive.reduce((s, u) => s + u.perkPoints, 0);
    const tabs = [['roster', '단원', unspent], ['captain', '단장 특성', this.campaign.captainPoints]]
      .map(([id, name, badge]) => `<button class="seg-btn ${this.tab === id ? 'active' : ''}" data-tab="${id}">
        ${name}${badge ? `<i class="seg-badge">${badge}</i>` : ''}</button>`).join('');

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
        ${u.perkPoints ? `<span class="cp-pts">${u.perkPoints}</span>` : ''}
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
    const taken = [...u.perks];

    return `
      <div class="cp-head">
        <div>
          <div class="cp-title">${esc(u.name)}${u.isCaptain ? ' <span class="cp-cap">단장</span>' : ''}</div>
          <div class="cp-sub">${esc(u.title)} · ${u.level} 레벨 · 처치 ${u.kills} · 일당 ${wageOf(u)}</div>
        </div>
        ${this.pointsDial(u)}
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

      <h3 class="sp-h">특성 <span class="sp-count">${taken.length} / 24</span></h3>
      ${perkGridHTML((pk, tier) => this.perkState(u, pk, tier), { level: u.level })}`;
  }

  /** A ring that fills as the brother spends what he has earned. */
  pointsDial(u) {
    const has = u.perkPoints;
    return `<div class="dial ${has ? 'on' : ''}" title="쓸 수 있는 특성 점수">
      <svg viewBox="0 0 44 44"><circle class="dial-bg" cx="22" cy="22" r="19"/>
        <circle class="dial-fg" cx="22" cy="22" r="19"
          stroke-dasharray="${Math.min(1, has / 3) * 119} 119"/></svg>
      <span class="dial-n">${has}</span>
      <span class="dial-l">특성 점수</span>
    </div>`;
  }

  perkState(u, pk, tier) {
    const pop = this.justTook === pk.id ? ' pop' : '';
    if (u.hasPerk(pk.id)) return `taken${pop}`;
    if (u.level < tier) return 'locked';
    return u.perkPoints > 0 ? 'can' : 'idle';
  }

  // ------------------------------------------------------------- captain
  captain() {
    const c = this.campaign.company;
    const taken = c.captainPerks;
    const points = this.campaign.captainPoints;
    const toNext = RENOWN_PER_POINT - (c.renown % RENOWN_PER_POINT);
    const cap = c.captain;

    const branches = Object.values(CAPTAIN_BRANCHES).map((b) => {
      const got = b.nodes.filter((n) => taken.has(n.id)).length;
      // root / two middles / capstone - the fixed diamond every branch shares.
      const [root, midA, midB, cap2] = b.nodes;
      const node = (n) => {
        const has = taken.has(n.id);
        const can = !has && points > 0 && nodeAvailable(n.id, taken);
        const state = has ? 'taken' : can ? 'can' : 'locked';
        return `<button class="cnode ${state} ${this.justTook === n.id ? 'pop' : ''}"
                  data-node="${n.id}" ${can ? '' : 'disabled'}>
          <span class="cn-ic">${n.icon}</span><span class="cn-nm">${esc(n.name)}</span>
        </button>`;
      };
      return `<div class="cbranch" data-branch="${b.id}">
        <div class="cb-head"><span class="cb-ic">${b.icon}</span>${b.name}
          <span class="cb-count ${got === b.nodes.length ? 'full' : ''}">${got}/${b.nodes.length}</span></div>
        <div class="cb-blurb">${esc(b.blurb)}</div>
        <div class="cb-graph">
          <svg class="cb-edges" aria-hidden="true"></svg>
          <div class="cb-row one">${node(root)}</div>
          <div class="cb-row two">${node(midA)}${node(midB)}</div>
          <div class="cb-row one">${node(cap2)}</div>
        </div>
      </div>`;
    }).join('');

    return `
      <div class="cp-capbar">
        <div>현재 단장 <b>${cap ? esc(cap.name) : '없음'}</b>
          <span class="cp-note">단장이 쓰러져도 이 특성은 용병단에 남는다.</span></div>
        <div class="cp-renown">
          <div class="meter-top"><span>다음 점수까지</span><b>명성 ${toNext}</b></div>
          <div class="meter-bar"><div class="meter-fill f-xp"
            style="width:${pct(RENOWN_PER_POINT - toNext, RENOWN_PER_POINT)}%"></div></div>
        </div>
      </div>
      <div class="ctree">${branches}</div>`;
  }

  /**
   * Draw prerequisite edges from the laid-out node boxes. Curves are cubic
   * beziers pulled vertically so the diamond reads as a flow rather than a grid.
   */
  drawEdges() {
    const root = document.querySelector('#modal-body');
    if (!root) return;
    const taken = this.campaign.company.captainPerks;

    for (const branch of root.querySelectorAll('.cbranch')) {
      const graph = branch.querySelector('.cb-graph');
      const svg = branch.querySelector('.cb-edges');
      if (!graph || !svg) continue;
      const box = graph.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      // Only the viewBox: width/height attributes would override the CSS that
      // stretches the layer over the graph, freezing it at the first measurement.
      svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      svg.setAttribute('preserveAspectRatio', 'none');

      const centre = (id) => {
        const el = branch.querySelector(`[data-node="${id}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, h: r.height };
      };

      const parts = [];
      for (const node of CAPTAIN_BRANCHES[branch.dataset.branch].nodes) {
        for (const req of node.requires) {
          const a = centre(req);
          const b = centre(node.id);
          if (!a || !b) continue;
          // Live once the prerequisite is owned, so the path lights up as it fills.
          const live = taken.has(req);
          // Pull the control points toward the gap so the curve reads as a
          // flow between plaques rather than a wire behind them.
          const y1 = a.y + a.h / 2;
          const y2 = b.y - b.h / 2;
          const bend = (y2 - y1) * 0.55;
          parts.push(`<path d="M ${a.x} ${y1} C ${a.x} ${y1 + bend}, ${b.x} ${y2 - bend}, ${b.x} ${y2}"
            class="edge ${live ? 'live' : ''}" data-from="${req}" data-to="${node.id}" />`);
        }
      }
      svg.innerHTML = parts.join('');
    }
  }

  /** Light up a node's whole ancestor chain on hover, edges included. */
  highlightChain(id, on) {
    const root = document.querySelector('#modal-body');
    if (!root) return;
    const chain = new Set();
    const walk = (nid) => {
      if (chain.has(nid)) return;
      chain.add(nid);
      (CAPTAIN_NODES[nid]?.requires || []).forEach(walk);
    };
    if (id) walk(id);

    root.querySelectorAll('[data-node]').forEach((el) => {
      el.classList.toggle('chain', on && chain.has(el.dataset.node));
    });
    root.querySelectorAll('.edge').forEach((el) => {
      el.classList.toggle('chain', on && chain.has(el.dataset.from) && chain.has(el.dataset.to));
    });
  }

  // ------------------------------------------------------------- events
  bind() {
    const root = document.querySelector('#modal-body');

    root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      this.tab = b.dataset.tab; this.flash = null; this.justTook = null; this.render();
    }));
    root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
      this.selected = this.campaign.company.alive.find((u) => u.id === Number(b.dataset.pick)) || null;
      this.flash = null;
      this.render();
    }));

    root.querySelectorAll('[data-perk]').forEach((b) => {
      const pk = PERKS[b.dataset.perk];
      b.addEventListener('mouseenter', (ev) => {
        const r = ev.currentTarget.getBoundingClientRect();
        const u = this.selected;
        const note = u && !u.hasPerk(pk.id) && u.level < pk.tier
          ? `${pk.tier} 레벨부터 열린다.`
          : u?.hasPerk(pk.id) ? '이미 익혔다.' : u?.perkPoints ? '클릭해서 습득' : '특성 점수가 없다.';
        overlay.tip(perkTipHTML(pk, note), r.left + r.width / 2, r.top, true);
      });
      b.addEventListener('mouseleave', () => overlay.hideTip());
      b.addEventListener('click', () => {
        if (this.selected?.takePerk(pk.id)) {
          this.flash = `${esc(this.selected.name)} — ${esc(pk.name)} 습득`;
          this.justTook = pk.id;
        }
        overlay.hideTip();
        this.after();
      });
    });

    root.querySelectorAll('[data-node]').forEach((b) => {
      const n = CAPTAIN_NODES[b.dataset.node];
      b.addEventListener('mouseenter', (ev) => {
        const r = ev.currentTarget.getBoundingClientRect();
        const taken = this.campaign.company.captainPerks;
        const missing = n.requires.filter((x) => !taken.has(x)).map((x) => CAPTAIN_NODES[x].name);
        const note = taken.has(n.id) ? '이미 익혔다.'
          : missing.length ? `선행 필요: ${missing.join(', ')}`
            : this.campaign.captainPoints ? '클릭해서 습득' : '단장 점수가 없다.';
        overlay.tip(`<h4>${n.icon} ${esc(n.name)}</h4><div class="note">${esc(n.desc)}</div>
          <div class="tip-note">${esc(note)}</div>`, r.left + r.width / 2, r.top, true);
        this.highlightChain(n.id, true);
      });
      b.addEventListener('mouseleave', () => { overlay.hideTip(); this.highlightChain(null, false); });
      b.addEventListener('click', () => {
        if (this.campaign.takeCaptainNode(n.id)) {
          this.flash = `단장 특성 — ${esc(n.name)}`;
          this.justTook = n.id;
        }
        overlay.hideTip();
        this.after();
      });
    });
  }

  after() { this.onChange(); this.render(); }
}
