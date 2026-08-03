<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle, TooltipProvider } from 'reka-ui'
import AppSidebar from './components/layout/AppSidebar.vue'
import AppTopbar from './components/layout/AppTopbar.vue'
import ChatView from './components/chat/ChatView.vue'
import ModelManagerDialog from './components/model/ModelManagerDialog.vue'
import type { ModelConfig, Session } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'

type SplitterPanelInstance = {
  collapse: () => void
  expand: () => void
}

const sidebarOpen = ref(true)
const sidebarPanel = ref<SplitterPanelInstance | null>(null)
const isMac = navigator.userAgent.includes('Mac')
const sessions = ref<Session[]>([])
const pendingSessionIds = ref(new Set<string>())
const persistingSessionIds = ref(new Set<string>())
const activeSessionId = ref<string | null>(null)
const sessionsLoading = ref(true)
const sessionError = ref('')
const modelConfigs = ref<ModelConfig[]>([])
const modelsLoading = ref(true)
const modelError = ref('')
const modelManagerOpen = ref(false)
const { t } = useI18n({ useScope: 'local' })
const defaultSessionTitles = new Set(['新对话', 'New chat'])

const activeSession = computed(
  () => sessions.value.find((session) => session.id === activeSessionId.value) ?? null
)
const activeModelConfig = computed(
  () => modelConfigs.value.find((config) => config.isActive) ?? null
)
const activeSessionPersisted = computed(
  () => !!activeSessionId.value && !pendingSessionIds.value.has(activeSessionId.value)
)
const persistedSessions = computed(() =>
  sessions.value.filter((session) => !pendingSessionIds.value.has(session.id))
)

function sortSessions(): void {
  sessions.value.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function makeSession(): Session {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: t('newConversation'),
    createdAt: now,
    updatedAt: now
  }
}

function discardPendingSessions(exceptId?: string): void {
  for (const id of pendingSessionIds.value) {
    if (id === exceptId || persistingSessionIds.value.has(id)) continue
    pendingSessionIds.value.delete(id)
    sessions.value = sessions.value.filter((session) => session.id !== id)
    if (activeSessionId.value === id) activeSessionId.value = null
  }
}

function startNewSession(): void {
  sessionError.value = ''
  discardPendingSessions()
  const session = makeSession()
  pendingSessionIds.value.add(session.id)
  sessions.value.unshift(session)
  activeSessionId.value = session.id
}

function selectSession(id: string): void {
  discardPendingSessions(id)
  activeSessionId.value = id
}

async function persistSession(id: string): Promise<boolean> {
  if (!pendingSessionIds.value.has(id)) return true

  const session = sessions.value.find((item) => item.id === id)
  if (!session) return false

  sessionError.value = ''
  persistingSessionIds.value.add(id)
  try {
    const created = await window.api.chat.createSession({ ...session })
    const index = sessions.value.findIndex((item) => item.id === id)
    if (index !== -1) sessions.value[index] = created
    else sessions.value.push(created)
    pendingSessionIds.value.delete(id)
    sortSessions()
    return true
  } catch (error) {
    sessionError.value = error instanceof Error ? error.message : t('errors.createSession')
    return false
  } finally {
    persistingSessionIds.value.delete(id)
    if (activeSessionId.value !== id && pendingSessionIds.value.has(id)) {
      pendingSessionIds.value.delete(id)
      sessions.value = sessions.value.filter((item) => item.id !== id)
    }
  }
}

async function renameSession(session: Session): Promise<void> {
  const title = window.prompt(t('renamePrompt'), session.title)?.trim()
  if (!title || title === session.title) return

  sessionError.value = ''
  if (persistingSessionIds.value.has(session.id)) return
  if (pendingSessionIds.value.has(session.id)) {
    const index = sessions.value.findIndex((item) => item.id === session.id)
    if (index !== -1) {
      sessions.value[index] = { ...session, title, updatedAt: new Date().toISOString() }
    }
    return
  }

  try {
    const updated = await window.api.chat.updateSession({
      ...session,
      title,
      updatedAt: new Date().toISOString()
    })
    const index = sessions.value.findIndex((item) => item.id === updated.id)
    if (index !== -1) sessions.value[index] = updated
    sortSessions()
  } catch (error) {
    sessionError.value = error instanceof Error ? error.message : t('errors.renameSession')
  }
}

