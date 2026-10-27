import { BUILDINGS, FOODS, GOODS } from '../catalog.js';
import { GROUND, ROAD } from '../config.js';
import { clamp } from '../rng.js';
import { idx, inb } from '../world/world.js';
import { calendar } from './calendar.js';
import { qualityAt } from './blocks.js';
import { covered } from './coverage.js';
import { headcount } from './people.js';

/**
 * The things that walk the barony by night instead of the fires and fevers
 * of an honest county: ghosts that come for a home, cultists who bring the
 * wasting to the people in it, werewolves for the flocks and goblins for the
 * stores. (The only vampire in the barony is its lord, in the castle; these
 * are his enemies, and his people's.)
 * Each comes out of the nearest wood (a ghost out of the graveyard, if there
 * is one) and goes by the streets to what it is after, a few tiles a week, so
 * the lord can see it coming; the watch, the priests and the healers each
 * have a chance a week of putting it down before it gets there.
 *
 * A monster: { id, kind, x, y, trail, path, back, target, phase, weeks, n }.
 * `trail` is the way it went last week (for the picture to walk it along),
 * `path` the way still to go, `back` the way home. `phase` is coming, there,
 * leaving or slain. `n` is how many of it there are (goblins come in a band).
 */

export const MONSTERS = Object.freeze({
  ghost: {
    name: 'Ghost', cast: 'wraith', speed: 3, linger: 2, wards: { faith: 0.7, security: 0.15 },
    targets: (b) => BUILDINGS[b.type]?.cap && b.type !== 'castle',
    warn: 'A ghost has drifted out of {from} and is making for a {target}. If the priests do not lay it, the family will flee.',
    slain: 'The priest read the ghost back into its grave. It will not walk again.',
  },
  cultists: {
    name: 'Cultists', cast: 'cultist', speed: 3, linger: 3, n: 2, wards: { faith: 0.45, health: 0.25, security: 0.35 },
    targets: (b) => BUILDINGS[b.type]?.cap && b.type !== 'castle',
    warn: 'Hooded figures out of {from}: a coven of cultists, making for a {target} with candles and a book. Where they pray, the wasting follows.',
    slain: 'The priest and the watch broke up the coven at its prayers, and burned the book.',
  },
  werewolf: {
    name: 'Werewolf', cast: 'wolf', speed: 6, linger: 0, wards: { security: 0.7 },
    targets: (b) => ['farmstead', 'croft', 'smallholding', 'grange', 'hunter'].includes(b.type),
    warn: 'Howling out of {from}: a werewolf, running for the {target}. The moon is full.',
    slain: 'A silver arrow from the watchtower brought the werewolf down. In the morning it was a man.',
  },
  goblins: {
    name: 'Goblins', cast: 'goblin', speed: 4, linger: 0, n: 3, wards: { security: 0.75 },
    targets: (b) => ['granary', 'storehouse', 'market', 'merchant'].includes(b.type),
    warn: 'Goblins! A band of them is creeping out of {from} toward the {target}, sacks over their shoulders.',
    slain: 'The watch caught the goblins with their sacks empty and chased them back under their hill.',
  },
});
export const MONSTER_KINDS = Object.keys(MONSTERS);

/** How many may be abroad at once, and the weeks between one and the next (before difficulty and the season). */
const MOST = 3;
const DIFFICULTY = { peaceful: 0.5, easy: 0.7, normal: 1, hard: 1.4 };
/** How far out of town, in steps, a monster comes from. */
const NEAR = 9, FAR = 20;
/** The last week of October. */
export const HALLOWEEN = 31;

const centerOf = (b) => [b.x + b.w / 2, b.y + b.d / 2];

/** Kills `n` of the people, the grown first. */
function kill(game, n) {
  let left = n;
  for (const k of ['adults', 'elders', 'children']) {
    const took = Math.min(game.pop[k], left);
    game.pop[k] -= took;
    left -= took;
  }
  const dead = n - left;
  game.stats.deaths += dead;
  return dead;
}

