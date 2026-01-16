import { readdir, stat } from "node:fs/promises"
import { join, dirname } from "node:path"

interface ProjectStats {
  sessions: number
  userMessages: number
  userWords: number
  assistantMessages: number
  assistantWords: number
  bashTotal: number
  bashSuccess: number
  bashFailed: number
  reads: number
  writes: number
  edits: number
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheCreated: number
  totalDurationMinutes: number
}

function emptyStats(): ProjectStats {
  return {
    sessions: 0,
    userMessages: 0,
    userWords: 0,
    assistantMessages: 0,
    assistantWords: 0,
    bashTotal: 0,
    bashSuccess: 0,
    bashFailed: 0,
    reads: 0,
    writes: 0,
    edits: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheRead: 0,
    cacheCreated: 0,
    totalDurationMinutes: 0,
  }
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function parseTokenValue(str: string): number {
  const match = str.match(/([\d.]+)([KM]?)/)
  if (!match) return 0
  const num = parseFloat(match[1])
  const suffix = match[2]
  if (suffix === "M") return num * 1_000_000
  if (suffix === "K") return num * 1_000
  return num
}

function parseDuration(str: string): number {
  // "1h 4m" or "12m" or "45s"
  let minutes = 0
  const hourMatch = str.match(/(\d+)h/)
  const minMatch = str.match(/(\d+)m/)
  const secMatch = str.match(/(\d+)s/)
  if (hourMatch) minutes += parseInt(hourMatch[1]) * 60
  if (minMatch) minutes += parseInt(minMatch[1])
  if (secMatch) minutes += parseInt(secMatch[1]) / 60
  return minutes
}

function parseFile(content: string, stats: ProjectStats): void {
  stats.sessions++
  const lines = content.split("\n")

  for (const line of lines) {
    // User messages
    if (line.startsWith("👤 ")) {
      stats.userMessages++
      stats.userWords += countWords(line.slice(2))
    }
    // Assistant messages
    else if (line.startsWith("🤖 ")) {
      stats.assistantMessages++
      stats.assistantWords += countWords(line.slice(2))
    }
    // Successful tool calls
    else if (line.startsWith("✅ ")) {
      if (line.startsWith("✅ Bash:")) {
        stats.bashTotal++
        stats.bashSuccess++
      }
      else if (line.startsWith("✅ Read:")) stats.reads++
      else if (line.startsWith("✅ Write:")) stats.writes++
      else if (line.startsWith("✅ Edit:")) stats.edits++
    }
    // Failed tool calls
    else if (line.startsWith("❌ ")) {
      if (line.startsWith("❌ Bash:")) {
        stats.bashTotal++
        stats.bashFailed++
      }
    }
    // Summary lines
    else if (line.startsWith("📋 Duration:")) {
      stats.totalDurationMinutes += parseDuration(line)
    }
    else if (line.startsWith("📋 Tokens:")) {
      // "📋 Tokens: 1.2K in, 4.5K out"
      const match = line.match(/Tokens:\s*([\d.]+[KM]?)\s*in,\s*([\d.]+[KM]?)\s*out/)
      if (match) {
        stats.inputTokens += parseTokenValue(match[1])
        stats.outputTokens += parseTokenValue(match[2])
      }
    }
    else if (line.startsWith("📋 Cache:")) {
      // "📋 Cache: 500.0K read, 50.0K created"
      const match = line.match(/Cache:\s*([\d.]+[KM]?)\s*read,\s*([\d.]+[KM]?)\s*created/)
      if (match) {
        stats.cacheRead += parseTokenValue(match[1])
        stats.cacheCreated += parseTokenValue(match[2])
      }
    }
  }
}

async function findTxtFiles(dir: string): Promise<string[]> {
  const results: string[] = []

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      }
      else if (entry.name.endsWith(".txt")) {
        results.push(fullPath)
      }
    }
  }

  await walk(dir)
  return results
}

