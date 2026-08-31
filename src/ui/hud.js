import { MORALE } from '../battle/unit.js';
import { overlay, esc, pct } from './overlay.js';
import { skillIcon } from './icons.js';

const $ = (sel) => document.querySelector(sel);

/** All DOM-side UI: unit card, action bar, turn order, log, tooltips. */
export class HUD {
  constructor() {
    this.battle = null;
    this.game = null;

    this.el = {
      round: $('#round-num'),
      order: $('#turn-order'),
      card: $('#unit-card'),
      log: $('#log'),
      skills: $('#skills'),
      resource: $('#ap-fatigue'),
    };

    $('#btn-end').addEventListener('click', () => this.game?.endTurn());
    $('#btn-wait').addEventListener('click', () => this.game?.wait());

  }

  /** Point the HUD at the battle and scene that are currently live. */
  attach(battle, scene) {
    this.battle = battle;
    this.game = scene;
    this.clearLog();
    this.unsubscribe?.();
    this.unsubscribe = battle.bus.on('log', (e) => this.appendLog(e));
    for (const line of battle.logLines) this.appendLog(line);
  }

  // ------------------------------------------------------------- refresh
  refresh() {
    if (!this.battle) return;      // nothing bound yet - we are on the map
    this.el.round.textContent = this.battle.round;
    this.renderOrder();
    this.renderCard(this.game.inspected || this.battle.current);
    this.renderSkills();
  }

  renderOrder() {
    const b = this.battle;
    const html = b.order.map((u, i) => {
      if (!u.alive || u.withdrawn) return '';
      const cls = [
        'to-chip', u.faction,
        i === b.turnIndex ? 'active' : '',
        i < b.turnIndex ? 'done' : '',
      ].join(' ');
      const missing = Math.round((1 - u.hp / u.hpMax) * 100);
      return `<div class="${cls}" data-uid="${u.id}" title="${esc(u.name)} · 주도권 ${u.initiative}">
        <div class="hpfill" style="height:${missing}%"></div>
        <span>${u.initiative}</span>
      </div>`;
    }).join('');
    this.el.order.innerHTML = html;
    this.el.order.querySelectorAll('.to-chip').forEach((chip) => {
      chip.addEventListener('mouseenter', () => {
        const u = this.battle.units.find((x) => x.id === +chip.dataset.uid);
        if (u) this.renderCard(u);
      });
      chip.addEventListener('mouseleave', () => this.renderCard(this.game.inspected || this.battle.current));
    });
  }

  renderCard(u) {
    const el = this.el.card;
    if (!u) { el.className = 'unit-card empty'; el.textContent = '유닛을 선택하세요'; return; }
    el.className = 'unit-card';

    const m = MORALE[u.morale];
    const arm = (slot, cls) => slot
      ? `<div class="meter">
           <div class="meter-top"><span>${esc(slot.name)}</span><b>${slot.armor} / ${slot.max}</b></div>
           <div class="meter-bar"><div class="meter-fill ${cls}" style="width:${pct(slot.armor, slot.max)}%"></div></div>
         </div>`
      : '';

    el.innerHTML = `
      <div class="uc-head">
        <div class="uc-name">${esc(u.name)}</div>
        <div class="uc-morale" style="color:${m.color}">${m.name}</div>
      </div>
      <div class="uc-title">${esc(u.title)}${u.stunned > 0 ? ' · <b style="color:#d9b64c">기절</b>' : ''}</div>

      <div class="meter">
        <div class="meter-top"><span>체력</span><b>${Math.max(0, u.hp)} / ${u.hpMax}</b></div>
        <div class="meter-bar"><div class="meter-fill f-hp" style="width:${pct(u.hp, u.hpMax)}%"></div></div>
      </div>
      <div class="meter">
        <div class="meter-top"><span>피로도</span><b>${u.fatigue} / ${u.fatigueMax}</b></div>
        <div class="meter-bar"><div class="meter-fill f-fat" style="width:${pct(u.fatigue, u.fatigueMax)}%"></div></div>
      </div>
      ${arm(u.body, 'f-arm')}${arm(u.head, 'f-armh')}

      <div class="meter">
        <div class="meter-top"><span>행동력</span><b>${u.ap} / ${u.maxAP}</b></div>
        <div class="ap-pips">${Array.from({ length: u.maxAP }, (_, i) =>
          `<div class="ap-pip ${i < u.ap ? 'on' : ''}"></div>`).join('')}</div>
      </div>

      <div class="stat-grid">
        <div class="stat"><span>근접 숙련</span><b>${u.meleeSkill}</b></div>
        <div class="stat"><span>근접 방어</span><b>${u.meleeDefense}</b></div>
        <div class="stat"><span>원거리 숙련</span><b>${u.rangedSkill}</b></div>
        <div class="stat"><span>원거리 방어</span><b>${u.rangedDefense}</b></div>
        <div class="stat"><span>주도권</span><b>${u.initiative}</b></div>
        <div class="stat"><span>결의</span><b>${u.resolve}</b></div>
      </div>

      <div class="gear">
        ${gearRow('무기', u.weapon ? `${u.weapon.name} (${u.weapon.damage[0]}-${u.weapon.damage[1]})` : '맨손')}
        ${u.shield ? gearRow('방패', `${u.shield.name} (${u.shield.durability}/${u.shield.max ?? u.shield.durability})`) : ''}
        ${u.ammo != null ? gearRow('투척물', `${u.ammo}개`) : ''}
        ${u.loaded === false ? gearRow('상태', '재장전 필요') : ''}
        ${u.kills ? gearRow('처치', `${u.kills}`) : ''}
      </div>`;
  }

