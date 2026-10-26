import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOODS } from '../src/catalog.js';
import { demolish, headcount, setTax, startGame, step } from '../src/sim/game.js';
import { createBot } from './bot.js';

test('every starting hamlet has a connected farm, granary and woodcutter', () => {
  for (const seed of ['moat', 'oxmere', 'a1', 'b2', 'karst']) {
    const game = startGame({ seed });
    for (const type of ['farmstead', 'granary', 'woodcutter']) {
      const b = [...game.world.buildings.values()].find((x) => x.type === type);
      assert.ok(b, `${seed} has a ${type}`);
      assert.ok(b.connected, `${seed}: the ${type} is joined to the castle by a road`);
    }
  }
});

test('a bot plays three years without a crack: numbers stay finite and stores never go negative', () => {
  const game = startGame({ seed: 'c3' });
  const bot = createBot(game);
  for (let w = 0; w < 144 && !game.gameOver; w++) {
    bot.think();
    step(game);
    for (const g of GOODS) assert.ok(Number.isFinite(game.stock[g]) && game.stock[g] >= 0, `week ${w}: ${g} is ${game.stock[g]}`);
    assert.ok(Number.isFinite(game.happiness) && game.happiness >= 0 && game.happiness <= 100);
  }
  assert.ok(headcount(game) > 10, 'the town is alive');
});

test('taxes: heavier rates bring in more coin and weigh on the mood', () => {
  const a = startGame({ seed: 'moat' }), b = startGame({ seed: 'moat' });
  setTax(a, 0.05);
  setTax(b, 0.25);
  for (let w = 0; w < 6; w++) { step(a); step(b); }
  assert.ok(b.report.taxes > a.report.taxes);
  assert.ok(b.report.happinessTarget < a.report.happinessTarget);
});

test('a town with no food does not grow', () => {
  const game = startGame({ seed: 'moat' });
  game.stock.grain = 0; game.stock.produce = 0; game.stock.meat = 0;
  const before = headcount(game);
  for (let w = 0; w < 8; w++) step(game);
  assert.ok(headcount(game) <= before);
});

test('the clearing tool fells trees and breaks rock, and the stores gain by it', () => {
  const game = startGame({ seed: 'moat' });
  const { world } = game;
  let tree = null, rock = null;
  for (let i = 0; i < world.tree.length && !(tree && rock); i++) {
    if (!world.realm[i] || world.bld[i] || world.road[i] || world.zone[i]) continue;
    if (!tree && world.tree[i] > 0) tree = i;
    if (!rock && world.ground[i] === 1 && world.amount[i] > 0) rock = i;
  }
  assert.ok(tree !== null, 'there are trees in the realm');
  const wood = game.stock.wood;
  assert.ok(demolish(game, tree % world.size, Math.floor(tree / world.size)).ok);
  assert.equal(world.tree[tree], 0);
  assert.ok(game.stock.wood > wood);
  if (rock !== null) {
    const stone = game.stock.stone;
    assert.ok(demolish(game, rock % world.size, Math.floor(rock / world.size)).ok);
    assert.ok(game.stock.stone > stone);
  }
  assert.equal(demolish(game, 3, 3).ok, false, 'nothing is cleared outside the realm');
});

/** Zones the free tiles beside the town's streets for `zone`, up to `n` of them. */
async function zoneByStreets(game, zone, n) {
  const { network } = await import('../src/world/roads.js');
  const { idx } = await import('../src/world/world.js');
  const { buildZone } = await import('../src/sim/game.js');
  const { world } = game;
  const { dist } = network(world);
  const tiles = [];
  for (let i = 0; i < world.size * world.size && tiles.length < n; i++) {
    if (dist[i] < 0) continue;
    const x = i % world.size, y = Math.floor(i / world.size);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const j = idx(x + dx, y + dy);
      if (!world.zone[j] && !world.bld[j] && !world.road[j] && !world.tree[j]) tiles.push([x + dx, y + dy]);
    }
  }
  return buildZone(game, tiles, zone, { free: true });
}

