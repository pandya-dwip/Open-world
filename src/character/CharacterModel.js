// Builds the player character from Three.js geometry, following the reference
// sheets in Assets/: messy dark-brown hair, brown eyes, open dark-green field
// jacket with tan piping and rolled sleeves, cream V-neck shirt, brown belt
// with pouch and pocket watch, charcoal cargo pants, brown lace-up boots,
// dark fingerless gloves and a brown leather backpack.
//
// The model faces +Z; its left side is +X. Every movable part hangs from a
// joint (THREE.Group) placed at the real pivot: hips, spine, neck, head,
// shoulders, elbows, wrists, hips, knees and ankles.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MATERIALS as M } from './CharacterMaterials.js'

/** Rest height of the hip joint above the soles, in metres. */
export const HIP_HEIGHT = 0.94

function mesh(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(...pos)
  m.rotation.set(...rot)
  m.scale.set(...scale)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function joint(name, parent, pos) {
  const g = new THREE.Group()
  g.name = name
  g.position.set(...pos)
  parent.add(g)
  return g
}

// ---------- shared geometries (created once) ----------
const G = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  sphereLow: new THREE.SphereGeometry(1, 10, 8),
  capsule: (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14),
  rbox: (w, h, d, r = 0.01) => new RoundedBoxGeometry(w, h, d, 2, r),
  box: new THREE.BoxGeometry(1, 1, 1),
}

/** Open-front cylinder (jacket body / collar), gap centred on +Z. */
const openCylinder = (rTop, rBot, h, gap) =>
  new THREE.CylinderGeometry(rTop, rBot, h, 28, 1, true, gap / 2, Math.PI * 2 - gap)

/** Upper dome with an open front (jacket / shirt shoulders). */
const openDome = (r, gap) =>
  new THREE.SphereGeometry(r, 28, 10, Math.PI / 2 + gap / 2, Math.PI * 2 - gap, 0, Math.PI / 2)

// ---------- hair: one merged mesh of a cap plus spiky locks ----------
function buildHairGeometry() {
  const parts = []
  // cap over the crown, and a back piece reaching the nape
  parts.push(new THREE.SphereGeometry(0.126, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(0.97, 1.05, 1.04).translate(0, 0.012, -0.006))
  parts.push(new THREE.SphereGeometry(0.124, 24, 14, Math.PI - 0.35, Math.PI + 0.7, 0.2, Math.PI * 0.62).scale(0.98, 1.02, 1.04).translate(0, 0.0, -0.012))

  const up = new THREE.Vector3(0, 1, 0)
  const q = new THREE.Quaternion()
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const lock = (origin, dir, len, rad, tilt = 0) => {
    const d = new THREE.Vector3(...dir).normalize()
    const cone = new THREE.ConeGeometry(rad, len, 6, 1)
    cone.translate(0, len / 2, 0)
    q.setFromUnitVectors(up, d)
    cone.applyQuaternion(q)
    if (tilt) cone.rotateY(tilt)
    cone.translate(...origin)
    parts.push(cone)
  }
  // messy, chunky locks swept back and to the sides (not standing straight up)
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.3
    const el = 0.3 + rand() * 0.95 // elevation of the root on the cap
    const x = Math.cos(a) * Math.cos(el) * 0.105
    const z = Math.sin(a) * Math.cos(el) * 0.105 - 0.01
    const y = Math.sin(el) * 0.11 + 0.02
    if (z > 0.05 && y < 0.1) continue // keep the forehead clear for the fringe
    // locks near the crown lie back over the head; lower ones flick outwards
    const dir = [x * 2.2 + (rand() - 0.5) * 0.06, 0.02 + rand() * 0.035 - (1 - Math.sin(el)) * 0.05, z * 1.6 - 0.15]
    lock([x, y, z], dir, 0.065 + rand() * 0.045, 0.032 + rand() * 0.012)
  }
  // a couple of stray tufts on the crown, as in the reference
  lock([0.01, 0.125, 0.02], [0.3, 0.7, -0.9], 0.05, 0.02)
  lock([-0.03, 0.12, -0.01], [-0.35, 0.6, -1], 0.05, 0.02)
  // fringe: locks falling over the forehead, swept slightly to one side
  const fringe = [
    [-0.06, 0.09, 0.085, -0.25, 0.08],
    [-0.025, 0.1, 0.095, -0.1, 0.095],
    [0.012, 0.1, 0.097, 0.05, 0.09],
    [0.045, 0.095, 0.09, 0.2, 0.085],
    [0.075, 0.08, 0.075, 0.35, 0.07],
  ]
  for (const [x, y, z, side, len] of fringe) lock([x, y, z], [side, -1, 0.35], len, 0.026)
  // side locks over the temples and ears
  for (const s of [1, -1]) {
    lock([s * 0.1, 0.05, 0.03], [s * 0.25, -1, 0.15], 0.085, 0.028)
    lock([s * 0.11, 0.02, -0.03], [s * 0.3, -1, -0.1], 0.08, 0.03)
  }
  // nape: short locks pointing down and back
  for (let i = -2; i <= 2; i++) lock([i * 0.035, -0.02, -0.1], [i * 0.15, -1, -0.45], 0.075, 0.028)

  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    g.deleteAttribute('uv')
    return g
  }))
  merged.computeVertexNormals()
  return merged
}

