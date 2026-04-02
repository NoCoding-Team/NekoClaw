<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  state: string
  size?: 'sm' | 'md' | 'lg'
}>()

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm': return 'w-8 h-8'
    case 'lg': return 'w-20 h-20'
    default: return 'w-12 h-12'
  }
})

const animationClass = computed(() => {
  switch (props.state) {
    case 'sleeping': return 'animate-pulse'
    case 'exploring': return 'animate-bounce'
    case 'playing': return 'animate-wiggle'
    case 'arriving': return 'animate-fade-in'
    case 'napping': return 'animate-pulse'
    case 'hiding': return 'opacity-40'
    case 'lost': return 'animate-shake'
    default: return ''
  }
})

const stateColor = computed(() => {
  switch (props.state) {
    case 'stray': return '#9ca3af'
    case 'arriving': return '#60a5fa'
    case 'sleeping': return '#eab308'
    case 'exploring': return '#10b981'
    case 'playing': return '#22c55e'
    case 'napping': return '#f59e0b'
    case 'hiding': return '#f87171'
    case 'lost': return '#dc2626'
    case 'departed': return '#6b7280'
    default: return '#9ca3af'
  }
})
</script>

<template>
  <div
    :class="[sizeClass, animationClass, 'rounded-full flex items-center justify-center transition-all duration-500']"
    :style="{ backgroundColor: stateColor + '20' }"
  >
    <svg :class="[props.size === 'sm' ? 'w-4 h-4' : props.size === 'lg' ? 'w-10 h-10' : 'w-6 h-6']" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" :style="{ color: stateColor }">
      <path d="M12 5c-1.2-2-3.5-3-5-2.5C5.5 3 5 5 5 7c0 1.5.5 3 2 4l1 1c.5.5 1 1.5 1 3v2h6v-2c0-1.5.5-2.5 1-3l1-1c1.5-1 2-2.5 2-4 0-2-.5-4-2-4.5C15.5 2 13.2 3 12 5z" />
      <circle cx="9" cy="9" r="0.8" fill="currentColor" />
      <circle cx="15" cy="9" r="0.8" fill="currentColor" />
      <path d="M10 12.5c.5.5 1.5.8 2 .8s1.5-.3 2-.8" />
      <path d="M5 10H2M19 10h3M5 8H3M19 8h3" stroke-linecap="round" />
    </svg>
  </div>
</template>

<style scoped>
@keyframes wiggle {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-5deg); }
  75% { transform: rotate(5deg); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}

@keyframes fade-in {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.animate-wiggle {
  animation: wiggle 0.8s ease-in-out infinite;
}

.animate-shake {
  animation: shake 0.5s ease-in-out infinite;
}

.animate-fade-in {
  animation: fade-in 1s ease-out;
}
</style>
