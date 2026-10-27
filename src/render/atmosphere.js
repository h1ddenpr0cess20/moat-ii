import horror from 'madness-engine/moods/horror';
import { hash2, smoothstep } from '../rng.js';
import { WEEKS_PER_YEAR } from '../config.js';
import { colorLeaves } from './materials.js';
import { lightAt } from './sky.js';

/**
 * The look of the hour and the year: where the sun is, how warm its light,
 * the color of the sky and of the leaves, how much snow lies, whether it
 * rains, and the film the picture is shot on. The day goes around on its own
 * clock; the year follows the game's calendar.
 */

/** Seconds a day takes to go around. */
const DAY = 150;

/** How much snow lies on the ground, 0 to 1, by the week of the year. */
export const snowAt = (inYear) => (inYear >= 36 ? Math.min(1, (inYear - 35) / 4) * 0.9 : inYear < 3 ? Math.max(0, 1 - inYear / 3) * 0.9 : 0);

/** Is it raining? Showers in spring and autumn, now and then in summer, in three-week spells. */
export function rainAt(week, seed) {
  const season = Math.floor(((week % WEEKS_PER_YEAR) % 48) / 12);
  const p = [0.24, 0.1, 0.3, 0][season];
  return hash2(Math.floor(week / 3), season, seed) < p;
}

/**
 * The film and the light are the horror picture's (madness-engine/moods/horror), as Gravemoor shoots it
 * (h1ddenpr0cess20/rpg-test-world): a stock that makes everyone look a little dead, under a pale green-grey sky
 * light and a cold blue-white key, a little brighter than the picture's own so a town can be read. That is
 * the day; the night is the same gone dark under the moon, with the windows burning. Autumn warms the grade a
 * touch toward the lanterns; winter drains it to bone.
 */
const FILM = horror.film;
const SEASON_FILM = ['', '', ' saturate(1.2) sepia(0.1)', ' saturate(0.85)'];
const HORROR = {
  sky: horror.light.hemisphere.sky, ground: horror.light.hemisphere.ground, key: horror.light.key.color,
  moonSky: '#4a5868', moonGround: '#120e16', moon: '#b8c0ff', dusk: '#ff7a4a',
};
/** As Gravemoor lights its streets: a little more than the picture's own light. */
const LIGHT = { hemi: 1.55, key: 1.5, nightHemi: 0.7, nightKey: 0.55 };

