<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { LogIn } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const account = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function handleLogin() {
  if (!account.value || !password.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    await authStore.accountLogin(account.value, password.value)
    const redirect = (route.query.redirect as string) || '/'
    router.push(redirect)
  } catch (e: any) {
    errorMsg.value = e.response?.data?.detail?.message || e.response?.data?.message || 'Login failed'
  } finally {
    loading.value = false
  }
}

function handleFeishuLogin() {
  const appId = import.meta.env.VITE_FEISHU_APP_ID
  if (!appId) return
  const redirectUri = encodeURIComponent(window.location.origin + '/login/callback/feishu')
  window.location.href = `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${appId}&redirect_uri=${redirectUri}&response_type=code`
}
</script>

<template>
  <div class="flex items-center justify-center min-h-screen">
    <div class="w-full max-w-sm p-8 space-y-6">
      <div class="text-center space-y-2">
        <img src="/logo.png" alt="NekoClaw" class="w-12 h-12 mx-auto" />
        <h1 class="text-2xl font-bold">NekoClaw</h1>
        <p class="text-muted-foreground text-sm">{{ $t('login.subtitle') }}</p>
      </div>

      <form class="space-y-4" @submit.prevent="handleLogin">
        <div>
          <input
            v-model="account"
            type="text"
            :placeholder="$t('login.account_placeholder') || 'Email'"
            class="w-full px-3 py-2 rounded-md bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <input
            v-model="password"
            type="password"
            :placeholder="$t('login.password_placeholder') || 'Password'"
            class="w-full px-3 py-2 rounded-md bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <p v-if="errorMsg" class="text-destructive text-xs">{{ errorMsg }}</p>
        <button
          type="submit"
          :disabled="loading"
          class="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          <LogIn class="w-4 h-4" />
          {{ $t('common.login') }}
        </button>
      </form>

      <div class="flex items-center gap-3">
        <div class="flex-1 border-t border-border" />
        <span class="text-xs text-muted-foreground">SSO</span>
        <div class="flex-1 border-t border-border" />
      </div>

      <button
        class="w-full px-4 py-2 rounded-md border border-border text-sm hover:bg-secondary transition-colors"
        @click="handleFeishuLogin"
      >
        Feishu / Lark
      </button>
    </div>
  </div>
</template>
