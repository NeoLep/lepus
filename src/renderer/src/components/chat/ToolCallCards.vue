<script setup lang="ts">
import { CheckCircle2, CircleAlert, LoaderCircle, Wrench } from '@lucide/vue'
import type { ToolCallRecord } from '@ipc/chat/constants'

defineProps<{ calls: ToolCallRecord[] }>()

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
          <LoaderCircle v-if="call.status === 'running'" :size="14" />
          <CheckCircle2 v-else-if="call.status === 'completed'" :size="14" />
          <CircleAlert v-else :size="14" />
          {{
            call.status === 'running' ? '运行中' : call.status === 'completed' ? '已完成' : '失败'
          }}
        </span>
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
  border: 1px solid #e4e7ec;
  border-radius: 9px;
  background: #f9fafb;
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
  background: #eef0f3;
  color: #475467;
}
.tool-card strong {
  flex: 1;
  margin: 0;
  color: #344054;
  font-family: ui-monospace, monospace;
  font-size: 11px;
}
.tool-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #667085;
  font-size: 10px;
}
.tool-status.running svg {
  animation: spin 900ms linear infinite;
}
.tool-status.completed {
  color: #067647;
}
.tool-status.error {
  color: #b42318;
}
.tool-details {
  padding: 9px 10px 10px;
  border-top: 1px solid #eaecf0;
  background: #fff;
}
.tool-details label {
  display: block;
  margin: 0 0 4px;
  color: #667085;
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
  background: #f2f4f7;
  color: #344054;
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
