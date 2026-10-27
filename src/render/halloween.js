import { Mesher } from 'madness-engine/mesher';
import { PALETTE } from 'madness-engine/buildings/common';
import { green as villageGreen } from 'madness-engine/buildings/civic';
import { hash2 } from '../rng.js';

/**
 * What the season grows and the people put out: pumpkins (and the lanterns
 * carved from them), corn and its shocks, a scarecrow with a pumpkin for a
 * head, dead trees, headstones, and the graveyard. All drawn on the engine's
 * mesher, to the scale of the town: a tile is about four and a half meters,
 * so a man is 0.4 of one, a door 0.45, a stalk of corn half a tile, and a
 * pumpkin a hand's span under a tenth.
 */

const ORANGE = ['#e8761e', '#d8661a', '#f08a2a', '#c85a18'];
const VINE = '#3e5a26';

/**
 * A pumpkin standing on y at (x, z), `r` its radius: lobes in a ring and a stem. With `lantern`, a face is cut
 * in its front (toward +z, turned by `yaw`) in the glow material, which lights up after dark.
 */
export function pumpkin(m, x, y, z, r, { col = ORANGE[0], lantern = false, detail = 0, lobes = 6, yaw = 0, seed = 0 } = {}) {
  for (let k = 0; k < lobes; k++) {
    const a = (k / lobes) * Math.PI * 2 + yaw;
    m.sphere('plain', x + Math.cos(a) * r * 0.34, y + r * 0.74, z + Math.sin(a) * r * 0.34, r * 0.62, r * 0.74, r * 0.62, col, { detail, jitter: 0.14, seed: seed + k, light: 0.25 });
  }
  m.cylinder('wood', x, y + r * 1.3, z, r * 0.07, r * 0.11, r * 0.32, 5, '#4a4a1e');
  if (!lantern) return;
  // The face: two triangle eyes, a nose, and a grin with teeth, each a little proud of the rind.
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const on = (u, v) => {
    const k = 1 - (u / 0.96) ** 2 - ((v - 0.74) / 0.76) ** 2;
    const w = (Math.sqrt(Math.max(0, k)) * 0.96 + 0.05) * r;
    const lu = u * r;
    return [x + lu * c + w * s, y + v * r, z - lu * s + w * c];
  };
  const glow = '#ffa030';
  const tri = (a, b, d) => m.tri('glow', on(...a), on(...b), on(...d), glow);
  for (const e of [-1, 1]) tri([e * 0.18, 0.9], [e * 0.5, 0.9], [e * 0.34, 1.12]);
  tri([-0.07, 0.74], [0.07, 0.74], [0, 0.86]);
  const mouth = [[-0.52, 0.56], [-0.36, 0.48], [-0.26, 0.56], [-0.12, 0.44], [0, 0.52], [0.12, 0.44], [0.26, 0.56], [0.36, 0.48], [0.52, 0.56]];
  for (let i = 0; i < mouth.length - 1; i++) {
    const [a, b] = [mouth[i], mouth[i + 1]];
    m.quad('glow', on(a[0], a[1] - 0.12), on(b[0], b[1] - 0.12), on(b[0], b[1]), on(a[0], a[1]), glow);
  }
}

/** A stalk of corn `h` high: a cane, its leaves arching off it, and (ripe) its tassel and an ear or two. */
function stalk(m, x, z, h, { col, leaf, ripe = false, seed = 0, hi = true }) {
  const lean = (hash2(seed, 1, 5) - 0.5) * 0.06;
  m.beam('plain', [x, 0, z], [x + lean, h, z], 0.014, col);
  const leaves = hi ? 4 : 2;
  for (let k = 0; k < leaves; k++) {
    const a = k * 2.4 + seed;
    const y = h * (0.25 + 0.17 * k);
    const len = h * (0.34 - 0.04 * k);
    m.beam('plain', [x + lean * (y / h), y, z], [x + Math.cos(a) * len * 0.7, y + len * 0.35, z + Math.sin(a) * len * 0.7], 0.012, leaf);
    if (hi) m.beam('plain', [x + Math.cos(a) * len * 0.7, y + len * 0.35, z + Math.sin(a) * len * 0.7], [x + Math.cos(a) * len, y + len * 0.1, z + Math.sin(a) * len], 0.01, leaf);
  }
  if (ripe) {
    m.beam('plain', [x + lean, h, z], [x + lean * 1.2, h + 0.06, z], 0.01, '#d8b860');
    if (hi) {
      const a = seed * 1.7;
      m.beam('plain', [x + lean * 0.55, h * 0.55, z], [x + lean * 0.55 + Math.cos(a) * 0.04, h * 0.55 + 0.07, z + Math.sin(a) * 0.04], 0.026, '#c8b46a');
    }
  }
}

