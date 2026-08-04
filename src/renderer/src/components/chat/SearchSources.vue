<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'
import type { SearchCitation } from '@ipc/chat/constants'

defineProps<{ sources: SearchCitation[] }>()
</script>

<template>
  <section v-if="sources.length" class="sources">
    <h4>来源</h4>
    <div class="source-grid">
      <a
        v-for="source in sources"
        :key="`${source.index}-${source.url}`"
        :href="source.url"
        target="_blank"
        rel="noopener noreferrer"
        class="source-card"
      >
        <span class="source-index">{{ source.index }}</span>
        <span class="source-content">
          <strong>{{ source.title }}</strong>
          <small
            >{{ source.provider
            }}<template v-if="source.publishedAt"> · {{ source.publishedAt }}</template></small
          >
        </span>
        <ExternalLink :size="13" />
      </a>
    </div>
  </section>
</template>

<style scoped>
.sources {
  margin-top: 14px;
}
.sources h4 {
  margin: 0 0 7px;
  color: #667085;
  font-size: 11px;
  font-weight: 650;
}
.source-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}
.source-card {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 9px;
  border: 1px solid #e4e7ec;
  border-radius: 9px;
  color: #344054;
  text-decoration: none;
}
.source-card:hover {
  border-color: #b8c0cc;
  background: #f9fafb;
}
.source-index {
  display: grid;
  width: 23px;
  height: 23px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 6px;
  background: #eef2f6;
  color: #475467;
  font-size: 10px;
  font-weight: 700;
}
.source-content {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}
.source-content strong {
  overflow: hidden;
  margin: 0;
  color: #344054;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-content small {
  color: #98a2b3;
  font-size: 9px;
  text-transform: capitalize;
}
.source-card > svg {
  flex: 0 0 auto;
  color: #98a2b3;
}
@media (max-width: 640px) {
  .source-grid {
    grid-template-columns: 1fr;
  }
}
</style>
