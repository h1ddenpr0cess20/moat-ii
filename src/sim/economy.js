import { BUILDINGS, CASTLE_LEVELS, FARM_RADIUS, FARM_ZONES, FOODS, FOOD_PER_PERSON, FOOD_SPLIT, FUEL_PER_PERSON, GOODS, INDUSTRY_ZONES, RESOURCES, ZONE_ID } from '../catalog.js';
import { GROUND, TILES, WEEKS_PER_YEAR } from '../config.js';
import { clamp, lerp } from '../rng.js';
import { blockAt, computeBlocks, qualityAt } from './blocks.js';
import { calendar, coldness } from './calendar.js';
import { weeksToHarvest } from './people.js';
import { countNear, needsRoad } from '../world/buildings.js';
import { accessOf, network, rootTiles, walkRoads } from '../world/roads.js';
import { coreTiles } from '../world/zoning.js';
import { idx, touch } from '../world/world.js';
import { PRICES } from './state.js';

/**
 * The week's work: who is where, what they make, what everyone uses, what
 * goes off, and the coin that comes in and goes out. Nothing here draws.
 */

/** The share of grown adults who can work. */
const FIT = 0.9;
/** The most of the workforce that building crews may take. */
const CREW_SHARE = 0.55;
/** The share of the workforce always held for building sites, if there are any. */
const CREW_FLOOR = 0.3;
/** Field tiles one farmhand looks after, and how many a farmstead can hold. */
export const TILES_PER_HAND = 8;
/** Fruit a tile of orchard gives in a year, at the best soil: more than a garden bed, for the trees cost more to plant. */
const ORCHARD_YIELD = 14;
/** Wood in one level of a tile's trees. */
const WOOD_PER_TREE = 14;

const spend = (game, res, n) => { game.stock[res] -= n; game.flows.used[res] = (game.flows.used[res] ?? 0) + n; };
const gain = (game, res, n) => { game.stock[res] += n; game.flows.made[res] = (game.flows.made[res] ?? 0) + n; };

/** How much each kind of store holds. */
export function capacity(game) {
  const base = CASTLE_LEVELS[game.castleLevel].store;
  let food = base.food, goods = base.goods;
  for (const b of game.world.buildings.values()) {
    if (b.state !== 'ready') continue;
    const s = BUILDINGS[b.type]?.store;
    if (!s) continue;
    food += s.food ?? 0;
    goods += s.goods ?? 0;
  }
  return { food, goods };
}

export const capFor = (cap, res) => (RESOURCES[res].store === 'food' ? cap.food : RESOURCES[res].store === 'goods' ? cap.goods : Infinity);

const centerOf = (b) => [b.x + b.w / 2, b.y + b.d / 2];

/** Which of the buildings has a road to the castle, and how far its goods must go to a store. Kept until roads or buildings change. */
export function refresh(game, force = false) {
  const { world } = game;
  const ver = `${world.bver ?? 0}:${world.netVersion ?? 0}`;
  if (!force && game.refreshVer === ver) return;
  game.refreshVer = ver;
  network(world);
  const sources = [...rootTiles()];
  for (const b of world.buildings.values()) {
    if (b.state !== 'ready' || (b.type !== 'granary' && b.type !== 'storehouse')) continue;
    const a = accessOf(world, b.x, b.y, b.w, b.d);
    if (a) sources.push([a.x, a.y]);
  }
  game.store = walkRoads(world, sources);
  computeBlocks(game);
  for (const b of world.buildings.values()) {
    if (b.type === 'castle') { b.connected = true; b.haul = 0; continue; }
    let a = accessOf(world, b.x, b.y, b.w, b.d);
    // The heart of a block touches no street of its own: the block's streets reach it, if they join the castle's roads.
    if (!a) {
      const block = blockAt(game, b.x + b.w / 2, b.y + b.d / 2);
      if (block?.connected) a = accessOf(world, block.x0, block.y0, block.x1 - block.x0 + 1, block.y1 - block.y0 + 1);
    }
    b.access = a;
    b.connected = Boolean(a) || !needsRoad(b);
    b.haul = a ? Math.max(0, game.store[idx(a.x, a.y)] >= 0 ? game.store[idx(a.x, a.y)] : a.d) : 99;
  }
  // Housing that people can live in: ready, and a road reaches it.
  world.housing = [...world.buildings.values()].filter((b) => BUILDINGS[b.type]?.cap && b.state === 'ready');
}