/** A shock: the cut stalks stood up together in a cone and tied round the middle. */
function shock(m, x, z, h, seed) {
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + seed;
    m.beam('plain', [x + Math.cos(a) * 0.13, 0, z + Math.sin(a) * 0.13], [x + Math.cos(a) * 0.015, h, z + Math.sin(a) * 0.015], 0.03, k % 2 ? '#b8964e' : '#a2823e');
  }
  m.cylinder('plain', x, 0, z, 0.02, 0.12, h * 0.98, 7, '#9a7a3a', { caps: false });
  m.cylinder('plain', x, h * 0.55, z, 0.064, 0.07, 0.025, 8, '#5a3a20');
}

/** A scarecrow with a carved pumpkin for a head, in a coat gone to rags. */
export function scarecrow(m, x, z, yaw = 0) {
  m.at(x, 0, z, () => {
    m.beam('wood', [0, 0, 0], [0, 0.42, 0], 0.025, '#5a4228');
    m.beam('wood', [-0.16, 0.32, 0], [0.16, 0.32, 0], 0.022, '#5a4228');
    m.box('cloth', -0.08, 0.17, -0.04, 0.08, 0.34, 0.04, '#3a3448', { skip: ['bottom'] });
    for (const sx of [-1, 1]) m.beam('cloth', [sx * 0.07, 0.32, 0], [sx * 0.17, 0.3, 0], 0.05, '#3a3448');
    for (const sx of [-1, 1]) m.beam('plain', [sx * 0.17, 0.3, 0], [sx * 0.2, 0.26, 0.01], 0.02, '#c8a84a');
    pumpkin(m, 0, 0.35, 0, 0.055, { lantern: true, detail: 0, col: ORANGE[2] });
    m.cone('cloth', 0, 0.44, 0, 0.09, 0.47, 7, '#2a2430');
    m.cone('cloth', 0, 0.47, 0, 0.035, 0.58, 6, '#2a2430');
  }, yaw);
}

/**
 * The corn on a tile, a stage of the year at a time: 1 shoots, 2 green and growing, 3 ripe and gold and higher
 * than a man, 4 cut and stood in shocks. `hi` for the near set.
 */
export function cornTile(m, stage, variant, hi) {
  const per = hi ? 3 : 2;
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const seed = variant * 17 + j * per + i;
      const x = -0.5 + (i + 0.5) / per + (hash2(seed, 2, 3) - 0.5) * 0.12;
      const z = -0.5 + (j + 0.5) / per + (hash2(seed, 4, 3) - 0.5) * 0.08;
      if (stage === 1) m.cone('plain', x, 0, z, 0.03, 0.09 + 0.04 * hash2(seed, 5, 1), 4, '#6a9a3a');
      else if (stage === 2) stalk(m, x, z, 0.32 + 0.08 * hash2(seed, 6, 2), { col: '#4e7a2e', leaf: '#5e8a34', seed, hi });
      else if (stage === 3) stalk(m, x, z, 0.5 + 0.08 * hash2(seed, 6, 2), { col: '#a8904a', leaf: '#b89a52', ripe: true, seed, hi });
    }
  }
  if (stage === 4) {
    shock(m, (hash2(variant, 1, 9) - 0.5) * 0.3, (hash2(variant, 2, 9) - 0.5) * 0.3, 0.42, variant);
    if (hi) for (let k = 0; k < 8; k++) m.cone('plain', -0.4 + 0.8 * hash2(variant, k, 11), 0, -0.4 + 0.8 * hash2(k, variant, 13), 0.012, 0.05, 3, '#8a7240');
  }
}

