import { BUILDINGS, CASTLE_LEVELS, GROWN, INDUSTRY_ZONES, ZONE_ID, canPay, pay } from '../catalog.js';
import { CENTER, DIRS, GROUND } from '../config.js';
import { addBuilding } from '../world/buildings.js';
import { blocked } from '../world/roads.js';
import { findLot } from '../world/zoning.js';
import { idx, inb, touch } from '../world/world.js';
import { calendar } from './calendar.js';
import { qualityAt } from './blocks.js';
import { covered } from './coverage.js';
import { headcount, housingCap } from './people.js';
import { completeAnnex } from './actions.js';
import { toolGlut } from './economy.js';

/**
 * Things being made: the buildings the people put up on zoned land as the town
 * needs them, the crews finishing what the lord ordered, and the slow work of
 * the forest growing back.
 */

/** Builds up what is under construction, by how many hands the crews have. */
export function construction(game) {
  const { world } = game;
  for (const b of world.buildings.values()) {
    if (b.state !== 'building') continue;
    const def = BUILDINGS[b.type];
    b.progress = Math.min(1, b.progress + (b.crewK ?? 0) / def.weeks);
    if (b.progress >= 1) {
      b.state = 'ready';
      b.built = game.week;
      world.bver = (world.bver ?? 0) + 1;
      touch(world, 'buildings', b.x, b.y, b.x + b.w, b.y + b.d);
      game.stats.built++;
      game.emit('built', { building: b });
      if (!def.auto) game.note(`The ${def.name.toLowerCase()} is finished.`, 'good', [b.x + b.w / 2, b.y + b.d / 2]);
    }
  }
  const cw = game.castleWork;
  if (cw) {
    cw.progress += (cw.crewK ?? 0) / cw.weeks;
    if (cw.progress >= 1) {
      game.castleLevel = cw.level;
      game.castleWork = null;
      const castle = world.buildings.get(1);
      castle.level = game.castleLevel;
      world.bver = (world.bver ?? 0) + 1;
      touch(world, 'buildings', castle.x, castle.y, castle.x + castle.w, castle.y + castle.d, 3);
      game.emit('castle', { level: game.castleLevel });
      game.note(`The castle is a ${CASTLE_LEVELS[game.castleLevel].name} now.`, 'good', [CENTER, CENTER]);
    }
  }
  for (const w of world.wards) {
    if (!w.dig) continue;
    w.dig.progress += (w.dig.crewK ?? 0) / w.dig.weeks;
    game.emit('dig', { ward: w.id });
    if (w.dig.progress >= 1) completeAnnex(game, w);
  }
}

/** How good a spot is for a home or a shop: near what looks after it, and near the middle. */
const valueAt = (game) => (x, y) => covered(game, 'water', x, y) * 0.8 + covered(game, 'faith', x, y) * 0.6 + covered(game, 'cheer', x, y) * 0.6 + covered(game, 'commerce', x, y) * 0.5
  + covered(game, 'security', x, y) * 0.3 + qualityAt(game, x, y) * 1.4 - Math.hypot(x - CENTER, y - CENTER) * 0.025;

/** Starts a building of the zone's kind on the best plot there is. Returns it, or null. */
export function spawn(game, zone, level) {
  const { world } = game;
  const type = GROWN[zone][level - 1];
  const def = BUILDINGS[type];
  if (!canPay(game.stock, def.cost)) { game.starved = type; return null; }
  const lot = findLot(world, zone, def.size, game.rnd, valueAt(game));
  if (!lot) return null;
  pay(game.stock, def.cost);
  for (const [r, n] of Object.entries(def.cost)) game.flows.used[r] = (game.flows.used[r] ?? 0) + n;
  const { building, timber } = addBuilding(world, type, lot.x, lot.y, lot.front, { state: 'building', rect: lot });
  game.stock.wood += timber;
  return building;
}

