// Third-party assets used in the game. The environment assets are CC BY 4.0:
// the authors must be credited and changes indicated. Shown in the in-game
// Credits panel and in public/assets/environment/CREDITS.md.
const sf = (id) => `https://sketchfab.com/3d-models/${id}`
const BY = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }
const CC0 = { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' }

export const CREDITS = [
  { title: 'Peak, mountain, hiking trail', author: 'Metazeon', source: sf('peak-mountain-hiking-trail-88bf28d15a404733bbde905879c8569f'), license: BY },
  { title: 'Stylised Rocks Asset Pack', author: 'Bl4ckGh0st', source: sf('stylised-rocks-asset-pack-d17f102674e84593831f80bc4a451d4d'), license: BY },
  { title: 'Rocks', author: 'gelmi.com.br', source: sf('rocks-630c92c7ad7343a3b04b187f60965856'), license: BY },
  { title: 'Palm Trees', author: 'ElectroNick', source: sf('palm-trees-20f8a8d5054b4191afb7cf3270dbd586'), license: BY },
  { title: 'Trees and bush Pack LOWPOLY', author: 'EFX', source: sf('trees-and-bush-pack-lowpoly-f2a25ee70df440c9ab03d57aba2dc3f2'), license: BY },
  { title: 'More Realistic Trees Free!', author: 'Nicholas-3D', source: sf('more-realistic-trees-free-b5b506fc4f5d4af9b546283bdf0c6a15'), license: BY },
  { title: 'Old Tree', author: 'gelmi.com.br', source: sf('old-tree-5793911821d04f73926ac4ab1d46727a'), license: BY },
  { title: 'Pine Forest at Sunset', author: 'Jagobo', source: sf('pine-forest-at-sunset-bef89be6b189456095db79107045d726'), license: BY },
  { title: 'Grass', author: 'Cosmic_dust', source: sf('grass-f2f2bddb2728483a9105c5f5114eb15e'), license: BY },
  { title: 'Realistics grass 06', author: 'Digital screen official', source: sf('realistics-grass-06-b5956b7d4d1f4ff6ae1dd1320dab0d12'), license: BY },
  { title: 'Scanned Plants and Grass', author: 'Kless', source: sf('scanned-plants-and-grass-free-download-d0fbc8fecfbb40bf9029bc97b6e9e122'), license: BY },
  { title: 'Sand Dunes (sand texture)', author: 'Helindu', source: sf('sand-dunes-6bd9a0d96ef4463a8efd45af2be595ac'), license: BY },
  { title: 'Explorer character and animations', author: 'Quaternius', source: 'https://quaternius.com', license: CC0 },
]

export const CHANGES_NOTE =
  'Environment assets were modified for real-time use: simplified meshes, resized textures, converted materials and objects extracted from packs; the mountain is mirrored to form a full peak and the sand texture is cropped from the dune model.'
