<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'
import { Home, MessageSquare, Target } from 'lucide-vue-next'

const route = useRoute()
const workspace = ref<any>(null)
const loading = ref(true)

async function fetchWorkspace() {
  loading.value = true
  try {
    const res = await api.get(`/workspaces/${route.params.id}`)
    workspace.value = res.data.data
  } finally {
    loading.value = false
  }
}

onMounted(fetchWorkspace)
</script>

<template>
  <div class="max-w-5xl mx-auto p-6">
    <div v-if="loading" class="text-center py-12 text-muted-foreground text-sm">
      {{ $t('common.loading') }}
    </div>
    <div v-else-if="workspace" class="space-y-6">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center text-lg" :style="{ backgroundColor: (workspace.color || '#f59e0b') + '20', color: workspace.color || '#f59e0b' }">
          {{ workspace.icon || workspace.name?.charAt(0) }}
        </div>
        <div>
          <h1 class="text-xl font-bold">{{ workspace.name }}</h1>
          <p class="text-sm text-muted-foreground">{{ workspace.description }}</p>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-4">
        <div class="p-4 rounded-lg bg-card border border-border">
          <div class="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Home class="w-3.5 h-3.5" /> Agents
          </div>
          <div class="text-sm font-medium">{{ workspace.agents?.length ?? 0 }}</div>
        </div>
        <div class="p-4 rounded-lg bg-card border border-border">
          <div class="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <MessageSquare class="w-3.5 h-3.5" /> Messages
          </div>
          <div class="text-sm font-medium">{{ workspace.message_count ?? 0 }}</div>
        </div>
        <div class="p-4 rounded-lg bg-card border border-border">
          <div class="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Target class="w-3.5 h-3.5" /> Objectives
          </div>
          <div class="text-sm font-medium">{{ workspace.objective_count ?? 0 }}</div>
        </div>
      </div>

      <div class="p-4 rounded-lg bg-card border border-border min-h-[300px] flex items-center justify-center text-muted-foreground text-sm">
        3D Hex Workspace View (Three.js)
      </div>
    </div>
  </div>
</template>
