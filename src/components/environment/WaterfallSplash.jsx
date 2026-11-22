import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ANIMATED } from '../../environment/environmentConfig.js'

/** The animated falling-water / splash effect (looping waterfall objects) at each waterfall. */
export default function WaterfallSplash({ splashes }) {
  const gltf = useGLTF(ANIMATED.splash, false)
  const items = useMemo(
    () =>
      splashes.map((s) => {
        const obj = clone(gltf.scene)
        obj.position.set(s.x, s.y, s.z)
        obj.rotation.y = s.yaw
        obj.scale.setScalar(s.scale)
        const mixer = new THREE.AnimationMixer(obj)
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play())
        return { obj, mixer }
      }),
    [gltf, splashes],
  )
  useFrame(({ camera }, dt) => {
    for (const i of items) {
      // 300 small animated pieces: only drawn (and animated) when you are near
      i.obj.visible = i.obj.position.distanceTo(camera.position) < 450
      if (i.obj.visible) i.mixer.update(Math.min(dt, 0.1))
    }
  })
  return (
    <>
      {items.map((i, k) => (
        <primitive key={k} object={i.obj} />
      ))}
    </>
  )
}

useGLTF.preload(ANIMATED.splash, false)
