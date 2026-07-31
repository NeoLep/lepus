import { contextBridge } from 'electron'
import chat from './chat/web'

export function loadApi() {
  return {
    chat
  }
}

export function initial() {
  contextBridge.exposeInMainWorld('api', loadApi())
}
