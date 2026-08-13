import { contextBridge } from 'electron'
import chat from './chat/web'
import update from './update/web'
import scheduledTasks from './scheduled/web'
import window from './window/web'

export function loadApi() {
  return {
    chat,
    update,
    scheduledTasks,
    window
  }
}

export function initial() {
  contextBridge.exposeInMainWorld('api', loadApi())
}
