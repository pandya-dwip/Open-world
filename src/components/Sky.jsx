import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS, SUN_DIR } from '../world/shared.js'
import { mulberry32 } from '../world/noise.js'

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.7, h), 0.75));
    float s = max(dot(d, uSun), 0.0);
    col += vec3(1.0, 0.93, 0.78) * (pow(s, 900.0) * 1.6 + pow(s, 12.0) * 0.18);
    gl_FragColor = vec4(col, 1.0);
    // no tone mapping here, so the horizon matches the (untone-mapped) fog colour exactly
    #include <colorspace_fragment>
  }
`

/** Gradient sky dome with a soft sun, plus a ring of slowly drifting low-poly clouds. */
export default function Sky() {
  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: new THREE.Color(COLORS.skyTop) },
          uHorizon: { value: new THREE.Color(COLORS.horizon) },
          uSun: { value: SUN_DIR.clone() },
        },
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  )

  // the dome and cloud ring travel with the camera, so they always surround it
  const follow = useRef()
  useFrame(({ camera }) => follow.current.position.set(camera.position.x, 0, camera.position.z))

  return (
    <group ref={follow}>
      <mesh material={skyMat} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[7000, 32, 16]} />
      </mesh>
      <Clouds />
    </group>
  )
}

function Clouds() {
  const ref = useRef()
  const group = useRef()
  const puffs = useMemo(() => {
    const rand = mulberry32(7)
    const list = []
    for (let c = 0; c < 26; c++) {
      const ang = (c / 26) * Math.PI * 2 + rand() * 0.2
      const dist = 3400 + rand() * 1800
      const cx = Math.cos(ang) * dist
      const cz = Math.sin(ang) * dist
      const cy = 420 + rand() * 380
      const n = 5 + Math.floor(rand() * 5)
      const size = 50 + rand() * 50
      for (let k = 0; k < n; k++) {
        const r = size * (0.6 + rand() * 0.6)
        const off = (k - n / 2) * size * 1.05
        list.push([cx + off * Math.sin(ang) + rand() * 20, cy + rand() * size * 0.35, cz - off * Math.cos(ang) + rand() * 20, r])
      }
    }
    return list
  }, [])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    puffs.forEach(([x, y, z, r], i) => {
      m.makeScale(r * 1.3, r * 0.75, r)
      m.setPosition(x, y, z)
      ref.current.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [puffs])

  useFrame((_, dt) => {
    group.current.rotation.y += Math.min(dt, 0.1) * 0.002
  })

  return (
    <group ref={group}>
      <instancedMesh ref={ref} args={[undefined, undefined, puffs.length]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 2]} />
        <meshLambertMaterial color="#ffffff" emissive="#c9dcf0" emissiveIntensity={0.55} fog={false} />
      </instancedMesh>
    </group>
  )
}
