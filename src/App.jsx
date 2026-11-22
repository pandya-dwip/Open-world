import { useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import World from './components/World.jsx'
import CameraRig from './components/CameraRig.jsx'
import PlayerCharacter from './character/PlayerCharacter.jsx'
import MobileControls from './controls/MobileControls.jsx'
import UI from './components/UI.jsx'
import { COLORS, HOME_VIEW } from './world/shared.js'
import { QUALITY } from './world/quality.js'

export default function App() {
  const cameraApi = useRef(null)

  return (
    <>
      <Canvas
        className="scene"
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, QUALITY.maxDpr]}
        camera={{ position: HOME_VIEW.position, fov: 50, near: 1, far: 16000 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping
          gl.toneMappingExposure = 1.0
        }}
      >
        <color attach="background" args={[COLORS.horizon]} />
        <World />
        <PlayerCharacter />
        <CameraRig apiRef={cameraApi} />
      </Canvas>
      <UI onResetView={() => cameraApi.current?.reset()} />
      <MobileControls />
    </>
  )
}
