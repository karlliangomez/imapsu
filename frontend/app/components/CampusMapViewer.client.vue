<script setup lang="ts">
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { MapCorner, MapZone } from '~/types/map'

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

let renderer: THREE.WebGLRenderer | null = null
let labelRenderer: CSS2DRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let raycaster = new THREE.Raycaster()
let modelGroup: THREE.Group | null = null
let frameId = 0
let resizeObserver: ResizeObserver | null = null
let hasFitted = false
let lastHoverCheck = 0

const zoneMeshes = new Map<string, THREE.Group>()
const labelObjects = new Map<string, CSS2DObject>()
let hoveredZoneId: string | null = null
let pointerDownPos = { x: 0, y: 0 }
let pointerDownTime = 0
let autoZones: { name: string; corners: MapCorner[]; height: number; baseY: number }[] = []

const ZONE_HOVER_TINT = 1.12
const ZONE_ACTIVE_TINT = 1.28
const DEFAULT_COLOR = '#d4af37'
// Objects that span more than 40% of the model's XZ extent are treated as
// terrain/ground and never selectable as buildings.
const TERRAIN_RATIO = 0.4

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

function buildZoneMesh(zone: MapZone, id?: string): THREE.Group | null {
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
  const color = /^#[0-9a-fA-F]{6}$/.test(zone.color ?? '') ? zone.color : DEFAULT_COLOR

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  geometry.rotateX(-Math.PI / 2)

  const group = new THREE.Group()
  group.position.y = baseY
  group.renderOrder = 10
  group.userData.baseColor = new THREE.Color(color)

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.6,
    metalness: 0.1
  })
  group.add(new THREE.Mesh(geometry, material))

  const edges = new THREE.EdgesGeometry(geometry)
  const outline = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(0.55),
      depthWrite: false
    })
  )
  group.add(outline)

  group.userData.zoneId = id ?? zoneIdOf(zone)
  group.userData.zone = zone
  return group
}

function collectAutoZones() {
  autoZones = []
  if (!modelGroup) return
  const modelBox = new THREE.Box3().setFromObject(modelGroup)
  const modelSize = modelBox.getSize(new THREE.Vector3())
  const modelXZ = Math.max(modelSize.x, modelSize.z, 1)

  for (const child of modelGroup.children) {
    if (!isLabelableName(child.name)) continue
    const box = new THREE.Box3().setFromObject(child)
    if (box.isEmpty()) continue
    const size = box.getSize(new THREE.Vector3())
    if (Math.max(size.x, size.z) > modelXZ * TERRAIN_RATIO) continue

    const corners = computeGroundFootprint(child)
    if (!corners || corners.length < 3) continue
    autoZones.push({
      name: displayNameOf(child.name),
      corners: inflateFootprint(corners),
      // The block pokes slightly above the roof so the status color reads as a
      // shell around the building rather than being covered by its mesh.
      height: Math.max(size.y, 0.5) + 0.6,
      baseY: box.min.y
    })
  }
}

function rebuildZones() {
  if (!scene) return

  for (const [, group] of zoneMeshes) {
    scene.remove(group)
    disposeObject(group)
  }
  zoneMeshes.clear()

  if (props.autoBuildings) {
    for (const b of autoZones) {
      const color = props.buildingColors[normalizeName(b.name)] ?? DEFAULT_COLOR
      // Only listed buildings (green = vacant, red = occupied) get a highlight
      // shell. Unlisted buildings stay as their plain model cube so the map
      // focuses on vacancy status.
      if (color === DEFAULT_COLOR) continue
      const zone: MapZone = {
        id: normalizeName(b.name),
        name: b.name,
        corners: b.corners,
        height: b.height,
        baseY: b.baseY,
        color
      }
      const group = buildZoneMesh(zone, normalizeName(b.name))
      if (group) {
        zoneMeshes.set(normalizeName(b.name), group)
        scene.add(group)
      }
    }
  } else {
    for (const zone of props.zones) {
      const group = buildZoneMesh(zone)
      if (group) {
        zoneMeshes.set(zoneIdOf(zone), group)
        scene.add(group)
      }
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
    ? autoZones.map((b) => ({
        name: b.name,
        corners: b.corners,
        height: b.height,
        baseY: b.baseY,
        key: `zone:${normalizeName(b.name)}`
      }))
    : props.zones.map((zone) => ({
        name: zone.name,
        corners: Array.isArray(zone.corners) ? zone.corners : [],
        height: Math.max(Number(zone.height) || 4, 0.5),
        baseY: Number.isFinite(Number(zone.baseY)) ? Number(zone.baseY) : 0,
        key: `zone:${zoneIdOf(zone)}`
      }))

  // Labels are anchored to the top-center of each building's highlight block,
  // so a name always sits directly over the building it refers to.
  for (const item of items) {
    if (!item.name) continue
    const pts = item.corners.filter((c) => Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.z)))
    if (pts.length < 3) continue
    const cx = pts.reduce((sum, c) => sum + Number(c.x), 0) / pts.length
    const cz = pts.reduce((sum, c) => sum + Number(c.z), 0) / pts.length
    const height = Math.max(item.height, 0.5)
    const text = props.labels[normalizeName(item.name)] ?? item.name
    const status = props.buildingStatus[normalizeName(item.name)]
    addLabel(text, cx, item.baseY + height + 2.2, cz, item.key, status)
  }
}

