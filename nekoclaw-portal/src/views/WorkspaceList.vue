<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '@/stores/workspace'
import { Plus, Home } from 'lucide-vue-next'

const router = useRouter()
const wsStore = useWorkspaceStore()

onMounted(() => wsStore.fetchWorkspaces())
</script>

<template>
  <div class="max-w-5xl mx-auto p-6 space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold flex items-center gap-2">
        <Home class="w-5 h-5 text-primary" />
        {{ $t('common.workspace') }}
      </h1>
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
      >
        <Plus class="w-4 h-4" />
        {{ $t('workspace.create') || 'Create' }}
      </button>
    </div>

    <div v-if="wsStore.loading" class="text-center py-12 text-muted-foreground text-sm">
      {{ $t('common.loading') }}
    </div>

    <div v-else-if="wsStore.workspaces.length === 0" class="text-center py-12 text-muted-foreground text-sm">
      {{ $t('workspace.empty') || 'No workspaces yet' }}
    </div>

    <div v-else class="grid grid-cols-2 gap-4">
      <div
        v-for="ws in wsStore.workspaces"
        :key="ws.id"
        class="p-4 rounded-lg bg-card border border-border hover:border-primary/30 cursor-pointer transition-colors"
        @click="router.push(`/workspaces/${ws.id}`)"
      >
        <div class="flex items-center gap-3 mb-2">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm" :style="{ backgroundColor: ws.color + '20', color: ws.color }">
            {{ ws.icon || ws.name.charAt(0) }}
          </div>
          <div class="font-medium text-sm">{{ ws.name }}</div>
        </div>
        <p class="text-xs text-muted-foreground line-clamp-2">{{ ws.description }}</p>
        <div class="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          <span>{{ ws.agent_count }} agents</span>
          <span>{{ ws.member_count }} members</span>
        </div>
      </div>
    </div>
  </div>
</template>
