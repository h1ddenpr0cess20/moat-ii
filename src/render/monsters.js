import { createModel, bake } from 'madness-engine/models/model';
import { createBakeLibrary } from 'madness-engine/models/bake';
import { CENTER, DIRS, ROAD, WATER_LEVEL } from '../config.js';
import { BUILDINGS, ZONE_ID } from '../catalog.js';
import { MONSTERS } from '../sim/monsters.js';
import { WARNING, threatOf } from '../sim/events.js';
import { hash2 } from '../rng.js';
import { heightAt, idx, inb } from '../world/world.js';
import { CAST, SCULPTED, fitScale } from './cast.js';

/**
 * The monsters on the map. What the simulation sends out (monsters.js) walks
 * the way it went that week, a step at a time through the week; a horde of
 * the dead shambles in from the dark beyond the moat to the gate it is making
 * for, over the weeks of warning, and either goes down at the bridge or pours
 * over it; and bats go round the castle at night, crows over the corn by day,
 * and black cats along the streets.
 *
 * Each figure is the engine's cast, baked in a worker. A horde of a dozen
 * zombies would be a dozen skins to move every frame, so the figures share
 * puppets instead: a few copies of each kind, each posed in its clip a little
 * out of step with the others, and every figure drawn with one of their
 * meshes. A dozen zombies are three skins.
 */

/** Puppets a kind has for a clip, a little out of step with one another. */
const PHASES = 3;
/** How long the dead take to go down, or to pour into the town, after a horde is met. */
const AFTER = 7;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** The point a share `f` of the way along a polyline of [x, y] points, and the way it is heading there. */
function along(points, f) {
  if (points.length < 2) return { x: points[0][0], y: points[0][1], dx: 0, dy: 0 };
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  let left = total * clamp01(f);
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const d = Math.hypot(bx - ax, by - ay);
    if (left <= d || i === points.length - 1) {
      const t = d > 0 ? Math.min(1, left / d) : 1;
      return { x: lerp(ax, bx, t), y: lerp(ay, by, t), dx: bx - ax, dy: by - ay };
    }
    left -= d;
  }
  return { x: points[points.length - 1][0], y: points[points.length - 1][1], dx: 0, dy: 0 };
}

