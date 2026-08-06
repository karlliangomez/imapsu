import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { readFileSync } from 'node:fs'

const buf = readFileSync('public/models/campus.glb')
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer, '', res, rej))
const modelGroup = gltf.scene

const modelBox = new THREE.Box3().setFromObject(modelGroup)
const modelXZ = Math.max(modelBox.getSize(new THREE.Vector3()).x, modelBox.getSize(new THREE.Vector3()).z, 1)
const GENERIC = /^(cube|mesh|plane|box|cylinder|sphere|icosphere|circle|group|empty|node)(\.\d+)?$/i

const included = []
for (const child of modelGroup.children) {
  const name = (child.name || '').trim()
  if (!name || GENERIC.test(name)) { console.log(`excluded generic/empty: "${child.name}"`); continue }
  const box = new THREE.Box3().setFromObject(child)
  if (box.isEmpty()) { console.log(`excluded empty box: "${child.name}"`); continue }
  const size = box.getSize(new THREE.Vector3())
  if (Math.max(size.x, size.z) > modelXZ * 0.4) { console.log(`excluded terrain: "${child.name}"`); continue }
  included.push({ name, y: size.y })
}
console.log(`\nTOTAL auto buildings: ${included.length}`)
console.log(`named: ${included.filter((b) => !/^\d+$/.test(b.name)).length}`)
console.log(`numeric: ${included.filter((b) => /^\d+$/.test(b.name)).length}`)
