import { BUILDINGS, CASTLE_LEVELS, GOODS, RANKS } from '../catalog.js';
import { CENTER } from '../config.js';
import { clamp } from '../rng.js';
import { removeBuilding } from '../world/buildings.js';
import { network } from '../world/roads.js';
import { idx } from '../world/world.js';
import { ownedCount } from '../world/wards.js';
import { setZone } from '../world/zoning.js';
import { calendar } from './calendar.js';
import { qualityAt } from './blocks.js';
import { covered } from './coverage.js';
import { headcount } from './people.js';
import { PRICES } from './state.js';

/**
 * What happens to the barony that the lord did not order: the year's weather,
 * merchants at the gates, fires, plague, raiders, the king's collector, and
 * the day the lord is called by a higher name.
 */

const DIRECTIONS = ['north', 'east', 'south', 'west'];
/** Weeks of warning before a raid: time to man a tower or raise the bridge. */
const WARNING = 3;
/** Gold a raider's strength is bought off for, if the treasury has it and the walls would not hold; each time they are paid they come back wanting a quarter more. */
export const PAYOFF = 36;
export const payoffPrice = (game, strength) => Math.round(strength * PAYOFF * (1 + 0.25 * (game.raids.bought ?? 0)));
const DIFFICULTY = { peaceful: 0, easy: 0.7, normal: 1, hard: 1.4 };
/** How much a raised drawbridge multiplies a gate's defense. */
const RAISED = 2.4;
/** The king's share of what the barony took in taxes and trade over the year, on top of his due for its land: a third. */
const TITHE = 1 / 3;

/** The year's weather is decided at the turn of the seasons. */
export function weather(game) {
  const cal = calendar(game.week);
  if (cal.weekInSeason !== 0) return;
  if (cal.season === 0) {
    game.weather.harvest = clamp(0.78 + game.rnd() * 0.5, 0.7, 1.3);
    // The first year is kind: a lord has a season to find his feet.
    if (cal.year === 1) game.weather.harvest = Math.max(1.02, game.weather.harvest);
    const h = game.weather.harvest;
    if (h < 0.88) game.note('A cold, dry spring. The harvest will be thin.', 'bad');
    else if (h > 1.12) game.note('A mild, wet spring: the harvest should be a good one.', 'good');
    else game.note('Spring has come. Fields want sowing.', 'info');
  } else if (cal.season === 1) game.note('Summer. The days are long and the fields are growing.', 'info');
  else if (cal.season === 2) {
    game.note(game.weather.harvest < 0.88 ? 'Harvest time, and not much to bring in.' : 'Harvest time. Every hand to the fields.', 'info');
    game.emit('harvest', {});
  } else {
    game.weather.winter = clamp(0.85 + game.rnd() * 0.55, 0.85, 1.4);
    game.note(game.weather.winter > 1.25 ? 'A hard winter is coming. Stack the firewood high.' : 'Winter is here. Keep the hearths lit.', game.weather.winter > 1.25 ? 'bad' : 'info');
  }
  game.emit('season', { season: cal.season });
}

/** Does a road lead from the castle to the gate? */
const gateConnected = (game, g) => {
  const { dist } = network(game.world);
  return g.tiles.some(([x, y]) => dist[idx(x, y)] >= 0);
};

