<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const error = ref('')

onMounted(async () => {
  const code = route.query.code as string
  const provider = route.params.provider as string
  if (!code || !provider) {
    router.push('/login')
    return
  }
  try {
    await authStore.oauthLogin(provider, code)
    router.push('/')
  } catch (e: any) {
    error.value = e.response?.data?.detail?.message || 'OAuth failed'
  }
})
</script>

<template>
  <div class="flex items-center justify-center min-h-screen">
    <div v-if="error" class="text-destructive text-sm">{{ error }}</div>
    <div v-else class="text-muted-foreground text-sm">{{ $t('common.loading') }}</div>
  </div>
</template>
