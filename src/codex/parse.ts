import type {
  CodexRecord,
  SessionMetaPayload,
  ResponseItemPayload,
  EventMsgPayload,
  TurnContextPayload,
  PendingFunction,
  CodexSessionMetadata,
  CodexSessionStats,
} from "./types"
import {
  formatMetadata,
  formatUserMessage,
  formatAssistantText,
  formatModelChange,
  formatSummary,
  EMOJI,
} from "../format"

export class CodexTranscriptParser {
  private pendingFunctions: Map<string, PendingFunction> = new Map()
  private metadata: CodexSessionMetadata | null = null
  private metadataEmitted = false
  private currentModel: string | null = null
  private stats: CodexSessionStats = {
    userMessages: 0,
    assistantMessages: 0,
    functionCalls: 0,
    functionErrors: 0,
    filesRead: new Set(),
    filesWritten: new Set(),
    lastTimestamp: null,
    model: null,
  }

  parse(line: string): string {
    const trimmed = line.trim()
    if (!trimmed) return ""

    let record: CodexRecord
    try {
      record = JSON.parse(trimmed)
    }
    catch {
      return ""
    }

    // Track timestamp
    this.stats.lastTimestamp = record.timestamp

    let output = ""

    switch (record.type) {
      case "session_meta":
        output += this.parseSessionMeta(record.payload as SessionMetaPayload)
        break
      case "response_item":
        output += this.parseResponseItem(record.payload as ResponseItemPayload)
        break
      case "event_msg":
        output += this.parseEventMsg(record.payload as EventMsgPayload)
        break
      case "turn_context":
        output += this.parseTurnContext(record.payload as TurnContextPayload)
        break
    }

    return output
  }

  private parseSessionMeta(payload: SessionMetaPayload): string {
    this.metadata = {
      sessionId: payload.id,
      project: payload.cwd,
      started: payload.timestamp,
      cliVersion: payload.cli_version,
      modelProvider: payload.model_provider,
      gitBranch: payload.git?.branch,
    }

    // Emit metadata immediately
    this.metadataEmitted = true
    return formatCodexMetadata(this.metadata) + "\n"
  }

  private parseResponseItem(payload: ResponseItemPayload): string {
    switch (payload.type) {
      case "message":
        return this.parseMessage(payload)
      case "function_call":
        return this.parseFunctionCall(payload)
      case "function_call_output":
        return this.parseFunctionCallOutput(payload)
      case "reasoning":
        // Skip reasoning blocks (encrypted content)
        return ""
    }
    return ""
  }

  private parseMessage(payload: ResponseItemPayload): string {
    if (!payload.content) return ""

    let output = ""

    if (payload.role === "user") {
      // Skip user messages from response_item - they're duplicated from event_msg
      return ""
    }
    else if (payload.role === "assistant") {
      for (const block of payload.content) {
        if (block.type === "output_text") {
          output += formatAssistantText(block.text)
          this.stats.assistantMessages++
        }
      }
    }

    return output
  }

  private parseFunctionCall(payload: ResponseItemPayload): string {
    if (!payload.name || !payload.call_id) return ""

    this.pendingFunctions.set(payload.call_id, {
      name: payload.name,
      arguments: payload.arguments || "{}",
    })

    return ""
  }

  private parseFunctionCallOutput(payload: ResponseItemPayload): string {
    if (!payload.call_id) return ""

    const pending = this.pendingFunctions.get(payload.call_id)
    if (!pending) return ""

    this.pendingFunctions.delete(payload.call_id)
    this.stats.functionCalls++

    // Check for errors
    const isError = (payload.output?.includes('"exit_code":') &&
      !payload.output?.includes('"exit_code":0')) ?? false

    if (isError) {
      this.stats.functionErrors++
    }

    // Track file operations
    try {
      const args = JSON.parse(pending.arguments)
      if (pending.name === "shell" && args.command) {
        const cmd = Array.isArray(args.command) ? args.command.join(" ") : args.command
        // Track read operations (cat, less, head, etc.)
        const readMatch = cmd.match(/(?:cat|less|head|tail|bat)\s+["']?([^"'\s|>]+)/)
        if (readMatch) {
          this.stats.filesRead.add(readMatch[1])
        }
      }
    }
    catch {
      // Ignore parse errors
    }

    return formatFunctionCall(pending, isError)
  }

  private parseEventMsg(payload: EventMsgPayload): string {
    // User messages in event_msg are the actual user input
    if (payload.type === "user_message" && payload.message) {
      // Clean up the message - remove file context blocks
      let text = payload.message
      // Remove <context ref="...">...</context> blocks
      text = text.replace(/<context ref="[^"]*">[\s\S]*?<\/context>/g, "")
      // Remove [@file](url) references
      text = text.replace(/\[@[^\]]+\]\([^)]+\)\s*/g, "")
      text = text.trim()

      if (text) {
        this.stats.userMessages++
        return formatUserMessage(text)
      }
    }

    return ""
  }

