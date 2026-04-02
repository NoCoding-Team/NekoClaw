import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/services/api'

export interface GeneItem {
  id: string
  name: string
  slug: string
  description: string
  category: string
  tags: string[]
  avg_rating: number
  install_count: number
}

export const useGeneStore = defineStore('gene', () => {
  const genes = ref<GeneItem[]>([])
  const loading = ref(false)

  async function fetchGenes(params?: { category?: string; search?: string }) {
    loading.value = true
    try {
      const res = await api.get('/genes', { params })
      genes.value = res.data.data?.items ?? res.data.data ?? []
    } finally {
      loading.value = false
    }
  }

  return { genes, loading, fetchGenes }
})