/** Can a monster go over this tile: on the realm's dry land (or a road), and not through a building. */
const walkable = (world, i) => (world.realm[i] || world.road[i] === ROAD.DIRT || world.road[i] === ROAD.COBBLE) && !world.bld[i] && world.ground[i] !== GROUND.WATER && world.moat[i] !== 1;

/**
 * The way from somewhere out of town to building `b`: a search outward from its doorstep over the walkable land,
 * streets being quicker, to a tile between NEAR and FAR steps out, a wood (or for `prefer`, a graveyard's side)
 * if there is one. Returns the path from there to the building (tile middles), or null if there is nowhere.
 */
export function findApproach(game, b, prefer = null) {
  const { world } = game;
  const N = world.size;
  const dist = new Map();
  const from = new Map();
  const open = [];
  const push = (i, d, p) => {
    if (dist.has(i) && dist.get(i) <= d) return;
    dist.set(i, d);
    from.set(i, p);
    open.push([d, i]);
  };
  for (let y = b.y - 1; y <= b.y + b.d; y++) {
    for (let x = b.x - 1; x <= b.x + b.w; x++) {
      if (!inb(x, y) || (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.d)) continue;
      const i = idx(x, y);
      if (walkable(world, i)) push(i, 0, -1);
    }
  }
  const candidates = [];
  while (open.length) {
    // A small search: sorting the frontier is quick enough.
    let k = 0;
    for (let j = 1; j < open.length; j++) if (open[j][0] < open[k][0]) k = j;
    const [d, i] = open[k];
    open[k] = open[open.length - 1];
    open.pop();
    if (d > dist.get(i)) continue;
    if (d >= NEAR) {
      const near = prefer ? prefer(i) : 0;
      candidates.push([i, (world.tree[i] ? 2 : 0) + near * 4 + game.rnd()]);
    }
    if (d >= FAR) continue;
    const x = i % N, y = Math.floor(i / N);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inb(nx, ny)) continue;
      const j = idx(nx, ny);
      if (!walkable(world, j)) continue;
      const step = world.road[j] ? 1 : world.tree[j] ? 1.8 : 1.4;
      push(j, d + step, i);
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, c) => c[1] - a[1]);
  const start = candidates[Math.floor(game.rnd() * Math.min(4, candidates.length))][0];
  const path = [];
  for (let i = start; i >= 0; i = from.get(i)) path.push([i % N + 0.5, Math.floor(i / N) + 0.5]);
  const [bx, by] = centerOf(b);
  // The last step is up to the building's side, not into it.
  const last = path[path.length - 1];
  path.push([last[0] + (bx - last[0]) * 0.35, last[1] + (by - last[1]) * 0.35]);
  return path;
}

/** What is out there, for a monster to come from: the woods, or the graveyard. */
const whereFrom = (game, x, y) => {
  const i = idx(Math.floor(x), Math.floor(y));
  if (graveyardNear(game, x, y, 4)) return 'the graveyard';
  return game.world.tree[i] ? 'the woods' : 'the dark';
};
const graveyardNear = (game, x, y, r) => [...game.world.buildings.values()].some((b) => b.type === 'graveyard' && b.state === 'ready' && Math.hypot(b.x + b.w / 2 - x, b.y + b.d / 2 - y) < r);

/** Which monster comes next, and for what: one with something to come for. */
function pickMonster(game) {
  const { world } = game;
  const people = headcount(game);
  const all = [...world.buildings.values()].filter((b) => b.state === 'ready');
  const kinds = MONSTER_KINDS.filter((k) => !(k === 'cultists' && people < 50) && all.some(MONSTERS[k].targets));
  if (!kinds.length) return null;
  const kind = kinds[Math.floor(game.rnd() * kinds.length)];
  const targets = all.filter(MONSTERS[kind].targets);
  const target = targets[Math.floor(game.rnd() * targets.length)];
  return { kind, target };
}

