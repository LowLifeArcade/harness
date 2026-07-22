export interface AgentUsage {
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  reasoning_output_tokens: number
}

export interface AgentEvents {
  onText: (text: string) => void
  onStatus: (message: string) => void
  onTool: (name: string, detail: string) => void
  onUsage: (usage: AgentUsage) => void
  onDebug?: (message: string) => void
}

type CodexEvent = {
  type?: string
  thread_id?: string
  message?: string
  error?: { message?: string }
  usage?: Partial<AgentUsage>
  item?: Record<string, unknown>
}

export class CloudflareAgent {
  readonly model = process.env.LOWLIFE_MODEL ?? "gpt-5.4"
  private threadId: string | undefined

  constructor(private readonly root: string) {}

  async send(message: string, events: AgentEvents): Promise<string> {
    debugLog(`send · model=${this.model} · resumed=${Boolean(this.threadId)}`)
    events.onDebug?.(`AGENT  spawn codex · model=${this.model} · resumed=${Boolean(this.threadId)}`)
    const firstTurn = !this.threadId
    const prompt = firstTurn ? `${buildInstructions(this.root)}\n\nPLAYER REQUEST:\n${message}` : message
    const args = firstTurn
      ? ["exec", "--json", "--ignore-user-config", "--sandbox", "workspace-write", "-c", "sandbox_workspace_write.network_access=true", "--skip-git-repo-check", "-m", this.model, "-C", this.root, prompt]
      : ["exec", "resume", "--json", "--ignore-user-config", "-c", "sandbox_workspace_write.network_access=true", "--skip-git-repo-check", "-m", this.model, this.threadId!, prompt]

    events.onStatus(`thinking · ${this.model}`)
    let finalText = ""
    let failure = ""
    let completed = false

    let process: ReturnType<typeof Bun.spawn>
    try {
      process = Bun.spawn(["codex", ...args], {
        cwd: this.root,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: processEnv(),
      })
    } catch (error) {
      throw friendlyError(error instanceof Error ? error.message : String(error))
    }

    const stderrStream = process.stderr as ReadableStream<Uint8Array>
    const stdout = process.stdout as ReadableStream<Uint8Array>
    const stderrPromise = collectStderr(stderrStream, (line) => events.onDebug?.(`STDERR  ${line}`))
    for await (const line of jsonLines(stdout)) {
      let event: CodexEvent
      try {
        event = JSON.parse(line) as CodexEvent
      } catch {
        debugLog("ignored a non-JSON stdout line")
        continue
      }

      debugEvent(event)
      events.onDebug?.(eventSummary(event))

      if (event.type === "thread.started" && event.thread_id) this.threadId = event.thread_id
      if (event.type === "turn.started") events.onStatus("planning the next move")
      if (event.type === "item.started" || event.type === "item.completed") {
        const item = event.item ?? {}
        const type = String(item.type ?? "")
        if (type === "agent_message" && event.type === "item.completed") {
          finalText = String(item.text ?? "")
          events.onText(finalText)
        } else if (type && event.type === "item.started") {
          events.onTool(toolLabel(type), toolDetail(item))
          events.onStatus(statusForItem(type))
        }
      }
      if (event.type === "error") failure = event.message ?? "Codex reported an error."
      if (event.type === "turn.failed") failure = event.error?.message ?? failure ?? "Codex turn failed."
      if (event.type === "turn.completed") {
        completed = true
        if (event.usage) events.onUsage(normalizeUsage(event.usage))
      }
    }

    const exitCode = await process.exited
    const stderr = await stderrPromise
    if (!completed || exitCode !== 0) {
      const message = failure || lastUsefulLine(stderr) || `Codex exited with status ${exitCode}.`
      debugLog(`failed · exit=${exitCode} · ${message}`)
      events.onDebug?.(`AGENT  failed · exit=${exitCode} · ${message}`)
      throw friendlyError(message)
    }
    debugLog(`complete · exit=${exitCode}`)
    events.onDebug?.(`AGENT  complete · exit=${exitCode}`)
    events.onStatus("ready")
    return finalText
  }

  reset(): void {
    this.threadId = undefined
  }
}

async function collectStderr(stream: ReadableStream<Uint8Array>, onLine?: (line: string) => void): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ""
  let pending = ""
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      output += chunk
      pending += chunk
      const lines = pending.split("\n")
      pending = lines.pop() ?? ""
      for (const line of lines) if (line.trim()) onLine?.(line.trim())
      if (debugEnabled()) process.stderr.write(chunk)
    }
    const tail = decoder.decode()
    output += tail
    pending += tail
    if (pending.trim()) onLine?.(pending.trim())
    if (tail && debugEnabled()) process.stderr.write(tail)
    return output
  } finally {
    reader.releaseLock()
  }
}

