import { distance } from '../hex/hex.js';
import { SETTLEMENTS } from '../data/worldTerrain.js';

export const CONTRACT_TYPES = {
  bandits: { id: 'bandits', name: '산적 소탕', icon: '⚔' },
  escort: { id: 'escort', name: '대상 호위', icon: '🐎' },
};

let nextId = 1;

/**
 * Contract lifecycle:
 *   offered -> (taken) active -> (objective met) reported -> paid
 *                      \-> failed on deadline
 * A cleared contract still has to be carried back to whoever issued it, which
 * is what gives the map its return trips.
 */
export function generateContracts(campaign, settlement, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const c = campaign.rng.chance(60)
      ? banditContract(campaign, settlement)
      : escortContract(campaign, settlement);
    if (c) out.push(c);
  }
  return out;
}

function banditContract(campaign, settlement) {
  const world = campaign.world;
  // Only camps that actually have someone in them are worth a bounty.
  const camps = world.camps.filter((c) => campaign.bands.some((b) => b.alive && b.camp === c));
  if (!camps.length) return null;

  const near = camps
    .map((c) => ({ c, d: distance(settlement.hex, c.hex) }))
    .filter((x) => x.d <= 14)
    .sort((a, b) => a.d - b.d);
  if (!near.length) return null;

  const pick = campaign.rng.pick(near.slice(0, 4));
  const camp = pick.c;
  const band = campaign.bands.find((b) => b.alive && b.camp === camp);
  const reward = Math.round((180 + band.roster.length * 95 + pick.d * 22) * campaign.rng.float(0.9, 1.15));

  return {
    id: `k${nextId++}`,
    type: 'bandits',
    issuerId: settlement.id,
    issuerName: settlement.name,
    campId: camp.id,
    title: `${settlement.name} 인근 산적 소탕`,
    detail: `야영지의 ${band.name}(${band.roster.length}명)를 없애고 돌아와 보고할 것.`,
    reward,
    days: 12 + Math.round(pick.d * 0.8),
    issuedDay: campaign.day,
    state: 'offered',
  };
}

function escortContract(campaign, settlement) {
  const others = campaign.world.settlements.filter((s) => s !== settlement);
  if (!others.length) return null;
  const dest = campaign.rng.pick(others);
  const d = distance(settlement.hex, dest.hex);
  const reward = Math.round((120 + d * 46) * campaign.rng.float(0.9, 1.15));

  return {
    id: `k${nextId++}`,
    type: 'escort',
    issuerId: settlement.id,
    issuerName: settlement.name,
    destId: dest.id,
    destName: dest.name,
    title: `${dest.name} 까지 대상 호위`,
    detail: `${dest.name} 로 향하는 상단을 무사히 데려다줄 것. 도착하면 그 자리에서 삯을 받는다.`,
    reward,
    days: Math.max(6, Math.round(d * 1.6)),
    issuedDay: campaign.day,
    state: 'offered',
  };
}

/** Days left before a taken contract lapses; negative means it has. */
export function daysLeft(contract, day) {
  return contract.issuedDay + contract.days - day;
}

export function rewardLabel(contract) { return `${contract.reward} 크라운`; }

/** How many contracts a settlement keeps on its board. */
export function boardSize(settlement) { return SETTLEMENTS[settlement.tier].contracts; }
