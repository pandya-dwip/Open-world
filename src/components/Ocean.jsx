import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SEA_FLOOR, WORLD_BOUNDS } from '../world/islands.js'
import { DEPTH_RANGE } from '../world/terrain.js'
import { COLORS, SUN_DIR, timeUniform } from '../world/shared.js'
import { NOISE_GLSL } from '../world/glsl.js'
import { QUALITY } from '../world/quality.js'

const OCEAN_SIZE = (QUALITY.fog[1] + 400) * 2

/** Strength of the ripple pattern on the water surface (1 = original). */
const RIPPLE_INTENSITY = 2.5

// Shared wave + seabed helpers. Swells displace the mesh; small ripples only
// perturb the shading normal so the mesh can stay coarse. Waves calm down in
// very shallow water so the shoreline does not crawl.
const COMMON = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uDepthMap;
  uniform float uBounds;
  float seabedAt(vec2 p) {
    vec2 uv = (p + uBounds) / (2.0 * uBounds);
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return ${SEA_FLOOR.toFixed(1)};
    return texture2D(uDepthMap, uv).r * ${DEPTH_RANGE.toFixed(1)} + ${SEA_FLOOR.toFixed(1)};
  }
  float swell(vec2 p, vec2 d, float f, float s, float a) { return a * sin(dot(p, d) * f + uTime * s); }
  void addWave(inout vec2 g, vec2 p, vec2 d, float f, float s, float a) {
    g += d * (f * a * cos(dot(p, d) * f + uTime * s));
  }
`

const vertexShader = /* glsl */ `
  ${COMMON}
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float seabed = seabedAt(wp.xz);
    float calm = smoothstep(0.3, 6.0, -seabed);
    wp.y += calm * (swell(wp.xz, vec2(0.8, 0.6), 0.045, 0.9, 0.7)
                  + swell(wp.xz, vec2(-0.53, 0.85), 0.08, 1.3, 0.35)
                  + swell(wp.xz, vec2(0.95, -0.31), 0.14, 1.7, 0.15));
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  ${COMMON}
  ${NOISE_GLSL}
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uSun;
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  void main() {
    vec2 p = vWorld.xz;
    float dist = length(cameraPosition - vWorld);
    float seabed = seabedAt(p); // per-pixel lookup gives a crisp shoreline
    float depth = max(-seabed, 0.0);

    vec2 g = vec2(0.0);
    addWave(g, p, vec2(0.8, 0.6), 0.045, 0.9, 0.7);
    addWave(g, p, vec2(-0.53, 0.85), 0.08, 1.3, 0.35);
    addWave(g, p, vec2(0.95, -0.31), 0.14, 1.7, 0.15);
    // mid-scale chop: keeps the surface visibly moving from far away
    float farF = 1.0 - smoothstep(2500.0, 5000.0, dist);
    addWave(g, p, vec2(0.36, 0.93), 0.17, 1.9, 0.2 * farF);
    addWave(g, p, vec2(-0.97, 0.24), 0.26, 2.3, 0.13 * farF);
    addWave(g, p, vec2(0.7, -0.71), 0.38, 2.8, 0.08 * farF);
    float nearF = 1.0 - smoothstep(300.0, 2500.0, dist);
    addWave(g, p, vec2(0.2, 0.98), 0.62, 2.4, 0.05 * nearF);
    addWave(g, p, vec2(-0.9, 0.44), 0.93, 3.1, 0.035 * nearF);
    addWave(g, p, vec2(0.6, -0.8), 1.45, 3.7, 0.02 * nearF);
    g *= ${RIPPLE_INTENSITY.toFixed(2)};
    vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 V = normalize(cameraPosition - vWorld);

    // open-ocean colour drifts slowly over large distances
    float vary = vnoise(p * 0.0012 + uTime * 0.004) * 0.7 + vnoise(p * 0.004 - uTime * 0.01) * 0.3;
    vec3 col = mix(uDeep, uMid, 0.2 + 0.5 * vary);
    // shallow water from the real seabed depth (no glow ring around islands)
    float shallow = exp(-depth * 0.17);
    col = mix(col, uShallow, shallow * 0.6);

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    col *= 0.8 + 0.28 * max(dot(N, uSun), 0.0);
    col = mix(col, uSky, fresnel * 0.5);

    vec3 R = reflect(-V, N);
    float sd = max(dot(R, uSun), 0.0);
    col += vec3(1.0, 0.95, 0.86) * (pow(sd, 260.0) * 1.8 + pow(sd, 60.0) * 0.25 + pow(sd, 12.0) * 0.06);

    // thin, broken foam where the water meets the shore
    float fn = vnoise(p * 0.11 + uTime * 0.04) * 0.6 + vnoise(p * 0.37 - uTime * 0.06) * 0.4;
    float edge = depth + (fn - 0.5) * 0.7;
    float lap = 0.5 + 0.5 * sin(depth * 4.0 - uTime * 1.3 + fn * 4.0);
    float foam = (1.0 - smoothstep(0.0, 0.45, edge)) * 0.55 + (1.0 - smoothstep(0.2, 1.4, edge)) * smoothstep(0.7, 0.95, lap) * 0.3;
    foam *= smoothstep(0.25, 0.7, fn + 0.25) * (1.0 - smoothstep(300.0, 1200.0, dist));
    col = mix(col, vec3(0.93, 0.97, 1.0), clamp(foam, 0.0, 1.0));

    float alpha = mix(0.95, 0.3, shallow);
    alpha = max(mix(alpha, 1.0, fresnel * 0.8), foam);

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

function makeDepthTexture(depth) {
  const size = depth ? depth.size : 1
  const data = depth ? depth.data : new Uint8Array([0])
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

export default function Ocean({ depth }) {
  const segs = QUALITY.oceanSegments
  const group = useRef()

  const material = useMemo(() => {
    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uDeep: { value: new THREE.Color('#0b3d74') },
        uMid: { value: new THREE.Color('#1a6fb5') },
        uShallow: { value: new THREE.Color('#2b9cac') },
        uSky: { value: new THREE.Color(COLORS.horizon) },
        uSun: { value: SUN_DIR.clone() },
        uBounds: { value: WORLD_BOUNDS },
        uDepthMap: { value: null },
      },
    ])
    uniforms.uTime = timeUniform // shared object, updated once per frame
    return new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true, transparent: true })
  }, [])

  useEffect(() => {
    const tex = makeDepthTexture(depth)
    material.uniforms.uDepthMap.value = tex
    return () => tex.dispose()
  }, [depth, material])

  useFrame(({ camera }, delta) => {
    timeUniform.value += Math.min(delta, 0.1)
    // Keep the finite ocean centred under the camera, snapped to the grid
    // spacing so vertices stay stable (waves are computed in world space).
    const step = OCEAN_SIZE / segs
    group.current.position.set(Math.round(camera.position.x / step) * step, 0, Math.round(camera.position.z / step) * step)
  })

  return (
    <group ref={group}>
      <mesh rotation-x={-Math.PI / 2} material={material} renderOrder={1} frustumCulled={false}>
        <planeGeometry args={[OCEAN_SIZE, OCEAN_SIZE, segs, segs]} />
      </mesh>
      {/* deep sea floor, so open water reads as deep blue through the surface */}
      <mesh rotation-x={-Math.PI / 2} position-y={SEA_FLOOR - 0.3} frustumCulled={false}>
        <planeGeometry args={[OCEAN_SIZE, OCEAN_SIZE]} />
        <meshStandardMaterial color="#0d3b66" roughness={1} />
      </mesh>
    </group>
  )
}
