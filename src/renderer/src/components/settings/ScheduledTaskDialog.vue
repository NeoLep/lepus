<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  MessageSquareText,
  Play,
  Plus,
  Sparkles,
  Trash2
} from '@lucide/vue'
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
  CheckboxIndicator,
  CheckboxRoot,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
  SwitchRoot,
  SwitchThumb,
  ToggleGroupItem,
  ToggleGroupRoot
} from 'reka-ui'
import type { ModelConfig, SkillDefinition } from '@ipc/chat/constants'
import type { ScheduledTask } from '@ipc/scheduled/constants'
import { useI18n } from 'vue-i18n'
import AgentCapabilityPicker from './AgentCapabilityPicker.vue'
import { DEFAULT_UNATTENDED_CAPABILITIES } from '@/shared/agent/capabilities'

const props = defineProps<{ configs: ModelConfig[] }>()
const emit = defineEmits<{ viewResult: [sessionId: string] }>()
const { t } = useI18n({ useScope: 'local' })
const tasks = ref<ScheduledTask[]>([])
const selectedId = ref<string | null>(null)
const draft = ref(makeTask())
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const skills = ref<SkillDefinition[]>([])

const selected = computed(() => tasks.value.find((task) => task.id === selectedId.value) ?? null)
const weekdays = [1, 2, 3, 4, 5, 6, 0]
const selectedSkills = computed(() =>
  draft.value.skillIds
    .map((id) => skills.value.find((skill) => skill.id === id))
    .filter((skill): skill is SkillDefinition => Boolean(skill))
)

function defaultRunAt(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  date.setSeconds(0, 0)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function makeTask(): ScheduledTask {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: '',
    prompt: '',
    scheduleType: 'daily',
    runAt: null,
    timeOfDay: '09:00',
    weekdays: [1, 2, 3, 4, 5],
    modelConfigId: '',
    skillIds: [],
    capabilities: [...DEFAULT_UNATTENDED_CAPABILITIES],
    workspacePath: '',
    maxToolRounds: 12,
    enabled: true,
    status: 'idle',
    lastRunAt: null,
    nextRunAt: null,
    lastError: '',
    lastSessionId: null,
    createdAt: now,
    updatedAt: now
  }
}

function createTask(): void {
  selectedId.value = null
  draft.value = {
    ...makeTask(),
    modelConfigId: props.configs.find((item) => item.isActive)?.id ?? props.configs[0]?.id ?? ''
  }
  error.value = ''
}

function editTask(task: ScheduledTask): void {
  selectedId.value = task.id
  draft.value = {
    ...task,
    weekdays: [...task.weekdays],
    skillIds: [...task.skillIds],
    runAt: task.runAt ? localDateTime(task.runAt) : null
  }
  error.value = ''
}

function localDateTime(value: string): string {
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

const needsWorkspace = computed(() =>
  draft.value.capabilities.some((item) =>
    ['workspace_read', 'workspace_write', 'downloads'].includes(item)
  )
)

async function selectWorkspace(): Promise<void> {
  const selected = await window.api.chat.selectWorkspaceFolder()
  if (selected) draft.value.workspacePath = selected
}

async function load(): Promise<void> {
  try {
    const [scheduledTasks, availableSkills] = await Promise.all([
      window.api.scheduledTasks.query(),
      window.api.chat.querySkills()
    ])
    tasks.value = scheduledTasks
    skills.value = availableSkills.filter((skill) => skill.enabled)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : t('loadFailed')
  } finally {
    loading.value = false
  }
}

function toggleSkill(skill: SkillDefinition, checked: boolean | 'indeterminate'): void {
  if (checked === true) {
    if (draft.value.skillIds.length >= 3 || draft.value.skillIds.includes(skill.id)) return
    draft.value.skillIds = [...draft.value.skillIds, skill.id]
    if (!draft.value.capabilities.includes('skills')) {
      draft.value.capabilities = [...draft.value.capabilities, 'skills']
    }
    return
  }
  draft.value.skillIds = draft.value.skillIds.filter((id) => id !== skill.id)
}

async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    const current = draft.value
    const request: ScheduledTask = {
      id: current.id,
      name: current.name,
      prompt: current.prompt,
      scheduleType: current.scheduleType,
      runAt:
        current.scheduleType === 'once' && current.runAt
          ? new Date(current.runAt).toISOString()
          : null,
      timeOfDay: current.timeOfDay,
      weekdays: [...current.weekdays],
      modelConfigId: current.modelConfigId,
      skillIds: [...current.skillIds],
      capabilities: [...current.capabilities],
      workspacePath: current.workspacePath,
      maxToolRounds: current.maxToolRounds,
      enabled: current.enabled,
      status: current.status,
      lastRunAt: current.lastRunAt,
      nextRunAt: current.nextRunAt,
      lastError: current.lastError,
      lastSessionId: current.lastSessionId,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString()
    }
    const saved = await window.api.scheduledTasks.save(request)
    const index = tasks.value.findIndex((item) => item.id === saved.id)
    if (index < 0) tasks.value.unshift(saved)
    else tasks.value[index] = saved
    editTask(saved)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : t('saveFailed')
  } finally {
    saving.value = false
  }
}

