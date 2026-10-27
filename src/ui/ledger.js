import { BUILDINGS, GOODS, RANKS, RESOURCES } from '../catalog.js';
import { jobsOf, priorityOf } from '../sim/economy.js';
import { headcount, setPriority, setTax, setTrade } from '../sim/game.js';
import { PRICES } from '../sim/state.js';
import { ownedCount } from '../world/wards.js';
import { fill, h, num, round, signed } from './dom.js';
import { GOOD_ICON, icon } from './icons.js';

/**
 * The ledger: where the lord does his sums. Four pages: the treasury and the
 * tax, the stores and what to trade, who works where, and the donut blocks.
 */

const PRIORITY = ['Off', 'Low', 'Normal', 'High'];
const TABS = [['treasury', 'Treasury'], ['stores', 'Stores & trade'], ['labor', 'Labor'], ['blocks', 'Courtyards']];
let tab = 'treasury';

const taxWord = (t) => (t <= 0.04 ? 'Generous' : t <= 0.1 ? 'Fair' : t <= 0.16 ? 'Heavy' : t <= 0.22 ? 'Harsh' : 'Crushing');

function treasury(ctx, body) {
  const { game } = ctx;
  const r = game.report;
  const rows = [['Taxes', r.taxes ?? 0], ['Shops', r.shops ?? 0], ['Upkeep and wages', -(r.upkeep ?? 0)]];
  const t = h('table', {}, h('tbody', {}, ...rows.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td.r', { class: v >= 0 ? 'good' : 'bad' }, signed(v)))), h('tr', {}, h('td', {}, h('b', {}, 'Each week')), h('td.r', { class: (r.income ?? 0) >= 0 ? 'good' : 'bad' }, h('b', {}, signed(r.income ?? 0))))));
  const slider = h('input', { type: 'range', min: 0, max: 30, step: 1, value: Math.round(game.tax * 100), 'aria-label': 'Tax rate' });
  const label = h('div', {});
  const paint = () => { label.innerHTML = `<b>${Math.round(game.tax * 100)}%</b> · ${taxWord(game.tax)} <span class="dim">· mood ${game.tax > 0.1 ? '−' : '+'}${Math.abs((game.tax - 0.1) * 70).toFixed(0)}, taxes ×${(game.tax / 0.1).toFixed(1)}</span>`; };
  slider.addEventListener('input', () => { setTax(game, +slider.value / 100); paint(); });
  paint();
  const bonus = game.blockGain;
  const rank = RANKS[Math.min(RANKS.length - 1, game.rank + 1)];
  const need = rank.need ?? {};
  const checks = game.rank + 1 >= RANKS.length ? [] : [
    need.pop ? [`${need.pop} people`, headcount(game) >= need.pop] : null,
    need.wards ? [`${need.wards} wards`, ownedCount(game.world) >= need.wards] : null,
    need.castle ? [`A ${['', 'stone keep', 'castle', 'citadel'][need.castle - 1]}`, game.castleLevel >= need.castle - 1] : null,
    need.building ? [`A ${BUILDINGS[need.building].name.toLowerCase()}`, [...game.world.buildings.values()].some((b) => b.type === need.building && b.state === 'ready')] : null,
  ].filter(Boolean);
  fill(body, 
    h('div.grid2', {},
      h('div', {}, h('h3', {}, 'Coin'), h('div.stat', {}, h('span', {}, 'In the treasury'), h('b', {}, num(game.stock.gold))), t,
        bonus?.tax > 0.001 ? h('p.dim', {}, `Courtyard blocks add ${(bonus.tax * 100).toFixed(1)}% to your taxes.`) : null),
      h('div', {}, h('h3', {}, 'Tax'), slider, label,
        h('p.dim', {}, 'Heavy taxes fill the treasury and empty the town. Under 10% the people are pleased; over it, they grumble, and leave if it goes on.'),
        h('h3', {}, game.rank + 1 >= RANKS.length ? 'Your standing' : `Standing: ${RANKS[game.rank].name}`),
        game.rank + 1 >= RANKS.length ? h('p', {}, 'You are a Duke of the Night, the highest under the Elder.') : h('div', {}, h('p', {}, `To be made ${rank.name}:`), ...checks.map(([text, ok]) => h('div', { html: `${ok ? '✔' : '✘'} <span class="${ok ? 'good' : 'bad'}">${text}</span>` }))))));
}

function stores(ctx, body) {
  const { game } = ctx;
  const trade = (r, side, v) => { setTrade(game, r, { [side]: v === '' ? null : Math.max(0, +v) }); };
  const input = (r, side) => h('input', { type: 'number', min: 0, step: 10, value: game.trade[r]?.[side] ?? '', placeholder: '—', onchange: (e) => trade(r, side, e.target.value), 'aria-label': `${side} ${RESOURCES[r].name}` });
  const rows = GOODS.filter((r) => r !== 'gold').map((r) => {
    const made = game.flows.made[r] ?? 0, used = game.flows.used[r] ?? 0;
    return h('tr', { class: game.stock[r] < 0.5 && !made ? 'dim' : '' },
      h('td', {}, h('span', { html: `${icon(GOOD_ICON[r], 18)} ` }), RESOURCES[r].name),
      h('td.r', {}, num(game.stock[r])), h('td.r', { class: 'good' }, made ? '+' + num(made, 1) : ''), h('td.r', { class: 'bad' }, used ? '−' + num(used, 1) : ''),
      h('td.r', {}, `${(PRICES[r] * 0.85).toFixed(1)} / ${(PRICES[r] * 1.15).toFixed(1)}`),
      h('td.r', {}, input(r, 'sell')), h('td.r', {}, input(r, 'buy')));
  });
  const cap = game.cap ?? {};
  fill(body, 
    h('p', {}, 'A merchant comes to your gates now and then once you have a market square. He buys what you hold above your sell mark and sells you what you are short of, up to your buy mark.'),
    h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Good'), h('th.r', {}, 'In store'), h('th.r', {}, 'Made'), h('th.r', {}, 'Used'), h('th.r', {}, 'Sells / buys at'), h('th.r', {}, 'Sell above'), h('th.r', {}, 'Buy up to'))), h('tbody', {}, ...rows)),
    h('p.dim', {}, `Food stores hold ${num(cap.food ?? 0)}, goods stores ${num(cap.goods ?? 0)}. What does not fit spoils or is lost. Build a granary or a storehouse for more.`));
}

function labor(ctx, body) {
  const { game } = ctx;
  const r = game.report;
  const groups = new Map();
  for (const b of game.world.buildings.values()) {
    if (b.type === 'castle') continue;
    const jobs = jobsOf(b);
    if (!jobs || b.state !== 'ready') continue;
    const g = groups.get(b.type) ?? { type: b.type, n: 0, jobs: 0, workers: 0, off: 0 };
    g.n++; g.jobs += jobs; g.workers += b.workers; if (!b.connected) g.off++;
    groups.set(b.type, g);
  }
  const rows = [...groups.values()].sort((a, b) => priorityOf(game, b.type) - priorityOf(game, a.type)).map((g) => h('tr', {},
    h('td', {}, BUILDINGS[g.type].name, g.n > 1 ? h('span.dim', {}, ` ×${g.n}`) : null, g.off ? h('span.bad', {}, ' (no road)') : null),
    h('td.r', {}, `${num(g.workers, 1)} / ${g.jobs}`),
    h('td.r', {}, h('span.seg', {}, ...PRIORITY.map((name, n) => h('button', { class: n === priorityOf(game, g.type) ? 'on' : '', onclick: () => { setPriority(game, g.type, n); ctx.dialogs.refresh(); } }, name))))));
  fill(body, 
    h('div.grid2', {}, h('div', {}, h('div.stat', {}, h('span', {}, 'Adults who can work'), h('b', {}, round(r.workforce ?? 0))), h('div.stat', {}, h('span', {}, 'At work'), h('b', {}, round(r.employed ?? 0))), h('div.stat', {}, h('span', {}, 'Idle'), h('b', { class: (r.idle ?? 0) > 2 ? 'bad' : '' }, round(r.idle ?? 0))), h('div.stat', {}, h('span', {}, 'Jobs unfilled'), h('b', {}, round(r.jobsOpen ?? 0)))),
      h('p', {}, 'Food comes first, then the builders. When there are too few hands, the places set to High are staffed before the rest. Set a place to Off to send its workers elsewhere.')),
    h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Place'), h('th.r', {}, 'Workers'), h('th.r', {}, 'Priority'))), h('tbody', {}, ...rows)));
}

function blocksTab(ctx, body) {
  const { game } = ctx;
  const blocks = [...game.blocks].filter((b) => b.core.length >= 4 || b.homes > 0).sort((a, b) => b.rating - a.rating);
  const g = game.blockGain ?? { tax: 0, mood: 0, cap: 0, shops: 0 };
  const rows = blocks.map((b) => h('tr', { style: { cursor: 'pointer' }, onclick: () => { ctx.dialogs.close(); ctx.inspector.show({ kind: 'block', id: b.id }); ctx.scene.focusOn(b.center[0], b.center[1], { zoom: 0.9 }); } },
    h('td', {}, h('b', {}, b.name)), h('td.r', {}, `${b.rating}`), h('td', {}, b.standing), h('td.r', {}, `${b.homes}${b.works ? ` · ${b.works}` : ''}`), h('td.r', {}, `${Math.round(b.fill * 100)}%`), h('td', {}, b.hearts.length ? b.hearts.map((x) => x.name).join(', ') : (b.crop ?? '—'))));
  const best = blocks.find((b) => b.q === 0 && b.core.length >= 4);
  fill(body, 
    h('div.grid2', {},
      h('div', {}, h('h3', {}, 'The donut'), h('p', {}, 'A loop of streets with a ring of homes around the inside and, in the middle, a park or a building that serves them all. The closer the ring is to complete, and the better the heart, the higher the rating.'),
        h('p', { html: '<b>Hearts, best first:</b> village green, cathedral, chapel, market square, castle, tavern, healer, well, watchtower; or kitchen gardens, an orchard or a common. A ring of workshops or smallholdings wants a storehouse, granary, smithy or windmill.' })),
      h('div', {}, h('h3', {}, 'What the blocks bring the realm'),
        h('div.stat', {}, h('span', {}, 'Taxes'), h('b', { class: g.tax > 0 ? 'good' : '' }, `+${(g.tax * 100).toFixed(1)}%`)),
        h('div.stat', {}, h('span', {}, 'Courtyard rooms'), h('b', { class: g.cap > 0 ? 'good' : '' }, `+${g.cap} people`)),
        h('div.stat', {}, h('span', {}, 'Mood'), h('b', { class: g.mood > 0 ? 'good' : '' }, `+${g.mood.toFixed(1)}`)),
        h('div.stat', {}, h('span', {}, 'Shop sales'), h('b', { class: g.shops > 0 ? 'good' : '' }, `+${(g.shops * 100).toFixed(0)}%`)))),
    blocks.length ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Block'), h('th.r', {}, 'Rating'), h('th', {}, 'Standing'), h('th.r', {}, 'Homes · trades'), h('th.r', {}, 'Ring built'), h('th', {}, 'Heart'))), h('tbody', {}, ...rows))
      : h('p', { html: 'You have no blocks yet. Take the <b>Blocks</b> tool, stamp one on open ground and leave its core open for a green.' }),
    best ? h('p.warn', { html: `✦ ${best.name === 'Hollow Block' ? 'A block' : best.name} near (${Math.round(best.center[0])}, ${Math.round(best.center[1])}) has no heart yet. Put a village green or a well in the middle.` }) : null);
}

export function ledgerDialog(ctx) {
  const pages = { treasury, stores, labor, blocks: blocksTab };
  return {
    title: 'The Ledger',
    icon: 'ledger',
    refresh: true,
    tabs: true,
    width: 960,
    draw(body, { tabs }) {
      if (tabs) {
        tabs.replaceChildren(...TABS.map(([id, name]) => h('button.tab', { class: id === tab ? 'on' : '', onclick: () => { tab = id; ctx.dialogs.refresh(); } }, name)));
      }
      pages[tab](ctx, body);
    },
  };
}
