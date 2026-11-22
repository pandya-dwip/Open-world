// Builds the explorer's animation file from the Universal Animation Library
// (Quaternius, CC0) in Assets/character-source/: only the clips the game uses,
// no mesh, redundant keyframes removed.
//
//   node scripts/build-character-animations.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, resample } from '@gltf-transform/functions'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'Assets/character-source/UAL1_Standard.glb')
const OUT = path.join(ROOT, 'public/assets/characters/explorer/animations/locomotion.glb')
const KEEP = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Swim_Fwd_Loop', 'Swim_Idle_Loop']

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const lib = await io.read(SRC)
for (const a of lib.getRoot().listAnimations()) if (!KEEP.includes(a.getName())) a.dispose()
for (const m of lib.getRoot().listMeshes()) m.dispose()
for (const n of lib.getRoot().listNodes()) if (n.getSkin()) n.setSkin(null)
for (const s of lib.getRoot().listSkins()) s.dispose()
await lib.transform(resample({ tolerance: 1e-4 }), prune({ keepLeaves: true }), dedup())
// drop keyframe data left behind by the discarded clips
const used = new Set()
for (const anim of lib.getRoot().listAnimations()) for (const smp of anim.listSamplers()) used.add(smp.getInput()).add(smp.getOutput())
for (const acc of lib.getRoot().listAccessors()) if (!used.has(acc)) acc.dispose()
await io.write(OUT, lib)
console.log(`${path.relative(ROOT, OUT)}: ${lib.getRoot().listAnimations().map((a) => a.getName()).join(', ')} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`)
