<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  TooltipContent,
  TooltipPortal,
  TooltipRoot,
  TooltipTrigger
} from 'reka-ui'
import {
  Ellipsis,
  Archive,
  ArchiveRestore,
  Bot,
  CalendarClock,
  LoaderCircle,
  MessageSquare,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  Search,
  Settings2,
  SquarePen,
  Trash2
} from '@lucide/vue'
import type { Session, SessionSearchResult } from '@ipc/chat/constants'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  isMac: boolean
  sessions: Session[]
  activeSessionId: string | null
  loading: boolean
  error: string
}>()

const emit = defineEmits<{
  close: []
  create: []
  select: [id: string]
  rename: [session: Session]
  delete: [session: Session]
  togglePin: [session: Session]
  toggleArchive: [session: Session]
  openRemoteChats: []
  openTaskResults: []
  openSettings: []
}>()

const searchOpen = ref(false)
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const showArchived = ref(false)
const searchResults = ref<SessionSearchResult[]>([])
const searchLoading = ref(false)
const searchError = ref('')
const { t } = useI18n({ useScope: 'local' })
let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchVersion = 0

const visibleEntries = computed(() => {
  if (searchQuery.value.trim()) {
    return searchResults.value
      .map((result) => ({
        ...result,
        session:
          props.sessions.find((session) => session.id === result.session.id) ?? result.session
      }))
      .filter((entry) => !isSpecialSession(entry.session))
  }
  return props.sessions
    .filter((session) => !isSpecialSession(session) && session.isArchived === showArchived.value)
    .map((session) => ({ session, snippet: '', matchedIn: 'title' as const }))
})

function isRemoteSession(session: Session): boolean {
  return session.id.startsWith('remote-feishu-')
}

function isSpecialSession(session: Session): boolean {
  return isRemoteSession(session) || session.id.startsWith('scheduled-')
}

watch(searchQuery, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  const query = value.trim()
  const version = ++searchVersion
  searchError.value = ''
  if (!query) {
    searchResults.value = []
    searchLoading.value = false
    return
  }
  searchLoading.value = true
  searchTimer = setTimeout(async () => {
    try {
      const results = await window.api.chat.searchSessions(query)
      if (version === searchVersion) searchResults.value = results
    } catch (error) {
      if (version === searchVersion) {
        searchError.value = error instanceof Error ? error.message : t('searchFailed')
      }
    } finally {
      if (version === searchVersion) searchLoading.value = false
    }
  }, 220)
})

watch(
  () => props.sessions.find((session) => session.id === props.activeSessionId)?.isArchived,
  (isArchived) => {
    if (isArchived === false) showArchived.value = false
  }
)

async function openSearch(): Promise<void> {
  searchOpen.value = true
  await nextTick()
  searchInput.value?.focus()
}

function closeSearch(): void {
  searchOpen.value = false
  searchQuery.value = ''
  searchResults.value = []
}

function createChat(): void {
  showArchived.value = false
  closeSearch()
  emit('create')
}

function handleShortcut(event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey)) return
  const key = event.key.toLowerCase()
  if (key === 'n') {
    event.preventDefault()
    createChat()
  } else if (key === 'k') {
    event.preventDefault()
    void openSearch()
  }
}

