// Environment asset build: turns the raw downloads in Assets/environment-source/
// into small, web-ready "kits" in public/assets/environment/.
//
//   npm run build:env
//
// Each kit is a GLB whose top-level nodes are prototypes (one tree, one rock, ...),
// each with its base centred on the origin and in metres. The game instances them.
// Steps: spec/gloss -> metal/rough material conversion, prototype extraction,
// unit normalisation, mesh simplification, WebP textures (<= 1024 px) and meshopt
// compression. Also writes the mountain's height map for character collision.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO, Node } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRMaterialsPBRSpecularGlossiness } from '@gltf-transform/extensions'
import {
  dedup, getBounds, meshopt, metalRough, prune, quantize, simplifyPrimitive, textureCompress, weld, mergeDocuments, unpartition,
} from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'Assets/environment-source')
const OUT = path.join(ROOT, 'public/assets/environment')
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
await MeshoptEncoder.ready
await MeshoptSimplifier.ready

/**
 * Kit definitions. For every source file, `key(name, centre)` maps each mesh node
 * to a prototype name (or null to drop it); `ratio` is the fraction of triangles
 * kept by simplification (1 = untouched); `scale` converts to metres.
 */
const KITS = {
  rocks: [
    {
      file: 'rocks/stylised_rocks_asset_pack.glb',
      key: (n) => (/^(Plain|Mossy|Desert)_Rock/.test(n) ? n.replace(/_M_.*$/, '') : null),
      ratio: (k) => (/Group/.test(k) ? 0.3 : 1),
      error: 0.05,
    },
    { file: 'rocks/rocks.glb', key: () => 'Rock_Mound', ratio: () => 0.03, error: 0.05, onlyFirst: true },
  ],
  trees: [
    { file: 'trees/palm_trees.glb', key: (n) => (n.startsWith('Palm_tree_001') ? 'Palm_A' : 'Palm_B'), scale: 0.01, ratio: () => 0.3, error: 0.12 },
    {
      file: 'trees/trees_and_bush_pack_lowpoly.glb',
      key: (n) => n.replace(/_[^_]+_0$/, '').replace('Pine2_Trunk', 'Pine2').replace(/^Pine2$/, 'Pine2'),
      ratio: () => 1,
    },
    { file: 'trees/more_realistic_trees_free.glb', key: (n, c) => (c[0] < 0 ? 'Oak_A' : 'Oak_B'), ratio: () => 0.05, error: 0.12 },
    { file: 'trees/old_tree.glb', key: () => 'Old_Tree', ratio: () => 0.25 },
    {
      file: 'trees/pine_forest_at_sunset.glb',
      parentKey: true,
      key: (n) => {
        const m = n.match(/^(FlorasynthTree\.001|FlorasynthTree\.002|Ponderosa Pine seedling\.001|Ponderosa Pine seedling\.003)_(branches|foliage)/)
        return m ? m[1].replace('FlorasynthTree.', 'Pine_Tall_').replace('Ponderosa Pine seedling.', 'Pine_Young_') : null
      },
      ratio: (k, mat) => (/leaves|foliage/i.test(mat) ? 0.6 : 0.3),
    },
  ],
  grass: [
    {
      file: 'grass/grass.glb',
      key: (n) => (n.startsWith('Grass1_') ? 'Grass_Tuft' : n.startsWith('GrassAutumn3') ? 'Grass_Small' : n.startsWith('GrassLawnAutumn') ? 'Grass_Patch' : null),
      ratio: (k) => (k === 'Grass_Patch' ? 0.05 : 0.08),
      error: 0.25,
    },
    { file: 'grass/realistics_grass_06.glb', key: () => 'Grass_Clump', scale: 0.03, ratio: () => 0.08, error: 0.25 },
    {
      file: 'grass/scanned_plants_and_grass_free_download.glb',
      // only the plants that simplify well (the others are thousands of loose leaf cards)
      key: (n) => (['Object_6', 'Object_7', 'Object_15', 'Object_16'].includes(n) ? `Plant_${n.replace('Object_', '')}` : null),
      ratio: () => 0.05,
      error: 0.1,
    },
  ],
  mountains: [{ file: 'mountains/peak_mountain_hiking_trail.glb', key: () => 'Mountain', ratio: () => 0.08, error: 0.03 }],
}

