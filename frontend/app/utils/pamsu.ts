import type { MapProperty } from '~/types/map'
import pamsuBuildings from '~/data/pamsu-buildings.json'

export type PamsuBuilding = { order: number; name: string; shortname: string }

export const PAMSU_BUILDINGS: PamsuBuilding[] = pamsuBuildings

// Property records use the older model-derived building names (buildings.json),
// so a legacy name like "University Food Center" has to be matched back to the
// pamsu entry it belongs to. Words below are too generic to tell buildings
// apart and are dropped before scoring.
const STOPWORDS = new Set([
  'building',
  'buildings',
  'college',
  'university',
  'of',
  'and',
  'the',
  'for',
  'center',
  'centre',
  'laboratory',
  'lab',
  'extension',
  'ext'
])

function buildingTokens(value: string): string[] {
  return (value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= 4 && b.length >= 4) return a.startsWith(b) || b.startsWith(a)
  return false
}

function tokenScore(propertyTokens: string[], candidateTokens: string[]): number {
  if (propertyTokens.length === 0 || candidateTokens.length === 0) return 0
  const union = new Set([...propertyTokens, ...candidateTokens])
  let matched = 0
  for (const token of propertyTokens) {
    if (candidateTokens.some((candidate) => tokensMatch(token, candidate))) matched++
  }
  return matched / union.size
}

const MATCH_THRESHOLD = 0.45

/**
 * Finds the pamsu building that a property-space building name most likely
 * refers to. Compares token overlap against both the full name and the short
 * name of every entry, so legacy spellings still line up with the map model.
 */
export function pamsuBuildingFor(buildingName: string): PamsuBuilding | null {
  const propertyTokens = buildingTokens(buildingName)
  if (propertyTokens.length === 0) return null
  let best: PamsuBuilding | null = null
  let bestScore = 0
  for (const entry of PAMSU_BUILDINGS) {
    for (const candidate of [entry.name, entry.shortname].filter(Boolean)) {
      const score = tokenScore(propertyTokens, buildingTokens(candidate))
      if (score > bestScore) {
        bestScore = score
        best = entry
      }
    }
  }
  return bestScore >= MATCH_THRESHOLD ? best : null
}

export function pamsuBuildingByOrder(order: number): PamsuBuilding | undefined {
  return PAMSU_BUILDINGS.find((entry) => entry.order === order)
}

// pamsu building order -> occupancy status, keyed the way the viewer expects
// (as a string key). Only buildings that have listed property spaces appear.
export function buildingStatusByOrder(properties: MapProperty[]): Record<string, 'Vacant' | 'Occupied'> {
  const grouped = new Map<number, MapProperty[]>()
  const seen = new Set<string>()
  for (const property of properties) {
    if (!property.building || seen.has(property.building)) continue
    seen.add(property.building)
    const entry = pamsuBuildingFor(property.building)
    if (!entry) continue
    const spaces = properties.filter((p) => p.building === property.building)
    grouped.set(entry.order, [...(grouped.get(entry.order) ?? []), ...spaces])
  }
  const result: Record<string, 'Vacant' | 'Occupied'> = {}
  for (const [order, spaces] of grouped) {
    if (spaces.length === 0) continue
    result[String(order)] = spaces.some((p) => p.space_status === 'Vacant') ? 'Vacant' : 'Occupied'
  }
  return result
}

// Property spaces that belong to the given pamsu building, including legacy
// building names that resolve back to the same entry.
export function propertiesInPamsuBuilding(buildingName: string, properties: MapProperty[]): MapProperty[] {
  const target = pamsuBuildingFor(buildingName)
  if (!target) return []
  const matching = new Set(
    properties
      .map((p) => p.building)
      .filter((b): b is string => Boolean(b))
      .filter((b) => pamsuBuildingFor(b)?.order === target.order)
  )
  return properties.filter((p) => matching.has(p.building))
}