onMounted(() => window.addEventListener('keydown', handleShortcut))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut)
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header window-drag-region" :class="{ 'mac-window-controls': isMac }">
      <div class="sidebar-header-actions no-drag">
        <TooltipRoot>
          <TooltipTrigger as-child>
            <button
              class="icon-button"
              type="button"
              :aria-label="t('collapseSidebar')"
              @click="emit('close')"
            >
              <PanelLeft :size="18" />
            </button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent class="tooltip-content" side="bottom" :side-offset="7">
              {{ t('collapseSidebar') }}
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
      </div>
    </div>

    <nav class="sidebar-body" :aria-label="t('chatNavigation')">
      <button class="sidebar-action" type="button" @click="createChat">
        <SquarePen :size="17" />
        <span>{{ t('newChat') }}</span>
        <kbd>{{ isMac ? '⌘ N' : 'Ctrl N' }}</kbd>
      </button>
      <button v-if="!searchOpen" class="sidebar-action" type="button" @click="openSearch">
        <Search :size="17" />
        <span>{{ t('searchChats') }}</span>
        <kbd>{{ isMac ? '⌘ K' : 'Ctrl K' }}</kbd>
      </button>
      <div v-else class="search-box">
        <Search :size="16" />
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="search"
          :placeholder="t('searchChats')"
          :aria-label="t('searchChats')"
          @keydown.esc="closeSearch"
        />
        <button type="button" @click="closeSearch">{{ t('common.cancel') }}</button>
      </div>

      <div class="conversation-section">
        <div v-if="!searchQuery.trim()" class="conversation-tabs">
          <button type="button" :class="{ active: !showArchived }" @click="showArchived = false">
            {{ t('recent') }}
          </button>
          <button type="button" :class="{ active: showArchived }" @click="showArchived = true">
            {{ t('archived') }}
          </button>
        </div>
        <p v-else class="section-label">{{ t('searchResults') }}</p>
        <p v-if="loading || searchLoading" class="conversation-status loading-status">
          <LoaderCircle :size="13" /> {{ t('common.loading') }}
        </p>
        <p
          v-else-if="error || searchError"
          class="conversation-status error"
          :title="error || searchError"
        >
          {{ t('operationFailed') }}
        </p>
        <p v-else-if="visibleEntries.length === 0" class="conversation-status">
          {{
            searchQuery ? t('noMatchingChats') : showArchived ? t('noArchivedChats') : t('noChats')
          }}
        </p>
        <div
          v-for="entry in visibleEntries"
          :key="entry.session.id"
          class="conversation-item"
          :class="{
            active: entry.session.id === activeSessionId,
            'has-snippet': !!entry.snippet && entry.matchedIn !== 'title'
          }"
          role="button"
          tabindex="0"
          @click="emit('select', entry.session.id)"
          @keydown.enter="emit('select', entry.session.id)"
          @keydown.space.prevent="emit('select', entry.session.id)"
        >
          <MessageSquare :size="15" />
          <div class="conversation-copy">
            <span>{{ entry.session.title }}</span>
            <small v-if="entry.snippet && entry.matchedIn !== 'title'">{{ entry.snippet }}</small>
          </div>
          <Pin v-if="entry.session.isPinned" class="pin-indicator" :size="12" />
          <Archive
            v-if="searchQuery && entry.session.isArchived"
            class="pin-indicator"
            :size="12"
          />
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <button
                class="conversation-more"
                type="button"
                :aria-label="t('moreActions', { title: entry.session.title })"
                @click.stop
              >
                <Ellipsis :size="16" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent class="menu-content" align="start" :side-offset="4">
                <DropdownMenuItem class="menu-item" @select="emit('togglePin', entry.session)">
                  <PinOff v-if="entry.session.isPinned" :size="15" />
                  <Pin v-else :size="15" />
                  {{ entry.session.isPinned ? t('unpin') : t('pin') }}
                </DropdownMenuItem>
                <DropdownMenuItem class="menu-item" @select="emit('rename', entry.session)">
                  <Pencil :size="15" />
                  {{ t('common.rename') }}
                </DropdownMenuItem>
                <DropdownMenuItem class="menu-item" @select="emit('toggleArchive', entry.session)">
                  <ArchiveRestore v-if="entry.session.isArchived" :size="15" />
                  <Archive v-else :size="15" />
                  {{ entry.session.isArchived ? t('restore') : t('archive') }}
                </DropdownMenuItem>
                <DropdownMenuSeparator class="menu-separator" />
                <DropdownMenuItem
                  class="menu-item danger-item"
                  @select="emit('delete', entry.session)"
                >
                  <Trash2 :size="15" />
                  {{ t('common.delete') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </div>
      </div>
    </nav>

    <div class="settings-actions">
      <button
        class="settings-button task-results-button"
        type="button"
        @click="emit('openTaskResults')"
      >
        <CalendarClock :size="17" />
        <span>{{ t('taskResults') }}</span>
      </button>
      <button
        class="settings-button remote-chats-button"
        type="button"
        @click="emit('openRemoteChats')"
      >
        <Bot :size="17" />
        <span>{{ t('remoteConversations') }}</span>
      </button>
      <button class="settings-button" type="button" @click="emit('openSettings')">
        <Settings2 :size="17" />
        <span>{{ t('settings') }}</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  flex-direction: column;
  background: var(--app-sidebar-bg);
}

.sidebar-header {
  display: flex;
  height: 52px;
  flex: 0 0 52px;
  align-items: center;
  justify-content: flex-end;
  padding: 0 10px 0 12px;
}

.sidebar-header.mac-window-controls {
  padding-left: 78px;
}

.brand-mark {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 9px;
  background: var(--app-inverse-bg);
  color: var(--app-inverse-text);
}

.sidebar-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.sidebar-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px;
}

.conversation-item {
  margin-bottom: 1px;
}

.sidebar-action,
.conversation-item,
.settings-button {
  display: flex;
  width: 100%;
  align-items: center;
  border: 0;
  color: var(--app-text-secondary);
  text-align: left;
  cursor: pointer;
}

