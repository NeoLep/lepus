import chat from './chat/node'
import scheduledTasks from './scheduled/node'

export function initial() {
  chat()
  scheduledTasks()
}
