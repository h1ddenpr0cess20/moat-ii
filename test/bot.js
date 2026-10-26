import { BUILDINGS } from '../src/catalog.js';
import { CENTER, GROUND } from '../src/config.js';
import { buildBlock, buildZone, placeBuilding, planAnnex, rectTiles, startAnnex, startCastle, setTrade } from '../src/sim/actions.js';
import { autoPlace, connect } from '../src/sim/hamlet.js';
import { defenseOf, threatOf } from '../src/sim/events.js';
import { idx } from '../src/world/world.js';

/**
 * A player that follows a sensible order of play, for tests and for tuning:
 * it lays a ring block around the castle, farms the strips beyond it, finds
 * wood and stone, builds what the town asks for, and widens the moat when it
 * can. It uses the same actions as the lord, and pays for them.
 */

const C = CENTER;

const count = (game, type) => [...game.world.buildings.values()].filter((b) => b.type === type).length;

function put(game, type, cx, cy, radius = 10) {
  if (!BUILDINGS[type]) return null;
  const spot = autoPlace(game, type, cx, cy, radius);
  if (!spot) return null;
  const r = placeBuilding(game, type, spot.x, spot.y, spot.front);
  if (!r.building) return null;
  connect(game, r.building);
  return r.building;
}

export function createBot(game) {
  const { world } = game;
  const pop = () => game.pop.children + game.pop.adults + game.pop.elders;
  const forestAt = () => {
    let sx = 0, sy = 0, n = 0;
    for (let y = C - 12; y < C + 12; y++) for (let x = C - 12; x < C + 12; x++) { const i = idx(x, y); if (world.tree[i] && world.realm[i]) { sx += x; sy += y; n++; } }
    return n > 12 ? [sx / n, sy / n] : null;
  };
  /** The thickest wood anywhere in the realm, by six-tile squares, away from the lodges already cutting. */
  const woodsInRealm = () => {
    const lodges = [...world.buildings.values()].filter((b) => b.type === 'woodcutter');
    let best = null, bestN = 20;
    for (let y0 = 0; y0 < world.size; y0 += 6) for (let x0 = 0; x0 < world.size; x0 += 6) {
      let n = 0;
      for (let y = y0; y < y0 + 6 && y < world.size; y++) for (let x = x0; x < x0 + 6 && x < world.size; x++) { const i = idx(x, y); if (world.realm[i] && world.tree[i] > 1) n += world.tree[i]; }
      const cx = x0 + 3, cy = y0 + 3;
      if (n > bestN && !lodges.some((b) => Math.hypot(b.x + 1 - cx, b.y + 1 - cy) < 9)) { bestN = n; best = [cx, cy]; }
    }
    return best;
  };
  /** The middle of the most open ground a forester could plant, within a dozen tiles of (cx, cy). */
  const openGroundNear = (cx, cy) => {
    const free = (x, y) => { const i = idx(x, y); return world.realm[i] && world.ground[i] === GROUND.GRASS && !world.tree[i] && !world.bld[i] && !world.road[i] && !world.zone[i] && !(game.blockOf && game.blockOf[i] >= 0); };
    let best = null, bestN = 30;
    for (let y = cy - 12; y <= cy + 12; y += 2) for (let x = cx - 12; x <= cx + 12; x += 2) {
      let n = 0;
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) if (dx * dx + dy * dy <= 49 && free(x + dx, y + dy)) n++;
      if (n > bestN) { bestN = n; best = [x, y]; }
    }
    return best;
  };
  const rockAt = () => {
    let sx = 0, sy = 0, n = 0;
    for (let y = C - 12; y < C + 12; y++) for (let x = C - 12; x < C + 12; x++) { const i = idx(x, y); if (world.ground[i] === GROUND.ROCK && world.realm[i]) { sx += x; sy += y; n++; } }
    return n > 4 ? [sx / n, sy / n] : null;
  };

  return {
    /** Does one round of thinking; call it each week. */
    think() {
      const wk = game.week;
      if (wk === 1) {
        // Wood first, while the trees stand.
        const forest = forestAt();
        if (forest) put(game, 'woodcutter', forest[0], forest[1], 10);
        // The ring road around the castle, with housing around it; the strips beyond it for the fields.
        buildBlock(game, C - 9, C - 9, C + 8, C + 8, { ring: 'res', core: 'none' });
        buildZone(game, rectTiles(C + 9, C - 12, C + 11, C + 5), 'wheat');
        buildZone(game, rectTiles(C - 12, C - 12, C - 10, C + 5), 'wheat');
        buildZone(game, rectTiles(C - 9, C - 12, C + 8, C - 10), 'veg');
        buildZone(game, rectTiles(C - 9, C + 9, C - 3, C + 11), 'market');
      }
      // Work for the idle: a workshop block with a storehouse at its heart, and a lane of crofts, once the town has the hands.
      if (wk % 8 === 0 && wk >= 24 && pop() > 24 && !game.botCraft) {
        for (const [x0, y0] of [[C + 12, C - 7], [C - 26, C - 7], [C - 7, C + 13], [C - 7, C - 27]]) {
          const plan = buildBlock(game, x0, y0, x0 + 13, y0 + 13, { ring: game.botCroft ? 'craft' : 'croft', core: game.botCroft ? 'none' : 'wheat' });
          if (plan.ok && plan.roads?.length) { connect(game, { x: x0, y: y0, w: 14, d: 14 }); if (game.botCroft) game.botCraft = true; else game.botCroft = true; break; }
        }
      }
      if (wk % 2 !== 0 || wk < 2) return;
      const s = game.stock;
      const forest = forestAt();
      if (!count(game, 'woodcutter') && forest && s.wood > 30) put(game, 'woodcutter', forest[0], forest[1], 10);
      if (count(game, 'woodcutter') === 1 && pop() > 30 && forest && s.wood > 40) put(game, 'woodcutter', forest[0], forest[1], 12);
      // Every lodge felled out: go where the trees still are.
      const lodges = [...world.buildings.values()].filter((b) => b.type === 'woodcutter' && b.state === 'ready');
      if (lodges.length && lodges.every((b) => b.note !== 'At work') && s.wood < 150) {
        const woods = s.wood >= 20 && s.gold > 15 ? woodsInRealm() : null;
        if (woods) put(game, 'woodcutter', woods[0], woods[1], 8);
        else {
          // No woods left in the realm: plant one on open ground, with a lodge beside it, and buy timber till it grows.
          setTrade(game, 'wood', { buy: 150 });
          const open = !game.botPlanted && openGroundNear(Math.round(C), Math.round(C));
          if (open && put(game, 'forester', open[0], open[1], 6)) { put(game, 'woodcutter', open[0] + 4, open[1], 6); game.botPlanted = true; }
        }
      }
      const lodge = [...world.buildings.values()].find((b) => b.type === 'woodcutter');
      if (lodge && count(game, 'forester') < 1 + Math.floor(pop() / 60) && s.wood > 50 && s.gold > 30) put(game, 'forester', lodge.x + 2, lodge.y + 2, 6);
      if (!count(game, 'farmstead') && s.wood > 50) put(game, 'farmstead', C + 10, C - 3, 4);
      if (count(game, 'farmstead') === 1 && s.wood > 70) put(game, 'farmstead', C - 11, C - 3, 4);
      if (count(game, 'farmstead') === 2 && pop() > 45 && s.wood > 70) put(game, 'farmstead', C, C - 11, 4);
      if (!count(game, 'well') && s.stone > 14) put(game, 'well', C, C + 8, 6);
      const rock = rockAt();
      if (!count(game, 'quarry') && rock && s.wood > 60 && s.gold > 40) put(game, 'quarry', rock[0], rock[1], 6);
      if (!count(game, 'mill') && count(game, 'farmstead') && s.wood > 120 && s.gold > 80) put(game, 'mill', C + 6, C - 8, 8);
      if (!count(game, 'tavern') && pop() > 24 && s.wood > 90) put(game, 'tavern', C, C + 7, 8);
      if (!count(game, 'chapel') && pop() > 34 && s.stone > 100 && s.wood > 70 && s.gold > 100) put(game, 'chapel', C - 8, C - 7, 8);
      if (!count(game, 'market') && pop() > 44 && s.stone > 45 && s.gold > 90) put(game, 'market', C - 6, C + 8, 8);
      if (!count(game, 'healer') && pop() > 55 && s.gold > 60) put(game, 'healer', C + 4, C + 8, 8);
      if (count(game, 'well') < 3 && pop() > 40 && s.stone > 20) put(game, 'well', C + (count(game, 'well') - 1) * 6, C - 8, 8);
      if (!count(game, 'storehouse') && s.wood > 250 && s.stone > 40) put(game, 'storehouse', C + 4, C + 9, 8);
      // Towers while the walls would not hold the raiders the barony draws, from the second year.
      if (game.week > 60 && defenseOf(game) < threatOf(game) * 1.15 && count(game, 'watchtower') < 6 && s.stone > 90 && s.wood > 60 && s.gold > 80) put(game, 'watchtower', C + 8 - count(game, 'watchtower') * 5, C + 9, 10);
      if (!count(game, 'smithy') && pop() > 40 && s.iron > 20 && s.gold > 60) put(game, 'smithy', C - 7, C + 8, 8);
      if (!count(game, 'barracks') && game.rank >= 1 && s.iron > 30 && s.stone > 70 && s.gold > 140) put(game, 'barracks', C + 7, C + 8, 8);
      // Wider moat, the best-looking neighbor first.
      if (game.week > 20 && wk % 4 === 0) {
        let best = null, bestScore = -1;
        for (const w of world.wards) {
          if (w.owned || w.dig) continue;
          const plan = planAnnex(game, w.id);
          if (!plan.ok) continue;
          const score = w.stats.arable * 1.2 + w.stats.water * 0.6 + w.stats.forest * 0.3 + w.stats.ore * 3 + w.stats.rock - w.stats.hardness * 200;
          if (score > bestScore) { bestScore = score; best = w; }
        }
        if (best && s.gold > 600) startAnnex(game, best.id);
      }
      // No ore in the barony: buy the iron the keep wants from the merchants.
      if (game.rank >= 1 && game.castleLevel < 2 && !count(game, 'ironmine')) setTrade(game, 'iron', { buy: 60 });
      if (game.castleLevel === 1 && game.rank >= 2 && s.stone > 1000 && s.gold > 1850 && s.wood > 420 && s.iron > 150) startCastle(game);
      if (game.castleLevel === 0 && game.rank >= 1 && s.stone > 450 && s.gold > 650 && s.wood > 220 && s.iron > 40) startCastle(game);
      // Fish and iron once wards give them.
      for (const type of ['fishery', 'ironmine']) {
        if (count(game, type) >= 1 || s.gold < 120) continue;
        const wantWater = type === 'fishery';
        let best = null;
        for (let y = 0; y < world.size && !best; y += 3) for (let x = 0; x < world.size; x += 3) {
          const i = idx(x, y);
          if (!world.realm[i]) continue;
          if (wantWater ? world.ground[i] === GROUND.WATER : world.ground[i] === GROUND.ORE) { best = [x, y]; break; }
        }
        if (best) put(game, type, best[0], best[1], 6);
      }
      // More food whenever the barony could not feed another dozen.
      const support = game.report.foodSupport ?? 0;
      if (wk % 6 === 0 && support < pop() * 1.35 + 8 && s.gold > 90 && s.wood > 60) {
        const farms = [...world.buildings.values()].filter((b) => b.type === 'farmstead');
        let best = null, bestScore = -1;
        for (const w of world.wards) {
          if (!w.owned) continue;
          const here = farms.filter((f) => f.x >= w.gx * 30 && f.x < (w.gx + 1) * 30 && f.y >= w.gy * 30 && f.y < (w.gy + 1) * 30).length;
          const sc = w.stats.arable / (1 + here * 2);
          if (sc > bestScore) { bestScore = sc; best = w; }
        }
        const forest = forestAt();
        if (best && best.id !== 24 && game.rank >= 0) {
          const f = put(game, 'farmstead', best.gx * 30 + 15, best.gy * 30 + 15, 9);
          if (f) buildZone(game, rectTiles(f.x - 4, f.y - 4, f.x + f.w + 3, f.y + f.d + 3), 'wheat');
        } else if (forest && !count(game, 'hunter')) put(game, 'hunter', forest[0], forest[1], 10);
      }
      // Sell the grain the town will not eat before the harvest after next.
      const keep = Math.max(260, Math.round(pop() * 0.25 * 48));
      if (game.stock.grain > keep + 40) setTrade(game, 'grain', { sell: keep });
    },
  };
}
