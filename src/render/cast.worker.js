import { serveBakes } from 'madness-engine/models/bake';
import { SCULPTED } from './cast.js';

/** Bakes the monsters off the main thread (see monsters.js). */
serveBakes(SCULPTED);
