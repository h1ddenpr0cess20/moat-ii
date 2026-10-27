# Design notes

## Time and scale

* One tile is one world unit. The map is 210 × 210 tiles: 7 × 7 wards of 30 × 30. The castle stands in the middle of the middle ward.
* A tick is a week (3.2 s at normal speed). A year is 48 weeks, starting 1 March; seasons are 12 weeks.
* Heights have two vertices to a tile so that moat banks and hills come out round. `world.hBase` holds the land before any moat is cut, so that a moat can be filled in when its ward is taken.

## The moat

The moat is a distance field from the *exposed borders* of owned wards (borders with a ward that is not yet owned). The trench profile is `-0.95 + (plateau + 0.5·max(0, d − 2.5) + 0.95)·smoothstep(0.7, 3.2, d)`; tiles within 1.6 of a border are water and within 2.8 are bank (nothing may be built). Annexing a ward recomputes the field, so the old border between the two wards becomes plain again.

## A week

weather → work and farms → relief → food and fuel → money → mood → births and deaths → construction → coverage and blocks → growth → merchants → monsters → All Hallows' → the dead → tribute → rank.

Tribute: each autumn from the third year the Elder's collector takes `25·wards` and a third of what taxes and the shops brought in since his last visit, so a hamlet pays as a hamlet and a city as a city.

Relief: when food in store is under two weeks' eating and there is gold, the steward buys six weeks of grain at twice the merchant's price (at most once in four weeks); likewise firewood when the woodpile is under two weeks' burning.

