import { parseArgs } from "node:util"
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
    console.error("Stream mode not supported for OpenCode (data is fragmented)")
    console.error("Use batch mode: opencode-transcript -b ~/.local/share/opencode/storage -o <output>")
    process.exit(1)
  }
}

function printUsage(): void {
  console.log(`
opencode-transcript - Convert OpenCode session data to readable transcripts

Usage:
  opencode-transcript -b <input> -o <output>    Batch mode (required)

Options:
  -b, --batch       Enable batch mode (process all sessions)
  -o, --output      Output directory (required)
  -h, --help        Show this help

Examples:
  # Process all sessions
  opencode-transcript --batch ~/.local/share/opencode/storage --output ~/transcripts

Note: Stream mode is not supported because OpenCode stores data across
multiple files (sessions, messages, parts) that must be joined.
`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
