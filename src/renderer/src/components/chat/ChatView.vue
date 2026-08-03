<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ChatComposer from './ChatComposer.vue'
import ChatMessageList from './ChatMessageList.vue'

import type { Message } from '@ipc/chat/constants'

const props = defineProps<{
  sessionId: string | null
  modelConfigId: string | null
  disabled: boolean
  disabledReason?: string
}>()

const emit = defineEmits<{
  messageSent: [content: string]
}>()

const messagesBySession = ref<Record<string, Message[]>>({})
const loadedSessions = ref<Record<string, boolean>>({})
const loadingSessions = ref<Record<string, boolean>>({})
const messages = computed(() =>
  props.sessionId ? (messagesBySession.value[props.sessionId] ?? []) : []
)
const draft = ref('')
const sendingBySession = ref<Record<string, boolean>>({})
const sending = computed(() =>
  props.sessionId ? (sendingBySession.value[props.sessionId] ?? false) : false
)
const loading = computed(() =>
  props.sessionId ? (loadingSessions.value[props.sessionId] ?? false) : false
)

function createLocalMessage(role: Message['role'], content: string): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString()
  }
}

async function sendMessage(): Promise<void> {
  const content = draft.value.trim()
  const sessionId = props.sessionId
  const modelConfigId = props.modelConfigId
  if (!content || sending.value || loading.value || props.disabled || !sessionId || !modelConfigId)
    return

  if (!messagesBySession.value[sessionId]) messagesBySession.value[sessionId] = []
  const sessionMessages = messagesBySession.value[sessionId]
  const userMessage = createLocalMessage('user', content)
  sessionMessages.push(userMessage)
  draft.value = ''
  sendingBySession.value[sessionId] = true

  emit('messageSent', content)

  try {
    const response = await window.api.chat.sendChatMessage({
      conversationId: sessionId,
      modelConfigId,
      messages: sessionMessages.map((message) => ({ ...message }))
    })

    sessionMessages.push(response)
  } catch (error) {
    sessionMessages.push({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: error instanceof Error ? `发送失败：${error.message}` : '发送失败，请稍后重试。',
      createdAt: new Date().toISOString()
    })
  } finally {
    sendingBySession.value[sessionId] = false
  }
}

watch(
  () => props.sessionId,
  async (sessionId) => {
    draft.value = ''
    if (!sessionId || loadedSessions.value[sessionId]) return

    loadingSessions.value[sessionId] = true
    try {
      messagesBySession.value[sessionId] = await window.api.chat.queryMessages(sessionId)
      loadedSessions.value[sessionId] = true
    } catch (error) {
      console.error('Failed to load messages', error)
    } finally {
      loadingSessions.value[sessionId] = false
    }
  },
  { immediate: true }
)
</script>

<template>
  <main class="chat-view">
    <ChatMessageList :messages="messages" :sending="sending || loading" />
    <ChatComposer
      v-model="draft"
      :sending="sending"
      :disabled="disabled || loading"
      :placeholder="disabledReason"
      @submit="sendMessage"
    />
  </main>
</template>

<style scoped>
.chat-view {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: #ffffff;
}
</style>
