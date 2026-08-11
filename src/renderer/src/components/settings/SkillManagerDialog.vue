<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'
import { Download, FileCode2, Plus, Sparkles, Trash2, X } from '@lucide/vue'
import type { SkillDefinition, SkillImportResult } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'
import SkillImportDialog from './SkillImportDialog.vue'

const open = defineModel<boolean>('open', { required: true })
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const { t } = useI18n({ useScope: 'local' })
const skills = ref<SkillDefinition[]>([])
const selectedId = ref<string | null>(null)
const draft = ref<SkillDefinition | null>(null)
const triggerText = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const importOpen = ref(false)
const isNew = computed(() => selectedId.value === null)
const isImported = computed(() => Boolean(draft.value && draft.value.sourceType !== 'manual'))
const fileCounts = computed(() => {
  const counts = { script: 0, reference: 0, asset: 0, other: 0 }
  for (const file of draft.value?.files ?? []) {
    if (file.kind === 'instruction') continue
    counts[file.kind] += 1
  }
  return counts
})

function emptySkill(): SkillDefinition {
  const now = new Date().toISOString()
  return {
    id: '',
    name: '',
    description: '',
    instructions: '',
    triggers: [],
    enabled: true,
    sourceType: 'manual',
    sourceUrl: '',
    contentHash: '',
    rootPath: '',
    license: '',
    compatibility: '',
    allowedTools: [],
    files: [],
    createdAt: now,
    updatedAt: now
  }
}

function selectSkill(skill: SkillDefinition): void {
  selectedId.value = skill.id
  draft.value = { ...skill, triggers: [...skill.triggers] }
  triggerText.value = skill.triggers.join('\n')
  error.value = ''
}

function createSkill(): void {
  selectedId.value = null
  draft.value = emptySkill()
  triggerText.value = ''
  error.value = ''
}

function handleImported(result: SkillImportResult): void {
  for (const skill of result.skills) {
    const index = skills.value.findIndex((item) => item.id === skill.id)
    if (index === -1) skills.value.push(skill)
    else skills.value[index] = skill
  }
  skills.value.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name))
  if (result.skills[0]) selectSkill(result.skills[0])
}

