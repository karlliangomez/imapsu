<script setup lang="ts">
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { MapCorner, MapZone } from '~/types/map'
import pamsuBuildings from '~/data/pamsu-buildings.json'

type PamsuBuilding = { order: number; name: string; shortname: string }

const props = withDefaults(
  defineProps<{
    modelPath?: string
    zones?: MapZone[]
    editable?: boolean
    activeZoneId?: string | null
    showNames?: boolean
    autoBuildings?: boolean
    buildingColors?: Record<string, string>
    buildingStatus?: Record<string, 'Vacant' | 'Occupied'>
    statusByOrder?: Record<string, 'Vacant' | 'Occupied'>
    labels?: Record<string, string>
  }>(),
  {
    modelPath: '/models/campus.glb',
    zones: () => [],
    editable: false,
    activeZoneId: null,
    showNames: false,
    autoBuildings: false,
    buildingColors: () => ({}),
    buildingStatus: () => ({}),
    statusByOrder: () => ({}),
    labels: () => ({})
  }
)

const emit = defineEmits<{
  select: [zone: MapZone]
  'building-selected': [selection: { corners: MapCorner[]; height: number; baseY: number; name: string | null }]
  'building-missed': []
  'model-error': [message: string]
  'buildings-ready': [count: number]
}>()

const container = ref<HTMLDivElement | null>(null)

// Map style matches the reference campus map: muted sage background, white
// buildings, amber name pills and amber selection outlines. Vacancy status is
// carried by a green/maroon building edge plus the label badge. The backdrop
// follows the app color mode so the map is never jarringly bright at night.
const SCENE_BACKGROUND_LIGHT = '#e6ebcf'
const SCENE_BACKGROUND_DARK = '#202723'
const BUILDING_WHITE = '#ffffff'
const HIGHLIGHT_COLOR = '#ffb300'
const STATUS_COLORS: Record<'Vacant' | 'Occupied', string> = { Vacant: '#22c55e', Occupied: '#b84034' }
const DEFAULT_COLOR = '#d4af37'

const colorMode = useColorMode()
const isDark = computed(() =>
  colorMode.value === 'dark' ? true : colorMode.value === 'light' ? false : window.matchMedia('(prefers-color-scheme: dark)').matches
)
const sceneBackground = computed(() => new THREE.Color(isDark.value ? SCENE_BACKGROUND_DARK : SCENE_BACKGROUND_LIGHT))
watch(sceneBackground, (color) => {
  if (scene) scene.background = color
})
// Frustum height of the top-down orthographic camera, in world units.
const VIEW_HEIGHT = 800
// Objects that span more than 40% of the model's XZ extent are treated as
// terrain/ground and never selectable as buildings.
const TERRAIN_RATIO = 0.4
const DRACO_DECODER_PATH = '/draco/gltf/'
// Window/door/glass materials stay dark so the white facade keeps its detail.
const WHITE_BUILDING_EXCLUDE = /window|door|glass|logo/i

const buildingEntries = new Map<number, PamsuBuilding>()
for (const entry of pamsuBuildings) buildingEntries.set(entry.order, entry)

let renderer: THREE.WebGLRenderer | null = null
let labelRenderer: CSS2DRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.OrthographicCamera | null = null
let controls: OrbitControls | null = null
let aspect = 1
let raycaster = new THREE.Raycaster()
let modelGroup: THREE.Group | null = null
let frameId = 0
let resizeObserver: ResizeObserver | null = null
let hasFitted = false
let lastHoverCheck = 0

type FocusAnimation = {
  fromPos: THREE.Vector3
  toPos: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  fromZoom: number
  toZoom: number
  start: number
  duration: number
}
let focusAnim: FocusAnimation | null = null

const zoneMeshes = new Map<string, THREE.Group>()
const labelObjects = new Map<string, CSS2DObject>()
let hoveredZoneId: string | null = null
let pointerDownPos = { x: 0, y: 0 }
let pointerDownTime = 0

type BuildingNode = {
  node: THREE.Object3D
  order: number
  id: string
  name: string
  shortname: string
  corners: MapCorner[]
  height: number
  baseY: number
}
let buildingNodes: BuildingNode[] = []
const statusEdges = new Map<string, THREE.Group>()
const hoverEdges = new Map<string, THREE.Group>()
let hoveredId: string | null = null

