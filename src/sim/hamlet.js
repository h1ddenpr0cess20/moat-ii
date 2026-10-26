import { ZONE_ID } from '../catalog.js';
import { CENTER, DIRS } from '../config.js';
import { check, addBuilding, frontFor } from '../world/buildings.js';
import { network, roadBlocked } from '../world/roads.js';
import { findLot, zoneBlocked } from '../world/zoning.js';
import { idx, inb } from '../world/world.js';
import { buildRoad, buildZone, placeBuilding, rectTiles } from './actions.js';

/**
 * The lord does not start with nothing: an avenue from the castle's
 * drawbridge to the south gate, a cross street, ground zoned for houses along
 * both, three cottages, a granary and a well. A town to grow from.
 */

/** Looks outward from a spot for somewhere a building can stand (nearest first), with a road beside it if one can be had. */
export function autoPlace(game, type, cx, cy, radius = 12) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  let best = null, bestD = Infinity;
  for (let r = 0; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        for (let front = 0; front < 4; front++) {
          const c = check(game.world, type, x, y, front);
          if (!c.ok) continue;
          const f = frontFor(game.world, c.rect.x, c.rect.y, c.rect.w, c.rect.d);
          if (f !== front) continue;
          const d = Math.hypot(dx, dy);
          if (d < bestD) { bestD = d; best = { x, y, front }; }
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** Builds a road from a rectangle to the nearest connected road, by the shortest open way. Returns whether it is connected after. */
export function connect(game, rect, { free = false } = {}) {
  const { world } = game;
  const { dist } = network(world);
  const touching = (x, y) => DIRS.some(([dx, dy]) => inb(x + dx, y + dy) && dist[idx(x + dx, y + dy)] >= 0);
  const starts = [];
  for (let x = rect.x - 1; x <= rect.x + rect.w; x++) for (let y = rect.y - 1; y <= rect.y + rect.d; y++) {
    const inside = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.d;
    const corner = (x < rect.x || x >= rect.x + rect.w) && (y < rect.y || y >= rect.y + rect.d);
    if (!inside && !corner && inb(x, y)) starts.push([x, y]);
  }
  if (starts.some(([x, y]) => dist[idx(x, y)] >= 0)) return true;
  const prev = new Map();
  const queue = [];
  for (const [x, y] of starts) {
    if (roadBlocked(world, x, y) && !world.road[idx(x, y)]) continue;
    prev.set(idx(x, y), -1);
    queue.push([x, y]);
  }
  for (let q = 0; q < queue.length; q++) {
    const [x, y] = queue[q];
    if (touching(x, y) || dist[idx(x, y)] >= 0) {
      const path = [];
      for (let i = idx(x, y); i !== -1; i = prev.get(i)) path.push([i % world.size, Math.floor(i / world.size)]);
      buildRoad(game, path.filter(([px, py]) => !world.road[idx(px, py)]), 'dirt', { free });
      return true;
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inb(nx, ny) || prev.has(idx(nx, ny))) continue;
      if (roadBlocked(world, nx, ny) && !world.road[idx(nx, ny)]) continue;
      prev.set(idx(nx, ny), idx(x, y));
      queue.push([nx, ny]);
    }
  }
  return false;
}

/** The best place for the hamlet's farm: the most open, fertile ground within reach of it, and not far from the avenue. */
function farmSite(game) {
  const { world } = game;
  const C = CENTER;
  const value = (x, y) => {
    if (!inb(x, y)) return 0;
    const i = idx(x, y);
    if (zoneBlocked(world, x, y) || (world.zone[i] && world.zone[i] !== ZONE_ID.res) || world.fert[i] < 90) return 0;
    return world.tree[i] ? 0.4 : 1;
  };
  let best = null, bestScore = -Infinity;
  for (let y = C - 13; y <= C + 12; y++) {
    for (let x = C - 13; x <= C + 12; x++) {
      if (!check(world, 'farmstead', x, y, 2).ok) continue;
      const cx = x + 1.5, cy = y + 1.5;
      let n = 0;
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
        if (dx * dx + dy * dy > 56) continue;
        const tx = Math.floor(cx) + dx, ty = Math.floor(cy) + dy;
        if (tx >= x && tx < x + 3 && ty >= y && ty < y + 3) continue;
        n += value(tx, ty);
      }
      const score = n - 0.35 * Math.hypot(cx - C, cy - (C + 8));
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
  }
  return best;
}

export function seedHamlet(game) {
  const C = CENTER;
  const free = { free: true };
  buildRoad(game, rectTiles(C - 1, C + 6, C, C + 11), 'dirt', free);
  buildRoad(game, rectTiles(C - 11, C + 8, C + 10, C + 8), 'dirt', free);
  // Housing along both streets, leaving the woods standing.
  for (const [x0, y0, x1, y1] of [[C - 11, C + 9, C - 2, C + 11], [C + 1, C + 9, C + 10, C + 11], [C - 11, C + 6, C - 2, C + 7], [C + 1, C + 6, C + 10, C + 7]]) {
    buildZone(game, rectTiles(x0, y0, x1, y1).filter(([x, y]) => !game.world.tree[idx(x, y)]), 'res', free);
  }
  // The granary and the well first, then the cottages in what is left.
  const gran = autoPlace(game, 'granary', C + 3, C + 10, 6);
  if (gran) { const r = placeBuilding(game, 'granary', gran.x, gran.y, gran.front, free); if (r.building) connect(game, r.building, free); }
  const well = autoPlace(game, 'well', C - 3, C + 7, 6);
  if (well) placeBuilding(game, 'well', well.x, well.y, well.front, free);
  for (let n = 0; n < 3; n++) {
    const lot = findLot(game.world, 'res', [2, 2], game.rnd, (x, y) => -Math.hypot(x - C, y - (C + 8)) * 0.1);
    if (!lot) break;
    addBuilding(game.world, 'cottage', lot.x, lot.y, lot.front, { state: 'ready', rect: lot });
  }
  // A farm that is already working, and a woodcutter, so the first harvest is a real one.
  const site = farmSite(game);
  if (site) {
    const r = placeBuilding(game, 'farmstead', site.x, site.y, frontFor(game.world, site.x, site.y, 3, 3), free);
    if (r.building) { connect(game, r.building, free); fieldsAround(game, r.building, 34); }
  }
  let sx = 0, sy = 0, n = 0;
  for (let y = C - 12; y < C + 12; y++) for (let x = C - 12; x < C + 12; x++) { const i = idx(x, y); if (game.world.tree[i] && game.world.realm[i]) { sx += x; sy += y; n++; } }
  if (n > 8) {
    const wood = autoPlace(game, 'woodcutter', sx / n, sy / n, 10);
    if (wood) { const r = placeBuilding(game, 'woodcutter', wood.x, wood.y, wood.front, free); if (r.building) connect(game, r.building, free); }
  }
  game.weather.harvest = 1;
  game.world.bver = (game.world.bver ?? 0) + 1;
}

/** Zones `count` tiles of wheat in a clump around a farmstead: the nearest free, treeless ground first. */
export function fieldsAround(game, farm, count = 24, zone = 'wheat') {
  const { world } = game;
  const cx = farm.x + farm.w / 2, cy = farm.y + farm.d / 2;
  const chosen = [];
  const seen = new Set();
  const queue = [];
  for (let x = farm.x - 1; x <= farm.x + farm.w; x++) for (let y = farm.y - 1; y <= farm.y + farm.d; y++) queue.push([x, y]);
  while (queue.length && chosen.length < count) {
    // Open ground first, then ground that has to be cleared of trees.
    const cost = ([x, y]) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + (inb(x, y) && world.tree[idx(x, y)] ? 3 : 0);
    queue.sort((a, b) => cost(a) - cost(b));
    const [x, y] = queue.shift();
    const key = idx(x, y);
    if (!inb(x, y) || seen.has(key)) continue;
    seen.add(key);
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > 7.5) continue;
    if (zoneBlocked(world, x, y) || (world.zone[key] && world.zone[key] !== ZONE_ID.res)) continue;
    chosen.push([x, y]);
    for (const [dx, dy] of DIRS) queue.push([x + dx, y + dy]);
  }
  buildZone(game, chosen, zone, { free: true });
  return chosen.length;
}
