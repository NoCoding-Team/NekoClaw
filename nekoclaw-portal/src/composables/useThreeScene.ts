import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import * as THREE from 'three'

export function useThreeScene(container: Ref<HTMLElement | null>) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
  let renderer: THREE.WebGLRenderer | null = null
  let animId = 0
  const isActive = ref(false)

  function init() {
    if (!container.value) return
    const width = container.value.clientWidth
    const height = container.value.clientHeight

    camera.aspect = width / height
    camera.updateProjectionMatrix()
    camera.position.set(0, 8, 12)
    camera.lookAt(0, 0, 0)

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.value.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dirLight = new THREE.DirectionalLight(0xf59e0b, 0.8)
    dirLight.position.set(5, 10, 5)
    scene.add(dirLight)

    isActive.value = true
    animate()
  }

  function animate() {
    if (!isActive.value || !renderer) return
    animId = requestAnimationFrame(animate)
    renderer.render(scene, camera)
  }

  function resize() {
    if (!container.value || !renderer) return
    const w = container.value.clientWidth
    const h = container.value.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }

  function dispose() {
    isActive.value = false
    cancelAnimationFrame(animId)
    renderer?.dispose()
    if (renderer?.domElement && container.value?.contains(renderer.domElement)) {
      container.value.removeChild(renderer.domElement)
    }
    renderer = null
  }

  onMounted(() => {
    init()
    window.addEventListener('resize', resize)
  })

  onUnmounted(() => {
    dispose()
    window.removeEventListener('resize', resize)
  })

  return { scene, camera, renderer: ref(renderer) }
}
