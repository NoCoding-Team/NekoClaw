<script setup lang="ts">
import { onMounted } from 'vue'
import { useGeneStore } from '@/stores/gene'
import { Search, Star, Download } from 'lucide-vue-next'
import { ref } from 'vue'

const geneStore = useGeneStore()
const search = ref('')

function doSearch() {
  geneStore.fetchGenes({ search: search.value || undefined })
}

onMounted(() => geneStore.fetchGenes())
</script>

<template>
  <div class="max-w-5xl mx-auto p-6 space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">{{ $t('common.geneMarket') }}</h1>
    </div>

    <div class="relative">
      <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        v-model="search"
        class="w-full pl-9 pr-3 py-2 rounded-md bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        :placeholder="$t('gene.search_placeholder') || 'Search skills...'"
        @input="doSearch"
      />
    </div>

    <div v-if="geneStore.loading" class="text-center py-12 text-muted-foreground text-sm">
      {{ $t('common.loading') }}
    </div>

    <div v-else-if="geneStore.genes.length === 0" class="text-center py-12 text-muted-foreground text-sm">
      {{ $t('gene.empty') || 'No skills found' }}
    </div>

    <div v-else class="grid grid-cols-2 gap-4">
      <div
        v-for="gene in geneStore.genes"
        :key="gene.id"
        class="p-4 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors"
      >
        <div class="flex items-center justify-between mb-2">
          <div class="font-medium text-sm">{{ gene.name }}</div>
          <span class="px-2 py-0.5 rounded-full bg-secondary text-xs text-muted-foreground">{{ gene.category }}</span>
        </div>
        <p class="text-xs text-muted-foreground line-clamp-2 mb-3">{{ gene.description }}</p>
        <div class="flex flex-wrap gap-1 mb-3">
          <span
            v-for="tag in gene.tags"
            :key="tag"
            class="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]"
          >
            {{ tag }}
          </span>
        </div>
        <div class="flex items-center justify-between text-xs text-muted-foreground">
          <span class="flex items-center gap-1">
            <Star class="w-3 h-3" /> {{ gene.avg_rating?.toFixed(1) || '-' }}
          </span>
          <span class="flex items-center gap-1">
            <Download class="w-3 h-3" /> {{ gene.install_count }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
