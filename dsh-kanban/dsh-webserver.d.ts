/**
 * Minimal ambient declarations for DSH host services used by dsh-kanban.
 * The desktop bundle of @deepseek-ai/dsh-host-webserver (V0.2.1-rc.2) ships
 * no lib/types, so the exact register() surface is declared here from the
 * package README: named exact/prefix routes, disposer-returning register().
 */

/**
 * Minimal Agent surface used by the auto-task scheduler. The full type lives
 * in @deepseek-ai/dsh-agent; this mirrors only what followup delivery needs.
 */
interface KanbanAgent {
  readonly id: string
  readonly status: 'idle' | 'running'
  /** The provider route and model this agent's requests use. */
  readonly options: { provider?: string; model?: string }
  /** Queue an ordinary follow-up turn and wake the driver. */
  followup(message: KanbanUserMessage): void
}

/** Live-agent registry service (`ctx.agents`, provided by the DSH agent loop). */
interface KanbanAgentRegistry {
  /** All live top-level agents in registration order. */
  roots(): KanbanAgent[]
  /** Look up a live agent by its shared agent/session id. */
  get(id: string): KanbanAgent | undefined
}

/**
 * Session controller service (`ctx.sessionController`) — the official
 * create/prompt entry the GUI uses. create() with a workspaceId attaches the
 * new session to the workspace; prompt() validates the model route, admits
 * the content and enqueues the message as a follow-up turn.
 */
interface KanbanSessionController {
  create(request: {
    workspaceId?: string
    cwd?: string
    sessionId?: string
    agentPreset?: string
  }): Promise<{ sessionId: string; agentPreset?: string }>
  prompt(request: {
    requestId: string
    sessionId: string
    mode: 'queue' | 'steer'
    content: Array<{ type: 'text'; text: string }>
  }, signal: AbortSignal): Promise<{ accepted: boolean }>
}

/** One registered workspace (subset of dsh-workspace's Workspace entity). */
interface KanbanWorkspace {
  readonly id: string
  readonly path: string
  readonly title: string
  /** Attach a persisted session (header cwd must equal the workspace path). */
  attachSession?(sessionId: string): Promise<void>
}

/** Tools registry service (`ctx.tools`) — raw tool definitions accepted. */
interface KanbanToolsRegistry {
  register(definition: {
    name: string
    description: string
    parameters?: Record<string, unknown>
    output: {
      schema: Record<string, unknown>
      render: (args: unknown, value: unknown) => Array<{ type: 'text'; text: string }>
      presentationMeta?: unknown
    }
    execute: (args: Record<string, unknown>, exec?: unknown) => unknown
    timeoutMs?: number
  }): () => void
}

/** Workspace registry service (`ctx.workspaceRegistry`, an optional host capability). */
interface KanbanWorkspaceRegistry {
  list(): KanbanWorkspace[]
}

/** System-prompt section registry service (`ctx.systemPrompt`). */
interface KanbanSystemPrompt {
  section(section: { name: string; order: number; text: string }): () => void
}

/**
 * User-role message shape accepted by agent.followup() (structural subset of dsh-llm's UserMessage).
 * The source kind must be a producer-owned string — session format v4 rejects
 * the retired `kind: 'plugin'` wrapper.
 */
interface KanbanUserMessage {
  id: string
  role: 'user'
  content: readonly { type: 'text'; text: string }[]
  source: { kind: 'kanban' }
}

declare module '@deepseek-ai/dsh-host-webserver' {
  import type { IncomingMessage, ServerResponse } from 'node:http'

  export interface WebServerRoute {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }

  export interface WebServerService {
    /** Register a named exact/prefix HTTP route; returns a disposer. */
    register(route: WebServerRoute): () => void
    /** Currently bound port (0 = OS-assigned before listen). */
    readonly port: number
  }

  module '@deepseek-ai/cordis' {
    interface Context {
      webServer: WebServerService
      agents: KanbanAgentRegistry
      systemPrompt: KanbanSystemPrompt
      sessionController: KanbanSessionController
      tools: KanbanToolsRegistry
      /** Optional host capability: registered workspaces (project name → path). */
      workspaceRegistry?: KanbanWorkspaceRegistry
      /**
       * Register an event listener (cordis 4 `ctx.on`; type-only redeclaration —
       * the same nodenext merge gap as `effect` above). Runtime dispatch is
       * provided by cordis; 'session/event' handlers receive (session, event).
       */
      on(event: string, listener: (...args: any[]) => void): () => void
      /**
       * Register a cleanup-aware effect on this fiber (cordis 4 `ctx.effect`).
       * Redeclared here: cordis's own augmentation lives in a
       * `declare module './context.ts'` block that TypeScript 7 (nodenext)
       * does not merge when Context is imported through the package entry.
       * Runtime behavior is provided by cordis; this is type-only.
       */
      effect(execute: () => () => void, label?: string): () => void
    }
  }
}