/** A caravan turns up at an open gate, if there is a market for it to come to, and trades by the lord's standing orders. */
export function merchants(game) {
  const { world } = game;
  if (game.week < game.nextMerchant) return;
  const market = [...world.buildings.values()].find((b) => b.type === 'market' && b.state === 'ready');
  const gate = world.gates.find((g) => g.open && gateConnected(game, g));
  if (!market || !gate) { game.nextMerchant = game.week + 4; return; }
  game.nextMerchant = game.week + 8 + Math.floor(game.rnd() * 5);
  const toll = gate.gatehouse && world.buildings.get(gate.gatehouse)?.state === 'ready' ? 1.12 : 1;
  const sold = [], bought = [];
  let earned = 0;
  for (const res of GOODS) {
    const rule = game.trade[res];
    if (!rule) continue;
    if (rule.sell !== null && rule.sell !== undefined && game.stock[res] > rule.sell) {
      const n = Math.min(game.stock[res] - rule.sell, 600 / PRICES[res]);
      const gold = n * PRICES[res] * 0.85 * toll;
      game.stock[res] -= n; game.stock.gold += gold; earned += gold;
      game.flows.used[res] = (game.flows.used[res] ?? 0) + n;
      sold.push(`${Math.round(n)} ${res}`);
    }
    if (rule.buy !== null && rule.buy !== undefined && game.stock[res] < rule.buy) {
      const price = PRICES[res] * 1.15;
      const n = Math.min(rule.buy - game.stock[res], game.stock.gold / price, 400 / PRICES[res]);
      if (n >= 1) {
        game.stock[res] += n; game.stock.gold -= n * price;
        game.flows.made[res] = (game.flows.made[res] ?? 0) + n;
        bought.push(`${Math.round(n)} ${res}`);
      }
    }
  }
  game.emit('merchant', { gate });
  if (sold.length || bought.length) game.note(`Merchants at the ${DIRECTIONS[gate.dir]} gate: ${sold.length ? `sold ${sold.join(', ')} for ${Math.round(earned)} gold` : ''}${sold.length && bought.length ? '; ' : ''}${bought.length ? `bought ${bought.join(', ')}` : ''}.`, 'good', gate.mid);
  else game.note('A merchant caravan came to the gate, but you have given no orders. Open the Trade ledger.', 'info', gate.mid);
}

const FLAMMABLE = { cottage: 1, stall: 1.2, house: 0.55, shop: 0.6, townhouse: 0.4, merchant: 0.4, farmstead: 0.7, woodcutter: 0.8, hunter: 0.8, fishery: 0.8, storehouse: 0.5, granary: 0.6, weaver: 0.7, croft: 0.9, smallholding: 0.7, grange: 0.5, workshop: 1.1, joinery: 0.9, guildhall: 0.5 };
const HOT = new Set(['smithy', 'mill', 'brewery', 'tavern', 'joinery', 'guildhall']);
/** The chance a week that a building catches, before what is near it is counted: a town of a hundred roofs sees a fire every few years. */
const IGNITE = 0.00006;
/** The chance a burning building takes a neighbor with it, before wells and courtyards. */
const SPREAD = 0.2;

export function burn(game, b, depth = 0) {
  const { world } = game;
  if (!world.buildings.has(b.id) || b.type === 'castle') return;
  const at = [b.x + b.w / 2, b.y + b.d / 2];
  removeBuilding(world, b.id);
  // The people's own plots stay zoned, so the lot is built on again.
  const zone = BUILDINGS[b.type].auto;
  if (zone) for (let y = b.y; y < b.y + b.d; y++) for (let x = b.x; x < b.x + b.w; x++) setZone(world, x, y, zone);
  for (const g of world.gates) if (g.gatehouse === b.id) g.gatehouse = 0;
  world.netVersion = (world.netVersion ?? 0) + 1;
  game.emit('fire', { at, building: b });
  game.note(`The ${BUILDINGS[b.type].name.toLowerCase()} burned down.`, 'bad', at);
  // A fire may take the roof next door, but the neighbors are out with buckets: it seldom goes further.
  if (depth < 1) {
    for (const o of [...world.buildings.values()]) {
      if (o.type === 'castle' || !FLAMMABLE[o.type]) continue;
      const d = Math.hypot(o.x + o.w / 2 - at[0], o.y + o.d / 2 - at[1]);
      if (d < 2.8 && game.rnd() < SPREAD * FLAMMABLE[o.type] * (1 - 0.8 * covered(game, 'water', at[0], at[1])) * (1 - 0.5 * qualityAt(game, o.x + o.w / 2, o.y + o.d / 2))) burn(game, o, depth + 1);
    }
  }
}

export function fires(game) {
  if (!game.disasters) return;
  const { world } = game;
  const cal = calendar(game.week);
  const season = cal.season === 1 ? 1.3 : cal.season === 3 ? 0.8 : 1;
  const hot = [...world.buildings.values()].filter((b) => HOT.has(b.type) && b.state === 'ready');
  for (const b of [...world.buildings.values()]) {
    const f = FLAMMABLE[b.type];
    if (!f || b.state !== 'ready') continue;
    const cx = b.x + b.w / 2, cy = b.y + b.d / 2;
    let near = 0;
    for (const h of hot) if (h !== b && Math.hypot(h.x + h.w / 2 - cx, h.y + h.d / 2 - cy) < 5) near++;
    const p = IGNITE * f * (1 + 0.5 * near) * season * (1 - 0.85 * covered(game, 'water', cx, cy)) * (1 - 0.3 * qualityAt(game, cx, cy)) * (game.difficulty === 'peaceful' ? 0.5 : 1);
    if (game.rnd() < p) { burn(game, b); break; }
  }
}

