// Renders the placement plan with instancing. Instances are grouped into
// spatial chunks per category; each chunk holds one InstancedMesh per
// prototype part. Chunks switch between the detailed model (near), a cheap
// stand-in (far) and nothing, by distance to the camera: a simple, robust
// level-of-detail scheme that also keeps draw calls in check.
import * as THREE from 'three'
import { CATEGORIES, PROTOTYPES } from './environmentConfig.js'

const m4 = new THREE.Matrix4()
const q = new THREE.Quaternion()
const e = new THREE.Euler()
const p = new THREE.Vector3()
const s = new THREE.Vector3()

function instanceMatrix(inst, scale, out) {
  e.set(inst.tiltX, inst.rotY, inst.tiltZ, 'YXZ')
  q.setFromEuler(e)
  p.set(inst.x, inst.y, inst.z)
  s.setScalar(scale)
  return out.compose(p, q, s)
}

function buildMeshes(items, byKey, lib, shadows, kind, farLimit) {
  for (const [key, list] of byKey) {
    const [name, dist] = key.split('|')
    const proto = lib.get(name)
    if (!proto) continue
    for (const part of proto.parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length)
      list.forEach(({ inst, scale }, i) => mesh.setMatrixAt(i, instanceMatrix(inst, scale, m4)))
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      mesh.castShadow = shadows
      mesh.receiveShadow = true
      mesh.name = name
      mesh.visible = false
      items.push({ mesh, kind, dist: Number(dist), far: farLimit })
    }
  }
}

export class ScatterField {
  constructor(instances, lib) {
    this.group = new THREE.Group()
    this.group.name = 'Environment'
    this.chunks = []
    const buckets = new Map()
    for (const inst of instances) {
      const cat = CATEGORIES[inst.category]
      const cx = Math.floor(inst.x / cat.chunk)
      const cz = Math.floor(inst.z / cat.chunk)
      const key = `${inst.category}|${cx}|${cz}`
      if (!buckets.has(key)) {
        buckets.set(key, { cat, center: new THREE.Vector3((cx + 0.5) * cat.chunk, 0, (cz + 0.5) * cat.chunk), near: new Map(), far: new Map(), ySum: 0, n: 0 })
      }
      const b = buckets.get(key)
      b.ySum += inst.y
      b.n++
      const nearDist = PROTOTYPES[inst.name]?.near ?? cat.near
      const nk = `${inst.name}|${nearDist}`
      if (!b.near.has(nk)) b.near.set(nk, [])
      b.near.get(nk).push({ inst, scale: inst.scale })
      // far stand-in, scaled to the same height as the detailed model
      if (inst.far && cat.far > 0) {
        const near = lib.get(inst.name)
        const far = lib.get(inst.far)
        if (near && far) {
          const fk = `${inst.far}|${nearDist}`
          if (!b.far.has(fk)) b.far.set(fk, [])
          b.far.get(fk).push({ inst, scale: (inst.scale * near.height) / far.height })
        }
      }
    }
    this.stats = { chunks: buckets.size, instances: instances.length, meshes: 0 }
    for (const b of buckets.values()) {
      b.center.y = b.ySum / b.n
      const items = []
      buildMeshes(items, b.near, lib, b.cat.shadows, 'near', b.cat.far)
      buildMeshes(items, b.far, lib, false, 'far', b.cat.far)
      for (const it of items) this.group.add(it.mesh)
      this.stats.meshes += items.length
      this.chunks.push({ center: b.center, items, halfDiag: b.cat.chunk * 0.71 })
    }
    this.lastUpdate = new THREE.Vector3(Infinity, 0, 0)
  }

  /** Distance-based visibility; cheap, but only re-run after the camera moves a little. */
  update(camera) {
    if (this.lastUpdate.distanceToSquared(camera.position) < 4) return
    this.lastUpdate.copy(camera.position)
    for (const c of this.chunks) {
      const d = Math.max(0, c.center.distanceTo(camera.position) - c.halfDiag)
      // each mesh has its own detail distance; stand-ins take over beyond it
      for (const it of c.items) it.mesh.visible = it.kind === 'near' ? d < it.dist : d >= it.dist && d < it.far
    }
  }

  /** Rough count of triangles currently set visible (for diagnostics). */
  visibleTriangles(lib) {
    let t = 0
    this.group.traverse((o) => {
      if (o.isInstancedMesh && o.visible) t += (o.geometry.index.count / 3) * o.count
    })
    void lib
    return t
  }

  dispose() {
    this.group.traverse((o) => o.isInstancedMesh && o.dispose())
  }
}

export const prototypeCategory = (name) => PROTOTYPES[name]?.category
