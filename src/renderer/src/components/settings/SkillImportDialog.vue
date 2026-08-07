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
import {
  Download,
  FileArchive,
  FolderDown,
  GitFork,
  LoaderCircle,
  Search,
  ShieldCheck,
  X
} from '@lucide/vue'
import type { SkillCatalogEntry, SkillCatalogId, SkillImportResult } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ installedSkillIds: string[] }>()
const emit = defineEmits<{ imported: [result: SkillImportResult] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n({ useScope: 'local' })

const busy = ref(false)
const error = ref('')
const notice = ref('')
const githubUrl = ref('')
const activeCatalog = ref<SkillCatalogId | null>(null)
const catalogEntries = ref<SkillCatalogEntry[]>([])
const catalogLoading = ref(false)
const catalogSearch = ref('')
const installingCatalogIds = ref<string[]>([])
const installedIds = computed(() => new Set(props.installedSkillIds))
const filteredCatalogEntries = computed(() => {
  const query = catalogSearch.value.trim().toLocaleLowerCase()
  if (!query) return catalogEntries.value
  return catalogEntries.value.filter(
    (entry) =>
      entry.name.toLocaleLowerCase().includes(query) ||
      entry.description.toLocaleLowerCase().includes(query) ||
      entry.skillId.toLocaleLowerCase().includes(query)
  )
})

function resultMessage(result: SkillImportResult): string {
  if (!result.skills.length && !result.errors.length) return ''
  if (!result.skills.length) return result.errors.join('\n')
  return t('importedCount', { count: result.skills.length })
}

async function runImport(action: () => Promise<SkillImportResult>): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await action()
    if (result.skills.length) emit('imported', result)
    notice.value = resultMessage(result)
    if (result.errors.length) error.value = result.errors.join('\n')
  } catch (importError) {
    error.value = importError instanceof Error ? importError.message : t('importFailed')
  } finally {
    busy.value = false
  }
}

function importFolder(): void {
  void runImport(() => window.api.chat.importSkillFolder())
}

function importZip(): void {
  void runImport(() => window.api.chat.importSkillZip())
}

function importGithub(): void {
  const url = githubUrl.value.trim()
  if (!url) return
  void runImport(() => window.api.chat.importSkillGithub({ url }))
}

async function loadCatalog(catalogId: SkillCatalogId): Promise<void> {
  if (catalogLoading.value) return
  activeCatalog.value = catalogId
  catalogLoading.value = true
  catalogEntries.value = []
  catalogSearch.value = ''
  error.value = ''
  notice.value = ''
  try {
    catalogEntries.value = await window.api.chat.querySkillCatalog(catalogId)
  } catch (catalogError) {
    error.value = catalogError instanceof Error ? catalogError.message : t('catalogFailed')
  } finally {
    catalogLoading.value = false
  }
}

async function installCatalogSkill(entry: SkillCatalogEntry): Promise<void> {
  if (installedIds.value.has(entry.skillId) || installingCatalogIds.value.includes(entry.id)) return
  installingCatalogIds.value = [...installingCatalogIds.value, entry.id]
  error.value = ''
  notice.value = ''
  try {
    const result = await window.api.chat.importSkillGithub({
      url: entry.sourceUrl,
      sourceType: entry.sourceType
    })
    if (result.skills.length) emit('imported', result)
    notice.value = resultMessage(result)
    if (result.errors.length) error.value = result.errors.join('\n')
  } catch (installError) {
    error.value = installError instanceof Error ? installError.message : t('importFailed')
  } finally {
    installingCatalogIds.value = installingCatalogIds.value.filter((id) => id !== entry.id)
  }
}

