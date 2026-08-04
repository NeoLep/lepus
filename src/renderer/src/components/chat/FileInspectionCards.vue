<script setup lang="ts">
import { computed } from 'vue'
import { FileCheck2, ShieldCheck, TriangleAlert } from '@lucide/vue'
import type { ToolCallRecord } from '@ipc/chat/constants'

const props = defineProps<{ calls: ToolCallRecord[] }>()
const inspections = computed(() =>
  props.calls.flatMap((call) => {
    if (call.name !== 'inspect_file' || call.status !== 'completed' || !call.result) return []
    try {
      const payload = JSON.parse(call.result) as { ok?: boolean; data?: Record<string, unknown> }
      return payload.ok && payload.data ? [{ id: call.id, data: payload.data }] : []
    } catch {
      return []
    }
  })
)

function formatBytes(value: unknown): string {
  if (typeof value !== 'number') return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(1)} MiB`
}

function imageDimensions(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const image = value as { width?: unknown; height?: unknown }
  return typeof image.width === 'number' && typeof image.height === 'number'
    ? `${image.width} × ${image.height}`
    : ''
}
</script>

<template>
  <div v-if="inspections.length" class="inspection-cards">
    <section v-for="item in inspections" :key="item.id" class="inspection-card">
      <header>
        <span><FileCheck2 :size="16" /></span>
        <div>
          <strong>{{ item.data.name }}</strong
          ><small>{{ formatBytes(item.data.size) }} · {{ item.data.detectedMimeType }}</small>
        </div>
        <TriangleAlert v-if="item.data.dangerous" class="danger" :size="17" />
        <ShieldCheck v-else class="safe" :size="17" />
      </header>
      <div v-if="Array.isArray(item.data.warnings) && item.data.warnings.length" class="warnings">
        <p v-for="warning in item.data.warnings" :key="warning">
          <TriangleAlert :size="12" />{{ warning }}
        </p>
      </div>
      <dl>
        <template v-if="imageDimensions(item.data.image)">
          <dt>图片尺寸</dt>
          <dd>{{ imageDimensions(item.data.image) }}</dd>
        </template>
        <template v-if="item.data.sha256">
          <dt>SHA-256</dt>
          <dd :title="String(item.data.sha256)">{{ item.data.sha256 }}</dd>
        </template>
        <dt>路径</dt>
        <dd :title="String(item.data.path)">{{ item.data.path }}</dd>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.inspection-cards {
  display: grid;
  gap: 8px;
  margin: 7px 0 10px;
}
.inspection-card {
  overflow: hidden;
  border: 1px solid #d0d5dd;
  border-radius: 10px;
  background: #fff;
}
header {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px;
}
header > span {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  background: #ecfdf3;
  color: #067647;
}
header > div {
  min-width: 0;
  flex: 1;
}
strong,
small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
strong {
  color: #344054;
  font-size: 12px;
}
small {
  margin-top: 2px;
  color: #667085;
  font-size: 10px;
}
.safe {
  color: #079455;
}
.danger {
  color: #dc6803;
}
.warnings {
  padding: 7px 10px;
  border-top: 1px solid #fedf89;
  background: #fffaeb;
}
.warnings p {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin: 3px 0;
  color: #b54708;
  font-size: 10px;
}
.warnings svg {
  flex: 0 0 auto;
  margin-top: 1px;
}
dl {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 5px 8px;
  margin: 0;
  padding: 8px 10px;
  border-top: 1px solid #eaecf0;
  background: #f9fafb;
  font-size: 9px;
}
dt {
  color: #667085;
}
dd {
  overflow: hidden;
  margin: 0;
  color: #475467;
  font-family: ui-monospace, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
