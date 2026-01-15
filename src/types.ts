export interface SessionRecord {
  type: "user" | "assistant" | "queue-operation"
  sessionId: string
  uuid: string
  parentUuid: string | null
  timestamp: string
  cwd: string
  version: string
  gitBranch?: string
  isSidechain?: boolean
  isMeta?: boolean
  message: UserMessage | AssistantMessage
  requestId?: string
}

export interface UserMessage {
  role: "user"
  content: string | ContentBlock[]
}

export interface AssistantMessage {
  role: "assistant"
  model?: string
  id?: string
  content: ContentBlock[]
  stop_reason?: string | null
  usage?: TokenUsage
}

export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock

export interface TextBlock {
  type: "text"
  text: string
}

export interface ThinkingBlock {
  type: "thinking"
  thinking: string
  signature?: string
}

export interface ToolUseBlock {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultBlock {
  type: "tool_result"
  tool_use_id: string
  content: string | ContentBlock[]
  is_error?: boolean
}

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export interface PendingTool {
  name: string
  input: Record<string, unknown>
}

export interface SessionMetadata {
  sessionId: string
  project: string
  started: string
  version: string
  gitBranch?: string
}

export interface SessionStats {
  userMessages: number
  assistantMessages: number
  toolCalls: number
  toolErrors: number
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  filesRead: Set<string>
  filesWritten: Set<string>
  filesEdited: Set<string>
  lastTimestamp: string | null
}
