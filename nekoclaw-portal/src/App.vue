<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getCurrentLocale, setCurrentLocale } from '@/i18n'
import { Home, Cat, LayoutDashboard, Dna } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const hideNav = computed(() => ['/login', '/force-change-password'].includes(route.path))
const locale = ref(getCurrentLocale())

const navItems = [
  { path: '/', label: computed(() => t('nav.home')), icon: Home },
  { path: '/instances', label: computed(() => t('nav.instances')), icon: Cat },
  { path: '/workspaces', label: computed(() => t('nav.workspaces')), icon: LayoutDashboard },
  { path: '/genes', label: computed(() => t('nav.geneMarket')), icon: Dna },
]

function toggleLocale() {
  const next = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN'
  locale.value = next
  setCurrentLocale(next)
}
</script>

<template>
  <template v-if="hideNav">
    <router-view />
  </template>
  <template v-else>
    <div class="min-h-screen flex flex-col">
      <header class="h-14 flex items-center justify-between px-6 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 shrink-0 cursor-pointer" @click="router.push('/')">
            <img src="/logo.svg" alt="NekoClaw" class="w-5 h-5" />
            <span class="font-bold text-base">NekoClaw</span>
            <span class="px-1.5 py-0.5 text-[10px] font-semibold leading-none rounded bg-primary/15 text-primary">Beta</span>
          </div>
          <nav class="flex items-center gap-1">
            <button
              v-for="item in navItems"
              :key="item.path"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors"
              :class="route.path === item.path || (item.path !== '/' && route.path.startsWith(item.path))
                ? 'bg-secondary text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'"
              @click="router.push(item.path)"
            >
              <component :is="item.icon" class="w-4 h-4" />
              {{ item.label.value }}
            </button>
          </nav>
        </div>
        <button
          class="px-2.5 py-1 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          @click="toggleLocale"
        >
          {{ locale === 'zh-CN' ? 'EN' : '中文' }}
        </button>
      </header>
      <main class="flex-1">
        <router-view />
      </main>
    </div>
  </template>
</template>
