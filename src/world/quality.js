// Pick a quality tier once, based on device type and screen size.
const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
const small = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600

export const IS_TOUCH = !!coarse
export const LOW_END = !!(coarse || small)

export const QUALITY = LOW_END
  ? {
      terrainSpacing: 6, // world units between terrain vertices at full detail
      terrainLod: [0, 900, 1700, 2800], // switch distances for LOD 0..3
      oceanSegments: 160,
      depthMapSize: 1024,
      shadowMapSize: 1024,
      shadowMaxExtent: 900,
      fog: [700, 3400],
      maxDpr: 1.5,
    }
  : {
      terrainSpacing: 4,
      terrainLod: [0, 700, 1400, 2400],
      oceanSegments: 320,
      depthMapSize: 1536,
      shadowMapSize: 2048,
      shadowMaxExtent: 1400,
      fog: [900, 4200],
      maxDpr: 2,
    }