function buildHead(head) {
  // skull + tapered jaw, slightly anime proportions
  head.add(mesh(G.sphere, M.skin, [0, 0.11, 0], [0, 0, 0], [0.102, 0.118, 0.11]))
  head.add(mesh(G.sphere, M.skin, [0, 0.06, 0.018], [0, 0, 0], [0.08, 0.085, 0.085]))
  // ears
  for (const s of [1, -1]) head.add(mesh(G.sphereLow, M.skin, [s * 0.1, 0.1, 0], [0, 0, 0], [0.013, 0.026, 0.021]))

  // eyes: white, brown iris, dark pupil, highlight, upper lash line
  for (const s of [1, -1]) {
    const eye = new THREE.Group()
    eye.position.set(s * 0.04, 0.112, 0.094)
    eye.rotation.y = s * 0.28
    eye.add(mesh(G.sphereLow, M.eyeWhite, [0, 0, 0], [0, 0, 0], [0.025, 0.019, 0.008]))
    eye.add(mesh(G.sphereLow, M.eyeIris, [0, -0.001, 0.005], [0, 0, 0], [0.0135, 0.017, 0.005]))
    eye.add(mesh(G.sphereLow, M.eyeDark, [0, -0.001, 0.008], [0, 0, 0], [0.007, 0.009, 0.003]))
    eye.add(mesh(G.sphereLow, M.eyeShine, [s * -0.005, 0.006, 0.0105], [0, 0, 0], [0.0036, 0.0036, 0.0015]))
    eye.add(mesh(G.box, M.brow, [0, 0.019, 0.006], [0, 0, s * -0.08], [0.054, 0.005, 0.006]))
    head.add(eye)
    // eyebrow: straight and slightly angled (calm, determined look)
    head.add(mesh(G.box, M.brow, [s * 0.042, 0.148, 0.097], [0, s * 0.28, s * 0.12], [0.045, 0.008, 0.008]))
  }
  // nose and mouth
  head.add(mesh(new THREE.ConeGeometry(0.011, 0.028, 4), M.skin, [0, 0.083, 0.108], [Math.PI * 0.58, 0, 0]))
  head.add(mesh(G.box, M.mouth, [0, 0.047, 0.101], [0, 0, 0], [0.028, 0.004, 0.004]))
  // hair
  head.add(mesh(buildHairGeometry(), M.hair, [0, 0.11, 0]))
}

