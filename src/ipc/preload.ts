import { contextBridge } from 'electron'
import chat from './chat/web'
import update from './update/web'

export function loadApi() {
  return {
    chat,
    update
  }
}

export function initial() {
  contextBridge.exposeInMainWorld('api', loadApi())
}
