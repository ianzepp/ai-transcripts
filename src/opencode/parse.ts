import { readdir } from "node:fs/promises"
import { join } from "node:path"
import type {
  OpenCodeSession,
  OpenCodeMessage,
  OpenCodePart,
  OpenCodeSessionData,
  OpenCodeStats,
} from "./types"
import { EMOJI } from "../format"

export async function loadSession(
  storageDir: string,
  sessionId: string
): Promise<OpenCodeSessionData | null> {
  // Find and load session file
  const session = await findSessionFile(storageDir, sessionId)
  if (!session) return null

  // Load all messages for this session
  const messagesDir = join(storageDir, "message", sessionId)
  const messages = await loadMessages(messagesDir)
  if (messages.length === 0) return null

  // Load all parts for these messages
  const parts = new Map<string, OpenCodePart[]>()
  for (const msg of messages) {
    const partsDir = join(storageDir, "part", msg.id)
    const msgParts = await loadParts(partsDir)
    if (msgParts.length > 0) {
      parts.set(msg.id, msgParts)
    }
  }

  return { session, messages, parts }
}

async function findSessionFile(
  storageDir: string,
  sessionId: string
): Promise<OpenCodeSession | null> {
  const sessionDir = join(storageDir, "session")
  try {
    const projectDirs = await readdir(sessionDir)
    for (const projectDir of projectDirs) {
      const projectPath = join(sessionDir, projectDir)
      const sessionFiles = await readdir(projectPath).catch(() => [])
      for (const file of sessionFiles) {
        if (file === `${sessionId}.json`) {
          const content = await Bun.file(join(projectPath, file)).json()
          return content as OpenCodeSession
        }
      }
    }
  }
  catch {
    return null
  }
  return null
}

async function loadMessages(messagesDir: string): Promise<OpenCodeMessage[]> {
  try {
    const files = await readdir(messagesDir)
    const messages: OpenCodeMessage[] = []
    for (const file of files) {
      if (file.endsWith(".json")) {
        const content = await Bun.file(join(messagesDir, file)).json()
        messages.push(content as OpenCodeMessage)
      }
    }
    // Sort by creation time
    messages.sort((a, b) => a.time.created - b.time.created)
    return messages
  }
  catch {
    return []
  }
}

async function loadParts(partsDir: string): Promise<OpenCodePart[]> {
  try {
    const files = await readdir(partsDir)
    const parts: OpenCodePart[] = []
    for (const file of files) {
      if (file.endsWith(".json")) {
        const content = await Bun.file(join(partsDir, file)).json()
        parts.push(content as OpenCodePart)
      }
    }
    return parts
  }
  catch {
    return []
  }
}

export function formatSession(data: OpenCodeSessionData): string {
  const { session, messages, parts } = data
  const stats: OpenCodeStats = {
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    toolErrors: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0,
    filesRead: new Set(),
    filesWritten: new Set(),
    lastTimestamp: null,
  }

  let output = ""

  // Header
  output += `${EMOJI.metadata} Session: ${session.id}\n`
  output += `${EMOJI.metadata} Project: ${session.directory}\n`
  output += `${EMOJI.metadata} Started: ${new Date(session.time.created).toISOString()}\n`
  if (session.title) {
    output += `${EMOJI.metadata} Title: ${session.title}\n`
  }
  output += "\n"

  let currentModel: string | null = null

  for (const msg of messages) {
    stats.lastTimestamp = msg.time.completed || msg.time.created

    // Track tokens and cost
    if (msg.tokens) {
      stats.inputTokens += msg.tokens.input || 0
      stats.outputTokens += msg.tokens.output || 0
    }
    if (msg.cost) {
      stats.totalCost += msg.cost
    }

    // Model change
    if (msg.modelID && msg.modelID !== currentModel) {
      currentModel = msg.modelID
      output += `${EMOJI.metadata} Model: ${msg.modelID}\n`
    }

    const msgParts = parts.get(msg.id) || []

    if (msg.role === "user") {
      const textParts = msgParts.filter(p => p.type === "text" && p.text)
      for (const part of textParts) {
        // Skip synthetic/system content
        if (part.synthetic) continue
        if (part.text?.startsWith("<file>")) continue
        if (part.text?.startsWith("Called the")) continue

        const text = part.text?.trim()
        if (text) {
          output += `${EMOJI.user} ${text}\n`
          stats.userMessages++
        }
      }
    }
    else if (msg.role === "assistant") {
      // Process parts in order
      for (const part of msgParts) {
        if (part.type === "text" && part.text) {
          output += `${EMOJI.assistant} ${part.text.trim()}\n`
          stats.assistantMessages++
        }
        else if (part.type === "tool" && part.state) {
          stats.toolCalls++
          const isError = part.state.metadata?.exit !== 0 && part.state.metadata?.exit !== undefined
          if (isError) stats.toolErrors++

          const emoji = isError ? EMOJI.toolFailure : EMOJI.toolSuccess
          const toolName = part.tool || "unknown"
          const desc = part.state.title || part.state.metadata?.description || ""
          const truncDesc = desc.length > 100 ? desc.slice(0, 100) + "..." : desc

          output += `${emoji} ${toolName}: ${truncDesc}\n`

          // Track file operations
          if (toolName === "read" && part.state.input) {
            const path = part.state.input.filePath as string
            if (path) stats.filesRead.add(path)
          }
          else if (toolName === "write" && part.state.input) {
            const path = part.state.input.filePath as string
            if (path) stats.filesWritten.add(path)
          }
        }
      }
    }
  }

  // Summary
  output += formatSummary(stats, session.time.created)

  return output
}

function formatSummary(stats: OpenCodeStats, startTime: number): string {
  const lines = [
    "",
    `${EMOJI.metadata} --- Summary ---`,
  ]

  if (stats.lastTimestamp) {
    const durationMs = stats.lastTimestamp - startTime
    const duration = formatDuration(durationMs)
    if (duration) {
      lines.push(`${EMOJI.metadata} Duration: ${duration}`)
    }
  }

  lines.push(`${EMOJI.metadata} Messages: ${stats.userMessages} user, ${stats.assistantMessages} assistant`)
  lines.push(`${EMOJI.metadata} Tool calls: ${stats.toolCalls} total, ${stats.toolErrors} failed`)

  if (stats.inputTokens > 0 || stats.outputTokens > 0) {
    lines.push(`${EMOJI.metadata} Tokens: ${formatTokens(stats.inputTokens)} in, ${formatTokens(stats.outputTokens)} out`)
  }

  if (stats.totalCost > 0) {
    lines.push(`${EMOJI.metadata} Cost: $${stats.totalCost.toFixed(4)}`)
  }

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

function formatDuration(ms: number): string | null {
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
