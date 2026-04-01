<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isLoginPage = computed(() => route.path === '/login')
</script>

<template>
  <template v-if="isLoginPage">
    <router-view />
  </template>
  <template v-else>
    <div class="min-h-screen flex flex-col">
      <header class="h-14 flex items-center justify-between px-6 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div class="flex items-center gap-2 shrink-0 cursor-pointer" @click="$router.push('/')">
          <img src="/logo.png" alt="NekoClaw" class="w-5 h-5" />
          <span class="font-bold text-base">NekoClaw</span>
          <span class="px-1.5 py-0.5 text-[10px] font-semibold leading-none rounded bg-primary/15 text-primary">Beta</span>
        </div>
      </header>
      <main class="flex-1">
        <router-view />
      </main>
    </div>
  </template>
</template>
