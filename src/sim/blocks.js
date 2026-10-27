import { BUILDINGS, INDUSTRY_ZONES, PLOT_DEPTH, ZONE_ID } from '../catalog.js';
import { DIRS, TILES } from '../config.js';
import { network } from '../world/roads.js';
import { idx, inb } from '../world/world.js';

/**
 * Donut blocks, as a SimCity player knows them: a loop of streets, a ring of
 * homes along its inside, and in the middle (the core) a park or a building
 * that serves them all. The core is what makes the block worth more than the
 * sum of its houses. This reads the map for such blocks (any loop of road
 * that closes, drawn with the block tool or by hand) and works out what each
 * one is worth:
 *
 *   - `closure`: how much of the ring is built. A block with gaps is no donut.
 *   - `heart`: what is in the core. A village green is best for the houses
 *     around it; a chapel, well, tavern, healer, market or tower serves them
 *     all at once; kitchen gardens, an orchard or pasture are worth something.
 *   - `rating`, 0 to 100, is the two together, and `q` is rating / 100.
 *
 * What a good block earns the realm is in `bonus` (see `blockBonus`): coin
 * from its homes, rooms in the courtyards, calmer streets, houses that rise
 * sooner, monsters caught sooner in its streets, and the heart's services reaching every
 * door in the ring.
 */

const MIN_AREA = 9;
const MAX_AREA = 800;

/** What a building in the core is worth to the homes around it (`fine`: its share of the heart), and what the block is called for it. */
export const HEARTS = Object.freeze({
  green: { name: 'Commons', fine: 0.85, why: 'a park every window looks onto' },
  cathedral: { name: 'Cathedral Close', fine: 0.9, why: 'spires over the rooftops' },
  chapel: { name: 'Chapel Close', fine: 0.6, why: 'a bell and a priest at the middle' },
  market: { name: 'Market Court', fine: 0.6, why: 'a square the whole block shops at' },
  castle: { name: 'Castle Close', fine: 0.7, why: 'the lord’s walls at its heart' },
  well: { name: 'Wellside Close', fine: 0.4, why: 'clean water and a bucket in reach' },
  tavern: { name: 'Tavern Court', fine: 0.45, why: 'a fire and a song at the middle' },
  healer: { name: 'Physic Court', fine: 0.45, why: 'herbs, garlic and a hedge witch in reach' },
  graveyard: { name: 'Churchyard Close', fine: 0.3, why: 'the dead at rest at its middle' },
  watchtower: { name: 'Watch Court', fine: 0.35, why: 'a tower that sees the whole street' },
  barracks: { name: 'Barrack Yard', fine: 0.3, why: 'men-at-arms in the yard' },
  // The hearts an industrial block wants: somewhere to store, to mill, to forge.
  storehouse: { name: 'Craft Yard', fine: 0.45, why: 'a storehouse the whole yard draws on' },
  granary: { name: 'Granary Close', fine: 0.4, why: 'a granary at the middle of the holdings' },
  smithy: { name: 'Forge Yard', fine: 0.4, why: 'a forge at the middle of the trades' },
  mill: { name: 'Mill Green', fine: 0.4, why: 'a windmill turning at the middle' },
});

/** What an open core is worth if it is worked: by zone, its name and its share of the heart. */
const CULTIVATED = Object.freeze({
  [ZONE_ID.res]: { name: 'Garden Block', fine: 0.3, why: 'kitchen gardens behind every house' },
  [ZONE_ID.veg]: { name: 'Allotment Block', fine: 0.36, why: 'vegetable beds at the middle' },
  [ZONE_ID.orchard]: { name: 'Orchard Block', fine: 0.42, why: 'apple and pear trees at the middle' },
  [ZONE_ID.pasture]: { name: 'Common Pasture', fine: 0.32, why: 'sheep on the common' },
  [ZONE_ID.wheat]: { name: 'Field Block', fine: 0.25, why: 'a field at the middle' },
});

