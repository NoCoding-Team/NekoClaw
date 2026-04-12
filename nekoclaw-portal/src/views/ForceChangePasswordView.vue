<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import { KeyRound } from 'lucide-vue-next'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function handleSubmit() {
  errorMsg.value = ''
  if (newPassword.value !== confirmPassword.value) {
    errorMsg.value = t('change_password.mismatch')
    return
  }
  if (newPassword.value.length < 6) {
    errorMsg.value = t('change_password.too_short')
    return
  }
  loading.value = true
  try {
    await api.post('/auth/change-password', {
      old_password: oldPassword.value,
      new_password: newPassword.value,
    })
    await authStore.fetchUser()
    router.push('/')
  } catch (e: any) {
    errorMsg.value = e.response?.data?.detail?.message || e.response?.data?.message || t('change_password.failed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex items-center justify-center min-h-screen">
    <div class="w-full max-w-sm p-8 space-y-6">
      <div class="text-center space-y-2">
        <div class="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-amber-100 dark:bg-amber-900">
          <KeyRound class="w-6 h-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 class="text-2xl font-bold">{{ $t('change_password.title') }}</h1>
        <p class="text-muted-foreground text-sm">{{ $t('change_password.subtitle') }}</p>
      </div>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div class="space-y-2">
          <label class="text-sm font-medium">{{ $t('change_password.old_password') }}</label>
          <input
            v-model="oldPassword"
            type="password"
            :placeholder="$t('change_password.old_password_placeholder')"
            class="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium">{{ $t('change_password.new_password') }}</label>
          <input
            v-model="newPassword"
            type="password"
            :placeholder="$t('change_password.new_password_placeholder')"
            class="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium">{{ $t('change_password.confirm_password') }}</label>
          <input
            v-model="confirmPassword"
            type="password"
            :placeholder="$t('change_password.confirm_password_placeholder')"
            class="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
        </div>
        <p v-if="errorMsg" class="text-sm text-destructive">{{ errorMsg }}</p>
        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
        >
          {{ loading ? $t('change_password.submitting') : $t('change_password.submit') }}
        </button>
      </form>
    </div>
  </div>
</template>
