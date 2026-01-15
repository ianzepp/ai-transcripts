export interface OpenCodeSession {
  id: string
  version: string
  projectID: string
  directory: string
  title: string
  time: {
    created: number
    updated: number
  }
  summary?: {
    additions: number
    deletions: number
    files: number
  }
}

export interface OpenCodeMessage {
  id: string
  sessionID: string
  role: "user" | "assistant"
  time: {
    created: number
    completed?: number
  }
  parentID?: string
  modelID?: string
  providerID?: string
  mode?: string
  agent?: string
  path?: {
    cwd: string
    root: string
  }
  cost?: number
  tokens?: {
    input: number
    output: number
    reasoning: number
    cache?: {
      read: number
      write: number
    }
  }
  finish?: string
  summary?: {
    title: string
    diffs: unknown[]
  }
}

export interface OpenCodePart {
  id: string
  sessionID: string
  messageID: string
  type: "text" | "file" | "tool" | "step-start" | "step-finish" | "reasoning"
  text?: string
  synthetic?: boolean
  callID?: string
  tool?: string
  state?: {
    status: string
    input?: Record<string, unknown>
    output?: string
    title?: string
    metadata?: {
      output?: string
      exit?: number
      description?: string
      truncated?: boolean
    }
    time?: {
      start: number
      end: number
    }
  }
  time?: {
    start: number
    end: number
  }
}

export interface OpenCodeSessionData {
  session: OpenCodeSession
  messages: OpenCodeMessage[]
  parts: Map<string, OpenCodePart[]>
}

export interface OpenCodeStats {
  userMessages: number
  assistantMessages: number
  toolCalls: number
  toolErrors: number
  inputTokens: number
  outputTokens: number
  totalCost: number
  filesRead: Set<string>
  filesWritten: Set<string>
  lastTimestamp: number | null
}
