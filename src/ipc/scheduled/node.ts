import { ipcMain } from 'electron'
import { scheduledTaskManager } from '@/main/lib/scheduled-task-manager'
import { SCHEDULED_TASK_CHANNELS, type ScheduledTask } from './constants'

export default function scheduledTasks(): void {
  ipcMain.handle(SCHEDULED_TASK_CHANNELS.QUERY, () => scheduledTaskManager.query())
  ipcMain.handle(SCHEDULED_TASK_CHANNELS.SAVE, (_event, task: ScheduledTask) =>
    scheduledTaskManager.save(task)
  )
  ipcMain.handle(SCHEDULED_TASK_CHANNELS.DELETE, (_event, id: string) =>
    scheduledTaskManager.delete(id)
  )
  ipcMain.handle(SCHEDULED_TASK_CHANNELS.RUN_NOW, (_event, id: string) => {
    scheduledTaskManager.runNow(id)
  })
}
