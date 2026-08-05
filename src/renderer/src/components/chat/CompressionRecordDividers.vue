<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { AlertTriangle, CheckCircle2, LoaderCircle, XCircle } from '@lucide/vue'
import type { CompressionRecord } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'

defineProps<{ records: CompressionRecord[] }>()

const { t, locale } = useI18n({ useScope: 'local' })
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 250)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function duration(record: CompressionRecord): string {
  const milliseconds = record.durationMs ?? Math.max(0, now.value - Date.parse(record.startedAt))
  return t('duration', { seconds: (milliseconds / 1_000).toFixed(1) })
}

function label(record: CompressionRecord): string {
  if (record.status === 'running') return t('running')
  if (record.status === 'completed') return t('completed')
  if (record.status === 'fallback') return t('fallback')
  return t('failed')
}

function detail(record: CompressionRecord): string {
  const parts = [
    t(`phase.${record.phase}`),
    t(`method.${record.method}`),
    t('input', {
      tokens: new Intl.NumberFormat(locale.value).format(record.inputTokens),
      messages: record.sourceMessages
    })
  ]
  if (record.errorMessage) {
    parts.push(`${record.errorName || t('error')}: ${record.errorMessage}`)
  }
  return parts.join('\n')
}
</script>

<template>
  <div class="compression-records">
    <div
      v-for="record in records"
      :key="record.id"
      class="compression-record"
      :class="record.status"
      :title="detail(record)"
      role="status"
    >
      <span></span>
      <strong>
        <LoaderCircle v-if="record.status === 'running'" class="spin" :size="14" />
        <CheckCircle2 v-else-if="record.status === 'completed'" :size="14" />
        <AlertTriangle v-else-if="record.status === 'fallback'" :size="14" />
        <XCircle v-else :size="14" />
        {{ label(record) }} · {{ duration(record) }}
      </strong>
      <span></span>
    </div>
  </div>
</template>

<style scoped>
.compression-records {
  display: grid;
  gap: 10px;
  margin: 4px 0 14px;
}

.compression-record {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  color: var(--app-text-muted);
  cursor: help;
}

.compression-record > span {
  height: 1px;
  background: currentColor;
  opacity: 0.28;
}

.compression-record strong {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 550;
}

.compression-record.completed {
  color: #079455;
}

.compression-record.fallback {
  color: var(--app-warning);
}

.compression-record.failed {
  color: var(--app-danger);
}

.spin {
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  running: 正在压缩上下文
  completed: 压缩完成
  fallback: 远程压缩失败，已本地完成
  failed: 压缩失败
  duration: 用时 {seconds} 秒
  error: 错误
  input: 输入约 {tokens} Token，共 {messages} 条消息
  phase:
    foreground: 发送前压缩
    background: 后台压缩
  method:
    remote: 模型摘要
    local: 本地提取式摘要
en:
  running: Compressing context
  completed: Compression completed
  fallback: Remote compression failed; completed locally
  failed: Compression failed
  duration: '{seconds}s'
  error: Error
  input: About {tokens} input tokens across {messages} messages
  phase:
    foreground: Pre-send compression
    background: Background compression
  method:
    remote: Model summary
    local: Local extractive summary
</i18n>
