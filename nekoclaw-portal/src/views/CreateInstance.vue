<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { Cat, Sparkles } from 'lucide-vue-next'

const router = useRouter()
const loading = ref(false)
const errorMsg = ref('')

const form = ref({
  name: '',
  slug: '',
  service_type: 'openclaw',
  cpu_request: '500m',
  memory_request: '512Mi',
  storage_size: '1Gi',
  replicas: 1,
  cat_breed: '',
  cat_personality_tags: [] as string[],
})

const tagInput = ref('')

function addTag() {
  const tag = tagInput.value.trim()
  if (tag && !form.value.cat_personality_tags.includes(tag)) {
    form.value.cat_personality_tags.push(tag)
  }
  tagInput.value = ''
}

function removeTag(tag: string) {
  form.value.cat_personality_tags = form.value.cat_personality_tags.filter(t => t !== tag)
}

async function handleCreate() {
  if (!form.value.name) return
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await api.post('/instances', form.value)
    const inst = res.data.data
    router.push(`/instances/${inst.id}`)
  } catch (e: any) {
    errorMsg.value = e.response?.data?.detail?.message || 'Create failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-lg mx-auto p-6 space-y-6">
    <h1 class="text-xl font-bold flex items-center gap-2">
      <Sparkles class="w-5 h-5 text-primary" />
      {{ $t('instance.create') || 'Create Instance' }}
    </h1>

    <form class="space-y-4" @submit.prevent="handleCreate">
      <div>
        <label class="text-xs text-muted-foreground mb-1 block">Name</label>
        <input v-model="form.name" class="w-full px-3 py-2 rounded-md bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>

      <div>
        <label class="text-xs text-muted-foreground mb-1 block">Slug</label>
        <input v-model="form.slug" class="w-full px-3 py-2 rounded-md bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>

      <div>
        <label class="text-xs text-muted-foreground mb-1 block">Service Type</label>
        <select v-model="form.service_type" class="w-full px-3 py-2 rounded-md bg-secondary border border-border text-sm">
          <option value="openclaw">OpenClaw</option>
          <option value="zeroclaw">ZeroClaw</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">CPU</label>
          <input v-model="form.cpu_request" class="w-full px-3 py-2 rounded-md bg-secondary border border-border text-sm" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Memory</label>
          <input v-model="form.memory_request" class="w-full px-3 py-2 rounded-md bg-secondary border border-border text-sm" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">Storage</label>
          <input v-model="form.storage_size" class="w-full px-3 py-2 rounded-md bg-secondary border border-border text-sm" />
        </div>
      </div>

      <div>
        <label class="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
          <Cat class="w-3.5 h-3.5" /> Breed
        </label>
        <input v-model="form.cat_breed" class="w-full px-3 py-2 rounded-md bg-secondary border border-border text-sm" />
      </div>

      <div>
        <label class="text-xs text-muted-foreground mb-1 block">Personality Tags</label>
        <div class="flex gap-2">
          <input
            v-model="tagInput"
            class="flex-1 px-3 py-2 rounded-md bg-secondary border border-border text-sm"
            @keydown.enter.prevent="addTag"
          />
          <button type="button" class="px-3 py-2 rounded-md bg-secondary border border-border text-sm" @click="addTag">+</button>
        </div>
        <div class="flex flex-wrap gap-1.5 mt-2">
          <span
            v-for="tag in form.cat_personality_tags"
            :key="tag"
            class="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs cursor-pointer hover:bg-primary/20"
            @click="removeTag(tag)"
          >
            {{ tag }} x
          </span>
        </div>
      </div>

      <p v-if="errorMsg" class="text-destructive text-xs">{{ errorMsg }}</p>

      <button
        type="submit"
        :disabled="loading"
        class="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50"
      >
        {{ loading ? $t('common.loading') : ($t('instance.adopt') || 'Adopt') }}
      </button>
    </form>
  </div>
</template>
