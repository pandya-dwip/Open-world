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
    // newly added high-quality trees
    { file: 'trees/tree_gn.glb', key: () => 'Tree_GN', ratio: () => 0.45, error: 0.05 },
    { file: 'trees/treea.glb', key: () => 'Tree_A', ratio: () => 0.12, error: 0.06 },
    // leaf-card trees from the forest scenes: cheap, for distant / high ground
    { file: 'forest/a_forest_3_with_a_road_at_night_for_game.glb', key: firstOfEachKind('Forest_Card', ['2-1.1', '2-1.4', '2-1.7', '1-1.3', '1-1.0', '1-0.8']), ratio: () => 1 },
    { file: 'forest/the_landscape_is_a_forest_in_the_mountains.glb', key: (n, c, tris) => (tris === 106 ? `Mtn_Card_${Math.round(c[0] * 10)}_${Math.round(c[2] * 10)}` : null), ratio: () => 1 },
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
  mountains: [
    { file: 'mountains/peak_mountain_hiking_trail.glb', key: () => 'Mountain', ratio: () => 0.05, error: 0.08 },
    { file: 'mountains/cloudy_mountain.glb', key: () => 'Cloudy_Mountain', ratio: () => 0.3, error: 0.03 },
  ],
  houses: [
    { file: 'houses/tree_house_1.glb', key: () => 'TreeHouse_Cottage', ratio: () => 1 },
    { file: 'houses/treehouse_village.glb', key: () => 'TreeHouse_Village', ratio: () => 1 },
    { file: 'houses/treehouse2.glb', key: () => 'TreeHouse_Stilts', ratio: () => 1 },
    { file: 'houses/treehouse.glb', key: () => 'TreeHouse_Oak', ratio: () => 0.4, error: 0.03 },
    { file: 'houses/tree_house.glb', key: (n) => (n.startsWith('Sphere_Envi') ? null : 'TreeHouse_Pines'), ratio: () => 0.5, error: 0.03 },
    // the cabin and its surroundings from the diorama, without the diorama's ground block and pond
    { file: 'houses/diorama_-_forest_loner.glb', key: (n) => (/^(Water|GroundPlane|HillRock|WaterRock)/.test(n) ? null : 'Cabin'), ratio: () => 0.3, error: 0.03 },
    { file: 'houses/eco-house_diorama.glb', key: () => 'EcoHouse', ratio: () => 0.35, error: 0.03 },
    { file: 'locations/japan_temple.glb', key: () => 'Temple', ratio: () => 1 },
  ],
  waterfalls: [
    { file: 'waterfall/waterfall.glb', key: () => 'Waterfall_Cliff', ratio: () => 0.12, error: 0.02, lit: true },
    { file: 'waterfall/seljalandsfoss_waterfall_iceland__3d_scan.glb', key: () => 'Waterfall_Valley', ratio: () => 0.08, error: 0.02, lit: true },
  ],
}

/** Scans authored as "unlit" (baked lighting) become lit, so they follow the day-night cycle. */
function litMaterials(doc) {
  for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'KHR_materials_unlit') ext.dispose()
  for (const m of doc.getRoot().listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(0.95)
}

/** Picks one representative of each kind (material set + rounded height) from a scene of many small objects. */
function firstOfEachKind(prefix, wanted) {
  const chosen = new Map()
  return (name, c, tris, node) => {
    // the object is the node's group, unless the node sits directly in the big scene container
    const parent = node.getParentNode()
    const obj = parent && parent.listChildren().length < 20 ? parent : node
    const b = getBounds(obj)
    const mats = new Set()
    obj.traverse((n) => n.getMesh()?.listPrimitives().forEach((p) => mats.add(p.getMaterial()?.getName())))
    const kind = `${mats.size}-${(b.max[1] - b.min[1]).toFixed(1)}`
    if (!wanted.includes(kind)) return null
    if (!chosen.has(kind)) chosen.set(kind, obj)
    return chosen.get(kind) === obj ? `${prefix}_${kind.replace(/[.-]/g, '_')}` : null
  }
}

/** Texture size per kit (px); buildings have many textures and are seen from further away. */
const TEXTURE_SIZE = { houses: 512 }

const triCount = (mesh) => mesh.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? 0) / 3, 0)

async function extract(def) {
  const doc = await io.read(path.join(SRC, def.file))
  const root = doc.getRoot()
  if (root.listExtensionsUsed().some((e) => e.extensionName === KHRMaterialsPBRSpecularGlossiness.EXTENSION_NAME)) {
    await doc.transform(metalRough())
  }
  if (def.lit) litMaterials(doc)
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
    const key = def.key(name, centre, triCount(mesh), node)
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
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEXTURE_SIZE[name] ?? 1024, TEXTURE_SIZE[name] ?? 1024], quality: 82 }),
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

/**
 * Animated assets keep their structure and animation (morph targets, node
 * animation, skinning): only textures are resized and meshes compressed.
 */
const ANIMATED = {
  'ships/caravel.glb': { file: 'ships/caravel_ship.glb' },
  'ships/galleon.glb': { file: 'ships/empty_ship.glb', simplify: 0.35 },
  'ships/pinnace.glb': { file: 'ships/pirate_ship_rigged.glb', simplify: 0.35 },
  'water/ocean_wave.glb': { file: 'water/ocean_wave.glb' },
  'waterfalls/waterfall_splash.glb': { file: 'waterfall/looping_waterfall_objects_animation.glb', lit: false },
}
async function buildAnimated() {
  for (const [out, def] of Object.entries(ANIMATED)) {
    const doc = await io.read(path.join(SRC, def.file))
    // static ships only: simplify their (non-morph) meshes
    if (def.simplify) for (const m of doc.getRoot().listMeshes()) for (const prim of m.listPrimitives()) if (!prim.listTargets().length) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: def.simplify, error: 0.02 })
    await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
    fs.mkdirSync(path.dirname(path.join(OUT, out)), { recursive: true })
    await io.write(path.join(OUT, out), doc)
    console.log(`=> ${out}  ${(fs.statSync(path.join(OUT, out)).size / 1e6).toFixed(2)} MB, animations: ${doc.getRoot().listAnimations().map((a) => a.getName()).join(', ') || 'none'}`)
  }
}

/** Seamless mud-and-moss material for the walking paths (colour, normal, roughness). */
async function pathTextures() {
  const doc = await io.read(path.join(SRC, 'paths/puddled_mud_with_moss_-_pbr_seamless.glb'))
  const mat = doc.getRoot().listMaterials()[0]
  const maps = { albedo: mat.getBaseColorTexture(), normal: mat.getNormalTexture(), roughness: mat.getMetallicRoughnessTexture() }
  fs.mkdirSync(path.join(OUT, 'paths'), { recursive: true })
  for (const [k, tex] of Object.entries(maps)) {
    if (!tex) continue
    const out = path.join(OUT, `paths/mud_${k}.webp`)
    await sharp(Buffer.from(tex.getImage())).resize(1024, 1024, { fit: 'inside' }).webp({ quality: 85 }).toFile(out)
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
if (!only || only === 'animated') await buildAnimated()
if (!only || only === 'paths') await pathTextures()
