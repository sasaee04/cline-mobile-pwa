import { ClineCore, Llms } from "@cline/sdk"
import type { ToolApprovalRequest, ToolApprovalResult } from "@cline/sdk"

export type SessionSummary = {
  sessionId: string
  createdAt: string
}

export class RuntimeAdapter {
  private core: ClineCore | undefined
  private readonly sessions = new Map<string, SessionSummary>()
  private unsubscribe: (() => void) | undefined
  private readonly providerId = process.env.CLINE_PROVIDER_ID || "cline"
  private readonly modelId = process.env.CLINE_MODEL_ID || Llms.CLINE_DEFAULT_MODEL_ID
  private readonly apiKey = process.env.CLINE_API_KEY
  readonly workspaceRoot = process.env.CLINE_WORKSPACE_ROOT || process.cwd()

  constructor(
    private readonly requestApproval: (
      request: ToolApprovalRequest,
    ) => Promise<ToolApprovalResult>,
    private readonly onEvent: (sessionId: string, event: unknown) => void,
  ) {}

  async createSession(): Promise<SessionSummary> {
    const core = await this.ensureCore()
    const result = await core.start({
      source: "cli",
      interactive: true,
      config: {
        providerId: this.providerId,
        modelId: this.modelId,
        apiKey: this.apiKey,
        cwd: this.workspaceRoot,
        workspaceRoot: this.workspaceRoot,
        mode: "act",
        enableTools: true,
        enableSpawnAgent: false,
        enableAgentTeams: false,
        disableMcpSettingsTools: true,
      },
      // Require interactive approval for tools except read-only discovery tools.
      toolPolicies: {
        "*": { autoApprove: false },
        read_files: { autoApprove: true },
        search_codebase: { autoApprove: true },
      },
    })

    const session = {
      sessionId: result.sessionId,
      createdAt: new Date().toISOString(),
    }
    this.sessions.set(session.sessionId, session)
    return session
  }

  async sendMessage(sessionId: string, prompt: string): Promise<string> {
    if (!this.sessions.has(sessionId)) {
      throw new Error("Session not found on this host. Create a new session.")
    }

    const result = await (await this.ensureCore()).send({ sessionId, prompt })
    return result?.text || "Cline completed the turn without returning text."
  }

  listSessions(): SessionSummary[] {
    return [...this.sessions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  private async ensureCore(): Promise<ClineCore> {
    if (this.core) return this.core

    this.core = await ClineCore.create({
      clientName: "cline-mobile-pwa",
      backendMode: "local",
      capabilities: {
        requestToolApproval: this.requestApproval,
      },
    })
    this.unsubscribe = this.core.subscribe((event) => {
      const record = event as { sessionId?: string; payload?: { sessionId?: string } }
      const sessionId = record.sessionId || record.payload?.sessionId
      if (sessionId) this.onEvent(sessionId, event)
    })
    return this.core
  }

  async dispose(): Promise<void> {
    this.unsubscribe?.()
    this.unsubscribe = undefined
    await this.core?.dispose()
    this.core = undefined
  }
}
