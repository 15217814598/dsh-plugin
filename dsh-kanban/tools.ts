/**
 * Native kanban tools for the model — registered via ctx.tools.register.
 *
 * Raw tool definitions (the registry validates name + output{schema,render};
 * raw tools own their argument validation). They call the same TaskStore
 * methods as the HTTP routes, so board events (SSE) and status transitions
 * behave identically — the model just never needs shell/curl for them.
 */

import type { TaskStore } from './store.js'
import type { Task } from './types.js'

/** Minimal raw tool definition accepted by ctx.tools.register. */
export interface KanbanToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render: (args: unknown, value: string) => Array<{ type: 'text'; text: string }>
  }
  execute: (args: Record<string, unknown>) => string
}

const TEXT_OUTPUT = {
  schema: { type: 'string' },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

function requireText(args: Record<string, unknown>, key: string, tool: string): string {
  const value = args?.[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${tool}: 参数 "${key}" 必须是非空字符串`)
  }
  return value.trim()
}

function optionalText(args: Record<string, unknown>, key: string): string | undefined {
  const value = args?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function requireTask(store: TaskStore, taskId: string): Task {
  const task = store.getById(taskId)
  if (!task) throw new Error(`任务不存在：${taskId}（用 kanban_list 查询任务 id）`)
  return task
}

function taskLine(task: Task): string {
  const flags = [task.project ? `项目:${task.project}` : null, task.status].filter(Boolean).join(', ')
  return `${task.title}（id: ${task.id}；${flags}）`
}

/** Build the kanban tool set against one task store. */
export function createKanbanTools(store: TaskStore): KanbanToolDef[] {
  return [
    {
      name: 'kanban_list',
      description: '读取看板上的全部任务（按状态分组：planned/todo/in-progress/review/done，含每个任务的 id、标题、描述、项目）。',
      parameters: {},
      output: TEXT_OUTPUT,
      execute: () => JSON.stringify(store.getAll()),
    },
    {
      name: 'kanban_claim',
      description: '认领一个看板任务（仅 planned/todo/in-progress；认领后才能开始实际工作）。一次只认领一个任务。',
      parameters: {
        taskId: { type: 'string', required: true, description: '任务 id（用 kanban_list 查询）' },
      },
      output: TEXT_OUTPUT,
      execute: (args) => {
        const taskId = requireText(args, 'taskId', 'kanban_claim')
        const task = store.claimTask(taskId, '由 AI 通过 kanban_claim 认领')
        if (!task) throw new Error(`任务不存在：${taskId}`)
        if (task.status !== 'in-progress') throw new Error(`任务「${task.title}」当前状态为 ${task.status}，只能认领 planned/todo/in-progress 的任务`)
        return `已认领：${taskLine(task)}`
      },
    },
    {
      name: 'kanban_progress',
      description: '报告看板任务的执行进度（不改变任务状态）。长任务建议阶段性调用。',
      parameters: {
        taskId: { type: 'string', required: true, description: '任务 id' },
        message: { type: 'string', required: true, description: '当前进度描述' },
      },
      output: TEXT_OUTPUT,
      execute: (args) => {
        const taskId = requireText(args, 'taskId', 'kanban_progress')
        requireTask(store, taskId)
        store.emitExecuting(taskId, requireText(args, 'message', 'kanban_progress'))
        return '进度已记录'
      },
    },
    {
      name: 'kanban_comment',
      description: '在看板任务上记录执行结果、变更说明或剩余风险（不改变任务状态）。',
      parameters: {
        taskId: { type: 'string', required: true, description: '任务 id' },
        message: { type: 'string', required: true, description: '结果/说明内容' },
      },
      output: TEXT_OUTPUT,
      execute: (args) => {
        const taskId = requireText(args, 'taskId', 'kanban_comment')
        requireTask(store, taskId)
        store.emitComment(taskId, requireText(args, 'message', 'kanban_comment'))
        return '备注已记录'
      },
    },
    {
      name: 'kanban_complete',
      description: '把看板任务标记为工作完成（状态 → 评审中，等待人工评审后再归档到已完成）。任务工作结束且验证通过后必须调用。',
      parameters: {
        taskId: { type: 'string', required: true, description: '任务 id' },
        message: { type: 'string', description: '可选的完成说明' },
      },
      output: TEXT_OUTPUT,
      execute: (args) => {
        const taskId = requireText(args, 'taskId', 'kanban_complete')
        const task = store.completeTask(taskId, optionalText(args, 'message'))
        if (!task) throw new Error(`任务不存在：${taskId}`)
        return `任务已完成：${taskLine(task)}`
      },
    },
    {
      name: 'kanban_fail',
      description: '把看板任务标记为执行失败（记录原因，任务状态保持不变，等待重试或人工处理）。无法完成任务时必须调用。',
      parameters: {
        taskId: { type: 'string', required: true, description: '任务 id' },
        error: { type: 'string', required: true, description: '失败原因' },
      },
      output: TEXT_OUTPUT,
      execute: (args) => {
        const taskId = requireText(args, 'taskId', 'kanban_fail')
        requireTask(store, taskId)
        store.failTask(taskId, requireText(args, 'error', 'kanban_fail'))
        return '已标记失败（状态保持不变）'
      },
    },
  ]
}
