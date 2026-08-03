<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
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
  MessageSquare,
  PanelLeft,
  Pencil,
  Search,
  Settings2,
  SquarePen,
  Trash2
} from '@lucide/vue'
import type { Session } from '@ipc/chat/constants'

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
  manageModels: []
}>()

const searchOpen = ref(false)
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

const filteredSessions = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query) return props.sessions
  return props.sessions.filter((session) => session.title.toLocaleLowerCase().includes(query))
})

async function openSearch(): Promise<void> {
  searchOpen.value = true
  await nextTick()
  searchInput.value?.focus()
}

function closeSearch(): void {
  searchOpen.value = false
  searchQuery.value = ''
}

function handleShortcut(event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey)) return
  const key = event.key.toLowerCase()
  if (key === 'n') {
    event.preventDefault()
    emit('create')
  } else if (key === 'k') {
    event.preventDefault()
    void openSearch()
  }
}

onMounted(() => window.addEventListener('keydown', handleShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', handleShortcut))
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
              aria-label="收起侧边栏"
              @click="emit('close')"
            >
              <PanelLeft :size="18" />
            </button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent class="tooltip-content" side="bottom" :side-offset="7">
              收起侧边栏
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
      </div>
    </div>

    <nav class="sidebar-body" aria-label="对话导航">
      <button class="sidebar-action" type="button" @click="emit('create')">
        <SquarePen :size="17" />
        <span>新建对话</span>
        <kbd>{{ isMac ? '⌘ N' : 'Ctrl N' }}</kbd>
      </button>
      <button v-if="!searchOpen" class="sidebar-action" type="button" @click="openSearch">
        <Search :size="17" />
        <span>搜索对话</span>
        <kbd>{{ isMac ? '⌘ K' : 'Ctrl K' }}</kbd>
      </button>
      <div v-else class="search-box">
        <Search :size="16" />
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="search"
          placeholder="搜索对话"
          aria-label="搜索对话"
          @keydown.esc="closeSearch"
        />
        <button type="button" @click="closeSearch">取消</button>
      </div>

      <div class="conversation-section">
        <p class="section-label">最近</p>
        <p v-if="loading" class="conversation-status">正在加载…</p>
        <p v-else-if="error" class="conversation-status error" :title="error">会话操作失败</p>
        <p v-else-if="filteredSessions.length === 0" class="conversation-status">
          {{ searchQuery ? '没有匹配的对话' : '还没有对话' }}
        </p>
        <div
          v-for="session in filteredSessions"
          :key="session.id"
          class="conversation-item"
          :class="{ active: session.id === activeSessionId }"
          role="button"
          tabindex="0"
          @click="emit('select', session.id)"
          @keydown.enter="emit('select', session.id)"
          @keydown.space.prevent="emit('select', session.id)"
        >
          <MessageSquare :size="15" />
          <span>{{ session.title }}</span>
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <button
                class="conversation-more"
                type="button"
                :aria-label="`${session.title} 更多操作`"
                @click.stop
              >
                <Ellipsis :size="16" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent class="menu-content" align="start" :side-offset="4">
                <DropdownMenuItem class="menu-item" @select="emit('rename', session)">
                  <Pencil :size="15" />
                  重命名
                </DropdownMenuItem>
                <DropdownMenuSeparator class="menu-separator" />
                <DropdownMenuItem class="menu-item danger-item" @select="emit('delete', session)">
                  <Trash2 :size="15" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </div>
      </div>
    </nav>

    <button class="settings-button" type="button" @click="emit('manageModels')">
      <Settings2 :size="17" />
      <span>模型管理</span>
    </button>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  flex-direction: column;
  background: #f7f8fa;
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
  background: #111827;
  color: white;
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
  color: #344054;
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
  background: #eceef1;
}

.sidebar-action span {
  flex: 1;
}

kbd {
  color: #98a2b3;
  font-family: inherit;
  font-size: 11px;
}

.conversation-section {
  margin-top: 20px;
}

.section-label {
  margin: 0 10px 7px;
  color: #98a2b3;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.04em;
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

.conversation-item.active {
  background: #e9ebef;
  color: #101828;
}

.conversation-item > span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  background: #dfe3e8;
}

.conversation-item:focus-visible {
  outline: 2px solid #98a2b3;
  outline-offset: -2px;
}

.conversation-status {
  margin: 4px 10px;
  color: #98a2b3;
  font-size: 12px;
}

.conversation-status.error {
  color: #d92d20;
}

.search-box {
  display: flex;
  height: 38px;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 10px;
  border: 1px solid #d0d5dd;
  border-radius: 9px;
  background: #ffffff;
  color: #667085;
}

.search-box input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: #344054;
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
  color: #667085;
  font-size: 11px;
  cursor: pointer;
}

.settings-button {
  gap: 10px;
  margin: 4px 8px 9px;
  width: calc(100% - 16px);
  height: 40px;
  padding: 0 10px;
  border-radius: 11px;
  background: transparent;
  font-size: 13px;
}
</style>