const zoneIdOf = (zone: MapZone) => String(zone.documentId ?? zone.id ?? '')

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function ndcFromClient(clientX: number, clientY: number): THREE.Vector2 | null {
  const rect = renderer?.domElement.getBoundingClientRect()
  if (!rect || rect.width === 0 || rect.height === 0) return null
  return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) {
      child.geometry?.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) material.dispose()
    }
  })
}

function buildZoneMesh(zone: MapZone, id?: string, outlineColor: string = HIGHLIGHT_COLOR): THREE.Group | null {
  const pts = Array.isArray(zone.corners) ? zone.corners : []
  if (pts.length < 3) return null

  const shape = new THREE.Shape()
  pts.forEach((point, index) => {
    const x = Number(point.x)
    const z = Number(point.z)
    if (!Number.isFinite(x) || !Number.isFinite(z)) return
    if (index === 0) shape.moveTo(x, -z)
    else shape.lineTo(x, -z)
  })
  shape.closePath()

  const height = Math.max(Number(zone.height) || 4, 0.5)
  const baseY = Number.isFinite(Number(zone.baseY)) ? Number(zone.baseY) : 0

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  geometry.rotateX(-Math.PI / 2)

  const group = new THREE.Group()
  group.position.y = baseY
  group.renderOrder = 10
  group.userData.baseColor = new THREE.Color(BUILDING_WHITE)

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(BUILDING_WHITE),
    roughness: 0.78,
    metalness: 0.05,
    transparent: true,
    opacity: 0.55
  })
  group.add(new THREE.Mesh(geometry, material))

  const edges = new THREE.EdgesGeometry(geometry)
  const statusOutline = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: new THREE.Color(outlineColor), depthWrite: false })
  )
  group.add(statusOutline)

  const highlightOutline = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: new THREE.Color(HIGHLIGHT_COLOR), depthTest: false, depthWrite: false })
  )
  highlightOutline.visible = false
  highlightOutline.renderOrder = 999
  group.add(highlightOutline)
  group.userData.highlightOutline = highlightOutline

  group.userData.zoneId = id ?? zoneIdOf(zone)
  group.userData.zone = zone
  return group
}

/**
 * A node is a campus building when its name is a building number (the GLB is
 * authored with numeric node names matching the building directory), a
 * concrete block ("Cube.*"), or an unnamed building.
 */
function isBuildingNodeName(name: string): boolean {
  return /^\d+$/.test(name) || /^cube\./i.test(name) || /^unnamed building/i.test(name)
}

/**
 * Paints every building in the GLB white (matching the white-walled reference
 * campus), while ground/roads/walkways/gates keep their original look.
 */
function whitenBuildings(root: THREE.Object3D) {
  for (const child of root.children) {
    if (!isBuildingNodeName(child.name)) continue
    child.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const material of materials) {
        const meshMaterial = material as THREE.MeshStandardMaterial
        if (!meshMaterial.color) continue
        if (WHITE_BUILDING_EXCLUDE.test(material.name ?? '')) continue
        meshMaterial.color.set(BUILDING_WHITE)
        meshMaterial.map = null
        meshMaterial.roughness = 0.85
        meshMaterial.metalness = 0
      }
    })
  }
}

/**
 * Paints the full building body by vacancy status: maroon when every space in
 * the building is occupied, green when at least one space is vacant. Buildings
 * without a known status stay white. Windows and doors are tinted with a dark
 * shade of the status color so the whole building reads as colored from every
 * angle while openings stay visible.
 */
function paintBuildingsByStatus() {
  for (const b of buildingNodes) {
    const status = props.statusByOrder[String(b.order)]
    const base = status ? new THREE.Color(STATUS_COLORS[status]) : null
    b.node.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const material of materials) {
        const meshMaterial = material as THREE.MeshStandardMaterial
        if (!meshMaterial.color) continue
        if (!base) {
          if (!WHITE_BUILDING_EXCLUDE.test(material.name ?? '')) meshMaterial.color.set(BUILDING_WHITE)
          continue
        }
        if (WHITE_BUILDING_EXCLUDE.test(material.name ?? '')) meshMaterial.color.copy(base).multiplyScalar(0.35)
        else meshMaterial.color.copy(base)
      }
    })
  }
}

function applyShadows(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.receiveShadow = true
    obj.castShadow = isBuildingNodeName(obj.parent?.name ?? '') || isBuildingNodeName(obj.name ?? '')
  })
}

