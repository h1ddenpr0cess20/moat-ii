/**
 * Everything the game knows by name: the goods, the zones, the buildings,
 * the castle's tiers and the ranks a lord rises through. The simulation and
 * the interface both read this; nothing here does anything by itself.
 *
 * A week is a tick. Rates are per worker per week unless they say otherwise.
 */

/** The goods. `group` is what a mouth counts a food as; `spoil` the share that is lost each week; `store` which store holds it. */
export const RESOURCES = Object.freeze({
  gold: { name: 'Gold', store: null, spoil: 0 },
  wood: { name: 'Timber', store: 'goods', spoil: 0.001 },
  stone: { name: 'Stone', store: 'goods', spoil: 0 },
  iron: { name: 'Iron', store: 'goods', spoil: 0 },
  tools: { name: 'Tools', store: 'goods', spoil: 0 },
  grain: { name: 'Grain', store: 'food', spoil: 0.003, group: 'staple', value: 1 },
  bread: { name: 'Bread', store: 'food', spoil: 0.04, group: 'staple', value: 1.4 },
  produce: { name: 'Produce', store: 'food', spoil: 0.06, group: 'produce', value: 1 },
  meat: { name: 'Meat', store: 'food', spoil: 0.05, group: 'protein', value: 1.6 },
  fish: { name: 'Fish', store: 'food', spoil: 0.08, group: 'protein', value: 1.5 },
  ale: { name: 'Ale', store: 'goods', spoil: 0.01 },
  wool: { name: 'Wool', store: 'goods', spoil: 0 },
  cloth: { name: 'Cloth', store: 'goods', spoil: 0 },
});
export const GOODS = Object.keys(RESOURCES);
export const FOODS = GOODS.filter((g) => RESOURCES[g].group);

/** What a mouth eats each week, and how a week's eating is split between the three kinds of food. */
export const FOOD_PER_PERSON = 0.25;
export const FOOD_SPLIT = Object.freeze({ staple: 0.55, produce: 0.2, protein: 0.25 });

/** What a person burns to keep warm each week: in the cold months, and in the rest. */
export const FUEL_PER_PERSON = Object.freeze({ cold: 0.05, mild: 0.012 });

/** Zones: land set aside to be built on by the people themselves. */
export const ZONES = Object.freeze({
  res: { id: 'res', name: 'Housing', color: '#59b35f', cost: 1, desc: 'Cottages and houses grow along the streets, as deep as the plots go. What the houses leave behind them is kitchen garden.' },
  market: { id: 'market', name: 'Market', color: '#4f8fd6', cost: 1, desc: 'Stalls and shops, which pay the lord in coin and give people something to spend it on.' },
  wheat: { id: 'wheat', name: 'Wheat', color: '#e0b840', cost: 1, desc: 'Open fields of grain, sown in spring and reaped in autumn. They need a farmstead within eight tiles.', crop: 'grain' },
  veg: { id: 'veg', name: 'Gardens', color: '#7fcf5a', cost: 1, desc: 'Cabbages, leeks and beans. Quick to grow, quick to spoil. They need a farmstead within eight tiles.', crop: 'produce' },
  orchard: { id: 'orchard', name: 'Orchard', color: '#d96a5a', cost: 3, desc: 'Apple and pear trees that give fruit every autumn and shade all year. They need a farmstead within eight tiles.', crop: 'produce' },
  pasture: { id: 'pasture', name: 'Pasture', color: '#9ec27a', cost: 1, desc: 'Sheep and cattle: wool, and meat in the autumn cull. They need a farmstead within eight tiles.', crop: 'wool' },
  // Industry: zones the people work as well as live on, built up when there are hands wanting work.
  croft: { id: 'croft', name: 'Smallholdings', color: '#c9a74e', cost: 1, industry: true, desc: 'Crofts along the lane: a family on each, with a strip, a cow and a pig. They feed themselves and send the rest to the stores, with no farmstead needed. They grow when there are hands wanting work.' },
  craft: { id: 'craft', name: 'Workshops', color: '#b06a3c', cost: 2, industry: true, desc: 'Carpenters, coopers and wheelwrights: timber in, tools and wares out, and the wares sold in the town. Workshops grow when there are hands wanting work. Keep them back from the houses: they catch fire.' },
});
export const ZONE_LIST = Object.keys(ZONES);
/** Zone numbers as they are stored on the map: 0 is none. */
export const ZONE_ID = Object.freeze(Object.fromEntries(ZONE_LIST.map((z, i) => [z, i + 1])));
export const ZONE_NAME = [null, ...ZONE_LIST];
export const FARM_ZONES = ['wheat', 'veg', 'orchard', 'pasture'];
/** The zones industry grows on, by themselves, when people want work. */
export const INDUSTRY_ZONES = ['croft', 'craft'];

