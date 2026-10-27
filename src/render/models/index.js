import { createBuildings } from 'madness-engine/buildings';
import { BUILDINGS } from '../../catalog.js';
import { graveyard, green } from '../halloween.js';

/**
 * Every building's model, by type, built once per variant and kept. The models
 * are the engine's (`madness-engine/buildings`), but for the graveyard, which
 * is this game's own, and the green, which is the engine's dressed for All
 * Hallows'. The footprints they are drawn for are the catalog's.
 */

/** The footprint a type's model is drawn for: [width along the street, depth] in tiles. */
export const sizeOf = (type) => (type === 'castle' ? [6, 6] : BUILDINGS[type]?.size ?? [1, 1]);

/** The models this game draws for itself, and the footprints they are drawn for. */
export const OWN_MODELS = { graveyard, green };
export const OWN_FOOTPRINTS = Object.freeze({ graveyard: [3, 3] });

const library = createBuildings({ sizeOf, models: OWN_MODELS });

export const { modelFor } = library;
export const clearModels = library.clear;
export { castleScaffold } from 'madness-engine/buildings';
