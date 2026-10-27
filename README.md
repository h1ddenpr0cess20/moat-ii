# Moat II: Blood Moat

A Halloween town builder on a strategy map, built on the [Madness Engine](https://github.com/h1ddenpr0cess20/madness-engine). The sequel to [Moat](https://github.com/h1ddenpr0cess20/moat).

You are the vampire lord of a black castle on an island in a moat of blood. Build a town in the dead land around it, feed it on corn, pumpkins and apples through the seasons, and **dig the moat wider** to take in the next ward, flooding the new trench with blood. Houses grow where you zone them, SimCity-style, along streets you lay, each with a carved lantern on the step, and the best way to lay them out is still the **donut block**.

The town is shot in the engine's horror mood, as [Gravemoor](https://github.com/h1ddenpr0cess20/rpg-test-world) is: drained, cold colors, a bruised sky, a blood-red sunset, an orange harvest moon, lightning in the storms and windows that flicker. The Count himself sleeps through the day and walks out on his castle bridge by night, with bats about his towers.

Instead of fires and plague, things come out of the dark, and you can watch them walk the streets: **ghosts** that haunt a home until the family flees, **cultists** whose prayers bring the wasting, **werewolves** that tear through the farms, and **goblins** that rob the stores. And from the third year the **dead rise** beyond the moat and shamble on your weakest gate. Every one of them is a character from the engine's cast, stood up at its true size against the town.

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

A year is 48 weeks, starting in March. People need **food** (corn or cornbread, pumpkins and apples, meat or fish: a table with all three is a happier one), **firewood** in the cold months, **homes**, and **work**. Lay roads (and **bridges** over rivers and lakes: drag from bank to bank, up to six tiles of water; the moat is crossed only at the gates), zone housing, market, workshops, smallholdings, corn, pumpkin patches, apple orchards and pasture, and put farmsteads, woodcutters, quarries and mills where they are wanted. The steward gives hints, once, as they matter.

When people want work, zone **Workshops** (carpenters who turn timber into tools and sell wares) or **Smallholdings** (crofts where a family lives and grows its own food, with no farmstead), or stamp a block with a ring of them: the people build these themselves, and they rise to joineries and craft halls, smallholdings and granges. A storehouse, granary, smithy or windmill makes a good heart for an industrial block. If the stores run bare, your steward will buy corn or firewood at a hard price, so long as there is gold.

Merchants come to the gates once you have a market square. The dead come too, from the third year, to the weakest gate, with three weeks' warning: you can watch the horde trample its way through the woods toward the bridge, wrapped in green grave-mist. A gatehouse (raise its drawbridge: the dead cannot cross the blood), watchtowers and barracks hold them, each **graveyard** keeps a tenth of them in the ground, and if the walls would not hold, your steward hires the Order of the Stake (dearer every time). A HUD chip counts down to the horde, and another names what is loose in the town (click it to look). Watchtowers and barracks hunt what prowls the streets, the chapel lays ghosts and breaks up covens, the hedge witch keeps the wasting short, and a good courtyard block keeps its own streets safer. On **All Hallows' Eve**, the last week of October, the people carve the pumpkins in store into lanterns and keep the night, if there are pumpkins enough. The Elder's collector, the vampire who holds the land above yours, wants tribute each autumn: a little for each ward and a third of the year's taxes and trade. Rank rises from Baron through Count to Duke of the Night as the barony grows.

### The moat and the realm

The map is a grid of **wards** of 30 × 30 tiles: 7 × 7 for a Small map, 9 × 9 for Medium (the default) or 11 × 11 for Large, chosen on the title screen. Larger maps take longer to make and use more memory; a save keeps the size it was made at.

The game saves itself each season. To keep more than one realm, open the menu (F10) and **Save as new** under *Saved realms*: up to eight saves by name, each of which can be loaded, saved over or deleted, from the menu or the title screen.

You own the ward the castle stands in. From the **realm map** (M) you can pay for the diggers to dig the moat out around a neighboring ward: the old moat between is filled in, the ground is graded, the new moat floods with blood, and a bridge is laid at the gate. A bigger castle (Timber Keep, Stone Keep, Castle, Citadel) holds more wards. To raise it, press **C** and choose *Begin the work*: each tier needs a rank (Viscount, Earl, Marquess, which come with population, wards and a chapel) and a pile of timber, stone, iron and gold.

### Donut blocks and courtyard bonuses

Take the **Blocks** tool (4), pick **Open ★** for the core, and click to stamp a loop of street with a ring of plots around its inside. Houses grow on the ring; the middle is the **core**. Put a **Village Green** (Build → Civic), a well, a chapel, a tavern, a healer or a market square in the core and the block becomes a *courtyard*, as in SimCity Classic:

* **Rating (0 to 100)** = how built the ring is × how good the heart is. Plaques over your blocks show it.
* **Heart**: a village green (with its lanterns and bonfire) is best for houses; a cathedral, chapel, market square, well, tavern, healer, watchtower or barracks serve the whole ring at once; kitchen gardens, an orchard, allotments or a common are worth something too. A second heart building adds more.
* **What a good block earns the realm**: the heart's services reach *every* door in the ring (not just those in its circle), homes pay up to 18% more tax, courtyards add rooms (up to 12% more beds), the town's mood rises (up to +7), shops in the ring sell up to 30% more, monsters in its streets are put down up to 30% more often, and houses rise a level sooner.
* A block's streets must join the castle's roads, or nobody will build there. Click a block to see its rating and what would improve it; the ledger's *Courtyards* page lists them all.

## How it is made

* `src/world/`: the land from a seed (heightfield, moat distance field, wards, gates, roads, zones, lots). Pure JS, no drawing.
* `src/sim/`: the weekly simulation (economy, people, growth, events, blocks, actions). Pure JS; `src/save.js` stores only what changed from the seeded land.
* `src/sim/monsters.js`: what walks the streets by night, and All Hallows' Eve; `src/sim/events.js` has the hordes of the dead.
* `src/render/`: the picture on the engine's `gfx`, `stage`, `view` and `effects`: chunked terrain painted per pixel, a moat of blood, trees (dead ones among them), autotiled roads, corn, pumpkins and apple trees that grow through the year, the engine's building models in Gravemoor's drained tints, jack-o'-lanterns, a graveyard, day/night and season grading in the horror mood, lightning, overcast skies and lying snow.
* `src/render/cast.js`, `monsters.js`: the lord and the monsters from the engine's cast, baked in a worker (`cast.worker.js`), each scaled to its real size in tiles (a man is 0.4 of a tile, a door 0.45), drawn from a few shared puppets per kind so a horde costs only a few skins a frame.
* `src/audio/`: Moat's lute, recorder, drone and frame-drum score gone strange: the dark modes, slower, in a colder room, the lute a hair out of tune, the recorder sliding up into its notes, a music box after dark, a bell tolling, and a heartbeat while the dead are on the road. And the sounds: howls, wails, cackles, chants, moans, crows, owls and thunder, all Web Audio, no samples.
* `src/ui/`: the HUD, tools, panels, realm map and menus, in plain DOM.
* `test/`: node tests, and `test/bot.js`, a scripted player used for tuning.

See [docs/design.md](docs/design.md) for the numbers.
