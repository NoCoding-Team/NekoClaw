import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from '@/router'
import { i18n } from '@/i18n'
import App from './App.vue'
import '@/styles/globals.css'
import { isTauriDesktop } from '@/utils/env'
import { useAuthStore } from '@/stores/auth'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(i18n)
app.use(router)
app.mount('#app')

if (isTauriDesktop) {
  window.addEventListener('message', (event) => {
    if (
      event.data &&
      typeof event.data === 'object' &&
      event.data.type === 'nekoclaw:token-inject' &&
      typeof event.data.token === 'string' &&
      event.data.token.length > 0
    ) {
      const authStore = useAuthStore()
      authStore.setTokens(event.data.token, '')
      if (typeof event.data.accountId === 'string') {
        sessionStorage.setItem('nekoclaw_desktop_account_id', event.data.accountId)
      }
      const currentRoute = router.currentRoute.value
      if (currentRoute.path === '/login' || currentRoute.name === 'Login') {
        router.replace('/')
      }
    }
  })
}
