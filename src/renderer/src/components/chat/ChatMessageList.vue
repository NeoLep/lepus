<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { LoaderCircle, Sparkles, UserRound } from '@lucide/vue'
import type { Message } from '@ipc/chat/constants'

const props = defineProps<{
  messages: Message[]
  sending: boolean
}>()

const messageEnd = ref<HTMLElement | null>(null)

watch(
  () => [props.messages.length, props.sending],
  async () => {
    await nextTick()
    messageEnd.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }
)
</script>

<template>
  <div class="message-scroll">
    <div v-if="messages.length === 0" class="welcome-state">
      <div class="welcome-mark"><Sparkles :size="22" /></div>
      <h1>有什么可以帮忙的？</h1>
      <p>这是一个最小聊天示例，试着发送一条消息。</p>
    </div>

    <div v-else class="message-list" aria-live="polite">
      <article v-for="message in messages" :key="message.id" class="message" :class="message.role">
        <div class="message-avatar">
          <UserRound v-if="message.role === 'user'" :size="16" />
          <Sparkles v-else :size="16" />
        </div>
        <div class="message-body">
          <strong>{{ message.role === 'user' ? '你' : 'Lepus' }}</strong>
          <p>{{ message.content }}</p>
        </div>
      </article>

      <article v-if="sending" class="message assistant pending">
        <div class="message-avatar"><Sparkles :size="16" /></div>
        <div class="message-body">
          <strong>Lepus</strong>
          <span class="thinking"><LoaderCircle :size="15" /> 正在思考</span>
        </div>
      </article>
      <div ref="messageEnd" class="message-end"></div>
    </div>
  </div>
</template>

<style scoped>
.message-scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.welcome-state {
  display: flex;
  min-height: 100%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  padding: 48px 24px 24px;
  text-align: center;
}

.welcome-mark {
  display: grid;
  width: 46px;
  height: 46px;
  margin-bottom: 4px;
  place-items: center;
  border: 1px solid #e4e7ec;
  border-radius: 14px;
  box-shadow: 0 4px 12px rgb(16 24 40 / 6%);
}

.welcome-state h1 {
  margin: 0;
  color: #1d2939;
  font-size: clamp(21px, 3vw, 27px);
  font-weight: 620;
  letter-spacing: -0.025em;
}

.welcome-state p {
  margin: 0;
  color: #98a2b3;
  font-size: 13px;
}

.message-list {
  width: min(760px, calc(100% - 40px));
  margin: 0 auto;
  padding: 34px 0 18px;
}

.message {
  display: flex;
  gap: 12px;
  padding: 14px 4px;
  &.user {
    flex-direction: row-reverse;
    .message-body {
      text-align: right;
    }
  }
}

.message + .message {
  /* border-top: 1px solid #f0f2f5; */
}

.message-avatar {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid #e4e7ec;
  border-radius: 9px;
  background: #ffffff;
  color: #475467;
}

.message.assistant .message-avatar {
  border-color: #182230;
  background: #182230;
  color: #ffffff;
}

.message-body {
  min-width: 0;
  padding-top: 4px;
}

.message-body strong {
  display: block;
  margin-bottom: 6px;
  color: #344054;
  font-size: 12px;
  font-weight: 650;
}

.message-body p {
  margin: 0;
  color: #344054;
  font-size: 14px;
  line-height: 1.75;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.thinking {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #98a2b3;
  font-size: 13px;
}

.thinking svg {
  animation: spin 900ms linear infinite;
}

.message-end {
  height: 1px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
