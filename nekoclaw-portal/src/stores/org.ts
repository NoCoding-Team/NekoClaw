import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/services/api'

export interface OrgInfo {
  id: string
  name: string
  slug: string
  plan: string
}

export const useOrgStore = defineStore('org', () => {
  const currentOrg = ref<OrgInfo | null>(null)
  const orgList = ref<OrgInfo[]>([])

  async function fetchOrgs() {
    const res = await api.get('/orgs')
    orgList.value = res.data.data?.items ?? res.data.data ?? []
    if (!currentOrg.value && orgList.value.length > 0) {
      currentOrg.value = orgList.value[0]
    }
  }

  function setCurrentOrg(org: OrgInfo) {
    currentOrg.value = org
  }

  return { currentOrg, orgList, fetchOrgs, setCurrentOrg }
})
