import { BUILDINGS } from '../catalog.js';
import { clamp } from '../rng.js';
import { calendar, coldness } from './calendar.js';
import { computeCoverage, covered } from './coverage.js';

/**
 * The people: how contented they are, who is born, who dies, and who turns
 * up at the gate asking for a roof. Three cohorts are enough: children, the
 * grown, and the old.
 */

/** Rooms the castle itself has for the household. */
const CASTLE_ROOMS = 8;

/** Stochastic rounding: 2.3 is 2 seven times in ten and 3 the rest. */
const roll = (game, x) => Math.floor(x + game.rnd());

export const headcount = (game) => game.pop.children + game.pop.adults + game.pop.elders;

/** Weeks until the harvest that comes after this one is gathered in. */
export const weeksToHarvest = (week) => { const w = calendar(week).inYear; return w < 24 ? 24 - w : 72 - w; };

/** Could the stores and the fields keep `people` mouths until the next harvest, and for the year after? */
export function foodFor(game, people) {
  const r = game.report;
  const runway = weeksToHarvest(game.week);
  return (r.foodStock ?? 0) >= runway * 0.25 * people * 0.75 && (r.foodSupport ?? 0) >= people;
}

export function housingCap(game, { building = true } = {}) {
  let cap = CASTLE_ROOMS + (game.blockGain?.cap ?? 0);
  for (const b of game.world.buildings.values()) {
    const c = BUILDINGS[b.type]?.cap;
    if (c && (b.state === 'ready' || (building && b.state === 'building'))) cap += c;
  }
  return cap;
}

/** What the houses are looked after by, averaged over the people who live in them. */
function care(game) {
  const out = { water: 0, faith: 0, cheer: 0, health: 0, security: 0, commerce: 0 };
  let weight = 0;
  for (const b of game.world.housing ?? []) {
    const w = BUILDINGS[b.type].cap;
    const cx = b.x + b.w / 2, cy = b.y + b.d / 2;
    for (const k of Object.keys(out)) out[k] += covered(game, k, cx, cy) * w;
    weight += w;
  }
  for (const k of Object.keys(out)) out[k] = weight ? out[k] / weight : 0;
  return out;
}

export function mood(game) {
  const r = game.report;
  computeCoverage(game);
  const c = care(game);
  r.care = c;
  const cold = coldness(game.week);
  let h = 50;
  const f = r.foodSat ?? 1;
  h += f >= 0.95 ? 8 : f >= 0.8 ? 2 : -Math.min(45, (0.8 - f) * 90);
  h += ((r.variety ?? 1) - 1) * 3;
  if (cold > 0) h += (r.fuelSat ?? 1) >= 0.99 ? 3 : -(1 - r.fuelSat) * 45 * cold;
  h += 4 * (r.aleSat ?? 1) * (c.cheer > 0.05 ? 1 : 0.5);
  h += game.stock.cloth > 1 ? 2 : 0;
  h += 5 * c.water + 7 * c.faith + 7 * c.cheer + 3 * c.health + 5 * c.security + 3 * c.commerce;
  h -= (game.tax - 0.1) * 70;
  const idle = r.workforce ? (r.idle ?? 0) / r.workforce : 0;
  if (idle > 0.2) h -= (idle - 0.2) * 40;
  h += game.blockGain?.mood ?? 0;
  h -= game.shock;
  game.shock *= 0.93;
  game.happiness += (clamp(h, 0, 100) - game.happiness) * 0.25;
  r.happinessTarget = h;
  // Health: clean water, a healer, and a varied table.
  let hp = 62 + 14 * c.water + 18 * c.health + ((r.variety ?? 1) - 1) * 4 + (f >= 0.9 ? 4 : -10);
  if (game.plague > 0) hp -= 25;
  game.health += (clamp(hp, 0, 100) - game.health) * 0.2;
}

export function births(game) {
  const r = game.report;
  const { pop } = game;
  const total = headcount(game);
  const cap = housingCap(game, { building: false });
  r.cap = cap;
  r.pop = total;

  // Born.
  const rate = pop.adults * 0.0018 * (game.happiness / 60) * (r.foodSat ?? 1) * (r.fuelSat ?? 1);
  const born = total < cap && foodFor(game, total + 1) ? roll(game, rate) : 0;
  pop.children += born;
  game.stats.births += born;

  // Growing up and growing old.
  const grown = roll(game, pop.children / (14 * 48));
  const aged = roll(game, pop.adults / (38 * 48));
  const grewUp = Math.min(pop.children, grown);
  pop.children -= grewUp;
  pop.adults += grewUp;
  const grewOld = Math.min(pop.adults, aged);
  pop.adults -= grewOld;
  pop.elders += grewOld;

  // Died.
  const cold = coldness(game.week);
  const starving = Math.max(0, 0.8 - (r.foodSat ?? 1)) * 0.035;
  const freezing = cold > 0 ? Math.max(0, 1 - (r.fuelSat ?? 1)) * 0.04 * cold : 0;
  const ill = game.plague > 0 ? 0.02 * (1 - 0.6 * (r.care?.health ?? 0)) : 0;
  const frailty = (100 - game.health) * 0.00003;
  let dead = 0;
  for (const [kind, base] of [['children', 0.0004], ['adults', 0.0005], ['elders', 0.004]]) {
    const n = roll(game, pop[kind] * (base + starving + freezing + ill + frailty));
    const took = Math.min(pop[kind], n);
    pop[kind] -= took;
    dead += took;
  }
  game.stats.deaths += dead;
  if (dead >= 3) game.note(`${dead} died this week${starving > 0.01 ? ' of hunger' : freezing > 0.005 ? ' of the cold' : ill > 0 ? ' of the plague' : ''}.`, 'bad');
  if (game.plague > 0) {
    game.plague--;
    if (game.plague === 0) game.note('The plague has passed.', 'good');
  }

  // Left, or arrived.
  if (game.happiness < 38 && total > 6) {
    const gone = Math.min(pop.adults, roll(game, total * 0.012 * (38 - game.happiness) / 10));
    if (gone > 0) { pop.adults -= gone; game.note(`${gone} left the barony, sick of it.`, 'bad'); }
  }
  const free = cap - headcount(game);
  const jobless = r.workforce ? (r.idle ?? 0) / r.workforce : 0;
  if (free >= 2 && game.happiness >= 50 && (r.foodSat ?? 1) >= 0.95 && (r.fuelSat ?? 1) >= 0.9 && foodFor(game, total + 6) && jobless < 0.3) {
    const p = 0.25 + (game.happiness - 50) * 0.012;
    if (game.rnd() < p) {
      const size = Math.min(free, 2 + Math.floor(game.rnd() * 3));
      const kids = size > 3 ? 1 + Math.floor(game.rnd() * 2) : size > 2 ? 1 : 0;
      pop.adults += size - kids;
      pop.children += kids;
      game.stats.arrivals += size;
      game.emit('arrival', { size });
      if (size >= 3 && game.rnd() < 0.5) game.note(`A family of ${size} has come looking for a home.`, 'good');
    }
  }
  pop.children = Math.max(0, pop.children);
  pop.adults = Math.max(0, pop.adults);
  pop.elders = Math.max(0, pop.elders);
  if (headcount(game) < 1 && game.week > 4 && !game.gameOver) {
    game.gameOver = true;
    game.note('No one is left. The barony has fallen.', 'bad');
    game.emit('gameover', {});
  }
}
