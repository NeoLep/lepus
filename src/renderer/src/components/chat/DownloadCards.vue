<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, ExternalLink, LoaderCircle, Square, TriangleAlert } from '@lucide/vue'
import type { ToolCallRecord } from '@ipc/chat/constants'

const props = defineProps<{ calls: ToolCallRecord[]; active?: boolean }>()
const emit = defineEmits<{ cancel: [toolCallId: string] }>()
const openingPath = ref('')

const downloads = computed(() =>
  props.calls
    .filter((call) => call.name === 'download_file')
    .map((call) => {
      let data: Record<string, unknown> = {}
      let error = ''
      if (call.result) {
        try {
          const payload = JSON.parse(call.result) as {
            ok?: boolean
            data?: Record<string, unknown>
            error?: string
          }
          data = payload.data ?? {}
          error = payload.ok ? '' : (payload.error ?? '下载失败')
        } catch {
          error = '下载结果格式无效'
        }
      }
      return { call, data, error }
    })
)

function formatBytes(value: unknown): string {
  if (typeof value !== 'number') return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(1)} MiB`
}

async function openFile(filePath: unknown): Promise<void> {
  if (typeof filePath !== 'string' || openingPath.value) return
  openingPath.value = filePath
  try {
    await window.api.chat.openGeneratedFile(filePath)
  } finally {
    openingPath.value = ''
  }
}
</script>

<template>
  <div v-if="downloads.length" class="download-cards">
    <section v-for="item in downloads" :key="item.call.id" class="download-card">
      <div class="download-heading">
        <span class="download-icon"><Download :size="16" /></span>
        <div>
          <strong>{{ item.data.filename ?? '下载资源' }}</strong>
          <small v-if="item.call.status === 'running'">
            {{ formatBytes(item.call.progress?.bytesReceived ?? 0) }}
            <template v-if="item.call.progress?.totalBytes">
              / {{ formatBytes(item.call.progress.totalBytes) }}</template
            >
          </small>
          <small v-else-if="item.call.status === 'completed'"
            >{{ formatBytes(item.data.bytes) }} · {{ item.data.mimeType }}</small
          >
          <small v-else class="error"
            ><TriangleAlert :size="11" /> {{ item.error || '下载已取消或失败' }}</small
          >
        </div>
        <button
          v-if="active && item.call.status === 'running'"
          type="button"
          title="取消下载"
          @click="emit('cancel', item.call.id)"
        >
          <Square :size="12" /> 取消
        </button>
        <button
          v-else-if="item.call.status === 'completed'"
          type="button"
          title="打开文件"
          @click="openFile(item.data.path)"
        >
          <LoaderCircle v-if="openingPath === item.data.path" class="spin" :size="13" />
          <ExternalLink v-else :size="13" /> 打开
        </button>
      </div>
      <div v-if="item.call.status === 'running'" class="progress-track">
        <span
          :class="{ indeterminate: item.call.progress?.percent === undefined }"
          :style="
            item.call.progress?.percent === undefined
              ? undefined
              : { width: `${item.call.progress.percent}%` }
          "
        ></span>
      </div>
      <dl v-if="item.call.status === 'completed'">
        <template v-if="Array.isArray(item.data.warnings) && item.data.warnings.length">
          <dt>警告</dt>
          <dd class="warning">{{ item.data.warnings.join('；') }}</dd>
        </template>
        <dt>检测类型</dt>
        <dd>{{ item.data.detectedMimeType }}</dd>
        <dt>SHA-256</dt>
        <dd>{{ item.data.sha256 }}</dd>
        <dt>来源</dt>
        <dd :title="String(item.data.finalUrl ?? '')">{{ item.data.finalUrl }}</dd>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.download-cards {
  display: grid;
  gap: 8px;
  margin: 7px 0 10px;
}
.download-card {
  overflow: hidden;
  border: 1px solid var(--app-border-strong);
  border-radius: 10px;
  background: var(--app-surface);
}
.download-heading {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px;
}
.download-icon {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  background: #eef4ff;
  color: #3538cd;
}
.download-heading > div {
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
  color: var(--app-text-secondary);
  font-size: 12px;
}
small {
  margin-top: 2px;
  color: var(--app-text-tertiary);
  font-size: 10px;
}
small.error {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--app-danger);
}
button {
  display: inline-flex;
  height: 28px;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid var(--app-border-strong);
  border-radius: 7px;
  background: var(--app-surface);
  color: var(--app-text-tertiary);
  cursor: pointer;
  font-size: 10px;
}
.progress-track {
  height: 3px;
  overflow: hidden;
  background: var(--app-border-subtle);
}
.progress-track span {
  display: block;
  height: 100%;
  background: #6172f3;
  transition: width 150ms ease;
}
.progress-track span.indeterminate {
  width: 35%;
  animation: progress 1.2s ease-in-out infinite;
}
dl {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 5px 8px;
  margin: 0;
  padding: 8px 10px;
  border-top: 1px solid var(--app-border-subtle);
  background: var(--app-surface-subtle);
  font-size: 9px;
}
dt {
  color: var(--app-text-tertiary);
}
dd {
  overflow: hidden;
  margin: 0;
  color: var(--app-text-tertiary);
  font-family: ui-monospace, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.warning {
  color: var(--app-warning);
  white-space: normal;
  font-family: inherit;
}
.spin {
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes progress {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(300%);
  }
}
</style>
