import { parseArgs } from "node:util"
import { TranscriptParser } from "./parse"
import { processBatch } from "./batch"

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      batch: { type: "boolean", short: "b", default: false },
      output: { type: "string", short: "o" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  })

  if (values.help) {
    printUsage()
    process.exit(0)
  }

  if (values.batch) {
    if (!positionals[0] || !values.output) {
      console.error("Batch mode requires input path and --output")
      printUsage()
      process.exit(1)
    }

    await processBatch({
      input: positionals[0],
      output: values.output,
    })
  }
  else {
    await streamMode()
  }
}

async function streamMode(): Promise<void> {
  const parser = new TranscriptParser()

  // Read from stdin
  const decoder = new TextDecoder()
  let buffer = ""

  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk, { stream: true })

    const lines = buffer.split("\n")
    // Keep the last potentially incomplete line in buffer
    buffer = lines.pop() || ""

    for (const line of lines) {
      const output = parser.parse(line)
      if (output) {
        process.stdout.write(output)
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    const output = parser.parse(buffer)
    if (output) {
      process.stdout.write(output)
    }
  }

  // Emit summary footer
  const summary = parser.finalize()
  if (summary) {
    process.stdout.write(summary)
  }
}

function printUsage(): void {
  console.log(`
claude-transcript - Convert Claude Code session logs to readable transcripts

Usage:
  cat session.jsonl | claude-transcript          Stream mode (stdin -> stdout)
  claude-transcript -b <input> -o <output>       Batch mode

Options:
  -b, --batch       Enable batch mode (process directory tree)
  -o, --output      Output directory (required for batch mode)
  -h, --help        Show this help

Examples:
  # Convert a single session
  cat ~/.claude/projects/-Users-me-github/abc123.jsonl | claude-transcript > session.log

  # Process all sessions
  claude-transcript --batch ~/.claude/projects --output ~/archive/transcripts
`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
