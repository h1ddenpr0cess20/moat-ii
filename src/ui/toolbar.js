import { BUILDINGS, CATEGORIES, RANKS, RESOURCES, ROADS, ZONES } from '../catalog.js';
import { CENTER } from '../config.js';
import { HEARTS } from '../sim/blocks.js';
import { add, h } from './dom.js';
import { icon } from './icons.js';
import { BLOCK_SIZES, TOOLS } from './tools.js';

/**
 * The tool dock along the bottom, and above it the bar of choices for the tool
 * in hand: which road, which zone, how big a block and what goes in its core,
 * and the palette of buildings.
 */

const CORES = [
  ['res', 'Kitchen gardens', 'Gardens behind every house: some food, and shade.'],
  ['veg', 'Allotments', 'Vegetable beds worked by the block.'],
  ['orchard', 'Orchard', 'Apple and pear trees at the middle.'],
  ['pasture', 'Common pasture', 'Sheep on the common.'],
  ['wheat', 'Wheat', 'A field in the middle. Needs a farmstead near.'],
  ['none', 'Open ★', 'Leave it bare, and put a green, a well, a chapel or a tavern in the middle.'],
];

const costChips = (ctx, cost) => h('div.cost', {}, Object.entries(cost).filter(([, n]) => n > 0).map(([r, n]) => h('span', { class: ctx.game.stock[r] < n ? 'short' : '', html: `${n}<small> ${r === 'wood' ? 'timber' : RESOURCES[r].name.toLowerCase()}</small>` })));

