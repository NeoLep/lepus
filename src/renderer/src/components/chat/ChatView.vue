<script setup lang="ts">
import { ref } from 'vue'
import ChatComposer from './ChatComposer.vue'
import ChatMessageList from './ChatMessageList.vue'

import type { Message } from '@ipc/chat/constants'

const messages = ref<Message[]>([])
const draft = ref('')
const sending = ref(false)

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
  if (!content || sending.value) return

  const userMessage = createLocalMessage('user', content)
  messages.value.push(userMessage)
  draft.value = ''
  sending.value = true

  console.log(messages.value)
  try {
    const response = await window.api.chat.sendChatMessage({
      conversationId: 'abcd',
      messages: [userMessage]
    })

    messages.value.push(createLocalMessage('assistant', response))
  } catch (error) {
    messages.value.push({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: error instanceof Error ? `发送失败：${error.message}` : '发送失败，请稍后重试。',
      createdAt: new Date().toISOString()
    })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <main class="chat-view">
    <ChatMessageList :messages="messages" :sending="sending" />
    <ChatComposer v-model="draft" :sending="sending" @submit="sendMessage" />
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