  renderSkills() {
    const b = this.battle;
    const u = b.current;
    const playerTurn = u && u.faction === 'player' && b.phase === 'playing';

    this.el.resource.innerHTML = u ? `
      <div class="meter">
        <div class="meter-top"><span>행동력</span><b>${u.ap} / ${u.maxAP}</b></div>
        <div class="meter-bar"><div class="meter-fill f-ap" style="width:${pct(u.ap, u.maxAP)}%"></div></div>
      </div>
      <div class="meter">
        <div class="meter-top"><span>피로도</span><b>${u.fatigue} / ${u.fatigueMax}</b></div>
        <div class="meter-bar"><div class="meter-fill f-fat" style="width:${pct(u.fatigue, u.fatigueMax)}%"></div></div>
      </div>` : '';

    if (!playerTurn) {
      this.el.skills.innerHTML = `<div style="color:var(--muted);font-style:italic;align-self:center">
        ${b.phase === 'over' ? '전투 종료' : '적의 차례...'}</div>`;
      $('#btn-end').disabled = true;
      $('#btn-wait').disabled = true;
      return;
    }
    $('#btn-end').disabled = false;
    $('#btn-wait').disabled = u.waited;

    this.el.skills.innerHTML = u.skills.map((sk, i) => {
      const ok = u.canAfford(sk);
      const active = this.game.activeSkill === sk.id;
      return `<div class="skill ${ok ? '' : 'disabled'} ${active ? 'active' : ''}" data-skill="${sk.id}">
        <span class="hot">${i + 1}</span>
        <span class="ic-slot">${skillIcon(sk)}</span>
        <span class="nm">${sk.name}</span>
        <span class="cost"><span class="ap">${sk.ap}AP</span> · <span class="fa">${sk.fatigue}</span></span>
      </div>`;
    }).join('');

    this.el.skills.querySelectorAll('.skill').forEach((node) => {
      const id = node.dataset.skill;
      node.addEventListener('click', () => this.game.selectSkill(id));
      node.addEventListener('mouseenter', (ev) => this.showSkillTip(id, ev));
      node.addEventListener('mouseleave', () => this.hideTip());
    });
  }

  // ------------------------------------------------------------- tooltips
  showSkillTip(id, ev) {
    const u = this.battle.current;
    const sk = u?.skills.find((s) => s.id === id);
    if (!sk) return;
    const r = ev.currentTarget.getBoundingClientRect();
    this.tipHTML(`<h4>${skillIcon(sk, 'ic-tip')} ${sk.name}</h4>
      <div class="row"><span>행동력</span><b>${sk.ap}</b></div>
      <div class="row"><span>피로도</span><b>${sk.fatigue}</b></div>
      ${sk.hitBonus ? `<div class="row"><span>명중 보정</span><b class="${sk.hitBonus > 0 ? 'pos' : 'neg'}">${sk.hitBonus > 0 ? '+' : ''}${sk.hitBonus}</b></div>` : ''}
      ${sk.damageMult != null ? `<div class="row"><span>피해 배율</span><b>×${sk.damageMult}</b></div>` : ''}
      <hr><div class="note">${sk.desc}</div>`, r.left, r.top - 8, true);
  }

