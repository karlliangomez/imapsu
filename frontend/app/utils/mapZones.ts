import type { MapProperty } from '~/types/map'

// Building footprint colors on the 3D campus map are derived entirely from the
// property page: a building is green when at least one of its property spaces
// is vacant, red when every space is occupied, and gold when it is not listed
// on the property page yet.
export const MAP_STATUS_COLORS = {
  vacant: '#22c55e',
  occupied: '#ef4444',
  unlisted: '#d4af37'
} as const

export const DEFAULT_ZONE_COLOR = MAP_STATUS_COLORS.unlisted

// Matches building names coming from either the GLB model (dropdown) or an
// existing property record, so property data always lines up with the model.
export const normalizeBuildingName = (value: string | null | undefined): string =>
  (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

export const propertiesInBuilding = (building: string | null | undefined, properties: MapProperty[]): MapProperty[] => {
  if (!building) return []
  return properties.filter((p) => p.building === building)
}

export function buildingStatusColor(buildingName: string, properties: MapProperty[]): string {
  const spaces = propertiesInBuilding(buildingName, properties)
  if (spaces.length === 0) return MAP_STATUS_COLORS.unlisted
  if (spaces.some((p) => p.space_status === 'Vacant')) return MAP_STATUS_COLORS.vacant
  return MAP_STATUS_COLORS.occupied
}

// Normalized building name -> status color, for the 3D viewer to tint each
// building footprint without needing any manually managed map zones.
export function buildingColors(properties: MapProperty[]): Record<string, string> {
  const map: Record<string, string> = {}
  const buildings = new Set(properties.map((p) => p.building).filter((b): b is string => Boolean(b)))
  for (const building of buildings) map[normalizeBuildingName(building)] = buildingStatusColor(building, properties)
  return map
}

// Normalized building name -> occupancy status, so the map can show a text/icon
// indicator that is independent of color (for accessibility and color-blind
// users). Only buildings with listed property spaces get a badge.
export function buildingOccupancy(properties: MapProperty[]): Record<string, 'Vacant' | 'Occupied'> {
  const map: Record<string, 'Vacant' | 'Occupied'> = {}
  const buildings = new Set(properties.map((p) => p.building).filter((b): b is string => Boolean(b)))
  for (const building of buildings) {
    const spaces = propertiesInBuilding(building, properties)
    if (spaces.length === 0) continue
    map[normalizeBuildingName(building)] = spaces.some((p) => p.space_status === 'Vacant') ? 'Vacant' : 'Occupied'
  }
  return map
}
