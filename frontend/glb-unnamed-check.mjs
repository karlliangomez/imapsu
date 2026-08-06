import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { readFileSync } from 'node:fs'

const buf = readFileSync('public/models/campus.glb')
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer, '', res, rej))
const modelGroup = gltf.scene

const modelBox = new THREE.Box3().setFromObject(modelGroup)
const modelSize = modelBox.getSize(new THREE.Vector3())
const modelXZ = Math.max(modelSize.x, modelSize.z, 1)

for (const child of modelGroup.children) {
  const box = new THREE.Box3().setFromObject(child)
  const size = box.getSize(new THREE.Vector3())
  const empty = box.isEmpty()
  const span = empty ? 0 : Math.max(size.x, size.z)
  const isTerrain = !empty && span > modelXZ * 0.4
  const hasMeshes = !empty && box.getCenter(new THREE.Vector3()).length() > 0
  console.log(
    `${(child.name || '(unnamed)').padEnd(48)} | meshes/geometry: ${hasMeshes && !empty} | empty: ${empty} | span: ${span.toFixed(1)} | terrain-like: ${isTerrain}`
  )
}
