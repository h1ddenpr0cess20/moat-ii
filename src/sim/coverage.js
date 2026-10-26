import { BUILDINGS, CASTLE_LEVELS } from '../catalog.js';
import { CENTER, TILES } from '../config.js';
import { idx } from '../world/world.js';
import { computeBlocks, courtyardServes } from './blocks.js';

/**
 * Who a building looks after: wells, chapels, taverns, healers, markets and
 * watchtowers each reach a circle of tiles, strongest at the middle. A house
 * counts the circles it stands in.
 */

export const COVER_KINDS = ['water', 'faith', 'cheer', 'health', 'security', 'commerce'];

/** The guard a building gives, where it is not a `serve`: radius, strength. */
const GUARD = { barracks: [16, 1], gatehouse: [12, 0.6] };

function stamp(map, cx, cy, radius, strength, size) {
  const r2 = radius * radius;
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(size - 1, Math.ceil(cy + radius)); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(size - 1, Math.ceil(cx + radius)); x++) {
      const d2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
      if (d2 > r2) continue;
      const i = idx(x, y);
      map[i] += strength * (1 - d2 / r2);
    }
  }
}

/** Works out the coverage maps, if buildings have changed since last time (or `force`). */
export function computeCoverage(game, force = false) {
  const { world } = game;
  const blocksChanged = computeBlocks(game, force);
  // How staffed the serving buildings are matters too: a tavern no one works cheers no one.
  let staff = 0;
  for (const b of world.buildings.values()) if (b.state === 'ready' && (BUILDINGS[b.type]?.serve || GUARD[b.type]) && BUILDINGS[b.type].jobs) staff = (staff * 31 + Math.round(Math.min(1, b.eff || 0) * 8)) % 1e9;
  if (!force && !blocksChanged && game.cover && game.coverVer === (world.bver ?? 0) && game.coverAle === (game.report.aleSat ?? 1) && game.coverStaff === staff) return game.cover;
  const maps = Object.fromEntries(COVER_KINDS.map((k) => [k, new Float32Array(TILES)]));
  const aleSat = game.report.aleSat ?? 1;
  for (const b of world.buildings.values()) {
    if (b.state !== 'ready') continue;
    const def = BUILDINGS[b.type];
    const cx = b.x + b.w / 2, cy = b.y + b.d / 2;
    const s = def?.serve;
    if (s) {
      // A place with staff does half its work with nobody in it, the rest as it fills.
      const staffed = def.jobs ? 0.5 + 0.5 * Math.min(1, b.eff || 0) : 1;
      for (const kind of COVER_KINDS) {
        if (!s[kind]) continue;
        // A tavern that has run out of ale cheers no one much.
        const k = kind === 'cheer' && s.ale ? 0.35 + 0.65 * aleSat : 1;
        stamp(maps[kind], cx, cy, s.radius, s[kind] * k * staffed, world.size);
      }
    }
    const g = GUARD[b.type];
    if (g) stamp(maps.security, cx, cy, g[0], g[1] * (0.5 + 0.5 * Math.min(1, b.eff || 0.5)), world.size);
  }
  // A block's heart serves every door of its ring, as strongly as the ring is built.
  for (const block of game.blocks) {
    const serves = courtyardServes(game, block);
    const reach = 0.45 + 0.55 * block.closure;
    for (const [kind, strength] of Object.entries(serves)) {
      const map = maps[kind];
      for (const t of block.ring) map[t] = Math.max(map[t], strength * reach);
      for (const t of block.core) map[t] = Math.max(map[t], strength * reach);
    }
  }
  stamp(maps.security, CENTER, CENTER, 20, 0.8 + CASTLE_LEVELS[game.castleLevel].defense / 60, world.size);
  game.cover = maps;
  game.coverVer = world.bver ?? 0;
  game.coverAle = aleSat;
  game.coverStaff = staff;
  return maps;
}

/** How much of a kind of care reaches a tile, 0 to 1. */
export const covered = (game, kind, x, y) => Math.min(1, game.cover?.[kind]?.[idx(Math.floor(x), Math.floor(y))] ?? 0);