.sidebar-action {
  height: 38px;
  gap: 10px;
  padding: 0 10px;
  border-radius: 9px;
  background: transparent;
  font-size: 13px;
  font-weight: 540;
}

.sidebar-action:hover,
.conversation-item:hover,
.settings-button:hover {
  background: var(--app-hover);
}

.sidebar-action span {
  flex: 1;
}

kbd {
  color: var(--app-text-muted);
  font-family: inherit;
  font-size: 11px;
}

.conversation-section {
  margin-top: 20px;
}

.section-label {
  margin: 0 10px 7px;
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.04em;
}

.conversation-tabs {
  display: flex;
  gap: 3px;
  margin: 0 5px 7px;
  padding: 3px;
  border-radius: 9px;
  background: var(--app-surface-muted);
}

.conversation-tabs button {
  height: 27px;
  flex: 1;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--app-text-tertiary);
  font-size: 11px;
  cursor: pointer;
}

.conversation-tabs button.active {
  background: var(--app-surface);
  color: var(--app-text-secondary);
  box-shadow: 0 1px 2px rgb(16 24 40 / 8%);
  font-weight: 600;
}

.conversation-item {
  height: 38px;
  gap: 9px;
  padding: 0 9px;
  border-radius: 9px;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  outline: none;
}

.conversation-item.has-snippet {
  height: 54px;
}

.conversation-item.active {
  background: var(--app-active);
  color: var(--app-text);
}

.conversation-copy {
  min-width: 0;
  flex: 1;
}

.conversation-copy span,
.conversation-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-copy small {
  margin-top: 3px;
  color: var(--app-text-muted);
  font-size: 10px;
}

.pin-indicator {
  flex: 0 0 auto;
  color: var(--app-text-tertiary);
}

.conversation-more {
  display: grid;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0;
}

.conversation-item:hover .conversation-more,
.conversation-item.active .conversation-more,
.conversation-more:focus-visible,
.conversation-more[data-state='open'] {
  opacity: 1;
}

.conversation-more:hover {
  background: var(--app-hover);
}

.conversation-item:focus-visible {
  outline: 2px solid var(--app-text-muted);
  outline-offset: -2px;
}

.conversation-status {
  margin: 4px 10px;
  color: var(--app-text-muted);
  font-size: 12px;
}

.conversation-status.error {
  color: var(--app-danger);
}

.loading-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.loading-status svg {
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.search-box {
  display: flex;
  height: 38px;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--app-border-strong);
  border-radius: 9px;
  background: var(--app-surface);
  color: var(--app-text-tertiary);
}

.search-box input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--app-text-secondary);
  font: inherit;
  font-size: 13px;
}

.search-box input::-webkit-search-cancel-button {
  display: none;
}

.search-box button {
  padding: 3px;
  border: 0;
  background: transparent;
  color: var(--app-text-tertiary);
  font-size: 11px;
  cursor: pointer;
}

.settings-button {
  gap: 10px;
  margin: 0;
  width: calc(100% - 16px);
  height: 40px;
  padding: 0 10px;
  border-radius: 11px;
  background: transparent;
  font-size: 13px;
}

.settings-actions {
  display: grid;
  gap: 2px;
  padding: 10px 8px 12px;
  border-top: 1px solid var(--app-border-subtle);
}

.remote-chats-button svg {
  color: #3370ff;
}

.task-results-button svg {
  color: var(--app-accent);
}

.settings-actions .settings-button {
  width: 100%;
}
</style>

<i18n lang="yaml">
zh-CN:
  collapseSidebar: 收起侧边栏
  chatNavigation: 对话导航
  newChat: 新建对话
  searchChats: 搜索对话
  recent: 最近
  archived: 已归档
  searchResults: 搜索结果
  noArchivedChats: 还没有归档对话
  pin: 置顶
  unpin: 取消置顶
  archive: 归档
  restore: 恢复
  searchFailed: 搜索失败
  operationFailed: 会话操作失败
  noMatchingChats: 没有匹配的对话
  noChats: 还没有对话
  moreActions: '{title} 更多操作'
  settings: 设置
  taskResults: 定时任务记录
  remoteConversations: 飞书（远程对话）
en:
  collapseSidebar: Collapse sidebar
  chatNavigation: Chat navigation
  newChat: New chat
  searchChats: Search chats
  recent: Recent
  archived: Archived
  searchResults: Search results
  noArchivedChats: No archived chats
  pin: Pin
  unpin: Unpin
  archive: Archive
  restore: Restore
  searchFailed: Search failed
  operationFailed: Chat operation failed
  noMatchingChats: No matching chats
  noChats: No chats yet
  moreActions: More actions for {title}
  settings: Settings
  taskResults: Scheduled task history
  remoteConversations: Feishu (Remote chats)
</i18n>
