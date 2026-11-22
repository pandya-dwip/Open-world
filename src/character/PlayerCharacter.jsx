import { Suspense, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { prepareExplorer } from './ExplorerModel.js'
import { CharacterAnimator } from './CharacterAnimations.js'
import { CHARACTER_ASSET } from './characterConfig.js'
import { player, playerSpeed, spawnPlayer, stepPlayer } from './CharacterController.js'
import { attachKeyboard, input, readMoveIntent } from '../controls/playerInput.js'
import { getMode } from '../game/gameStore.js'
import { useWorld } from '../world/worldStore.js'

// Local files only (served from public/); no Draco decoder needed or fetched.
const MODEL_URL = import.meta.env.BASE_URL + CHARACTER_ASSET.model
const ANIM_URL = import.meta.env.BASE_URL + CHARACTER_ASSET.animations
useGLTF.preload(MODEL_URL, false)
useGLTF.preload(ANIM_URL, false)

const NO_INTENT = { x: 0, y: 0, sprint: false }
const intent = { x: 0, y: 0, sprint: false }

/**
 * The playable explorer. Spawns on the island once it has been generated; in
 * free-camera mode it stays put and idles. Per-frame work happens in useFrame
 * on plain objects, so React never re-renders for animation.
 */
export default function PlayerCharacter() {
  return (
    <Suspense fallback={null}>
      <Explorer />
    </Suspense>
  )
}

function Explorer() {
  const model = useGLTF(MODEL_URL, false)
  const anims = useGLTF(ANIM_URL, false)
  const root = useMemo(() => prepareExplorer(model.scene), [model.scene])
  const animator = useMemo(() => new CharacterAnimator(root, anims.animations), [root, anims.animations])
  const { envReady, spawn } = useWorld()

  useEffect(attachKeyboard, [])
  useEffect(() => {
    if (envReady && !player.ready) spawnPlayer(spawn)
  }, [envReady, spawn])

  // priority -2: move the player before the camera controls update (-1) and follow (0)
  useFrame(({ camera }, rawDt) => {
    if (!player.ready) return
    const dt = Math.min(rawDt, 0.05)
    const active = getMode() === 'player'
    const jump = active && input.jumpQueued
    input.jumpQueued = false
    stepPlayer(dt, active ? readMoveIntent(intent) : NO_INTENT, jump, camera)
    root.position.copy(player.position)
    root.rotation.y = player.yaw
    animator.update(dt, playerSpeed(), player.grounded)
  }, -2)

  return <primitive object={root} visible={envReady} />
}