/** How many tiles a house's plot reaches back from the street before the block's core begins. */
export const PLOT_DEPTH = 3;
/** How far a farmstead's workers will go to tend a field. */
export const FARM_RADIUS = 8;

/**
 * The buildings. `size` is [width along the street, depth]; `cost` is what
 * the builders use up; `weeks` how long it takes with a full crew of `crew`;
 * `jobs` how many people work there. `auto` ones grow by themselves on zoned
 * land. `where` says what it needs of the ground.
 */
export const BUILDINGS = Object.freeze({
  // The people's own, grown on zones.
  cottage: { name: 'Cottage', cat: 'housing', size: [2, 2], cost: { wood: 12, stone: 2 }, weeks: 3, crew: 2, cap: 4, auto: 'res', level: 1, desc: 'Wattle, daub and thatch: a hearth, a bed and a pig.' },
  house: { name: 'House', cat: 'housing', size: [2, 2], cost: { wood: 18, stone: 8 }, weeks: 3, crew: 2, cap: 6, auto: 'res', level: 2, desc: 'A timber-framed house with a tiled roof, and a chimney that draws.' },
  townhouse: { name: 'Townhouse', cat: 'housing', size: [2, 3], cost: { wood: 26, stone: 18, gold: 15 }, weeks: 5, crew: 3, cap: 9, auto: 'res', level: 3, desc: 'Three stories leaning out over the street. Merchants and masters live here.' },
  stall: { name: 'Market Stall', cat: 'market', size: [2, 1], cost: { wood: 6 }, weeks: 1, crew: 1, jobs: 1, shop: 1.1, auto: 'market', level: 1, desc: 'A trestle and an awning.' },
  shop: { name: 'Shop', cat: 'market', size: [2, 2], cost: { wood: 18, stone: 6 }, weeks: 3, crew: 2, jobs: 2, shop: 2.4, auto: 'market', level: 2, desc: 'A draper, a chandler or a baker, with a sign over the door.' },
  merchant: { name: 'Merchant House', cat: 'market', size: [2, 2], cost: { wood: 24, stone: 18, gold: 20 }, weeks: 5, crew: 3, jobs: 3, shop: 4.2, auto: 'market', level: 3, desc: 'Warehouse below, counting house above.' },
  // Industry, grown on its own zones: smallholdings that feed the town, and workshops that equip it.
  croft: { name: 'Croft', cat: 'industry', size: [2, 2], cost: { wood: 14 }, weeks: 3, crew: 2, jobs: 2, cap: 2, auto: 'croft', level: 1, work: { kind: 'grow', yields: { grain: 0.7, produce: 0.35, meat: 0.08 }, season: [0.6, 1, 1.5, 0.3] }, desc: 'A cottage, a strip of oats and a cow. The family lives on it and sends what it does not eat to the stores.' },
  smallholding: { name: 'Smallholding', cat: 'industry', size: [2, 3], cost: { wood: 22, stone: 6 }, weeks: 4, crew: 2, jobs: 3, cap: 3, auto: 'croft', level: 2, work: { kind: 'grow', yields: { grain: 0.75, produce: 0.4, meat: 0.1, wool: 0.1 }, season: [0.6, 1, 1.5, 0.3] }, desc: 'A longhouse and a byre, a few sheep and a vegetable plot.' },
  grange: { name: 'Grange', cat: 'industry', size: [2, 3], cost: { wood: 34, stone: 16, gold: 20 }, weeks: 6, crew: 3, jobs: 4, cap: 4, auto: 'croft', level: 3, work: { kind: 'grow', yields: { grain: 0.85, produce: 0.45, meat: 0.12, wool: 0.12 }, season: [0.6, 1, 1.5, 0.3] }, desc: 'A yeoman’s farm with a barn and a dovecote. It feeds a street.' },
  workshop: { name: 'Workshop', cat: 'industry', size: [2, 2], cost: { wood: 18, gold: 10 }, weeks: 3, crew: 2, jobs: 2, shop: 0.8, auto: 'craft', level: 1, work: { kind: 'make', in: { wood: 1.4 }, out: { tools: 0.3 } }, desc: 'A carpenter’s shop: hafts, rakes, buckets and benches. Wooden tools, and wares for the market.' },
  joinery: { name: 'Joinery', cat: 'industry', size: [2, 3], cost: { wood: 30, stone: 8, gold: 20 }, weeks: 4, crew: 2, jobs: 3, shop: 1.4, auto: 'craft', level: 2, work: { kind: 'make', in: { wood: 2 }, out: { tools: 0.5 } }, desc: 'A cooper and a wheelwright under one roof, with a sawpit in the yard.' },
  guildhall: { name: 'Craft Hall', cat: 'industry', size: [2, 3], cost: { wood: 40, stone: 24, gold: 40 }, weeks: 6, crew: 3, jobs: 4, shop: 2.4, auto: 'craft', level: 3, work: { kind: 'make', in: { wood: 2, iron: 0.4 }, out: { tools: 1.1 } }, desc: 'A master’s hall with apprentices: iron-shod tools, locks and hinges, and a counter on the street.' },

  // Food.
  farmstead: { name: 'Farmstead', cat: 'food', size: [3, 3], cost: { wood: 40, gold: 30 }, weeks: 5, crew: 3, jobs: 6, upkeep: 0.5, work: { kind: 'farm' }, desc: 'A farmhouse, a barn and a yard. Its hands tend every field within eight tiles, one for each eight tiles of field.' },
  fishery: { name: 'Fisherman’s Hut', cat: 'food', size: [2, 3], cost: { wood: 30, gold: 20 }, weeks: 4, crew: 2, jobs: 2, upkeep: 0.2, where: { water: { radius: 4, count: 10 } }, work: { kind: 'gather', res: 'fish', rate: 1.8, from: 'water', radius: 4, season: [0.9, 1.1, 1, 0.45] }, desc: 'Nets, a jetty and a smoking rack. It must stand by the water.' },
  hunter: { name: 'Hunter’s Lodge', cat: 'food', size: [2, 2], cost: { wood: 25, gold: 20 }, weeks: 3, crew: 2, jobs: 2, upkeep: 0.2, where: { trees: { radius: 10, count: 14 } }, work: { kind: 'gather', res: 'meat', rate: 1.2, from: 'trees', radius: 10, season: [1, 0.9, 1.2, 0.8], spends: 0 }, desc: 'Venison and hide from the surrounding woods. It wants a forest within ten tiles.' },
  granary: { name: 'Granary', cat: 'food', size: [3, 3], cost: { wood: 40, stone: 10, gold: 20 }, weeks: 6, crew: 3, jobs: 1, upkeep: 0.3, store: { food: 1600 }, desc: 'Raised on staddle stones against the rats. Holds a harvest.' },
  mill: { name: 'Windmill', cat: 'food', size: [3, 3], cost: { wood: 80, stone: 30, gold: 50 }, weeks: 8, crew: 3, jobs: 2, upkeep: 0.5, work: { kind: 'make', in: { grain: 3.2 }, out: { bread: 4.5 }, fuel: 0.3 }, desc: 'Grinds grain and bakes it into bread: four loaves and a half for every three measures of grain.' },
  brewery: { name: 'Brewery', cat: 'food', size: [2, 3], cost: { wood: 60, stone: 10, gold: 40 }, weeks: 6, crew: 3, jobs: 2, upkeep: 0.4, work: { kind: 'make', in: { grain: 2.4 }, out: { ale: 4 }, fuel: 0.2 }, desc: 'Ale for the taverns, and for anyone who can pay.' },

  // Materials.
  woodcutter: { name: 'Woodcutter’s Lodge', cat: 'industry', size: [2, 2], cost: { wood: 20, gold: 15 }, weeks: 3, crew: 2, jobs: 3, upkeep: 0.2, where: { trees: { radius: 9, count: 6 } }, work: { kind: 'gather', res: 'wood', rate: 3.4, from: 'trees', radius: 9, tools: true }, desc: 'Fells the trees within nine tiles. The forest grows back, but slowly.' },
  forester: { name: 'Forester’s Lodge', cat: 'industry', size: [2, 2], cost: { wood: 30, gold: 20 }, weeks: 3, crew: 2, jobs: 2, upkeep: 0.2, work: { kind: 'plant', radius: 8, plant: 0.9, tend: 1.4 }, desc: 'Plants and tends young woods within eight tiles of the lodge, so the woodcutters never run dry. It plants on open ground only: not on streets, zones or in a block.' },
  quarry: { name: 'Quarry', cat: 'industry', size: [3, 3], cost: { wood: 40, gold: 30 }, weeks: 5, crew: 3, jobs: 4, upkeep: 0.4, where: { rock: { radius: 6, count: 5 } }, work: { kind: 'gather', res: 'stone', rate: 1.7, from: 'rock', radius: 6, tools: true }, desc: 'Cuts stone from the nearby outcrops. It must stand near bare rock.' },
  ironmine: { name: 'Iron Mine', cat: 'industry', size: [3, 3], cost: { wood: 60, stone: 20, gold: 60 }, weeks: 8, crew: 4, jobs: 4, upkeep: 0.6, where: { ore: { radius: 6, count: 3 } }, work: { kind: 'gather', res: 'iron', rate: 1, from: 'ore', radius: 6, tools: true, fuel: 0.2 }, desc: 'A shaft, a windlass and a sledge. It must stand near iron ore.' },
  storehouse: { name: 'Storehouse', cat: 'industry', size: [3, 3], cost: { wood: 50, stone: 20, gold: 25 }, weeks: 6, crew: 3, jobs: 1, upkeep: 0.3, store: { goods: 1300 }, desc: 'Timber, stone, iron and everything else that keeps.' },
  smithy: { name: 'Smithy', cat: 'industry', size: [2, 3], cost: { wood: 50, stone: 30, gold: 50 }, weeks: 6, crew: 3, jobs: 2, upkeep: 0.5, work: { kind: 'make', in: { iron: 1.1, wood: 0.7 }, out: { tools: 1.1 } }, desc: 'Turns iron and charcoal into the tools every trade wears out.' },
  weaver: { name: 'Weaver', cat: 'industry', size: [2, 3], cost: { wood: 45, gold: 35 }, weeks: 5, crew: 2, jobs: 2, upkeep: 0.3, work: { kind: 'make', in: { wool: 2.2 }, out: { cloth: 1.8 } }, desc: 'Cloth from the shepherds’ wool. Warm backs make happy ones.' },

  // Civic.
  well: { name: 'Well', cat: 'civic', size: [1, 1], cost: { stone: 14, gold: 5 }, weeks: 1, crew: 1, serve: { water: 1, radius: 7 }, desc: 'Clean water, and a bucket in reach when something catches fire.' },
  green: { name: 'Village Green', cat: 'civic', size: [3, 3], cost: { wood: 6, gold: 20 }, weeks: 2, crew: 1, serve: { cheer: 0.5, radius: 8 }, desc: 'A pond, a maypole and a bench. Somewhere to be that is not home.' },
  tavern: { name: 'Tavern', cat: 'civic', size: [3, 3], cost: { wood: 70, stone: 15, gold: 60 }, weeks: 8, crew: 3, jobs: 2, upkeep: 0.5, serve: { cheer: 1, radius: 10, ale: 0.35 }, desc: 'Ale, a fire and a song. It drinks about a third of a barrel a week for each household near it.' },
  chapel: { name: 'Chapel', cat: 'civic', size: [3, 4], cost: { wood: 60, stone: 90, gold: 90 }, weeks: 12, crew: 4, jobs: 1, upkeep: 0.8, serve: { faith: 1, radius: 14 }, desc: 'A nave, a bell and a priest. People bear a great deal when they have somewhere to put it.' },
  healer: { name: 'Healer’s Cottage', cat: 'civic', size: [2, 2], cost: { wood: 30, stone: 10, gold: 40 }, weeks: 4, crew: 2, jobs: 1, upkeep: 0.4, serve: { health: 1, radius: 10 }, desc: 'Herbs, poultices and sound advice. Plague runs slower where she lives.' },
  market: { name: 'Market Square', cat: 'civic', size: [3, 3], cost: { wood: 40, stone: 40, gold: 80 }, weeks: 6, crew: 3, jobs: 1, upkeep: 0.5, serve: { commerce: 1, radius: 12 }, trade: true, desc: 'A paved square with a cross at the middle. Merchants will come to trade at your gates once it stands.' },
  watchtower: { name: 'Watchtower', cat: 'defense', size: [2, 2], cost: { wood: 40, stone: 70, gold: 60 }, weeks: 8, crew: 3, jobs: 1, upkeep: 0.8, defense: 5, serve: { security: 1, radius: 14 }, desc: 'A lookout and a brazier. It sees raiders coming and makes the streets feel safe.' },
  barracks: { name: 'Barracks', cat: 'defense', size: [4, 3], cost: { wood: 80, stone: 60, iron: 20, gold: 120 }, weeks: 12, crew: 4, jobs: 6, upkeep: 2.5, defense: 12, rank: 1, desc: 'Six men-at-arms with the pay and the tools to match. They fight well and eat steadily.' },
  gatehouse: { name: 'Gatehouse', cat: 'defense', size: [2, 2], cost: { wood: 80, stone: 160, iron: 30, gold: 200 }, weeks: 14, crew: 4, jobs: 2, upkeep: 1.5, defense: 8, where: { gate: true }, desc: 'Towers either side of the bridge, a portcullis and a windlass to raise the drawbridge. Build it on an open gate.' },
  cathedral: { name: 'Cathedral', cat: 'civic', size: [5, 7], cost: { wood: 200, stone: 600, iron: 60, gold: 800 }, weeks: 40, crew: 8, jobs: 4, upkeep: 3, serve: { faith: 2, radius: 24, cheer: 0.5 }, rank: 3, wonder: true, desc: 'Spires you can see from the next county. Faith for a whole barony, and a good deal of standing.' },
});