/** How much of what a building makes gets as far as a store: the further it is, the less. A granary or storehouse nearby is a store. */
export const haulK = (b) => clamp(1.1 - (b.haul ?? 0) / 100, 0.7, 1);

/** Which fields each farmstead tends: the nearest first, as many as its hands can look after. */
export function assignFields(game) {
  const { world } = game;
  const farms = [...world.buildings.values()].filter((b) => b.type === 'farmstead' && b.state === 'ready' && b.connected);
  for (const f of farms) { f.fields = []; f.cx = f.x + f.w / 2; f.cy = f.y + f.d / 2; }
  const ids = new Set(FARM_ZONES.map((z) => ZONE_ID[z]));
  const cap = BUILDINGS.farmstead.jobs * TILES_PER_HAND;
  game.untended = 0;
  game.fieldTiles = 0;
  for (let i = 0; i < TILES; i++) {
    if (!ids.has(world.zone[i]) || world.bld[i] || !world.realm[i]) continue;
    game.fieldTiles++;
    const x = i % world.size + 0.5, y = Math.floor(i / world.size) + 0.5;
    const options = farms.map((f) => [f, (x - f.cx) ** 2 + (y - f.cy) ** 2]).filter(([, d]) => d <= FARM_RADIUS * FARM_RADIUS).sort((a, b) => a[1] - b[1]);
    const home = options.find(([f]) => f.fields.length < cap);
    if (home) home[0].fields.push(i);
    else game.untended++;
  }
  for (const f of farms) f.jobs = Math.max(1, Math.ceil(f.fields.length / TILES_PER_HAND));
}

export const jobsOf = (b) => (b.type === 'farmstead' ? (b.jobs ?? 1) : BUILDINGS[b.type]?.jobs ?? 0);
/** Would the food in store last to the harvest after next, even if this year's failed? Then the fields need not come first. */
const fedAhead = (game) => {
  const people = game.pop.children + game.pop.adults + game.pop.elders;
  const stock = FOODS.reduce((n, f) => n + game.stock[f] * RESOURCES[f].value, 0);
  return stock >= people * FOOD_PER_PERSON * (weeksToHarvest(game.week) + WEEKS_PER_YEAR);
};

/** Are there tools enough in store that the benches can stand idle? */
export const toolGlut = (game) => game.stock.tools > 30 + (game.pop.children + game.pop.adults + game.pop.elders) * 0.3;

export const priorityOf = (game, type) => {
  if (game.prio[type] !== undefined) return game.prio[type];
  // A town short of timber needs its woodcutters before almost anything.
  if ((type === 'woodcutter' || type === 'forester') && game.stock.wood < 70) return 3;
  // The fields lie fallow through the winter: the farmhands go to the woods and the quarries, and only the flocks want them.
  if (type === 'farmstead' && calendar(game.week).season === 3) return 1;
  // With the tool racks full, the smiths and carpenters' hands are better spent elsewhere.
  if (BUILDINGS[type]?.work?.out?.tools && toolGlut(game)) return 1;
  // Smallholdings feed the town: they are food, whatever shelf they sit on. A town with its granaries full can spare
  // the hands, though, and they share out with everyone else.
  const food = BUILDINGS[type]?.cat === 'food' || BUILDINGS[type]?.work?.kind === 'grow';
  return food && !fedAhead(game) ? 3 : 2;
};

/** How much a fine block lifts the trades in its ring: up to a quarter more from its workshops and smallholdings. */
const tradeK = (game, b) => (INDUSTRY_ZONES.includes(BUILDINGS[b.type]?.auto) ? 1 + 0.25 * qualityAt(game, b.x + b.w / 2, b.y + b.d / 2) : 1);

/** What a smallholding brings in a week, at its staffing: each good of its yields, before the season. */
function growYield(game, b, season) {
  const w = BUILDINGS[b.type].work;
  const soil = 0.55 + 0.6 * (game.world.fert[idx(Math.floor(b.x + b.w / 2), Math.floor(b.y + b.d / 2))] / 255);
  const k = b.workers * (w.season?.[season] ?? 1) * soil * haulK(b) * tradeK(game, b);
  return Object.fromEntries(Object.entries(w.yields).map(([r, n]) => [r, n * k]));
}

