<script setup lang="ts">
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  LoaderCircle,
  Wrench
} from '@lucide/vue'
import type { AgentRun, AgentRunStatus } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ runs: AgentRun[] }>()
const { t } = useI18n({ useScope: 'local' })

function statusLabel(status: AgentRunStatus): string {
  return t(`status.${status}`)
}

function shortId(run: AgentRun): string {
  return run.id.slice(0, 6)
}
</script>

<template>
  <section v-if="runs.length" class="sub-agent-panel" aria-live="polite">
    <header class="sub-agent-panel-header">
      <span class="sub-agent-panel-icon"><Bot :size="16" /></span>
      <div>
        <strong>{{ t('title') }}</strong>
        <span>{{ t('summary', { count: runs.length }) }}</span>
      </div>
    </header>

    <div class="sub-agent-list">
      <details v-for="(run, index) in props.runs" :key="run.id" class="sub-agent-card">
        <summary>
          <span class="sub-agent-index">{{ index + 1 }}</span>
          <span class="sub-agent-main">
            <span class="sub-agent-name">
              {{ t('agent', { index: index + 1 }) }}
              <small>#{{ shortId(run) }}</small>
            </span>
            <strong>{{ run.goal }}</strong>
          </span>
          <span class="sub-agent-status" :class="run.status">
            <CheckCircle2 v-if="run.status === 'completed'" :size="14" />
            <CircleAlert v-else-if="run.status === 'failed'" :size="14" />
            <Clock3
              v-else-if="run.status === 'queued' || run.status === 'waiting_approval'"
              :size="14"
            />
            <CircleAlert v-else-if="run.status === 'canceled'" :size="14" />
            <LoaderCircle v-else :size="14" />
            {{ statusLabel(run.status) }}
          </span>
          <ChevronDown class="sub-agent-chevron" :size="15" />
        </summary>

        <div class="sub-agent-details">
          <div class="sub-agent-meta">
            <span><Wrench :size="13" /> {{ t('toolCalls', { count: run.toolCallCount }) }}</span>
          </div>
          <template v-if="run.result">
            <label>{{ t('result') }}</label>
            <pre>{{ run.result }}</pre>
          </template>
          <template v-else-if="run.errorMessage">
            <label>{{ t('error') }}</label>
            <pre class="error-result">{{ run.errorMessage }}</pre>
          </template>
          <p v-else class="sub-agent-waiting">{{ t('waitingResult') }}</p>
        </div>
      </details>
    </div>
  </section>
</template>

<style scoped>
.sub-agent-panel {
  margin: 8px 0 12px;
  overflow: hidden;
  border: 1px solid #d9d6fe;
  border-radius: 12px;
  background: #fbfaff;
}

.sub-agent-panel-header {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border-bottom: 1px solid #e9e7fd;
  background: #f7f5ff;
}

.sub-agent-panel-icon {
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #ebe9fe;
  color: #6941c6;
}

.sub-agent-panel-header div {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: baseline;
  gap: 7px;
}

.sub-agent-panel-header strong {
  margin: 0;
  color: #42307d;
  font-size: 12px;
}

.sub-agent-panel-header span:last-child {
  color: #7f56d9;
  font-size: 10px;
}

.sub-agent-list {
  display: grid;
  gap: 1px;
}

.sub-agent-card {
  background: #ffffff;
}

.sub-agent-card + .sub-agent-card {
  border-top: 1px solid #eeecff;
}

.sub-agent-card summary {
  display: flex;
  min-height: 58px;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  cursor: pointer;
  list-style: none;
}

.sub-agent-card summary::-webkit-details-marker {
  display: none;
}

.sub-agent-index {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f4f3ff;
  color: #6941c6;
  font-size: 10px;
  font-weight: 700;
}

.sub-agent-main {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 3px;
}

.sub-agent-name {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #6941c6;
  font-size: 10px;
  font-weight: 650;
}

.sub-agent-name small {
  color: #98a2b3;
  font-family: ui-monospace, monospace;
  font-size: 9px;
  font-weight: 500;
}

.sub-agent-main strong {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: #344054;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.sub-agent-status {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  color: #667085;
  font-size: 10px;
}

.sub-agent-status.running,
.sub-agent-status.waiting_approval,
.sub-agent-status.waiting_input {
  color: #b54708;
}

.sub-agent-status.running svg,
.sub-agent-status.waiting_input svg {
  animation: spin 900ms linear infinite;
}

.sub-agent-status.completed {
  color: #067647;
}

.sub-agent-status.failed,
.sub-agent-status.canceled {
  color: #b42318;
}

.sub-agent-chevron {
  flex: 0 0 auto;
  color: #98a2b3;
  transition: transform 140ms ease;
}

.sub-agent-card[open] .sub-agent-chevron {
  transform: rotate(180deg);
}

.sub-agent-details {
  padding: 10px 12px 12px 43px;
  border-top: 1px solid #f0efff;
  background: #fdfcff;
}

.sub-agent-meta {
  display: flex;
  margin-bottom: 8px;
  color: #667085;
  font-size: 10px;
}

.sub-agent-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.sub-agent-details label {
  display: block;
  margin-bottom: 4px;
  color: #667085;
  font-size: 10px;
  font-weight: 650;
}

.sub-agent-details pre {
  max-height: 240px;
  margin: 0;
  padding: 9px;
  overflow: auto;
  border-radius: 7px;
  background: #f2f4f7;
  color: #344054;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.sub-agent-details pre.error-result {
  background: #fef3f2;
  color: #b42318;
}

.sub-agent-waiting {
  margin: 0;
  color: #98a2b3;
  font-size: 11px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  title: 子 Agent 协作
  summary: 共 {count} 个独立任务
  agent: 子 Agent {index}
  toolCalls: 调用 {count} 个工具
  result: 执行结果
  error: 失败原因
  waitingResult: 正在执行，完成后可在这里查看结果。
  status:
    queued: 排队中
    running: 执行中
    waiting_approval: 等待确认
    waiting_input: 等待输入
    completed: 已完成
    failed: 失败
    canceled: 已取消
en:
  title: Sub-agent collaboration
  summary: '{count} independent tasks'
  agent: Sub-agent {index}
  toolCalls: '{count} tool calls'
  result: Result
  error: Error
  waitingResult: Running. The result will appear here when complete.
  status:
    queued: Queued
    running: Running
    waiting_approval: Waiting for approval
    waiting_input: Waiting for input
    completed: Completed
    failed: Failed
    canceled: Canceled
</i18n>
