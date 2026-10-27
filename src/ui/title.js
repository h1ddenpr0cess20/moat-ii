import { h } from './dom.js';
import { savedList } from './saves.js';

/**
 * The title: over the land, the name, and the way in. A new realm is a seed
 * (the same seed is always the same land) and how hard the dead come.
 */
export function createTitle({ seed, difficulty, disasters, size, sizes, canContinue, saves, onBegin, onContinue, onNew, onLoad }) {
  const seedInput = h('input', { type: 'text', value: seed, maxlength: 24, 'aria-label': 'Seed', spellcheck: 'false' });
  let level = difficulty;
  const seg = h('span.seg', {}, ...[['peaceful', 'Peaceful'], ['normal', 'Normal'], ['hard', 'Hard']].map(([id, name]) => h('button', { class: id === level ? 'on' : '', onclick: (e) => { level = id; e.target.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target)); } }, name)));
  let chosen = size;
  const sizeSeg = h('span.seg', {}, ...Object.entries(sizes).map(([id, wards]) => h('button', { class: id === chosen ? 'on' : '', title: `${wards} × ${wards} wards, ${wards * 30} × ${wards * 30} tiles`, onclick: (e) => { chosen = id; e.target.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target)); note.textContent = sizeNote(id); } }, `${id[0].toUpperCase() + id.slice(1)} ${wards * 30}`)));
  const sizeNote = (id) => `${sizes[id]} × ${sizes[id]} wards. ${id === 'large' ? 'A great realm: slower to make, and it wants a good machine.' : id === 'medium' ? 'Room to grow, and a fair load.' : 'A compact barony, quick to make.'}`;
  const note = h('div.dim', { style: { fontSize: '12.5px', textAlign: 'left' } }, sizeNote(chosen));
  const dice = () => { seedInput.value = Math.random().toString(36).slice(2, 8); };
  const disastersBox = h('input', { type: 'checkbox', checked: disasters });
  const begin = () => (seedInput.value.trim() === seed && level === difficulty && chosen === size && disastersBox.checked === disasters && !canContinue ? onBegin() : onNew(seedInput.value.trim() || seed, level, chosen, disastersBox.checked));
  const shelf = h('div.title-saves', { hidden: true });
  const drawShelf = () => {
    shelf.replaceChildren(savedList(saves, { onLoad, redraw: drawShelf }));
    loadBtn.hidden = !saves.list().length;
  };
  const loadBtn = h('button.btn', { onclick: () => { shelf.hidden = !shelf.hidden; } }, 'Load a saved realm');
  const el = h('div.title-screen', {},
    h('h1', {}, 'MOAT II', h('small', {}, 'BLOOD MOAT')),
    h('div.tag-line', {}, 'You are the vampire lord of a black castle in a moat of blood. Raise a town of donut blocks and pumpkin patches, dig the moat wider, and keep your people safe from the dead.'),
    h('div.panel.title-card', {},
      canContinue ? h('button.btn.gold', { onclick: onContinue }, 'Continue your realm') : null,
      h('button.btn' + (canContinue ? '' : '.gold'), { onclick: begin }, canContinue ? 'A new realm' : 'Begin'),
      loadBtn, shelf,
      h('label', {}, 'Land (seed)', h('span', {}, seedInput, h('button.btn.small', { title: 'A different land', onclick: dice }, '⟲'))),
      h('label', {}, 'Map size', sizeSeg), note,
      h('label', {}, 'The dead', seg),
      h('label', {}, 'Monsters (hordes, ghosts, werewolves, goblins, cultists)', disastersBox)));
  drawShelf();
  return { el, remove() { el.remove(); } };
}
