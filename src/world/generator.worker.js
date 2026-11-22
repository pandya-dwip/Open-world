// Builds all terrain data off the main thread so the page stays responsive.
import { ISLANDS } from './islands.js'
import { buildDepthMap, computeShading, generateIslandGrid } from './terrain.js'

self.onmessage = (e) => {
  const { terrainSpacing, depthSize } = e.data
  const grids = []
  ISLANDS.forEach((island, index) => {
    const grid = generateIslandGrid(island, terrainSpacing)
    const { normals, colors } = computeShading(island, grid)
    grids.push(grid)
    const heights = grid.heights.slice() // keep the original for the depth map
    self.postMessage(
      { type: 'island', index, grid: { ...grid, heights }, normals, colors },
      [heights.buffer, normals.buffer, colors.buffer],
    )
  })
  const depth = buildDepthMap(ISLANDS, grids, depthSize)
  self.postMessage({ type: 'depth', size: depthSize, data: depth }, [depth.buffer])
}