function setZoneTint(id: string, scale: number) {
  const group = zoneMeshes.get(id)
  if (!group) return
  const base = group.userData.baseColor as THREE.Color | undefined
  if (!base) return
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
      obj.material.color.copy(base).multiplyScalar(scale)
    }
  })
}

function applyHighlight() {
  for (const id of zoneMeshes.keys()) {
    setZoneTint(id, id === props.activeZoneId ? ZONE_ACTIVE_TINT : 1)
  }
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

/**
 * Grows a footprint outward from its centroid so the highlight block sticks
 * out around the building mesh instead of being hidden inside it. Each corner
 * moves outward by at least MIN_GROW units and at least GROW_RATIO of its
 * distance from the centroid, keeping the centroid (and therefore the labels)
 * exactly in place.
 */
function inflateFootprint(corners: MapCorner[]): MapCorner[] {
  if (corners.length === 0) return corners
  const cx = corners.reduce((sum, c) => sum + c.x, 0) / corners.length
  const cz = corners.reduce((sum, c) => sum + c.z, 0) / corners.length
  const GROW_RATIO = 0.04
  const MIN_GROW = 0.75

  return corners.map((c) => {
    const dx = c.x - cx
    const dz = c.z - cz
    const len = Math.hypot(dx, dz)
    if (len === 0) return { x: c.x, z: c.z }
    const grow = Math.max(len * GROW_RATIO, MIN_GROW)
    return { x: c.x + (dx / len) * grow, z: c.z + (dz / len) * grow }
  })
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
  const maxDim = Math.max(size.x, size.y, size.z, 1)
  const dist = (maxDim / (2 * Math.tan(((camera.fov * Math.PI) / 180) / 2))) * 1.6

  camera.position.set(center.x + dist * 0.7, center.y + dist * 0.85, center.z + dist)
  controls.target.copy(center)
  controls.update()
  hasFitted = true
}

function resetCamera() {
  hasFitted = false
  fitCamera()
}

function loadModel() {
  const loader = new GLTFLoader()
  loader.load(
    props.modelPath,
    (gltf) => {
      if (!scene) return
      modelGroup = gltf.scene
      scene.add(modelGroup)
      if (props.autoBuildings) {
        collectAutoZones()
        emit('buildings-ready', autoZones.length)
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

function init() {
  const el = container.value
  if (!el) return
  const width = el.clientWidth || 800
  const height = el.clientHeight || 600

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0e1418)

  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 5000)
  camera.position.set(30, 40, 60)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
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
  controls.minDistance = 2
  controls.maxDistance = 600
  // Keep the camera above the ground plane so the campus can never be viewed
  // from underneath.
  controls.maxPolarAngle = Math.PI / 2 - 0.02

  scene.add(new THREE.AmbientLight(0xffffff, 0.75))
  const sun = new THREE.DirectionalLight(0xffffff, 1.3)
  sun.position.set(40, 60, 30)
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0x8fa8c0, 0.45)
  fill.position.set(-40, 20, -30)
  scene.add(fill)

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
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  labelRenderer?.setSize(width, height)
}

function animate() {
  frameId = requestAnimationFrame(animate)
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

  const zone = pickZone(event.clientX, event.clientY)
  if (zone) {
    emit('select', zone)
    return
  }

  // Any user can also tap the building mesh itself (e.g. above the highlight
  // block) and still see the building details.
  const building = pickModelBuilding(event.clientX, event.clientY)
  if (building) {
    const displayName = building.name ?? ''
    emit('select', {
      id: normalizeName(displayName),
      name: displayName || 'Building',
      type: 'Property',
      corners: building.corners,
      height: building.height,
      baseY: building.baseY,
      color: displayName ? props.buildingColors[normalizeName(displayName)] ?? DEFAULT_COLOR : DEFAULT_COLOR
    })
  }
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
  const zone = pickZone(event.clientX, event.clientY)
  const id = zone ? zoneIdOf(zone) : null
  if (id !== hoveredZoneId) {
    if (hoveredZoneId) setZoneTint(hoveredZoneId, 1)
    hoveredZoneId = id
    if (id) setZoneTint(id, ZONE_HOVER_TINT)
  }
  const now = performance.now()
  let overBuilding = false
  if (!zone && now - lastHoverCheck > 80) {
    lastHoverCheck = now
    overBuilding = !!pickModelBuilding(event.clientX, event.clientY)
  }
  renderer.domElement.style.cursor = zone || overBuilding ? 'pointer' : 'default'
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

defineExpose({ resetCamera })
</script>

<template>
  <div ref="container" class="relative h-full w-full" />
</template>

<style>
.campus-map-label {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 9px;
  border-radius: 9999px;
  background: rgba(9, 14, 19, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
  user-select: none;
  pointer-events: none;
}

.campus-map-label-status {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  border-radius: 9999px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.campus-map-label-status.is-vacant {
  background: rgba(34, 197, 94, 0.22);
  border: 1px solid rgba(34, 197, 94, 0.7);
  color: #4ade80;
}

.campus-map-label-status.is-occupied {
  background: rgba(239, 68, 68, 0.22);
  border: 1px solid rgba(239, 68, 68, 0.7);
  color: #f87171;
}
</style>
