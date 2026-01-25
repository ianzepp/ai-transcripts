import { parseArgs } from "node:util"
import { CodexTranscriptParser } from "./parse"
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
  const parser = new CodexTranscriptParser()

  const decoder = new TextDecoder()
  let buffer = ""

  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk, { stream: true })

    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      const output = parser.parse(line)
      if (output) {
        process.stdout.write(output)
      }
    }
  }

  if (buffer.trim()) {
    const output = parser.parse(buffer)
    if (output) {
      process.stdout.write(output)
    }
  }

  const summary = parser.finalize()
  if (summary) {
    process.stdout.write(summary)
  }
}

function printUsage(): void {
  console.log(`
Convert OpenAI Codex session logs to readable transcripts

Usage:
  cat session.jsonl | bun run codex             Stream mode (stdin -> stdout)
  bun run codex -- -b <input> -o <output>       Batch mode

Options:
  -b, --batch       Enable batch mode (process directory tree)
  -o, --output      Output directory (required for batch mode)
  -h, --help        Show this help

Examples:
  # Convert a single session
  cat ~/.codex/sessions/2025/11/11/rollout-*.jsonl | bun run codex > session.txt

  # Process all sessions
  bun run codex -- --batch ~/.codex/sessions --output ~/transcripts
`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
