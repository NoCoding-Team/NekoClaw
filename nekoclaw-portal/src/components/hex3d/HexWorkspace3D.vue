<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useThreeScene } from '@/composables/useThreeScene'
import { addHexGrid, removeHexGrid, type HexCell } from './hexGrid'

const props = defineProps<{
  cells: HexCell[]
}>()

const container = ref<HTMLElement | null>(null)
const { scene } = useThreeScene(container)

function render3D() {
  removeHexGrid(scene)
  if (props.cells.length > 0) {
    addHexGrid(scene, props.cells)
  }
}

onMounted(render3D)
watch(() => props.cells, render3D, { deep: true })
</script>

<template>
  <div ref="container" class="w-full h-full min-h-[400px]" />
</template>
