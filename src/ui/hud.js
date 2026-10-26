import { FOODS, RANKS, RESOURCES } from '../catalog.js';
import { defenseOf, threatOf } from '../sim/events.js';
import { calendar } from '../sim/calendar.js';
import { headcount, housingCap } from '../sim/game.js';
import { HOME_WARD } from '../config.js';
import { wardId } from '../world/wards.js';
import { h, num, round } from './dom.js';
import { GOOD_ICON, icon } from './icons.js';

/**
 * The bar across the top: who the lord is and what day it is, what is in the
 * stores and how it is moving, how many people there are and how they feel,
 * and the clock's controls. Everything has a tooltip that says what lies
 * behind the number.
 */

const SEASON_ICON = ['leaf', 'sun', 'autumn', 'snow'];
const SPEEDS = [
  { id: 0, icon: 'pause', label: 'Pause', key: 'Space' },
  { id: 1, icon: 'play', label: 'Normal pace', key: 'Space' },
  { id: 2, icon: 'fast', label: 'Twice as fast', key: 'Tab' },
  { id: 4, icon: 'faster', label: 'Four times as fast', key: 'Tab' },
];

const faceOf = (v) => (v >= 72 ? 'happy' : v >= 52 ? 'content' : v >= 32 ? 'sad' : 'angry');
const moodWord = (v) => (v >= 80 ? 'Delighted' : v >= 66 ? 'Happy' : v >= 52 ? 'Content' : v >= 40 ? 'Uneasy' : v >= 28 ? 'Unhappy' : 'Furious');

