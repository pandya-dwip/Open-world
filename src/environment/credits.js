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
  { title: 'A forest (3) with a road (forest tree cards)', author: 'dasy444', source: sf('a-forest-3-with-a-road-at-night-for-game-61f8c7817fe6457fb26e4814cfc48a3f'), license: BY },
  { title: 'TreeA', author: 'BotondBencsik', source: sf('treea-d44222f5e9994ad6b4a975951c0ada44'), license: BY },
  { title: 'Tree GN', author: 'TechArtBGN', source: sf('tree-gn-40da979cb23f492583ec89c4196cff4e'), license: BY },
  { title: 'Diorama - Forest Loner (cabin)', author: 'RobbeDumoulin', source: sf('diorama-forest-loner-d1b44188cc9a4a8d82f1220d4b8de0d6'), license: BY },
  { title: 'Eco-house Diorama', author: 'Bram Verheyen', source: sf('eco-house-diorama-a4f3ef5aef9b44adb4436098c377472b'), license: BY },
  { title: 'Tree House', author: 'Grigorii Ischenko', source: sf('tree-house-494788a17a7e4c6d9ea62b43e2730607'), license: BY },
  { title: 'Tree House', author: 'Anastasia Dvoryanchikova', source: sf('tree-house-fa000c2d4dd84431bbdcaf22bd022a51'), license: BY },
  { title: 'treehouse', author: 'y.hiu', source: sf('treehouse-45fac2c148b24eeb9cdebb1d0036e9b1'), license: BY },
  { title: 'Treehouse', author: 'Rares Orza - skypro86', source: sf('treehouse-e5736fe13cb248388e108e1684d1ffa7'), license: BY },
  { title: 'treehouse village', author: 'alexkonkler', source: sf('treehouse-village-d93e46b3bd0f4cd888eeec581e35132f'), license: BY },
  { title: 'Japan Temple', author: 'Dinh Vi', source: sf('japan-temple-fbe52ed7c183432dbd5a12cfbf169bb0'), license: BY },
  { title: 'Cloudy Mountain', author: "Per's Scan Collection", source: sf('cloudy-mountain-f61d84c6534d4007accdeac35f433119'), license: BY },
  { title: 'Puddled Mud with Moss - PBR Seamless (path texture)', author: '-Arthur-', source: sf('puddled-mud-with-moss-pbr-seamless-3c8f1977a3e94ab5a5701444446af58a'), license: BY },
  { title: 'Waterfall', author: 'Digitise3D', source: sf('waterfall-d2584b93416a4bf6b543e520a8583d5d'), license: BY },
  { title: 'Seljalandsfoss Waterfall, Iceland | 3D Scan', author: 'Sircher', source: sf('seljalandsfoss-waterfall-iceland-3d-scan-2067359ca7e34aeda250bd20b1ea3881'), license: BY },
  { title: 'looping Waterfall (objects animation)', author: 'Elin', source: sf('looping-waterfall-objects-animation-2f0a1d6acccd429eb3a60bf234d8bd96'), license: BY },
  { title: 'ocean wave', author: 'Andrea Marziano', source: sf('ocean-wave-f86f444dc7cc4458a0140f05a03c5896'), license: BY },
  { title: 'Caravel Ship', author: 'Ginny Sutton', source: sf('caravel-ship-c9819a0e8a57429f888b74978219fb7a'), license: BY },
  { title: 'Empty Ship', author: 'Liaval', source: sf('empty-ship-f254f07be1324a138da32833b32486d8'), license: BY },
  { title: 'Pirate ship (Rigged)', author: 'TIG', source: sf('pirate-ship-rigged-f78e4e29b78c422b8db540459882e601'), license: BY },
  { title: 'Explorer character and animations', author: 'Quaternius', source: 'https://quaternius.com', license: CC0 },
]

export const CHANGES_NOTE =
  'Environment assets were modified for real-time use: simplified meshes, resized textures, converted materials and objects extracted from packs; the mountain is mirrored to form a full peak the sand texture is cropped from the dune model, houses and tree houses are extracted from their dioramas, ship parts are merged and the waterfall scans are relit.'
