import { BUILDINGS, CASTLE_LEVELS, RESOURCES, RANKS, ZONES, ZONE_NAME } from '../catalog.js';
import { GROUND } from '../config.js';
import { EDGES, wardOfTile } from '../world/wards.js';
import { needsRoad } from '../world/buildings.js';
import { describeTile, idx } from '../world/world.js';
import { HEARTS, blockAt, blockReport, qualityAt } from '../sim/blocks.js';
import { covered } from '../sim/coverage.js';
import { calendar, defenseOf, headcount, planCastle, startCastle, setPriority, toggleGate, demolish } from '../sim/game.js';
import { haulK, priorityOf, jobsOf } from '../sim/economy.js';
import { fill, h, num, round } from './dom.js';
import { icon } from './icons.js';

/**
 * What the lord learns by looking: a line of words when the pointer rests on
 * something, and a panel when he picks it. Buildings say what they are doing
 * and what is wrong; blocks say what they are worth and what would make them
 * worth more.
 */

const pct = (v) => `${Math.round(v * 100)}%`;
const PRIORITY = ['Off', 'Low', 'Normal', 'High'];

const kv = (rows) => h('div.kv', {}, rows.filter(Boolean).flatMap(([k, v]) => [h('span', {}, k), h('span', { html: typeof v === 'string' ? v : undefined }, typeof v === 'string' ? null : v)]));
const bar = (v, kind = '') => h('div.bar' + (kind ? '.' + kind : ''), {}, h('i', { style: { width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%` } }));
const tag = (text, kind = '') => h('span.tag' + (kind ? '.' + kind : ''), {}, text);

export function createInspector(ctx) {
  const { game } = ctx;
  const { world } = game;
  const el = h('div.panel.inspector');
  el.hidden = true;
  let selection = null;

  // ------------------------------------------------------------ status words

  /** A building's definition; the castle's is its tier's. */
  const defOf = (b) => (b.type === 'castle' ? { name: CASTLE_LEVELS[game.castleLevel].name, cat: 'castle', desc: CASTLE_LEVELS[game.castleLevel].desc } : BUILDINGS[b.type]);

  function statusOf(b) {
    const def = defOf(b);
    if (b.type === 'castle') return game.castleWork ? ['Masons at work', 'warn'] : ['Home of the lord', 'good'];
    if (b.state === 'building') return [`Under construction · ${pct(b.progress)}`, 'warn'];
    if (needsRoad(b) && !b.connected && b.type !== 'gatehouse') return ['No road to the castle', 'bad'];
    if (b.type === 'farmstead' && calendar(game.week).season === 3) return ['Fallow for the winter', 'good'];
    if (jobsOf(b) && b.eff < 0.4) return ['Short of workers', 'warn'];
    if (def.cap) return [`Home · ${def.cap} beds`, 'good'];
    return [jobsOf(b) ? 'Working' : 'Standing', 'good'];
  }

  const describe = {
    building(b) {
      const def = defOf(b);
      const [status] = statusOf(b);
      const block = blockAt(game, b.x, b.y);
      return `<b>${def.name}</b><div class="dim">${status}</div>${block && block.q > 0 ? `<div class="good">Part of ${block.name} · rating ${block.rating}</div>` : ''}`;
    },
    gate(g) {
      const house = g.gatehouse && world.buildings.get(g.gatehouse);
      return `<b>${EDGES[g.dir][0].toUpperCase() + EDGES[g.dir].slice(1)} gate</b><div class="dim">${house ? (house.state === 'ready' ? (g.open ? 'Drawbridge down' : 'Drawbridge raised') : 'Gatehouse going up') : 'An open bridge. Build a gatehouse to guard it.'}</div>`;
    },
    block(block) {
      return `<b>${block.name}</b> <span class="dim">· rating ${block.rating}</span><div class="dim">${block.standing} · ${block.homes} homes, ${block.specials.length} ${block.specials.length === 1 ? 'building' : 'buildings'} at its heart</div>${block.rating < 40 ? '<div class="dim">Click for what would improve it.</div>' : ''}`;
    },
    tile(x, y) {
      if (!world.realm[idx(x, y)]) {
        const w = world.wards[wardOfTile(x, y)];
        return `<b>${w.name}</b><div class="dim">${w.owned ? '' : 'Beyond the moat. Annex it from the realm map (M).'}</div>`;
      }
      const z = world.zone[idx(x, y)];
      return `<b>${describeTile(world, x, y)}</b>${z ? `<div class="dim">${ZONES[ZONE_NAME[z]].name} zone${world.road[idx(x, y)] ? '' : ''}</div>` : world.road[idx(x, y)] ? '<div class="dim">Road</div>' : ''}`;
    },
  };

  // ------------------------------------------------------------ panels

  const close = () => { selection = null; el.hidden = true; ctx.scene.overlays.clear('select'); ctx.tools.showBlockOverlay(null); };
  const head = (title, sub, pic) => [
    h('button.btn.x', { 'aria-label': 'Close', html: icon('close', 14), onclick: close }),
    h('h2', {}, pic ? h('span', { html: pic }) : null, title),
    sub ? h('div.sub', { html: sub }) : null,
  ];

  function houseNeeds(b) {
    const out = [];
    const [cx, cy] = [b.x + b.w / 2, b.y + b.d / 2];
    const next = BUILDINGS[b.type].level < 3 ? (b.level === 1 ? 'house' : 'townhouse') : null;
    if (!next) return out;
    const q = qualityAt(game, cx, cy);
    const want = b.level === 1
      ? [['Clean water close by', covered(game, 'water', cx, cy) > 0.25], [`Folk content (${Math.round(55 - 8 * q)}+)`, game.happiness >= 55 - 8 * q]]
      : [['Clean water', covered(game, 'water', cx, cy) > 0.4], ['A chapel in reach', covered(game, 'faith', cx, cy) > 0.25], ['Shops near', covered(game, 'commerce', cx, cy) > 0.15], [`Folk content (${Math.round(62 - 8 * q)}+)`, game.happiness >= 62 - 8 * q], [`A town of ${Math.round(80 - 25 * q)}+`, headcount(game) >= 80 - 25 * q]];
    out.push(h('h3', {}, `To become a ${BUILDINGS[next].name.toLowerCase()}`));
    for (const [text, ok] of want) out.push(h('div', { html: `${ok ? '✔' : '✘'} <span class="${ok ? 'good' : 'bad'}">${text}</span>` }));
    return out;
  }

  function blockCard(block, compact = false) {
    const { perks, tips } = blockReport(block);
    const q = block.q;
    return h('div', {},
      h('div.kv', {}, h('span', {}, 'Rating'), h('span', {}, `${block.rating} · ${block.standing}`), h('span', {}, 'Ring built'), h('span', {}, `${block.built} of ${block.zoned} plots`), h('span', {}, 'Homes'), h('span', {}, `${block.homes} (${block.cap} beds)`), h('span', {}, 'Heart'), h('span', {}, block.hearts.length ? block.hearts.map((x) => x.name).join(', ') : block.crop ?? 'Empty')),
      bar(q, q >= 0.6 ? '' : q >= 0.3 ? 'warn' : 'bad'),
      compact ? null : [
        perks.length ? h('h3', {}, 'What it gives') : null,
        ...perks.map((p) => h('div', { style: { display: 'flex', gap: '6px', margin: '3px 0', fontSize: '13px', alignItems: 'flex-start' }, html: `${icon(p.icon, 16)}<span class="${p.soft ? 'dim' : ''}">${p.text}</span>` })),
        tips.length ? h('h3', {}, 'To improve it') : null,
        ...tips.map((t) => h('p', { html: `✦ ${t}` })),
      ]);
  }

  function showBuilding(b) {
    const def = defOf(b);
    const [status, kind] = statusOf(b);
    const parts = [...head(def.name, `${def.cat === 'housing' ? 'Home' : def.cat === 'market' ? 'Trade' : def.cat[0].toUpperCase() + def.cat.slice(1)}${b.level > 1 && def.auto ? ` · level ${b.level}` : ''}`)];
    parts.push(h('div.badge-line', {}, tag(status, kind)));
    if (b.state === 'building') parts.push(bar(b.progress, 'warn'));
    parts.push(h('p', {}, def.desc));
    const rows = [];
    if (b.state === 'ready') {
      const jobs = jobsOf(b);
      if (jobs) rows.push(['Workers', `${num(b.workers, 1)} of ${jobs}`]);
      if (jobs) rows.push(['Efficiency', pct(Math.min(1, b.eff || 0))]);
      // What is made far from a store is partly lost on the way: say so, and what would help.
      if (def.work && b.connected && haulK(b) < 0.98) rows.push(['Haul', `${pct(1 - haulK(b))} lost on the road to the stores; a granary or storehouse nearer would save it`]);
      if (def.cap) rows.push(['Beds', def.cap]);
      if (def.upkeep) rows.push(['Upkeep', `${def.upkeep} gold a week`]);
      if (def.work?.kind === 'farm') rows.push(['Fields tended', `${b.fields?.length ?? b.fields?.size ?? 0} tiles`]);
      if (def.work?.kind === 'gather') rows.push(['Gathers', `${RESOURCES[def.work.res].name.toLowerCase()} within ${def.work.radius} tiles`]);
      if (def.work?.kind === 'make') rows.push(['Makes', `${Object.keys(def.work.out).map((r) => `${num(def.work.out[r] * Math.min(1, b.eff || 0), 1)} ${RESOURCES[r].name.toLowerCase()}`).join(', ')} a week from ${Object.entries(def.work.in).map(([r, n]) => `${num(n * Math.min(1, b.eff || 0), 1)} ${RESOURCES[r].name.toLowerCase()}`).join(', ')}`]);
      if (def.work?.kind === 'grow') rows.push(['Grows', `${Object.keys(def.work.yields).map((r) => RESOURCES[r].name.toLowerCase()).join(', ')}, most at harvest`]);
      if (def.shop) rows.push(['Sells', `wares worth ${num(def.shop * 1.7, 1)} gold a week at most`]);
      if (def.serve) rows.push(['Looks after', `homes within ${def.serve.radius} tiles`]);
      if (def.store) rows.push(['Holds', Object.entries(def.store).map(([k, n]) => `${num(n)} ${k}`).join(', ')]);
      if (def.defense) rows.push(['Defense', def.defense]);
    } else rows.push(['Crew', `${round((b.crewK ?? 0) * def.crew)} of ${def.crew} builders`]);
    parts.push(kv(rows));
    const block = blockAt(game, b.x + 0.5, b.y + 0.5);
    if (block && (def.cap || def.auto)) parts.push(h('h3', {}, `In ${block.name}`), blockCard(block, true));
    if (def.auto === 'res' && b.state === 'ready') parts.push(...houseNeeds(b));
    if (HEARTS[b.type] && b.state === 'ready' && b.type !== 'castle') {
      const inHeart = block && block.core.includes(idx(Math.floor(b.x + b.w / 2), Math.floor(b.y + b.d / 2)));
      parts.push(h('p', { html: inHeart ? `<span class="good">★ This is the heart of its block.</span>` : '<span class="dim">★ In the middle of a donut block this would serve the whole ring and earn a courtyard bonus.</span>' }));
    }
    if (jobsOf(b) && b.type !== 'castle' && b.state === 'ready') {
      const cur = priorityOf(game, b.type);
      parts.push(h('div.actions', {}, h('span.dim', {}, `Hands for every ${def.name.toLowerCase()}: `), h('span.seg', {}, ...PRIORITY.map((name, n) => h('button', { class: n === cur ? 'on' : '', onclick: () => { setPriority(game, b.type, n); ctx.refreshPanels(); } }, name)))));
    }
    if (b.type === 'castle') return showCastle(parts);
    const acts = h('div.actions');
    acts.append(h('button.btn.small', { onclick: () => { const r = demolish(game, b.x, b.y); if (r.ok) { ctx.say(`${r.what} torn down.`, 'info'); ctx.sfx('clear'); close(); } } }, 'Tear down'));
    parts.push(acts);
    return parts;
  }

  function showCastle(parts) {
    const lvl = CASTLE_LEVELS[game.castleLevel];
    const next = CASTLE_LEVELS[game.castleLevel + 1];
    parts.push(kv([['Garrison', `${lvl.jobs} hands`], ['Defense', num(defenseOf(game), 0)], ['Wards it can hold', lvl.wards], ['Stores', `${num(lvl.store.food)} food, ${num(lvl.store.goods)} goods`]]));
    if (game.castleWork) {
      const w = game.castleWork;
      parts.push(h('h3', {}, `Raising the ${CASTLE_LEVELS[w.level].name}`), bar(w.progress, 'warn'), h('p.dim', {}, `${Math.max(0, Math.ceil((1 - w.progress) * w.weeks))} weeks to go with a full crew.`));
    } else if (next) {
      const plan = planCastle(game);
      parts.push(h('h3', {}, `Raise a ${next.name}`), h('p', {}, next.desc), h('div.kv', {}, h('span', {}, 'Cost'), h('span', { html: Object.entries(next.cost).map(([r, n]) => `<span class="${game.stock[r] < n ? 'bad' : ''}">${n} ${RESOURCES[r].name.toLowerCase()}</span>`).join(', ') }), h('span', {}, 'Time'), h('span', {}, `${next.weeks} weeks`), h('span', {}, 'Holds'), h('span', {}, `${next.wards} wards`)));
      parts.push(h('div.actions', {}, h('button.btn.gold', { disabled: !plan.ok, onclick: () => { const r = startCastle(game); if (!r.ok) ctx.say(r.reason, 'warn'); else ctx.sfx('place'); show(selection); } }, 'Begin the work'), !plan.ok ? h('span.dim', {}, plan.reason) : null));
    } else parts.push(h('p.dim', {}, 'There is nothing grander to build. The Citadel is the end of the road.'));
    parts.push(h('p.dim', {}, `Next rank: ${RANKS[Math.min(RANKS.length - 1, game.rank + 1)].name}.`));
    return parts;
  }

  function showGate(g) {
    const house = g.gatehouse && world.buildings.get(g.gatehouse);
    const parts = [...head(`${EDGES[g.dir][0].toUpperCase() + EDGES[g.dir].slice(1)} gate`, 'A bridge over the moat')];
    parts.push(h('p', {}, 'Merchants and the dead both come over the bridges. A gatehouse guards it, and gives you a windlass to raise the drawbridge.'));
    parts.push(kv([['Gatehouse', house ? (house.state === 'ready' ? 'Standing' : 'Going up') : 'None'], ['Drawbridge', house && house.state === 'ready' ? (g.open ? 'Down' : 'Raised') : 'Fixed'], ['Defense at this gate', num(defenseOf(game, g), 0)]]));
    const acts = h('div.actions');
    if (!house) acts.append(h('button.btn.gold', { onclick: () => { ctx.tools.set('build', { build: { type: 'gatehouse', front: null } }); } }, 'Build a gatehouse'));
    else if (house.state === 'ready') acts.append(h('button.btn', { onclick: () => { toggleGate(game, g); show(selection); } }, g.open ? 'Raise the drawbridge' : 'Lower the drawbridge'));
    parts.push(acts, h('p.dim', {}, 'A raised bridge keeps merchants out as well as the dead.'));
    ctx.scene.overlays.clear('select');
    return parts;
  }

  function showBlockPanel(block) {
    const parts = [...head(block.name, `${block.standing} · ${block.homes} homes`, icon('block', 22))];
    parts.push(blockCard(block));
    ctx.tools.showBlockOverlay(block);
    return parts;
  }

  function showTile(x, y) {
    const i = idx(x, y);
    const w = world.wards[wardOfTile(x, y)];
    const g = world.ground[i];
    const parts = [...head(describeTile(world, x, y), `${w.name}${w.owned ? '' : ' · beyond the moat'}`)];
    const rows = [['Ground', ['Meadow', 'Rock', 'Iron ore', 'Water', 'Cliff', 'Shore'][g]]];
    if (world.realm[i]) {
      rows.push(['Soil', `${Math.round((world.fert[i] / 255) * 100)}% fertile`]);
      if (world.tree[i]) rows.push(['Trees', ['', 'a few', 'many', 'dense'][world.tree[i]] ?? 'many']);
      if (g === GROUND.ROCK || g === GROUND.ORE) rows.push(['Left to cut', world.amount[i]]);
      if (world.zone[i]) rows.push(['Zoned', ZONES[ZONE_NAME[world.zone[i]]].name]);
      const care = ['water', 'faith', 'cheer', 'health', 'security', 'commerce'].map((k) => [k, covered(game, k, x, y)]).filter(([, v]) => v > 0.05);
      if (care.length) rows.push(['Looked after', care.map(([k, v]) => `${k} ${pct(v)}`).join(', ')]);
    }
    parts.push(kv(rows));
    if (!w.owned) parts.push(h('div.actions', {}, h('button.btn.gold', { onclick: () => ctx.dialogs.open('realm', { ward: w.id }) }, 'See on the realm map')));
    return parts;
  }

  function show(sel) {
    selection = sel;
    if (!sel) return close();
    const ov = ctx.scene.overlays;
    let parts;
    ov.clear('select');
    if (sel.kind === 'building') {
      const b = world.buildings.get(sel.id);
      if (!b) return close();
      parts = showBuilding(b);
      ov.rect('select', { x: b.x, y: b.y, w: b.w, d: b.d }, { color: '#ffe27a', width: 0.18, opacity: 0.95, pulse: 0.15 });
      const block = blockAt(game, b.x + 0.5, b.y + 0.5);
      ctx.tools.showBlockOverlay(block && block.q > 0 ? block : null);
    } else if (sel.kind === 'gate') {
      const g = world.gates[sel.id];
      if (!g) return close();
      parts = showGate(g);
    } else if (sel.kind === 'block') {
      const block = game.blocks[sel.id];
      if (!block) return close();
      parts = showBlockPanel(block);
    } else {
      parts = showTile(sel.x, sel.y);
      ov.rect('select', { x: sel.x, y: sel.y, w: 1, d: 1 }, { color: '#ffe27a', width: 0.12, opacity: 0.9 });
    }
    fill(el, parts);
    el.hidden = false;
  }

  const inspector = {
    el, describe, show, close,
    get selection() { return selection; },
    /** Redraws the panel when the game has moved on, if it is open. */
    refresh() {
      if (!selection || el.hidden) return;
      if (selection.kind === 'building' && !world.buildings.has(selection.id)) return close();
      if (selection.kind === 'block' && !game.blocks[selection.id]) return close();
      const top = el.scrollTop;
      show(selection);
      el.scrollTop = top;
    },
  };
  return inspector;
}