async function deleteSession(session: Session): Promise<void> {
  if (!window.confirm(t('deleteConfirm', { title: session.title }))) return

  sessionError.value = ''
  if (pendingSessionIds.value.has(session.id)) {
    pendingSessionIds.value.delete(session.id)
    sessions.value = sessions.value.filter((item) => item.id !== session.id)
    activeSessionId.value = sessions.value[0]?.id ?? null
    if (!activeSessionId.value) startNewSession()
    return
  }

  try {
    await window.api.chat.deleteSession(session.id)
    const deletedIndex = sessions.value.findIndex((item) => item.id === session.id)
    sessions.value = sessions.value.filter((item) => item.id !== session.id)
    if (activeSessionId.value === session.id) {
      activeSessionId.value =
        sessions.value[Math.min(Math.max(deletedIndex, 0), sessions.value.length - 1)]?.id ?? null
    }
    if (!activeSessionId.value) startNewSession()
  } catch (error) {
    sessionError.value = error instanceof Error ? error.message : t('errors.deleteSession')
  }
}

async function updateSessionFromMessage(sessionId: string, content: string): Promise<void> {
  const session = sessions.value.find((item) => item.id === sessionId)
  if (!session) return

  const title = defaultSessionTitles.has(session.title)
    ? content.replace(/\s+/g, ' ').trim().slice(0, 28)
    : session.title
  if (!title) return

  try {
    const updated = await window.api.chat.updateSession({
      ...session,
      title,
      updatedAt: new Date().toISOString()
    })
    const index = sessions.value.findIndex((item) => item.id === updated.id)
    if (index !== -1) sessions.value[index] = updated
    sortSessions()
  } catch (error) {
    sessionError.value = error instanceof Error ? error.message : t('errors.updateSession')
  }
}

async function loadSessions(): Promise<void> {
  sessionsLoading.value = true
  sessionError.value = ''
  try {
    sessions.value = await window.api.chat.querySession()
    sortSessions()
    if (sessions.value.length > 0) {
      activeSessionId.value = sessions.value[0].id
    } else {
      startNewSession()
    }
  } catch (error) {
    sessionError.value = error instanceof Error ? error.message : t('errors.loadSessions')
  } finally {
    sessionsLoading.value = false
  }
}

async function loadModelConfigs(): Promise<void> {
  modelsLoading.value = true
  modelError.value = ''
  try {
    modelConfigs.value = await window.api.chat.queryModelConfigs()
  } catch (error) {
    modelError.value = error instanceof Error ? error.message : t('errors.loadModels')
  } finally {
    modelsLoading.value = false
  }
}

async function saveModelConfig(config: ModelConfig): Promise<boolean> {
  modelError.value = ''
  try {
    const exists = modelConfigs.value.some((item) => item.id === config.id)
    const saved = exists
      ? await window.api.chat.updateModelConfig(config)
      : await window.api.chat.createModelConfig(config)
    const index = modelConfigs.value.findIndex((item) => item.id === saved.id)
    if (index === -1) modelConfigs.value.push(saved)
    else modelConfigs.value[index] = saved
    modelConfigs.value.sort(
      (a, b) => Number(b.isActive) - Number(a.isActive) || b.updatedAt.localeCompare(a.updatedAt)
    )
    return true
  } catch (error) {
    modelError.value = error instanceof Error ? error.message : t('errors.saveModel')
    return false
  }
}

async function deleteModelConfig(id: string): Promise<boolean> {
  modelError.value = ''
  try {
    await window.api.chat.deleteModelConfig(id)
    await loadModelConfigs()
    return true
  } catch (error) {
    modelError.value = error instanceof Error ? error.message : t('errors.deleteModel')
    return false
  }
}