export async function* jsonLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let pending = ""
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })
      const lines = pending.split("\n")
      pending = lines.pop() ?? ""
      for (const line of lines) if (line.trim()) yield line.trim()
    }
    pending += decoder.decode()
    if (pending.trim()) yield pending.trim()
  } finally {
    reader.releaseLock()
  }
}

function buildInstructions(root: string): string {
  return `You are Player Two inside LowLifeArcade, a general-purpose coding agent with one strong opinion: Cloudflare is the default deployment target.

Work directly in ${root}. Act like a capable coding CLI: inspect the repository, make the requested changes, run relevant checks, and report the outcome concisely.

Cloudflare defaults:
- When asked to make or build an app and no architecture is specified, create the simplest suitable Cloudflare Workers app.
- Existing projects should be adapted in place; do not force a new-project wizard or create a nested directory unless the request calls for one.
- Choose framework and data products from the requirements. Prefer a plain Worker or Hono when a framework adds little value. Use D1 for relational data, KV for read-heavy key/value data, R2 for objects, Durable Objects for coordinated state, and Queues or Workflows for background work.
- Use the installed cloudflare skill for architecture, wrangler before Wrangler commands, and workers-best-practices when authoring Workers or wrangler.jsonc. Retrieve current Cloudflare documentation when syntax or behavior may have changed.
- Prefer Bun and bunx. Prefer wrangler.jsonc, generated binding types, bindings over direct REST calls, and an up-to-date compatibility date.
- Validate the real Cloudflare path: tests and typecheck where available, then a Wrangler deployment dry-run after meaningful app changes.
- After creating or meaningfully changing a deployable web app, deploy it to Cloudflare by default when Wrangler is authenticated. The user does not need to repeat “deploy.” Never claim a deployment occurred unless Wrangler confirms it. If authentication or a required secret is missing, preserve the working local app and explain the exact command the user must run.
- Never read, print, hardcode, or pass secret values in command arguments. Never perform destructive cloud operations unless explicitly requested.

Be conversational, but favor doing the work over describing a plan. Ask only when a missing decision would materially change the product.`
}

function processEnv(): Record<string, string | undefined> {
  return { ...process.env, NO_COLOR: "1" }
}

function normalizeUsage(usage: Partial<AgentUsage>): AgentUsage {
  return {
    input_tokens: usage.input_tokens ?? 0,
    cached_input_tokens: usage.cached_input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    reasoning_output_tokens: usage.reasoning_output_tokens ?? 0,
  }
}

function toolLabel(type: string): string {
  return ({ command_execution: "SHELL", file_change: "PATCH", mcp_tool_call: "SKILL", web_search: "LOOKUP" } as Record<string, string>)[type] ?? type.replaceAll("_", " ").toUpperCase()
}

function toolDetail(item: Record<string, unknown>): string {
  const value = item.command ?? item.path ?? item.server ?? item.query ?? item.name ?? "Working…"
  return Array.isArray(value) ? value.join(" ") : String(value)
}

function statusForItem(type: string): string {
  if (type === "command_execution") return "running a command"
  if (type === "file_change") return "editing the cartridge"
  if (type === "web_search") return "checking current docs"
  return "using a power-up"
}

function lastUsefulLine(stderr: string): string {
  return stderr.split("\n").map((line) => line.trim()).filter((line) => line && !line.includes(" WARN ") && !line.includes(" ERROR codex_models_manager::cache")).at(-1) ?? ""
}

function friendlyError(message: string): Error {
  if (message.includes("requires a newer version of Codex")) return new Error(`Model ${process.env.LOWLIFE_MODEL ?? "gpt-5.4"} is not supported by this Codex CLI. Upgrade Codex or set LOWLIFE_MODEL=gpt-5.4.`)
  if (message.includes("login") || message.includes("401") || message.includes("unauthorized")) return new Error("Codex is not signed in. Run `codex login` in your shell, then restart LowLifeArcade.")
  if (message.includes("ENOENT") || message.includes("not found")) return new Error("The Codex CLI is not installed. Install it, run `codex login`, then restart LowLifeArcade.")
  return new Error(message)
}

function debugEnabled(): boolean {
  return process.env.LOWLIFE_DEBUG === "1" || process.env.LOWLIFE_DEBUG === "true"
}

function debugLog(message: string): void {
  if (debugEnabled()) process.stderr.write(`[lowlife ${new Date().toISOString()}] ${message}\n`)
}

function debugEvent(event: CodexEvent): void {
  if (!debugEnabled()) return
  const itemType = event.item ? String(event.item.type ?? "") : ""
  const suffix = itemType ? ` · item=${itemType}` : event.message ? ` · ${event.message}` : ""
  debugLog(`event=${event.type ?? "unknown"}${suffix}`)
}

function eventSummary(event: CodexEvent): string {
  const itemType = event.item ? String(event.item.type ?? "") : ""
  const suffix = itemType ? ` · ${itemType}` : event.message ? ` · ${event.message}` : ""
  return `EVENT  ${event.type ?? "unknown"}${suffix}`
}