const isHome = (b) => Boolean(BUILDINGS[b.type]?.cap);
const isShop = (b) => Boolean(BUILDINGS[b.type]?.shop);
/** The people's own buildings, which make up a ring: homes, shops, smallholdings and workshops. */
const isGrown = (b) => Boolean(BUILDINGS[b.type]?.auto);
const RING_ZONES = new Set([ZONE_ID.res, ZONE_ID.market, ...INDUSTRY_ZONES.map((z) => ZONE_ID[z])]);

export const standing = (rating) => (rating >= 90 ? 'Jewel of the town' : rating >= 70 ? 'Fine courtyard' : rating >= 40 ? 'Pleasant close' : rating >= 10 ? 'Quiet close' : 'Hollow block');

/**
 * Finds every closed block on the map, and the tiles of each: `ring` (the
 * plots along the streets) and `core` (the middle). A block is a region of
 * ground a street loop shuts in, between 9 and 800 tiles, not touching the
 * edge of the map.
 */
export function findBlocks(game) {
  const { world } = game;
  const size = world.size;
  const label = new Int32Array(TILES).fill(-1);
  const faces = [];
  const stack = [];
  for (let s = 0; s < TILES; s++) {
    if (label[s] >= 0 || world.road[s]) continue;
    const id = faces.length;
    const tiles = [];
    let open = false;
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const t = stack.pop();
      tiles.push(t);
      const x = t % size, y = (t - x) / size;
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) open = true;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) continue;
        const j = idx(nx, ny);
        if (label[j] < 0 && !world.road[j]) { label[j] = id; stack.push(j); }
      }
    }
    faces.push(open || tiles.length > MAX_AREA ? null : tiles);
  }
  const blocks = [];
  const of = new Int16Array(TILES).fill(-1);
  for (const tiles of faces) {
    if (!tiles || tiles.length < MIN_AREA) continue;
    const block = measure(game, tiles);
    if (!block) continue;
    block.id = blocks.length;
    for (const t of tiles) of[t] = block.id;
    blocks.push(block);
  }
  return { blocks, of };
}

/** How far each tile of a face is from the street that shuts it in (1 beside it), by flood from the street. */
function depths(world, tiles) {
  const inFace = new Set(tiles);
  const depth = new Map();
  let frontier = [];
  for (const t of tiles) {
    const x = t % world.size, y = (t - x) / world.size;
    if (DIRS.some(([dx, dy]) => inb(x + dx, y + dy) && world.road[idx(x + dx, y + dy)])) { depth.set(t, 1); frontier.push(t); }
  }
  while (frontier.length) {
    const next = [];
    for (const t of frontier) {
      const x = t % world.size, y = (t - x) / world.size;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) continue;
        const j = idx(nx, ny);
        if (inFace.has(j) && !depth.has(j)) { depth.set(j, depth.get(t) + 1); next.push(j); }
      }
    }
    frontier = next;
  }
  return depth;
}

