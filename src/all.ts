import { parseArgs } from "node:util"
import { stat } from "node:fs/promises"
import { join } from "node:path"
import { processBatch as processClaudeBatch } from "./batch"
import { processBatch as processCodexBatch } from "./codex/batch"
import { processBatch as processOpencodeBatch } from "./opencode/batch"

const DEFAULT_SOURCES = {
  claude: join(process.env.HOME || "", ".claude/projects"),
  codex: join(process.env.HOME || "", ".codex/sessions"),
  opencode: join(process.env.HOME || "", ".local/share/opencode/storage"),
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      output: { type: "string", short: "o" },
      force: { type: "boolean", short: "f", default: false },
      commit: { type: "boolean", short: "c", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  })

  if (values.help) {
    printUsage()
    process.exit(0)
  }

  if (!values.output) {
    console.error("Error: --output is required")
    printUsage()
    process.exit(1)
  }

  const output = values.output
  const force = values.force ?? false

  // Check which sources exist
  const sources: { name: string; path: string; processor: typeof processClaudeBatch }[] = []

  for (const [name, path] of Object.entries(DEFAULT_SOURCES)) {
    if (await exists(path)) {
      const processor = name === "claude" ? processClaudeBatch
        : name === "codex" ? processCodexBatch
        : processOpencodeBatch
      sources.push({ name, path, processor })
    }
  }

  if (sources.length === 0) {
    console.error("No session directories found. Checked:")
    for (const [name, path] of Object.entries(DEFAULT_SOURCES)) {
      console.error(`  ${name}: ${path}`)
    }
    process.exit(1)
  }

  console.error(`Found ${sources.length} source(s): ${sources.map(s => s.name).join(", ")}`)

  for (const source of sources) {
    console.error(`\nProcessing ${source.name} (${source.path})...`)
    await source.processor({ input: source.path, output, force })
  }

  if (values.commit) {
    await commitChanges(output)
  }

  console.error("\nAll done.")
}

async function commitChanges(dir: string): Promise<void> {
  const { spawnSync } = await import("node:child_process")

  // Check if it's a git repo
  const gitCheck = spawnSync("git", ["rev-parse", "--git-dir"], { cwd: dir })
  if (gitCheck.status !== 0) {
    console.error("\n--commit: not a git repository, skipping")
    return
  }

  // Check for changes
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: dir })
  const changes = status.stdout.toString().trim()
  if (!changes) {
    console.error("\n--commit: no changes to commit")
    return
  }

  // Stage and commit
  const add = spawnSync("git", ["add", "-A"], { cwd: dir })
  if (add.status !== 0) {
    console.error("\n--commit: git add failed")
    return
  }

  const date = new Date().toISOString().split("T")[0]
  const commit = spawnSync("git", ["commit", "-m", `Transcripts update ${date}`], { cwd: dir })
  if (commit.status !== 0) {
    console.error("\n--commit: git commit failed")
    console.error(commit.stderr.toString())
    return
  }

  console.error("\n--commit: committed changes")
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  }
  catch {
    return false
  }
}

function printUsage(): void {
  console.log(`
Process all AI assistant session logs at once

Usage:
  bun run all -- -o <output> [-f]

Options:
  -o, --output      Output directory (required)
  -f, --force       Regenerate all files (default: skip if output is newer)
  -c, --commit      Commit changes to git (if output is a repo)
  -h, --help        Show this help

Sources checked:
  Claude Code:  ~/.claude/projects
  OpenAI Codex: ~/.codex/sessions
  OpenCode:     ~/.local/share/opencode/storage

Only sources that exist will be processed. Output is organized by date
with tool suffix (-claude.txt, -codex.txt, -opencode.txt).

Example:
  bun run all -- --output ~/transcripts
`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