  private parseTurnContext(payload: TurnContextPayload): string {
    // Track model changes
    if (payload.model && payload.model !== this.currentModel) {
      this.currentModel = payload.model
      this.stats.model = payload.model
      return formatModelChange(payload.model)
    }
    return ""
  }

  finalize(): string {
    if (this.stats.userMessages === 0 && this.stats.assistantMessages === 0) {
      return ""
    }

    return formatCodexSummary(this.stats, this.metadata?.started || null)
  }
}

function formatCodexMetadata(meta: CodexSessionMetadata): string {
  const lines = [
    `${EMOJI.metadata} Session: ${meta.sessionId}`,
    `${EMOJI.metadata} Project: ${meta.project}`,
    `${EMOJI.metadata} Started: ${meta.started}`,
    `${EMOJI.metadata} CLI: codex ${meta.cliVersion}`,
    `${EMOJI.metadata} Provider: ${meta.modelProvider}`,
  ]
  if (meta.gitBranch) {
    lines.push(`${EMOJI.metadata} Branch: ${meta.gitBranch}`)
  }
  return lines.join("\n") + "\n"
}

function formatFunctionCall(func: PendingFunction, isError: boolean): string {
  const emoji = isError ? EMOJI.toolFailure : EMOJI.toolSuccess
  const params = formatFunctionArgs(func.name, func.arguments)
  return `${emoji} ${func.name}: ${params}\n`
}

function formatFunctionArgs(name: string, argsJson: string): string {
  try {
    const args = JSON.parse(argsJson)

    switch (name) {
      case "shell": {
        const cmd = Array.isArray(args.command) ? args.command.join(" ") : args.command
        const truncated = cmd.length > 200 ? cmd.slice(0, 200) + "..." : cmd
        return truncated.replace(/\n/g, " ")
      }
      case "read_file":
        return `file="${args.path}"`
      case "write_file":
        return `file="${args.path}"`
      case "update_plan":
        if (args.plan && Array.isArray(args.plan)) {
          const summary = args.plan.map((s: { step: string; status: string }) =>
            `${s.status}: ${s.step}`).join("; ")
          return summary.length > 150 ? summary.slice(0, 150) + "..." : summary
        }
        return JSON.stringify(args)
      default:
        return JSON.stringify(args).slice(0, 150)
    }
  }
  catch {
    return argsJson.slice(0, 150)
  }
}

function formatCodexSummary(stats: CodexSessionStats, startTime: string | null): string {
  const lines = [
    "",
    `${EMOJI.metadata} --- Summary ---`,
  ]

  // Duration
  if (startTime && stats.lastTimestamp) {
    const duration = formatDuration(startTime, stats.lastTimestamp)
    if (duration) {
      lines.push(`${EMOJI.metadata} Duration: ${duration}`)
    }
  }

  if (stats.model) {
    lines.push(`${EMOJI.metadata} Model: ${stats.model}`)
  }

  lines.push(`${EMOJI.metadata} Messages: ${stats.userMessages} user, ${stats.assistantMessages} assistant`)
  lines.push(`${EMOJI.metadata} Function calls: ${stats.functionCalls} total, ${stats.functionErrors} failed`)

  const filesRead = stats.filesRead.size
  const filesWritten = stats.filesWritten.size
  if (filesRead > 0 || filesWritten > 0) {
    const parts: string[] = []
    if (filesRead > 0) parts.push(`${filesRead} read`)
    if (filesWritten > 0) parts.push(`${filesWritten} written`)
    lines.push(`${EMOJI.metadata} Files: ${parts.join(", ")}`)
  }

  return lines.join("\n") + "\n"
}

function formatDuration(start: string, end: string): string | null {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const ms = endDate.getTime() - startDate.getTime()

  if (ms < 0 || isNaN(ms)) return null

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m`
  }
  return `${seconds}s`
}
