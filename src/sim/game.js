import { newGame } from './state.js';
import { seedHamlet } from './hamlet.js';
import { allocate, assignFields, capacity, refresh, weekWork } from './economy.js';
import { computeCoverage } from './coverage.js';
import { births, mood } from './people.js';
import { construction, grow } from './growth.js';
import { merchants, raids, ranks, tribute, weather, wreck } from './events.js';
import { hallows, monsters } from './monsters.js';

/**
 * One week at a time. `step` is the whole simulation: who works, what is made
 * and eaten, who is born and who dies, what is built, and whatever crawls out
 * of the dark at the barony.
 */

/** Makes a game and gives the lord a hamlet to start from. */
export function startGame(options = {}) {
  const game = newGame(options);
  seedHamlet(game);
  prime(game);
  return game;
}

/** Works out the figures the interface shows, without moving the week on. */
export function prime(game) {
  game.cap = capacity(game);
  refresh(game, true);
  assignFields(game);
  allocate(game);
  computeCoverage(game, true);
  game.report.pop = game.pop.children + game.pop.adults + game.pop.elders;
}

export function step(game) {
  if (game.gameOver) return;
  weather(game);
  weekWork(game);
  mood(game);
  births(game);
  construction(game);
  computeCoverage(game);
  grow(game);
  merchants(game);
  monsters(game, { wreck });
  hallows(game);
  raids(game);
  tribute(game);
  ranks(game);
  game.week++;
  game.emit('week', { week: game.week });
}

export * from './actions.js';
export * from './calendar.js';
export { newGame } from './state.js';
export { capacity } from './economy.js';
export { defenseOf, threatOf } from './events.js';
export { MONSTERS, huntChance } from './monsters.js';
export { headcount, housingCap } from './people.js';
