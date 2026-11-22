// Shared, cel-shaded materials for the character. Created once and reused by
// every body part, so the whole character costs only a handful of programs.
import * as THREE from 'three'
import { PALETTE } from './characterConfig.js'

// 4-step light ramp gives the anime "cel" look without any downloaded texture.
const ramp = new THREE.DataTexture(new Uint8Array([95, 150, 205, 240]), 4, 1, THREE.RedFormat)
ramp.minFilter = THREE.NearestFilter
ramp.magFilter = THREE.NearestFilter
ramp.generateMipmaps = false
ramp.needsUpdate = true

const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra })

export const MATERIALS = {
  skin: toon(PALETTE.skin),
  hair: toon(PALETTE.hair),
  eyeWhite: toon(PALETTE.eyeWhite),
  eyeIris: toon(PALETTE.eyeIris),
  eyeDark: new THREE.MeshBasicMaterial({ color: PALETTE.eyeDark }),
  eyeShine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  brow: new THREE.MeshBasicMaterial({ color: PALETTE.brow }),
  mouth: new THREE.MeshBasicMaterial({ color: PALETTE.mouth }),
  jacket: toon(PALETTE.jacket, { side: THREE.DoubleSide }),
  jacketDark: toon(PALETTE.jacketDark),
  piping: toon(PALETTE.piping),
  shirt: toon(PALETTE.shirt, { side: THREE.DoubleSide }),
  pants: toon(PALETTE.pants),
  pantsDark: toon(PALETTE.pantsDark),
  leather: toon(PALETTE.leather),
  leatherDark: toon(PALETTE.leatherDark),
  pack: toon(PALETTE.pack),
  packDark: toon(PALETTE.packDark),
  metal: toon(PALETTE.metal),
  boot: toon(PALETTE.boot),
  bootDark: toon(PALETTE.bootDark),
  sole: toon(PALETTE.sole),
  lace: toon(PALETTE.lace),
  glove: toon(PALETTE.glove),
  watchFace: toon(PALETTE.watchFace),
  watchGold: toon(PALETTE.watchGold),
}