export function createAtmosphere({ GFX, stage, sunDir, materials, terrain, water, domes, fx, seed }) {
  const { mat } = materials;
  const C = Object.fromEntries(Object.entries(HORROR).map(([k, v]) => [k, new GFX.Color(v)]));
  let clock = 0.38;
  let mode = 'auto';
  let filmKey = '';
  // The stage's own backdrop dome (drawn first, behind everything): its color dims the sky when it clouds over.
  const backdrop = stage.scene.children.find((o) => o.renderOrder === -1 && o.material?.side === GFX.BackSide);
  stage.renderer.domElement.style.transition = 'filter 1.5s linear';
  let overcast = 0;
  let slow = 0, first = true, flicker = 0;
  // Lightning in a storm: a flash that dies away, and the clock to the next one.
  let flash = 0, nextBolt = 6, bolts = 0;
  const state = { night: 0, day: 1, rain: false, snow: 0, season: 1, tod: 0.4, flash: 0, bolts: 0 };

  const atm = {
    state,
    get time() { return clock; },
    setMode(m) { mode = m; },
    get mode() { return mode; },
    setTime(t) { clock = t; },
    /**
     * `week` and `frac` (how far through it) place the year; `lightK` lets the
     * game dim the day (a storm, say). Call it every frame.
     */
    update(dt, { week, frac = 0 }) {
      const inYearF = (week % WEEKS_PER_YEAR) + frac;
      const yearT = inYearF / WEEKS_PER_YEAR;
      const season = Math.floor(inYearF / 12);
      const k = (inYearF % 12) / 12;
      flicker += dt;
      if (mode === 'auto') clock = (clock + dt / DAY) % 1;
      else clock = { day: 0.45, dusk: 0.74, night: 0.0 }[mode] ?? clock;
      const maxElev = 0.7 + 0.3 * Math.cos(Math.PI * 2 * (yearT - 0.4));
      const L = lightAt(clock, maxElev);
      const rain = rainAt(week, seed);
      overcast += ((rain ? 1 : 0) - overcast) * Math.min(1, dt * 0.8);
      const dim = 1 - 0.38 * overcast;
      // A storm throws lightning now and then: a white flash over everything, twice in quick succession as often as not.
      nextBolt -= dt;
      if (overcast > 0.6 && nextBolt <= 0) {
        flash = 1;
        bolts++;
        nextBolt = Math.random() < 0.4 ? 0.18 : 5 + Math.random() * 12;
      }
      flash = Math.max(0, flash - dt * 5);
      sunDir.set(...L.dir);
      // The horror picture's light by day, the moon's by night, and the sky bleeding at dusk.
      const day = L.day;
      stage.key.color.lerpColors(C.moon, C.key, day).lerp(C.dusk, L.dusk * 0.55);
      stage.key.intensity = (LIGHT.nightKey + (LIGHT.key - LIGHT.nightKey) * day) * dim * (season === 3 ? 0.92 : 1) + flash * 2.6;
      stage.hemi.color.lerpColors(C.moonSky, C.sky, day);
      stage.hemi.groundColor.lerpColors(C.moonGround, C.ground, day);
      stage.hemi.intensity = (LIGHT.nightHemi + (LIGHT.hemi - LIGHT.nightHemi) * day) * (0.92 + 0.12 * overcast) + flash * 1.4;
      domes.set(L.dusk * 0.95, L.night);
      if (backdrop) {
        const g = 1 - 0.38 * overcast;
        backdrop.material.color.setRGB(g * (0.82 + 0.18 * L.day), g * (0.86 + 0.14 * L.day), g * (0.94 + 0.06 * L.day));
        // By night the day sky is covered by the night dome; keep it from showing through.
        backdrop.material.color.multiplyScalar(0.15 + 0.85 * smoothstep(0.0, 0.5, L.day + L.dusk * 0.3));
      }
      // Windows light up as it gets dark, and early on dull days.
      const glow = Math.max(L.night, 0.55 * overcast * (1 - L.night) * 0.3, L.dusk * 0.8);
      // The windows burn a little brighter than white, and flicker, as Gravemoor's do.
      const wf = 1.0 + 0.1 * Math.sin(flicker * 6.1) + 0.06 * Math.sin(flicker * 17.3);
      const g = Math.min(1, glow * 1.15) * wf;
      mat.glow.color.setRGB(1.5 * g, 1.35 * g, 1.0 * g);
      mat.flame.color.setRGB(1.25 + 0.2 * Math.sin(flicker * 13), 1.05 + 0.15 * Math.sin(flicker * 9), 0.8);
      const snow = week < 4 ? 0 : snowAt(inYearF);
      // The year turns slowly: the leaves, the ground and the roofs need touching up a few times a second, not every frame.
      slow += dt;
      if (slow > 0.25 || first) {
        slow = 0; first = false;
        colorLeaves(materials, GFX, season, k);
        terrain.setSeason(season, k, snow);
        for (const name of ['thatch', 'tile', 'slate']) mat[name].emissive.setRGB(0.12 * snow * L.day, 0.13 * snow * L.day, 0.15 * snow * L.day);
      }
      water.update(dt, { shine: 0.5 + 0.9 * L.day * (1 - 0.5 * overcast) });
      fx.tint(L.night);
      const key = `${season}:${Math.round(L.night * 4)}:${Math.round(overcast * 3)}`;
      if (key !== filmKey) {
        filmKey = key;
        const night = L.night > 0.5 ? ' brightness(1.15)' : ' brightness(1.06)';
        const gray = overcast > 0.5 ? ' saturate(0.85)' : '';
        stage.film.set({ filter: FILM.filter + SEASON_FILM[season] + night + gray, vignette: FILM.vignette, grain: FILM.grain, ui: null });
      }
      Object.assign(state, { night: L.night, day: L.day, rain: rain && season !== 3, snow, season, tod: clock, overcast, flash, bolts });
    },
  };
  return atm;
}
