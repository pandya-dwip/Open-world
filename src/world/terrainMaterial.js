// Sand material: MeshStandardMaterial extended with procedural grain detail,
// a wet band along the waterline and a fade to seabed colour underwater.
// No textures are downloaded.
import * as THREE from 'three'
import { NOISE_GLSL } from './glsl.js'
import { timeUniform } from './shared.js'

const VERT_PARS = /* glsl */ `
  varying vec3 vTWorld;
`
const VERT_MAIN = /* glsl */ `
  vTWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`

const FRAG_PARS = /* glsl */ `
  varying vec3 vTWorld;
  uniform float uTime;
  uniform vec3 uSeabed;
  ${NOISE_GLSL}
`

const FRAG_MAIN = /* glsl */ `
  {
    float h = vTWorld.y;
    vec2 p = vTWorld.xz;
    float camD = length(cameraPosition - vTWorld);
    float nearF = 1.0 - smoothstep(250.0, 1100.0, camD); // fade fine detail with distance (no shimmer)

    float fine = vnoise(p * 0.19) * 0.55 + vnoise(p * 0.73) * 0.45;
    vec3 col = diffuseColor.rgb * (0.95 + 0.1 * mix(0.5, fine, nearF));

    // wet sand band that follows a gentle tide
    float tide = 0.18 * sin(uTime * 0.6 + p.x * 0.02 + p.y * 0.015);
    float wet = 1.0 - smoothstep(0.0, 0.7, h - tide);
    col *= mix(1.0, 0.74, wet);

    // seabed fades to deep water colour
    col = mix(col, uSeabed, smoothstep(-1.5, -16.0, h));

    diffuseColor.rgb = col;
  }
`

export function createTerrainMaterial() {
  const uniforms = {
    uTime: timeUniform,
    uSeabed: { value: new THREE.Color('#1d5a7c') },
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
  mat.customProgramCacheKey = () => 'sand-terrain'
  return mat
}
