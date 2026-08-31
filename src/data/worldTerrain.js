/**
 * Overworld terrain. `travel` is the hours a company needs to cross one tile;
 * `biome` is the battlefield generated when a fight starts on that tile.
 * `blend` works as on the battlefield: higher numbers feather into neighbours.
 */
export const WORLD_TERRAIN = {
  ocean:    { id: 'ocean', blend: 6,    name: '바다',   travel: 0,   passable: false, biome: 'plains', color: '#1d3247', color2: '#22394f' },
  shallows: { id: 'shallows', blend: 6, name: '얕은 바다', travel: 0, passable: false, biome: 'plains', color: '#26455e', color2: '#2c4f6a' },
  beach:    { id: 'beach', blend: 5,    name: '해안',   travel: 4,   passable: true,  biome: 'plains', color: '#8a7c56', color2: '#95875e' },
  plains:   { id: 'plains', blend: 2,   name: '평원',   travel: 4,   passable: true,  biome: 'plains', color: '#5c6b3c', color2: '#667544' },
  farmland: { id: 'farmland', blend: 4, name: '농지',   travel: 3,   passable: true,  biome: 'plains', color: '#77743c', color2: '#827f45' },
  forest:   { id: 'forest', blend: 2,   name: '숲',     travel: 6,   passable: true,  biome: 'forest', color: '#31462a', color2: '#385031' },
  hills:    { id: 'hills', blend: 1,    name: '구릉',   travel: 6,   passable: true,  biome: 'hills',  color: '#6b6242', color2: '#776d4a' },
  mountain: { id: 'mountain', blend: 0, name: '산악',   travel: 11,  passable: true,  biome: 'hills',  color: '#5a5750', color2: '#66635b' },
  peak:     { id: 'peak', blend: 0,     name: '고봉',   travel: 0,   passable: false, biome: 'hills',  color: '#8d8b85', color2: '#9b9992' },
  swamp:    { id: 'swamp', blend: 5,    name: '습지',   travel: 8,   passable: true,  biome: 'swamp',  color: '#3f4a35', color2: '#47533c' },
  steppe:   { id: 'steppe', blend: 3,   name: '초원',   travel: 4,   passable: true,  biome: 'plains', color: '#6d6b3f', color2: '#787647' },
};

/** Roads cut travel time; this is the multiplier applied to a tile's cost. */
export const ROAD_SPEEDUP = 0.5;

export function worldTerrain(id) { return WORLD_TERRAIN[id] || WORLD_TERRAIN.plains; }

/**
 * Settlement tiers. Bigger places carry more contracts and better gear, and
 * are what a company retreats to when it needs to lick its wounds.
 */
export const SETTLEMENTS = {
  village: { id: 'village', name: '마을',   size: 1, contracts: 1, color: '#c8a24a' },
  town:    { id: 'town',    name: '읍',     size: 2, contracts: 2, color: '#d8b45a' },
  city:    { id: 'city',    name: '도시',   size: 3, contracts: 3, color: '#e8c86a' },
};

const VILLAGE_NAMES = ['라이헨바흐', '슈타인탈', '아이헨호프', '묄른', '그라우부르크', '힌터발트',
  '로텐펠트', '노이도르프', '칼텐브룬', '자우어아우', '비젠그룬트', '펠젠슈타인', '도른하임',
  '에셴바흐', '모어호프', '킬베르크', '자넨탈', '트로켄펠트', '레벤스브뤼크', '아셴탈'];

export function settlementName(rng, used) {
  const free = VILLAGE_NAMES.filter((n) => !used.has(n));
  const pick = free.length ? rng.pick(free) : `${rng.pick(VILLAGE_NAMES)} ${used.size}`;
  used.add(pick);
  return pick;
}