export function createMonsters({ GFX, scene, game, world, atmosphere }) {
  const group = new GFX.Group();
  group.name = 'monsters';
  scene.add(group);
  const library = createBakeLibrary({
    sculpted: SCULPTED,
    spawn: () => new Worker(new URL('./cast.worker.js', import.meta.url), { type: 'module' }),
    jobs: () => Object.values(CAST).map((c) => [c.def.name, c.detail]),
    label: 'bloodmoat',
  });
  library.preload();
  const baked = (name) => typeof Worker === 'undefined' || library.isBaked(CAST[name].def.name, CAST[name].detail);

  /** Each kind once it is baked: how it is scaled, and its puppets by clip and phase. */
  const kinds = new Map();
  const kindOf = (name) => {
    if (kinds.has(name)) return kinds.get(name);
    if (!baked(name)) return null;
    const c = CAST[name];
    const fit = fitScale(bake(c.def, { detail: c.detail }), c.def, c.size, c.measure);
    const kind = { name, c, fit, puppets: new Map() };
    kinds.set(name, kind);
    return kind;
  };
  const puppetOf = (kind, clip, phase) => {
    const key = `${clip}:${phase}`;
    let p = kind.puppets.get(key);
    if (!p) {
      p = { model: createModel(GFX, kind.c.def, { detail: kind.c.detail }), clip, phase, used: false };
      kind.puppets.set(key, p);
    }
    p.used = true;
    return p;
  };

  /** The figures on the map, by key: each a mesh borrowing a puppet's skin. */
  const figures = new Map();
  let time = 0;
  /** A horde that has met the gate, for the few seconds after: going down, or pouring in. */
  let aftermath = null;
  /** The last horde as it stood, so the aftermath starts where it was. */
  let lastHorde = null;

  game.on('raid', ({ gate, outcome }) => {
    if (!lastHorde || !gate) return;
    aftermath = { ...lastHorde, outcome, t: 0 };
    lastHorde = null;
  });

  /** Puts (or keeps) figure `key`, a `name` from the cast, at (x, z) on the ground, facing `yaw`. */
  const want = new Set();
  const place = (key, name, x, z, { yaw = 0, clip = 'walk', sink = 0, lift = 0, phase = 0 } = {}) => {
    const kind = kindOf(name);
    if (!kind) return;
    want.add(key);
    const puppet = puppetOf(kind, clip, phase % PHASES);
    let f = figures.get(key);
    if (!f) {
      const mesh = new GFX.Mesh(puppet.model.mesh.geometry, puppet.model.mesh.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `monster ${key}`;
      group.add(mesh);
      f = { mesh };
      figures.set(key, f);
    }
    f.mesh.geometry = puppet.model.mesh.geometry;
    const s = (kind.c.def.scale ?? 1) * kind.fit.k;
    f.mesh.scale.set(s, s * (1 - sink * 0.15), s);
    const ground = Math.max(heightAt(world, x, z), WATER_LEVEL - 0.25);
    f.mesh.position.set(x, ground - kind.fit.foot + (kind.c.hover ?? 0) + lift - sink * kind.fit.height * 1.1, z);
    f.mesh.rotation.y = yaw;
    f.mesh.visible = true;
  };

  // ------------------------------------------------------------ what the simulation sent out

  const CLIP_THERE = { ghost: 'idle', vampire: 'attack', werewolf: 'attack', goblins: 'attack' };

  const drawMonsters = (frac) => {
    for (const m of game.monsters ?? []) {
      const def = MONSTERS[m.kind];
      const at = m.phase === 'slain' ? { x: m.x, y: m.y, dx: 0, dy: 0 } : along(m.trail?.length ? m.trail : [[m.x, m.y]], frac);
      const moving = Math.hypot(at.dx, at.dy) > 1e-3 && m.trail.length > 1;
      let yaw;
      if (moving) yaw = Math.atan2(at.dx, at.dy);
      else {
        const b = world.buildings.get(m.target);
        yaw = b ? Math.atan2(b.x + b.w / 2 - at.x, b.y + b.d / 2 - at.y) : 0;
      }
      const clip = m.phase === 'slain' ? 'hit' : moving ? 'walk' : CLIP_THERE[m.kind] ?? 'idle';
      const sink = m.phase === 'slain' ? clamp01(frac * 1.4 - 0.2) : 0;
      for (let k = 0; k < (m.n ?? 1); k++) {
        // A band walks in a little knot behind its leader.
        const back = k ? 0.22 + 0.08 * k : 0, side = k ? (k % 2 ? 1 : -1) * 0.14 : 0;
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        const x = at.x - sy * back + cy * side, z = at.y - cy * back - sy * side;
        place(`m${m.id}:${k}`, def.cast, x, z, { yaw, clip, sink, phase: m.id + k });
      }
    }
  };

  // ------------------------------------------------------------ the hordes of the dead

  const hordeSize = () => Math.max(5, Math.min(18, Math.round(threatOf(game) / 2.2)));

  /** Where the horde stands: strung out on the way from the dark to the outer end of the bridge, `p` of the way. */
  const hordeAt = (gate, n, p) => {
    const out = DIRS[gate.dir], side = [-out[1], out[0]];
    const [mx, my] = gate.mid;
    const end = [mx + out[0] * 3.6, my + out[1] * 3.6];
    const reach = 24;
    const far = [Math.max(1, Math.min(world.size - 1, mx + out[0] * reach)), Math.max(1, Math.min(world.size - 1, my + out[1] * reach))];
    const list = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 4), lane = (i % 4) - 1.5;
      const lat = lane * 0.42 + (hash2(i, 3, gate.dir) - 0.5) * 0.2;
      const lag = row * 0.55 + hash2(i, 5, gate.dir) * 0.3;
      const x = lerp(far[0], end[0], p) + out[0] * lag + side[0] * lat;
      const y = lerp(far[1], end[1], p) + out[1] * lag + side[1] * lat;
      list.push({ x, y, yaw: Math.atan2(-out[0], -out[1]), name: i % 3 === 2 ? 'skeleton' : 'zombie' });
    }
    return list;
  };

  const drawHorde = (frac, dt) => {
    const g = game.raidGate;
    const left = game.nextRaid - game.week - frac;
    if (g && game.disasters && Number.isFinite(left) && left <= WARNING) {
      const p = clamp01(1 - left / WARNING);
      const n = hordeSize();
      const list = hordeAt(g, n, p);
      lastHorde = { gate: g, list };
      list.forEach((z, i) => place(`h${i}`, z.name, z.x, z.y, { yaw: z.yaw, clip: p >= 1 ? 'attack' : 'walk', phase: i }));
    }
    if (aftermath) {
      aftermath.t += dt;
      const { gate, list, outcome, t } = aftermath;
      const out = DIRS[gate.dir];
      const broke = outcome === 'pillaged' || outcome === 'sacked';
      list.forEach((z, i) => {
        const start = (i / list.length) * 2.5;
        if (broke) {
          // Over the bridge and into the gate quarter, and then lost among the houses.
          const go = clamp01((t - start * 0.3) / 4);
          place(`h${i}`, z.name, z.x - out[0] * go * 6, z.y - out[1] * go * 6, { yaw: z.yaw, clip: 'walk', sink: clamp01((t - 4.5 - start * 0.4) / 1.5), phase: i });
        } else {
          place(`h${i}`, z.name, z.x, z.y, { yaw: z.yaw, clip: t < start ? 'attack' : 'hit', sink: clamp01((t - start) / 1.6), phase: i });
        }
      });
      if (t > AFTER) aftermath = null;
    }
  };

  // ------------------------------------------------------------ what lives here anyway

  let ambient = { cats: [], fields: [], graves: [], clock: 0 };
  /** Looks for where the ambient creatures go: runs of street near houses, the corn, the graveyards. */
  const survey = () => {
    const cats = [], fields = [];
    const homes = [...world.buildings.values()].filter((b) => b.state === 'ready' && BUILDINGS[b.type]?.cap);
    for (let k = 0; k < 3 && homes.length; k++) {
      const b = homes[Math.floor(hash2(k, homes.length, ambient.clock) * homes.length)];
      // The street in front of it: walk along it either way as far as it runs straight.
      for (let r = 1; r <= 3; r++) {
        let found = null;
        for (let y = b.y - r; y < b.y + b.d + r && !found; y++) for (let x = b.x - r; x < b.x + b.w + r && !found; x++) if (inb(x, y) && (world.road[idx(x, y)] === ROAD.DIRT || world.road[idx(x, y)] === ROAD.COBBLE)) found = [x, y];
        if (!found) continue;
        const [x0, y0] = found;
        const horiz = inb(x0 + 1, y0) && world.road[idx(x0 + 1, y0)] ? 1 : 0;
        let a = 0, c = 0;
        while (a > -6 && inb(x0 + (horiz ? a - 1 : 0), y0 + (horiz ? 0 : a - 1)) && world.road[idx(x0 + (horiz ? a - 1 : 0), y0 + (horiz ? 0 : a - 1))]) a--;
        while (c < 6 && inb(x0 + (horiz ? c + 1 : 0), y0 + (horiz ? 0 : c + 1)) && world.road[idx(x0 + (horiz ? c + 1 : 0), y0 + (horiz ? 0 : c + 1))]) c++;
        if (c - a >= 2) cats.push({ from: [x0 + 0.5 + (horiz ? a : 0), y0 + 0.5 + (horiz ? 0 : a)], to: [x0 + 0.5 + (horiz ? c : 0), y0 + 0.5 + (horiz ? 0 : c)], seed: k });
        break;
      }
    }
    for (let k = 0; k < 400 && fields.length < 2; k++) {
      const x = Math.floor(hash2(k, 7, ambient.clock) * world.size), y = Math.floor(hash2(7, k, ambient.clock) * world.size);
      if (world.zone[idx(x, y)] === ZONE_ID.wheat) fields.push([x + 0.5, y + 0.5]);
    }
    const graves = [...world.buildings.values()].filter((b) => b.state === 'ready' && b.type === 'graveyard').slice(0, 3).map((b) => [b.x + b.w / 2, b.y + b.d / 2]);
    ambient = { cats, fields, graves, clock: ambient.clock };
  };
  let surveyClock = 0;

  const castleTop = () => heightAt(world, CENTER, CENTER) + 1.4 + 0.5 * game.castleLevel;

  const drawAmbient = () => {
    const night = atmosphere.state.night ?? 0;
    // Bats round the castle's towers after dusk.
    if (night > 0.3) {
      for (let i = 0; i < 7; i++) {
        const r = 1.6 + 1.8 * hash2(i, 1, 3), sp = (0.5 + 0.4 * hash2(i, 2, 3)) * (i % 2 ? 1 : -1);
        const a = time * sp + i * 0.9;
        const x = CENTER + Math.cos(a) * r, z = CENTER + Math.sin(a) * r;
        const lift = castleTop() - heightAt(world, x, z) + 0.6 * Math.sin(time * 1.3 + i);
        place(`bat${i}`, 'bat', x, z, { yaw: a + (sp > 0 ? 0 : Math.PI), lift, phase: i });
      }
      ambient.graves.forEach(([gx, gz], k) => {
        for (let i = 0; i < 2; i++) {
          const a = time * 0.7 + i * 3;
          place(`gbat${k}:${i}`, 'bat', gx + Math.cos(a) * 1.2, gz + Math.sin(a) * 1.2, { yaw: a, lift: 1.2 + 0.3 * Math.sin(time + i), phase: i + k });
        }
        // The graveyard's own walk about it at night: a skeleton among the stones, and a shape over the crypt.
        const a = time * 0.25 + k;
        place(`gskel${k}`, 'skeleton', gx + Math.cos(a) * 0.7, gz + 0.2 + Math.sin(a) * 0.5, { yaw: a + Math.PI / 2, phase: k });
        place(`gghost${k}`, 'wraith', gx, gz - 0.55, { yaw: Math.sin(time * 0.3) * 0.6, clip: 'idle', lift: 0.1 + 0.05 * Math.sin(time * 1.1), phase: k });
      });
    } else {
      // Crows over the corn by day.
      ambient.fields.forEach(([fx, fz], k) => {
        for (let i = 0; i < 3; i++) {
          const a = time * (0.45 + 0.1 * i) + i * 2.1;
          place(`crow${k}:${i}`, 'crow', fx + Math.cos(a) * (1 + 0.4 * i), fz + Math.sin(a) * (1 + 0.4 * i), { yaw: a + Math.PI, lift: 1.1 + 0.25 * Math.sin(time + i), phase: i });
        }
      });
    }
    // Black cats along the streets, there and back.
    ambient.cats.forEach((c, k) => {
      const len = Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1]);
      const period = len / 0.35;
      const u = ((time + k * 7) % (period * 2)) / period;
      const f = u < 1 ? u : 2 - u;
      const x = lerp(c.from[0], c.to[0], f), z = lerp(c.from[1], c.to[1], f);
      const dx = (c.to[0] - c.from[0]) * (u < 1 ? 1 : -1), dz = (c.to[1] - c.from[1]) * (u < 1 ? 1 : -1);
      place(`cat${k}`, 'blackcat', x + 0.3, z + 0.3, { yaw: Math.atan2(dx, dz), phase: k });
    });
  };

  return {
    group,
    /** Whether the cast is baked and ready to stand up. */
    get ready() { return Object.keys(CAST).every(baked); },
    /** Once a frame: `frac` is how far through the week the game is; `live` is the frame's time, 0 while paused. */
    update(dt, { frac = 0, live = dt } = {}) {
      time += live;
      surveyClock -= dt;
      if (surveyClock <= 0) { surveyClock = 12; ambient.clock++; survey(); }
      want.clear();
      for (const kind of kinds.values()) for (const p of kind.puppets.values()) p.used = false;
      drawMonsters(frac);
      drawHorde(frac, live);
      drawAmbient();
      for (const [key, f] of figures) {
        if (want.has(key)) continue;
        group.remove(f.mesh);
        figures.delete(key);
      }
      for (const kind of kinds.values()) {
        for (const p of kind.puppets.values()) {
          if (!p.used) continue;
          p.model.pose({ clip: p.clip, t: (time + p.phase * 0.31) % 1.2, time: time + p.phase * 0.37, seed: p.phase, speed: kind.c.speed });
        }
      }
    },
    /** Where the figures are, for the interface to point at. */
    count: () => figures.size,
  };
}