function measure(game, tiles) {
  const { world } = game;
  const depth = depths(world, tiles);
  const { dist } = network(world);
  const connected = tiles.some((t) => { const x = t % world.size, y = (t - x) / world.size; return DIRS.some(([dx, dy]) => inb(x + dx, y + dy) && dist[idx(x + dx, y + dy)] >= 0); });
  const ring = [], core = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tiles) {
    const x = t % world.size, y = (t - x) / world.size;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    ((depth.get(t) ?? 1) <= PLOT_DEPTH ? ring : core).push(t);
  }
  const homes = new Map(), shops = new Map(), works = new Map(), specials = new Map();
  let zoned = 0, built = 0;
  const coreSet = new Set(core);
  for (const t of tiles) {
    const id = world.bld[t];
    const b = id ? world.buildings.get(id) : null;
    const inRing = !coreSet.has(t);
    if (b) {
      if (isHome(b) && b.state === 'ready') homes.set(b.id, b);
      else if (isShop(b) && b.state === 'ready') shops.set(b.id, b);
      if (INDUSTRY_ZONES.includes(BUILDINGS[b.type]?.auto) && b.state === 'ready') works.set(b.id, b);
      if (inRing && isGrown(b)) { zoned++; if (b.state === 'ready') built++; }
      else if (HEARTS[b.type] && b.state === 'ready') {
        // A special building is in the heart if its middle is in the core.
        const cx = Math.floor(b.x + b.w / 2), cy = Math.floor(b.y + b.d / 2);
        if (coreSet.has(idx(cx, cy))) specials.set(b.id, b);
      }
    } else if (inRing && RING_ZONES.has(world.zone[t])) zoned++;
  }
  // The castle, if the street runs around it.
  const castle = world.buildings.get(1);
  if (castle && coreSet.has(idx(Math.floor(castle.x + castle.w / 2), Math.floor(castle.y + castle.d / 2)))) specials.set(castle.id, castle);

  // What the core is, if it is open ground: the commonest working zone on it.
  const zoneCount = {};
  let open = 0;
  for (const t of core) {
    if (world.bld[t]) continue;
    open++;
    const z = world.zone[t];
    if (z && CULTIVATED[z]) zoneCount[z] = (zoneCount[z] ?? 0) + 1;
  }
  let crop = null, cropN = 0;
  for (const [z, n] of Object.entries(zoneCount)) if (n > cropN) { crop = +z; cropN = n; }

  const types = new Map();
  for (const b of specials.values()) types.set(b.type, (types.get(b.type) ?? 0) + 1);
  let rest = 1;
  const hearts = [];
  for (const [type, n] of types) {
    const fine = HEARTS[type].fine * (1 + 0.15 * (n - 1));
    rest *= 1 - Math.min(0.95, fine);
    hearts.push({ type, n, name: HEARTS[type].name });
  }
  if (crop !== null && open > 0) {
    const share = Math.min(1, cropN / Math.max(1, core.length) / 0.55);
    rest *= 1 - CULTIVATED[crop].fine * share;
  }
  const heart = core.length >= 4 ? 1 - rest : 0;
  const fill = zoned ? built / zoned : 0;
  // Six households or trades make a ring: homes, smallholdings or workshops.
  const closure = Math.max(0, Math.min(1, (fill - 0.35) / 0.55)) * Math.min(1, new Set([...homes.keys(), ...works.keys()]).size / 6);
  const rating = Math.round(100 * heart * closure);

  // What the block is called: by the strongest thing in its heart.
  let name = 'Hollow Block';
  const best = [...types.keys()].sort((a, b) => HEARTS[b].fine - HEARTS[a].fine)[0];
  if (best) name = HEARTS[best].name;
  else if (crop !== null && heart > 0) name = CULTIVATED[crop].name;
  let why = best ? HEARTS[best].why : crop !== null ? CULTIVATED[crop].why : null;

  let cap = 0;
  for (const b of homes.values()) cap += BUILDINGS[b.type].cap;
  return {
    id: -1, x0, y0, x1, y1, center: [(x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2], area: tiles.length,
    ring, core, homes: homes.size, shops: shops.size, works: works.size, cap, specials: [...specials.keys()], hearts, crop: crop === null ? null : CULTIVATED[crop].name,
    fill, closure, heart, rating, q: rating / 100, name, why, standing: standing(rating),
    // Ring plots still to be built, and the core's open ground, for the tips.
    zoned, built, openCore: open, connected,
  };
}

/** The services a core building lends to its whole block, strongest first. */
export function courtyardServes(game, block) {
  const out = {};
  for (const id of block.specials) {
    const b = game.world.buildings.get(id);
    const s = b && BUILDINGS[b.type]?.serve;
    if (b?.type === 'castle') { out.security = Math.max(out.security ?? 0, 1); continue; }
    if (!s) continue;
    const staffed = BUILDINGS[b.type].jobs ? 0.5 + 0.5 * Math.min(1, b.eff || 0) : 1;
    for (const k of ['water', 'faith', 'cheer', 'health', 'security', 'commerce']) if (s[k]) out[k] = Math.max(out[k] ?? 0, Math.min(1, s[k] * 1.6) * staffed);
  }
  return out;
}