export function createHud(ctx) {
  const { game, tip } = ctx;
  const chips = {};
  const el = h('div.hud');

  const title = h('div.title');
  const date = h('div.date');
  const realm = h('div.panel.realm', {}, h('span', { html: icon('crown', 26) }), h('div', {}, title, date));
  el.append(realm);

  const bar = h('div.panel.chips');
  const chip = (key, pic, tipFn) => {
    const num_ = h('span.n');
    const sub = h('small');
    const delta = h('span.d');
    const c = h('div.chip', {}, h('span', { html: pic }), num_, sub, delta);
    c.refs = { num: num_, sub, delta };
    tip.attach(c, tipFn);
    chips[key] = c;
    bar.append(c);
    return c;
  };

  const flowOf = (r) => (game.flows?.made?.[r] ?? 0) - (game.flows?.used?.[r] ?? 0);
  const goodTip = (r) => () => {
    const made = game.flows?.made?.[r] ?? 0, used = game.flows?.used?.[r] ?? 0;
    const cap = RESOURCES[r].store === 'food' ? game.cap?.food : RESOURCES[r].store === 'goods' ? game.cap?.goods : null;
    return `<b>${RESOURCES[r].name}</b><div class="row"><span>In the stores</span><span>${num(game.stock[r])}</span></div>`
      + `<div class="row"><span>Made last week</span><span class="good">+${num(made, 1)}</span></div>`
      + `<div class="row"><span>Used or lost</span><span class="bad">−${num(used, 1)}</span></div>`
      + (cap ? `<div class="dim">The stores hold up to ${num(cap)} of ${RESOURCES[r].store === 'food' ? 'food' : 'goods'} in all.</div>` : '');
  };
  for (const r of ['gold', 'wood', 'stone', 'iron', 'tools']) chip(r, icon(GOOD_ICON[r], 20), goodTip(r));
  chip('food', icon('food', 20), () => {
    const r = game.report;
    const rows = FOODS.filter((f) => game.stock[f] > 0.5).map((f) => `<div class="row"><span>${RESOURCES[f].name}</span><span>${num(game.stock[f])}</span></div>`).join('');
    const weeks = r.foodWeeks ?? 0;
    return `<b>Food</b>${rows || '<div class="dim">The larder is bare.</div>'}`
      + `<div class="row"><span>Eaten a week</span><span>${num(r.foodNeed ?? 0, 1)}</span></div>`
      + `<div class="row"><span>Lasts</span><span class="${weeks < 6 ? 'bad' : ''}">${weeks > 99 ? 'ages' : num(weeks, 1) + ' weeks'}</span></div>`
      + `<div class="row"><span>Varieties</span><span>${r.variety ?? 0} of 3 kinds</span></div>`
      + `<div class="dim">People eat grain or bread, vegetables and fruit, and meat or fish. A table with all three is a happier one.</div>`;
  });
  chip('pop', icon('people', 20), () => {
    const p = game.pop, r = game.report;
    return `<b>People</b><div class="row"><span>Children</span><span>${round(p.children)}</span></div><div class="row"><span>Adults</span><span>${round(p.adults)}</span></div><div class="row"><span>Elders</span><span>${round(p.elders)}</span></div>`
      + `<div class="row"><span>Beds</span><span>${round(headcount(game))} of ${housingCap(game)}</span></div>`
      + `<div class="row"><span>At work</span><span>${round(r.employed ?? 0)} of ${round(r.workforce ?? 0)}</span></div>`
      + `<div class="row"><span>Idle</span><span class="${(r.idle ?? 0) > 2 ? 'bad' : ''}">${round(r.idle ?? 0)}</span></div>`
      + `<div class="dim">Open jobs: ${round(r.jobsOpen ?? 0)}. A good town needs hands for its jobs, and homes for its hands.</div>`;
  });
  chip('mood', icon('happy', 20), () => {
    const r = game.report, c = r.care ?? {};
    const line = (name, v, good = 0.75) => `<div class="row"><span>${name}</span><span class="${v >= good ? 'good' : v < 0.3 ? 'bad' : ''}">${Math.round(v * 100)}%</span></div>`;
    return `<b>${moodWord(game.happiness)}</b><div class="dim">Folk move on if this falls below 38, and come to a happy town.</div>`
      + line('Well fed', r.foodSat ?? 1, 0.95) + line('Warm', r.fuelSat ?? 1, 0.95) + line('Ale', r.aleSat ?? 1, 0.8)
      + line('Water', c.water ?? 0) + line('Faith', c.faith ?? 0) + line('Cheer', c.cheer ?? 0) + line('Health', game.health / 100) + line('Safety', c.security ?? 0)
      + (game.blockGain?.mood > 0.2 ? `<div class="row"><span>Courtyard blocks</span><span class="good">+${game.blockGain.mood.toFixed(1)}</span></div>` : '')
      + (game.tax > 0.1 ? `<div class="row"><span>Taxes</span><span class="bad">−${((game.tax - 0.1) * 70).toFixed(0)}</span></div>` : '');
  });
  // Raiders on the road: a chip that counts down the weeks, and says how the walls would stand. A click looks at the gate.
  const threat = chip('threat', icon('sword', 20), () => {
    const g = game.raidGate;
    const d = defenseOf(game, g), s = threatOf(game);
    return `<b>Raiders on the road</b><div class="row"><span>Coming to</span><span>${g ? ['the north', 'the east', 'the south', 'the west'][g.dir] + ' gate' : 'the castle'}</span></div>`
      + `<div class="row"><span>Your defense</span><span class="${d >= s * 1.3 ? 'good' : d < s ? 'bad' : ''}">${num(d, 0)}</span></div>`
      + `<div class="row"><span>Their strength, about</span><span>${num(s, 0)}</span></div>`
      + `<div class="dim">Towers, barracks and a gatehouse (with its bridge raised) hold them. Click to look at the gate.</div>`;
  });
  threat.classList.add('threat');
  threat.addEventListener('click', () => { const g = game.raidGate; if (g?.mid) ctx.scene.focusOn(g.mid[0], g.mid[1], { zoom: 1.2 }); });
  el.append(bar);

  const speed = h('div.panel.speed');
  const paused = h('span.paused', {}, 'Paused');
  speed.append(paused);
  const speedButtons = SPEEDS.map((s) => {
    const b = h('button', { 'aria-label': s.label, html: icon(s.icon, 18), onclick: () => ctx.clock.set(s.id) });
    tip.attach(b, () => `${s.label} <span class="dim">[${s.key}]</span>`);
    speed.append(b);
    return [s, b];
  });
  const extras = [
    ['ledger', 'ledger', 'The ledger: coin, stores, trade and labor'],
    ['bell', 'chronicle', 'The chronicle'],
    ['menu', 'menu', 'Menu (F10)'],
  ];
  speed.append(h('span.sep'));
  for (const [ic, dlg, label] of extras) {
    const b = h('button', { 'aria-label': label, html: icon(ic, 20), onclick: () => ctx.dialogs.toggle(dlg) });
    tip.attach(b, () => label);
    speed.append(b);
  }
  el.append(speed);

  const refreshCalendar = () => {
    const cal = calendar(game.week);
    const rank = RANKS[game.rank];
    title.textContent = `${rank.name} of ${game.world.wards[wardId(HOME_WARD, HOME_WARD)].name}`;
    const weather = ctx.scene.atmosphere.state;
    date.innerHTML = `${icon(weather.rain ? 'rain' : weather.snow > 0.3 && cal.season === 3 ? 'snow' : SEASON_ICON[cal.season], 16)} ${cal.monthName} · Year ${cal.year}`;
  };

  const set = (key, text, { sub = '', low = false, warn = false, delta = null } = {}) => {
    const c = chips[key], r = c.refs;
    r.num.textContent = text;
    r.sub.textContent = sub;
    c.classList.toggle('low', low);
    c.classList.toggle('warn', warn);
    if (delta === null || Math.abs(delta) < 0.05) { r.delta.textContent = ''; r.delta.className = 'd'; }
    else { r.delta.textContent = `${delta > 0 ? '+' : '−'}${Math.abs(delta) >= 10 ? Math.round(Math.abs(delta)) : Math.abs(delta).toFixed(1)}`; r.delta.className = `d ${delta > 0 ? 'up' : 'down'}`; }
  };

  const hud = {
    el,
    update() {
      const r = game.report;
      refreshCalendar();
      const cold = calendar(game.week).season >= 2;
      set('gold', num(game.stock.gold), { delta: r.income ?? 0, low: game.stock.gold < 20 });
      set('wood', num(game.stock.wood), { delta: flowOf('wood'), low: game.stock.wood < 25 && cold, warn: game.stock.wood < 60 && cold });
      set('stone', num(game.stock.stone), { delta: flowOf('stone') });
      set('iron', num(game.stock.iron), { delta: flowOf('iron') });
      set('tools', num(game.stock.tools), { delta: flowOf('tools') });
      const weeks = r.foodWeeks ?? 99;
      set('food', num(FOODS.reduce((n, f) => n + game.stock[f], 0)), { sub: weeks > 60 ? '' : `${num(weeks, 0)} wk`, low: weeks < 4, warn: weeks < 8 });
      set('pop', `${round(headcount(game))}`, { sub: `/${housingCap(game)}`, low: false, warn: headcount(game) >= housingCap(game) });
      // Idle hands are worth a glance: they are what workshops and smallholdings are for.
      const idle = Math.round(r.idle ?? 0);
      chips.pop.refs.delta.textContent = idle >= 3 ? `${idle} idle` : '';
      chips.pop.refs.delta.className = idle >= 3 ? 'd down' : 'd';
      const raidIn = game.disasters && Number.isFinite(game.nextRaid) ? game.nextRaid - game.week : Infinity;
      threat.hidden = !(raidIn > 0 && raidIn <= 3);
      if (!threat.hidden) set('threat', `${raidIn} wk`, { low: defenseOf(game, game.raidGate) < threatOf(game) });
      set('mood', `${Math.round(game.happiness)}`, { low: game.happiness < 38, warn: game.happiness < 52 });
      chips.mood.firstChild.innerHTML = icon(faceOf(game.happiness), 20);
      for (const [s, b] of speedButtons) b.classList.toggle('on', ctx.clock.speed === s.id);
      paused.hidden = ctx.clock.speed !== 0;
    },
  };
  return hud;
}
