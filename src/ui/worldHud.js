import { overlay, esc, pct } from './overlay.js';
import { worldTerrain, SETTLEMENTS } from '../data/worldTerrain.js';
import { bandStrengthLabel } from '../campaign/bands.js';
import { CONTRACT_TYPES, daysLeft } from '../campaign/contracts.js';
import { xpProgress } from '../data/perks.js';
import { ambitionProgress } from '../data/ambitions.js';
import { threatDef, THREAT_MAX } from '../campaign/threat.js';
import { HOURS_PER_DAY } from '../campaign/campaign.js';

const $ = (sel) => document.querySelector(sel);

/** DOM side of the campaign map: date, speed, company roster, journal, tooltips. */
export class WorldHud {
  constructor() {
    this.campaign = null;
    this.scene = null;
    this.el = {
      day: $('#day-num'),
      clock: $('#clock'),
      status: $('#world-status'),
      card: $('#company-card'),
      log: $('#world-log'),
      hint: $('#world-hint'),
      actions: $('#world-actions'),
      speed: $('#speed-controls'),
    };

    this.el.speed.querySelectorAll('.seg-btn').forEach((b) => {
      b.addEventListener('click', () => this.scene?.setSpeed(Number(b.dataset.speed)));
    });
  }

  attach(campaign, scene) {
    this.campaign = campaign;
    this.scene = scene;
    this.el.log.innerHTML = '';
    // The campaign bus outlives every trip to a battle, so drop the previous
    // subscription or the journal doubles up each time we come back.
    this.unsubscribe?.();
    this.unsubscribe = campaign.bus.on('log', (e) => this.appendLog(e));
    for (const line of campaign.log) this.appendLog(line);
  }