/** One row more behind a building: for the plots that grow as the house does. Null if the land behind is not free zone. */
function extendBack(game, b, zone) {
  const { world } = game;
  const [bx, by] = DIRS[(b.front + 2) % 4];
  const tiles = [];
  if (b.front === 0 || b.front === 2) { const y = by > 0 ? b.y + b.d : b.y - 1; for (let x = b.x; x < b.x + b.w; x++) tiles.push([x, y]); }
  else { const x = bx > 0 ? b.x + b.w : b.x - 1; for (let y = b.y; y < b.y + b.d; y++) tiles.push([x, y]); }
  for (const [x, y] of tiles) {
    if (!inb(x, y)) return null;
    const i = idx(x, y);
    if (world.zone[i] !== ZONE_ID[zone] || world.bld[i] || world.road[i] || blocked(world, x, y)) return null;
  }
  return tiles;
}

/** Raises a house or shop a level, if the land and the stores allow it. */
function upgrade(game, b, zone) {
  const { world } = game;
  const order = GROWN[zone];
  const next = order[b.level];
  if (!next) return false;
  const def = BUILDINGS[next];
  const [cx, cy] = [b.x + b.w / 2, b.y + b.d / 2];
  const people = headcount(game);
  // A fine block's houses rise sooner: the lord's bar for them is lower.
  const q = qualityAt(game, cx, cy);
  const water = covered(game, 'water', cx, cy), faith = covered(game, 'faith', cx, cy), commerce = covered(game, 'commerce', cx, cy), cheer = covered(game, 'cheer', cx, cy);
  if (zone === 'res') {
    if (b.level === 1 && !(water > 0.25 && game.happiness >= 55 - 8 * q)) return false;
    if (b.level === 2 && !(water > 0.4 && faith > 0.25 && commerce > 0.15 && game.happiness >= 62 - 8 * q && people >= 80 - 25 * q)) return false;
  } else if (zone === 'croft') {
    // A smallholding grows when it is worked full and the town is big enough to buy from it.
    if ((b.eff ?? 0) < 0.9) return false;
    if (b.level === 1 && !(people >= 30 - 8 * q)) return false;
    if (b.level === 2 && !(people >= 90 - 25 * q && (water > 0.15 || commerce > 0.1))) return false;
  } else if (zone === 'craft') {
    if ((b.eff ?? 0) < 0.9) return false;
    if (b.level === 1 && !(people >= 40 - 10 * q && commerce + water > 0.1)) return false;
    if (b.level === 2 && !(people >= 110 - 25 * q && commerce > 0.3 && game.stock.iron >= 10)) return false;
  } else {
    if (b.level === 1 && !(people >= 25 && (commerce > 0.1 || cheer > 0.1 || water > 0.2))) return false;
    if (b.level === 2 && !(people >= 110 && commerce > 0.4 && game.happiness >= 58)) return false;
  }
  if (!canPay(game.stock, def.cost)) return false;
  let extra = null;
  const [w1, d1] = BUILDINGS[b.type].size, [w2, d2] = def.size;
  if (d2 > d1 || w2 > w1) { extra = extendBack(game, b, zone); if (!extra) return false; }
  pay(game.stock, def.cost);
  for (const [r, n] of Object.entries(def.cost)) game.flows.used[r] = (game.flows.used[r] ?? 0) + n;
  if (extra) {
    for (const [x, y] of extra) world.bld[idx(x, y)] = b.id;
    const x0 = Math.min(b.x, ...extra.map((t) => t[0])), y0 = Math.min(b.y, ...extra.map((t) => t[1]));
    const x1 = Math.max(b.x + b.w, ...extra.map((t) => t[0] + 1)), y1 = Math.max(b.y + b.d, ...extra.map((t) => t[1] + 1));
    Object.assign(b, { x: x0, y: y0, w: x1 - x0, d: y1 - y0 });
  }
  b.type = next;
  b.level = def.level;
  b.state = 'building';
  b.progress = 0;
  b.upgrading = true;
  world.bver = (world.bver ?? 0) + 1;
  touch(world, ['buildings', 'flat'], b.x, b.y, b.x + b.w, b.y + b.d);
  return true;
}

