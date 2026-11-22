// Builds all terrain data off the main thread so the page stays responsive.
import { ISLANDS } from './islands.js'
import { buildDepthMap, computeShading, generateIslandGrid } from './terrain.js'
import { buildMountainField, combineMirrored, mountainSkirtSampler } from './mountainField.js'

self.onmessage = (e) => {
  const { terrainSpacing, depthSize, mountainHeightMap } = e.data
  // the terrain rises to meet the mountain model's edges
  if (mountainHeightMap) {
    const full = combineMirrored(mountainHeightMap)
    const field = buildMountainField(full)
    for (const island of ISLANDS) if (island.mountain) island.setMountainSkirt(mountainSkirtSampler(field, island.mountain, full.seamX))
  }
  const grids = []
  ISLANDS.forEach((island, index) => {
    const grid = generateIslandGrid(island, terrainSpacing)
    const { normals, colors, masks } = computeShading(island, grid)
    grids.push(grid)
    const heights = grid.heights.slice() // keep the original for the depth map
    self.postMessage(
      { type: 'island', index, grid: { ...grid, heights }, normals, colors, masks },
      [heights.buffer, normals.buffer, colors.buffer, masks.buffer, grid.inland.buffer],
    )
  })
  const depth = buildDepthMap(ISLANDS, grids, depthSize)
  self.postMessage({ type: 'depth', size: depthSize, data: depth }, [depth.buffer])
}
