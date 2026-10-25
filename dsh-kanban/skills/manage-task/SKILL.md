---
name: manage-task
description: Manage dsh-kanban tasks via HTTP API. Use when users ask to work on tasks, check task status, or manage the kanban board.
---

# Manage Task (dsh-kanban)

Use the dsh-kanban HTTP API for all task operations. The API base path is `/api/dsh-kanban`.

## API Reference

All endpoints accept and return JSON. Response format: `{ "success": true, "data": ... }` or `{ "success": false, "error": "..." }`.

### Read tasks

```
GET /api/dsh-kanban/tasks
```

Returns all tasks grouped by status: `{ planned: [], todo: [], "in-progress": [], review: [], done: [] }`.

### Claim a task

```
POST /api/dsh-kanban/tasks/claim
Body: { "taskId": "<task-id>", "message": "optional progress message" }
```

Moves the task from `todo`/`planned` to `in-progress`. Emits a `task:claimed` event.
**Only claim tasks that are in `todo` or `planned` status.** Do not claim tasks already in `in-progress`, `review`, or `done`.

### Report progress

```
POST /api/dsh-kanban/tasks/progress
Body: { "taskId": "<task-id>", "message": "描述当前执行进度" }
```

Emits a `task:executing` event without changing task status. Use this to report intermediate progress.

### Add a comment

```
POST /api/dsh-kanban/tasks/comment
Body: { "taskId": "<task-id>", "message": "执行结果、变更说明、剩余风险" }
```

Emits a `task:comment` event. Use this to record work results and verification outcomes.

### Complete a task

```
POST /api/dsh-kanban/tasks/complete
Body: { "taskId": "<task-id>", "message": "optional completion message" }
```

Moves the task to `done`. Emits a `task:completed` event.

### Mark a task as failed

```
POST /api/dsh-kanban/tasks/fail
Body: { "taskId": "<task-id>", "error": "失败原因描述" }
```

Emits a `task:failed` event. The task keeps its current status.

## Core Workflow

When a user asks you to work on a task:

1. **Read the task**: Call `GET /api/dsh-kanban/tasks` to find the task by title or ID. Read its description, tags, priority, and project.

2. **Check authorization**: Only work on tasks in `todo` or `planned` status. If the task is in `done` or `review`, ask the user if they want to reopen it. Do not work on tasks already claimed by another session (in `in-progress`).

3. **Claim the task**: Call `POST /api/dsh-kanban/tasks/claim` with the task ID. Do this **before** starting any actual work. Wait for the success response before proceeding.

4. **Report progress**: For long-running work, call `POST /api/dsh-kanban/tasks/progress` periodically to keep the user informed.

5. **Execute the work**: Perform the requested task — write code, run commands, analyze files, etc.

6. **Record results**: Call `POST /api/dsh-kanban/tasks/comment` with:
   - What was changed
   - Verification results
   - Outcome summary
   - Any remaining risks or follow-up items

7. **Complete the task**: Call `POST /api/dsh-kanban/tasks/complete` when the work is done and verified.

8. **Handle failures**: If the work cannot be completed, call `POST /api/dsh-kanban/tasks/fail` with the error reason. The task stays in its current status for retry.

## Important Rules

- **Claim before work**: Always claim a task before reading code, analyzing requirements, or doing any work on it.
- **One task at a time**: Only claim one task at a time. Complete or fail it before claiming another.
- **Report honestly**: If you cannot complete the task, report failure rather than leaving it in limbo.
- **Respect priorities**: `urgent` tasks should be worked on first. Ask the user if unsure about priority conflicts.
- **Project context**: If a task has a `project` field, work within that project's context and conventions.
