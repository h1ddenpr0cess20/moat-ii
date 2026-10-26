# Moat

A medieval town builder on a strategy map, built on the [Madness Engine](https://github.com/h1ddenpr0cess20/madness-engine).

You rule from a castle on an island in its own moat. Build a town in the land around it, feed it through the seasons, and **dig the moat wider** to take in the next ward: more land, more forest, more stone and ore. Houses grow where you zone them, SimCity-style, along streets you lay, and the best way to lay them out is the **donut block**.

There are no people on the screen, no cast and no characters: a town is seen in its smoke, its lit windows, its windmill sails and its crops.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # a static site in dist/
npm test         # world, simulation, block and save tests
npm run lint
```

Node 22.12 or later. The game needs a browser with WebGPU or WebGL 2.

## How to play

| | |
|---|---|
| Slide the map | WASD or arrows; right button dragged; one finger on empty ground |
| Turn / tilt / zoom | Q E / Z X / wheel (or pinch and twist on touch) |
| Tools | 1 look · 2 roads · 3 zones · 4 blocks · 5 build · 6 clear · Esc or right-click lets go |
| Turn a building | R while it is in your hand |
| Time | Space pauses, Tab speeds up |
| Pages | M realm map · L ledger · H chronicle · C castle · F10 menu |

A year is 48 weeks, starting in March. People need **food** (grain or bread, vegetables and fruit, meat or fish: a table with all three is a happier one), **firewood** in the cold months, **homes**, and **work**. Lay roads (and **bridges** over rivers and lakes: drag from bank to bank, up to six tiles of water; the moat is crossed only at the gates), zone housing, market, workshops, smallholdings, fields, orchards and pasture, and put farmsteads, woodcutters, quarries and mills where they are wanted. The steward gives hints, once, as they matter.

When people want work, zone **Workshops** (carpenters who turn timber into tools and sell wares) or **Smallholdings** (crofts where a family lives and grows its own food, with no farmstead), or stamp a block with a ring of them: the people build these themselves, and they rise to joineries and craft halls, smallholdings and granges. A storehouse, granary, smithy or windmill makes a good heart for an industrial block. If the stores run bare, your steward will buy grain or firewood at a hard price, so long as there is gold.

Merchants come to the gates once you have a market square. Raiders come too, from the third year, to the weakest gate, with three weeks' warning: a gatehouse (which also raises the drawbridge), watchtowers and barracks hold them, and if they would not, your steward pays them off (dearer every time). Fires are rare, and wells and good courtyards keep them small. The king's collector wants tribute each autumn: a little for each ward and a third of the year's taxes and trade. Rank rises from Baron to Duke as the barony grows.

### The moat and the realm

The map is a grid of **wards** of 30 × 30 tiles: 7 × 7 for a Small map, 9 × 9 for Medium (the default) or 11 × 11 for Large, chosen on the title screen. Larger maps take longer to make and use more memory; a save keeps the size it was made at.

The game saves itself each season. To keep more than one realm, open the menu (F10) and **Save as new** under *Saved realms*: up to eight saves by name, each of which can be loaded, saved over or deleted, from the menu or the title screen.

You own the ward the castle stands in. From the **realm map** (M) you can pay for the diggers to dig the moat out around a neighboring ward: the old moat between is filled in, the ground is graded, the new moat floods, and a bridge is laid at the gate. A bigger castle (Timber Keep, Stone Keep, Castle, Citadel) holds more wards. To raise it, press **C** and choose *Begin the work*: each tier needs a rank (Viscount, Earl, Marquess, which come with population, wards and a chapel) and a pile of timber, stone, iron and gold.

### Donut blocks and courtyard bonuses

Take the **Blocks** tool (4), pick **Open ★** for the core, and click to stamp a loop of street with a ring of plots around its inside. Houses grow on the ring; the middle is the **core**. Put a **Village Green** (Build → Civic), a well, a chapel, a tavern, a healer or a market square in the core and the block becomes a *courtyard*, as in SimCity Classic:

* **Rating (0 to 100)** = how built the ring is × how good the heart is. Plaques over your blocks show it.
* **Heart**: a village green is best for houses; a cathedral, chapel, market square, well, tavern, healer, watchtower or barracks serve the whole ring at once; kitchen gardens, an orchard, allotments or a common are worth something too. A second heart building adds more.
* **What a good block earns the realm**: the heart's services reach *every* door in the ring (not just those in its circle), homes pay up to 18% more tax, courtyards add rooms (up to 12% more beds), the town's mood rises (up to +7), shops in the ring sell up to 30% more, fires start less often and spread half as far, and houses rise a level sooner.
* A block's streets must join the castle's roads, or nobody will build there. Click a block to see its rating and what would improve it; the ledger's *Courtyards* page lists them all.

## How it is made

* `src/world/`: the land from a seed (heightfield, moat distance field, wards, gates, roads, zones, lots). Pure JS, no drawing.
* `src/sim/`: the weekly simulation (economy, people, growth, events, blocks, actions). Pure JS; `src/save.js` stores only what changed from the seeded land.
* `src/render/`: the picture on the engine's `gfx`, `stage`, `view` and `effects`: chunked terrain painted per pixel, a flooded moat, trees, autotiled roads and seasonal fields, about forty building models drawn in code, day/night and season grading, overcast skies and lying snow.
* `src/audio/`: sound and a generative lute, recorder and frame-drum score, all Web Audio, no samples.
* `src/ui/`: the HUD, tools, panels, realm map and menus, in plain DOM.
* `test/`: node tests, and `test/bot.js`, a scripted player used for tuning.

See [docs/design.md](docs/design.md) for the numbers.