/** Sends a monster out after `target`. Returns it, or null if there is no way there. */
export function spawnMonster(game, kind, target) {
  const def = MONSTERS[kind];
  const prefer = kind === 'ghost' ? (i) => (graveyardNear(game, (i % game.world.size) + 0.5, Math.floor(i / game.world.size) + 0.5, 4) ? 1 : 0) : null;
  const path = findApproach(game, target, prefer);
  if (!path) return null;
  const [x, y] = path.shift();
  const m = {
    id: (game.monsterId = (game.monsterId ?? 0) + 1), kind, x, y, trail: [[x, y]], path, back: [[x, y], ...path].reverse(),
    target: target.id, phase: 'coming', weeks: def.linger, n: def.n ?? 1,
  };
  game.monsters.push(m);
  const text = def.warn.replace('{from}', whereFrom(game, x, y)).replace('{target}', BUILDINGS[target.type].name.toLowerCase());
  game.note(text, 'bad', [x, y]);
  game.emit('monster', { monster: m });
  return m;
}

/** The chance a week that the barony puts a monster down where it stands. */
export function huntChance(game, m) {
  const def = MONSTERS[m.kind];
  let guard = 0;
  for (const [k, w] of Object.entries(def.wards)) guard += w * Math.min(1.5, covered(game, k, m.x, m.y));
  return clamp(0.05 + 0.5 * guard + 0.3 * qualityAt(game, m.x, m.y), 0, 0.85);
}

/** Walks `m` up to `steps` tiles along `route`, keeping where it went in its trail. */
function walk(m, route, steps) {
  m.trail = [[m.x, m.y]];
  let left = steps;
  while (left > 0 && route.length) {
    const [nx, ny] = route[0];
    const d = Math.hypot(nx - m.x, ny - m.y);
    if (d <= left) { m.x = nx; m.y = ny; left -= d; route.shift(); } else {
      m.x += ((nx - m.x) * left) / d; m.y += ((ny - m.y) * left) / d; left = 0;
    }
    m.trail.push([m.x, m.y]);
  }
}

/** What a monster does when it gets where it was going (and each week it stays). */
function deed(game, m, b, { wreck }) {
  const at = [m.x, m.y];
  if (m.kind === 'ghost') {
    if (m.weeks > 0) { game.shock += 1; return; }
    wreck(game, b, 'haunted');
    game.shock += 3;
    game.note(`The ${BUILDINGS[b.type].name.toLowerCase()} is haunted. The family fled in the night and no one will live there now.`, 'bad', at);
  } else if (m.kind === 'cultists') {
    game.shock += 2;
    if (!game.plague && game.rnd() < 0.5) {
      game.plague = 6 + Math.floor(game.rnd() * 4);
      game.emit('plague', {});
      game.note('The coven’s prayers have brought the wasting: the people are grey and cold, and sleep all day. Keep to the hedge witch and the chapel.', 'bad', at);
    } else if (game.rnd() < 0.35 && kill(game, 1)) game.note('The cultists took someone from the street for their altar. The coven is still in the town.', 'bad', at);
  } else if (m.kind === 'werewolf') {
    const meat = game.stock.meat * 0.4, wool = game.stock.wool * 0.3;
    game.stock.meat -= meat; game.stock.wool -= wool;
    const dead = game.rnd() < 0.5 ? kill(game, 1) : 0;
    game.shock += 4;
    game.note(`The werewolf tore through the ${BUILDINGS[b.type].name.toLowerCase()}: ${Math.round(meat)} meat and ${Math.round(wool)} wool lost${dead ? ', and a farmhand with them' : ''}.`, 'bad', at);
  } else if (m.kind === 'goblins') {
    let what;
    if (b.type === 'market' || b.type === 'merchant') {
      const gold = Math.min(game.stock.gold * 0.08, 120);
      game.stock.gold -= gold;
      what = `${Math.round(gold)} gold from the strongbox of the ${BUILDINGS[b.type].name.toLowerCase()}`;
    } else {
      const list = b.type === 'granary' ? FOODS : GOODS.filter((g) => g !== 'gold' && !FOODS.includes(g));
      let n = 0;
      for (const g of list) { const t = game.stock[g] * (b.type === 'granary' ? 0.15 : 0.12); game.stock[g] -= t; n += t; }
      what = `${Math.round(n)} of the stores from the ${BUILDINGS[b.type].name.toLowerCase()}`;
    }
    game.shock += 2;
    game.note(`Goblins got into the stores and made off with ${what}.`, 'bad', at);
  }
}

