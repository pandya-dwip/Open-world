import { useFrame, useThree } from '@react-three/fiber'
import { advanceTime, time } from '../../environment/time/timeStore.js'
import { atmosphere, updateAtmosphere } from '../../environment/time/atmosphere.js'

/**
 * Drives the day-night cycle: advances the clock, recomputes the shared
 * atmosphere (sun / moon, colours) and applies the scene-wide parts of it
 * (fog, background, exposure). Lights, sky, water and clouds read the same
 * atmosphere object themselves. Runs first in the frame (priority -3).
 */
export default function DayNightCycle() {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  useFrame((_, dt) => {
    advanceTime(Math.min(dt, 0.1))
    updateAtmosphere(time.hours)
    // fog always matches the horizon so the far ocean edge blends into the sky
    if (scene.fog) scene.fog.color.copy(atmosphere.horizon)
    if (scene.background?.isColor) scene.background.copy(atmosphere.horizon)
    gl.toneMappingExposure = atmosphere.exposure
  }, -3)
  return null
}