function normalizeId(value: string): string {
  return value
    .toLocaleLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function updateName(name: string): void {
  if (!draft.value) return
  draft.value.name = name
  if (isNew.value && !draft.value.id) draft.value.id = normalizeId(name)
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    skills.value = await window.api.chat.querySkills()
    if (skills.value.length) selectSkill(skills.value[0])
    else createSkill()
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : t('loadFailed')
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!draft.value || saving.value) return
  const request: SkillDefinition = {
    ...draft.value,
    id: normalizeId(draft.value.id),
    triggers: [
      ...new Set(
        triggerText.value
          .split(/[\n,，]/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    ]
  }
  saving.value = true
  error.value = ''
  try {
    const saved = isNew.value
      ? await window.api.chat.createSkill(request)
      : await window.api.chat.updateSkill(request)
    const index = skills.value.findIndex((skill) => skill.id === saved.id)
    if (index === -1) skills.value.push(saved)
    else skills.value[index] = saved
    skills.value.sort(
      (a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name)
    )
    selectSkill(saved)
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : t('saveFailed')
  } finally {
    saving.value = false
  }
}

async function remove(): Promise<void> {
  if (!draft.value || isNew.value || saving.value) return
  if (!window.confirm(t('deleteConfirm', { name: draft.value.name }))) return
  saving.value = true
  error.value = ''
  try {
    await window.api.chat.deleteSkill(draft.value.id)
    skills.value = skills.value.filter((skill) => skill.id !== draft.value?.id)
    if (skills.value.length) selectSkill(skills.value[0])
    else createSkill()
  } catch (deleteError) {
    error.value = deleteError instanceof Error ? deleteError.message : t('deleteFailed')
  } finally {
    saving.value = false
  }
}

watch(
  open,
  (isOpen) => {
    if (isOpen) void load()
  },
  { immediate: true }
)
</script>

<template>
  <DialogRoot v-model:open="open" :modal="!props.embedded">
    <DialogPortal :disabled="props.embedded">
      <DialogOverlay v-if="!props.embedded" class="skill-dialog-overlay" />
      <DialogContent
        class="skill-dialog-content"
        :class="{ embedded: props.embedded }"
        @open-auto-focus.prevent
      >
        <header class="skill-dialog-header">
          <span class="skill-title-icon"><Sparkles :size="19" /></span>
          <div>
            <DialogTitle class="skill-dialog-title">{{ t('title') }}</DialogTitle>
            <DialogDescription class="skill-dialog-description">
              {{ t('description') }}
            </DialogDescription>
          </div>
          <DialogClose v-if="!props.embedded" class="dialog-close" :aria-label="t('common.close')">
            <X :size="18" />
          </DialogClose>
        </header>

        <div class="skill-dialog-body">
          <aside class="skill-list">
            <button class="new-skill-button" type="button" @click="createSkill">
              <Plus :size="15" /> {{ t('newSkill') }}
            </button>
            <button
              class="new-skill-button import-skill-button"
              type="button"
              @click="importOpen = true"
            >
              <Download :size="15" /> {{ t('importSkill') }}
            </button>
            <p v-if="loading" class="skill-empty">{{ t('common.loading') }}</p>
            <p v-else-if="!skills.length" class="skill-empty">{{ t('empty') }}</p>
            <button
              v-for="skill in skills"
              :key="skill.id"
              class="skill-list-item"
              :class="{ active: selectedId === skill.id }"
              type="button"
              @click="selectSkill(skill)"
            >
              <span>{{ skill.name }}</span>
              <small>/{{ skill.id }}</small>
              <i :class="{ enabled: skill.enabled }"></i>
            </button>
          </aside>

          <form
            v-if="draft"
            class="skill-form"
            :class="{ 'has-import-summary': isImported }"
            @submit.prevent="save"
          >
            <div v-if="isImported" class="imported-skill-summary">
              <div>
                <span><Download :size="14" /></span>
                <p>
                  <strong>{{ t(`sourceTypes.${draft.sourceType}`) }}</strong>
                  <small :title="draft.sourceUrl">{{ draft.sourceUrl }}</small>
                </p>
              </div>
              <div class="skill-file-counts">
                <span
                  ><FileCode2 :size="12" />
                  {{ t('scriptsCount', { count: fileCounts.script }) }}</span
                >
                <span>{{ t('referencesCount', { count: fileCounts.reference }) }}</span>
                <span>{{ t('assetsCount', { count: fileCounts.asset }) }}</span>
              </div>
              <small>{{ t('importedReadonly') }}</small>
            </div>
            <div class="skill-form-scroll">
              <label>
                <span>{{ t('name') }}</span>
                <input
                  :value="draft.name"
                  maxlength="80"
                  :disabled="isImported"
                  :placeholder="t('namePlaceholder')"
                  @input="updateName(($event.target as HTMLInputElement).value)"
                />
              </label>
              <label>
                <span>{{ t('id') }}</span>
                <input
                  v-model="draft.id"
                  maxlength="64"
                  :disabled="!isNew"
                  placeholder="weather-comparison"
                  @blur="draft.id = normalizeId(draft.id)"
                />
                <small>{{ t('idHelp') }}</small>
              </label>
              <label>
                <span>{{ t('skillDescription') }}</span>
                <input
                  v-model="draft.description"
                  maxlength="1024"
                  :disabled="isImported"
                  :placeholder="t('descriptionPlaceholder')"
                />
              </label>
              <label>
                <span>{{ t('triggers') }}</span>
                <textarea
                  v-model="triggerText"
                  rows="3"
                  :disabled="isImported"
                  :placeholder="t('triggersPlaceholder')"
                ></textarea>
                <small>{{ t('triggersHelp') }}</small>
              </label>
              <label class="instructions-field">
                <span>{{ t('instructions') }}</span>
                <textarea
                  v-model="draft.instructions"
                  rows="9"
                  maxlength="100000"
                  :disabled="isImported"
                  :placeholder="t('instructionsPlaceholder')"
                ></textarea>
              </label>
              <label class="enabled-field">
                <input v-model="draft.enabled" type="checkbox" />
                <span>{{ t('enabled') }}</span>
              </label>
            </div>
            <div class="skill-form-footer">
              <p v-if="error" class="form-error">{{ error }}</p>
              <div class="skill-form-actions">
                <button
                  class="delete-skill-button"
                  type="button"
                  :disabled="isNew || saving"
                  @click="remove"
                >
                  <Trash2 :size="14" /> {{ t('common.delete') }}
                </button>
                <span></span>
                <DialogClose v-if="!props.embedded" class="secondary-button" type="button">
                  {{ t('common.cancel') }}
                </DialogClose>
                <button
                  class="primary-button"
                  type="submit"
                  :disabled="
                    saving || !draft.name.trim() || !draft.id.trim() || !draft.instructions.trim()
                  "
                >
                  {{ saving ? t('saving') : t('save') }}
                </button>
              </div>
            </div>
          </form>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
  <SkillImportDialog
    v-model:open="importOpen"
    :installed-skill-ids="skills.map((skill) => skill.id)"
    @imported="handleImported"
  />
</template>

<style scoped>
.skill-dialog-overlay {
  position: fixed;
  z-index: 120;
  inset: 0;
  background: var(--app-dialog-overlay);
}
.skill-dialog-content {
  position: fixed;
  z-index: 121;
  top: 50%;
  left: 50%;
  display: grid;
  width: min(820px, calc(100vw - 40px));
  height: min(760px, calc(100vh - 48px));
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  outline: none;
  background: var(--app-surface);
  box-shadow: 0 24px 70px rgb(0 0 0 / 28%);
  color: var(--app-text-secondary);
  transform: translate(-50%, -50%);
  grid-template-rows: auto minmax(0, 1fr);
}

.skill-dialog-content.embedded {
  position: relative;
  z-index: auto;
  top: auto;
  left: auto;
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  transform: none;
}
.skill-dialog-header {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.skill-title-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: var(--app-accent-soft);
  color: var(--app-accent);
}
.skill-dialog-header > div {
  min-width: 0;
  flex: 1;
}
.skill-dialog-title {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 650;
}
.skill-dialog-description {
  margin-top: 3px;
  color: var(--app-text-muted);
  font-size: 12px;
}
.skill-dialog-body {
  display: grid;
  min-height: 0;
  overflow: hidden;
  grid-template-columns: 220px 1fr;
}
.skill-list {
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
  border-right: 1px solid var(--app-border-subtle);
  background: var(--app-surface-subtle);
}
.new-skill-button,
.skill-list-item {
  width: 100%;
  border: 0;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
}
.new-skill-button {
  display: flex;
  height: 34px;
  align-items: center;
  gap: 7px;
  padding: 0 9px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 12px;
}
.new-skill-button:hover {
  background: var(--app-hover);
}
.import-skill-button {
  margin-bottom: 8px;
  color: var(--app-accent);
}
.skill-list-item {
  position: relative;
  display: grid;
  gap: 2px;
  margin-top: 3px;
  padding: 8px 24px 8px 9px;
  background: transparent;
  color: var(--app-text-secondary);
}
.skill-list-item:hover {
  background: var(--app-hover);
}
.skill-list-item.active {
  background: var(--app-active);
  color: var(--app-text);
}
.skill-list-item span {
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skill-list-item small {
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skill-list-item i {
  position: absolute;
  top: 12px;
  right: 9px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--app-text-muted);
}
.skill-list-item i.enabled {
  background: var(--app-success);
}
.skill-empty {
  padding: 18px 8px;
  color: var(--app-text-muted);
  font-size: 11px;
  text-align: center;
}
.skill-form {
  display: grid;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  grid-template-rows: minmax(0, 1fr) auto;
}
.skill-form.has-import-summary {
  grid-template-rows: auto minmax(0, 1fr) auto;
}
.skill-form-scroll {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: 11px;
  padding: 20px 22px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.imported-skill-summary {
  display: grid;
  gap: 8px;
  padding: 14px 22px;
  border-bottom: 1px solid var(--app-border-subtle);
  background: var(--app-surface-subtle);
}
.imported-skill-summary > div:first-child {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.imported-skill-summary > div:first-child > span {
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--app-accent-soft);
  color: var(--app-accent);
}
.imported-skill-summary p {
  display: grid;
  min-width: 0;
  gap: 2px;
  margin: 0;
}
.imported-skill-summary strong {
  color: var(--app-text);
  font-size: 11px;
}
.imported-skill-summary small {
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 9px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skill-file-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.skill-file-counts span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 6px;
  border-radius: 6px;
  background: var(--app-surface-muted);
  color: var(--app-text-tertiary);
  font-size: 9px;
}
.skill-form label {
  display: grid;
  gap: 5px;
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 600;
}
.skill-form label small {
  color: var(--app-text-muted);
  font-size: 9px;
  font-weight: 400;
}
.skill-form input[type='text'],
.skill-form input:not([type]),
.skill-form textarea {
  width: 100%;
  padding: 8px 9px;
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  outline: none;
  background: var(--app-bg);
  color: var(--app-text);
  font: inherit;
  font-size: 12px;
  font-weight: 400;
  resize: vertical;
}
.skill-form input:focus,
.skill-form textarea:focus {
  border-color: var(--app-text-muted);
}
.skill-form input:disabled {
  opacity: 0.65;
}
.enabled-field {
  display: flex !important;
  align-items: center;
  grid-template-columns: auto 1fr;
}
.enabled-field input {
  accent-color: var(--app-accent);
}
.form-error {
  margin: 0;
  padding: 10px 20px 0;
  color: var(--app-danger);
  font-size: 11px;
}
.skill-form-footer {
  border-top: 1px solid var(--app-border-subtle);
  background: var(--app-surface);
  box-shadow: 0 -8px 20px rgb(0 0 0 / 4%);
}
.skill-form-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 13px 22px;
}
.skill-form-actions > span {
  flex: 1;
}
.skill-form-actions button {
  display: inline-flex;
  height: 36px;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.secondary-button {
  border: 1px solid var(--app-border-strong);
  background: var(--app-surface);
  color: var(--app-text-secondary);
}
.primary-button {
  border: 1px solid var(--app-inverse-bg);
  background: var(--app-inverse-bg);
  color: var(--app-inverse-text);
}
.delete-skill-button {
  border: 1px solid transparent;
  background: transparent;
  color: var(--app-danger);
}
.skill-form-actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
@media (max-width: 680px) {
  .skill-dialog-body {
    grid-template-columns: 170px 1fr;
  }
}
</style>

<i18n lang="yaml">
zh-CN:
  title: Skill 管理
  description: 创建可复用的 Agent 工作流程；输入 / 后按名称选择，或通过触发词启用。
  newSkill: 新建 Skill
  importSkill: 导入 Skill
  empty: 还没有 Skill
  name: 名称
  namePlaceholder: 例如：天气对比
  id: Skill ID
  idHelp: 系统内部用于稳定识别 Skill；输入 / 时展示的是 Skill 名称。保存后不可修改。
  skillDescription: 描述
  descriptionPlaceholder: 简要说明这个 Skill 解决什么问题
  triggers: 自动触发词
  triggersPlaceholder: 每行一个，例如：天气对比
  triggersHelp: 支持换行或逗号分隔；没有触发词时可输入 / 后手动选择。
  instructions: 执行指令
  instructionsPlaceholder: 写明执行步骤、工具使用、输出格式和约束…
  enabled: 启用此 Skill
  importedReadonly: 导入内容由 SKILL.md 管理；本地文件夹会自动同步，这里可以启用、停用或卸载。
  scriptsCount: 脚本 {count}
  referencesCount: 参考文档 {count}
  assetsCount: 资源 {count}
  sourceTypes:
    folder: 本地文件夹
    zip: ZIP 压缩包
    github: GitHub
    official-openai: OpenAI 官方目录
    official-anthropic: Anthropic 官方目录
    official-minimax: MiniMax 官方目录
    official-modelscope: 魔搭官方生态目录
    manual: 手动创建
  save: 保存
  saving: 保存中…
  loadFailed: 加载 Skill 失败
  saveFailed: 保存 Skill 失败
  deleteFailed: 删除 Skill 失败
  deleteConfirm: 确定删除“{name}”吗？
en:
  title: Skill management
  description: Create reusable Agent workflows selected by name after typing /, or activated by triggers.
  newSkill: New Skill
  importSkill: Import Skill
  empty: No Skills yet
  name: Name
  namePlaceholder: e.g. Weather comparison
  id: Skill ID
  idHelp: A stable internal identifier. The Skill name is shown after typing /. It cannot be changed after saving.
  skillDescription: Description
  descriptionPlaceholder: Briefly explain what this Skill does
  triggers: Auto triggers
  triggersPlaceholder: One per line, e.g. compare weather
  triggersHelp: Separate with lines or commas. Without triggers, type / and select the Skill manually.
  instructions: Instructions
  instructionsPlaceholder: Define steps, tool usage, output format, and constraints…
  enabled: Enable this Skill
  importedReadonly: Imported content is managed by SKILL.md. Local folders sync automatically; you can enable, disable, or uninstall here.
  scriptsCount: '{count} scripts'
  referencesCount: '{count} references'
  assetsCount: '{count} assets'
  sourceTypes:
    folder: Local folder
    zip: ZIP archive
    github: GitHub
    official-openai: OpenAI official catalog
    official-anthropic: Anthropic official catalog
    official-minimax: MiniMax official catalog
    official-modelscope: ModelScope official ecosystem catalog
    manual: Manually created
  save: Save
  saving: Saving…
  loadFailed: Failed to load Skills
  saveFailed: Failed to save Skill
  deleteFailed: Failed to delete Skill
  deleteConfirm: Delete “{name}”?
</i18n>
