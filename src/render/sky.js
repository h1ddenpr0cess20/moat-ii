import { hash2, mulberry32 } from '../rng.js';

/**
 * The sky: three painted canvases (day, dusk, night) wrapped around the scene,
 * faded one into another as the sun goes around; and the sun and moon that
 * light the land. The day sky is the engine's own backdrop dome; dusk and
 * night are laid over it, see-through, a little inside.
 */

const W = 1024, H = 512;

function paintGradient(ctx, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Clouds: soft heaps of radial gradients, flat on the bottom, in a band above the horizon. */
function clouds(ctx, { seed = 1, count = 46, tint = '255,255,255', alpha = 0.34, band = [0.2, 0.46] } = {}) {
  const rnd = mulberry32(seed);
  for (let k = 0; k < count; k++) {
    const cx = rnd() * W, cy = H * (band[0] + rnd() * (band[1] - band[0]));
    const w = 40 + rnd() * 90, h = 8 + rnd() * 16;
    const puffs = 5 + Math.floor(rnd() * 6);
    for (let p = 0; p < puffs; p++) {
      const px = cx + (rnd() - 0.5) * w * 1.6, py = cy - rnd() * h * 0.6;
      const r = 12 + rnd() * 26;
      for (const ox of [-W, 0, W]) {
        const g = ctx.createRadialGradient(px + ox, py, 0, px + ox, py, r);
        g.addColorStop(0, `rgba(${tint},${alpha})`);
        g.addColorStop(1, `rgba(${tint},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(px + ox - r, py - r, r * 2, r * 2);
      }
    }
  }
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return [c, c.getContext('2d')];
}

/** A day in the barony: a low, bruised sky, slate overhead and a sickly yellow-green haze at the horizon, heavy with cloud. */
export function paintDay() {
  const [c, ctx] = canvas();
  paintGradient(ctx, [[0, '#2e2a40'], [0.22, '#45405a'], [0.38, '#6e6a7c'], [0.47, '#a4a48e'], [0.5, '#b4b096'], [0.53, '#7c7a68'], [0.7, '#4c4a40'], [1, '#2a2824']]);
  clouds(ctx, { seed: 5, count: 70, tint: '120,112,140', alpha: 0.42 });
  clouds(ctx, { seed: 9, count: 40, tint: '70,64,88', alpha: 0.38, band: [0.06, 0.3] });
  return c;
}

/** Sunset: the sky bleeds. A band of blood red at the horizon going up through rust and violet to black. */
export function paintDusk() {
  const [c, ctx] = canvas();
  paintGradient(ctx, [[0, '#0c0618'], [0.2, '#24102e'], [0.36, '#5a1630'], [0.45, '#b02a1e'], [0.49, '#ff6a1a'], [0.52, '#6a2418'], [0.7, '#2a1416'], [1, '#120a0c']]);
  clouds(ctx, { seed: 13, count: 46, tint: '40,10,20', alpha: 0.5, band: [0.28, 0.47] });
  clouds(ctx, { seed: 17, count: 20, tint: '255,90,40', alpha: 0.18, band: [0.38, 0.47] });
  return c;
}

/** A full moon, the color of a pumpkin when it rises, with its seas, its glow and a cloud across its face. */
function moon(ctx, x, y, r) {
  const halo = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 5);
  halo.addColorStop(0, 'rgba(255,170,90,0.35)');
  halo.addColorStop(1, 'rgba(255,120,60,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
  const face = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  face.addColorStop(0, '#ffe8b0');
  face.addColorStop(0.7, '#ffbe6a');
  face.addColorStop(1, '#e8863a');
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(160,80,40,0.35)';
  for (const [dx, dy, s] of [[-0.3, -0.2, 0.28], [0.25, 0.1, 0.22], [-0.05, 0.38, 0.18], [0.35, -0.35, 0.12]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, s * r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(10,6,16,0.75)';
  ctx.fillRect(x - r * 1.6, y + r * 0.25, r * 3.2, r * 0.14);
  ctx.fillRect(x - r * 1.1, y + r * 0.46, r * 2.0, r * 0.1);
}

/** A bat against the sky: two scalloped wings and a body. */
function bat(ctx, x, y, s) {
  ctx.fillStyle = '#05030a';
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (const m of [-1, 1]) {
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + m * s * 0.5, y - s * 0.5, x + m * s, y - s * 0.2);
    ctx.quadraticCurveTo(x + m * s * 0.8, y + s * 0.05, x + m * s * 0.65, y + s * 0.1);
    ctx.quadraticCurveTo(x + m * s * 0.5, y - s * 0.05, x + m * s * 0.35, y + s * 0.15);
    ctx.quadraticCurveTo(x + m * s * 0.2, y + s * 0.0, x, y + s * 0.2);
  }
  ctx.fill();
}

/** Night: a deep violet going to black, stars, the harvest moon low in the south, and bats across it. */
export function paintNight() {
  const [c, ctx] = canvas();
  paintGradient(ctx, [[0, '#04020a'], [0.3, '#0c0618'], [0.45, '#1e0e30'], [0.5, '#2e1636'], [0.52, '#0e0812'], [0.7, '#06040a'], [1, '#030206']]);
  moon(ctx, W * 0.75, H * 0.33, 26);
  bat(ctx, W * 0.75 - 14, H * 0.33 - 6, 7);
  bat(ctx, W * 0.75 + 30, H * 0.33 - 30, 5);
  bat(ctx, W * 0.75 + 52, H * 0.33 - 12, 4);
  for (let k = 0; k < 700; k++) {
    const x = hash2(k, 1, 7) * W, y = hash2(k, 2, 7) * H * 0.48;
    const a = 0.25 + hash2(k, 3, 7) * 0.7;
    const r = hash2(k, 4, 7) < 0.06 ? 1.7 : 0.9;
    ctx.fillStyle = `rgba(255,${230 + Math.floor(hash2(k, 5, 7) * 25)},${210 + Math.floor(hash2(k, 6, 7) * 45)},${a})`;
    ctx.fillRect(x, y, r, r);
  }
  const g = ctx.createLinearGradient(0, H * 0.1, W, H * 0.4);
  g.addColorStop(0, 'rgba(140,160,230,0)');
  g.addColorStop(0.5, 'rgba(140,160,230,0.10)');
  g.addColorStop(1, 'rgba(140,160,230,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * 0.5);
  return c;
}

/** What shiny things reflect, painted from the day sky and brought down to a studio-sized canvas. */
export function paintReflections(sky) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  c.getContext('2d').drawImage(sky, 0, 0, 512, 256);
  return c;
}

/** The sun's place and the light it makes: from the time of day (0 midnight, 0.5 noon) and the season's height. */
export function sunAt(t, maxElevation) {
  const angle = (t - 0.25) * Math.PI * 2;
  const e = Math.sin(angle);
  // Rises in the east, climbs to the south and sets in the west.
  const dir = [Math.cos(angle) * -0.9 - 0.15, e * maxElevation + 0.02, 0.62 * Math.max(0.2, 0.4 + Math.abs(e))];
  const l = Math.hypot(...dir);
  return { dir: dir.map((v) => v / l), elevation: e * maxElevation };
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The light at a moment: the sun's, or the moon's after dark, with the sky's wash. */
export function lightAt(t, maxElevation) {
  const sun = sunAt(t, maxElevation);
  const e = sun.elevation;
  const day = smooth(-0.02, 0.18, e);
  const low = 1 - smooth(0.05, 0.5, e);
  const dusk = smooth(-0.25, 0.0, e) * (1 - smooth(0.0, 0.25, e));
  const night = 1 - smooth(-0.3, 0.02, e);
  // A pale, ill sun, and a moon that lights the land a cold violet.
  const warm = [1, 0.66 + 0.24 * (1 - low), 0.5 + 0.36 * (1 - low)];
  const moon = [0.66, 0.6, 1];
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const key = mix(moon, warm, day);
  // After dark the moon is opposite the sun and a good deal fainter.
  const dir = day > 0.02 ? sun.dir : [-sun.dir[0] * 0.8, Math.max(0.35, -sun.dir[1] + 0.3), 0.5];
  const l = Math.hypot(...dir);
  return {
    sun, dir: dir.map((v) => v / l), key, keyIntensity: 0.42 + 1.95 * day * (0.45 + 0.55 * (1 - low * 0.5)),
    hemiSky: mix([0.16, 0.12, 0.32], mix([0.74, 0.66, 0.7], [0.66, 0.7, 0.82], 1 - low), day), hemiGround: mix([0.05, 0.03, 0.07], [0.26, 0.2, 0.18], day),
    hemiIntensity: 0.48 + 0.45 * day,
    dusk, night, day,
  };
}

/** The domes laid over the backdrop: dusk and night, each fading in or out with `opacity`. */
export function createSkyDomes(GFX, scene) {
  const make = (canvas, order) => {
    const map = new GFX.CanvasTexture(canvas);
    map.colorSpace = GFX.SRGBColorSpace;
    const material = new GFX.MeshBasicMaterial({ map, side: GFX.BackSide, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const dome = new GFX.Mesh(new GFX.SphereGeometry(296, 48, 24), material);
    dome.renderOrder = order;
    dome.frustumCulled = false;
    dome.onBeforeRender = (r, s, cam) => { dome.position.copy(cam.position); dome.updateMatrixWorld(); };
    scene.add(dome);
    return { dome, material };
  };
  const dusk = make(paintDusk(), -0.8);
  const night = make(paintNight(), -0.7);
  return {
    set(duskK, nightK) {
      dusk.material.opacity = duskK;
      dusk.dome.visible = duskK > 0.01;
      night.material.opacity = nightK;
      night.dome.visible = nightK > 0.01;
    },
  };
}