function buildTorso(spine) {
  // cream V-neck shirt underneath the open jacket
  spine.add(mesh(new THREE.CylinderGeometry(0.152, 0.14, 0.46, 24, 1, true), M.shirt, [0, 0.23, 0], [0, 0, 0], [1, 1, 0.66]))
  spine.add(mesh(new THREE.SphereGeometry(0.152, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.shirt, [0, 0.46, 0], [0, 0, 0], [1, 0.42, 0.66]))
  spine.add(mesh(new THREE.ConeGeometry(0.032, 0.1, 3), M.skin, [0, 0.455, 0.096], [Math.PI, 0, 0], [1, 1, 0.25])) // V-neck opening

  // open jacket: body, shoulders and stand-up collar
  const gap = 0.62
  spine.add(mesh(openCylinder(0.178, 0.168, 0.52, gap), M.jacket, [0, 0.2, 0], [0, 0, 0], [1, 1, 0.72]))
  spine.add(mesh(openDome(0.178, gap), M.jacket, [0, 0.46, 0], [0, 0, 0], [1, 0.4, 0.72]))
  spine.add(mesh(openCylinder(0.088, 0.072, 0.085, 0.75), M.jacket, [0, 0.52, 0.0], [-0.08, 0, 0], [1, 1, 0.92]))
  // hem band
  spine.add(mesh(openCylinder(0.17, 0.17, 0.035, gap), M.jacketDark, [0, -0.045, 0], [0, 0, 0], [1, 1, 0.73]))

  // tan piping down both front edges, on the chest pockets and the slanted hand pockets
  const edgeX = 0.178 * Math.sin(gap / 2)
  const edgeZ = 0.178 * Math.cos(gap / 2) * 0.72
  for (const s of [1, -1]) {
    spine.add(mesh(G.box, M.piping, [s * edgeX, 0.2, edgeZ + 0.003], [0, 0, 0], [0.008, 0.5, 0.006]))
    // chest pocket with flap
    const px = s * 0.095
    const pz = 0.128 * Math.sqrt(1 - (px / 0.178) ** 2) + 0.004
    spine.add(mesh(G.rbox(0.07, 0.06, 0.012, 0.004), M.jacketDark, [px, 0.33, pz], [0, s * 0.42, 0]))
    spine.add(mesh(G.box, M.piping, [px, 0.36, pz + 0.006], [0, s * 0.42, 0], [0.072, 0.006, 0.004]))
    // slanted hand-warmer pocket
    spine.add(mesh(G.box, M.piping, [s * 0.11, 0.08, 0.1], [0, s * 0.5, s * 0.55], [0.006, 0.09, 0.004]))
  }

  // backpack (on the back, -Z)
  const pack = new THREE.Group()
  pack.position.set(0, 0.22, -0.2)
  pack.add(mesh(G.rbox(0.3, 0.34, 0.15, 0.045), M.pack))
  pack.add(mesh(G.rbox(0.31, 0.15, 0.165, 0.04), M.packDark, [0, 0.12, -0.004]))
  pack.add(mesh(G.rbox(0.2, 0.13, 0.07, 0.025), M.pack, [0, -0.06, -0.095]))
  pack.add(mesh(G.rbox(0.19, 0.04, 0.075, 0.015), M.packDark, [0, 0.0, -0.098])) // pocket flap
  for (const s of [1, -1]) {
    pack.add(mesh(G.rbox(0.055, 0.13, 0.095, 0.02), M.pack, [s * 0.17, -0.05, 0]))
    // buckle straps on flap and pocket
    pack.add(mesh(G.box, M.leatherDark, [s * 0.06, 0.06, -0.085], [0, 0, 0], [0.022, 0.13, 0.006]))
    pack.add(mesh(G.box, M.metal, [s * 0.06, 0.0, -0.09], [0, 0, 0], [0.026, 0.018, 0.006]))
  }
  pack.add(mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 14, Math.PI), M.leatherDark, [0, 0.19, 0]))
  spine.add(pack)

  // shoulder straps: arc over each shoulder, then down the front of the chest
  for (const s of [1, -1]) {
    spine.add(mesh(new THREE.TorusGeometry(0.105, 0.012, 6, 16, Math.PI), M.leather, [s * 0.115, 0.4, -0.03], [0, Math.PI / 2, 0], [1, 0.75, 1.05]))
    spine.add(mesh(G.box, M.leather, [s * 0.128, 0.3, 0.09], [0.05, s * 0.55, 0], [0.032, 0.2, 0.01]))
  }

  // collarbones / neck
  return spine
}

