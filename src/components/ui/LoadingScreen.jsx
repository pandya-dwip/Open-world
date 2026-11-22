import { useEffect, useState } from 'react'
import { useWorld } from '../../world/worldStore.js'

const STEPS = [
  { key: 'terrain', label: 'Shaping the island' },
  { key: 'environment', label: 'Growing forests and placing rocks' },
  { key: 'graphics', label: 'Preparing graphics' },
]

/**
 * Full-screen loading screen shown when the game opens. It stays until the
 * world is built and the graphics are warmed up, then fades out to reveal the
 * third-person view.
 */
export default function LoadingScreen() {
  const world = useWorld()
  const [gone, setGone] = useState(false)
  const step = world.sceneReady ? 3 : world.envReady ? 2 : world.ready ? 1 : 0
  const progress = [0.12, 0.45, 0.85, 1][step]

  useEffect(() => {
    if (!world.sceneReady) return
    const t = setTimeout(() => setGone(true), 700) // matches the CSS fade
    return () => clearTimeout(t)
  }, [world.sceneReady])

  if (gone) return null
  return (
    <div className={`loading-screen${world.sceneReady ? ' hidden' : ''}`} role="status" aria-live="polite" aria-busy={!world.sceneReady}>
      <div className="loading-card">
        <h1>Anime World</h1>
        {world.error ? (
          <p className="loading-error">Could not build the world: {world.error}</p>
        ) : (
          <>
            <div className="loading-bar" aria-hidden="true">
              <div style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="loading-step">{STEPS[Math.min(step, 2)].label}…</p>
          </>
        )}
      </div>
    </div>
  )
}