/**
 * Shares out the people: the garrison first, then the workplaces of the
 * highest priority (food, unless the lord says otherwise), then the building
 * crews (up to just over half of what is left), then the rest by priority,
 * the same share to each of equal priority. Fills in each building's
 * `workers` and `eff`, and each site's `crewK`.
 */
export function allocate(game) {
  const { world } = game;
  const workforce = game.pop.adults * FIT;
  let labor = workforce;
  let employed = 0;

  const castle = world.buildings.get(1);
  const garrison = CASTLE_LEVELS[game.castleLevel].jobs;
  const got = Math.min(labor, garrison);
  castle.workers = got;
  castle.eff = garrison ? got / garrison : 1;
  labor -= got;
  employed += got;

  const places = [];
  for (const b of world.buildings.values()) {
    if (b.type !== 'castle') { b.workers = 0; b.eff = 0; }
    const jobs = jobsOf(b);
    if (b.type === 'castle' || b.state !== 'ready' || !jobs || !b.connected) continue;
    places.push({ b, jobs, prio: priorityOf(game, b.type) });
  }
  let open = 0;
  const staff = (prio) => {
    const level = places.filter((p) => p.prio === prio);
    const need = level.reduce((n, p) => n + p.jobs, 0);
    if (!need) return;
    const share = Math.min(1, labor / need);
    for (const p of level) { p.b.workers = p.jobs * share; p.b.eff = share; }
    labor -= need * share;
    employed += need * share;
    open += need * (1 - share);
  };
  // Builders are never left out: a third of the hands are held back for the sites, whatever else is short.
  let wanted = 0;
  for (const w of world.wards) if (w.dig) wanted += w.dig.crew;
  if (game.castleWork) wanted += game.castleWork.crew;
  for (const b of world.buildings.values()) if (b.state === 'building') wanted += BUILDINGS[b.type].crew;
  const reserve = Math.min(wanted, labor, workforce * CREW_FLOOR);
  labor -= reserve;
  staff(3);
  labor += reserve;

  // Crews work one site at a time, in the order the work was given: the moat first, then the castle, then the buildings.
  let budget = Math.min(labor, workforce * CREW_SHARE);
  let crewGiven = 0;
  const crew = (site, need) => {
    const take = Math.min(need, budget);
    budget -= take;
    crewGiven += take;
    site.crewK = need ? take / need : 0;
  };
  for (const w of world.wards) if (w.dig) crew(w.dig, w.dig.crew);
  if (game.castleWork) crew(game.castleWork, game.castleWork.crew);
  for (const b of world.buildings.values()) if (b.state === 'building') crew(b, BUILDINGS[b.type].crew);
  labor -= crewGiven;
  employed += crewGiven;

  staff(2);
  staff(1);
  game.report.workforce = workforce;
  game.report.employed = employed;
  game.report.idle = Math.max(0, labor);
  game.report.jobsOpen = open;
}

function sourceTiles(world, b, from, radius) {
  const [cx, cy] = centerOf(b);
  const out = [];
  const test = from === 'trees' ? (i) => world.tree[i] > 0 && world.realm[i]
    // Woodcutters fell grown trees and leave the saplings standing, so a wood that is tended grows back.
    : from === 'timber' ? (i) => world.tree[i] > 1 && world.realm[i]
    : from === 'rock' ? (i) => world.ground[i] === GROUND.ROCK && world.amount[i] > 0 && world.realm[i]
      : from === 'ore' ? (i) => world.ground[i] === GROUND.ORE && world.amount[i] > 0 && world.realm[i]
        : (i) => world.ground[i] === GROUND.WATER || world.moat[i] === 1;
  countNear(world, cx, cy, radius, (i) => { if (test(i)) out.push(i); return false; });
  return out;
}