function buildPelvis(hips) {
  hips.add(mesh(new THREE.CylinderGeometry(0.146, 0.152, 0.17, 24), M.pants, [0, -0.03, 0], [0, 0, 0], [1, 1, 0.74]))
  // belt with buckle
  hips.add(mesh(new THREE.CylinderGeometry(0.153, 0.153, 0.045, 24, 1, true), M.leather, [0, 0.04, 0], [0, 0, 0], [1, 1, 0.75]))
  hips.add(mesh(G.rbox(0.05, 0.036, 0.012, 0.004), M.metal, [0, 0.04, 0.116]))
  // belt pouch on the left hip
  hips.add(mesh(G.rbox(0.06, 0.08, 0.045, 0.012), M.leatherDark, [0.155, -0.005, 0.03], [0, 0.4, 0]))
  // pocket watch on a strap and chain, hanging at the left front
  hips.add(mesh(G.box, M.leather, [0.1, -0.03, 0.115], [0, 0, 0.35], [0.018, 0.12, 0.006]))
  const watch = new THREE.Group()
  watch.position.set(0.125, -0.12, 0.12)
  watch.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 20), M.watchGold, [0, 0, 0], [Math.PI / 2, 0, 0]))
  watch.add(mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.004, 20), M.watchFace, [0, 0, 0.007], [Math.PI / 2, 0, 0]))
  watch.add(mesh(G.box, M.eyeDark, [0, 0.006, 0.0095], [0, 0, 0], [0.002, 0.014, 0.001]))
  watch.add(mesh(G.box, M.eyeDark, [0.005, 0, 0.0095], [0, 0, 0], [0.01, 0.002, 0.001]))
  watch.add(mesh(new THREE.TorusGeometry(0.008, 0.0025, 4, 10), M.watchGold, [0, 0.035, 0]))
  hips.add(watch)
}

function buildArm(spine, side) {
  const s = side === 'l' ? 1 : -1
  const shoulder = joint(`${side}Shoulder`, spine, [s * 0.195, 0.43, -0.005])
  shoulder.add(mesh(G.sphere, M.jacket, [-s * 0.008, -0.02, 0], [0, 0, 0], [0.06, 0.06, 0.062]))
  shoulder.add(mesh(G.capsule(0.054, 0.2), M.jacket, [0, -0.15, 0]))
  if (s === 1) shoulder.add(mesh(G.rbox(0.014, 0.07, 0.055, 0.004), M.jacketDark, [0.052, -0.12, 0])) // sleeve pocket
  const elbow = joint(`${side}Elbow`, shoulder, [0, -0.29, 0])
  // rolled sleeve, bare forearm, glove cuff
  elbow.add(mesh(G.capsule(0.052, 0.05), M.jacket, [0, -0.02, 0]))
  elbow.add(mesh(new THREE.TorusGeometry(0.047, 0.016, 8, 16), M.jacketDark, [0, -0.085, 0], [Math.PI / 2, 0, 0]))
  elbow.add(mesh(G.capsule(0.037, 0.11), M.skin, [0, -0.16, 0]))
  elbow.add(mesh(new THREE.CylinderGeometry(0.043, 0.04, 0.055, 14), M.glove, [0, -0.225, 0]))
  const wrist = joint(`${side}Wrist`, elbow, [0, -0.255, 0])
  // fingerless glove: palm and knuckles in glove leather, fingertips bare
  wrist.add(mesh(G.sphere, M.glove, [0, -0.045, 0.004], [0, 0, 0], [0.024, 0.05, 0.042]))
  wrist.add(mesh(G.rbox(0.028, 0.04, 0.062, 0.01), M.glove, [0, -0.09, 0.006]))
  wrist.add(mesh(G.rbox(0.024, 0.03, 0.058, 0.01), M.skin, [-s * 0.002, -0.122, 0.008], [0.1, 0, 0]))
  wrist.add(mesh(G.capsule(0.011, 0.03), M.glove, [-s * 0.012, -0.06, 0.04], [0.6, 0, s * 0.3]))
  return { shoulder, elbow, wrist }
}