export function createToolbar(ctx) {
  const { game, tools, tip } = ctx;
  const dock = h('div.panel.dock');
  const options = h('div.panel.options');
  const buttons = new Map();

  const mk = (t) => {
    const b = h('button.tool', { 'aria-label': t.name, onclick: t.run ?? (() => tools.set(t.id)) }, h('span', { html: icon(t.icon, 28) }), h('span', {}, t.name), h('kbd', {}, t.key ?? ''));
    tip.attach(b, () => `<b>${t.name}</b> ${t.key ? `<span class="dim">[${t.key}]</span>` : ''}<div class="dim">${t.tip}</div>`);
    buttons.set(t.id, b);
    dock.append(b);
    return b;
  };
  for (const t of TOOLS) mk(t);
  dock.append(h('span.sep'));
  mk({ id: 'realm', icon: 'map', name: 'Realm', key: 'M', tip: 'The map of the barony: annex wards by digging the moat wider.', run: () => ctx.dialogs.toggle('realm') });
  mk({ id: 'castle', icon: 'castle', name: 'Castle', key: 'C', tip: 'Look at the castle, and raise it higher.', run: () => { ctx.inspector.show({ kind: 'building', id: 1 }); ctx.scene.focusOn(CENTER, CENTER + 2); } });

  const seg = (items, value, onPick) => h('span.seg', {}, items.map(([id, label, title]) => h('button', { class: id === value ? 'on' : '', title: title ?? '', onclick: () => onPick(id) }, label)));
  const opt = (label, on, onclick, extra = {}) => h('button.opt', { class: on ? 'on' : '', onclick, ...extra }, ...(Array.isArray(label) ? label : [label]));
  let buildCat = 'food';
  const put = (...kids) => add(options, kids);

  const touch = () => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  const render = () => {
    const t = tools.current;
    for (const [id, b] of buttons) b.classList.toggle('on', id === t);
    options.hidden = t === 'select';
    // On a small screen the steward steps aside while a tool is in hand, to leave the land to work on.
    options.parentNode?.classList.toggle('tooling', t !== 'select');
    options.replaceChildren();
    if (t === 'select') return;
    const o = tools.opts;
    // The buttons along the foot of the bar: what the tool in hand can do, and a way to put it down, for a finger has
    // no right button and no Esc.
    const actions = [];
    if (t === 'road') {
      put(
        h('div.row', {}, ...Object.entries(ROADS).map(([id, r]) => opt([h('span', { html: icon('road', 18) }), h('span', {}, r.name), h('small.dim', {}, ` ${Object.entries(r.cost).map(([k, n]) => `${n} ${k === 'wood' ? 'timber' : k}`).join(' + ')} a ${id === 'bridge' ? 'span' : 'tile'}`)], o.road === id, () => tools.set('road', { road: id }), { title: r.desc }))),
        h('div.hint', { html: o.road === 'bridge' ? '<b>Bridge.</b> Drag in a straight line from one bank to the other: up to six tiles of water, both ends on dry land. The moat is crossed only at the gates.' : 'Drag along the ground to lay a road. Houses, shops and farms need a street to front on. Rivers and lakes need a <b>Bridge</b>.' }));
    } else if (t === 'zone') {
      put(
        // In three rows: what the town builds on, what it works, what it farms.
        ...[['Town', ['res', 'market']], ['Work', ['craft', 'croft']], ['Farms', ['wheat', 'veg', 'orchard', 'pasture']]].map(([label, ids]) => h('div.row', {}, h('span.label', {}, label),
          ...ids.map((id) => opt([h('span.swatch', { style: { background: ZONES[id].color } }), ZONES[id].name], o.zone === id, () => tools.set('zone', { zone: id }), { title: ZONES[id].desc })),
          label === 'Farms' ? opt([h('span', { html: icon('demolish', 16) }), 'Clear zones'], o.zone === 'clear', () => tools.set('zone', { zone: 'clear' })) : null)),
        h('div.hint', { html: o.zone === 'clear' ? 'Drag over zoned land to clear it.' : `<b>${ZONES[o.zone].name}.</b> ${ZONES[o.zone].desc}` }));
    } else if (t === 'block') {
      const b = o.block;
      put(
        h('div.row', {}, h('span.label', {}, 'Size'), seg(Object.entries(BLOCK_SIZES).map(([k, n]) => [k, `${k[0].toUpperCase() + k.slice(1)} ${n}`]), b.size, (v) => tools.set('block', { block: { size: v } })),
          h('span.label', {}, 'Ring'), seg([['res', 'Homes'], ['market', 'Shops'], ['croft', 'Smallholdings'], ['craft', 'Workshops']], b.ring, (v) => tools.set('block', { block: { ring: v } })),
          h('span.label', {}, 'Street'), seg([['dirt', 'Dirt'], ['cobble', 'Cobbled']], b.road, (v) => tools.set('block', { block: { road: v } }))),
        h('div.row', {}, h('span.label', {}, 'Core'), ...CORES.map(([id, name, desc]) => opt(name, b.core === id, () => tools.set('block', { block: { core: id } }), { title: desc }))),
        h('div.hint', { html: b.ring === 'croft'
          ? '<b>Agricultural block.</b> Crofts grow around the ring when people want work, each family on its own strip; they rise to smallholdings and granges. Put wheat or pasture in the core, or leave it open for a <b>granary</b> or a <b>windmill</b>.'
          : b.ring === 'craft'
            ? '<b>Workshop block.</b> Workshops grow around the ring when people want work, turning timber into tools and wares; they rise to joineries and craft halls. Leave the core open for a <b>storehouse</b> or a <b>smithy</b>: the trades around it make a quarter more. Keep it back from the houses.'
            : b.core === 'none'
              ? '<b>Donut block.</b> Click to stamp it, or drag a rectangle. The core is left open: build a <b>Village Green</b>, well, chapel or tavern in the middle, and the ring of homes earns a courtyard bonus.'
              : '<b>Donut block.</b> Click to stamp it, or drag a rectangle. Homes grow around the ring; what fills the core serves them. Choose <b>Open ★</b> to put a park or a special building there.' }));
    } else if (t === 'build') {
      const tabs = h('div.row', {}, ...CATEGORIES.map((c) => opt(c.name, buildCat === c.id, () => { buildCat = c.id; render(); })));
      const types = Object.entries(BUILDINGS).filter(([, d]) => d.cat === buildCat && !d.auto);
      const cards = h('div.cards', {}, ...types.map(([type, d]) => {
        const locked = d.rank && game.rank < d.rank;
        const heart = HEARTS[type];
        const c = h('button.card', { class: `${o.build.type === type ? 'on' : ''} ${locked ? 'locked' : ''}`, onclick: () => { tools.set('build', { build: { type, front: null } }); } },
          h('div.name', {}, d.name, heart ? h('span', { html: '★', title: 'A heart building: in the middle of a donut block it serves the whole ring.' }) : null),
          costChips(ctx, d.cost),
          h('div.cost', {}, h('small', {}, locked ? `Needs rank: ${RANKS[d.rank].name}` : `${d.crew} builders · ${d.weeks} wk${d.jobs ? ` · ${d.jobs} jobs` : ''}`)));
        tip.attach(c, () => `<b>${d.name}</b><div>${d.desc}</div>${heart ? `<div class="good">★ Heart: ${heart.why}. In a block's core it earns the courtyard bonus.</div>` : ''}${d.upkeep ? `<div class="dim">Upkeep ${d.upkeep} gold a week</div>` : ''}`);
        return c;
      }));
      const cur = o.build.type;
      put(tabs, cards, h('div.hint', { html: cur ? `<b>${BUILDINGS[cur].name}.</b> ${touch() ? 'Tap the land to set it down, then <b>Place it here</b>.' : 'Click on the land to build. <b>R</b> turns it.'}${o.build.front === null ? ' It faces the nearest street by itself.' : ''}` : `Choose a building, then ${touch() ? 'tap' : 'click on'} the land.` }));
      if (cur) {
        const front = o.build.front;
        actions.push(h('button.btn.small', { onclick: () => tools.set('build', { build: { front: front === null ? 0 : front === 3 ? null : front + 1 } }), title: 'Turn it [R]', html: `${icon('rotate', 16)} ${front === null ? 'Facing the street' : `Facing ${['north', 'east', 'south', 'west'][front]}`}` }));
      }
      if (ctx.tools.pendingTouch) actions.push(h('button.btn.gold', { onclick: () => tools.commit() }, 'Place it here'));
    } else if (t === 'demolish') {
      put(h('div.hint', { html: 'Click a building, road, zone, tree or outcrop to clear it. Drag to clear many (buildings are only cleared by a click). Buildings give back some of what they cost, trees give timber, and rock gives stone.' }));
    }
    put(h('div.row.actions-row', {},
      touch() ? h('span.hint', {}, 'Two fingers slide, pinch and turn the map.') : null,
      ...actions,
      h('button.btn.small', { onclick: () => tools.cancel(), title: 'Put the tool down [Esc]', html: `${icon('close', 14)} Done` })));
  };

  tools.onChange(render);
  render();
  return {
    dock, options,
    update() {
      // The cards show what is short; redraw the palette now and then.
      if (tools.current === 'build') {
        const cards = options.querySelector('.cards');
        if (cards) {
          const types = Object.entries(BUILDINGS).filter(([, d]) => d.cat === buildCat && !d.auto);
          [...cards.children].forEach((card, i) => {
            const d = types[i]?.[1];
            if (!d) return;
            [...card.querySelectorAll('.cost span')].forEach((s, k) => { const entry = Object.entries(d.cost).filter(([, n]) => n > 0)[k]; if (entry) s.classList.toggle('short', game.stock[entry[0]] < entry[1]); });
          });
        }
      }
    },
  };
}