/** The order the build menu shows them in. */
export const CATEGORIES = Object.freeze([
  { id: 'food', name: 'Food' },
  { id: 'industry', name: 'Industry' },
  { id: 'civic', name: 'Civic' },
  { id: 'defense', name: 'Defense' },
]);

/** The buildings the zones grow, by zone and level. */
export const GROWN = Object.freeze({
  res: ['cottage', 'house', 'townhouse'],
  market: ['stall', 'shop', 'merchant'],
  croft: ['croft', 'smallholding', 'grange'],
  craft: ['workshop', 'joinery', 'guildhall'],
});

/** The castle as it grows: what the work costs, what it holds, how many wards the barony may keep, and how well it stands. */
export const CASTLE_LEVELS = Object.freeze([
  { name: 'Timber Keep', cost: null, weeks: 0, wards: 3, defense: 6, store: { food: 600, goods: 500 }, jobs: 2, rank: 0, desc: 'A palisade on a mound and a keep of oak. Enough to hold a hamlet.' },
  { name: 'Stone Keep', cost: { wood: 200, stone: 400, iron: 40, gold: 600 }, weeks: 20, wards: 6, defense: 14, store: { food: 900, goods: 900 }, jobs: 4, rank: 1, desc: 'A keep of dressed stone, a curtain wall and a tower at each corner.' },
  { name: 'Castle', cost: { wood: 400, stone: 1000, iron: 150, gold: 1800 }, weeks: 36, wards: 12, defense: 30, store: { food: 1400, goods: 1500 }, jobs: 6, rank: 2, desc: 'A great hall, an inner ward and walls two men wide.' },
  { name: 'Citadel', cost: { wood: 800, stone: 2400, iron: 400, gold: 5000 }, weeks: 60, wards: 49, defense: 60, store: { food: 2200, goods: 2400 }, jobs: 8, rank: 3, desc: 'Concentric walls, a barbican and a hall fit for a king’s cousin.' },
]);

