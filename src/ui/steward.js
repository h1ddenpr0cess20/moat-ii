import { saveSlot } from 'madness-engine/storage';
import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * The steward: an old retainer at the lord's elbow who says what to do next,
 * once, when it matters. His hints teach the game in the order a lord needs
 * it, and the donut block above all: stamp a ring of homes, leave the heart
 * open, put a green or a well in the middle.
 */

const HINTS = {
  welcome: {
    text: 'My lord, the hamlet is yours. Slide the map with <b>WASD</b> or the <b>right button</b>, turn it with <b>Q</b> and <b>E</b>, and draw in with the wheel. The people want <b>homes along streets</b>, <b>fields</b> and <b>firewood</b>.',
    touch: 'My lord, the hamlet is yours. Slide the map with a <b>finger</b>, and <b>pinch</b> and <b>twist</b> with two to draw in and turn it. Tap anything to look at it. The people want <b>homes along streets</b>, <b>fields</b> and <b>firewood</b>.',
    next: 'block',
  },
  block: {
    text: 'The best way to build a town is the <b>donut block</b>. Take the <b>Blocks</b> tool (<b>4</b>), choose <b>Open ★</b> for the core, and click on open ground to stamp a street loop with a ring of plots. Join one of its streets to the castle’s roads.',
    touch: 'The best way to build a town is the <b>donut block</b>. Take the <b>Blocks</b> tool, choose <b>Open ★</b> for the core, and tap open ground to stamp a street loop with a ring of plots. Join one of its streets to the castle’s roads. While a tool is in hand, two fingers move the map; <b>Done</b> puts it down.',
    after: 14,
  },
  blockMade: { text: 'A ring of homes will grow around it. Now give it a <b>heart</b>: with the <b>Build</b> tool, set a <b>Village Green</b> in the middle, with a <b>well</b> beside it. A good heart serves every door in the ring, and the block earns a courtyard bonus.' },
  heart: { text: 'A courtyard! The plaque over the block shows its rating. It climbs as the ring fills, and as the heart grows: taxes, rooms, mood and safety all improve. Make another, and join it to the first.' },
  food: { text: 'The stores are running thin. <b>Zone wheat</b> near a farmstead before the spring, and put a few hands on the plow: a hungry town does not stay.' },
  winter: { text: 'Winter is coming, my lord. The people burn timber to keep warm: see that you have some, and a woodcutter who works. A <b>forester’s lodge</b> plants new woods, so the cutters never run dry.' },
  raid: { text: 'Raiders have been sighted at the gate, and will be here in three weeks! A <b>gatehouse</b> and a <b>watchtower</b> will hold them. If the walls are weak, your steward will try to pay them off from the treasury, but they come back greedier. They come in the end to the weakest gate.' },
  moat: { text: 'The treasury is fat. Open the <b>Realm map</b> (<b>M</b>) and widen the moat around another ward: more land, more forest, more stone. A larger castle can hold more wards.' },
  idle: { text: 'There are idle hands in the town. Zone <b>Workshops</b> or <b>Smallholdings</b> (Zones, <b>3</b>), or stamp a block with a ring of them (Blocks, <b>4</b>), and the people will build their own work. A town with work is a happy one.' },
  tools: { text: 'The tools are wearing out, and every trade goes slower without them. Zone some <b>Workshops</b> by a street: carpenters make tools from timber. A smithy makes better ones from iron.' },
  noroad: { text: 'A building here has no street to the castle, and no one can work in it. Lay a road from it to the town.' },
};

export function createSteward(ctx) {
  const slot = saveSlot('bloodmoat.hints.v1');
  const seen = new Set(slot.read() ?? []);
  const el = h('div.panel.steward');
  el.hidden = true;
  let hideT = 0;
  let queue = [];

  const show = (id) => {
    const hint = HINTS[id];
    if (!hint) return;
    seen.add(id);
    slot.write([...seen]);
    el.replaceChildren(
      h('div.portrait', { html: icon('crown', 22) }),
      h('div.words', { html: (globalThis.matchMedia?.('(pointer: coarse)').matches && hint.touch) || hint.text }),
      h('button.btn.small.skip', { onclick: () => { el.hidden = true; clearTimeout(hideT); next(); } }, 'Thank you'));
    el.hidden = false;
    ctx.sfx('open');
    clearTimeout(hideT);
    hideT = setTimeout(() => { el.hidden = true; next(); }, 22000);
  };
  const next = () => { const id = queue.shift(); if (id) setTimeout(() => show(id), 1200); };

  const steward = {
    el,
    /** Says a hint, if it has not been heard (or the one before is still up, then after). */
    hint(id) {
      if (seen.has(id) || off || queue.includes(id)) return;
      if (!el.hidden) { queue.push(id); return; }
      show(id);
    },
    get seen() { return seen; },
    reset() { seen.clear(); slot.write([]); },
    /** Checks the state of the realm for something worth saying; once a week. */
    watch() {
      const { game } = ctx;
      const r = game.report;
      const week = game.week % 48;
      if (game.week > 4) steward.hint('block');
      if ((r.foodWeeks ?? 99) < 7 && game.week > 20) steward.hint('food');
      if (week >= 30 && week < 34 && game.stock.wood < 120) steward.hint('winter');
      if (game.stock.gold > 700 && game.week > 60) steward.hint('moat');
      if ((r.idle ?? 0) > 6 && game.week > 30) steward.hint('idle');
      if (game.stock.tools < 1.5 && game.week > 30) steward.hint('tools');
      for (const b of game.world.buildings.values()) if (b.state === 'ready' && !b.connected && b.type !== 'well' && b.type !== 'green' && b.type !== 'castle' && b.type !== 'gatehouse' && game.week > 8) { steward.hint('noroad'); break; }
    },
  };
  let off = false;
  steward.disable = (v) => { off = v; if (v) el.hidden = true; };
  ctx.game.on('warning', () => steward.hint('raid'));
  return steward;
}