export function plague(game) {
  if (!game.disasters || game.plague > 0) return;
  const people = headcount(game);
  if (people < 45) return;
  const p = 0.0016 * (people / 100) * (1 - 0.65 * (game.report.care?.health ?? 0)) * (1 + Math.max(0, 70 - game.health) * 0.02);
  if (game.rnd() < p) {
    game.plague = 8 + Math.floor(game.rnd() * 5);
    game.shock += 6;
    game.note('A sickness has come into the barony. Keep to the wells and the healer.', 'bad');
    game.emit('plague', {});
  }
}

/** How well the barony would stand a raid on a gate. */
export function defenseOf(game, gate = null) {
  const { world } = game;
  const castle = world.buildings.get(1);
  let d = CASTLE_LEVELS[game.castleLevel].defense * (0.6 + 0.4 * (castle.eff ?? 1));
  for (const b of world.buildings.values()) {
    const def = BUILDINGS[b.type];
    if (b.state !== 'ready' || !def?.defense || !b.connected) continue;
    d += def.defense * (0.5 + 0.5 * Math.min(1, b.eff || 0));
  }
  if (gate?.gatehouse) {
    const g = world.buildings.get(gate.gatehouse);
    if (g?.state === 'ready') d += BUILDINGS.gatehouse.defense * (0.5 + 0.5 * Math.min(1, g.eff || 0));
  }
  return d * 1.3;
}

/**
 * How big the next raid is likely to be, for the lord to judge his defenses by. Raiders come for what there is to
 * take: they grow bolder with the years, but most of all with the people and the land behind the moat.
 */
export function threatOf(game) {
  const cal = calendar(game.week);
  return (2 + cal.year * 1.4 + headcount(game) * 0.05 + ownedCount(game.world) * 1.8) * (DIFFICULTY[game.difficulty] ?? 1);
}

/** The gate raiders make for: the weakest, a raised drawbridge counting for what it is worth. Ties fall to chance. */
function weakestGate(game) {
  let best = [], low = Infinity;
  for (const g of game.world.gates) {
    const d = defenseOf(game, g) * (g.open ? 1 : RAISED);
    if (d < low - 1e-6) { low = d; best = [g]; } else if (d < low + 1e-6) best.push(g);
  }
  return best.length ? best[Math.floor(game.rnd() * best.length)] : null;
}

function nearest(game, gate, n) {
  const [gx, gy] = gate.mid;
  return [...game.world.buildings.values()].filter((b) => b.type !== 'castle')
    .map((b) => [b, Math.hypot(b.x + b.w / 2 - gx, b.y + b.d / 2 - gy)]).sort((a, b) => a[1] - b[1]).slice(0, n).map(([b]) => b);
}

