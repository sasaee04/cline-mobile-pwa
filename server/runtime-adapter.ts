import { spawnSync } from "node:child_process"

export type RuntimeMode = "mock" | "exec"

export class RuntimeAdapter {
  private readonly mode: RuntimeMode
  private readonly command: string
  private readonly args: string[]

  constructor() {
    this.mode = (process.env.CLINE_RUNTIME_MODE as RuntimeMode | undefined) || "mock"
    this.command = process.env.CLINE_RUNTIME_COMMAND || "cline"
    this.args = (process.env.CLINE_RUNTIME_ARGS || "").split(/\s+/).filter(Boolean)
  }

  async sendPrompt(prompt: string): Promise<string> {
    if (this.mode === "exec") {
      return this.executeCommand(prompt)
    }

    return this.mockResponse(prompt)
  }

  private executeCommand(prompt: string): string {
    const child = spawnSync(this.command, this.args.concat([prompt]), {
      encoding: "utf8",
      env: process.env,
    })

    if (child.error) {
      throw new Error(
        `Cline runtime command failed: ${child.error.message}. ` +
          `Set CLINE_RUNTIME_COMMAND and optional CLINE_RUNTIME_ARGS to a valid CLI/agent command.`,
      )
    }

    const stdout = (child.stdout || "").trim()
    const stderr = (child.stderr || "").trim()

    if (child.status !== 0) {
      throw new Error(stderr || `Runtime exited with status ${child.status}`)
    }

    return stdout || stderr || "No output returned by the runtime."
  }

  private mockResponse(prompt: string): string {
    return `Cline runtime is in mock mode. Prompt received: "${prompt}".\n\nTo enable real execution, set:\n- CLINE_RUNTIME_MODE=exec\n- CLINE_RUNTIME_COMMAND=<your cli command>\n- CLINE_RUNTIME_ARGS="<optional args>"`
  }
}
