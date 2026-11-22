// Landmarks: the cloudy mountain and the two waterfalls. Each source model has
// its own "front", so orientation is measured from the geometry (where its high
// and low ground lie) and matched to the site's terrain, not guessed.
import * as THREE from 'three'
import { heightAt } from '../world/worldStore.js'

/** Centroids (x, z) of the highest and lowest fifths of a prototype's vertices. */
function slopeAxis(proto) {
  const ys = []
  const v = new THREE.Vector3()
  for (const part of proto.parts) {
    const p = part.geometry.attributes.position
    for (let i = 0; i < p.count; i += 7) ys.push([p.getY(i), p.getX(i), p.getZ(i)])
  }
  ys.sort((a, b) => a[0] - b[0])
  const n = Math.floor(ys.length / 5)
  const avg = (list) => list.reduce((s, q) => [s[0] + q[1] / list.length, s[1] + q[2] / list.length], [0, 0])
  void v
  return { low: avg(ys.slice(0, n)), high: avg(ys.slice(-n)), minY: ys[0][0], maxY: ys[ys.length - 1][0] }
}

function instance(proto, { x, y, z, yaw, scale, shadows = true }) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.rotation.y = yaw
  g.scale.setScalar(scale)
  for (const part of proto.parts) {
    const m = new THREE.Mesh(part.geometry, part.material)
    m.castShadow = shadows
    m.receiveShadow = true
    g.add(m)
  }
  return g
}

/** Yaw that turns model-space direction (dx, dz) into world direction (wx, wz). */
const alignYaw = (dx, dz, wx, wz) => Math.atan2(wx, wz) - Math.atan2(dx, dz)

/**
 * @returns { group, splashes: [{ x, y, z, yaw, scale }], obstacles }
 */
export function buildLandmarks(lib, layout) {
  const group = new THREE.Group()
  group.name = 'Landmarks'
  const splashes = []
  const obstacles = []

  // --- cloudy mountain on the island's other high ground; its clouds wrap the base
  const cloudyProto = lib.get('Cloudy_Mountain')
  if (layout.cloudy && cloudyProto) {
    const { x, z } = layout.cloudy
    const scale = 3.4
    const ground = Math.min(heightAt(x, z), heightAt(x + 60, z), heightAt(x - 60, z), heightAt(x, z + 60), heightAt(x, z - 60))
    group.add(instance(cloudyProto, { x, y: ground - 0.12 * cloudyProto.height * scale, z, yaw: 0.8, scale }))
    obstacles.push({ x, z, r: cloudyProto.radius * scale * 0.38 })
  }

  // --- waterfall falling from the sea cliffs into the ocean
  const cliffProto = lib.get('Waterfall_Cliff')
  if (layout.cliff && cliffProto) {
    const ax = slopeAxis(cliffProto)
    // the face points from the high (top) ground towards the low (foot) ground
    const yaw = alignYaw(ax.low[0] - ax.high[0], ax.low[1] - ax.high[1], Math.sin(layout.cliff.yaw), Math.cos(layout.cliff.yaw))
    const scale = Math.max(2, (layout.cliff.top + 6) / (ax.maxY - ax.minY))
    const g = instance(cliffProto, { x: layout.cliff.x, y: -6, z: layout.cliff.z, yaw, scale })
    group.add(g)
    // the falling water lands at the cliff foot, in the sea
    const foot = new THREE.Vector3(ax.low[0], 0, ax.low[1]).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiplyScalar(scale)
    splashes.push({ x: layout.cliff.x + foot.x, y: 0.3, z: layout.cliff.z + foot.z, yaw, scale: 2.2 })
  }

  // --- waterfall in the foothills: the scan's high side faces up the mountain slope
  const valleyProto = lib.get('Waterfall_Valley')
  if (layout.valley && valleyProto) {
    const ax = slopeAxis(valleyProto)
    const v = layout.valley
    const downX = Math.sin(v.yaw)
    const downZ = Math.cos(v.yaw)
    const yaw = alignYaw(ax.low[0] - ax.high[0], ax.low[1] - ax.high[1], downX, downZ)
    const scale = 2.4
    // rest the scan's low end on the ground below the drop
    const lowWorld = new THREE.Vector3(ax.low[0], 0, ax.low[1]).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiplyScalar(scale)
    const y = heightAt(v.x + lowWorld.x, v.z + lowWorld.z) - ax.minY * scale - 1.2
    group.add(instance(valleyProto, { x: v.x, y, z: v.z, yaw, scale }))
    obstacles.push({ x: v.x, z: v.z, r: valleyProto.radius * scale * 0.3 })
  }

  return { group, splashes, obstacles }
}
