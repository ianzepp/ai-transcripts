import type { PendingTool, SessionMetadata, SessionStats } from "./types"

export const EMOJI = {
  metadata: "📋",
  user: "👤",
  assistant: "🤖",
  toolPending: "🔧",
  toolSuccess: "✅",
  toolFailure: "❌",
  queue: "⏳",
} as const

export function formatMetadata(meta: SessionMetadata): string {
  const lines = [
    `${EMOJI.metadata} Session: ${meta.sessionId}`,
    `${EMOJI.metadata} Project: ${meta.project}`,
    `${EMOJI.metadata} Started: ${meta.started}`,
    `${EMOJI.metadata} Version: ${meta.version}`,
  ]
  if (meta.gitBranch) {
    lines.push(`${EMOJI.metadata} Branch: ${meta.gitBranch}`)
  }
  return lines.join("\n") + "\n"
}

export function formatUserMessage(content: string): string {
  const text = content.trim()
  if (!text) return ""
  return `${EMOJI.user} ${text}\n`
}

export function formatAssistantText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ""
  return `${EMOJI.assistant} ${trimmed}\n`
}

export function formatToolCall(
  tool: PendingTool,
  isError: boolean
): string {
  const emoji = isError ? EMOJI.toolFailure : EMOJI.toolSuccess
  const params = formatToolInput(tool.name, tool.input)
  return `${emoji} ${tool.name}: ${params}\n`
}

export function formatQueueOperation(content: string): string {
  // Extract summary from queue operation content
  const summaryMatch = content.match(/<summary>([^<]+)<\/summary>/)
  const summary = summaryMatch ? summaryMatch[1] : content.slice(0, 100)
  return `${EMOJI.queue} ${summary.trim()}\n`
}

function formatToolInput(
  toolName: string,
  input: Record<string, unknown>
): string {
  switch (toolName) {
    case "Bash":
      return formatBashInput(input)
    case "Read":
      return `file="${input.file_path}"`
    case "Write":
      return `file="${input.file_path}"`
    case "Edit":
      return `file="${input.file_path}"`
    case "Glob":
      return `pattern="${input.pattern}"${input.path ? ` path="${input.path}"` : ""}`
    case "Grep":
      return `pattern="${input.pattern}"${input.path ? ` path="${input.path}"` : ""}`
    case "Task":
      return `${input.subagent_type}: "${input.description}"`
    case "WebFetch":
      return `url="${input.url}"`
    case "WebSearch":
      return `query="${input.query}"`
    case "TodoWrite":
      return formatTodoInput(input)
    default:
      return JSON.stringify(input)
  }
}

function formatBashInput(input: Record<string, unknown>): string {
  const cmd = String(input.command || "")
  const truncated = cmd.length > 200 ? cmd.slice(0, 200) + "..." : cmd
  // Collapse newlines for readability
  return truncated.replace(/\n/g, " ↵ ")
}

function formatTodoInput(input: Record<string, unknown>): string {
  const todos = input.todos as Array<{ content: string; status: string }> | undefined
  if (!todos || !Array.isArray(todos)) return JSON.stringify(input)
  const summary = todos.map((t) => `${t.status}: ${t.content}`).join("; ")
  return summary.length > 150 ? summary.slice(0, 150) + "..." : summary
}

export function formatModelChange(model: string): string {
  // Clean up model name for readability
  // claude-opus-4-5-20251101 -> opus-4.5
  // claude-sonnet-4-5-20250929 -> sonnet-4.5
  const short = shortenModelName(model)
  return `${EMOJI.metadata} Model: ${short}\n`
}

function shortenModelName(model: string): string {
  if (model === "<synthetic>") return "synthetic"

  const match = model.match(/claude-(\w+)-(\d+)-(\d+)-\d+/)
  if (match) {
    const [, name, major, minor] = match
    return `${name}-${major}.${minor}`
  }
  return model
}

export function formatSummary(stats: SessionStats, startTime: string | null): string {
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

  lines.push(`${EMOJI.metadata} Messages: ${stats.userMessages} user, ${stats.assistantMessages} assistant`)
  lines.push(`${EMOJI.metadata} Tool calls: ${stats.toolCalls} total, ${stats.toolErrors} failed`)

  // Files
  const filesRead = stats.filesRead.size
  const filesWritten = stats.filesWritten.size
  const filesEdited = stats.filesEdited.size
  if (filesRead > 0 || filesWritten > 0 || filesEdited > 0) {
    const parts: string[] = []
    if (filesRead > 0) parts.push(`${filesRead} read`)
    if (filesWritten > 0) parts.push(`${filesWritten} written`)
    if (filesEdited > 0) parts.push(`${filesEdited} edited`)
    lines.push(`${EMOJI.metadata} Files: ${parts.join(", ")}`)
  }

  lines.push(`${EMOJI.metadata} Tokens: ${formatTokens(stats.inputTokens)} in, ${formatTokens(stats.outputTokens)} out`)

  if (stats.cacheReadTokens > 0 || stats.cacheCreationTokens > 0) {
    lines.push(`${EMOJI.metadata} Cache: ${formatTokens(stats.cacheReadTokens)} read, ${formatTokens(stats.cacheCreationTokens)} created`)
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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
