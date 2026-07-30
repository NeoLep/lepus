<script setup lang="ts">
import { ref } from 'vue'
import type { ChatMessage } from '../../../../shared/chat'
import { chatService } from '../../services/chat'
import ChatComposer from './ChatComposer.vue'
import ChatMessageList from './ChatMessageList.vue'

const messages = ref<ChatMessage[]>([])
const draft = ref('')
const conversationId = ref<string>()
const sending = ref(false)

function createLocalMessage(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content,
    createdAt: new Date().toISOString()
  }
}

async function sendMessage(): Promise<void> {
  const content = draft.value.trim()
  if (!content || sending.value) return

  const userMessage = createLocalMessage(content)
  messages.value.push(userMessage)
  draft.value = ''
  sending.value = true

  try {
    const response = await chatService.sendMessage({
      conversationId: conversationId.value,
      messages: messages.value.map(({ role, content: messageContent }) => ({
        role,
        content: messageContent
      }))
    })

    conversationId.value = response.conversationId
    messages.value.push(response.message)
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