/** The week of the monsters: each walks, each may be put down, and now and then another comes out. */
export function monsters(game, helpers) {
  const { world } = game;
  game.monsters = (game.monsters ?? []).filter((m) => m.phase !== 'slain' && !(m.phase === 'leaving' && !m.path.length));
  for (const m of game.monsters) {
    const def = MONSTERS[m.kind];
    if (game.rnd() < huntChance(game, m) * (m.phase === 'leaving' ? 0.5 : 1)) {
      m.phase = 'slain';
      m.trail = [[m.x, m.y]];
      game.shock = Math.max(0, game.shock - 2);
      game.monstersSlain = (game.monstersSlain ?? 0) + 1;
      game.note(def.slain, 'good', [m.x, m.y]);
      game.emit('slain', { monster: m });
      continue;
    }
    if (m.phase === 'leaving') { walk(m, m.path, def.speed); continue; }
    const b = world.buildings.get(m.target);
    if (!b || b.state !== 'ready') {
      // What it came for is gone: it goes home.
      m.phase = 'leaving';
      m.path = m.back.slice(1);
      walk(m, m.path, def.speed);
      continue;
    }
    if (m.phase === 'coming') {
      walk(m, m.path, def.speed);
      if (m.path.length) continue;
      m.phase = 'there';
    } else m.trail = [[m.x, m.y]];
    m.weeks--;
    deed(game, m, b, helpers);
    if (m.weeks < 0 || !world.buildings.has(b.id)) {
      m.phase = 'leaving';
      m.path = m.back.slice(1);
    }
  }
  if (!game.disasters || game.week < (game.nextMonster ?? Infinity) || headcount(game) < 20) return;
  const cal = calendar(game.week);
  const diff = DIFFICULTY[game.difficulty] ?? 1;
  // Autumn is the monsters' season, and the nights draw in toward All Hallows'.
  game.nextMonster = game.week + Math.round((16 + game.rnd() * 20) / diff * (cal.season === 2 ? 0.6 : 1));
  if (game.monsters.length >= MOST) return;
  const pick = pickMonster(game);
  if (pick) spawnMonster(game, pick.kind, pick.target);
}

/**
 * All Hallows' Eve, the last week of October: the people carve the pumpkins in store into lanterns and keep the
 * night (glad of it, if there are pumpkins enough), and something always comes out of the dark for it.
 */
export function hallows(game) {
  const cal = calendar(game.week);
  if (cal.inYear !== HALLOWEEN) return;
  const people = headcount(game);
  const want = people * 0.15;
  const lit = game.stock.produce >= want;
  if (lit) {
    game.stock.produce -= want;
    game.flows.used.produce = (game.flows.used.produce ?? 0) + want;
    game.shock = Math.max(0, game.shock - 8);
    game.happiness = Math.min(100, game.happiness + 4);
    game.note(`All Hallows’ Eve. Every doorstep has a lantern carved from a pumpkin, and the town keeps the night with cider and bonfires.`, 'good');
  } else {
    game.shock += 3;
    game.note('All Hallows’ Eve, and not a pumpkin in the stores to carve: the doorsteps are dark, and the people afraid.', 'bad');
  }
  game.emit('hallows', { lit });
  if (game.disasters && people >= 20 && game.monsters.length < MOST + 1) {
    const pick = pickMonster(game);
    if (pick) spawnMonster(game, pick.kind, pick.target);
  }
}
