export interface CodexRecord {
  timestamp: string
  type: "session_meta" | "response_item" | "event_msg" | "turn_context"
  payload: SessionMetaPayload | ResponseItemPayload | EventMsgPayload | TurnContextPayload
}

export interface SessionMetaPayload {
  id: string
  timestamp: string
  cwd: string
  originator: string
  cli_version: string
  instructions: string | null
  source: string
  model_provider: string
  git?: {
    commit_hash: string
    branch: string
    repository_url: string
  }
}

export interface ResponseItemPayload {
  type: "message" | "function_call" | "function_call_output" | "reasoning"
  role?: "user" | "assistant"
  content?: ContentBlock[]
  name?: string
  arguments?: string
  call_id?: string
  output?: string
  summary?: SummaryBlock[]
}

export interface EventMsgPayload {
  type: "user_message" | "token_count" | "agent_reasoning"
  message?: string
  text?: string
  images?: unknown[]
}

export interface TurnContextPayload {
  cwd: string
  approval_policy: string
  sandbox_policy: { mode: string }
  model: string
  effort: string
  summary: string
}

export interface ContentBlock {
  type: "input_text" | "output_text"
  text: string
}

export interface SummaryBlock {
  type: "summary_text"
  text: string
}

export interface PendingFunction {
  name: string
  arguments: string
}

export interface CodexSessionMetadata {
  sessionId: string
  project: string
  started: string
  cliVersion: string
  modelProvider: string
  gitBranch?: string
}

export interface CodexSessionStats {
  userMessages: number
  assistantMessages: number
  functionCalls: number
  functionErrors: number
  filesRead: Set<string>
  filesWritten: Set<string>
  lastTimestamp: string | null
  model: string | null
}
