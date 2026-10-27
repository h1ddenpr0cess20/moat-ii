import zombie from 'madness-engine/characters/zombie';
import skeleton from 'madness-engine/characters/skeleton';
import count from 'madness-engine/characters/count';
import cultist from 'madness-engine/characters/cultist';
import wraith from 'madness-engine/characters/wraith';
import wolf from 'madness-engine/characters/wolf';
import goblin from 'madness-engine/characters/goblin';
import bat from 'madness-engine/characters/bat';
import crow from 'madness-engine/characters/crow';
import blackcat from 'madness-engine/characters/blackcat';

/**
 * The lord and the monsters, from the engine's cast. The Count is the lord
 * of the castle, the only vampire in the barony, walking his own courtyard by
 * night. The zombie and the skeleton make the hordes; the wraith is the
 * ghosts, the cultist the covens, the wolf the werewolves and the goblin the
 * goblins; and the bats, the crows and the black cats only go about their
 * business.
 *
 * The cast were sculpted for games where a figure is a tile or two high. Here
 * a tile is about four and a half meters: a man stands 0.4 of a tile, a door
 * 0.45. So each is stood up at the size it would really be (`size`, in tiles,
 * along its `measure`: its height, or its length for the beasts and its span
 * for the birds), and scaled to that from the size its bake comes out at, not
 * from the size its game drew it.
 */

/** How finely each is baked: the figures that are seen up close a little finer than the small fry. */
const FIGURE = 0.3, SMALL = 0.45;

export const CAST = Object.freeze({
  zombie: { def: zombie, detail: FIGURE, size: 0.4, measure: 'height', walk: 'walk', speed: 0.6 },
  skeleton: { def: skeleton, detail: FIGURE, size: 0.38, measure: 'height', walk: 'walk', speed: 0.8 },
  // The lord is tall, and stands taller in the cape.
  count: { def: count, detail: FIGURE, size: 0.45, measure: 'height', walk: 'walk', speed: 0.7 },
  // A cultist is a man in a long robe and a hood (baked a little coarser: there are two of them, and the robe is plain).
  cultist: { def: cultist, detail: 0.24, size: 0.4, measure: 'height', walk: 'walk', speed: 0.8 },
  // A ghost floats a hand's breadth off the ground.
  wraith: { def: wraith, detail: FIGURE, size: 0.42, measure: 'height', walk: 'walk', speed: 0.7, hover: 0.06 },
  // A werewolf is a wolf as big as a pony: nearly two meters nose to tail.
  wolf: { def: wolf, detail: SMALL, size: 0.42, measure: 'length', walk: 'walk', speed: 1.6 },
  // Goblins come up to a man's chest.
  goblin: { def: goblin, detail: FIGURE, size: 0.25, measure: 'height', walk: 'walk', speed: 1.2 },
  // A vampire bat as big as they come: three-quarters of a meter across the wings.
  bat: { def: bat, detail: SMALL, size: 0.17, measure: 'span', walk: 'walk', speed: 1 },
  // A crow is about a meter across the wings.
  crow: { def: crow, detail: SMALL, size: 0.2, measure: 'span', walk: 'walk', speed: 1 },
  // A cat is half a meter, nose to rump.
  blackcat: { def: blackcat, detail: SMALL, size: 0.11, measure: 'length', walk: 'walk', speed: 0.8 },
});

/** The definitions by name, for the bake worker. */
export const SCULPTED = Object.fromEntries(Object.values(CAST).map((c) => [c.def.name, c.def]));

/**
 * How much to scale a figure baked as `data` (the arrays of `madness-engine/models/model`'s `bake`), stood up at
 * the definition's own scale, so that it is `size` tiles along `measure`. Also where its feet are, at that scale.
 */
export function fitScale(data, def, size, measure) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const p = data.position;
  for (let i = 0; i < p.length; i += 3) {
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[i + a]); hi[a] = Math.max(hi[a], p[i + a]); }
  }
  const s = def.scale ?? 1;
  const along = measure === 'length' ? hi[2] - lo[2] : measure === 'span' ? hi[0] - lo[0] : hi[1] - lo[1];
  const k = size / (along * s);
  return { k, foot: lo[1] * s * k, height: (hi[1] - lo[1]) * s * k };
}
