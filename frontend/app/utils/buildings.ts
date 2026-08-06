import buildingNames from '~/data/buildings.json'

// All building names extracted from the campus GLB model. Used for the
// property-space "Building" dropdown and as the authoritative building list
// on the campus map. Regenerate with `node generate-buildings.mjs`.
export const BUILDING_NAMES: string[] = buildingNames