test('hands wanting work raise workshops and smallholdings where they are zoned, and these make tools and food', async () => {
  const town = async (zone) => {
    const game = startGame({ seed: 'moat' });
    await zoneByStreets(game, zone, 40);
    // More people than the hamlet has work for, and the stores to build with.
    game.pop.adults += 14;
    Object.assign(game.stock, { wood: 600, stone: 200, gold: 900, grain: 400 });
    const made = {};
    game.on('week', () => { for (const [r, n] of Object.entries(game.flows.made)) made[r] = (made[r] ?? 0) + n; });
    for (let w = 0; w < 30; w++) step(game);
    return { kinds: [...game.world.buildings.values()].filter((b) => b.state === 'ready').map((b) => b.type), made };
  };
  const craft = await town('craft');
  assert.ok(craft.kinds.includes('workshop'), `a workshop went up: ${craft.kinds.join(', ')}`);
  assert.ok(craft.made.tools > 0, 'the workshops made tools');
  const croft = await town('croft');
  assert.ok(croft.kinds.includes('croft'), `a croft went up: ${croft.kinds.join(', ')}`);
});

test('fires are rare: a town of a hundred buildings loses only a few in a decade', async () => {
  const { fires } = await import('../src/sim/events.js');
  const { BUILDINGS } = await import('../src/catalog.js');
  const game = startGame({ seed: 'moat' });
  // A hundred cottages, set down by fiat where nothing else is: the fire roll only looks at the buildings.
  for (let k = 0; k < 100; k++) game.world.buildings.set(1000 + k, { id: 1000 + k, type: 'cottage', x: 10 + (k % 10) * 3, y: 10 + Math.floor(k / 10) * 3, w: 2, d: 2, state: 'ready', level: 1 });
  let burned = 0;
  game.on('fire', () => burned++);
  for (let w = 0; w < 480; w++) { game.week = w; fires(game); }
  assert.ok(BUILDINGS.cottage);
  assert.ok(burned <= 8, `${burned} burned in ten years`);
});

test('food comes first only while the town needs it: full granaries let the farmhands go to other work', async () => {
  const { priorityOf } = await import('../src/sim/economy.js');
  const game = startGame({ seed: 'moat' });
  assert.equal(priorityOf(game, 'farmstead'), 3, 'a hamlet with a thin store puts its fields first');
  game.stock.grain = 2000;
  assert.equal(priorityOf(game, 'farmstead'), 2, 'with a year and more in store, the fields share hands with everyone else');
  game.prio.farmstead = 3;
  assert.equal(priorityOf(game, 'farmstead'), 3, 'the lord’s own order still stands');
});

test('raiders make for the weakest gate, and a raised drawbridge turns them elsewhere', async () => {
  const { raids } = await import('../src/sim/events.js');
  const game = startGame({ seed: 'moat' });
  const gates = game.world.gates;
  assert.ok(gates.length >= 2, 'the home ward has gates');
  // Every drawbridge raised but one: that one is the weakest, whatever the dice say.
  for (const g of gates) g.open = false;
  gates[1].open = true;
  for (let n = 0; n < 6; n++) {
    game.nextRaid = game.week + 3;
    raids(game);
    assert.equal(game.raidGate, gates[1]);
  }
});

test('the king’s collector takes a share of the year’s takings as well as his due', async () => {
  const { tribute } = await import('../src/sim/events.js');
  const due = (takings) => {
    const game = startGame({ seed: 'moat' });
    game.week = 2 * 48 + 24;
    game.stock.gold = 10000;
    game.takings = takings;
    let paid = 0;
    game.on('tribute', (e) => { paid = e.due; });
    tribute(game);
    assert.equal(game.takings, 0, 'the count starts again after his visit');
    return paid;
  };
  assert.equal(due(1200) - due(0), 400);
});

test('the benches stand idle when the tool racks are full', async () => {
  const { priorityOf } = await import('../src/sim/economy.js');
  const game = startGame({ seed: 'moat' });
  assert.equal(priorityOf(game, 'smithy'), 2);
  game.stock.tools = 500;
  assert.equal(priorityOf(game, 'smithy'), 1);
  assert.equal(priorityOf(game, 'workshop'), 1);
});