/** What the blocks add up to for the realm; `tax`, `mood` and `shops` are shares, `cap` is people. */
export function blockBonus(game) {
  let total = 0, weighted = 0, rooms = 0, shops = 0, shopsAll = 0;
  for (const b of game.blocks ?? []) {
    total += b.cap;
    weighted += b.cap * b.q;
    rooms += b.cap * 0.12 * b.q;
    shops += b.shops * b.q;
    shopsAll += b.shops;
  }
  for (const b of game.world.buildings.values()) if (isHome(b) && b.state === 'ready' && !(game.blockOf && game.blockOf[idx(b.x, b.y)] >= 0)) total += BUILDINGS[b.type].cap;
  total = Math.max(1, total);
  return { tax: 0.18 * weighted / total, mood: 7 * weighted / total, cap: Math.floor(rooms), shops: shopsAll ? 0.3 * shops / shopsAll : 0 };
}

/** The quality (0 to 1) of the block a tile is in, or 0. */
export const qualityAt = (game, x, y) => {
  const b = game.blockOf?.[idx(Math.floor(x), Math.floor(y))];
  return b >= 0 ? game.blocks[b].q : 0;
};

/** The block a tile is in, or null. */
export const blockAt = (game, x, y) => {
  if (!inb(Math.floor(x), Math.floor(y))) return null;
  const b = game.blockOf?.[idx(Math.floor(x), Math.floor(y))];
  return b >= 0 ? game.blocks[b] : null;
};

/** Whether the tile is on the ring side of its block (a plot) rather than the core. */
export const inRing = (game, x, y) => {
  const b = blockAt(game, x, y);
  return Boolean(b && b.ring.includes(idx(Math.floor(x), Math.floor(y))));
};

/** Reads the map for blocks, if streets or buildings have changed, and says whether it did. */
export function computeBlocks(game, force = false) {
  const { world } = game;
  const ver = `${world.bver ?? 0}:${Math.floor(game.week / 4)}`;
  if (!force && game.blocks && game.blocksVer === ver) return false;
  const { blocks, of } = findBlocks(game);
  game.blocks = blocks;
  game.blockOf = of;
  game.blocksVer = ver;
  game.blockGain = blockBonus(game);
  return true;
}

/** Words for what a block does for the realm, and what it lacks; for the interface. */
export function blockReport(block) {
  const q = block.q;
  const perks = [];
  const tips = [];
  const pct = (v) => `${Math.round(v * 100)}%`;
  if (q > 0) {
    perks.push({ icon: 'tax', text: `Its homes pay ${pct(0.18 * q)} more tax` });
    perks.push({ icon: 'home', text: `Courtyard rooms: ${(block.cap * 0.12 * q).toFixed(1)} more people housed` });
    perks.push({ icon: 'happy', text: `Happier folk: up to +${(7 * q).toFixed(1)} on the town’s mood in proportion` });
    perks.push({ icon: 'fire', text: `Neighbors with torches: monsters in its streets are put down up to ${pct(0.3 * q)} more often` });
    perks.push({ icon: 'build', text: 'Houses here rise a level sooner' });
    if (block.shops) perks.push({ icon: 'gold', text: `Shops in the ring sell ${pct(0.3 * q)} more` });
    if (block.works) perks.push({ icon: 'build', text: `Smallholdings and workshops in the ring make ${pct(0.25 * q)} more` });
  }
  for (const h of block.hearts) perks.push({ icon: 'castle', text: `${h.name}: its services reach every door in the ring`, soft: true });
  if (block.crop) perks.push({ icon: 'leaf', text: `${block.crop}: worked ground at the heart`, soft: true });
  if (!block.connected) tips.unshift('No street of this block joins the castle’s roads, so no one will build here. Lay a road from it to the town.');
  if (block.core.length < 4) tips.push('This block has no core. Make it larger, so there is a heart to put something in.');
  else {
    if (!block.hearts.length) tips.push((block.works ?? 0) > block.homes / 2 ? 'Put a storehouse, a granary, a smithy or a windmill in the middle: the trades around it all draw on it.' : 'Put a Village Green, a well, a chapel or a tavern in the middle: that is what makes a donut.');
    else if (block.hearts.length === 1 && block.heart < 0.85) tips.push('A second building in the heart (a well beside the green, say) raises it further.');
    if (block.fill < 0.9) tips.push(`Fill the ring: ${block.built} of ${block.zoned} plots are built.`);
    if (block.homes + (block.works ?? 0) < 6) tips.push('It wants at least six homes, smallholdings or workshops to count.');
  }
  return { perks, tips };
}
