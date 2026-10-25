/**
 * Auto-task status polling.
 *
 * Task delivery itself happens server-side: the scheduler enqueues the task
 * as a follow-up turn on a live DSH agent via `agent.followup()` (see
 * index.ts). The client only watches the auto-task status so the board can
 * toast and refresh when a scheduled run fires.
 */
import { kanbanApi } from '../api'
import { toast } from './ui'

let statusPollTimer: ReturnType<typeof setInterval> | null = null

/** Start polling for auto-task status changes */
export function startStatusPoll(onStatusChange: () => void): void {
  stopStatusPoll()
  let lastRunAt = ''
  statusPollTimer = setInterval(async () => {
    try {
      const status = await kanbanApi.getAutoTaskStatus()
      if (status.lastRunAt && status.lastRunAt !== lastRunAt) {
        const isFirstSample = lastRunAt === ''
        lastRunAt = status.lastRunAt
        if (!isFirstSample) {
          toast(`自动任务已执行：${status.lastTaskTitle || '未知任务'}`)
        }
        onStatusChange()
      }
    } catch {
      // silently ignore
    }
  }, 30_000)
}

/** Stop status polling */
export function stopStatusPoll(): void {
  if (statusPollTimer) {
    clearInterval(statusPollTimer)
    statusPollTimer = null
  }
}

/** Initialize auto-task polling if enabled */
export async function initAutoTaskPoll(onStatusChange: () => void): Promise<void> {
  try {
    const config = await kanbanApi.getAutoTaskConfig()
    if (config.enabled) {
      startStatusPoll(onStatusChange)
    }
  } catch {
    // config fetch failed, skip
  }
}