  /** Hit-chance breakdown shown when hovering an enemy with an attack armed. */
  showAttackTip(attacker, target, sk, sx, sy) {
    const { chance, parts } = this.battle.preview(attacker, target, sk);
    const rows = parts.map((p) => `<div class="row"><span>${p.label}</span>
      <b class="${p.value >= 0 ? 'pos' : 'neg'}">${p.value >= 0 ? '+' : ''}${p.value}</b></div>`).join('');
    const w = attacker.weapon;
    const dmg = w ? `${Math.round(w.damage[0] * (sk.damageMult ?? 1))}–${Math.round(w.damage[1] * (sk.damageMult ?? 1))}` : '—';
    this.tipHTML(`<h4>${esc(target.name)}</h4>
      <div class="chance">${chance}%</div>
      ${rows}<hr>
      <div class="row"><span>피해</span><b>${dmg}</b></div>
      <div class="row"><span>방어구</span><b>${target.armorTotal} / ${target.armorMax}</b></div>
      <div class="row"><span>체력</span><b>${target.hp} / ${target.hpMax}</b></div>`, sx, sy);
  }

  showTerrainTip(tile, def, sx, sy) {
    this.tipHTML(`<h4>${def.name}</h4>
      <div class="row"><span>이동 비용</span><b>${def.passable ? `${def.moveCost} AP` : '통과 불가'}</b></div>
      ${def.passable ? `<div class="row"><span>피로도</span><b>${def.moveFatigue}</b></div>` : ''}
      ${tile?.elev ? `<div class="row"><span>고도</span><b class="pos">+${tile.elev}</b></div>` : ''}
      ${def.cover ? `<div class="row"><span>엄폐</span><b class="pos">+${def.cover}</b></div>` : ''}`, sx, sy);
  }

  tipHTML(html, x, y, above = false) { overlay.tip(html, x, y, above); }

  hideTip() { overlay.hideTip(); }

  // ------------------------------------------------------------- misc
  appendLog(e) {
    const div = document.createElement('div');
    div.className = `${e.kind} ${e.faction === 'enemy' ? 'e-side' : e.faction === 'player' ? 'p-side' : ''}`;
    div.textContent = e.text;
    this.el.log.appendChild(div);
    this.el.log.scrollTop = this.el.log.scrollHeight;
    while (this.el.log.childElementCount > 300) this.el.log.removeChild(this.el.log.firstChild);
  }

  clearLog() { this.el.log.innerHTML = ''; }

  showBanner(text, ms = 1400) { overlay.banner(text, ms); }

  modal(title, bodyHTML, onOk = null, okLabel = '확인') { overlay.modal(title, bodyHTML, onOk, okLabel); }

  showHelp() {
    this.modal('조작법', `
      <ul>
        <li><b>좌클릭</b> — 빈 칸: 이동 / 적: 선택한 기술로 공격</li>
        <li><b>우클릭</b> — 선택한 기술 해제</li>
        <li><b>1 ~ 9</b> — 기술 선택</li>
        <li><b>Space</b> — 턴 종료, <b>Q</b> — 대기(순서 뒤로)</li>
        <li><b>휠</b> — 확대/축소, <b>드래그</b> 또는 <b>WASD</b> — 화면 이동</li>
        <li><b>Tab</b> — 다음 아군으로 카메라 이동</li>
      </ul>
      <hr style="border:0;border-top:1px solid var(--edge);margin:10px 0">
      <b>핵심 규칙</b>
      <ul>
        <li>매 턴 <b>행동력 9</b>. 이동은 지형에 따라 2~5 AP, 한 단계 오르막마다 +2 AP.</li>
        <li><b>피로도</b>가 쌓이면 방어력과 주도권이 떨어지고, 한계에 닿으면 기술을 쓸 수 없다. 턴마다 15 회복.</li>
        <li>적에게 인접한 칸에서 <b>벗어나면</b> 추가 AP와 피로도를 지불한다.</li>
        <li>피해는 <b>방어구를 먼저 깎고</b> 일부만 체력에 들어간다. 둔기는 관통, 도끼는 방어구 파괴에 강하다.</li>
        <li>25% 확률로 <b>머리</b>에 맞으며 피해가 1.5배가 된다.</li>
        <li><b>고지대</b>에서 치면 단계마다 명중 +10, 피해 +15%. 능선 너머로는 쏠 수 없다.</li>
        <li>아군이 쓰러지면 <b>사기</b> 판정을 한다. 사기가 바닥나면 패주한다.</li>
      </ul>`);
  }
}

function gearRow(label, value) {
  return `<div class="gear-row"><i>${label}</i><em>${esc(String(value))}</em></div>`;
}
