import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { atmosphere } from '../environment/time/atmosphere.js'
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
  uniform vec3 uMoon;
  uniform vec3 uSunColor;
  uniform float uSunVisible;
  uniform float uMoonVisible;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vDir;

  float hash3(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }
  // sparse twinkling stars on a 3D cell grid over the sky sphere
  float starField(vec3 d) {
    vec3 p = d * 260.0;
    vec3 c = floor(p);
    float h = hash3(c);
    if (h < 0.986) return 0.0;
    vec3 f = fract(p) - 0.5;
    float twinkle = 0.65 + 0.35 * sin(uTime * (2.0 + h * 6.0) + h * 100.0);
    return smoothstep(0.32, 0.0, length(f)) * (h - 0.986) / 0.014 * twinkle;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.7, h), 0.75));

    // sun: disc plus a warm glow that tints the sky around it at sunrise / sunset
    float s = max(dot(d, uSun), 0.0);
    col += uSunColor * (pow(s, 900.0) * 1.8 + pow(s, 10.0) * 0.22 + pow(s, 3.0) * 0.08) * uSunVisible;

    // moon: pale disc with a soft halo
    float m = max(dot(d, uMoon), 0.0);
    float disc = smoothstep(0.99955, 0.99975, m);
    col += vec3(0.92, 0.94, 1.0) * (disc * 1.1 + pow(m, 60.0) * 0.12) * uMoonVisible;

    // stars fade out towards the horizon and behind the moon disc
    col += vec3(0.9, 0.94, 1.0) * starField(d) * uStars * smoothstep(0.02, 0.25, d.y) * (1.0 - disc);
    gl_FragColor = vec4(col, 1.0);
    // no tone mapping here, so the horizon matches the (untone-mapped) fog colour exactly
    #include <colorspace_fragment>
  }
`

/**
 * Day-night sky dome: gradient, sun with glow, moon and twinkling stars, all
 * driven by the shared atmosphere. Plus a ring of slowly drifting clouds whose
 * colour follows the time of day.
 */
export default function Sky() {
  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        // the uniforms reference the atmosphere's own vectors / colours
        uniforms: {
          uTop: { value: atmosphere.skyTop },
          uHorizon: { value: atmosphere.horizon },
          uSun: { value: atmosphere.sunDir },
          uMoon: { value: atmosphere.moonDir },
          uSunColor: { value: atmosphere.lightColor },
          uSunVisible: { value: 1 },
          uMoonVisible: { value: 0 },
          uStars: { value: 0 },
          uTime: { value: 0 },
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
  useFrame(({ camera }, dt) => {
    follow.current.position.set(camera.position.x, 0, camera.position.z)
    const u = skyMat.uniforms
    u.uSunVisible.value = atmosphere.sunVisible
    u.uMoonVisible.value = atmosphere.moonVisible
    u.uStars.value = atmosphere.stars
    u.uTime.value += Math.min(dt, 0.1)
  })

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
  const mat = useRef()
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
    // clouds take the light of the hour: white by day, peach at dusk, slate at night
    mat.current.color.copy(atmosphere.cloud)
    mat.current.emissive.copy(atmosphere.cloud).multiplyScalar(0.55)
  })

  return (
    <group ref={group}>
      <instancedMesh ref={ref} args={[undefined, undefined, puffs.length]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 2]} />
        <meshLambertMaterial ref={mat} color="#ffffff" emissive="#c9dcf0" emissiveIntensity={1} fog={false} />
      </instancedMesh>
    </group>
  )
}