/** A forester's week: young trees on open ground within reach, and the ones already there brought on a level. */
function plant(game, b, w, season) {
  const { world } = game;
  const [cx, cy] = centerOf(b);
  const free = [], young = [];
  const r = w.radius;
  for (let y = Math.max(1, Math.floor(cy - r)); y <= Math.min(world.size - 2, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(1, Math.floor(cx - r)); x <= Math.min(world.size - 2, Math.ceil(cx + r)); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
      const i = idx(x, y);
      if (!world.realm[i]) continue;
      if (world.tree[i] > 0 && world.tree[i] < 3) { young.push(i); continue; }
      if (world.tree[i] || world.ground[i] !== GROUND.GRASS || world.bld[i] || world.road[i] || world.zone[i] || (game.blockOf && game.blockOf[i] >= 0)) continue;
      // Leave a margin of open ground beside every wall, so that what is planted never shuts a building in.
      let crowded = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (world.bld[idx(x + dx, y + dy)]) { crowded = true; break; }
      if (!crowded) free.push(i);
    }
  }
  b.sow = (b.sow ?? 0) + w.plant * b.workers * season;
  b.tendAcc = (b.tendAcc ?? 0) + w.tend * b.workers * season;
  let planted = 0;
  while (b.sow >= 1 && free.length) {
    b.sow -= 1;
    const k = Math.floor(game.rnd() * free.length);
    const i = free.splice(k, 1)[0];
    world.tree[i] = 1;
    touch(world, 'trees', i % world.size, Math.floor(i / world.size));
    planted++;
  }
  while (b.tendAcc >= 1 && young.length) {
    b.tendAcc -= 1;
    const k = Math.floor(game.rnd() * young.length);
    const i = young[k];
    world.tree[i]++;
    if (world.tree[i] >= 3) young.splice(k, 1);
    touch(world, 'trees', i % world.size, Math.floor(i / world.size));
  }
  if (!free.length && b.sow > 1) b.sow = 1;
  b.note = season <= 0 ? 'Resting through the winter' : free.length || young.length || planted ? 'Tending the young woods' : 'No open ground left to plant';
}

function work(game) {
  const { world } = game;
  const cal = calendar(game.week);
  const mood = 0.85 + 0.3 * clamp(game.happiness / 100);
  const hasTools = game.stock.tools > 0;
  let toolUse = 0;

  for (const b of world.buildings.values()) {
    const def = BUILDINGS[b.type];
    const w = def?.work;
    b.note = '';
    if (b.state !== 'ready' || !w) continue;
    if (!b.connected) { b.note = 'No road reaches it'; continue; }
    if (b.workers <= 0.01) { b.note = jobsOf(b) ? 'No one to work it' : ''; continue; }

    if (w.kind === 'gather') {
      const felling = w.from === 'trees' && w.res === 'wood';
      const tiles = sourceTiles(world, b, felling ? 'timber' : w.from, w.radius);
      let supply = 1;
      if (w.from === 'water') supply = Math.min(1, tiles.length / 14);
      else if (w.from === 'trees' && w.res === 'meat') supply = Math.min(1, tiles.length / 30);
      else if (!tiles.length) supply = 0;
      if (supply <= 0) { b.note = felling && sourceTiles(world, b, 'trees', w.radius).length ? 'Waiting for the young trees to grow' : w.from === 'trees' ? 'No trees in reach' : w.from === 'rock' ? 'The rock is worked out' : w.from === 'ore' ? 'The ore is worked out' : 'No water in reach'; continue; }
      let fuelK = 1;
      if (w.fuel) {
        const need = w.fuel * b.eff;
        fuelK = need > 0 ? Math.min(1, game.stock.wood / need) : 1;
        if (fuelK < 1) b.note = 'Short of fuel';
        spend(game, 'wood', need * fuelK);
      }
      const toolK = w.tools ? (hasTools ? 1 : 0.6) : 1;
      if (w.tools) toolUse += b.workers * 0.012;
      const out = w.rate * b.workers * (w.season?.[cal.season] ?? 1) * toolK * haulK(b) * mood * supply * fuelK;
      gain(game, w.res, out);
      b.acc = (b.acc ?? 0) + out;
      if (felling) {
        while (b.acc >= WOOD_PER_TREE && tiles.length) {
          b.acc -= WOOD_PER_TREE;
          const k = Math.floor(game.rnd() * tiles.length);
          const i = tiles[k];
          world.tree[i]--;
          if (world.tree[i] <= 1) tiles.splice(k, 1);
          touch(world, ['trees', 'ground'], i % world.size, Math.floor(i / world.size));
        }
      } else if (w.from === 'rock' || w.from === 'ore') {
        while (b.acc >= 8 && tiles.length) {
          b.acc -= 8;
          const i = tiles[Math.floor(game.rnd() * tiles.length)];
          world.amount[i] = Math.max(0, world.amount[i] - 8);
          if (world.amount[i] === 0) { world.ground[i] = GROUND.GRASS; touch(world, ['ground', 'terrain'], i % world.size, Math.floor(i / world.size), i % world.size, Math.floor(i / world.size), 2); }
        }
      } else {
        b.acc = 0;
      }
      if (!b.note) b.note = 'At work';
    } else if (w.kind === 'grow') {
      const weather = cal.season === 2 ? game.weather.harvest : 1;
      for (const [r, n] of Object.entries(growYield(game, b, cal.season))) gain(game, r, n * mood * (FOODS.includes(r) ? weather : 1));
      b.note = cal.season === 3 ? 'Mending fences through the winter' : 'At work';
    } else if (w.kind === 'plant') {
      plant(game, b, w, [1, 0.7, 0.8, 0][cal.season] * haulK(b) * mood);
    } else if (w.kind === 'make') {
      let ratio = b.eff * haulK(b) * mood * tradeK(game, b);
      let wait = '';
      for (const [r, n] of Object.entries(w.in)) {
        const k = game.stock[r] / n;
        if (k < ratio) { ratio = Math.max(0, k); wait = `Waiting for ${RESOURCES[r].name.toLowerCase()}`; }
      }
      const cap = game.cap;
      for (const r of Object.keys(w.out)) if (game.stock[r] >= capFor(cap, r) * 0.95) { ratio = 0; wait = `${RESOURCES[r].name} stores are full`; }
      // No more tools than the town can wear out: the timber and iron are worth more as they are.
      if (w.out.tools && toolGlut(game)) { ratio = 0; wait = 'Tools enough in store'; }
      if (w.fuel && ratio > 0) {
        const need = w.fuel * ratio;
        if (game.stock.wood < need) { ratio *= game.stock.wood / need; wait = 'Short of fuel'; }
        spend(game, 'wood', w.fuel * ratio);
      }
      for (const [r, n] of Object.entries(w.in)) spend(game, r, n * ratio);
      for (const [r, n] of Object.entries(w.out)) gain(game, r, n * ratio);
      b.note = wait || 'At work';
    }
  }
  if (toolUse) spend(game, 'tools', Math.min(game.stock.tools, toolUse));
}

