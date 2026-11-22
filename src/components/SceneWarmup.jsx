import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { setSceneReady, useWorld } from '../world/worldStore.js'
import { player } from '../character/CharacterController.js'

/**
 * Prevents the stutter right after the game opens. Once the island, the
 * environment and the character are in place, it compiles every shader in the
 * scene up front (including objects that are hidden until you get close),
 * renders a few frames so textures and shadows are uploaded, and only then
 * reports the scene ready, which lets the loading screen fade out.
 */
export default function SceneWarmup() {
  const { envReady, sceneReady } = useWorld()
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const stage = useRef('waiting') // waiting -> compiling -> settling -> done
  const frames = useRef(0)

  useEffect(() => {
    if (!envReady || sceneReady || stage.current !== 'waiting') return
    stage.current = 'pending'
  }, [envReady, sceneReady])

  useFrame(() => {
    if (stage.current === 'pending' && player.ready) {
      stage.current = 'compiling'
      // show everything while compiling, so far-away / hidden models get their shaders too
      const hidden = []
      scene.traverse((o) => {
        if ((o.isMesh || o.isInstancedMesh) && !o.visible) {
          hidden.push(o)
          o.visible = true
        }
      })
      const done = () => {
        for (const o of hidden) o.visible = false
        gl.shadowMap.needsUpdate = true
        frames.current = 0
        stage.current = 'settling'
      }
      const p = gl.compileAsync ? gl.compileAsync(scene, camera) : Promise.resolve(gl.compile(scene, camera))
      p.then(done, done)
    } else if (stage.current === 'settling' && ++frames.current > 20) {
      // a few real frames with the final view: uploads done, frame times stable
      stage.current = 'done'
      setSceneReady()
    }
  })
  return null
}