function buildLeg(hips, side) {
  const s = side === 'l' ? 1 : -1
  const hip = joint(`${side}Hip`, hips, [s * 0.09, -0.04, 0])
  hip.add(mesh(G.capsule(0.074, 0.3), M.pants, [0, -0.2, 0]))
  hip.add(mesh(G.rbox(0.022, 0.12, 0.085, 0.008), M.pantsDark, [s * 0.072, -0.25, 0])) // cargo pocket
  hip.add(mesh(G.box, M.pantsDark, [s * 0.084, -0.19, 0], [0, 0, 0], [0.004, 0.006, 0.08])) // pocket flap seam
  const knee = joint(`${side}Knee`, hip, [0, -0.42, 0])
  knee.add(mesh(G.capsule(0.058, 0.24), M.pants, [0, -0.15, 0]))
  // boot shaft with padded collar and laces
  knee.add(mesh(new THREE.CylinderGeometry(0.064, 0.066, 0.16, 16), M.boot, [0, -0.315, 0.004]))
  knee.add(mesh(new THREE.TorusGeometry(0.063, 0.011, 6, 18), M.bootDark, [0, -0.238, 0.004], [Math.PI / 2, 0, 0]))
  for (let i = 0; i < 4; i++) {
    knee.add(mesh(G.box, M.lace, [0, -0.26 - i * 0.03, 0.068], [0, 0, (i % 2 ? 1 : -1) * 0.5], [0.045, 0.006, 0.006]))
  }
  const ankle = joint(`${side}Ankle`, knee, [0, -0.39, 0])
  ankle.add(mesh(G.rbox(0.105, 0.09, 0.22, 0.035), M.boot, [0, -0.035, 0.04]))
  ankle.add(mesh(G.sphere, M.boot, [0, -0.045, 0.13], [0, 0, 0], [0.054, 0.042, 0.06]))
  ankle.add(mesh(G.rbox(0.114, 0.026, 0.26, 0.01), M.sole, [0, -0.077, 0.045]))
  for (let i = 0; i < 3; i++) ankle.add(mesh(G.box, M.lace, [0, 0.008 - i * 0.012, 0.075 + i * 0.022], [0.5, 0, 0], [0.05, 0.006, 0.006]))
  return { hip, knee, ankle }
}

/**
 * Build a new character. Returns the root group (feet at y = 0) and its joints.
 * Body-part meshes reuse shared geometries and materials.
 */
export function createCharacter() {
  const root = new THREE.Group()
  root.name = 'PlayerCharacter'
  const hips = joint('hips', root, [0, HIP_HEIGHT, 0])
  buildPelvis(hips)
  const spine = joint('spine', hips, [0, 0.04, 0])
  buildTorso(spine)
  const neck = joint('neck', spine, [0, 0.47, 0])
  neck.add(mesh(G.capsule(0.047, 0.07), M.skin, [0, 0.05, 0]))
  const head = joint('head', neck, [0, 0.09, 0])
  buildHead(head)
  const la = buildArm(spine, 'l')
  const ra = buildArm(spine, 'r')
  const ll = buildLeg(hips, 'l')
  const rl = buildLeg(hips, 'r')

  const joints = {
    hips, spine, neck, head,
    lShoulder: la.shoulder, lElbow: la.elbow, lWrist: la.wrist,
    rShoulder: ra.shoulder, rElbow: ra.elbow, rWrist: ra.wrist,
    lHip: ll.hip, lKnee: ll.knee, lAnkle: ll.ankle,
    rHip: rl.hip, rKnee: rl.knee, rAnkle: rl.ankle,
  }
  return { root, joints }
}
