<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { Cat, CheckCircle, XCircle, Loader2 } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const deployId = route.params.deployId as string

const steps = ref<{ name: string; status: string; message: string }[]>([])
const finalStatus = ref<'running' | 'success' | 'failed'>('running')
const elapsed = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
let ctrl: AbortController | null = null

const TIMEOUT_S = 360

onMounted(() => {
  timer = setInterval(() => {
    elapsed.value++
    if (elapsed.value >= TIMEOUT_S && finalStatus.value === 'running') {
      finalStatus.value = 'failed'
      ctrl?.abort()
    }
  }, 1000)

  ctrl = new AbortController()
  const token = localStorage.getItem('portal_token')

  fetchEventSource(`/api/v1/deploy/adopt/progress/${deployId}`, {
    headers: { Authorization: `Bearer ${token ?? ''}` },
    signal: ctrl.signal,
    onmessage(ev) {
      if (ev.event === 'step') {
        try {
          const data = JSON.parse(ev.data)
          const idx = steps.value.findIndex(s => s.name === data.step)
          if (idx >= 0) {
            steps.value[idx] = { name: data.step, status: data.status, message: data.message || '' }
          } else {
            steps.value.push({ name: data.step, status: data.status, message: data.message || '' })
          }
        } catch { /* ignore */ }
      }
      if (ev.event === 'done') {
        try {
          const data = JSON.parse(ev.data)
          finalStatus.value = data.status === 'success' ? 'success' : 'failed'
        } catch {
          finalStatus.value = 'success'
        }
      }
    },
    onerror() {
      if (finalStatus.value === 'running') {
        finalStatus.value = 'failed'
      }
    },
  })
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  ctrl?.abort()
})

const hatchPhase = ref(0)
setInterval(() => { hatchPhase.value = (hatchPhase.value + 1) % 4 }, 800)
</script>

<template>
  <div class="max-w-lg mx-auto p-6 space-y-8">
    <div class="text-center space-y-4">
      <div class="relative w-24 h-24 mx-auto">
        <div
          class="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center transition-transform duration-700"
          :class="{ 'animate-bounce': finalStatus === 'running', 'scale-110': finalStatus === 'success' }"
        >
          <Cat v-if="finalStatus === 'success'" class="w-10 h-10 text-primary" />
          <XCircle v-else-if="finalStatus === 'failed'" class="w-10 h-10 text-destructive" />
          <Loader2 v-else class="w-10 h-10 text-primary animate-spin" />
        </div>
      </div>
      <h2 class="text-lg font-bold">
        <template v-if="finalStatus === 'running'">
          {{ ['Hatching...', 'Almost there...', 'Preparing...', 'Warming up...'][hatchPhase] }}
        </template>
        <template v-else-if="finalStatus === 'success'">
          {{ $t('deploy.adopt_success') || 'Your cat has arrived!' }}
        </template>
        <template v-else>
          {{ $t('deploy.adopt_failed') || 'Adoption failed' }}
        </template>
      </h2>
      <p class="text-xs text-muted-foreground">{{ elapsed }}s</p>
    </div>

    <div class="space-y-2">
      <div
        v-for="step in steps"
        :key="step.name"
        class="flex items-center gap-3 px-3 py-2 rounded-md bg-card border border-border text-sm"
      >
        <CheckCircle v-if="step.status === 'done'" class="w-4 h-4 text-green-500 shrink-0" />
        <XCircle v-else-if="step.status === 'failed'" class="w-4 h-4 text-destructive shrink-0" />
        <Loader2 v-else class="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
        <span class="flex-1 truncate">{{ step.name }}</span>
        <span v-if="step.message" class="text-xs text-muted-foreground truncate max-w-[200px]">{{ step.message }}</span>
      </div>
    </div>

    <div v-if="finalStatus !== 'running'" class="text-center">
      <button
        class="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        @click="router.push('/instances')"
      >
        {{ $t('deploy.back_to_list') || 'Back to list' }}
      </button>
    </div>
  </div>
</template>
