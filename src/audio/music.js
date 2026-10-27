import { NOTE } from 'madness-engine/audio';
import { room } from 'madness-engine/music/theory';
import { hash2 } from '../rng.js';

/**
 * The score: Moat's, gone strange. The same lute, recorder, low drone and
 * frame drum, made on the spot, in the same lilting six-eight, phrase after
 * phrase without a break (each opens on a bar of the lute alone); but in the
 * dark modes of the year (D aeolian in spring, A harmonic minor in summer, E
 * phrygian in autumn, a slow D phrygian in winter), slower, in a bigger and
 * colder room. The lute's strings are a hair out of tune with each other.
 * The recorder slides up into its notes like something calling across a
 * marsh, and now and then falls through the tritone at the end of a phrase.
 * After dark a music box takes the tune instead, and the drone beats against
 * a second, a little flat. A bell tolls low at the turn of some phrases. The
 * drum comes in when the town is busy; while the dead are on the road it
 * goes to a heartbeat, and the drone darkens.
 */

const MODES = [
  { root: 62, scale: [0, 2, 3, 5, 7, 8, 10], name: 'aeolian' },
  { root: 57, scale: [0, 2, 3, 5, 7, 8, 11], name: 'harmonic minor' },
  { root: 52, scale: [0, 1, 3, 5, 7, 8, 10], name: 'phrygian' },
  { root: 50, scale: [0, 1, 3, 5, 7, 8, 10], name: 'phrygian' },
];

/** Progressions as scale degrees (0 is the tonic chord): four bars each. They lean on the flat sixth and second. */
const PROGRESSIONS = [
  [0, 5, 3, 4], [0, 5, 1, 4], [0, 3, 5, 4], [0, 6, 5, 4], [5, 3, 0, 4], [0, 1, 0, 4],
];

/** The eighth note, in seconds, for each season: slower than Moat's. */
const EIGHTH = [0.3, 0.28, 0.32, 0.38];

/** Which eighths of the bar the arpeggio plucks, as chord tones. */
const ARPS = [[0, 2, 1, 2, 1, 2], [0, 1, 2, 1, 2, 1], [0, 2, 1, 2, 0, 1], [0, 1, 2, 3, 2, 1]];

/** Where the melody falls in the bar, as eighths: sparser than Moat's, with room for the echo. */
const RHYTHMS = [[0, 3], [0, 2, 3], [0, 3, 5], [0, 4], [0, 2, 4], [3]];