/**
 * Clones every mesh material inside a building so each building owns its
 * materials. The GLB reuses a handful of material instances across buildings,
 * so painting one building would otherwise re-tint every other building that
 * shares the same material (and a status-less building would erase the color
 * of a statused one during the same pass).
 */
function isolateBuildingMaterials() {
  if (!modelGroup) return
  for (const child of modelGroup.children) {
    if (!isBuildingNodeName(child.name)) continue
    child.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((m) => m.clone())
      } else if (obj.material) {
        obj.material = obj.material.clone()
      }
    })
  }
}

function collectBuildings() {
  buildingNodes = []
  if (!modelGroup) return
  for (const child of modelGroup.children) {
    const order = /^\d+$/.test(child.name) ? parseInt(child.name, 10) : NaN
    if (!Number.isFinite(order)) continue
    const entry = buildingEntries.get(order)
    const corners = computeGroundFootprint(child)
    if (!corners || corners.length < 3) continue
    const box = new THREE.Box3().setFromObject(child)
    const size = box.getSize(new THREE.Vector3())
    buildingNodes.push({
      node: child,
      order,
      id: entry ? normalizeName(entry.name) : normalizeName(child.name),
      name: entry?.name ?? displayNameOf(child.name),
      shortname: entry?.shortname ?? entry?.name ?? '',
      corners,
      height: Math.max(size.y, 0.5),
      baseY: box.min.y
    })
  }
}

/**
 * Builds an amber (hover/selection) or status-colored (vacancy) outline around
 * every mesh of a building node, using its actual geometry edges so the
 * highlight traces the real building shape.
 */
function buildNodeEdges(node: THREE.Object3D, color: string, renderOrder: number, noDepth: boolean): THREE.Group | null {
  const group = new THREE.Group()
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    depthTest: !noDepth,
    depthWrite: false
  })
  node.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return
    const edges = new THREE.EdgesGeometry(obj.geometry, 20)
    const segments = new THREE.LineSegments(edges, material)
    segments.matrix.copy(obj.matrixWorld)
    segments.matrixAutoUpdate = false
    segments.renderOrder = renderOrder
    group.add(segments)
  })
  if (group.children.length === 0) {
    material.dispose()
    return null
  }
  return group
}

function rebuildEdges() {
  if (!scene) return
  paintBuildingsByStatus()
  for (const [, group] of statusEdges) {
    scene.remove(group)
    disposeObject(group)
  }
  for (const [, group] of hoverEdges) {
    scene.remove(group)
    disposeObject(group)
  }
  statusEdges.clear()
  hoverEdges.clear()

  for (const b of buildingNodes) {
    const orderKey = String(b.order)
    const status = props.statusByOrder[orderKey]
    if (status) {
      const group = buildNodeEdges(b.node, STATUS_COLORS[status], 990, false)
      if (group) {
        statusEdges.set(orderKey, group)
        scene.add(group)
      }
    }
    const hover = buildNodeEdges(b.node, HIGHLIGHT_COLOR, 999, true)
    if (hover) {
      hover.visible = false
      hoverEdges.set(orderKey, hover)
      scene.add(hover)
    }
  }
  applyHighlight()
}

function rebuildZones() {
  if (!scene) return

  if (props.autoBuildings) {
    rebuildEdges()
    rebuildLabels()
    return
  }

  for (const [, group] of zoneMeshes) {
    scene.remove(group)
    disposeObject(group)
  }
  zoneMeshes.clear()

  for (const zone of props.zones) {
    const group = buildZoneMesh(zone)
    if (group) {
      zoneMeshes.set(zoneIdOf(zone), group)
      scene.add(group)
    }
  }

  applyHighlight()
  rebuildLabels()
}