export function raids(game) {
  if (!game.disasters) return;
  if (game.week === game.nextRaid - WARNING && game.nextRaid !== Infinity) {
    game.raidGate = weakestGate(game);
    const g = game.raidGate;
    game.note(g ? `Smoke and torches to the ${DIRECTIONS[g.dir]}: raiders are marching on the ${DIRECTIONS[g.dir]} gate. They will be here in ${WARNING} weeks.` : 'Raiders are marching on the castle!', 'bad', g?.mid ?? [CENTER, CENTER]);
    game.emit('warning', { gate: g });
    return;
  }
  if (game.week < game.nextRaid) return;
  const diff = DIFFICULTY[game.difficulty] ?? 1;
  const gate = game.raidGate ?? null;
  game.raidGate = null;
  game.nextRaid = game.week + Math.round((40 + game.rnd() * 30) / Math.max(0.6, diff));
  // The first to come are only scouts.
  const strength = threatOf(game) * (0.8 + game.rnd() * 0.5) * (game.raids.won + game.raids.lost === 0 ? 0.65 : 1);
  const raised = gate && !gate.open;
  const defense = defenseOf(game, gate);
  const ratio = (raised ? defense * RAISED : defense) / strength;
  const at = gate?.mid ?? [CENTER, CENTER];
  let outcome;
  if (ratio >= 1.3) {
    outcome = 'rout';
    game.stock.gold += Math.round(strength * 6);
    game.raids.won++;
    game.note(raised ? 'Raiders found the drawbridge up and went away cold and cross.' : `Raiders were thrown back from the ${gate ? DIRECTIONS[gate.dir] : ''} gate. They left their plunder: ${Math.round(strength * 6)} gold.`, 'good', at);
  } else if (ratio >= 1) {
    outcome = 'repelled';
    game.raids.won++;
    const b = gate && game.rnd() < 0.4 ? nearest(game, gate, 4)[Math.floor(game.rnd() * 4)] : null;
    if (b) burn(game, b);
    game.note(b ? 'Raiders were driven off, but not before they put a torch to a roof.' : `Raiders were driven off from the ${gate ? DIRECTIONS[gate.dir] : ''} gate.`, b ? 'info' : 'good', at);
  } else if (game.payoff !== false && game.stock.gold >= payoffPrice(game, strength)) {
    // The walls would not hold, but the treasury will: the steward meets them at the gate with a purse.
    outcome = 'bought';
    const price = payoffPrice(game, strength);
    game.raids.bought = (game.raids.bought ?? 0) + 1;
    game.stock.gold -= price;
    game.flows.used.gold = (game.flows.used.gold ?? 0) + price;
    game.shock += 2;
    game.note(`The walls would not have held. Your steward paid the raiders ${price} gold, and they went away. They will want more next time: build towers.`, 'info', at);
  } else {
    const severe = ratio < 0.6;
    outcome = severe ? 'sacked' : 'pillaged';
    game.raids.lost++;
    const loot = severe ? 0.25 : 0.12;
    for (const r of GOODS) game.stock[r] *= 1 - loot;
    const burned = gate ? nearest(game, gate, severe ? 3 : 1) : [];
    burned.forEach((b) => burn(game, b));
    const dead = Math.min(headcount(game) - 1, Math.round(headcount(game) * (severe ? 0.04 : 0.015)));
    for (const k of ['adults', 'children', 'elders']) game.pop[k] = Math.max(0, game.pop[k] - Math.round(dead * game.pop[k] / Math.max(1, headcount(game))));
    game.shock += severe ? 14 : 6;
    game.note(severe ? 'The barony has been sacked. Raiders took a quarter of everything and put the gate quarter to the torch.' : 'Raiders broke in at the gate, took what they could carry and left.', 'bad', at);
  }
  game.emit('raid', { gate, outcome, at, strength, defense });
}

/** The king's collector comes each autumn from the third year. */
export function tribute(game) {
  const cal = calendar(game.week);
  if (cal.inYear !== 24) return;
  // What came in since the collector's last visit (or since the barony began): his tithe is a share of it.
  const takings = game.takings ?? 0;
  game.takings = 0;
  if (cal.year < 3 || game.difficulty === 'peaceful') return;
  // What the king asks follows what the barony takes in, and how much land it holds: a hamlet is not taxed like a town.
  const due = Math.round((ownedCount(game.world) * 25 + takings * TITHE) * (game.difficulty === 'easy' ? 0.6 : 1));
  const paid = Math.min(due, game.stock.gold);
  game.stock.gold -= paid;
  game.flows.used.gold = (game.flows.used.gold ?? 0) + paid;
  if (paid >= due) game.note(`The king's collector has had his ${due} gold, and gone.`, 'info');
  else { game.shock += 8; game.note(`The king's collector wanted ${due} gold and took the ${Math.round(paid)} you had. He was not pleased.`, 'bad'); }
  game.emit('tribute', { due, paid });
}

/** Does the lord now deserve a grander name? */
export function ranks(game) {
  if (game.week % 4 !== 0) return;
  const next = RANKS[game.rank + 1];
  if (!next) return;
  const n = next.need;
  const buildings = (type) => [...game.world.buildings.values()].some((b) => b.type === type && b.state === 'ready');
  if (n.pop && headcount(game) < n.pop) return;
  if (n.wards && ownedCount(game.world) < n.wards) return;
  if (n.castle && game.castleLevel < n.castle - 1) return;
  if (n.building && !buildings(n.building)) return;
  game.rank++;
  game.shock = Math.max(0, game.shock - 6);
  game.note(`The king has raised you to ${next.name}. New works are open to you.`, 'good', [CENTER, CENTER]);
  game.emit('rank', { rank: game.rank });
}