/** The pumpkins on a tile: 1 leaves, 2 vines with green fruit, 3 fat and orange, 4 what the harvest left. */
export function patchTile(m, stage, variant, hi) {
  const leaf = (x, z, s) => m.sphere('plain', x, 0.012, z, 0.07 * s, 0.025 * s, 0.07 * s, '#4a7a2c', { detail: 0, jitter: 0.2, seed: variant });
  const leaves = stage === 1 ? 4 : hi ? 7 : 4;
  for (let k = 0; k < leaves; k++) leaf(-0.4 + 0.8 * hash2(variant, k, 3), -0.4 + 0.8 * hash2(k, variant, 5), stage === 1 ? 0.6 : 1 + 0.3 * hash2(k, 1, variant));
  if (stage >= 2 && hi) {
    for (let k = 0; k < 3; k++) {
      const z = -0.33 + k * 0.33;
      m.beam('plain', [-0.48, 0.008, z], [0.48, 0.008, z + (hash2(k, variant, 7) - 0.5) * 0.2], 0.01, VINE);
    }
  }
  if (stage < 2) return;
  const fruit = stage === 4 ? 1 : hi ? 3 : 2;
  for (let k = 0; k < fruit; k++) {
    const x = -0.34 + 0.68 * hash2(variant, k, 21), z = -0.34 + 0.68 * hash2(k, variant, 23);
    const big = stage === 2 ? 0.55 : 0.85 + 0.35 * hash2(k, variant, 25);
    const col = stage === 2 ? '#8a9a3a' : stage === 4 && k === 0 ? '#8a5a2a' : ORANGE[(variant + k) % ORANGE.length];
    pumpkin(m, x, 0, z, 0.05 * big, { col, detail: hi ? 1 : 0, lobes: hi ? 6 : 4, yaw: hash2(k, 3, variant) * 6.28, seed: variant + k });
  }
}

/** A carved lantern for a doorstep: one pumpkin, or a big one with a little one beside it. */
export function doorLantern(variant, hi) {
  const m = new Mesher();
  pumpkin(m, 0, 0, 0, 0.05, { lantern: true, detail: hi ? 1 : 0, col: ORANGE[variant % ORANGE.length], seed: variant });
  if (variant % 2) pumpkin(m, 0.09, 0, 0.02, 0.032, { lantern: variant % 4 === 1, detail: 0, col: ORANGE[(variant + 1) % ORANGE.length], yaw: 0.4, seed: variant + 3 });
  return m.finish();
}

/** A dead tree: a twisted trunk and bare black limbs clawing up, about as tall as an oak. */
export function deadTree(m, v, hi) {
  const col = ['#3a3430', '#34302c', '#42392f'][v % 3];
  const r = (k) => hash2(v * 11 + k, k * 3, 41);
  m.cylinder('bark', 0, -0.05, 0, 0.07, 0.11, 0.42, hi ? 7 : 5, col, { smooth: hi });
  const top = [(r(1) - 0.5) * 0.12, 0.72, (r(2) - 0.5) * 0.12];
  m.beam('bark', [0, 0.36, 0], top, 0.07, col);
  const limbs = hi ? 6 : 3;
  for (let b = 0; b < limbs; b++) {
    const a = b * 2.1 + r(b) * 1.2;
    const from = b < 2 ? [0, 0.42 + 0.1 * b, 0] : top;
    const mid = [from[0] + Math.cos(a) * 0.24, from[1] + 0.2 + r(b + 4) * 0.16, from[2] + Math.sin(a) * 0.24];
    m.beam('bark', from, mid, 0.04 - b * 0.003, col);
    const tip = [mid[0] + Math.cos(a + 0.7) * 0.16, mid[1] + 0.12 + r(b + 9) * 0.1, mid[2] + Math.sin(a + 0.7) * 0.16];
    m.beam('bark', mid, tip, 0.022, col);
    if (hi) m.beam('bark', mid, [mid[0] + Math.cos(a - 0.9) * 0.12, mid[1] + 0.18, mid[2] + Math.sin(a - 0.9) * 0.12], 0.016, col);
  }
}

/** A headstone, about knee to hip high on a man: round-topped, a cross, or a slab gone over. */
function headstone(m, x, z, kind, yaw, col) {
  m.at(x, 0, z, () => {
    if (kind === 0) {
      m.box('stone', -0.05, -0.05, -0.014, 0.05, 0.13, 0.014, col);
      m.cylinder('stone', 0, 0.13, 0, 0.05, 0.05, 0.028, 8, col);
    } else if (kind === 1) {
      m.box('stone', -0.014, -0.05, -0.014, 0.014, 0.2, 0.014, col);
      m.box('stone', -0.06, 0.12, -0.013, 0.06, 0.145, 0.013, col);
    } else {
      m.push().rotateZ(0.22);
      m.box('stone', -0.06, -0.05, -0.016, 0.06, 0.14, 0.016, col);
      m.pop();
    }
    // The mound in front of it.
    m.box('plain', -0.06, -0.04, 0.03, 0.06, 0.015, 0.24, '#3a3022', { skip: ['bottom'] });
  }, yaw);
}