async function selectModelConfig(id: string): Promise<boolean> {
  modelError.value = ''
  try {
    await window.api.chat.selectModelConfig(id)
    modelConfigs.value = modelConfigs.value.map((config) => ({
      ...config,
      isActive: config.id === id
    }))
    return true
  } catch (error) {
    modelError.value = error instanceof Error ? error.message : t('errors.selectModel')
    return false
  }
}

function closeSidebar(): void {
  sidebarPanel.value?.collapse()
}

function openSidebar(): void {
  sidebarPanel.value?.expand()
}

onMounted(() => Promise.all([loadSessions(), loadModelConfigs()]))
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <SplitterGroup class="app-shell" direction="horizontal">
      <SplitterPanel
        id="sidebar"
        ref="sidebarPanel"
        :order="1"
        :default-size="28"
        :min-size="10"
        :max-size="42"
        :collapsed-size="0"
        collapsible
        @collapse="sidebarOpen = false"
        @expand="sidebarOpen = true"
      >
        <AppSidebar
          v-if="sidebarOpen"
          :is-mac="isMac"
          :sessions="persistedSessions"
          :active-session-id="activeSessionId"
          :loading="sessionsLoading"
          :error="sessionError"
          @close="closeSidebar"
          @create="startNewSession"
          @select="selectSession"
          @rename="renameSession"
          @delete="deleteSession"
          @manage-models="modelManagerOpen = true"
        />
      </SplitterPanel>

      <SplitterResizeHandle
        id="sidebar-resize-handle"
        class="splitter-handle"
        :class="{ collapsed: !sidebarOpen }"
      />

      <SplitterPanel id="workspace" :order="2" :min-size="58">
        <section class="workspace">
          <AppTopbar
            :is-mac="isMac"
            :sidebar-open="sidebarOpen"
            :session="activeSession"
            :model-configs="modelConfigs"
            :active-model-config="activeModelConfig"
            :models-loading="modelsLoading"
            @open-sidebar="openSidebar"
            @rename="activeSession && renameSession(activeSession)"
            @delete="activeSession && deleteSession(activeSession)"
            @select-model="selectModelConfig"
            @manage-models="modelManagerOpen = true"
          />
          <ChatView
            :session-id="activeSessionId"
            :session-persisted="activeSessionPersisted"
            :model-config="activeModelConfig"
            :disabled="sessionsLoading || modelsLoading || !activeSessionId || !activeModelConfig"
            :disabled-reason="!activeModelConfig ? t('configureModelFirst') : undefined"
            :ensure-session="persistSession"
            @message-sent="updateSessionFromMessage"
          />
        </section>
      </SplitterPanel>
    </SplitterGroup>
    <ModelManagerDialog
      v-model:open="modelManagerOpen"
      :configs="modelConfigs"
      :active-id="activeModelConfig?.id ?? null"
      :error="modelError"
      :save-config="saveModelConfig"
      :delete-config="deleteModelConfig"
      :select-config="selectModelConfig"
    />
  </TooltipProvider>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  min-width: 520px;
  overflow: hidden;
  background: #ffffff;
  color: #182230;
  font-family:
    Inter,
    ui-sans-serif,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.workspace {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  flex-direction: column;
}

.splitter-handle {
  position: relative;
  z-index: 10;
  width: 7px;
  flex: 0 0 7px;
  margin: 0 -3px;
  background: transparent;
  cursor: col-resize;
  outline: none;
}

.splitter-handle::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: #e4e7ec;
  content: '';
  transform: translateX(-50%);
  transition: background 140ms ease;
}

.splitter-handle:hover::before,
.splitter-handle[data-state='drag']::before,
.splitter-handle:focus-visible::before {
  background: #7f8a9b;
}

.splitter-handle.collapsed {
  width: 0;
  flex-basis: 0;
  margin: 0;
  cursor: default;
}

.splitter-handle.collapsed::before {
  display: none;
}
</style>

<i18n lang="yaml">
zh-CN:
  newConversation: 新对话
  renamePrompt: 重命名对话
  deleteConfirm: 确定删除“{title}”吗？
  configureModelFirst: 请先配置模型
en:
  newConversation: New chat
  renamePrompt: Rename chat
  deleteConfirm: Delete “{title}”?
  configureModelFirst: Configure a model first
</i18n>