export function createMusic(audio, { getState }) {
  let started = false;
  let timer = 0;
  let ctx, bus, wet, drone, shadow;
  let next = 0, phrase = null, seed = 1, melodyAt = 4;
  let last = null;
  let cue = null;

  const degree = (mode, d, octave = 0) => mode.root + mode.scale[((d % 7) + 7) % 7] + 12 * (octave + Math.floor(d / 7));

  /** The lute: two strings to a course, the second a few cents sharp, so every note shimmers a little wrong. */
  const pluck = (at, midi, gain = 0.2, len = 1.1) => {
    const f = NOTE(midi);
    audio.tone({ at, freq: f, length: len, type: 'triangle', gain, attack: 0.004, out: bus });
    audio.tone({ at, freq: f * 1.006, length: len * 0.8, type: 'triangle', gain: gain * 0.45, attack: 0.004, out: bus });
    audio.tone({ at, freq: f * 2.002, length: len * 0.4, type: 'sine', gain: gain * 0.3, attack: 0.002, out: bus });
    audio.burst({ at, length: 0.03, type: 'bandpass', freq: f * 3, gain: gain * 0.22, q: 2, out: bus });
  };
  /** The recorder, breathy and wavering, sliding up into each note from a little below. */
  const flute = (at, midi, len, gain = 0.09) => {
    const f = NOTE(midi);
    audio.tone({ at, freq: f * 0.94, to: f, length: Math.min(0.18, len * 0.4), type: 'sine', gain: gain * 0.7, attack: 0.06, out: bus });
    audio.tone({ at: at + 0.12, freq: f, length: len, type: 'sine', gain, attack: 0.1, vibrato: 4, out: bus });
    audio.tone({ at: at + 0.12, freq: f * 2, length: len * 0.7, type: 'sine', gain: gain * 0.16, attack: 0.14, vibrato: 4.5, out: bus });
    audio.burst({ at, length: len * 0.7, type: 'bandpass', freq: f * 2.5, gain: gain * 0.12, q: 3, out: bus });
  };
  /** A music box: a high tine and its bright partial, quick to fade. */
  const tine = (at, midi, gain = 0.07) => {
    const f = NOTE(midi);
    audio.tone({ at, freq: f, length: 1.6, type: 'sine', gain, attack: 0.002, out: bus });
    audio.tone({ at, freq: f * 4.2, length: 0.35, type: 'sine', gain: gain * 0.35, attack: 0.002, out: bus });
  };
  /** A bell a long way off, tolling once. */
  const toll = (at, midi, gain = 0.09) => {
    const f = NOTE(midi);
    for (const [m, g, l] of [[1, 1, 1], [2.01, 0.45, 0.7], [2.76, 0.3, 0.5], [5.4, 0.12, 0.3]]) audio.tone({ at, freq: f * m, length: 4.5 * l, type: 'sine', gain: gain * g, attack: 0.004, out: bus });
  };
  const drum = (at, soft = 1) => {
    audio.tone({ at, freq: 120, to: 52, length: 0.26, type: 'sine', gain: 0.32 * soft, out: bus });
    audio.burst({ at, length: 0.12, type: 'lowpass', freq: 340, gain: 0.28 * soft, out: bus });
  };
  const tap = (at, soft = 1) => audio.burst({ at, length: 0.05, type: 'bandpass', freq: 1500, q: 1.5, gain: 0.08 * soft, out: bus });

  const newPhrase = (state) => {
    seed++;
    const season = state.season;
    const mode = MODES[season];
    const prog = PROGRESSIONS[Math.floor(hash2(seed, season, 3) * PROGRESSIONS.length)];
    phrase = {
      mode, prog, arp: ARPS[Math.floor(hash2(seed, 5, 1) * ARPS.length)], bar: 0, e: EIGHTH[season] * (state.threat ? 1.08 : 1),
      lead: state.night ? (hash2(seed, 9, 2) < 0.6 ? 'box' : 'flute') : hash2(seed, 9, 2) < 0.55 ? 'flute' : 'lute',
      drum: state.busy || state.threat, heart: state.threat,
      bell: hash2(seed, 11, 4) < 0.4,
    };
    melodyAt = 5 + Math.floor(hash2(seed, 4, 4) * 5);
  };

  const scheduleBar = (t0, state) => {
    if (!phrase) newPhrase(state);
    const { mode, prog, arp, e } = phrase;
    const chord = prog[phrase.bar % prog.length];
    const rel = (x) => Math.max(0, x - ctx.currentTime);
    const tones = [degree(mode, chord, 0), degree(mode, chord + 2, 0), degree(mode, chord + 4, 0), degree(mode, chord, 1)];
    for (let k = 0; k < 6; k++) {
      const tone = tones[arp[k]];
      pluck(rel(t0 + k * e), tone + 12, k === 0 ? 0.22 : 0.13 + 0.03 * ((k + 1) % 2), 1.2);
    }
    pluck(rel(t0), degree(mode, chord, -1) + 12, 0.2, 2.4);
    if (phrase.bar === 0 && phrase.bell) toll(rel(t0), mode.root - 12);
    // The melody.
    if (phrase.bar >= 1 && phrase.bar < 8) {
      const rhythm = RHYTHMS[Math.floor(hash2(seed, phrase.bar, 6) * RHYTHMS.length)];
      for (let n = 0; n < rhythm.length; n++) {
        const slot = rhythm[n];
        const len = ((rhythm[n + 1] ?? 6) - slot) * e;
        melodyAt = Math.max(2, Math.min(11, melodyAt + Math.floor(hash2(seed, phrase.bar * 7 + n, 8) * 5) - 2));
        const midi = degree(mode, melodyAt, 1);
        const at = rel(t0 + slot * e);
        if (phrase.lead === 'box') { tine(at, midi + 12); tine(at + e * 1.5, midi + 12, 0.025); }
        else if (phrase.lead === 'flute') flute(at, midi, len * 1.15);
        else pluck(at, midi + 12, 0.2, Math.max(0.6, len * 1.6));
      }
      // At the end of a phrase the line sometimes falls through the tritone, and leaves it hanging.
      if (phrase.bar === 7 && hash2(seed, 13, 5) < 0.45) {
        const at = rel(t0 + 5 * e), sigh = degree(mode, 0, 1) + 6;
        if (phrase.lead === 'box') tine(at, sigh + 12, 0.05);
        else flute(at, sigh, e * 2, 0.06);
      }
    }
    if (phrase.heart) {
      // A heartbeat: lub-dub, and a long wait.
      drum(rel(t0), 0.9); drum(rel(t0 + 0.55 * e), 0.55);
      drum(rel(t0 + 3 * e), 0.8); drum(rel(t0 + 3.55 * e), 0.5);
    } else if (phrase.drum) {
      drum(rel(t0), 0.85);
      tap(rel(t0 + 2 * e), 0.7); drum(rel(t0 + 3 * e), 0.6); tap(rel(t0 + 5 * e), 0.5);
    }
    phrase.bar++;
    return 6 * e;
  };

  const tick = () => {
    if (!ctx) return;
    const state = getState();
    cue = state.silent ? null : state.threat ? 'dread' : state.night ? 'night' : 'day';
    if (last !== state.season && drone) {
      last = state.season;
      const f = NOTE(MODES[state.season].root - 24);
      drone.set({ freq: f });
      shadow?.set({ freq: f * 0.993 });
    }
    if (state.silent) return;
    // Far enough ahead that a timer the browser slows down (a tab in the background, a frame that takes long) does not leave a gap.
    while (next < ctx.currentTime + 4) {
      // Fallen behind (the page was put away): pick up on the next beat rather than crowd the missed bars in at once.
      if (next < ctx.currentTime) next = ctx.currentTime + 0.05;
      next += scheduleBar(next, state);
      if (phrase.bar >= 8) phrase = null;
    }
    if (drone) {
      drone.set({ gain: state.threat ? 0.05 : 0.03, filter: state.threat ? 160 : 220 });
      shadow?.set({ gain: state.night || state.threat ? 0.022 : 0.008 });
    }
  };

  return {
    start() {
      if (started || !audio.ctx) return;
      started = true;
      ctx = audio.ctx;
      bus = ctx.createGain();
      bus.gain.value = 1;
      wet = ctx.createGain();
      wet.gain.value = 0.42;
      const verb = ctx.createConvolver();
      verb.buffer = room(ctx, 3.4, 2.4);
      bus.connect(audio.music);
      bus.connect(verb).connect(wet).connect(audio.music);
      const f = NOTE(MODES[1].root - 24);
      drone = audio.loop({ source: 'sawtooth', freq: f, filters: [{ type: 'lowpass', freq: 220, q: 0.6 }], out: audio.music });
      drone?.set({ gain: 0.03 });
      // A second drone, a little flat of the first, so the two beat slowly against each other.
      shadow = audio.loop({ source: 'sawtooth', freq: f * 0.993, filters: [{ type: 'lowpass', freq: 200, q: 0.6 }], out: audio.music });
      shadow?.set({ gain: 0.008 });
      next = ctx.currentTime + 1.5;
      timer = setInterval(tick, 250);
    },
    stop() { clearInterval(timer); started = false; drone?.stop(); shadow?.stop(); },
    /** Schedules what is due; the interval does it too, but a frame never misses, so the music never runs dry while the game is drawing. */
    update() { if (started) tick(); },
    get started() { return started; },
    /** What the score is playing for: 'day', 'night', 'dread' or null. */
    get cue() { return cue; },
  };
}