/** A graveyard: headstones in rows, an iron railing with a lychgate in it, a crypt at the back, and a dead yew. */
export function graveyard(m, v) {
  const { rnd } = v;
  const stone = ['#6a6670', '#5e5a62', '#76727a', '#58545a'];
  m.box('plain', -1.45, -0.3, -1.45, 1.45, 0.02, 1.45, '#2e3424', { skip: ['bottom'] });
  // The railing, all round but the gate in the front.
  const rail = '#1a181c';
  const side = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(2, Math.round(len / 0.09));
    for (let i = 0; i <= n; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / n, z = a[1] + ((b[1] - a[1]) * i) / n;
      m.box('metal', x - 0.008, 0, z - 0.008, x + 0.008, 0.24, z + 0.008, rail);
      m.cone('metal', x, 0.24, z, 0.014, 0.27, 4, rail);
    }
    for (const y of [0.04, 0.2]) m.beam('metal', [a[0], y, a[1]], [b[0], y, b[1]], 0.014, rail);
  };
  const e = 1.38;
  side([-e, -e], [e, -e]);
  side([-e, -e], [-e, e]);
  side([e, -e], [e, e]);
  side([-e, e], [-0.24, e]);
  side([0.24, e], [e, e]);
  // The lychgate: two posts and a little roof over the way in.
  for (const x of [-0.24, 0.24]) m.box('wood', x - 0.03, 0, e - 0.03, x + 0.03, 0.42, e + 0.03, '#3a2a1c');
  m.gable('slate', -0.32, e - 0.16, 0.32, e + 0.16, 0.42, 0.56, '#2e2a36', { over: 0.04, axis: 'x' });
  // The path up to the crypt.
  m.box('plain', -0.12, 0.02, -0.6, 0.12, 0.028, e, '#5a5248', { skip: ['bottom'] });
  // The crypt: a little house of black stone with a pediment, an iron door, and a lamp that never goes out.
  m.box('stone', -0.4, 0, -1.25, 0.4, 0.5, -0.65, '#4a4650', { skip: ['bottom'] });
  m.gable('stone', -0.46, -1.3, 0.46, -0.6, 0.5, 0.72, '#3e3a44', { over: 0.04, axis: 'x' });
  m.box('metal', -0.11, 0, -0.648, 0.11, 0.32, -0.63, '#24221e');
  m.box('glow', -0.03, 0.36, -0.629, 0.03, 0.42, -0.62, '#7aff8a');
  // The headstones, in rows either side of the path.
  for (let row = 0; row < 3; row++) {
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        if (rnd() < 0.15) continue;
        const x = sx * (0.32 + k * 0.33) + (rnd() - 0.5) * 0.06;
        const z = -0.35 + row * 0.5 + (rnd() - 0.5) * 0.06;
        headstone(m, x, z, Math.floor(rnd() * 3), (rnd() - 0.5) * 0.3, stone[Math.floor(rnd() * stone.length)]);
      }
    }
  }
  // A dead yew in the corner, and a lantern on a new grave.
  m.at(1.05, 0, -1.05, () => deadTree(m, v.variant ?? 0, true));
  pumpkin(m, -0.65, 0.015, 0.95, 0.04, { lantern: true, yaw: 0.3 });
  return { height: 1.1, lights: [{ at: [0, 0.4, -0.6], color: '#7aff8a', reach: 2 }] };
}

/** The village green, as the engine draws it, with lanterns on the pond's curb and a bonfire laid for All Hallows'. */
export function green(m, v) {
  const out = villageGreen(m, v);
  for (let i = 0; i < 5; i++) {
    const a = 0.4 + i * 1.25;
    pumpkin(m, -0.4 + Math.cos(a) * 0.62, 0, 0.3 + Math.sin(a) * 0.62, 0.045, { lantern: true, yaw: -a + Math.PI / 2, col: ORANGE[i % ORANGE.length] });
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    m.beam('wood', [0.75 + Math.cos(a) * 0.16, 0, 0.75 + Math.sin(a) * 0.16], [0.75, 0.34, 0.75], 0.03, PALETTE.wood[k % 3]);
  }
  return out;
}
