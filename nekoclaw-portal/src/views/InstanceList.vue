<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { Plus, Search, Cat } from 'lucide-vue-next'

interface InstanceItem {
  id: string
  name: string
  slug: string
  status: string
  cat_state: string
  cat_breed: string
  cat_personality_tags: string[]
  service_type: string
  created_at: string
}

const router = useRouter()
const instances = ref<InstanceItem[]>([])
const loading = ref(false)
const search = ref('')

async function fetchInstances() {
  loading.value = true
  try {
    const res = await api.get('/instances', { params: { search: search.value || undefined } })
    instances.value = res.data.data?.items ?? res.data.data ?? []
  } finally {
    loading.value = false
  }
}

onMounted(fetchInstances)

const CAT_STATE_COLORS: Record<string, string> = {
  stray: 'bg-gray-500',
  arriving: 'bg-blue-400',
  sleeping: 'bg-yellow-500',
  exploring: 'bg-emerald-500',
  playing: 'bg-green-500',
  napping: 'bg-amber-400',
  hiding: 'bg-red-400',
  lost: 'bg-red-600',
  departed: 'bg-gray-600',
}
</script>

<template>
  <div class="max-w-5xl mx-auto p-6 space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold flex items-center gap-2">
        <Cat class="w-5 h-5 text-primary" />
        {{ $t('common.instance') }}
      </h1>
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        @click="router.push('/instances/create')"
      >
        <Plus class="w-4 h-4" />
        {{ $t('instance.create') || 'Create' }}
      </button>
    </div>

    <div class="relative">
      <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        v-model="search"
        class="w-full pl-9 pr-3 py-2 rounded-md bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        :placeholder="$t('instance.search_placeholder') || 'Search...'"
        @input="fetchInstances"
      />
    </div>

    <div v-if="loading" class="text-center py-12 text-muted-foreground text-sm">
      {{ $t('common.loading') }}
    </div>

    <div v-else-if="instances.length === 0" class="text-center py-12 text-muted-foreground text-sm">
      {{ $t('instance.empty') || 'No instances yet' }}
    </div>

    <div v-else class="grid gap-3">
      <div
        v-for="inst in instances"
        :key="inst.id"
        class="flex items-center gap-4 p-4 rounded-lg bg-card border border-border hover:border-primary/30 cursor-pointer transition-colors"
        @click="router.push(`/instances/${inst.id}`)"
      >
        <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Cat class="w-5 h-5 text-primary" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm truncate">{{ inst.name }}</div>
          <div class="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
            <span class="inline-flex items-center gap-1">
              <span :class="['w-1.5 h-1.5 rounded-full', CAT_STATE_COLORS[inst.cat_state] || 'bg-gray-500']" />
              {{ inst.cat_state }}
            </span>
            <span v-if="inst.cat_breed">{{ inst.cat_breed }}</span>
          </div>
        </div>
        <div class="text-xs text-muted-foreground shrink-0">
          {{ inst.service_type }}
        </div>
      </div>
    </div>
  </div>
</template>