/** Fields: sown in spring, growing through the summer, reaped in the autumn; pasture gives all year. */
function farm(game) {
  const { world } = game;
  const cal = calendar(game.week);
  const mood = 0.85 + 0.3 * clamp(game.happiness / 100);
  const weatherK = game.weather.harvest;
  const growing = cal.season <= 1;
  for (const f of world.buildings.values()) {
    if (f.type !== 'farmstead' || f.state !== 'ready' || !f.fields) continue;
    const tended = Math.min(f.fields.length, Math.round(f.workers * TILES_PER_HAND + 0.001));
    f.tended = tended;
    // The hands it had while the fields were worked: what the winter's reckoning of next year's crop goes by.
    if (cal.season !== 3) f.fieldHands = f.workers;
    f.note = cal.season === 3 ? 'The fields lie fallow for the winter' : f.workers > 0.01 ? (tended < f.fields.length ? `${f.fields.length - tended} fields lie untended` : 'At work') : 'No one to work it';
    for (let n = 0; n < f.fields.length; n++) {
      const i = f.fields[n];
      const zone = world.zone[i];
      const soil = 0.35 + 0.9 * (world.fert[i] / 255);
      const on = n < tended;
      if (zone === ZONE_ID.pasture) {
        if (!on) continue;
        gain(game, 'wool', 3.0 * soil / WEEKS_PER_YEAR * haulK(f) * mood);
        if (cal.season === 2) gain(game, 'meat', 1.5 * soil / 12 * haulK(f) * mood * weatherK);
        world.crop[i] = Math.min(255, world.crop[i] + 6);
        continue;
      }
      if (growing) {
        if (on) world.crop[i] = Math.min(255, world.crop[i] + 255 / 24);
      } else if (cal.season === 2 && on) {
        const ripe = world.crop[i] / 255;
        const share = ripe / 12 * haulK(f) * mood * weatherK;
        if (zone === ZONE_ID.wheat) gain(game, 'grain', 10 * soil * share);
        else if (zone === ZONE_ID.veg) gain(game, 'produce', 11 * soil * share);
        else if (zone === ZONE_ID.orchard) gain(game, 'produce', ORCHARD_YIELD * soil * share);
      }
    }
  }
  // The turn of the year clears the fields for sowing.
  if (cal.inYear === 36) {
    for (const f of world.buildings.values()) if (f.fields) for (const i of f.fields) if (world.zone[i] !== ZONE_ID.pasture) world.crop[i] = 0;
    touch(world, 'flat', 0, 0, world.size, world.size, 0);
  }
  // Kitchen gardens: the land behind the houses.
  if (game.week % 4 === 0 || game.gardens === undefined) {
    const cores = coreTiles(world);
    const kept = [];
    let n = 0;
    for (const i of cores) {
      const x = i % world.size, y = Math.floor(i / world.size);
      let near = false;
      for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) {
        const b = world.buildings.get(world.bld[idx(Math.max(0, Math.min(world.size - 1, x + dx)), Math.max(0, Math.min(world.size - 1, y + dy)))]);
        if (b && BUILDINGS[b.type]?.cap && b.state === 'ready') { near = true; break; }
      }
      if (near) { n++; kept.push(i); }
    }
    const same = world.cores && world.cores.size === kept.length && kept.every((i) => world.cores.has(i));
    if (!same) {
      world.cores = new Set(kept);
      touch(world, 'flat', 0, 0, world.size, world.size, 0);
    }
    game.gardens = n;
  }
  if (cal.season <= 2) gain(game, 'produce', game.gardens * 0.1 * mood * (cal.season === 0 ? 0.4 : 1));
}

