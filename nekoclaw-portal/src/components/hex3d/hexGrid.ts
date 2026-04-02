import * as THREE from 'three'

const HEX_SIZE = 1.0
const HEX_HEIGHT = 0.15
const HEX_GAP = 0.08

export interface HexCell {
  q: number
  r: number
  label?: string
  color?: string
  type?: 'agent' | 'human' | 'empty'
}

function hexToWorld(q: number, r: number): [number, number] {
  const size = HEX_SIZE + HEX_GAP
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r)
  const z = size * (3 / 2) * r
  return [x, z]
}

function createHexGeometry(): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(HEX_SIZE, HEX_SIZE, HEX_HEIGHT, 6)
}

export function addHexGrid(scene: THREE.Scene, cells: HexCell[]) {
  const group = new THREE.Group()
  group.name = 'hex-grid'

  const hexGeo = createHexGeometry()

  for (const cell of cells) {
    const color = cell.color || (cell.type === 'agent' ? '#f59e0b' : cell.type === 'human' ? '#60a5fa' : '#1a1a1a')
    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.1,
      roughness: 0.8,
      transparent: true,
      opacity: cell.type === 'empty' ? 0.3 : 0.85,
    })
    const mesh = new THREE.Mesh(hexGeo, mat)
    const [x, z] = hexToWorld(cell.q, cell.r)
    mesh.position.set(x, 0, z)
    mesh.rotation.y = Math.PI / 6
    mesh.userData = { q: cell.q, r: cell.r, label: cell.label, type: cell.type }
    group.add(mesh)

    if (cell.type === 'agent' || cell.type === 'human') {
      const sphereGeo = new THREE.SphereGeometry(0.3, 16, 16)
      const sphereMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 })
      const sphere = new THREE.Mesh(sphereGeo, sphereMat)
      sphere.position.set(x, 0.4, z)
      group.add(sphere)
    }
  }

  scene.add(group)
  return group
}

export function removeHexGrid(scene: THREE.Scene) {
  const old = scene.getObjectByName('hex-grid')
  if (old) {
    scene.remove(old)
    old.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }
}
