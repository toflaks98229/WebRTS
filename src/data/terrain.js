/**
 * Terrain definitions. `moveCost` / `moveFatigue` are paid per tile entered.
 * Height is a separate per-tile value on the grid, not a property of the cover.
 *
 * `blend` decides which ground bleeds over which at a hex boundary: a neighbour
 * with a higher number feathers into this tile. Water creeps onto its shore,
 * mud onto grass, and nothing at all creeps onto bare rock.
 */
export const TERRAIN = {
  road:   { id: 'road', blend: 4,   name: '길',       moveCost: 2, moveFatigue: 2, cover: 0,  blocksLOS: false, passable: true,  color: '#6b6152', color2: '#7a7062' },
  grass:  { id: 'grass', blend: 2,  name: '평지',     moveCost: 3, moveFatigue: 3, cover: 0,  blocksLOS: false, passable: true,  color: '#4a5c3a', color2: '#55693f' },
  dirt:   { id: 'dirt', blend: 4,   name: '흙바닥',   moveCost: 3, moveFatigue: 3, cover: 0,  blocksLOS: false, passable: true,  color: '#5a4d3c', color2: '#665847' },
  forest: { id: 'forest', blend: 2, name: '숲',       moveCost: 4, moveFatigue: 5, cover: 15, blocksLOS: true,  passable: true,  color: '#2f4429', color2: '#37502f' },
  swamp:  { id: 'swamp', blend: 5,  name: '늪',       moveCost: 5, moveFatigue: 7, cover: 0,  blocksLOS: false, passable: true,  color: '#3b4436', color2: '#454f3d', penalty: { meleeDefense: -10, rangedDefense: -10 } },
  hill:   { id: 'hill', blend: 1,   name: '언덕',     moveCost: 4, moveFatigue: 5, cover: 0,  blocksLOS: false, passable: true,  color: '#6a6144', color2: '#79704f' },
  rock:   { id: 'rock', blend: 0,   name: '바위',     moveCost: 0, moveFatigue: 0, cover: 0,  blocksLOS: true,  passable: false, color: '#4b4b4f', color2: '#5a5a5f' },
  water:  { id: 'water', blend: 6,  name: '물',       moveCost: 0, moveFatigue: 0, cover: 0,  blocksLOS: false, passable: false, color: '#2b3f52', color2: '#33495e' },
};

export function terrain(id) { return TERRAIN[id] || TERRAIN.grass; }
