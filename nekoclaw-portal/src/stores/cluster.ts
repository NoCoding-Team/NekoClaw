import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/services/api'

export interface ClusterItem {
  id: string
  name: string
  provider: string
  status: string
  node_count: number
}

export const useClusterStore = defineStore('cluster', () => {
  const clusters = ref<ClusterItem[]>([])

  async function fetchClusters() {
    const res = await api.get('/clusters')
    clusters.value = res.data.data?.items ?? res.data.data ?? []
  }

  return { clusters, fetchClusters }
})
