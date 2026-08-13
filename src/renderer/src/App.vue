<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle, TooltipProvider } from 'reka-ui'
import AppSidebar from './components/layout/AppSidebar.vue'
import AppTopbar from './components/layout/AppTopbar.vue'
import SessionRenameDialog from './components/layout/SessionRenameDialog.vue'
import ChatView from './components/chat/ChatView.vue'
import RemoteChatsDialog from './components/settings/RemoteChatsDialog.vue'
import SettingsDialog from './components/settings/SettingsDialog.vue'
import type { ModelConfig, Session, TaskModePreference } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'
import { useAppTheme } from './theme'

type SplitterPanelInstance = {
  collapse: () => void
  expand: () => void
}

type SettingsSection = 'remote' | 'tasks' | 'skills' | 'search' | 'prompts' | 'models' | 'updates'

const sidebarOpen = ref(true)
const sidebarVisible = ref(true)
const sidebarTransitioning = ref(false)
const sidebarPanel = ref<SplitterPanelInstance | null>(null)
let sidebarTransitionTimer: ReturnType<typeof setTimeout> | undefined
const collapseSidebarBelowMinimum = (event: PointerEvent): void => {
  const groupLeft = document.querySelector('.app-shell')?.getBoundingClientRect().left ?? 0
  if (event.clientX - groupLeft < 250) {
    sidebarTransitioning.value = true
    sidebarPanel.value?.collapse()
  }
}
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
const settingsOpen = ref(false)
const remoteChatsOpen = ref(false)
const taskResultsOpen = ref(false)
const taskResultTargetId = ref<string | null>(null)
const settingsSection = ref<SettingsSection>('remote')
const renameDialogOpen = ref(false)
const renameTarget = ref<Session | null>(null)
const promptSettingsVersion = ref(0)
const remoteSessionVersions = ref<Record<string, number>>({})
const { t } = useI18n({ useScope: 'local' })
const { theme, toggleTheme } = useAppTheme()
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
const remoteSessions = computed(() =>
  persistedSessions.value.filter((session) => isRemoteSession(session))
)
const taskResultSessions = computed(() =>
  persistedSessions.value.filter((session) => isScheduledSession(session))
)

function isRemoteSession(session: Session): boolean {
  return session.id.startsWith('remote-feishu-')
}

function isScheduledSession(session: Session): boolean {
  return session.id.startsWith('scheduled-')
}

function isSpecialSession(session: Session): boolean {
  return isRemoteSession(session) || isScheduledSession(session)
}

function firstLocalSession(): Session | undefined {
  return sessions.value.find((session) => !isSpecialSession(session) && !session.isArchived)
}

function sortSessions(): void {
  sessions.value.sort(
    (a, b) =>
      Number(a.isArchived) - Number(b.isArchived) ||
      Number(b.isPinned) - Number(a.isPinned) ||
      b.updatedAt.localeCompare(a.updatedAt)
  )
}

function makeSession(): Session {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: t('newConversation'),
    createdAt: now,
    updatedAt: now,
    isPinned: false,
    isArchived: false,
    taskMode: 'auto'
  }
}

