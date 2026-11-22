import Terrain from './Terrain.jsx'

/** Places the island's terrain in the world. */
export default function Island({ island, data }) {
  return (
    <group position={[island.position[0], 0, island.position[1]]} rotation-y={island.rotation} name={island.name}>
      <Terrain island={island} data={data} />
    </group>
  )
}