function rebuildLabels() {
  if (!scene) return
  for (const [, obj] of labelObjects) {
    scene.remove(obj)
    obj.element.remove()
  }
  labelObjects.clear()
  if (!props.showNames) return

  const addLabel = (text: string, x: number, y: number, z: number, key: string, status?: 'Vacant' | 'Occupied') => {
    const element = document.createElement('div')
    element.className = 'campus-map-label'
    const nameSpan = document.createElement('span')
    nameSpan.className = 'campus-map-label-name'
    nameSpan.textContent = text
    element.appendChild(nameSpan)
    if (status) {
      const statusSpan = document.createElement('span')
      statusSpan.className = status === 'Vacant' ? 'campus-map-label-status is-vacant' : 'campus-map-label-status is-occupied'
      statusSpan.textContent = status === 'Vacant' ? '\u25CF Vacant' : '\u25CF Occupied'
      element.appendChild(statusSpan)
    }
    const label = new CSS2DObject(element)
    label.position.set(x, y, z)
    labelObjects.set(key, label)
    scene.add(label)
  }

  const items = props.autoBuildings
    ? buildingNodes
        // Skip buildings that have neither a pamsu entry nor a custom map label,
        // so raw numeric node names (e.g. missing pamsu entries) stay unlabeled.
        .filter((b) => buildingEntries.has(b.order) || props.labels[b.id])
        .map((b) => ({
          id: b.id,
          order: b.order,
          name: b.shortname || b.name,
          corners: b.corners,
          height: b.height,
          baseY: b.baseY
        }))
    : props.zones.map((zone) => ({
        id: `zone:${zoneIdOf(zone)}`,
        order: 0,
        name: zone.name,
        corners: Array.isArray(zone.corners) ? zone.corners : [],
        height: Math.max(Number(zone.height) || 4, 0.5),
        baseY: Number.isFinite(Number(zone.baseY)) ? Number(zone.baseY) : 0
      }))

  // Labels are anchored to the top-center of each building footprint so a name
  // always sits directly over the building it refers to. The map key is the
  // unique building order in auto mode (names repeat across the campus) and the
  // zone id otherwise, so every label object is tracked and removable.
  for (const item of items) {
    if (!item.name) continue
    const pts = item.corners.filter((c) => Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.z)))
    if (pts.length < 3) continue
    const cx = pts.reduce((sum, c) => sum + Number(c.x), 0) / pts.length
    const cz = pts.reduce((sum, c) => sum + Number(c.z), 0) / pts.length
    const height = Math.max(item.height, 0.5)
    const text = props.autoBuildings ? props.labels[item.id] ?? item.name : props.labels[normalizeName(item.name)] ?? item.name
    const status = props.autoBuildings ? props.statusByOrder[String(item.order)] : props.buildingStatus[normalizeName(item.name)]
    const key = props.autoBuildings ? `label:${item.order}` : `label:${item.id}`
    addLabel(text, cx, item.baseY + height + 2.5, cz, key, status)
  }
}

function setZoneHighlight(id: string, on: boolean) {
  const edge = hoverEdges.get(id)
  if (edge) edge.visible = on
  const group = zoneMeshes.get(id)
  const outline = group?.userData.highlightOutline as THREE.LineSegments | undefined
  if (outline) outline.visible = on
}

function applyHighlight() {
  const active = props.activeZoneId
  const targets = new Set<string>()
  if (active) {
    if (props.autoBuildings) {
      // Active id is the normalized building name, which can be shared by
      // several buildings (duplicate names across the campus), so highlight
      // every building that carries it.
      for (const b of buildingNodes) if (b.id === active) targets.add(String(b.order))
    } else {
      targets.add(active)
    }
  }
  for (const id of hoverEdges.keys()) setZoneHighlight(id, targets.has(id))
  for (const id of zoneMeshes.keys()) setZoneHighlight(id, targets.has(id))
}

function pickZone(clientX: number, clientY: number): MapZone | null {
  const ndc = ndcFromClient(clientX, clientY)
  if (!ndc || !camera || zoneMeshes.size === 0) return null
  raycaster.setFromCamera(ndc, camera)
  const targets = [...zoneMeshes.values()]
  const hit = raycaster.intersectObjects(targets, true).find((h) => {
    let obj: THREE.Object3D | null = h.object
    while (obj) {
      if (obj.userData.zoneId) return true
      obj = obj.parent
    }
    return false
  })
  if (!hit) return null
  let obj: THREE.Object3D | null = hit.object
  while (obj && !obj.userData.zoneId) obj = obj.parent
  return obj ? (obj.userData.zone as MapZone) : null
}

const GENERIC_NAMES = /^(cube|mesh|plane|box|cylinder|sphere|icosphere|circle|group|empty|node)(\.\d+)?$/i

