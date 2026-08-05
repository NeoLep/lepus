<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  ListChecks,
  LoaderCircle,
  MinusCircle
} from '@lucide/vue'
import type { TaskPlan, TaskPlanItemStatus } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  plan: TaskPlan | null
  sending: boolean
  loading: boolean
}>()

const expanded = ref(true)
const { t } = useI18n({ useScope: 'local' })
const completedCount = computed(
  () => props.plan?.items.filter((item) => item.status === 'completed').length ?? 0
)
const progress = computed(() => {
  const total = props.plan?.items.length ?? 0
  return total ? Math.round((completedCount.value / total) * 100) : 0
})

function statusLabel(status: TaskPlanItemStatus): string {
  return t(`status.${status}`)
}
</script>

<template>
  <section class="task-plan" :class="{ expanded }">
    <button class="plan-header" type="button" @click="expanded = !expanded">
      <ListChecks :size="17" />
      <strong>{{ t('title') }}</strong>
      <span v-if="plan?.items.length" class="plan-count">
        {{ t('progress', { completed: completedCount, total: plan.items.length }) }}
      </span>
      <span v-else-if="sending" class="plan-state">{{ t('preparing') }}</span>
      <ChevronDown :size="16" />
    </button>
    <div v-if="expanded" class="plan-body">
      <div v-if="plan?.items.length" class="progress-track" aria-hidden="true">
        <span :style="{ width: `${progress}%` }"></span>
      </div>
      <p v-if="plan?.explanation" class="plan-explanation">{{ plan.explanation }}</p>
      <p v-if="loading" class="empty-plan">{{ t('loading') }}</p>
      <p v-else-if="!plan?.items.length" class="empty-plan">
        {{ sending ? t('preparingHelp') : t('empty') }}
      </p>
      <ol v-else class="plan-items">
        <li v-for="item in plan.items" :key="item.id" :class="item.status">
          <CheckCircle2 v-if="item.status === 'completed'" :size="16" />
          <LoaderCircle v-else-if="item.status === 'in_progress'" class="spin" :size="16" />
          <MinusCircle v-else-if="item.status === 'skipped'" :size="16" />
          <Circle v-else :size="16" />
          <span>{{ item.title }}</span>
          <small>{{ statusLabel(item.status) }}</small>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.task-plan {
  width: min(760px, calc(100% - 32px));
  margin: 8px auto 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 13px;
  background: #fcfcfd;
  box-shadow: 0 2px 8px rgb(16 24 40 / 4%);
}

.plan-header {
  display: flex;
  width: 100%;
  height: 42px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
}

.plan-header strong {
  font-size: 12px;
  font-weight: 650;
}

.plan-header > svg:last-child {
  margin-left: 2px;
  transition: transform 150ms ease;
}

.task-plan.expanded .plan-header > svg:last-child {
  transform: rotate(180deg);
}

.plan-count,
.plan-state {
  min-width: 0;
  flex: 1;
  color: var(--app-text-tertiary);
  font-size: 11px;
  text-align: right;
}

.plan-body {
  max-height: 230px;
  overflow-y: auto;
  padding: 0 12px 11px;
}

.progress-track {
  display: block;
  height: 3px;
  overflow: hidden;
  margin-bottom: 10px;
  border-radius: 2px;
  background: var(--app-border-subtle);
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #12b76a;
  transition: width 200ms ease;
}

.plan-explanation,
.empty-plan {
  margin: 0 0 8px;
  color: var(--app-text-tertiary);
  font-size: 11px;
  line-height: 1.5;
}

.empty-plan {
  margin: 2px 0 0;
  color: var(--app-text-muted);
}

.plan-items {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.plan-items li {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: var(--app-text-tertiary);
}

.plan-items li > svg {
  flex: 0 0 auto;
  color: var(--app-text-muted);
}

.plan-items li span {
  min-width: 0;
  flex: 1;
  font-size: 12px;
}

.plan-items li small {
  color: var(--app-text-muted);
  font-size: 10px;
}

.plan-items li.completed > svg {
  color: #12b76a;
}

.plan-items li.completed span,
.plan-items li.skipped span {
  color: var(--app-text-muted);
  text-decoration: line-through;
}

.plan-items li.in_progress > svg {
  color: var(--app-accent-strong);
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
  title: 任务计划
  progress: '{completed}/{total} 已完成'
  preparing: 正在规划
  preparingHelp: Lepus 正在分析任务并准备执行计划…
  loading: 正在加载计划…
  empty: 发送一个多步骤任务后，Lepus 会在这里建立执行计划。
  status:
    pending: 待处理
    in_progress: 进行中
    completed: 已完成
    skipped: 已跳过
en:
  title: Task plan
  progress: '{completed}/{total} completed'
  preparing: Planning
  preparingHelp: Lepus is analyzing the task and preparing a plan…
  loading: Loading plan…
  empty: Send a multi-step task and Lepus will build its execution plan here.
  status:
    pending: Pending
    in_progress: In progress
    completed: Completed
    skipped: Skipped
</i18n>
