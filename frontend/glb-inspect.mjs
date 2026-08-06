import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { readFile } from 'node:fs/promises'

const buf = await readFile('public/models/campus.glb')
const gltf = await new Promise((res, rej) =>
  new GLTFLoader().parse(buf.buffer, '', res, rej)
)
const scene = gltf.scene

function fmt(v) { return v.map((n) => n.toFixed(2)).join(',') }

let count = 0
function walk(obj, depth) {
  if (depth > 8 || count > 400) return
  count++
  const box = new THREE.Box3().setFromObject(obj)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  console.log(
    ' '.repeat(depth) + obj.type.padEnd(7) + ' name="' + (obj.name || '') + '"' +
    ' pos=(' + fmt([obj.position.x, obj.position.y, obj.position.z]) + ')' +
    ' scale=(' + fmt([obj.scale.x, obj.scale.y, obj.scale.z]) + ')' +
    ' center=(' + fmt([center.x, center.y, center.z]) + ')' +
    ' size=(' + fmt([size.x, size.y, size.z]) + ')'
  )
  for (const c of obj.children) walk(c, depth + 1)
}
console.log('scene name="' + scene.name + '" children=' + scene.children.length)
walk(scene, 0)
console.log('total walked: ' + count)