async function remove(): Promise<void> {
  if (!selected.value || !window.confirm(t('deleteConfirm', { name: selected.value.name }))) return
  try {
    await window.api.scheduledTasks.delete(selected.value.id)
    tasks.value = tasks.value.filter((item) => item.id !== selected.value?.id)
    createTask()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : t('deleteFailed')
  }
}

async function runNow(task: ScheduledTask): Promise<void> {
  try {
    await window.api.scheduledTasks.runNow(task.id)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : t('runFailed')
  }
}

function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(value)
      )
    : '—'
}

function weekdayLabel(day: number): string {
  return t(`weekday.${day}`)
}

function modelLabel(id: string): string {
  const config = props.configs.find((item) => item.id === id)
  return config ? `${config.name} · ${config.model}` : t('selectModel')
}

const removeListener = window.api.scheduledTasks.onChanged((task) => {
  const index = tasks.value.findIndex((item) => item.id === task.id)
  if (index < 0) tasks.value.unshift(task)
  else tasks.value[index] = task
  if (selectedId.value === task.id) editTask(task)
})
onMounted(() => {
  void load()
  createTask()
})
onBeforeUnmount(removeListener)
</script>

<template>
  <div class="task-center">
    <header>
      <div>
        <h2>{{ t('title') }}</h2>
        <p>{{ t('description') }}</p>
      </div>
    </header>
    <div class="task-body">
      <aside>
        <button class="new-task" type="button" @click="createTask">
          <Plus :size="16" />{{ t('newTask') }}
        </button>
        <p v-if="loading" class="empty">{{ t('common.loading') }}</p>
        <p v-else-if="!tasks.length" class="empty">{{ t('empty') }}</p>
        <button
          v-for="task in tasks"
          :key="task.id"
          class="task-item"
          :class="{ selected: task.id === selectedId }"
          type="button"
          @click="editTask(task)"
        >
          <span
            ><strong>{{ task.name }}</strong
            ><small>{{
              task.nextRunAt ? t('next', { time: formatDate(task.nextRunAt) }) : t('disabled')
            }}</small></span
          >
          <LoaderCircle v-if="task.status === 'running'" class="spin" :size="14" />
          <CircleAlert v-else-if="task.status === 'failed'" :size="14" />
          <CheckCircle2 v-else-if="task.status === 'succeeded'" :size="14" />
        </button>
      </aside>

      <form @submit.prevent="save">
        <label
          ><span>{{ t('name') }}</span
          ><input v-model="draft.name" maxlength="80" :placeholder="t('namePlaceholder')"
        /></label>
        <label
          ><span>{{ t('prompt') }}</span
          ><textarea
            v-model="draft.prompt"
            rows="5"
            maxlength="20000"
            :placeholder="t('promptPlaceholder')"
          ></textarea></label
        >
        <div class="skill-picker-row">
          <div>
            <strong>{{ t('taskSkills') }}</strong>
            <small>{{ t('taskSkillsHint') }}</small>
            <div v-if="selectedSkills.length" class="selected-skills">
              <button
                v-for="skill in selectedSkills"
                :key="skill.id"
                type="button"
                :title="t('removeSkill')"
                @click="toggleSkill(skill, false)"
              >
                <Sparkles :size="12" />{{ skill.name }} <span>×</span>
              </button>
            </div>
          </div>
          <PopoverRoot>
            <PopoverTrigger class="secondary skill-trigger" type="button">
              <Sparkles :size="14" />{{ t('chooseSkills') }}
            </PopoverTrigger>
            <PopoverPortal>
              <PopoverContent class="task-skill-popover" :side-offset="7" align="end">
                <div class="skill-popover-heading">
                  <strong>{{ t('chooseSkills') }}</strong>
                  <small>{{ t('skillLimit') }}</small>
                </div>
                <p v-if="!skills.length" class="skill-empty">{{ t('noSkills') }}</p>
                <label v-for="skill in skills" v-else :key="skill.id" class="skill-option">
                  <span><strong>{{ skill.name }}</strong><small>{{ skill.description || skill.id }}</small></span>
                  <CheckboxRoot
                    class="skill-checkbox"
                    :model-value="draft.skillIds.includes(skill.id)"
                    :disabled="draft.skillIds.length >= 3 && !draft.skillIds.includes(skill.id)"
                    @update:model-value="toggleSkill(skill, $event)"
                  >
                    <CheckboxIndicator><Check :size="13" /></CheckboxIndicator>
                  </CheckboxRoot>
                </label>
              </PopoverContent>
            </PopoverPortal>
          </PopoverRoot>
        </div>
        <div class="two-columns">
          <label>
            <span>{{ t('scheduleType') }}</span>
            <SelectRoot v-model="draft.scheduleType">
              <SelectTrigger class="task-select-trigger"
                ><SelectValue>{{ t(draft.scheduleType) }}</SelectValue
                ><ChevronDown :size="15"
              /></SelectTrigger>
              <SelectPortal
                ><SelectContent
                  class="task-select-content"
                  position="popper"
                  :side-offset="5"
                  :style="{ zIndex: 1000 }"
                  ><SelectViewport class="task-select-viewport">
                    <SelectItem
                      v-for="value in ['once', 'daily', 'weekly']"
                      :key="value"
                      class="task-select-item"
                      :value="value"
                      ><SelectItemIndicator class="task-select-indicator"
                        ><Check :size="14" /></SelectItemIndicator
                      ><SelectItemText>{{ t(value) }}</SelectItemText></SelectItem
                    >
                  </SelectViewport></SelectContent
                ></SelectPortal
              >
            </SelectRoot>
          </label>
          <label v-if="draft.scheduleType === 'once'"
            ><span>{{ t('runAt') }}</span
            ><input v-model="draft.runAt" type="datetime-local" :min="defaultRunAt()"
          /></label>
          <label v-else
            ><span>{{ t('timeOfDay') }}</span
            ><input v-model="draft.timeOfDay" type="time"
          /></label>
        </div>
        <div v-if="draft.scheduleType === 'weekly'" class="weekdays">
          <span>{{ t('weekdays') }}</span>
          <ToggleGroupRoot v-model="draft.weekdays" class="weekday-group" type="multiple">
            <ToggleGroupItem
              v-for="day in weekdays"
              :key="day"
              class="weekday-item"
              :value="day"
            >
              {{ weekdayLabel(day) }}
            </ToggleGroupItem>
          </ToggleGroupRoot>
        </div>
        <label>
          <span>{{ t('model') }}</span>
          <SelectRoot v-model="draft.modelConfigId">
            <SelectTrigger class="task-select-trigger"
              ><SelectValue>{{ modelLabel(draft.modelConfigId) }}</SelectValue
              ><ChevronDown :size="15"
            /></SelectTrigger>
            <SelectPortal
              ><SelectContent
                class="task-select-content"
                position="popper"
                :side-offset="5"
                :style="{ zIndex: 1000 }"
                ><SelectViewport class="task-select-viewport">
                  <SelectItem
                    v-for="config in configs"
                    :key="config.id"
                    class="task-select-item"
                    :value="config.id"
                    ><SelectItemIndicator class="task-select-indicator"
                      ><Check :size="14" /></SelectItemIndicator
                    ><SelectItemText
                      >{{ config.name }} · {{ config.model }}</SelectItemText
                    ></SelectItem
                  >
                </SelectViewport></SelectContent
              ></SelectPortal
            >
          </SelectRoot>
        </label>
        <section class="permission-card">
          <div class="form-heading">
            <div><strong>{{ t('permissions') }}</strong><small>{{ t('permissionsHint') }}</small></div>
            <span>{{ t('selectedPermissions', { count: draft.capabilities.length }) }}</span>
          </div>
          <AgentCapabilityPicker v-model="draft.capabilities" unattended />
          <div v-if="needsWorkspace" class="workspace-row">
            <div><strong>{{ t('workspace') }}</strong><small>{{ draft.workspacePath || t('workspaceEmpty') }}</small></div>
            <button type="button" class="secondary" @click="selectWorkspace">
              {{ t('chooseWorkspace') }}
            </button>
          </div>
          <label class="rounds-row">
            <span>{{ t('maxToolRounds') }}</span>
            <input v-model.number="draft.maxToolRounds" type="number" min="1" max="64" />
          </label>
        </section>
        <div class="enabled-row">
          <div><strong>{{ t('enabled') }}</strong><small>{{ t('enabledHint') }}</small></div>
          <SwitchRoot v-model="draft.enabled" class="task-switch"><SwitchThumb /></SwitchRoot>
        </div>

        <section v-if="selected" class="run-status">
          <div>
            <span>{{ t('lastRun') }}</span
            ><strong>{{ formatDate(selected.lastRunAt) }}</strong>
          </div>
          <div>
            <span>{{ t('nextRunLabel') }}</span
            ><strong>{{ formatDate(selected.nextRunAt) }}</strong>
          </div>
          <p v-if="selected.lastError">{{ selected.lastError }}</p>
        </section>
        <p v-if="error" class="error">{{ error }}</p>
        <footer>
          <button v-if="selected" class="danger" type="button" @click="remove">
            <Trash2 :size="14" />{{ t('common.delete') }}
          </button>
          <span></span>
          <button
            v-if="selected?.lastSessionId"
            class="secondary result-button"
            type="button"
            @click="emit('viewResult', selected.lastSessionId)"
          >
            <MessageSquareText :size="14" />{{ t('viewResult') }}
          </button>
          <button
            v-if="selected"
            class="secondary"
            type="button"
            :disabled="selected.status === 'running'"
            @click="runNow(selected)"
          >
            <Play :size="14" />{{ t('runNow') }}
          </button>
          <button class="primary" type="submit" :disabled="saving || !configs.length">
            {{ saving ? t('saving') : t('common.save') }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<style scoped>
.task-center {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  color: var(--app-text-secondary);
}
header {
  min-height: 72px;
  box-sizing: border-box;
  padding: 17px 22px 15px;
  border-bottom: 1px solid var(--app-border-subtle);
}
header h2 {
  margin: 0;
  color: var(--app-text);
  font-size: 16px;
}
header p {
  margin: 3px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
}
.task-body {
  display: grid;
  min-height: 0;
  grid-template-columns: 230px minmax(0, 1fr);
}
aside {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow-y: auto;
  padding: 12px;
  border-right: 1px solid var(--app-border-subtle);
  background: var(--app-surface-subtle);
}
.new-task,
.task-item {
  width: 100%;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
}
.new-task {
  flex: 0 0 auto;
  display: flex;
  height: 36px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 600;
}
.new-task:hover,
.task-item:hover {
  background: var(--app-surface-muted);
}
.task-item {
  display: flex;
  flex: 0 0 auto;
  min-height: 54px;
  align-items: center;
  gap: 7px;
  margin-top: 3px;
  padding: 8px 10px;
  text-align: left;
}
.task-item.selected {
  background: var(--app-active);
}
.task-item > span {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 3px;
}
.task-item strong,
.task-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-item strong {
  color: var(--app-text);
  font-size: 12px;
}
.task-item small,
.empty {
  color: var(--app-text-muted);
  font-size: 10px;
}
.empty {
  display: grid;
  min-height: 120px;
  flex: 1 1 auto;
  margin: 0;
  padding: 20px 12px 56px;
  place-items: center;
  text-align: center;
  line-height: 1.6;
}
form {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
  padding: 20px 22px;
  overflow-y: auto;
}
label > span,
.weekdays > span {
  display: block;
  margin-bottom: 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
}
input,
textarea,
.task-select-trigger {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  outline: none;
  background: var(--app-surface);
  color: var(--app-text);
  font: inherit;
  font-size: 13px;
}
input,
.task-select-trigger {
  height: 38px;
  padding: 0 10px;
}
.task-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  cursor: pointer;
}
:global(.task-select-content) {
  z-index: 1000 !important;
  min-width: var(--reka-select-trigger-width);
  max-height: min(320px, var(--reka-select-content-available-height));
  overflow: hidden;
  border: 1px solid var(--app-border-strong);
  border-radius: 9px;
  background: var(--app-surface);
  box-shadow: 0 12px 30px rgb(16 24 40 / 16%);
  color: var(--app-text-secondary);
}
:global(.task-select-viewport) {
  padding: 5px;
}
:global(.task-select-item) {
  position: relative;
  display: flex;
  min-height: 34px;
  align-items: center;
  padding: 7px 9px 7px 31px;
  border-radius: 7px;
  outline: none;
  font-size: 13px;
  cursor: default;
  user-select: none;
}
:global(.task-select-item[data-highlighted]) {
  background: var(--app-hover);
  color: var(--app-text);
}
:global(.task-select-indicator) {
  position: absolute;
  left: 9px;
  display: inline-flex;
  color: var(--app-accent);
}
textarea {
  resize: vertical;
  padding: 9px 10px;
  line-height: 1.5;
}
label small {
  display: block;
  margin-top: 5px;
  color: var(--app-text-muted);
  font-size: 10px;
}
.two-columns {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr 1fr;
}
.weekday-group {
  display: flex;
  gap: 6px;
}
.weekday-item {
  width: 34px;
  height: 30px;
  border: 1px solid var(--app-border-strong);
  border-radius: 7px;
  background: var(--app-surface);
  color: var(--app-text-muted);
  font-size: 11px;
  cursor: pointer;
}
.weekday-item[data-state='on'] {
  border-color: var(--app-accent);
  background: var(--app-accent-soft);
  color: var(--app-accent);
}
.enabled-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
}
.enabled-row > div { display: grid; gap: 3px; }
.enabled-row strong { color: var(--app-text); font-size: 12px; }
.enabled-row small { color: var(--app-text-muted); font-size: 10px; }
.task-switch { position: relative; width: 36px; height: 20px; flex: none; padding: 2px; border: 0; border-radius: 999px; background: var(--app-border-strong); cursor: pointer; }
.task-switch[data-state='checked'] { background: var(--app-accent); }
.task-switch > span { display: block; width: 16px; height: 16px; border-radius: 50%; background: white; box-shadow: 0 1px 3px rgb(0 0 0 / 20%); transition: transform .15s; }
.task-switch[data-state='checked'] > span { transform: translateX(16px); }
.permission-card { display: grid; gap: 14px; padding: 15px; border: 1px solid var(--app-border-subtle); border-radius: 12px; background: var(--app-surface-subtle); }
.skill-picker-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 12px 14px; border: 1px solid var(--app-border-subtle); border-radius: 10px; background: var(--app-surface-subtle); }
.skill-picker-row > div { display: grid; min-width: 0; gap: 3px; }
.skill-picker-row strong { color: var(--app-text); font-size: 12px; }
.skill-picker-row small { color: var(--app-text-muted); font-size: 10px; line-height: 1.4; }
.skill-trigger {
  display: inline-flex;
  width: auto;
  min-width: 104px;
  height: 34px;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.skill-trigger:hover,
.skill-trigger[data-state='open'] {
  border-color: color-mix(in srgb, var(--app-accent) 45%, var(--app-border-strong));
  background: var(--app-accent-soft);
  color: var(--app-accent);
}
.skill-trigger:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-accent) 24%, transparent);
  outline-offset: 2px;
}
.selected-skills { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.selected-skills button { display: inline-flex; height: 25px; align-items: center; gap: 4px; padding: 0 8px; border: 1px solid color-mix(in srgb, var(--app-accent) 35%, var(--app-border-subtle)); border-radius: 999px; background: var(--app-accent-soft); color: var(--app-accent); font-size: 10px; cursor: pointer; }
:global(.task-skill-popover) { z-index: 10001; width: min(360px, calc(100vw - 32px)); max-height: min(420px, var(--reka-popover-content-available-height)); overflow-y: auto; padding: 7px; border: 1px solid var(--app-border-strong); border-radius: 11px; background: var(--app-surface); box-shadow: 0 16px 40px rgb(16 24 40 / 20%); }
:global(.skill-popover-heading) { display: grid; gap: 2px; padding: 7px 8px 9px; }
:global(.skill-popover-heading strong) { color: var(--app-text); font-size: 12px; }
:global(.skill-popover-heading small), :global(.skill-empty) { color: var(--app-text-muted); font-size: 10px; }
:global(.skill-option) { display: flex; align-items: center; gap: 10px; padding: 9px 8px; border-radius: 8px; cursor: pointer; }
:global(.skill-option:hover) { background: var(--app-hover); }
:global(.skill-option > span) { display: grid; min-width: 0; flex: 1; gap: 2px; }
:global(.skill-option strong) { color: var(--app-text); font-size: 11px; }
:global(.skill-option small) { overflow: hidden; color: var(--app-text-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
:global(.skill-checkbox) { display: grid; width: 18px; height: 18px; flex: none; place-items: center; border: 1px solid var(--app-border-strong); border-radius: 5px; background: var(--app-surface); color: white; }
:global(.skill-checkbox[data-state='checked']) { border-color: var(--app-accent); background: var(--app-accent); }
:global(.skill-checkbox[data-disabled]) { opacity: .45; }
.form-heading, .workspace-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.form-heading > div, .workspace-row > div { display: grid; min-width: 0; gap: 3px; }
.form-heading strong, .workspace-row strong { color: var(--app-text); font-size: 12px; }
.form-heading small, .workspace-row small { overflow: hidden; color: var(--app-text-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.form-heading > span { flex: none; color: var(--app-text-muted); font-size: 10px; }
.workspace-row { padding-top: 12px; border-top: 1px solid var(--app-border-subtle); }
.rounds-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 12px; border-top: 1px solid var(--app-border-subtle); }
.rounds-row > span { margin: 0; }
.rounds-row input { width: 84px; }
.enabled-row span {
  margin: 0;
}
.run-status {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 9px;
  background: var(--app-surface-subtle);
  grid-template-columns: 1fr 1fr;
}
.run-status div {
  display: grid;
  gap: 3px;
}
.run-status span {
  color: var(--app-text-muted);
  font-size: 10px;
}
.run-status strong {
  color: var(--app-text);
  font-size: 12px;
}
.run-status p,
.error {
  grid-column: 1/-1;
  margin: 0;
  color: var(--app-danger);
  font-size: 11px;
}
footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
}
footer > span {
  flex: 1;
}
footer button {
  display: inline-flex;
  height: 36px;
  align-items: center;
  gap: 6px;
  padding: 0 13px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.primary {
  border: 1px solid var(--app-inverse-bg);
  background: var(--app-inverse-bg);
  color: var(--app-agent-card-bg);
}
.secondary {
  border: 1px solid var(--app-border-strong);
  background: var(--app-surface);
  color: var(--app-text-secondary);
}
.result-button { color: var(--app-accent); }
.danger {
  border: 0;
  background: transparent;
  color: var(--app-danger);
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  title: 定时任务与任务中心
  description: 按计划运行 AI 任务，并为每个任务设置独立的模型、工作区和能力权限。
  newTask: 新建任务
  empty: 暂无定时任务
  name: 任务名称
  namePlaceholder: 例如：每天汇总 AI 行业动态
  prompt: 任务内容
  promptPlaceholder: 描述需要模型定时完成的工作、输出格式和必要条件；也可以在下方选择 Skill 作为执行流程。
  taskSkills: 使用 Skill
  taskSkillsHint: 所选 Skill 会作为任务内容的显式执行流程，而不是仅依赖关键词匹配。
  chooseSkills: 选择 Skill
  skillLimit: 每个任务最多选择 3 个
  noSkills: 暂无已启用的 Skill，请先在 Skills 管理中安装或启用。
  removeSkill: 从任务中移除 Skill
  permissions: 运行权限
  permissionsHint: 统一能力权限会直接限制模型可见和可调用的工具。
  selectedPermissions: 已选 {count} 项
  workspace: 工作区
  workspaceEmpty: 尚未选择，文件能力无法使用
  chooseWorkspace: 选择文件夹
  maxToolRounds: 最大工具轮次
  scheduleType: 执行计划
  once: 执行一次
  daily: 每天
  weekly: 每周
  runAt: 执行时间
  timeOfDay: 每日时间
  weekdays: 执行星期
  model: 使用模型
  selectModel: 请选择模型
  enabled: 启用此任务
  enabledHint: 到达计划时间后自动执行
  runNow: 立即运行
  viewResult: 查看结果
  saving: 保存中…
  next: 下次：{time}
  disabled: 已停用或无下次计划
  lastRun: 上次运行
  nextRunLabel: 下次运行
  deleteConfirm: 确定删除任务“{name}”吗？
  loadFailed: 加载定时任务失败
  saveFailed: 保存定时任务失败
  deleteFailed: 删除定时任务失败
  runFailed: 启动任务失败
  weekday: { 0: 日, 1: 一, 2: 二, 3: 三, 4: 四, 5: 五, 6: 六 }
en:
  title: Scheduled tasks
  description: Run AI tasks on schedule with per-task model, workspace, and capability permissions.
  newTask: New task
  empty: No scheduled tasks
  name: Task name
  namePlaceholder: 'For example: Summarize daily AI news'
  prompt: Task prompt
  promptPlaceholder: Describe the work to run, expected output, and constraints. You can also select a Skill below as the workflow.
  taskSkills: Use Skills
  taskSkillsHint: Selected Skills are explicitly invoked for this task instead of relying only on keyword matching.
  chooseSkills: Choose Skills
  skillLimit: Select up to 3 Skills per task
  noSkills: No enabled Skills. Install or enable one in Skills management first.
  removeSkill: Remove Skill from task
  permissions: Runtime permissions
  permissionsHint: Shared capability permissions directly control which tools the model can see and call.
  selectedPermissions: '{count} selected'
  workspace: Workspace
  workspaceEmpty: Not selected; file capabilities cannot run
  chooseWorkspace: Choose folder
  maxToolRounds: Maximum tool rounds
  scheduleType: Schedule
  once: Once
  daily: Daily
  weekly: Weekly
  runAt: Run at
  timeOfDay: Time of day
  weekdays: Weekdays
  model: Model
  selectModel: Select a model
  enabled: Enable this task
  enabledHint: Run automatically at the scheduled time
  runNow: Run now
  viewResult: View result
  saving: Saving…
  next: 'Next: {time}'
  disabled: Disabled or no next run
  lastRun: Last run
  nextRunLabel: Next run
  deleteConfirm: Delete task “{name}”?
  loadFailed: Failed to load scheduled tasks
  saveFailed: Failed to save scheduled task
  deleteFailed: Failed to delete scheduled task
  runFailed: Failed to start scheduled task
  weekday: { 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat }
</i18n>
