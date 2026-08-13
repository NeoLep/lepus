import chat from './chat/node'
import scheduledTasks from './scheduled/node'
import { initial as initializeWindow } from './window/node'

export function initial() {
  chat()
  scheduledTasks()
  initializeWindow()
}
