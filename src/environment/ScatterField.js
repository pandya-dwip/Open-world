// Renders the placement plan with instancing and two levels of detail.
//
//  - Detailed models live in small spatial chunks per category; a chunk is
//    drawn when the camera is within its detail distance.
//  - Cheap stand-ins (for models that have one) live in large cells, so the
//    whole distant forest costs only a few draw calls. When a small chunk shows
//    its detailed trees, exactly those trees' stand-ins are hidden (their
//    instance matrices are zeroed), so no tree is ever drawn twice.
import * as THREE from 'three'
import { CATEGORIES, PROTOTYPES } from './environmentConfig.js'

const FAR_CELL = 400
const m4 = new THREE.Matrix4()
const q = new THREE.Quaternion()
const e = new THREE.Euler()
const p = new THREE.Vector3()
const s = new THREE.Vector3()
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)

function instanceMatrix(inst, scale, out) {
  e.set(inst.tiltX, inst.rotY, inst.tiltZ, 'YXZ')
  q.setFromEuler(e)
  p.set(inst.x, inst.y, inst.z)
  s.setScalar(scale)
  return out.compose(p, q, s)
}

function makeMeshes(proto, list, shadows, name) {
  return proto.parts.map((part) => {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length)
    list.forEach((item, i) => mesh.setMatrixAt(i, instanceMatrix(item.inst, item.scale, m4)))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.castShadow = shadows
    mesh.receiveShadow = true
    mesh.name = name
    mesh.visible = false
    return mesh
  })
}

export class ScatterField {
  constructor(instances, lib) {
    this.group = new THREE.Group()
    this.group.name = 'Environment'
    this.chunks = []
    this.farCells = []
    const near = new Map() // small chunks with detailed models
    const far = new Map() // large cells with stand-ins
    for (const inst of instances) {
      const cat = CATEGORIES[inst.category]
      const cx = Math.floor(inst.x / cat.chunk)
      const cz = Math.floor(inst.z / cat.chunk)
      const key = `${inst.category}|${cx}|${cz}`
      if (!near.has(key)) near.set(key, { cat, center: new THREE.Vector3((cx + 0.5) * cat.chunk, 0, (cz + 0.5) * cat.chunk), protos: new Map(), ySum: 0, n: 0, farRefs: [] })
      const chunk = near.get(key)
      chunk.ySum += inst.y
      chunk.n++
      const nearDist = PROTOTYPES[inst.name]?.near ?? cat.near
      const nk = `${inst.name}|${nearDist}`
      if (!chunk.protos.has(nk)) chunk.protos.set(nk, [])
      chunk.protos.get(nk).push({ inst, scale: inst.scale })
      // stand-in, scaled to the height of the detailed model, in a large cell
      if (inst.far && cat.far > 0) {
        const nearProto = lib.get(inst.name)
        const farProto = lib.get(inst.far)
        if (!nearProto || !farProto) continue
        const fx = Math.floor(inst.x / FAR_CELL)
        const fz = Math.floor(inst.z / FAR_CELL)
        const fk = `${fx}|${fz}|${inst.far}|${cat.far}`
        if (!far.has(fk)) far.set(fk, { name: inst.far, maxDist: cat.far, center: new THREE.Vector3((fx + 0.5) * FAR_CELL, 0, (fz + 0.5) * FAR_CELL), list: [] })
        const cell = far.get(fk)
        chunk.farRefs.push({ cell, index: cell.list.length, nearDist })
        cell.list.push({ inst, scale: (inst.scale * nearProto.height) / farProto.height })
      }
    }

    for (const cell of far.values()) {
      cell.meshes = makeMeshes(lib.get(cell.name), cell.list, false, cell.name)
      cell.matrices = cell.list.map((it) => instanceMatrix(it.inst, it.scale, new THREE.Matrix4()))
      cell.halfDiag = FAR_CELL * 0.71
      cell.meshes.forEach((m) => this.group.add(m))
      this.farCells.push(cell)
    }
    for (const chunk of near.values()) {
      chunk.center.y = chunk.ySum / chunk.n
      const items = []
      for (const [key, list] of chunk.protos) {
        const [name, dist] = key.split('|')
        const proto = lib.get(name)
        if (!proto) continue
        for (const mesh of makeMeshes(proto, list, chunk.cat.shadows, name)) items.push({ mesh, dist: Number(dist) })
      }
      items.forEach((it) => this.group.add(it.mesh))
      this.chunks.push({ center: chunk.center, items, farRefs: chunk.farRefs, halfDiag: chunk.cat.chunk * 0.71, showingDetail: false })
    }
    this.stats = { chunks: this.chunks.length, farCells: this.farCells.length, instances: instances.length, meshes: this.group.children.length }
    this.lastUpdate = new THREE.Vector3(Infinity, 0, 0)
  }

  /** Distance-based visibility; only re-run after the camera moves a little. */
  update(camera) {
    if (this.lastUpdate.distanceToSquared(camera.position) < 4) return
    this.lastUpdate.copy(camera.position)
    const dirty = new Set()
    for (const c of this.chunks) {
      const d = Math.max(0, c.center.distanceTo(camera.position) - c.halfDiag)
      let detail = false
      for (const it of c.items) {
        it.mesh.visible = d < it.dist
        detail ||= it.mesh.visible
      }
      // hide / restore exactly this chunk's stand-ins
      if (detail !== c.showingDetail) {
        c.showingDetail = detail
        for (const ref of c.farRefs) {
          const mat = d < ref.nearDist ? ZERO : ref.cell.matrices[ref.index]
          for (const mesh of ref.cell.meshes) mesh.setMatrixAt(ref.index, mat)
          dirty.add(ref.cell)
        }
      }
    }
    for (const cell of dirty) for (const mesh of cell.meshes) mesh.instanceMatrix.needsUpdate = true
    for (const cell of this.farCells) {
      const d = Math.max(0, cell.center.distanceTo(camera.position) - cell.halfDiag)
      for (const mesh of cell.meshes) mesh.visible = d < cell.maxDist
    }
  }

  dispose() {
    this.group.traverse((o) => o.isInstancedMesh && o.dispose())
  }
}