watch(open, (isOpen) => {
  if (!isOpen) return
  error.value = ''
  notice.value = ''
})
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="skill-import-overlay" />
      <DialogContent class="skill-import-dialog" @open-auto-focus.prevent>
        <header class="skill-import-header">
          <span class="skill-import-title-icon"><Download :size="18" /></span>
          <div>
            <DialogTitle class="skill-import-title">{{ t('title') }}</DialogTitle>
            <DialogDescription class="skill-import-description">
              {{ t('description') }}
            </DialogDescription>
          </div>
          <DialogClose class="skill-import-close" :aria-label="t('common.close')">
            <X :size="18" />
          </DialogClose>
        </header>

        <div class="skill-import-body">
          <section class="local-import-options">
            <button type="button" :disabled="busy" @click="importFolder">
              <span><FolderDown :size="19" /></span>
              <strong>{{ t('folder') }}</strong>
              <small>{{ t('folderHelp') }}</small>
            </button>
            <button type="button" :disabled="busy" @click="importZip">
              <span><FileArchive :size="19" /></span>
              <strong>{{ t('zip') }}</strong>
              <small>{{ t('zipHelp') }}</small>
            </button>
          </section>

          <section class="github-import-section">
            <div class="section-heading">
              <span><GitFork :size="16" /></span>
              <div>
                <strong>{{ t('github') }}</strong>
                <small>{{ t('githubHelp') }}</small>
              </div>
            </div>
            <form class="github-import-form" @submit.prevent="importGithub">
              <input
                v-model="githubUrl"
                type="url"
                required
                placeholder="https://github.com/owner/repo/tree/main/skill"
              />
              <button type="submit" :disabled="busy || !githubUrl.trim()">
                <LoaderCircle v-if="busy" class="spin" :size="14" />
                <Download v-else :size="14" />
                {{ t('import') }}
              </button>
            </form>
          </section>

          <section class="official-catalog-section">
            <div class="section-heading">
              <span><ShieldCheck :size="16" /></span>
              <div>
                <strong>{{ t('official') }}</strong>
                <small>{{ t('officialHelp') }}</small>
              </div>
            </div>
            <div class="catalog-source-buttons">
              <button
                type="button"
                :class="{ active: activeCatalog === 'openai' }"
                @click="loadCatalog('openai')"
              >
                OpenAI
              </button>
              <button
                type="button"
                :class="{ active: activeCatalog === 'anthropic' }"
                @click="loadCatalog('anthropic')"
              >
                Anthropic
              </button>
              <button
                type="button"
                :class="{ active: activeCatalog === 'minimax' }"
                @click="loadCatalog('minimax')"
              >
                MiniMax
              </button>
              <button
                type="button"
                :class="{ active: activeCatalog === 'modelscope' }"
                @click="loadCatalog('modelscope')"
              >
                魔搭
              </button>
            </div>

            <div v-if="activeCatalog" class="catalog-browser">
              <label class="catalog-search">
                <Search :size="14" />
                <input v-model="catalogSearch" :placeholder="t('searchCatalog')" />
              </label>
              <div class="catalog-list">
                <p v-if="catalogLoading" class="catalog-status">
                  <LoaderCircle class="spin" :size="15" /> {{ t('loadingCatalog') }}
                </p>
                <p v-else-if="!filteredCatalogEntries.length" class="catalog-status">
                  {{ t('emptyCatalog') }}
                </p>
                <article v-for="entry in filteredCatalogEntries" :key="entry.id">
                  <div>
                    <strong>{{ entry.name }}</strong>
                    <small>{{ entry.description }}</small>
                  </div>
                  <button
                    type="button"
                    :disabled="
                      installedIds.has(entry.skillId) || installingCatalogIds.includes(entry.id)
                    "
                    @click="installCatalogSkill(entry)"
                  >
                    <LoaderCircle
                      v-if="installingCatalogIds.includes(entry.id)"
                      class="spin"
                      :size="13"
                    />
                    <Download v-else :size="13" />
                    {{ installedIds.has(entry.skillId) ? t('installed') : t('install') }}
                  </button>
                </article>
              </div>
            </div>
          </section>

          <p v-if="notice" class="import-notice">{{ notice }}</p>
          <p v-if="error" class="import-error">{{ error }}</p>
          <p class="security-note"><ShieldCheck :size="13" /> {{ t('securityNote') }}</p>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.skill-import-overlay {
  position: fixed;
  z-index: 130;
  inset: 0;
  background: var(--app-dialog-overlay);
  backdrop-filter: blur(2px);
}

.skill-import-dialog {
  position: fixed;
  z-index: 131;
  top: 50%;
  left: 50%;
  width: min(680px, calc(100vw - 40px));
  max-height: min(780px, calc(100vh - 40px));
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 17px;
  outline: none;
  background: var(--app-surface);
  box-shadow: 0 28px 80px rgb(0 0 0 / 30%);
  color: var(--app-text-secondary);
  transform: translate(-50%, -50%);
}

.skill-import-header {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--app-border-subtle);
}

.skill-import-title-icon,
.section-heading > span,
.local-import-options button > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.skill-import-title-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: 10px;
}

.skill-import-header > div {
  min-width: 0;
  flex: 1;
}

.skill-import-title {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 650;
}

.skill-import-description {
  margin-top: 3px;
  color: var(--app-text-muted);
  font-size: 11px;
}

.skill-import-close {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
}

.skill-import-close:hover {
  background: var(--app-hover);
}

.skill-import-body {
  display: grid;
  max-height: calc(100vh - 150px);
  gap: 15px;
  padding: 18px 20px 20px;
  overflow-y: auto;
}

.local-import-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.local-import-options button {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 2px 9px;
  padding: 11px;
  border: 1px solid var(--app-border);
  border-radius: 11px;
  background: var(--app-surface-subtle);
  color: var(--app-text-secondary);
  text-align: left;
  cursor: pointer;
}

.local-import-options button:hover {
  border-color: var(--app-border-strong);
  background: var(--app-hover);
}

.local-import-options button > span {
  width: 34px;
  height: 34px;
  grid-row: 1 / 3;
  border-radius: 9px;
}