const triCount = (mesh) => mesh.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? 0) / 3, 0)

async function extract(def) {
  const doc = await io.read(path.join(SRC, def.file))
  const root = doc.getRoot()
  if (root.listExtensionsUsed().some((e) => e.extensionName === KHRMaterialsPBRSpecularGlossiness.EXTENSION_NAME)) {
    await doc.transform(metalRough())
  }
  const scene = root.getDefaultScene() || root.listScenes()[0]
  const protos = new Map()
  const seen = new Set()
  scene.traverse((node) => {
    const mesh = node.getMesh()
    if (!mesh) return
    if (def.onlyFirst && seen.size) return
    const name = def.parentKey ? node.getParentNode()?.getName() || '' : mesh.getName() || node.getName()
    const b = getBounds(node)
    const centre = b.max.map((v, i) => (v + b.min[i]) / 2)
    const key = def.key(name, centre, triCount(mesh))
    if (!key) return
    seen.add(key)
    if (!protos.has(key)) protos.set(key, [])
    protos.get(key).push({ mesh, matrix: node.getWorldMatrix() })
  })

  // rebuild the scene: one top-level node per prototype, meshes with baked world matrices
  for (const child of scene.listChildren()) {
    child.traverse((n) => n !== child && n.dispose())
    child.dispose()
  }
  for (const [key, parts] of protos) {
    const proto = doc.createNode(key)
    for (const { mesh, matrix } of parts) proto.addChild(doc.createNode(mesh.getName()).setMesh(mesh).setMatrix(matrix))
    scene.addChild(proto)
  }
  await doc.transform(prune(), weld())

  // simplify per prototype
  for (const proto of scene.listChildren()) {
    for (const part of proto.listChildren()) {
      for (const prim of part.getMesh().listPrimitives()) {
        const ratio = def.ratio(proto.getName(), prim.getMaterial()?.getName() || '')
        if (ratio < 1) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: def.error ?? 0.02, lockBorder: false })
      }
    }
  }

  // normalise: metres, base centred on the origin
  const s = def.scale ?? 1
  for (const proto of scene.listChildren()) {
    const b = getBounds(proto)
    const cx = (b.min[0] + b.max[0]) / 2
    const cz = (b.min[2] + b.max[2]) / 2
    proto.setScale([s, s, s]).setTranslation([-cx * s, -b.min[1] * s, -cz * s])
  }
  return doc
}

/** Rasterise the mountain's top surface into a height map (prototype space, metres). */
function mountainHeightMap(doc, cell = 2) {
  const proto = doc.getRoot().getDefaultScene().listChildren()[0]
  const b = getBounds(proto)
  const nx = Math.ceil((b.max[0] - b.min[0]) / cell) + 1
  const nz = Math.ceil((b.max[2] - b.min[2]) / cell) + 1
  const h = new Float32Array(nx * nz).fill(-1)
  const v = [0, 0, 0]
  const tmp = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const part of proto.listChildren()) {
    const m = part.getWorldMatrix()
    for (const prim of part.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      const idx = prim.getIndices().getArray()
      for (let t = 0; t < idx.length; t += 3) {
        for (let k = 0; k < 3; k++) {
          pos.getElement(idx[t + k], v)
          const out = tmp[k]
          for (let r = 0; r < 3; r++) out[r] = m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r]
        }
        const [p0, p1, p2] = tmp
        const minX = Math.max(0, Math.floor((Math.min(p0[0], p1[0], p2[0]) - b.min[0]) / cell))
        const maxX = Math.min(nx - 1, Math.ceil((Math.max(p0[0], p1[0], p2[0]) - b.min[0]) / cell))
        const minZ = Math.max(0, Math.floor((Math.min(p0[2], p1[2], p2[2]) - b.min[2]) / cell))
        const maxZ = Math.min(nz - 1, Math.ceil((Math.max(p0[2], p1[2], p2[2]) - b.min[2]) / cell))
        const d = (p1[2] - p2[2]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[2] - p2[2])
        if (Math.abs(d) < 1e-9) continue
        for (let iz = minZ; iz <= maxZ; iz++) {
          for (let ix = minX; ix <= maxX; ix++) {
            const x = b.min[0] + ix * cell
            const z = b.min[2] + iz * cell
            const w0 = ((p1[2] - p2[2]) * (x - p2[0]) + (p2[0] - p1[0]) * (z - p2[2])) / d
            const w1 = ((p2[2] - p0[2]) * (x - p2[0]) + (p0[0] - p2[0]) * (z - p2[2])) / d
            const w2 = 1 - w0 - w1
            if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue
            const y = w0 * p0[1] + w1 * p1[1] + w2 * p2[1]
            const k = iz * nx + ix
            if (y > h[k]) h[k] = y
          }
        }
      }
    }
  }
  return { minX: b.min[0], minZ: b.min[2], cell, nx, nz, height: +(b.max[1] - b.min[1]).toFixed(2), data: h }
}

