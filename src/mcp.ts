import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { readdir, stat } from "node:fs/promises"
import { join, basename } from "node:path"
import { spawn } from "node:child_process"

const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || join(process.env.HOME || "", "transcripts")

interface SearchOptions {
  keywords: string[]
  days?: number
  limit?: number
  context_lines?: number
  message_type?: "user" | "assistant" | "all"
}

interface SearchResult {
  file: string
  date: string
  matches: string[]
}

async function searchTranscripts(options: SearchOptions): Promise<SearchResult[]> {
  const { keywords, days = 90, limit = 20, context_lines = 2, message_type = "all" } = options

  // Build the grep pattern
  let pattern = keywords.map(k => escapeRegex(k)).join("|")

  // Prefix filter by message type
  if (message_type === "user") {
    pattern = `^👤.*(?:${pattern})`
  }
  else if (message_type === "assistant") {
    pattern = `^🤖.*(?:${pattern})`
  }

  // Calculate date cutoff
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  const cutoffStr = cutoffDate.toISOString().slice(0, 10)

  // Find matching files (date-filtered)
  const files = await findRecentFiles(TRANSCRIPTS_DIR, cutoffStr)

  if (files.length === 0) {
    return []
  }

  // Run ripgrep
  const results = await runGrep(pattern, files, context_lines, limit)
  return results
}

async function findRecentFiles(dir: string, cutoffDate: string): Promise<string[]> {
  const results: string[] = []

  async function walk(current: string): Promise<void> {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    }
    catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name)

      if (entry.isDirectory()) {
        // Directory names are like "2025-01", skip old ones
        if (entry.name.match(/^\d{4}-\d{2}$/) && entry.name < cutoffDate.slice(0, 7)) {
          continue
        }
        await walk(fullPath)
      }
      else if (entry.name.endsWith(".txt")) {
        // File names start with date like "2025-01-15T..."
        const fileDate = entry.name.slice(0, 10)
        if (fileDate >= cutoffDate) {
          results.push(fullPath)
        }
      }
    }
  }

  try {
    await walk(dir)
  }
  catch {
    // Directory doesn't exist
  }

  return results.sort().reverse() // Most recent first
}

function runGrep(pattern: string, files: string[], contextLines: number, limit: number): Promise<SearchResult[]> {
  return new Promise((resolve) => {
    const args = [
      "-i",                          // Case insensitive
      "-n",                          // Line numbers
      `-C${contextLines}`,           // Context lines
      "-e", pattern,                 // Pattern
      "--max-count", "3",            // Max matches per file
      ...files.slice(0, 100)         // Limit files to search
    ]

    const rg = spawn("rg", args, { stdio: ["ignore", "pipe", "pipe"] })

    let stdout = ""
    rg.stdout.on("data", (data) => { stdout += data.toString() })
    rg.stderr.on("data", () => { /* ignore */ })

    rg.on("close", () => {
      const results = parseGrepOutput(stdout, limit)
      resolve(results)
    })

    rg.on("error", () => {
      resolve([])
    })
  })
}

function parseGrepOutput(output: string, limit: number): SearchResult[] {
  const byFile = new Map<string, string[]>()

  // Group output by file
  let currentFile = ""
  const lines = output.split("\n")

  for (const line of lines) {
    if (line === "--") {
      continue // Separator between matches
    }

    // ripgrep output: /path/to/file:linenum:content
    const match = line.match(/^(.+\.txt)[:\-](\d+)[:\-](.*)$/)
    if (match) {
      const [, file, , content] = match
      currentFile = file

      if (!byFile.has(file)) {
        byFile.set(file, [])
      }
      byFile.get(file)!.push(content)
    }
  }

  // Convert to results
  const results: SearchResult[] = []
  for (const [file, matches] of byFile) {
    const filename = basename(file)
    const date = filename.slice(0, 10)
    results.push({ file, date, matches })

    if (results.length >= limit) {
      break
    }
  }

  return results
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function formatResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No matches found."
  }

  let output = ""
  for (const result of results) {
    output += `\n${result.date} ${result.file}\n`
    for (const line of result.matches) {
      output += `  ${line}\n`
    }
  }
  return output.trim()
}

// MCP Server setup
const server = new Server(
  { name: "transcripts", version: "1.0.0" },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_transcripts",
        description: "Search past conversation transcripts for relevant context. Use this to find previous discussions about a topic, recall past decisions, or understand history with a project.",
        inputSchema: {
          type: "object",
          properties: {
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "Keywords to search for (OR matched)"
            },
            days: {
              type: "number",
              description: "How many days back to search (default: 90)"
            },
            limit: {
              type: "number",
              description: "Maximum results to return (default: 20)"
            },
            context_lines: {
              type: "number",
              description: "Lines of context around matches (default: 2)"
            },
            message_type: {
              type: "string",
              enum: ["user", "assistant", "all"],
              description: "Filter by message type (default: all)"
            }
          },
          required: ["keywords"]
        }
      }
    ]
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "search_transcripts") {
    const rawArgs = request.params.arguments ?? {}
    const args: SearchOptions = {
      keywords: rawArgs.keywords as string[] ?? [],
      days: rawArgs.days as number | undefined,
      limit: rawArgs.limit as number | undefined,
      context_lines: rawArgs.context_lines as number | undefined,
      message_type: rawArgs.message_type as "user" | "assistant" | "all" | undefined,
    }

    if (!args.keywords || args.keywords.length === 0) {
      return {
        content: [{ type: "text", text: "Error: keywords array is required" }]
      }
    }

    const results = await searchTranscripts(args)
    const formatted = formatResults(results)

    return {
      content: [{ type: "text", text: formatted }]
    }
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }]
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error("MCP server error:", err)
  process.exit(1)
})
