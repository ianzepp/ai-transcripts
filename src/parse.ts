import type {
  SessionRecord,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlock,
  PendingTool,
  SessionMetadata,
  SessionStats,
} from "./types"
import {
  formatMetadata,
  formatUserMessage,
  formatAssistantText,
  formatToolCall,
  formatQueueOperation,
  formatModelChange,
  formatSummary,
} from "./format"

export class TranscriptParser {
  private pendingTools: Map<string, PendingTool> = new Map()
  private metadata: SessionMetadata | null = null
  private metadataEmitted = false
  private currentModel: string | null = null
  private stats: SessionStats = {
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    toolErrors: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    filesRead: new Set(),
    filesWritten: new Set(),
    filesEdited: new Set(),
    lastTimestamp: null,
  }

  parse(line: string): string {
    const trimmed = line.trim()
    if (!trimmed) return ""

    let record: SessionRecord
    try {
      record = JSON.parse(trimmed)
    }
    catch {
      return ""
    }

    // Capture metadata from first record
    if (!this.metadata) {
      this.metadata = {
        sessionId: record.sessionId,
        project: record.cwd,
        started: record.timestamp,
        version: record.version,
        gitBranch: record.gitBranch || undefined,
      }
    }

    let output = ""

    // Emit metadata header before first content
    if (!this.metadataEmitted && this.metadata) {
      output += formatMetadata(this.metadata) + "\n"
      this.metadataEmitted = true
    }

    // Track last timestamp for duration calculation
    this.stats.lastTimestamp = record.timestamp

    switch (record.type) {
      case "user":
        output += this.parseUserRecord(record)
        break
      case "assistant":
        output += this.parseAssistantRecord(record)
        break
      case "queue-operation":
        output += this.parseQueueOperation(record)
        break
    }

    return output
  }

  private parseUserRecord(record: SessionRecord): string {
    // Skip meta messages (system injected)
    if (record.isMeta) return ""

    const message = record.message
    if (message.role !== "user") return ""

    let output = ""
    let hasUserContent = false

    // Handle string content
    if (typeof message.content === "string") {
      // Skip command/notification content (XML-like)
      if (message.content.startsWith("<")) return ""
      output += formatUserMessage(message.content)
      hasUserContent = true
    }
    else {
      // Handle array content
      for (const block of message.content) {
        if (block.type === "text") {
          // Skip command/notification content
          if (block.text.startsWith("<")) continue
          output += formatUserMessage(block.text)
          hasUserContent = true
        }
        else if (block.type === "tool_result") {
          output += this.processToolResult(block as ToolResultBlock)
        }
      }
    }

    if (hasUserContent) {
      this.stats.userMessages++
    }

    return output
  }

  private parseAssistantRecord(record: SessionRecord): string {
    const message = record.message
    if (message.role !== "assistant") return ""

    let output = ""

    // Check for model change
    const model = (message as { model?: string }).model
    if (model && model !== "<synthetic>" && model !== this.currentModel) {
      this.currentModel = model
      output += formatModelChange(model)
    }

    // Track token usage
    const usage = (message as { usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }}).usage
    if (usage) {
      this.stats.inputTokens += usage.input_tokens || 0
      this.stats.outputTokens += usage.output_tokens || 0
      this.stats.cacheCreationTokens += usage.cache_creation_input_tokens || 0
      this.stats.cacheReadTokens += usage.cache_read_input_tokens || 0
    }

    let hasTextContent = false
    for (const block of message.content as ContentBlock[]) {
      if (block.type === "text") {
        output += formatAssistantText(block.text)
        hasTextContent = true
      }
      else if (block.type === "tool_use") {
        this.pendingTools.set(block.id, {
          name: block.name,
          input: block.input,
        })
      }
      // Skip thinking blocks
    }

    if (hasTextContent) {
      this.stats.assistantMessages++
    }

    return output
  }

  private processToolResult(block: ToolResultBlock): string {
    const pending = this.pendingTools.get(block.tool_use_id)
    if (!pending) return ""

    this.pendingTools.delete(block.tool_use_id)
    this.stats.toolCalls++
    if (block.is_error) {
      this.stats.toolErrors++
    }

    // Track file operations
    const filePath = pending.input.file_path as string | undefined
    if (filePath && !block.is_error) {
      switch (pending.name) {
        case "Read":
          this.stats.filesRead.add(filePath)
          break
        case "Write":
          this.stats.filesWritten.add(filePath)
          break
        case "Edit":
          this.stats.filesEdited.add(filePath)
          break
      }
    }

    return formatToolCall(pending, block.is_error === true)
  }

  private parseQueueOperation(record: SessionRecord): string {
    // Queue operations have content in a different structure
    const content = (record as unknown as { content?: string }).content
    if (!content) return ""
    return formatQueueOperation(content)
  }

  finalize(): string {
    // Only emit summary if there was actual content
    if (this.stats.userMessages === 0 && this.stats.assistantMessages === 0) {
      return ""
    }
    const startTime = this.metadata?.started || null
    return formatSummary(this.stats, startTime)
  }
}
