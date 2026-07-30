import type { ChatApi } from '../../../shared/chat'

export const chatService: ChatApi = {
  sendMessage(request) {
    return window.api.chat.sendMessage(request)
  }
}
