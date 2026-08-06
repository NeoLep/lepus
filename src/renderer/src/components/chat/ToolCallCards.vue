<script setup lang="ts">
import {
  Ban,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  ShieldAlert,
  Square,
  Wrench
} from '@lucide/vue'
import type { ToolCallRecord } from '@ipc/chat/constants'

defineProps<{ calls: ToolCallRecord[]; active?: boolean }>()
const emit = defineEmits<{ cancel: [toolCallId: string] }>()

function pretty(value?: string): string {
  if (!value) return ''
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}
</script>

<template>
  <div v-if="calls.length" class="tool-cards">
    <details v-for="call in calls" :key="call.id" class="tool-card">
      <summary>
        <span class="tool-icon"><Wrench :size="14" /></span>
        <strong>{{ call.name }}</strong>
        <span class="tool-status" :class="call.status">
          <ShieldAlert v-if="call.status === 'awaiting_approval'" :size="14" />
          <LoaderCircle v-else-if="call.status === 'running'" :size="14" />
          <CheckCircle2 v-else-if="call.status === 'completed'" :size="14" />
          <Ban v-else-if="call.status === 'rejected'" :size="14" />
          <CircleAlert v-else :size="14" />
          {{
            call.status === 'awaiting_approval'
              ? '等待确认'
              : call.status === 'running'
                ? '运行中'
                : call.status === 'completed'
                  ? '已完成'
                  : call.status === 'rejected'
                    ? '已拒绝'
                    : '失败'
          }}
        </span>
        <button
          v-if="active && call.name === 'run_skill_script' && call.status === 'running'"
          class="cancel-tool-button"
          type="button"
          title="取消脚本"
          @click.stop="emit('cancel', call.id)"
        >
          <Square :size="11" /> 取消
        </button>
      </summary>
      <div class="tool-details">
        <label>参数</label>
        <pre>{{ pretty(call.arguments) }}</pre>
        <template v-if="call.result">
          <label>结果</label>
          <pre>{{ pretty(call.result) }}</pre>
        </template>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tool-cards {
  display: grid;
  gap: 7px;
  margin: 7px 0 10px;
}
.tool-card {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 9px;
  background: var(--app-surface-subtle);
}
.tool-card summary {
  display: flex;
  min-height: 38px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  cursor: pointer;
  list-style: none;
}
.tool-card summary::-webkit-details-marker {
  display: none;
}
.tool-icon {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 6px;
  background: var(--app-surface-muted);
  color: var(--app-text-tertiary);
}
.tool-card strong {
  flex: 1;
  margin: 0;
  color: var(--app-text-secondary);
  font-family: ui-monospace, monospace;
  font-size: 11px;
}
.tool-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--app-text-tertiary);
  font-size: 10px;
}
.tool-status.running svg {
  animation: spin 900ms linear infinite;
}
.tool-status.awaiting_approval {
  color: var(--app-warning);
}
.tool-status.completed {
  color: var(--app-success);
}
.tool-status.error {
  color: var(--app-danger);
}
.tool-status.rejected {
  color: var(--app-text-tertiary);
}
.cancel-tool-button {
  display: inline-flex;
  height: 25px;
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
.cancel-tool-button:hover {
  background: var(--app-hover);
}
.tool-details {
  padding: 9px 10px 10px;
  border-top: 1px solid var(--app-border-subtle);
  background: var(--app-surface);
}
.tool-details label {
  display: block;
  margin: 0 0 4px;
  color: var(--app-text-tertiary);
  font-size: 10px;
  font-weight: 650;
}
.tool-details label:not(:first-child) {
  margin-top: 9px;
}
.tool-details pre {
  max-height: 180px;
  margin: 0;
  padding: 8px;
  overflow: auto;
  border-radius: 6px;
  background: var(--app-code-panel-bg);
  color: var(--app-code-panel-text);
  font-size: 10px;
  line-height: 1.5;
  white-space: pre-wrap;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