Labor: the garrison, then a third of the hands held for building sites, then priority-3 jobs (food, and woodcutters when timber is low), then crews up to 55%, then the rest by priority. Food drops to normal priority while the stores alone would last to the harvest after next (even if this year's failed), so a well-fed town's hands go to the quarries and workshops; and farmsteads drop to low through the winter, when the fields lie fallow and only pasture wants tending.

## Food

A farmhand tends 8 tiles of field. Over a year a tile gives `soil · haul · mood · weather` times its crop's yield, where `soil = 0.35 + 0.9·fert`: corn 10, a pumpkin patch 11 produce, an apple orchard 14 produce (an orchard costs three times as much to plant). A farmhand on wheat feeds about five; a fisherman (1.8 fish a week) or a hunter (1.2 meat) about eight, but the catch spoils fast and only so much water or forest is in reach.

Haul: what a building makes is lost on the road to the nearest store (the castle, a granary or a storehouse), `clamp(1.1 − d/100, 0.7, 1)` for `d` road tiles; the inspector shows the loss. The food estimate (what immigration, births and the smallholdings wait on) counts the haul, the mills' bread at what it is worth, and next year's weather as an average one once the harvest is in.

## Timber and tools

Woodcutters fell grown trees only (level 2 and up: 14 timber a level), leaving the saplings, so a wood a forester tends grows back; when only saplings are in reach the lodge waits for them. Workshops and smithies stop making tools, and drop to low priority, once the stores hold more than `30 + 0.3·people` (the same glut that sends idle hands to smallholdings instead of workshops).

## Industry

Two zones grow the people's own trades, as the housing and market zones do:

* **Smallholdings** (`croft` → `smallholding` → `grange`) house a family (2–4 beds) and grow mixed food by worker and season (`[0.6, 1, 1.5, 0.3]`, × soil `0.55 + 0.6·fert`), with no farmstead. Their jobs are food priority.
* **Workshops** (`workshop` → `joinery` → `guildhall`) turn timber (and at the top, iron) into tools, and sell wares like a shop (`shop` 0.8, 1.4, 2.4).

They are built when the idle exceed the jobs already going up by two (smallholdings first while food support is under 1.3 × the people), and otherwise a croft when the town wants both homes and food, or a workshop when tools are under `3 + 0.04·people` and no workshop is short of hands. They rise a level when worked at 90% or better and the town is big enough (30/90 people for smallholdings, 40/110 for workshops, the last wanting a market's reach and iron). In a donut block, their output × `(1 + 0.25·q)`; a storehouse, granary, smithy or windmill is a heart for an industrial block.

## Monsters and the dead

`src/sim/monsters.js`. Instead of fire and plague, monsters come out of the woods inside the realm (a ghost out of a graveyard, if one is near) and walk the streets to what they are after: a search over the walkable land (the realm's dry ground and roads, never through a building or the moat; streets cost 1 a step, open ground 1.4, woods 1.8) from the target's doorstep out to a tile 9 to 20 steps away.

* **Ghost** (the wraith, 3 tiles a week): haunts a home for two weeks, then the family flees and the house comes down; its lot stays zoned. Laid by faith.
* **Cultists** (two of them, 3 a week): pray at a home for three weeks; each week half a chance of bringing the wasting (the old plague: 6 to 9 weeks), or a third of a chance of a death. Faith, health and the watch.
* **Werewolf** (the wolf, 6 a week): at a farmstead, croft or hunter's lodge, takes 40% of the meat, 30% of the wool and, half the time, a farmhand. The watch.
* **Goblins** (three, 4 a week): at a granary 15% of the food, at a storehouse 12% of the goods, at a market or merchant house 8% of the gold (at most 120). The watch.

The chance a week of being put down is `clamp(0.05 + 0.5·Σ wardᵢ·min(1.5, coverᵢ) + 0.3·q, 0, 0.85)` (half that on the way home). One comes every `(16 to 36) / difficulty` weeks (peaceful 0.5, easy 0.7, hard 1.4), sooner in autumn (×0.6), from week 30 to 45, once the town has 20 people, at most three at a time. All Hallows' Eve (the 32nd week of the year): with pumpkins in store for 15% of the people, they are carved and the shock eases by 8; without, it rises by 3; and one more monster comes out either way.

The Count, the lord, is not one of them: he walks his castle bridge at night, and that is all.

## The hordes of the dead

The dead are announced three weeks ahead, at the weakest gate (a raised drawbridge counts ×2.4), and trample a way through the woods beyond the moat as they come. Their strength is `(2 + 1.4·year + 0.05·people + 1.8·wards) · difficulty · (1 − 0.1·graveyards, at most 3) · (0.8 to 1.3)`; the first is only a few fresh out of the ground, at 65%. Defense is the castle's, plus every watchtower (5), barracks (12) and the gate's gatehouse (8), each at half strength empty, × 1.3. If the walls would not hold and the treasury can pay `36 · strength · (1 + 0.25·times paid)`, the steward hires the Order of the Stake. Otherwise the dead break in and feed: 12% of the stores and one building torn down; or overrun the gate, 25%, three buildings and 4% of the people.

## Donut blocks

`src/sim/blocks.js` finds every closed loop of road enclosing 9–800 tiles (a flood fill over non-road tiles; faces touching the map edge are open land). Tiles within three of the street are the *ring*; the rest is the *core*.

* `closure = clamp((built / zoned − 0.35) / 0.55) · min(1, (homes + trades) / 6)`
* `heart = 1 − Π(1 − fineᵢ)` over the distinct special buildings in the core (green 0.85, cathedral 0.9, chapel 0.6, market 0.6, castle 0.7, tavern 0.45, healer 0.45, well 0.4, watchtower 0.35, barracks 0.3; ×1.15 per extra of a kind) and the worked ground (gardens 0.3, allotments 0.36, orchard 0.42, common 0.32, field 0.25)
* `rating = round(100 · heart · closure)`, `q = rating / 100`

Effects: the core's services are lifted to `strength · (0.45 + 0.55·closure)` over every ring and core tile; homes' tax × `(1 + 0.18·q)`; beds + `12%·q`; mood `+7·q` weighted by the share of beds in blocks; shop capacity × `(1 + 0.3·q)`; monsters put down `+0.3·q` a week; lot value `+1.4·q`; upgrade bars lowered by `8·q` happiness.

## Saves

The world is regenerated from the seed; a save keeps runs of changed cells for each map (`ground tree amount road zone crop`, and the two height maps to a thousandth), the buildings, wards, gates and the game's numbers. Autosave each season and on leaving the page (`localStorage`, key `bloodmoat.save.v1`): that is the game in play, which Continue and a reload come back to. Up to eight more saves are made by name from the menu (`src/saves.js`: each under `bloodmoat.save.<id>.v1`, with a list of them in `bloodmoat.saves.v1`). Loading one copies it over the game in play and reloads the page, since the map size is chosen from the game in play before anything is made.

## Known rough edges

* Early balance is tight on some seeds: a passive hamlet stagnates, and an active lord must find timber early (a forester's lodge plants new woods, and the starting ward has a belt of trees inside the bank).
* Rendering in a software-GL browser is slow; shader compiles are the first-use hitches.

## Drawing

* Trees and rocks are GPU instances: each kind is one indexed geometry made once, and a chunk keeps only where its copies stand (eight numbers a tree), near and far sets both, so moving the camera swaps which is shown and felling a tree rebuilds a chunk in a few milliseconds.
* Smoke, flames and rain splashes are instanced pools, a draw call for each kind.
* Ground textures repaint only the tiles that changed. Buildings are batched in quarter-chunk cells, rebuilt only when their buildings change; sites under construction are their own small meshes.
* The monsters are the engine's cast, baked in a worker at a third of their detail and scaled to their real size (`src/render/cast.js`). Each kind has up to three puppets a clip, posed a little out of step, and every figure on the map borrows one's skin: a horde of a dozen is three skins a frame.
* The buildings are tinted as Gravemoor tints them: each a drained, cool tint (cold, green, grey, warm, dark, bruise), the castle darkest, its windows red.
