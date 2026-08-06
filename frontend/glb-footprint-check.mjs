import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { readFile } from 'node:fs/promises'

const buf = await readFile('public/models/campus.glb')
const gltf = await new Promise((res, rej) =>
  new GLTFLoader().parse(buf.buffer, '', res, rej)
)
const modelGroup = gltf.scene

const TERRAIN_RATIO = 0.4

function convexHull(points) {
  const pts = [...points].sort((a, b) => (a.x !== b.x ? a.x - b.x : a.z - b.z))
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function simplifyFootprint(points, minEdge = 0.5) {
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

function computeGroundFootprint(node) {
  const meshes = []
  if (node instanceof THREE.Mesh) meshes.push(node)
  node.traverse((child) => {
    if (child instanceof THREE.Mesh && child !== node) meshes.push(child)
  })
  const vertices = []
  const seen = new Set()
  const tmp = new THREE.Vector3()
  for (const mesh of meshes) {
    const position = mesh.geometry?.getAttribute('position')
    if (!position) continue
    mesh.updateWorldMatrix(true, true)
    const matrix = mesh.matrixWorld
    for (let i = 0; i < position.count; i++) {
      tmp.fromBufferAttribute(position, i).applyMatrix4(matrix)
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

const modelBox = new THREE.Box3().setFromObject(modelGroup)
const modelSize = modelBox.getSize(new THREE.Vector3())
const modelXZ = Math.max(modelSize.x, modelSize.z, 1)

let rotated = 0
let buildings = 0
let rejected = 0

for (const node of modelGroup.children) {
  const box = new THREE.Box3().setFromObject(node)
  const size = box.getSize(new THREE.Vector3())
  if (Math.max(size.x, size.z) > modelXZ * TERRAIN_RATIO) {
    rejected++
    continue
  }
  buildings++
  const footprint = computeGroundFootprint(node)
  if (!footprint) continue

  const name = (node.name || 'unamed').padEnd(46)
  const center = box.getCenter(new THREE.Vector3())
  const bboxDiag = Math.hypot(size.x, size.z)
  const hullDiag = Math.hypot(footprint[0].x - footprint[1].x, footprint[0].z - footprint[1].z)

  let isRotated = false
  let longEdge = ''
  let hullPoints = footprint.length
  let angles = []
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]
    const b = footprint[(i + 1) % footprint.length]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    if (len < 1.5) continue
    const angle = Math.round(Math.atan2(Math.abs(dz), Math.abs(dx)) * 180 / Math.PI)
    angles.push(angle)
    if (angle > 1 && angle < 89) {
      isRotated = true
      longEdge = `edge(${a.x.toFixed(1)},${a.z.toFixed(1)})->(${b.x.toFixed(1)},${b.z.toFixed(1)}) len=${len.toFixed(1)} ang=${angle}`
    }
  }
  if (isRotated) rotated++

  console.log(
    `name="${name}" pts=${hullPoints} hullDiag=${hullDiag.toFixed(1)} vs bboxDiag=${bboxDiag.toFixed(1)} ` +
    `baseY=${box.min.y.toFixed(2)} height=${size.y.toFixed(1)} angles=[${angles.sort((a,b)=>a-b).join(',')}]` +
    (isRotated ? `  ROTATED -> ${longEdge}` : '')
  )
}

console.log(`\nbuildings=${buildings} rotated=${rotated} terrain-rejected=${rejected} totalChildren=${modelGroup.children.length}`)