/** The town grows where the lord has zoned: houses when there are not enough, shops when the people want them. */
export function grow(game) {
  const { world } = game;
  const people = headcount(game);
  const cap = housingCap(game);
  game.starved = null;

  const wantHomes = cap < people + 6 + people * 0.12;
  if (wantHomes) {
    let n = 0;
    while (n < 2 && housingCap(game) < people + 6 + people * 0.12 + n && spawn(game, 'res', 1)) n++;
  }
  // Shops follow the people: when the town could spend more than the shops can sell.
  const demand = people * 0.06;
  let supply = 0;
  for (const b of world.buildings.values()) { const s = BUILDINGS[b.type]?.shop; if (s) supply += s; }
  if (people >= 15 && supply < demand * 1.25) spawn(game, 'market', 1);

  // Industry, where it is zoned. Work follows the idle: when hands are wanting work, smallholdings and workshops go up,
  // the smallholdings first while food is short. A croft also goes up when the town wants both homes and food, for the
  // family on it lives there; a workshop when the town is running out of tools. What is going up already counts.
  if (people >= 12) {
    const idle = game.report.idle ?? 0;
    let coming = 0, going = 0, idleShops = 0;
    for (const b of world.buildings.values()) {
      if (!INDUSTRY_ZONES.includes(BUILDINGS[b.type]?.auto)) continue;
      if (b.state === 'ready' && BUILDINGS[b.type].auto === 'craft' && (b.eff ?? 0) < 0.8) idleShops++;
      if (b.state !== 'building') continue;
      coming += BUILDINGS[b.type].jobs ?? 0;
      going++;
    }
    const hungry = (game.report.foodSupport ?? 0) < people * 1.3;
    const want = [];
    // A town with tools piling up wants its idle on the land rather than at another bench.
    const glut = toolGlut(game);
    if (idle - coming >= 2) want.push(...(hungry || glut ? ['croft', 'craft'] : ['craft', 'croft']));
    else if (going < 2) {
      if (hungry && wantHomes) want.push('croft');
      // Not while the workshops there are short of hands: another would only share them out thinner.
      if (game.stock.tools < 3 + people * 0.04 && !idleShops) want.push('craft');
    }
    for (const zone of want) if (spawn(game, zone, 1)) break;
  }

  // And what is already there gets better.
  if (game.week % 2 === 0) {
    const candidates = [...world.buildings.values()].filter((b) => b.state === 'ready' && BUILDINGS[b.type]?.auto && GROWN[BUILDINGS[b.type].auto][b.level]);
    // A bigger town has more to improve: one more try for every two dozen that could rise.
    for (let n = 0; n < 1 + Math.floor(candidates.length / 24) && candidates.length; n++) {
      const b = candidates.splice(Math.floor(game.rnd() * candidates.length), 1)[0];
      upgrade(game, b, BUILDINGS[b.type].auto);
    }
  }

  // The forest grows back.
  const cal = calendar(game.week);
  if (cal.season <= 1) {
    for (let n = 0; n < 6; n++) {
      const x = Math.floor(game.rnd() * world.size), y = Math.floor(game.rnd() * world.size);
      const i = idx(x, y);
      if (world.tree[i] > 0 && world.tree[i] < 3) {
        world.tree[i]++;
        touch(world, 'trees', x, y);
      } else if (world.tree[i] > 0 && game.rnd() < 0.25) {
        // Seed spreads to a neighbor.
        const [dx, dy] = DIRS[Math.floor(game.rnd() * 4)];
        const nx = x + dx, ny = y + dy;
        if (inb(nx, ny)) {
          const j = idx(nx, ny);
          if (!world.tree[j] && world.ground[j] === GROUND.GRASS && !world.bld[j] && !world.road[j] && !world.zone[j] && !world.moat[j] && (!world.realm[j] || game.rnd() < 0.3)) { world.tree[j] = 1; touch(world, 'trees', nx, ny); }
        }
      }
    }
  }
}