/** The people eat: a week's food from the three kinds, the quickest to spoil first. */
function eat(game, people) {
  const need = people * FOOD_PER_PERSON;
  const take = { staple: 0, produce: 0, protein: 0 };
  const order = ['produce', 'fish', 'bread', 'meat', 'grain'].filter((r) => FOODS.includes(r));
  const supply = (group) => FOODS.filter((r) => RESOURCES[r].group === group).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const draw = (group, want) => {
    let got = 0;
    for (const r of supply(group)) {
      if (got >= want - 1e-9) break;
      const value = RESOURCES[r].value;
      const units = Math.min(game.stock[r], (want - got) / value);
      if (units <= 0) continue;
      spend(game, r, units);
      got += units * value;
    }
    return got;
  };
  let eaten = 0;
  for (const [group, share] of Object.entries(FOOD_SPLIT)) {
    take[group] = draw(group, need * share);
    eaten += take[group];
  }
  // What one kind could not give, another may.
  for (const group of ['staple', 'produce', 'protein']) {
    if (eaten >= need - 1e-9) break;
    const more = draw(group, need - eaten);
    take[group] += more;
    eaten += more;
  }
  let groups = 0;
  for (const [group, share] of Object.entries(FOOD_SPLIT)) if (take[group] >= need * share * 0.45) groups++;
  return { sat: need > 0 ? clamp(eaten / need) : 1, groups, need };
}

/** What the steward pays a carter for grain when the stores are bare: well over what a merchant asks. */
export const RELIEF_PRICE = 2;

/**
 * When the stores are all but empty and the treasury is not, the steward
 * sends for grain from the next county (and for firewood, in the cold):
 * enough for six weeks, at a hard price, once a month at most. A town should
 * not starve or freeze with gold in the keep.
 */
export function relief(game) {
  const people = game.pop.children + game.pop.adults + game.pop.elders;
  if (!people) return;
  const cold = coldness(game.week);
  const burn = people * lerp(FUEL_PER_PERSON.mild, FUEL_PER_PERSON.cold, Math.max(cold, coldness(game.week + 4)));
  if (game.week >= (game.nextFirewood ?? 0) && game.stock.wood < burn * 2) {
    const price = PRICES.wood * RELIEF_PRICE;
    const n = Math.floor(Math.min(burn * 6, (game.stock.gold - 20) / price, capFor(game.cap ?? capacity(game), 'wood') - game.stock.wood));
    if (n >= 5) {
      spend(game, 'gold', n * price);
      gain(game, 'wood', n);
      game.nextFirewood = game.week + 4;
      game.note(`The woodpile was all but gone: your steward bought ${n} timber for ${Math.round(n * price)} gold. A woodcutter would be cheaper.`, 'info');
    }
  }
  if (game.week < (game.nextRelief ?? 0)) return;
  const need = people * FOOD_PER_PERSON;
  const stock = FOODS.reduce((n, f) => n + game.stock[f] * RESOURCES[f].value, 0);
  if (stock >= need * 2) return;
  const price = PRICES.grain * RELIEF_PRICE;
  const room = capFor(game.cap ?? capacity(game), 'grain') - FOODS.reduce((n, f) => n + game.stock[f], 0);
  const n = Math.floor(Math.min(need * 6, (game.stock.gold - 20) / price, room));
  if (n < 5) return;
  spend(game, 'gold', n * price);
  gain(game, 'grain', n);
  game.nextRelief = game.week + 4;
  game.note(`The stores were all but bare: your steward bought ${n} corn from carters for ${Math.round(n * price)} gold. Fields would be cheaper.`, 'info');
}