// A top-level node can be labelled when it has a name that isn't empty or a
// generic mesh placeholder. Numeric IDs are kept (some model builders use raw
// IDs for unlabeled buildings) so OAS can name them on the map.
function isLabelableName(name: string | null | undefined): name is string {
  if (typeof name !== 'string') return false
  const trimmed = name.trim()
  if (trimmed.length === 0) return false
  return !GENERIC_NAMES.test(trimmed)
}

function displayNameOf(name: string | null | undefined): string {
  if (typeof name !== 'string') return ''
  const trimmed = name.trim()
  if (/^\d+$/.test(trimmed)) return trimmed
  return trimmed.replace(/_/g, ' ').replace(/\s+/g, ' ')
}

function convexHull(points: { x: number; z: number }[]): { x: number; z: number }[] {
  const pts = [...points].sort((a, b) => (a.x !== b.x ? a.x - b.x : a.z - b.z))
  const cross = (o: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)

  const lower: { x: number; z: number }[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: { x: number; z: number }[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function simplifyFootprint(points: { x: number; z: number }[], minEdge = 0.5): MapCorner[] {
  if (points.length <= 4) return points.map((p) => ({ x: p.x, z: p.z }))

  const pts = points.map((p) => ({ x: p.x, z: p.z }))
  let changed = true
  while (changed) {
    changed = false
    for (let i = pts.length - 1; i >= 0; i--) {
      const a = pts[(i + pts.length - 1) % pts.length]
      const b = pts[i]
      const c = pts[(i + 1) % pts.length]
      const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
      const edge = Math.hypot(b.x - a.x, b.z - a.z)
      if (edge < minEdge || Math.abs(cross) < 1e-6) {
        pts.splice(i, 1)
        changed = true
        break
      }
    }
    if (pts.length <= 4) break
  }
  return pts
}

/**
 * Projects every vertex of a building mesh (and its children) onto the ground
 * plane and returns the convex hull of that footprint. This matches rotated
 * buildings exactly, unlike an axis-aligned bounding box.
 */
function computeGroundFootprint(node: THREE.Object3D): MapCorner[] | null {
  const meshes: THREE.Mesh[] = []
  if (node instanceof THREE.Mesh) meshes.push(node)
  node.traverse((child) => {
    if (child instanceof THREE.Mesh && child !== node) meshes.push(child)
  })

  const vertices: { x: number; z: number }[] = []
  const seen = new Set<string>()
  const tmp = new THREE.Vector3()

  for (const mesh of meshes) {
    const position = mesh.geometry?.getAttribute('position')
    if (!position) continue
    mesh.updateWorldMatrix(true, true)
    const matrix = mesh.matrixWorld
    for (let i = 0; i < position.count; i++) {
      tmp.fromBufferAttribute(position as THREE.BufferAttribute, i).applyMatrix4(matrix)
      const x = Math.round(tmp.x * 50) / 50
      const z = Math.round(tmp.z * 50) / 50
      const key = `${x},${z}`
      if (seen.has(key)) continue
      seen.add(key)
      vertices.push({ x, z })
    }
  }

  if (vertices.length < 3) return null
  return simplifyFootprint(convexHull(vertices))
}

// The model is static per session, so footprints are computed once per node.
const footprintCache = new WeakMap<THREE.Object3D, { corners: MapCorner[]; height: number; baseY: number; name: string | null } | null>()

/**
 * Finds the top-level building under the model root that the click hit.
 * Returns its ground footprint (convex hull projected on the ground) plus its
 * height and base Y, or null when the click missed every selectable building.
 */
function pickModelBuilding(clientX: number, clientY: number): { corners: MapCorner[]; height: number; baseY: number; name: string | null } | null {
  const ndc = ndcFromClient(clientX, clientY)
  if (!ndc || !camera || !modelGroup) return null

  raycaster.setFromCamera(ndc, camera)
  const hits = raycaster.intersectObject(modelGroup, true)
  const meshHit = hits.find((h) => (h.object as THREE.Mesh).isMesh)
  if (!meshHit) return null

  let node: THREE.Object3D = meshHit.object
  while (node.parent && node.parent !== modelGroup) node = node.parent

  const modelBox = new THREE.Box3().setFromObject(modelGroup)
  const modelSize = modelBox.getSize(new THREE.Vector3())
  const modelXZ = Math.max(modelSize.x, modelSize.z, 1)

  const box = new THREE.Box3().setFromObject(node)
  const size = box.getSize(new THREE.Vector3())
  if (Math.max(size.x, size.z) > modelXZ * TERRAIN_RATIO) return null

  let cached = footprintCache.get(node)
  if (cached === undefined) {
    const corners = computeGroundFootprint(node)
    cached = corners
      ? { corners, height: Math.max(size.y, 0.5), baseY: box.min.y, name: isLabelableName(node.name) ? displayNameOf(node.name) : null }
      : null
    footprintCache.set(node, cached)
  }
  if (!cached) return null

  return cached
}

function fitCamera() {
  if (!camera || !controls || !scene) return
  const box = new THREE.Box3()
  if (modelGroup) box.expandByObject(modelGroup)
  for (const [, group] of zoneMeshes) box.expandByObject(group)
  if (box.isEmpty()) return

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const fitWorld = Math.max(size.x / Math.max(aspect, 0.001), size.z) * 1.35

  camera.position.set(center.x, 900, center.z)
  controls.target.copy(center)
  camera.zoom = Math.max(VIEW_HEIGHT / Math.max(fitWorld, 1), 0.01)
  camera.updateProjectionMatrix()
  controls.update()
  hasFitted = true
}

function resetCamera() {
  focusAnim = null
  hasFitted = false
  fitCamera()
}

/**
 * Smoothly flies the camera to a zone's footprint and frames the whole
 * building (including its height) from a 3/4 angle, so the facade is visible
 * instead of a straight top-down view.
 */
function focusOn(zone: MapZone) {
  if (!camera || !controls) return
  const pts = Array.isArray(zone.corners) ? zone.corners : []
  const xs = pts.map((p) => Number(p.x)).filter(Number.isFinite)
  const zs = pts.map((p) => Number(p.z)).filter(Number.isFinite)
  if (xs.length === 0 || zs.length === 0) return

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const height = Math.max(Number(zone.height) || 4, 1)
  const baseY = Number(zone.baseY) || 0
  const cy = baseY + height / 2

  const extent = Math.max(maxX - minX, maxZ - minZ, height, 1)
  const radius = Math.hypot(extent, height) / 2
  const dir = new THREE.Vector3(1, 1, 0.35).normalize()
  const toTarget = new THREE.Vector3(cx, cy, cz)
  const toPos = toTarget.clone().addScaledVector(dir, radius * 3.6)
  const fitWorld = Math.max((radius * 2) / Math.max(aspect, 0.001), radius * 2) * 1.35

  hasFitted = true
  focusAnim = {
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
    fromZoom: camera.zoom,
    toPos,
    toTarget,
    toZoom: Math.max(VIEW_HEIGHT / Math.max(fitWorld, 1), 0.01),
    start: performance.now(),
    duration: 600
  }
}

/**
 * Focuses the building with the given pamsu order (used by the page's search
 * results) and lets the page know it was selected.
 */
function focusBuilding(order: number) {
  const b = buildingNodes.find((node) => node.order === order)
  if (!b) return
  const entry = buildingEntries.get(order)
  if (!entry) return
  const status = props.statusByOrder[String(order)]
  const zone: MapZone = {
    id: normalizeName(entry.name),
    name: entry.name,
    type: 'Property',
    corners: b.corners,
    height: b.height,
    baseY: b.baseY,
    color: status ? STATUS_COLORS[status] : DEFAULT_COLOR
  }
  focusOn(zone)
  emit('select', zone)
}

function loadModel() {
  const loader = new GLTFLoader()
  const draco = new DRACOLoader()
  draco.setDecoderPath(DRACO_DECODER_PATH)
  loader.setDRACOLoader(draco)
  loader.load(
    props.modelPath,
    (gltf) => {
      if (!scene) return
      modelGroup = gltf.scene
      scene.add(modelGroup)
      whitenBuildings(modelGroup)
      applyShadows(modelGroup)
      isolateBuildingMaterials()
      if (props.autoBuildings) {
        collectBuildings()
        emit('buildings-ready', buildingNodes.length)
      }
      rebuildZones()
      if (!hasFitted) fitCamera()
    },
    undefined,
    () => {
      emit('model-error', `Could not load the campus model (${props.modelPath}). Check that the file exists.`)
    }
  )
}

function init(attempt = 0) {
  const el = container.value
  if (!el) {
    // ClientOnly can mount this component a tick before the template ref is
    // bound on some dev-mode loads, so wait briefly before giving up.
    if (attempt < 20) setTimeout(() => init(attempt + 1), 50)
    return
  }
  const width = el.clientWidth || 800
  const height = el.clientHeight || 600

  scene = new THREE.Scene()
  scene.background = sceneBackground.value

  aspect = width / height
  camera = new THREE.OrthographicCamera(
    (VIEW_HEIGHT * aspect) / -2,
    (VIEW_HEIGHT * aspect) / 2,
    VIEW_HEIGHT / 2,
    VIEW_HEIGHT / -2,
    0.1,
    5000
  )
  camera.position.set(0, 900, 0)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  el.appendChild(renderer.domElement)

  labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(width, height)
  labelRenderer.domElement.style.position = 'absolute'
  labelRenderer.domElement.style.inset = '0'
  labelRenderer.domElement.style.overflow = 'hidden'
  labelRenderer.domElement.style.pointerEvents = 'none'
  el.appendChild(labelRenderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  // Top-down map: keep the camera above the ground plane.
  controls.maxPolarAngle = Math.PI / 2 - 0.02
  controls.target.set(0, 0, 0)
  controls.update()

  // Reference-map lighting: pale blue sky / warm ground hemisphere plus a
  // bright directional key that casts soft shadows between the white buildings.
  scene.add(new THREE.HemisphereLight(0xb1e1ff, 0xb97a20, 1))
  const sun = new THREE.DirectionalLight(0xffffff, 2.5)
  sun.position.set(-250, 800, -850)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = -600
  sun.shadow.camera.right = 600
  sun.shadow.camera.top = 600
  sun.shadow.camera.bottom = -600
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 2000
  sun.shadow.bias = -0.0005
  scene.add(sun)

  const dom = renderer.domElement
  dom.addEventListener('pointerdown', onPointerDown)
  dom.addEventListener('pointerup', onPointerUp)
  dom.addEventListener('pointermove', onPointerMove)
  dom.style.touchAction = 'none'

  resizeObserver = new ResizeObserver(() => onResize())
  resizeObserver.observe(el)

  rebuildZones()
  loadModel()
  animate()
}

function onResize() {
  const el = container.value
  if (!el || !renderer || !camera) return
  const width = el.clientWidth || 1
  const height = el.clientHeight || 1
  aspect = width / height
  camera.left = (VIEW_HEIGHT * aspect) / -2
  camera.right = (VIEW_HEIGHT * aspect) / 2
  camera.top = VIEW_HEIGHT / 2
  camera.bottom = VIEW_HEIGHT / -2
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  labelRenderer?.setSize(width, height)
}

function animate() {
  frameId = requestAnimationFrame(animate)
  if (camera && controls && focusAnim) {
    const t = Math.min(1, (performance.now() - focusAnim.start) / focusAnim.duration)
    const eased = 1 - Math.pow(1 - t, 3)
    camera.position.lerpVectors(focusAnim.fromPos, focusAnim.toPos, eased)
    controls.target.lerpVectors(focusAnim.fromTarget, focusAnim.toTarget, eased)
    camera.zoom = focusAnim.fromZoom + (focusAnim.toZoom - focusAnim.fromZoom) * eased
    camera.updateProjectionMatrix()
    if (t >= 1) focusAnim = null
  }
  if (controls) controls.update()
  if (renderer && scene && camera) renderer.render(scene, camera)
  if (labelRenderer && scene && camera) labelRenderer.render(scene, camera)
}

function onPointerDown(event: PointerEvent) {
  pointerDownPos = { x: event.clientX, y: event.clientY }
  pointerDownTime = performance.now()
}

function onPointerUp(event: PointerEvent) {
  const moved = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y)
  const elapsed = performance.now() - pointerDownTime
  if (moved > 8 || elapsed > 500) return

  if (props.editable) {
    const building = pickModelBuilding(event.clientX, event.clientY)
    if (building) {
      emit('building-selected', building)
    } else {
      emit('building-missed')
    }
    return
  }

  if (!props.autoBuildings) {
    const zone = pickZone(event.clientX, event.clientY)
    if (zone) {
      emit('select', zone)
      return
    }
  }

  const building = pickModelBuilding(event.clientX, event.clientY)
  if (!building?.name) return
  const order = /^\d+$/.test(building.name) ? parseInt(building.name, 10) : NaN
  const entry = Number.isFinite(order) ? buildingEntries.get(order) : undefined
  if (!entry) return

  const status = props.statusByOrder[String(order)]
  emit('select', {
    id: normalizeName(entry.name),
    name: entry.name,
    type: 'Property',
    corners: building.corners,
    height: building.height,
    baseY: building.baseY,
    color: status ? STATUS_COLORS[status] : DEFAULT_COLOR
  })
}

function onPointerMove(event: PointerEvent) {
  if (!renderer) return
  if (props.editable) {
    const now = performance.now()
    if (now - lastHoverCheck > 80) {
      lastHoverCheck = now
      renderer.domElement.style.cursor = pickModelBuilding(event.clientX, event.clientY) ? 'pointer' : 'default'
    }
    return
  }

  let overPointer = false
  if (!props.autoBuildings) {
    const zone = pickZone(event.clientX, event.clientY)
    const id = zone ? zoneIdOf(zone) : null
    if (id !== hoveredZoneId) {
      if (hoveredZoneId) setZoneHighlight(hoveredZoneId, false)
      hoveredZoneId = id
      if (id) setZoneHighlight(id, true)
    }
    overPointer = !!zone
  }

  const now = performance.now()
  if (now - lastHoverCheck > 80) {
    lastHoverCheck = now
    const building = pickModelBuilding(event.clientX, event.clientY)
    let id: string | null = null
    if (building?.name && /^\d+$/.test(building.name)) {
      const entry = buildingEntries.get(parseInt(building.name, 10))
      if (entry) id = String(entry.order)
    }
    if (id !== hoveredId) {
      if (hoveredId) setZoneHighlight(hoveredId, false)
      hoveredId = id
      if (id) setZoneHighlight(id, true)
    }
    overPointer = overPointer || !!building
  }
  renderer.domElement.style.cursor = overPointer ? 'pointer' : 'default'
}

watch(
  () => props.zones,
  () => rebuildZones(),
  { deep: true }
)

watch(
  () => props.activeZoneId,
  () => applyHighlight()
)

watch(
  () => props.showNames,
  () => rebuildLabels()
)

watch(
  () => props.labels,
  () => rebuildLabels(),
  { deep: true }
)

watch(
  () => props.buildingColors,
  () => rebuildZones(),
  { deep: true }
)

watch(
  () => props.buildingStatus,
  () => rebuildLabels(),
  { deep: true }
)

watch(
  () => props.statusByOrder,
  () => {
    rebuildEdges()
    rebuildLabels()
  },
  { deep: true }
)

onMounted(() => init())

onBeforeUnmount(() => {
  cancelAnimationFrame(frameId)
  resizeObserver?.disconnect()
  const dom = renderer?.domElement
  if (dom) {
    dom.removeEventListener('pointerdown', onPointerDown)
    dom.removeEventListener('pointerup', onPointerUp)
    dom.removeEventListener('pointermove', onPointerMove)
    dom.remove()
  }
  if (scene) {
    if (modelGroup) {
      scene.remove(modelGroup)
      disposeObject(modelGroup)
    }
    for (const [, group] of zoneMeshes) {
      scene.remove(group)
      disposeObject(group)
    }
    for (const [, group] of statusEdges) {
      scene.remove(group)
      disposeObject(group)
    }
    for (const [, group] of hoverEdges) {
      scene.remove(group)
      disposeObject(group)
    }
    for (const [, label] of labelObjects) {
      scene.remove(label)
      label.element.remove()
    }
    labelObjects.clear()
  }
  labelRenderer?.domElement.remove()
  controls?.dispose()
  renderer?.dispose()
})

defineExpose({ resetCamera, focusOn, focusBuilding })
</script>

<template>
  <div ref="container" class="relative h-full w-full" />
</template>

<style>
.campus-map-label {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 7px;
  border-radius: 4px;
  background: #b84034;
  color: #fff;
  font-family: sans-serif;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.5;
  white-space: nowrap;
  user-select: none;
  pointer-events: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}

.campus-map-label-status {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 5px;
  border-radius: 3px;
  background: #fff;
  color: #b84034;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.campus-map-label-status.is-vacant {
  background: #16a34a;
  color: #fff;
}

.campus-map-label-status.is-occupied {
  background: #fff;
  color: #b84034;
}
</style>
