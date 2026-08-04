export type AgentInputContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: 'auto' | 'low' | 'high' } }

export type AgentInputMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | AgentInputContentPart[]
  attachments?: import('@/ipc/chat/constants').MessageAttachment[]
}
