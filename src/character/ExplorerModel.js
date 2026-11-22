// Prepares the downloaded explorer GLB for the game. The model is merged from
// three CC0 parts (head, outfit, hair) that each carry an identical copy of the
// same humanoid skeleton. GLTFLoader renames the duplicate bones (pelvis_1, ...),
// so every skinned part is re-bound to the one skeleton whose bone names match
// the animation clips; a single AnimationMixer then drives the whole character.
import * as THREE from 'three'
import { CHARACTER_ASSET } from './characterConfig.js'

const MAIN_BONE = 'pelvis'

export function prepareExplorer(scene) {
  const skinned = []
  scene.traverse((o) => {
    if (o.isSkinnedMesh) skinned.push(o)
  })
  const main = skinned.find((m) => m.skeleton.bones.some((b) => b.name === MAIN_BONE))
  if (!main) throw new Error('Explorer model: no skeleton with the expected bone names')
  const byName = new Map(main.skeleton.bones.map((b) => [b.name, b]))

  for (const mesh of skinned) {
    if (mesh.skeleton !== main.skeleton) {
      const bones = mesh.skeleton.bones.map(
        (b) => byName.get(b.name) ?? byName.get(b.name.replace(/_\d+$/, '')) ?? b,
      )
      mesh.bind(new THREE.Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix)
    }
    if (/hair/i.test(mesh.material.name)) mesh.material.color.set(CHARACTER_ASSET.hairColor) // hair + eyebrows
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false // animated bounds differ from the bind pose
  }
  return scene
}
