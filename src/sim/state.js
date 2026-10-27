import { START } from '../catalog.js';
import { mulberry32 } from '../rng.js';
import { newWorld } from '../world/index.js';
import { snapshot } from '../world/snapshot.js';

/** The prices a merchant trades at, per unit; he pays 85% of it and sells at 115%. */
export const PRICES = Object.freeze({ wood: 2, stone: 3, iron: 5, tools: 8, grain: 1.5, bread: 2, produce: 1.2, meat: 3, fish: 2.5, ale: 3, wool: 3, cloth: 6 });

/** The merchant's standing orders: sell what is above `keep`, buy up to `want`. Both null to leave a good alone. */
export const defaultTrade = () => Object.fromEntries(Object.keys(PRICES).map((g) => [g, { sell: null, buy: null }]));

/**
 * The game: the land, the lord's stores, the people, the calendar, and the
 * standing orders. `emit` tells whoever is listening (the interface, the
 * sound) that something happened.
 */
export function newGame({ seed = 'bloodmoat', difficulty = 'normal', disasters = true } = {}) {
  const world = snapshot(newWorld(seed));
  const game = {
    version: 1,
    seed: world.seedText,
    difficulty,
    /** Monsters and the hordes of the dead: off, the barony only has the weather and the Elder to answer to. */
    disasters,
    world,
    week: 0,
    stock: { ...START.stock },
    pop: { ...START.pop },
    happiness: 62,
    health: 80,
    shock: 0,
    tax: 0.1,
    castleLevel: 0,
    castleWork: null,
    rank: 0,
    trade: defaultTrade(),
    nextMerchant: 12,
    prio: {},
    nextRaid: difficulty === 'peaceful' ? Infinity : 110 + Math.floor(mulberry32(world.seed)() * 30),
    raids: { won: 0, lost: 0 },
    /** The gate the next horde of the dead is shambling toward, once it has been seen. */
    raidGate: null,
    /** What is abroad in the barony by night (see monsters.js), and when the next comes out. */
    monsters: [],
    monsterId: 0,
    monstersSlain: 0,
    nextMonster: 30 + Math.floor(mulberry32(world.seed ^ 0x5eed)() * 16),
    /** Gold taken in taxes and trade since the king's collector last came: his tithe is a share of it. */
    takings: 0,
    /** Weeks left of the wasting the vampires leave behind them. */
    plague: 0,
    weather: { harvest: 1, winter: 1 },
    /** What each good did last week: made and used. */
    flows: { made: {}, used: {} },
    /** Figures worked out each week for the interface. */
    report: {},
    log: [],
    gameOver: false,
    rnd: mulberry32(world.seed ^ 0xa5a5a5a5),
    listeners: new Map(),
    stats: { births: 0, deaths: 0, arrivals: 0, built: 0 },
  };
  game.on = (type, fn) => {
    if (!game.listeners.has(type)) game.listeners.set(type, new Set());
    game.listeners.get(type).add(fn);
    return () => game.listeners.get(type).delete(fn);
  };
  game.emit = (type, data = {}) => {
    for (const fn of game.listeners.get(type) ?? []) fn(data);
    for (const fn of game.listeners.get('*') ?? []) fn({ type, ...data });
  };
  /** Writes to the chronicle the lord reads, and tells the sound about it. */
  game.note = (text, kind = 'info', at = null) => {
    game.log.unshift({ week: game.week, text, kind, at });
    if (game.log.length > 80) game.log.length = 80;
    game.emit('note', { text, kind, at });
  };
  return game;
}

export const population = (game) => Math.round(game.pop.children + game.pop.adults + game.pop.elders);