/** Everyone eats, burns fuel, drinks and wears out what they own. */
function consume(game) {
  const people = game.pop.children + game.pop.adults + game.pop.elders;
  const cold = coldness(game.week);
  const food = eat(game, people);
  const fuelNeed = people * lerp(FUEL_PER_PERSON.mild, FUEL_PER_PERSON.cold, cold) * game.weather.winter ** (cold > 0.9 ? 1 : 0);
  const clothUse = Math.min(game.stock.cloth, people * 0.004 * (0.3 + cold));
  spend(game, 'cloth', clothUse);
  const fuelNeeded = fuelNeed * (1 - 0.15 * (clothUse > 0 ? 1 : 0) * cold);
  const fuelGot = Math.min(game.stock.wood, fuelNeeded);
  spend(game, 'wood', fuelGot);
  const aleNeed = people * 0.012;
  const aleGot = Math.min(game.stock.ale, aleNeed);
  spend(game, 'ale', aleGot);
  game.report.foodSat = food.sat;
  game.report.variety = food.groups;
  game.report.fuelSat = fuelNeeded > 0 ? clamp(fuelGot / fuelNeeded) : 1;
  game.report.aleSat = aleNeed > 0 ? clamp(aleGot / aleNeed) : 1;
  game.report.clothed = clothUse > 0 || cold === 0 ? 1 : 0;
  game.report.foodNeed = food.need;
}

/** What goes off, and what the stores can't hold. */
function spoil(game) {
  const cap = game.cap;
  for (const r of GOODS) {
    if (r === 'gold') continue;
    const rate = RESOURCES[r].spoil;
    if (rate > 0) { const lost = game.stock[r] * rate; game.stock[r] -= lost; game.flows.used[r] = (game.flows.used[r] ?? 0) + lost; }
    const limit = capFor(cap, r);
    if (game.stock[r] > limit) { game.flows.used[r] = (game.flows.used[r] ?? 0) + (game.stock[r] - limit); game.stock[r] = limit; }
    if (game.stock[r] < 0) game.stock[r] = 0;
  }
}

/** Coin: taxes and the shops, less what the buildings, the garrison and the king cost. */
function money(game) {
  const { world } = game;
  const r = game.report;
  const taxK = game.tax / 0.1;
  const taxes = r.employed * 0.9 * taxK * (0.7 + 0.3 * clamp(game.happiness / 100)) * (1 + (game.blockGain?.tax ?? 0));
  // The shops can only sell what the town can buy.
  let capacity = 0;
  for (const b of world.buildings.values()) {
    const def = BUILDINGS[b.type];
    if (def?.shop && b.state === 'ready' && b.connected) capacity += def.shop * (0.4 + 0.6 * Math.min(1, b.eff)) * (1 + 0.3 * qualityAt(game, b.x + b.w / 2, b.y + b.d / 2));
  }
  const people = game.pop.children + game.pop.adults + game.pop.elders;
  const demand = people * 0.06 * (1 + 0.15 * ((r.variety ?? 1) - 1) + (r.aleSat > 0.5 ? 0.1 : 0));
  const shops = Math.min(capacity, demand) * 1.7 * taxK;
  let upkeep = CASTLE_LEVELS[game.castleLevel].jobs * 0.9 + game.castleLevel * 1.2;
  for (const b of world.buildings.values()) {
    if (b.state !== 'ready') continue;
    const u = BUILDINGS[b.type]?.upkeep;
    if (u) upkeep += u * (0.5 + 0.5 * Math.min(1, b.eff || 0));
  }
  gain(game, 'gold', taxes + shops);
  const pay = Math.min(upkeep, game.stock.gold);
  spend(game, 'gold', pay);
  game.takings = (game.takings ?? 0) + taxes + shops;
  r.taxes = taxes;
  r.shops = shops;
  r.upkeep = upkeep;
  r.income = taxes + shops - upkeep;
  r.shopCapacity = capacity;
}

