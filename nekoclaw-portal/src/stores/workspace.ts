import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/services/api'

export interface WorkspaceItem {
  id: string
  name: string
  description: string
  color: string
  icon: string
  agent_count: number
  member_count: number
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const workspaces = ref<WorkspaceItem[]>([])
  const loading = ref(false)

  async function fetchWorkspaces() {
    loading.value = true
    try {
      const res = await api.get('/workspaces')
      workspaces.value = res.data.data?.items ?? res.data.data ?? []
    } finally {
      loading.value = false
    }
  }

  return { workspaces, loading, fetchWorkspaces }
})
