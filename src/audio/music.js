import { THEMES as GOTH, createBand as createGothBand } from 'madness-engine/music/band';
import { THEMES as PICTURES, createBand as createPictureBand } from 'madness-engine/music/band.rocknroller-ii';

/**
 * The score: the engine's band, playing the goth.
 *
 * Most of the time it is Whitby, 1988 (`abbey`, the goth level's theme): a
 * clean guitar going round, strings and an organ under it, the tom-heavy
 * goth beat, and a theremin keening over the top. When the dead are on the
 * road it gives way to the horror picture's own theme (`horror`, as
 * Gravemoor plays it): an organ holding its chords, a pedal bass, a creeping
 * heartbeat of a kick and the theremin again, slower, until they have been
 * dealt with. Nothing plays once the barony has fallen.
 */

const CUES = {
  goth: { theme: GOTH.abbey, tempo: 110, band: 'goth' },
  dread: { theme: PICTURES.horror, tempo: 92, band: 'picture' },
};

export function createMusic(audio, { getState }) {
  let started = false;
  let timer = 0;
  let bands = null;
  let cue = null;

  /** Plays `name` (a cue), stopping whatever else was playing; nothing for null. */
  const play = (name) => {
    if (name === cue) return;
    cue = name;
    for (const b of Object.values(bands)) b.stop();
    if (!name) return;
    const c = CUES[name];
    try { bands[c.band].start(c.theme, c.tempo); } catch (e) { console.warn('bloodmoat: the band would not play', e); }
  };

  const tick = () => {
    if (!bands) return;
    const state = getState();
    play(state.silent ? null : state.threat ? 'dread' : 'goth');
  };

  return {
    start() {
      if (started || !audio.ctx) return;
      started = true;
      bands = {
        goth: createGothBand(audio.ctx, audio.music, audio.noise),
        picture: createPictureBand(audio.ctx, audio.music, audio.noise),
      };
      tick();
      timer = setInterval(tick, 1000);
    },
    stop() { clearInterval(timer); started = false; play(null); },
    /** Looks at the barony once a frame: the cue changes when the dead come and go, or when it falls. */
    update() { if (started) tick(); },
    get started() { return started; },
    /** Which cue is playing: 'goth', 'dread' or null. */
    get cue() { return cue; },
  };
}
