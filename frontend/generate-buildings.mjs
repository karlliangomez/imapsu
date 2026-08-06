import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const buf = readFileSync('public/models/campus.glb')
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer, '', res, rej))
const modelGroup = gltf.scene

const TERRAIN_RATIO = 0.4
const GENERIC_NAMES = /^(cube|mesh|plane|box|cylinder|sphere|icosphere|circle|group|empty|node)(\.\d+)?$/i

const isMeaningful = (name) => {
  const t = (name || '').trim()
  if (!t || /^\d+$/.test(t)) return false
  return !GENERIC_NAMES.test(t)
}

const modelBox = new THREE.Box3().setFromObject(modelGroup)
const modelSize = modelBox.getSize(new THREE.Vector3())
const modelXZ = Math.max(modelSize.x, modelSize.z, 1)

const names = []
for (const child of modelGroup.children) {
  if (!isMeaningful(child.name)) continue
  const box = new THREE.Box3().setFromObject(child)
  if (box.isEmpty()) continue
  const size = box.getSize(new THREE.Vector3())
  if (Math.max(size.x, size.z) > modelXZ * TERRAIN_RATIO) continue
  names.push(child.name.trim().replace(/_/g, ' ').replace(/\s+/g, ' '))
}

names.sort((a, b) => a.localeCompare(b))
mkdirSync('app/data', { recursive: true })
writeFileSync('app/data/buildings.json', JSON.stringify(names, null, 2))
console.log(`wrote ${names.length} building names to app/data/buildings.json`)