/**
 * How many people the barony's food could keep for a year: what the tended
 * fields, the boats, the hunters and the kitchen gardens will bring in, with
 * the mills' bread counted, and half of what is in store.
 */
export function estimateFood(game) {
  const { world } = game;
  const mood = 0.85 + 0.3 * clamp(game.happiness / 100);
  const cal = calendar(game.week);
  let grain = 0, produce = 0, other = 0, millCap = 0;
  for (const b of world.buildings.values()) {
    if (b.state !== 'ready' || !b.connected) continue;
    const def = BUILDINGS[b.type];
    if (b.type === 'farmstead' && b.fields) {
      // In the winter the farmhands are off at other work; they come back to the fields in the spring.
      const hands = cal.season === 3 ? (b.fieldHands ?? b.jobs) : b.workers;
      const tended = Math.min(b.fields.length, Math.round(hands * TILES_PER_HAND + 0.001));
      for (let n = 0; n < tended; n++) {
        const i = b.fields[n];
        // What is lost on the cart to the store is lost to the table too.
        const soil = (0.35 + 0.9 * (world.fert[i] / 255)) * haulK(b);
        const z = world.zone[i];
        // A crop sown late will not be a full one: how ripe this one will be by the harvest.
        const ripe = cal.season <= 1 ? clamp((world.crop[i] + (24 - cal.inYear) * (255 / 24)) / 255) : 1;
        if (z === ZONE_ID.wheat) grain += 10 * soil * ripe;
        else if (z === ZONE_ID.veg) produce += 11 * soil * ripe;
        else if (z === ZONE_ID.orchard) produce += ORCHARD_YIELD * soil * ripe;
        else if (z === ZONE_ID.pasture) other += 1.5 * soil * RESOURCES.meat.value;
      }
    } else if (def?.work?.kind === 'gather' && (def.work.res === 'fish' || def.work.res === 'meat')) {
      const sea = def.work.season ? def.work.season.reduce((a, c) => a + c, 0) / 4 : 1;
      other += def.work.rate * b.workers * 48 * sea * RESOURCES[def.work.res].value * haulK(b) * 0.8;
    } else if (b.type === 'mill') millCap += def.work.in.grain * b.eff * 48;
    else if (def?.work?.kind === 'grow') {
      // A smallholding's year: a week's yield in each season, twelve weeks of each.
      for (let season = 0; season < 4; season++) {
        const y = growYield(game, b, season);
        grain += (y.grain ?? 0) * 12;
        produce += (y.produce ?? 0) * 12;
        other += (y.meat ?? 0) * 12 * RESOURCES.meat.value;
      }
    }
  }
  // Once this year's harvest is in, the next one's weather is anyone's guess.
  const weatherK = cal.season === 3 ? 1 : game.weather.harvest;
  grain *= weatherK;
  produce *= weatherK;
  // What milling adds: the bread a measure of grain makes is worth more than the grain.
  const { in: mIn, out: mOut } = BUILDINGS.mill.work;
  const bread = Math.min(grain, millCap) * (mOut.bread / mIn.grain * RESOURCES.bread.value - 1);
  const gardens = (game.gardens ?? 0) * 0.1 * 36 * mood;
  const stock = FOODS.reduce((n, f) => n + game.stock[f] * RESOURCES[f].value, 0);
  const annual = (grain + bread + produce + other + gardens) * mood * 0.8 + stock * 0.5;
  game.report.foodSupport = annual / (FOOD_PER_PERSON * 48);
  game.report.foodAnnual = annual;
  game.report.foodStock = stock;
}

/** The week's work, start to end. */
export function weekWork(game) {
  game.flows = { made: {}, used: {} };
  game.cap = capacity(game);
  refresh(game);
  assignFields(game);
  allocate(game);
  work(game);
  farm(game);
  estimateFood(game);
  relief(game);
  consume(game);
  spoil(game);
  money(game);
  const cal = calendar(game.week);
  game.report.cal = cal;
  const need = (game.report.foodNeed || 1);
  const foodStock = FOODS.reduce((n, f) => n + game.stock[f] * RESOURCES[f].value, 0);
  game.report.foodWeeks = foodStock / need;
}

