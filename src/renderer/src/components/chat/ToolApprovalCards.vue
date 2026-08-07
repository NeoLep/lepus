<script setup lang="ts">
import { Check, ShieldAlert, X } from '@lucide/vue'
import type { ToolApprovalRequest } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'

defineProps<{
  approvals: ToolApprovalRequest[]
  resolvingIds?: string[]
}>()

const emit = defineEmits<{
  resolve: [approval: ToolApprovalRequest, decision: 'allow_once' | 'allow_session' | 'reject']
}>()

const { t } = useI18n({ useScope: 'local' })

function pretty(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}
</script>

<template>
  <div v-if="approvals.length" class="approval-list">
    <section v-for="approval in approvals" :key="approval.id" class="approval-card">
      <div class="approval-heading">
        <span class="approval-icon"><ShieldAlert :size="16" /></span>
        <span>
          <strong>{{ t('title') }}</strong>
          <small>{{ approval.name }}</small>
        </span>
        <em :class="approval.risk">{{ t(approval.risk) }}</em>
      </div>
      <p>{{ approval.reason }}</p>
      <details>
        <summary>{{ t('parameters') }}</summary>
        <pre>{{ pretty(approval.arguments) }}</pre>
      </details>
      <div class="approval-actions">
        <button
          type="button"
          class="reject-button"
          :disabled="resolvingIds?.includes(approval.id)"
          @click="emit('resolve', approval, 'reject')"
        >
          <X :size="14" /> {{ t('reject') }}
        </button>
        <button
          v-if="approval.allowSession"
          type="button"
          class="session-button"
          :disabled="resolvingIds?.includes(approval.id)"
          @click="emit('resolve', approval, 'allow_session')"
        >
          <Check :size="14" /> {{ t('allowSession') }}
        </button>
        <button
          type="button"
          class="allow-button"
          :disabled="resolvingIds?.includes(approval.id)"
          @click="emit('resolve', approval, 'allow_once')"
        >
          <Check :size="14" /> {{ t('allowOnce') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.approval-list {
  display: grid;
  gap: 8px;
  margin: 8px 0 10px;
}

.approval-card {
  overflow: hidden;
  padding: 12px;
  border: 1px solid #f5c26b;
  border-radius: 10px;
  background: #fffcf5;
}

.approval-heading {
  display: flex;
  align-items: center;
  gap: 9px;
}

.approval-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  background: #fef0c7;
  color: var(--app-warning);
}

.approval-heading > span:nth-child(2) {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.approval-heading strong {
  margin: 0;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.approval-heading small {
  color: var(--app-text-tertiary);
  font-family: ui-monospace, monospace;
  font-size: 10px;
}

.approval-heading em {
  padding: 2px 6px;
  border-radius: 999px;
  background: #fef0c7;
  color: var(--app-warning);
  font-size: 9px;
  font-style: normal;
  font-weight: 650;
}

.approval-heading em.high {
  background: #fee4e2;
  color: var(--app-danger);
}

.approval-card p {
  margin: 10px 0;
  color: var(--app-text-tertiary);
  font-size: 11px;
  line-height: 1.5;
}

.approval-card details {
  margin-bottom: 11px;
}

.approval-card summary {
  color: var(--app-text-tertiary);
  font-size: 10px;
  cursor: pointer;
}

.approval-card pre {
  max-height: 150px;
  margin: 7px 0 0;
  padding: 8px;
  overflow: auto;
  border-radius: 6px;
  border: 1px solid var(--app-border-strong);
  background: var(--app-code-panel-bg);
  color: var(--app-code-panel-text);
  font-size: 10px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.approval-actions {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
}

.approval-actions button {
  display: inline-flex;
  height: 30px;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.approval-actions button:disabled {
  opacity: 0.55;
  cursor: default;
}

.reject-button {
  border: 1px solid var(--app-border-strong);
  background: var(--app-surface);
  color: var(--app-text-tertiary);
}

.allow-button {
  border: 1px solid #b54708;
  background: #b54708;
  color: #fff;
}

.session-button {
  border: 1px solid #f5c26b;
  background: #fff7e6;
  color: #934f08;
}
</style>

<i18n lang="yaml">
zh-CN:
  title: 工具调用需要确认
  medium: 外部操作
  high: 高风险
  parameters: 查看调用参数
  reject: 拒绝
  allowSession: 本次会话允许
  allowOnce: 允许一次
en:
  title: Tool approval required
  medium: External action
  high: High risk
  parameters: View parameters
  reject: Reject
  allowSession: Allow for session
  allowOnce: Allow once
</i18n>