async function buildKit(name, defs) {
  let kit = null
  for (const def of defs) {
    const doc = await extract(def)
    const protos = doc.getRoot().getDefaultScene().listChildren().map((p) => p.getName())
    console.log(`  ${def.file}: ${protos.length} prototypes (${protos.slice(0, 8).join(', ')}${protos.length > 8 ? ', …' : ''})`)
    if (!kit) kit = doc
    else {
      const map = mergeDocuments(kit, doc)
      const main = kit.getRoot().getDefaultScene()
      for (const sc of kit.getRoot().listScenes()) {
        if (sc === main) continue
        for (const c of sc.listChildren()) main.addChild(c)
        sc.dispose()
      }
      void map
    }
  }
  if (name === 'mountains') {
    const hm = mountainHeightMap(kit)
    fs.writeFileSync(path.join(OUT, 'mountains/mountain-height.bin'), Buffer.from(hm.data.buffer))
    const { data, ...meta } = hm
    fs.writeFileSync(path.join(OUT, 'mountains/mountain-height.json'), JSON.stringify(meta))
  }
  await kit.transform(
    unpartition(),
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )
  const tris = kit.getRoot().listMeshes().reduce((t, m) => t + triCount(m), 0)
  const file = path.join(OUT, `${name}/${name}.glb`)
  await io.write(file, kit)
  console.log(`=> ${path.relative(ROOT, file)}  ${(fs.statSync(file).size / 1e6).toFixed(2)} MB, ${Math.round(tris).toLocaleString()} triangles (all prototypes)`)
}

/** Sand texture for the terrain, taken from the sand-dunes download. */
async function sandTextures() {
  const doc = await io.read(path.join(SRC, 'sand/sand_dunes.glb'))
  const mat = doc.getRoot().listMaterials()[0]
  const maps = { albedo: mat.getBaseColorTexture(), normal: mat.getNormalTexture() }
  fs.mkdirSync(path.join(OUT, 'sand'), { recursive: true })
  for (const [k, tex] of Object.entries(maps)) {
    if (!tex) continue
    // the source is a baked dune texture (dark blotches, UV seams); an even patch of
    // fine grain is cropped out and tiled with mirrored repeats in the terrain shader
    const out = path.join(OUT, `sand/sand_${k}.webp`)
    const img = sharp(Buffer.from(tex.getImage()))
    const { width } = await img.metadata()
    const c = Math.round(width / 1024)
    await img.extract({ left: 60 * c, top: 40 * c, width: 300 * c, height: 300 * c }).resize(512, 512).webp({ quality: 88 }).toFile(out)
    console.log(`=> ${path.relative(ROOT, out)}`)
  }
}

const only = process.argv[2]
for (const [name, defs] of Object.entries(KITS)) {
  if (only && only !== name) continue
  console.log(`\n[${name}]`)
  fs.mkdirSync(path.join(OUT, name), { recursive: true })
  await buildKit(name, defs)
}
if (!only || only === 'sand') await sandTextures()