function getProjectKey(filePath: string, baseDir: string): string {
  const relative = filePath.replace(baseDir, "").replace(/^\//, "")
  const parts = relative.split("/")
  // Use up to 3 levels of nesting for project grouping
  // github/ianzepp/faber -> github/ianzepp/faber
  // github/monk -> github/monk
  // private/tmp -> private/tmp
  const depth = Math.min(parts.length - 1, 3) // -1 to exclude filename
  if (depth > 0) {
    return parts.slice(0, depth).join("/")
  }
  return parts[0]?.replace(/\.txt$/, "") || "unknown"
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return `${hours}h ${mins}m`
  }
  return `${Math.round(minutes)}m`
}

async function main(): Promise<void> {
  const inputDir = process.argv[2]
  if (!inputDir) {
    console.error("Usage: claude-transcript summarize <transcripts-dir>")
    process.exit(1)
  }

  const files = await findTxtFiles(inputDir)
  console.error(`Found ${files.length} transcript files`)

  const projects = new Map<string, ProjectStats>()

  for (const file of files) {
    const projectKey = getProjectKey(file, inputDir)
    if (!projects.has(projectKey)) {
      projects.set(projectKey, emptyStats())
    }
    const content = await Bun.file(file).text()
    parseFile(content, projects.get(projectKey)!)
  }

  // Sort by project/month name ascending
  const sorted = [...projects.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  // Header
  console.log("| Month | Sessions | User (words) | AI (words) | Bash (✓/✗) | R/W/E | Tokens (in/out) | Time |")
  console.log("|---|---|---|---|---|---|---|---|")

  // Totals
  const totals = emptyStats()

  for (const [project, stats] of sorted) {
    const projectName = project.padEnd(32).slice(0, 32)
    const sessions = String(stats.sessions).padStart(8)
    const user = `${stats.userMessages} (${formatNumber(stats.userWords)})`.padStart(14)
    const ai = `${stats.assistantMessages} (${formatNumber(stats.assistantWords)})`.padStart(14)
    const bash = `${stats.bashTotal} (${stats.bashSuccess}/${stats.bashFailed})`.padStart(14)
    const rwe = `${stats.reads}/${stats.writes}/${stats.edits}`.padStart(12)
    const tokens = `${formatNumber(stats.inputTokens)}/${formatNumber(stats.outputTokens)}`.padStart(17)
    const time = formatDuration(stats.totalDurationMinutes).padStart(8)

    console.log(`| ${projectName.trim()} | ${sessions.trim()} | ${user.trim()} | ${ai.trim()} | ${bash.trim()} | ${rwe.trim()} | ${tokens.trim()} | ${time.trim()} |`)

    // Accumulate totals
    totals.sessions += stats.sessions
    totals.userMessages += stats.userMessages
    totals.userWords += stats.userWords
    totals.assistantMessages += stats.assistantMessages
    totals.assistantWords += stats.assistantWords
    totals.bashTotal += stats.bashTotal
    totals.bashSuccess += stats.bashSuccess
    totals.bashFailed += stats.bashFailed
    totals.reads += stats.reads
    totals.writes += stats.writes
    totals.edits += stats.edits
    totals.inputTokens += stats.inputTokens
    totals.outputTokens += stats.outputTokens
    totals.totalDurationMinutes += stats.totalDurationMinutes
  }

  // Print totals
  console.log("|---|---|---|---|---|---|---|---|")
  const tProjectName = "**TOTAL**"
  const tSessions = String(totals.sessions)
  const tUser = `${totals.userMessages} (${formatNumber(totals.userWords)})`
  const tAi = `${totals.assistantMessages} (${formatNumber(totals.assistantWords)})`
  const tBash = `${totals.bashTotal} (${totals.bashSuccess}/${totals.bashFailed})`
  const tRwe = `${totals.reads}/${totals.writes}/${totals.edits}`
  const tTokens = `${formatNumber(totals.inputTokens)}/${formatNumber(totals.outputTokens)}`
  const tTime = formatDuration(totals.totalDurationMinutes)

  console.log(`| ${tProjectName} | ${tSessions} | ${tUser} | ${tAi} | ${tBash} | ${tRwe} | ${tTokens} | ${tTime} |`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
