import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { createCharacter } from './CharacterModel.js'
import { CharacterAnimator } from './CharacterAnimations.js'
import { player, playerSpeed, spawnPlayer, stepPlayer } from './CharacterController.js'
import { attachKeyboard, input, readMoveIntent } from '../controls/playerInput.js'
import { getMode } from '../game/gameStore.js'
import { useWorld } from '../world/worldStore.js'

const NO_INTENT = { x: 0, y: 0, sprint: false }
const intent = { x: 0, y: 0, sprint: false }

/**
 * The playable character. Spawns on the island once it has been generated;
 * in free-camera mode it stays put and idles. Per-frame work happens in
 * useFrame on plain objects, so React never re-renders for animation.
 */
export default function PlayerCharacter() {
  const { root, joints } = useMemo(createCharacter, [])
  const animator = useMemo(() => new CharacterAnimator(joints), [joints])
  const { ready } = useWorld()

  useEffect(attachKeyboard, [])
  useEffect(() => {
    if (ready && !player.ready) spawnPlayer()
  }, [ready])

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
    animator.update(dt, playerSpeed(), player.grounded, player.velocity.y)
  }, -2)

  return <primitive object={root} visible={ready} />
}