function discardPendingSessions(exceptId?: string): void {
  for (const id of pendingSessionIds.value) {
    if (id === exceptId || persistingSessionIds.value.has(id)) continue
    void window.api.chat
      .discardAttachmentSession(id)
      .catch((error) => console.warn('Failed to discard pending attachments', error))
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

function openRenameSession(session: Session): void {
  renameTarget.value = session
  renameDialogOpen.value = true
}

async function renameSession(session: Session, requestedTitle: string): Promise<void> {
  const title = requestedTitle.trim()
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
    const message = error instanceof Error ? error.message : t('errors.renameSession')
    sessionError.value = message
    throw error instanceof Error ? error : new Error(message)
  }
}

async function deleteSession(session: Session): Promise<void> {
  if (!window.confirm(t('deleteConfirm', { title: session.title }))) return

  sessionError.value = ''
  if (pendingSessionIds.value.has(session.id)) {
    pendingSessionIds.value.delete(session.id)
    sessions.value = sessions.value.filter((item) => item.id !== session.id)
    activeSessionId.value = firstLocalSession()?.id ?? null
    if (!activeSessionId.value) startNewSession()
    return
  }

  try {
    await window.api.chat.deleteSession(session.id)
    const deletedIndex = sessions.value.findIndex((item) => item.id === session.id)
    sessions.value = sessions.value.filter((item) => item.id !== session.id)
    if (activeSessionId.value === session.id) {
      const activeSessions = sessions.value.filter(
        (item) => !isSpecialSession(item) && !item.isArchived
      )
      activeSessionId.value =
        activeSessions[Math.min(Math.max(deletedIndex, 0), activeSessions.length - 1)]?.id ?? null
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
    const firstActiveSession = firstLocalSession()
    if (firstActiveSession) activeSessionId.value = firstActiveSession.id
    else startNewSession()
  } catch (error) {
    sessionError.value = error instanceof Error ? error.message : t('errors.loadSessions')
  } finally {
    sessionsLoading.value = false
  }
}

async function refreshSessionsFromRemote(sessionId?: string): Promise<void> {
  try {
    sessions.value = await window.api.chat.querySession()
    sortSessions()
    if (activeSession.value && isSpecialSession(activeSession.value)) {
      activeSessionId.value = firstLocalSession()?.id ?? null
      if (!activeSessionId.value) startNewSession()
    }
    if (sessionId) {
      remoteSessionVersions.value[sessionId] = (remoteSessionVersions.value[sessionId] ?? 0) + 1
    }
  } catch (error) {
    console.warn('Failed to refresh sessions after remote bot activity', error)
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

async function updateSessionManagement(
  session: Session,
  changes: Pick<Session, 'isPinned' | 'isArchived'>
): Promise<void> {
  if (pendingSessionIds.value.has(session.id)) return
  sessionError.value = ''
  try {
    const updated = await window.api.chat.updateSession({
      ...session,
      ...changes,
      updatedAt: session.updatedAt
    })
    const index = sessions.value.findIndex((item) => item.id === updated.id)
    if (index !== -1) sessions.value[index] = updated
    sortSessions()
    if (updated.isArchived && activeSessionId.value === updated.id) {
      activeSessionId.value = firstLocalSession()?.id ?? null
      if (!activeSessionId.value) startNewSession()
    }
  } catch (error) {
    sessionError.value = error instanceof Error ? error.message : t('errors.updateSession')
  }
}

async function togglePin(session: Session): Promise<void> {
  await updateSessionManagement(session, {
    isPinned: !session.isPinned,
    isArchived: session.isArchived
  })
}

async function toggleArchive(session: Session): Promise<void> {
  await updateSessionManagement(session, {
    isPinned: session.isArchived ? session.isPinned : false,
    isArchived: !session.isArchived
  })
}

async function exportSession(session: Session, format: 'markdown' | 'json'): Promise<void> {
  sessionError.value = ''
  try {
    await window.api.chat.exportSession({ sessionId: session.id, format })
  } catch (error) {
    sessionError.value = error instanceof Error ? error.message : t('errors.exportSession')
  }
}

async function toggleTaskMode(session: Session, taskMode: TaskModePreference): Promise<void> {
  sessionError.value = ''
  if (session.taskMode === taskMode) return
  if (pendingSessionIds.value.has(session.id)) {
    const index = sessions.value.findIndex((item) => item.id === session.id)
    if (index !== -1) sessions.value[index] = { ...session, taskMode }
    return
  }
  try {
    const updated = await window.api.chat.updateSession({
      ...session,
      taskMode,
      updatedAt: session.updatedAt
    })
    const index = sessions.value.findIndex((item) => item.id === updated.id)
    if (index !== -1) sessions.value[index] = updated
  } catch (error) {
    sessionError.value = error instanceof Error ? error.message : t('errors.updateSession')
  }
}

function closeSidebar(): void {
  sidebarTransitioning.value = true
  sidebarPanel.value?.collapse()
}

function openSidebar(): void {
  if (sidebarTransitionTimer) clearTimeout(sidebarTransitionTimer)
  sidebarVisible.value = true
  sidebarTransitioning.value = true
  void nextTick(() => requestAnimationFrame(() => sidebarPanel.value?.expand()))
}

function handleSidebarDragging(isDragging: boolean): void {
  if (isDragging) {
    window.addEventListener('pointermove', collapseSidebarBelowMinimum, true)
  } else {
    window.removeEventListener('pointermove', collapseSidebarBelowMinimum, true)
  }
}

function handleSidebarCollapse(): void {
  sidebarOpen.value = false
  if (sidebarTransitionTimer) clearTimeout(sidebarTransitionTimer)
  sidebarTransitionTimer = setTimeout(() => {
    sidebarVisible.value = false
    sidebarTransitioning.value = false
  }, 180)
}

function handleSidebarExpand(): void {
  sidebarOpen.value = true
  if (sidebarTransitionTimer) clearTimeout(sidebarTransitionTimer)
  sidebarTransitionTimer = setTimeout(() => {
    sidebarTransitioning.value = false
  }, 180)
}

function openSettings(section: SettingsSection = 'remote'): void {
  settingsSection.value = section
  settingsOpen.value = true
}

async function openTaskResult(sessionId: string): Promise<void> {
  sessionError.value = ''
  try {
    const refreshed = await window.api.chat.querySession()
    sessions.value = refreshed
    sortSessions()
    const resultSession = sessions.value.find((session) => session.id === sessionId)
    if (!resultSession) throw new Error(t('errors.taskResultMissing'))
    taskResultTargetId.value = sessionId
    taskResultsOpen.value = true
  } catch (error) {
    sessionError.value =
      error instanceof Error ? error.message : t('errors.taskResultMissing')
  }
}

async function openTaskResults(): Promise<void> {
  sessionError.value = ''
  try {
    sessions.value = await window.api.chat.querySession()
    sortSessions()
  } catch (error) {
    sessionError.value = error instanceof Error ? error.message : t('errors.loadSessions')
  }
  taskResultTargetId.value = null
  taskResultsOpen.value = true
}

const removeRemoteBotStatusListener = window.api.chat.onRemoteBotStatusChanged((status) => {
  if (status.lastEventAt) void refreshSessionsFromRemote(status.lastSessionId)
})
onBeforeUnmount(() => {
  removeRemoteBotStatusListener()
  if (sidebarTransitionTimer) clearTimeout(sidebarTransitionTimer)
  window.removeEventListener('pointermove', collapseSidebarBelowMinimum, true)
})
onMounted(() => Promise.all([loadSessions(), loadModelConfigs()]))
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <SplitterGroup class="app-shell" direction="horizontal">
      <SplitterPanel
        id="sidebar"
        ref="sidebarPanel"
        :order="1"
        size-unit="px"
        :default-size="300"
        :min-size="250"
        :max-size="560"
        :collapsed-size="0"
        collapsible
        :class="{ 'sidebar-transitioning': sidebarTransitioning }"
        @collapse="handleSidebarCollapse"
        @expand="handleSidebarExpand"
      >
        <AppSidebar
          v-show="sidebarVisible"
          :is-mac="isMac"
          :sessions="persistedSessions"
          :active-session-id="activeSessionId"
          :loading="sessionsLoading"
          :error="sessionError"
          @close="closeSidebar"
          @create="startNewSession"
          @select="selectSession"
          @rename="openRenameSession"
          @delete="deleteSession"
          @toggle-pin="togglePin"
          @toggle-archive="toggleArchive"
          @open-remote-chats="remoteChatsOpen = true"
          @open-task-results="openTaskResults"
          @open-settings="openSettings()"
        />
      </SplitterPanel>

      <SplitterResizeHandle
        id="sidebar-resize-handle"
        class="splitter-handle"
        :class="{ collapsed: !sidebarOpen }"
        @dragging="handleSidebarDragging"
      />

      <SplitterPanel id="workspace" :order="2" :min-size="58">
        <section class="workspace">
          <AppTopbar
            :is-mac="isMac"
            :sidebar-open="sidebarOpen"
            :session="activeSessionPersisted ? activeSession : null"
            :model-configs="modelConfigs"
            :active-model-config="activeModelConfig"
            :models-loading="modelsLoading"
            :theme="theme"
            @open-sidebar="openSidebar"
            @rename="activeSession && openRenameSession(activeSession)"
            @delete="activeSession && deleteSession(activeSession)"
            @toggle-archive="activeSession && toggleArchive(activeSession)"
            @export-markdown="activeSession && exportSession(activeSession, 'markdown')"
            @export-json="activeSession && exportSession(activeSession, 'json')"
            @select-model="selectModelConfig"
            @manage-models="openSettings('models')"
            @toggle-theme="toggleTheme"
          />
          <ChatView
            :key="`${activeSessionId ?? 'none'}:${remoteSessionVersions[activeSessionId ?? ''] ?? 0}`"
            :session-id="activeSessionId"
            :session-persisted="activeSessionPersisted"
            :model-config="activeModelConfig"
            :prompt-settings-version="promptSettingsVersion"
            :task-mode="activeSession?.taskMode ?? 'auto'"
            :disabled="sessionsLoading || modelsLoading || !activeSessionId || !activeModelConfig"
            :disabled-reason="!activeModelConfig ? t('configureModelFirst') : undefined"
            :ensure-session="persistSession"
            @message-sent="updateSessionFromMessage"
            @task-mode-change="
              (preference) => activeSession && toggleTaskMode(activeSession, preference)
            "
          />
        </section>
      </SplitterPanel>
    </SplitterGroup>
    <SettingsDialog
      v-model:open="settingsOpen"
      :initial-section="settingsSection"
      :configs="modelConfigs"
      :active-id="activeModelConfig?.id ?? null"
      :model-error="modelError"
      :save-config="saveModelConfig"
      :delete-config="deleteModelConfig"
      :select-config="selectModelConfig"
      @prompt-saved="promptSettingsVersion += 1"
      @view-session="openTaskResult"
    />
    <RemoteChatsDialog v-model:open="remoteChatsOpen" :sessions="remoteSessions" />
    <RemoteChatsDialog
      v-model:open="taskResultsOpen"
      :sessions="taskResultSessions"
      :initial-session-id="taskResultTargetId"
      variant="scheduled"
    />
    <SessionRenameDialog
      v-model:open="renameDialogOpen"
      :session="renameTarget"
      :save-title="renameSession"
    />
  </TooltipProvider>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  min-width: 520px;
  overflow: hidden;
  background: #ffffff;
  color: var(--app-text);
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

#sidebar.sidebar-transitioning {
  transition: flex-grow 180ms ease, flex-basis 180ms ease;
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
  deleteConfirm: 确定删除“{title}”吗？
  configureModelFirst: 请先配置模型
  errors:
    taskResultMissing: 找不到该任务的结果对话，可能已被删除。
en:
  newConversation: New chat
  deleteConfirm: Delete “{title}”?
  configureModelFirst: Configure a model first
  errors:
    taskResultMissing: The result conversation could not be found and may have been deleted.
</i18n>