.local-import-options strong,
.section-heading strong {
  color: var(--app-text);
  font-size: 12px;
  font-weight: 650;
}

.local-import-options small,
.section-heading small {
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 10px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.github-import-section,
.official-catalog-section {
  display: grid;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--app-border-subtle);
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-heading > span {
  width: 29px;
  height: 29px;
  flex: 0 0 auto;
  border-radius: 8px;
}

.section-heading > div {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.github-import-form {
  display: flex;
  gap: 8px;
}

.github-import-form input,
.catalog-search {
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  background: var(--app-bg);
}

.github-import-form input {
  min-width: 0;
  height: 35px;
  flex: 1;
  padding: 0 10px;
  outline: none;
  color: var(--app-text);
  font-size: 11px;
}

.github-import-form button,
.catalog-list article button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--app-inverse-bg);
  border-radius: 8px;
  background: var(--app-inverse-bg);
  color: var(--app-inverse-text);
  font-size: 10px;
  font-weight: 650;
  cursor: pointer;
}

.github-import-form button {
  min-width: 82px;
  height: 35px;
  padding: 0 12px;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.catalog-source-buttons {
  display: flex;
  gap: 7px;
}

.catalog-source-buttons button {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: 10px;
  font-weight: 650;
  cursor: pointer;
}

.catalog-source-buttons button:hover,
.catalog-source-buttons button.active {
  border-color: var(--app-accent);
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.catalog-browser {
  display: grid;
  gap: 8px;
}

.catalog-search {
  display: flex;
  height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  color: var(--app-text-muted);
}

.catalog-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--app-text);
  font-size: 10px;
}

.catalog-list {
  max-height: 245px;
  overflow-y: auto;
  border: 1px solid var(--app-border);
  border-radius: 10px;
}

.catalog-list article {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-bottom: 1px solid var(--app-border-subtle);
}

.catalog-list article:last-child {
  border-bottom: 0;
}

.catalog-list article > div {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.catalog-list article strong {
  color: var(--app-text);
  font-size: 11px;
}

.catalog-list article small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 9px;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.catalog-list article button {
  min-width: 70px;
  height: 29px;
  flex: 0 0 auto;
  padding: 0 9px;
}

.catalog-status {
  display: flex;
  min-height: 70px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--app-text-muted);
  font-size: 10px;
}

.import-notice,
.import-error,
.security-note {
  font-size: 10px;
  line-height: 1.5;
  white-space: pre-line;
}

.import-notice {
  color: var(--app-success);
}

.import-error {
  color: var(--app-danger);
}

.security-note {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin: 0;
  padding: 8px 9px;
  border-radius: 8px;
  background: var(--app-surface-subtle);
  color: var(--app-text-muted);
}

.security-note svg {
  flex: 0 0 auto;
  margin-top: 1px;
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
  title: 导入 Skill
  description: 导入标准 Agent Skill 文件夹；安装脚本但不会自动执行。
  folder: 本地文件夹
  folderHelp: 选择一个 Skill 或包含多个 Skill 的目录
  zip: ZIP 压缩包
  zipHelp: 支持包含一个或多个 Skill 的 ZIP
  github: GitHub URL
  githubHelp: 支持仓库地址或具体 Skill 目录地址
  import: 导入
  official: 官方 Skill 目录
  officialHelp: 从 OpenAI、Anthropic、MiniMax 和魔搭的公开仓库选择安装
  searchCatalog: 按名称或描述搜索
  loadingCatalog: 正在读取官方目录…
  emptyCatalog: 没有匹配的 Skill
  install: 安装
  installed: 已安装
  importedCount: 已成功导入 {count} 个 Skill
  importFailed: Skill 导入失败
  catalogFailed: 官方 Skill 目录加载失败
  securityNote: 导入过程不会执行 scripts/ 中的代码；运行脚本时会逐次要求确认。第三方 Skill 仍可能包含恶意提示或代码，请确认来源可信。
en:
  title: Import Skills
  description: Import standard Agent Skill folders. Scripts are installed but never run automatically.
  folder: Local folder
  folderHelp: Choose one Skill or a directory containing multiple Skills
  zip: ZIP archive
  zipHelp: Import one or more Skills from a ZIP archive
  github: GitHub URL
  githubHelp: Use a repository URL or a direct Skill folder URL
  import: Import
  official: Official Skill catalogs
  officialHelp: Install from the public OpenAI, Anthropic, MiniMax, and ModelScope repositories
  searchCatalog: Search by name or description
  loadingCatalog: Loading official catalog…
  emptyCatalog: No matching Skills
  install: Install
  installed: Installed
  importedCount: Successfully imported {count} Skill(s)
  importFailed: Failed to import Skill
  catalogFailed: Failed to load official Skill catalog
  securityNote: Importing never executes code under scripts/. Running a script requires approval each time. Third-party Skills may still contain malicious instructions or code, so verify the source.
</i18n>
