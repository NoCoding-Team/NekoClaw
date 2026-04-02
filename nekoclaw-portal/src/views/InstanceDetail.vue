<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'
import { Cat, Activity, Settings, Users } from 'lucide-vue-next'

const route = useRoute()
const instance = ref<any>(null)
const loading = ref(true)

async function fetchInstance() {
  loading.value = true
  try {
    const res = await api.get(`/instances/${route.params.id}`)
    instance.value = res.data.data
  } finally {
    loading.value = false
  }
}

onMounted(fetchInstance)

const CAT_STATE_COLORS: Record<string, string> = {
  stray: 'text-gray-500',
  arriving: 'text-blue-400',
  sleeping: 'text-yellow-500',
  exploring: 'text-emerald-500',
  playing: 'text-green-500',
  napping: 'text-amber-400',
  hiding: 'text-red-400',
  lost: 'text-red-600',
  departed: 'text-gray-600',
}
</script>

<template>
  <div class="max-w-4xl mx-auto p-6">
    <div v-if="loading" class="text-center py-12 text-muted-foreground text-sm">
      {{ $t('common.loading') }}
    </div>
    <div v-else-if="instance" class="space-y-6">
      <div class="flex items-center gap-4">
        <div class="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
          <Cat class="w-7 h-7 text-primary" />
        </div>
        <div>
          <h1 class="text-xl font-bold">{{ instance.name }}</h1>
          <p class="text-sm text-muted-foreground flex items-center gap-2">
            <span :class="CAT_STATE_COLORS[instance.cat_state] || 'text-gray-500'">
              {{ instance.cat_state }}
            </span>
            <span v-if="instance.cat_breed">{{ instance.cat_breed }}</span>
          </p>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-4">
        <div class="p-4 rounded-lg bg-card border border-border">
          <div class="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Activity class="w-3.5 h-3.5" /> Status
          </div>
          <div class="text-sm font-medium">{{ instance.status }}</div>
        </div>
        <div class="p-4 rounded-lg bg-card border border-border">
          <div class="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Settings class="w-3.5 h-3.5" /> Service
          </div>
          <div class="text-sm font-medium">{{ instance.service_type }}</div>
        </div>
        <div class="p-4 rounded-lg bg-card border border-border">
          <div class="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Users class="w-3.5 h-3.5" /> Replicas
          </div>
          <div class="text-sm font-medium">{{ instance.replicas ?? 1 }}</div>
        </div>
      </div>

      <div v-if="instance.cat_personality_tags?.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="tag in instance.cat_personality_tags"
          :key="tag"
          class="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs"
        >
          {{ tag }}
        </span>
      </div>
    </div>
  </div>
</template>