/** The ranks, and what a lord needs to be called one. */
export const RANKS = Object.freeze([
  { name: 'Baron', short: 'Barony', need: {} },
  { name: 'Viscount', short: 'Viscounty', need: { pop: 60, wards: 2 } },
  { name: 'Earl', short: 'Earldom', need: { pop: 160, wards: 4, building: 'chapel' } },
  { name: 'Marquess', short: 'March', need: { pop: 340, wards: 8, castle: 3 } },
  { name: 'Duke', short: 'Duchy', need: { pop: 600, wards: 12, building: 'cathedral' } },
]);

/** Roads, and what they cost a tile. */
export const ROADS = Object.freeze({
  dirt: { name: 'Dirt Road', cost: { gold: 1 }, desc: 'Beaten earth. Cheap, and it turns to mud in the rain.' },
  bridge: { name: 'Bridge', cost: { wood: 4, gold: 3 }, desc: 'A plank bridge over a river or a lake: drag from one bank to the other, up to six tiles of water, in a straight line. Both ends must be on dry land. The moat is crossed only at the gates.' },
  cobble: { name: 'Cobbled Road', cost: { stone: 1, gold: 1 }, desc: 'Paving stones laid in sand. Dry in any weather, and a good address.' },
});

/** The cost of the moat around a new ward: it grows with the realm and with how hard the ground is. */
export function annexCost(owned, hardness = 0) {
  const k = 1 + hardness * 0.8;
  return {
    gold: Math.round((260 + owned * 140) * k / 10) * 10,
    wood: Math.round((60 + owned * 30) * k / 5) * 5,
    stone: Math.round((50 + owned * 40) * k / 5) * 5,
  };
}

/** How many weeks the digging takes, and how many hands it wants. */
export function annexWork(owned) {
  return { weeks: 14 + owned * 2, crew: Math.min(24, 8 + owned * 2) };
}

/** What the lord starts with. */
export const START = Object.freeze({
  stock: { gold: 600, wood: 220, stone: 110, iron: 10, tools: 6, grain: 220, bread: 0, produce: 20, meat: 30, fish: 0, ale: 20, wool: 0, cloth: 0 },
  pop: { children: 5, adults: 12, elders: 1 },
});

export const costText = (cost) => Object.entries(cost).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${RESOURCES[k].name.toLowerCase()}`).join(', ');
export const canPay = (stock, cost) => Object.entries(cost).every(([k, n]) => (stock[k] ?? 0) >= n);
export function pay(stock, cost, k = 1) {
  for (const [r, n] of Object.entries(cost)) stock[r] = (stock[r] ?? 0) - n * k;
}
