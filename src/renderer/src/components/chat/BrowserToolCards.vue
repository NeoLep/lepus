<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Ban,
  CheckCircle2,
  CircleAlert,
  Download,
  Globe2,
  LoaderCircle,
  ShieldAlert,
  ShieldCheck,
  Square
} from '@lucide/vue'
import type { ToolCallRecord } from '@ipc/chat/constants'

const props = defineProps<{ calls: ToolCallRecord[]; sessionId: string; active?: boolean }>()
const emit = defineEmits<{ cancel: [toolCallId: string] }>()
const trustedOrigins = ref<Set<string>>(new Set())
const trustingOrigins = ref<Set<string>>(new Set())
const trustErrors = ref<Record<string, string>>({})

const browserCalls = computed(() =>
  props.calls.flatMap((call) => {
    if (!call.name.startsWith('browser_')) return []
    let data: Record<string, unknown> = {}
    if (call.result) {
      try {
        const payload = JSON.parse(call.result) as {
          ok?: boolean
          data?: Record<string, unknown>
          error?: string
        }
        data = payload.data ?? (payload.error ? { error: payload.error } : {})
      } catch {
        data = {}
      }
    }
    return [{ call, data }]
  })
)

const operationLabels: Record<string, string> = {
  browser_status: '检查浏览器',
  browser_install: '安装浏览器组件',
  browser_open: '打开网页',
  browser_open_private: '打开局域网页面',
  browser_tabs: '查看标签页',
  browser_snapshot: '读取网页',
  browser_click: '点击网页元素',
  browser_type: '填写网页内容',
  browser_select: '选择网页选项',
  browser_scroll: '滚动网页',
  browser_back: '返回上一页',
  browser_forward: '前进下一页',
  browser_screenshot: '网页截图',
  browser_close: '关闭标签页'
}

function statusLabel(status: ToolCallRecord['status']): string {
  return status === 'awaiting_approval'
    ? '等待确认'
    : status === 'running'
      ? '操作中'
      : status === 'completed'
        ? '已完成'
        : status === 'rejected'
          ? '已拒绝'
          : '失败'
}

function pageOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null
  } catch {
    return null
  }
}

async function refreshTrustedOrigins(): Promise<void> {
  try {
    const settings = await window.api.chat.queryPermissionSettings(props.sessionId)
    trustedOrigins.value = new Set(settings.trustedBrowserOrigins)
  } catch {
    // The trust button will surface an error if the user tries to use it.
  }
}

async function trustPage(value: unknown): Promise<void> {
  const origin = pageOrigin(value)
  if (!origin || trustingOrigins.value.has(origin)) return
  trustingOrigins.value = new Set([...trustingOrigins.value, origin])
  const nextErrors = { ...trustErrors.value }
  delete nextErrors[origin]
  trustErrors.value = nextErrors
  try {
    const settings = await window.api.chat.queryPermissionSettings(props.sessionId)
    if (!settings.trustedBrowserOrigins.includes(origin)) {
      const updated = await window.api.chat.updatePermissionSettings({
        sessionId: props.sessionId,
        ...settings,
        trustedBrowserOrigins: [...settings.trustedBrowserOrigins, origin]
      })
      trustedOrigins.value = new Set(updated.trustedBrowserOrigins)
    } else {
      trustedOrigins.value = new Set(settings.trustedBrowserOrigins)
    }
  } catch (trustError) {
    trustErrors.value = {
      ...trustErrors.value,
      [origin]: trustError instanceof Error ? trustError.message : '保存信任地址失败'
    }
  } finally {
    const next = new Set(trustingOrigins.value)
    next.delete(origin)
    trustingOrigins.value = next
  }
}

watch(
  () => props.sessionId,
  () => void refreshTrustedOrigins(),
  { immediate: true }
)
</script>

<template>
  <div v-if="browserCalls.length" class="browser-cards">
    <section v-for="item in browserCalls" :key="item.call.id" class="browser-card">
      <span class="browser-icon">
        <Download v-if="item.call.name === 'browser_install'" :size="16" />
        <Globe2 v-else :size="16" />
      </span>
      <div class="browser-copy">
        <strong>{{ operationLabels[item.call.name] ?? item.call.name }}</strong>
        <span v-if="item.data.title" :title="String(item.data.title)">
          {{ item.data.title }}
        </span>
        <small v-if="item.data.url" :title="String(item.data.url)">{{ item.data.url }}</small>
        <small v-else-if="item.data.error" class="browser-error">{{ item.data.error }}</small>
        <small
          v-if="pageOrigin(item.data.url) && trustErrors[pageOrigin(item.data.url)!]"
          class="browser-error"
        >
          {{ trustErrors[pageOrigin(item.data.url)!] }}
        </small>
      </div>
      <span class="browser-status" :class="item.call.status">
        <ShieldAlert v-if="item.call.status === 'awaiting_approval'" :size="14" />
        <LoaderCircle v-else-if="item.call.status === 'running'" :size="14" />
        <CheckCircle2 v-else-if="item.call.status === 'completed'" :size="14" />
        <Ban v-else-if="item.call.status === 'rejected'" :size="14" />
        <CircleAlert v-else :size="14" />
        {{ statusLabel(item.call.status) }}
      </span>
      <button
        v-if="item.call.status === 'completed' && pageOrigin(item.data.url)"
        type="button"
        class="trust-button"
        :disabled="
          trustedOrigins.has(pageOrigin(item.data.url)!) ||
          trustingOrigins.has(pageOrigin(item.data.url)!)
        "
        :title="
          trustedOrigins.has(pageOrigin(item.data.url)!)
            ? '该页面地址已受信任'
            : '信任相同协议、主机和端口的页面'
        "
        @click="trustPage(item.data.url)"
      >
        <ShieldCheck :size="12" />
        {{
          trustedOrigins.has(pageOrigin(item.data.url)!)
            ? '已信任'
            : trustingOrigins.has(pageOrigin(item.data.url)!)
              ? '保存中'
              : '信任地址'
        }}
      </button>
      <button
        v-if="active && item.call.status === 'running'"
        type="button"
        title="取消浏览器操作"
        @click="emit('cancel', item.call.id)"
      >
        <Square :size="11" /> 取消
      </button>
    </section>
  </div>
</template>

<style scoped>
.browser-cards {
  display: grid;
  gap: 7px;
  margin: 7px 0 10px;
}
.browser-card {
  display: flex;
  min-width: 0;
  min-height: 52px;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface-subtle);
}
.browser-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  background: var(--app-accent-soft);
  color: var(--app-accent);
}
.browser-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}
.browser-copy strong,
.browser-copy span,
.browser-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.browser-copy strong {
  color: var(--app-text-secondary);
  font-size: 11px;
}
.browser-copy span {
  color: var(--app-text-secondary);
  font-size: 10px;
}
.browser-copy small {
  color: var(--app-text-muted);
  font-size: 9px;
}
.browser-copy .browser-error {
  color: var(--app-danger);
}
.browser-status {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  color: var(--app-text-tertiary);
  font-size: 10px;
}
.browser-status.running svg {
  animation: spin 900ms linear infinite;
}
.browser-status.awaiting_approval {
  color: var(--app-warning);
}
.browser-status.completed {
  color: var(--app-success);
}
.browser-status.error {
  color: var(--app-danger);
}
.browser-card button {
  display: inline-flex;
  height: 25px;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding: 0 7px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-surface);
  color: var(--app-danger);
  font-size: 9px;
  cursor: pointer;
}
.browser-card .trust-button {
  color: var(--app-accent);
}
.browser-card .trust-button:disabled {
  opacity: 0.7;
  cursor: default;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