  setSpeedButtons(speed) {
    this.el.speed.querySelectorAll('.seg-btn').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.speed) === speed);
    });
  }

  // ------------------------------------------------------------- refresh
  refresh() {
    const c = this.campaign;
    this.el.day.textContent = c.day;
    const h = String(c.hourOfDay).padStart(2, '0');
    const m = String(Math.floor((c.time % 1) * 60)).padStart(2, '0');
    this.el.clock.textContent = `${h}:${m}`;

    const alive = c.company.alive;
    const wounded = alive.filter((u) => u.hp < u.hpMax).length;
    const points = alive.reduce((s, u) => s + u.perkPoints, 0) + c.captainPoints;
    const here = c.settlementAt(c.party.hex);
    this.el.status.innerHTML = `
      <span class="purse"><b>${c.company.crowns}</b> 크라운</span>
      <span class="sp-sep"></span>` + [
      `단원 <b>${alive.length}</b>명`,
      `일당 <b>${c.company.dailyWage}</b>`,
      wounded ? `부상 <b>${wounded}</b>명` : null,
      points ? `<b style="color:#7fb069">특성 ${points}점</b>` : null,
      c.party.moving ? '이동 중' : here ? `<b>${esc(here.name)}</b> 체류` : '야영 중',
    ].filter(Boolean).join(' · ') + this.renderMeters();

    this.renderRoster();
    this.renderActions();
  }

  /**
   * The two numbers that decide how the run goes: how close the company is to
   * what it set out to do, and how bad the country has got while it worked.
   * Both live in the top bar because a goal nobody can see is not a goal.
   */
  renderMeters() {
    const c = this.campaign;
    const a = ambitionProgress(c);
    const t = threatDef(c.threat);
    const threatPct = Math.min(100, (c.threat / THREAT_MAX) * 100);
    return `
      <span class="meter-chip" title="${esc(a.def.name)} — ${esc(a.def.blurb)}">
        <span class="mc-icon">${a.def.icon}</span>
        <span class="mc-body">
          <span class="mc-top"><span>${esc(a.def.name)}</span>
            <b>${a.have.toLocaleString()} / ${a.goal.toLocaleString()}</b></span>
          <span class="mc-bar"><i style="width:${a.ratio * 100}%"></i></span>
        </span>
      </span>
      <span class="meter-chip" title="위협도 ${Math.round(c.threat)} — ${esc(t.note)}">
        <span class="mc-icon" style="color:${t.color}">⚑</span>
        <span class="mc-body">
          <span class="mc-top"><span>위협</span>
            <b style="color:${t.color}">${esc(t.name)}</b></span>
          <span class="mc-bar"><i style="width:${threatPct}%;background:${t.color}"></i></span>
        </span>
      </span>`;
  }

  renderRoster() {
    const c = this.campaign;
    if (!c.roster.length) { this.el.card.innerHTML = '<div class="cc-empty">단원이 없습니다</div>'; return; }

    const rows = c.roster.map((u) => {
      const hp = pct(u.hp, u.hpMax);
      const arm = u.armorMax ? pct(u.armorTotal, u.armorMax) : 0;
      const xp = xpProgress(u);
      return `<div class="roster-row ${u.alive ? '' : 'dead'}" data-uid="${u.id}" title="눌러서 특성 창 열기">
        <div>
          <div class="rn">${u.isCaptain ? '<span class="cp-cap">단장</span> ' : ''}${esc(u.name)}
            ${u.perkPoints ? `<span class="cp-pts">+${u.perkPoints}</span>` : ''}</div>
          <div class="rt">${u.level}레벨 · ${esc(u.title)} · ${esc(u.weapon?.name || '맨손')}</div>
        </div>
        <div>
          <div class="mini-bar"><div style="width:${hp}%;background:linear-gradient(#7cc063,#4b7a3a)"></div></div>
          <div class="mini-bar"><div style="width:${arm}%;background:linear-gradient(#b3bcc4,#6d757c)"></div></div>
          <div class="mini-bar"><div style="width:${xp ? pct(xp.have, xp.need) : 100}%;background:linear-gradient(#c8a24a,#7d6531)"></div></div>
        </div>
      </div>`;
    }).join('');

    this.el.card.innerHTML = `
      <div class="cc-head">용병단 <small>${c.company.size}명</small></div>
      ${rows}`;

    this.el.card.querySelectorAll('.roster-row').forEach((row) => {
      row.addEventListener('click', () => this.scene?.openRoster(Number(row.dataset.uid)));
    });
  }

  renderActions() {
    const c = this.campaign;
    const site = c.settlementAt(c.party.hex);
    const chips = [];

    // Whatever the company is on the hook for, kept in front of the player.
    for (const k of c.contracts.slice(0, 2)) {
      const left = daysLeft(k, c.day);
      const status = k.state === 'reported' ? `완수 · ${esc(k.issuerName)} 로 보고` : `${left}일 남음`;
      chips.push(`<div class="contract-chip">
        <span class="cn">${CONTRACT_TYPES[k.type].icon} ${esc(k.title)}</span>
        <span class="cd">${status} · ${k.reward} 크라운</span>
      </div>`);
    }

    chips.push('<button class="btn" data-act="roster">단원</button>');

    if (site) {
      const tier = SETTLEMENTS[site.tier];
      chips.push(`<div class="site-chip"><span class="sn">${esc(site.name)}</span><span class="st">${tier.name}</span></div>`);
      chips.push('<button class="btn primary" data-act="town">마을 들어가기</button>');
      chips.push('<button class="btn" data-act="rest">하루 휴식</button>');
    }
    this.el.actions.innerHTML = chips.join('');
    this.el.actions.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', () => this.scene?.action(b.dataset.act));
    });

    this.el.hint.innerHTML = c.party.moving
      ? '이동 중 — <b>클릭</b>으로 목적지 변경, <b>정지</b> 버튼으로 멈춤'
      : site
        ? '<b>마을 들어가기</b> 에서 계약을 맡고 사람을 쓰고 장비를 사고판다.'
        : '<b>클릭</b>으로 이동. 급여는 매일 새벽에 나간다.';
  }

  // ------------------------------------------------------------- tooltips
  showTileTip(tile, x, y) {
    const c = this.campaign;
    const def = worldTerrain(tile.terrain);
    const band = c.bands.find((b) => b.alive && b.hex.q === tile.hex.q && b.hex.r === tile.hex.r);
    const route = c.previewRoute(tile.hex);

    const head = tile.settlement
      ? `<h4>${esc(tile.settlement.name)}</h4><div class="row"><span>규모</span><b>${SETTLEMENTS[tile.settlement.tier].name}</b></div>`
      : band
        ? `<h4>${esc(band.name)}</h4><div class="row"><span>병력</span><b>${band.roster.length}명 (${bandStrengthLabel(band.roster.length)})</b></div>`
        : `<h4>${def.name}</h4>`;

    const body = [
      `<div class="row"><span>지형</span><b>${def.name}${tile.road ? ' · 길' : ''}</b></div>`,
      def.passable ? `<div class="row"><span>통행</span><b>${(def.travel * (tile.road ? 0.5 : 1)).toFixed(1)}시간</b></div>`
        : '<div class="row"><span>통행</span><b>불가</b></div>',
      tile.camp ? '<div class="row"><span>지점</span><b>산적 야영지</b></div>' : '',
      route ? `<hr><div class="row"><span>이동 시간</span><b>${formatHours(route.hours)}</b></div>` : '',
    ].join('');

    overlay.tip(head + body, x, y);
  }

  hideTip() { overlay.hideTip(); }

  appendLog(e) {
    const div = document.createElement('div');
    div.className = e.kind;
    div.textContent = `${e.day}일차 · ${e.text}`;
    this.el.log.appendChild(div);
    this.el.log.scrollTop = this.el.log.scrollHeight;
    while (this.el.log.childElementCount > 200) this.el.log.removeChild(this.el.log.firstChild);
  }

  showHelp() {
    overlay.modal('캠페인 지도', `
      <ul>
        <li><b>좌클릭</b> — 그 지점으로 행군. 적 무리를 클릭하면 추격한다.</li>
        <li><b>우클릭 드래그</b> / 방향키 — 지도 이동, <b>휠</b> — 확대·축소</li>
        <li><b>Space</b> — 일시정지, <b>1 / 2</b> — 보통 / 빠름</li>
      </ul>
      <hr style="border:0;border-top:1px solid var(--edge);margin:10px 0">
      <ul>
        <li>적 무리와 같은 칸에 서면 <b>전투</b>가 시작된다. 전투는 헥스 전술 화면으로 전환된다.</li>
        <li>적 무리는 <b>4칸</b> 안에 들어오면 추격해 온다. 길 위에서는 이동이 두 배 빠르다.</li>
        <li><b>마을에 머물면</b> 시간이 갈수록 부상과 장비가 회복된다.</li>
        <li>야영지의 무리를 없애도 며칠 뒤 다시 채워진다.</li>
        <li>쓰러진 단원은 돌아오지 않는다. 승리하면 적의 장비를 노획한다.</li>
      </ul>
      <hr style="border:0;border-top:1px solid var(--edge);margin:10px 0">
      <b>계약과 살림</b>
      <ul>
        <li>마을에서 <b>계약</b>을 맡는다. 산적 소탕은 야영지를 비운 뒤 <b>의뢰한 마을로 돌아가</b> 보고해야 보수를 받는다.</li>
        <li>호위 계약은 목적지 마을에 도착하면 그 자리에서 삯을 받는다. 기한을 넘기면 계약은 파기된다.</li>
        <li><b>급여</b>는 매일 새벽에 자동으로 나간다. 이틀 연속 못 주면 단원이 떠난다.</li>
        <li>노획품 중 쓰지 않는 장비는 <b>창고</b>에 쌓인다. 마을 상점에서 팔거나 다른 단원에게 장착할 수 있다.</li>
      </ul>`);
  }
}

export function formatHours(h) {
  if (h < 1) return `${Math.round(h * 60)}분`;
  if (h < HOURS_PER_DAY) return `${h.toFixed(1)}시간`;
  return `${Math.floor(h / HOURS_PER_DAY)}일 ${Math.round(h % HOURS_PER_DAY)}시간`;
}
