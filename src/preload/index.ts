import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  CHAT_SEND_CHANNEL,
  type AppApi,
  type SendChatRequest,
  type SendChatResponse
} from '../shared/agent/index'

// Custom APIs for renderer
const api: AppApi = {
  chat: {
    sendMessage(request: SendChatRequest): Promise<SendChatResponse> {
      console.log(request)
      return ipcRenderer.invoke(CHAT_SEND_CHANNEL, request)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
