// Terrain material: MeshStandardMaterial extended with per-pixel ground cover.
// Sand uses the downloaded sand-dune texture (tiled), grassland and rock are
// blended in by the per-vertex masks computed in the generator, with procedural
// detail so large areas don't look flat. A wet band follows the tide line and
// the seabed fades to deep water. Lit by the scene lights, so it follows the
// day-night cycle.
import * as THREE from 'three'
import { NOISE_GLSL } from './glsl.js'
import { timeUniform } from './shared.js'

const VERT_PARS = /* glsl */ `
  attribute vec2 aMask;
  varying vec2 vMask;
  varying vec3 vTWorld;
`
const VERT_MAIN = /* glsl */ `
  vTWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vMask = aMask;
`

const FRAG_PARS = /* glsl */ `
  varying vec2 vMask;
  varying vec3 vTWorld;
  uniform float uTime;
  uniform vec3 uSeabed;
  uniform vec3 uSandTint;
  uniform vec3 uGrassA;
  uniform vec3 uGrassB;
  uniform vec3 uGrassDry;
  uniform vec3 uRock;
  uniform sampler2D uSandMap;
  ${NOISE_GLSL}
`

const FRAG_MAIN = /* glsl */ `
  {
    float h = vTWorld.y;
    vec2 p = vTWorld.xz;
    float camD = length(cameraPosition - vTWorld);
    float nearF = 1.0 - smoothstep(250.0, 1100.0, camD); // fade fine detail with distance (no shimmer)
    float macro = vnoise(p * 0.008) * 0.6 + vnoise(p * 0.03) * 0.4;
    float fine = mix(0.5, vnoise(p * 0.21) * 0.55 + vnoise(p * 0.8) * 0.45, nearF);

    // sand: grain from the downloaded dune texture (as brightness detail, two
    // scales to hide tiling) over a pale beach tint
    vec3 sandTex = texture2D(uSandMap, p / 7.0).rgb * 0.6 + texture2D(uSandMap, p / 29.0 + 0.31).rgb * 0.4;
    float grain = dot(sandTex, vec3(0.299, 0.587, 0.114)) / 0.42;
    vec3 sand = uSandTint * mix(1.0, clamp(0.72 + 0.32 * grain, 0.75, 1.12), 0.35 + 0.65 * nearF) * (0.93 + 0.1 * macro);

    // grass: two greens with dry patches
    vec3 grass = mix(uGrassA, uGrassB, smoothstep(0.3, 0.75, macro));
    grass = mix(grass, uGrassDry, smoothstep(0.55, 0.85, vnoise(p * 0.004 + 7.0)) * 0.55);
    grass *= 0.8 + 0.35 * fine; // clumpy, uneven turf rather than a flat lawn

    vec3 rock = uRock * (0.75 + 0.45 * fine) * (0.9 + 0.2 * macro);

    float g = smoothstep(0.15, 0.85, vMask.x + (fine - 0.5) * 0.35);
    float r = smoothstep(0.2, 0.8, vMask.y + (fine - 0.5) * 0.25);
    vec3 col = mix(sand, grass, g);
    col = mix(col, rock, r);
    col *= diffuseColor.rgb; // baked ambient-occlusion shade

    // wet sand band that follows a gentle tide
    float tide = 0.18 * sin(uTime * 0.6 + p.x * 0.02 + p.y * 0.015);
    float wet = 1.0 - smoothstep(0.0, 0.7, h - tide);
    col *= mix(1.0, 0.72, wet);

    // seabed fades to deep water colour
    col = mix(col, uSeabed, smoothstep(-1.5, -16.0, h));
    diffuseColor.rgb = col;
  }
`

const loader = new THREE.TextureLoader()
let sandMap = null
function getSandMap() {
  if (sandMap) return sandMap
  sandMap = loader.load(import.meta.env.BASE_URL + 'assets/environment/sand/sand_albedo.webp')
  sandMap.wrapS = sandMap.wrapT = THREE.MirroredRepeatWrapping // seamless tiling of the cropped patch
  sandMap.colorSpace = THREE.SRGBColorSpace
  sandMap.anisotropy = 4
  return sandMap
}

export function createTerrainMaterial() {
  const uniforms = {
    uTime: timeUniform,
    uSeabed: { value: new THREE.Color('#1d5a7c') },
    uSandTint: { value: new THREE.Color('#e6d2a0') },
    uGrassA: { value: new THREE.Color('#6a8a44') },
    uGrassB: { value: new THREE.Color('#47683a') },
    uGrassDry: { value: new THREE.Color('#9c9457') },
    uRock: { value: new THREE.Color('#7d756c') },
    uSandMap: { value: getSandMap() },
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${VERT_MAIN}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_MAIN}`)
  }
  mat.customProgramCacheKey = () => 'island-terrain-v3'
  return mat
}
