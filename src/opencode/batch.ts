import { readdir, mkdir, stat } from "node:fs/promises"
import { join, dirname } from "node:path"
import { loadSession, formatSession } from "./parse"

export interface BatchOptions {
  input: string
  output: string
  force?: boolean
}

export async function processBatch(options: BatchOptions): Promise<void> {
  const storageDir = options.input
  const sessionIds = await findAllSessions(storageDir)
  const total = sessionIds.length
  const isTTY = process.stderr.isTTY
  console.error(`Found ${total} sessions`)

  let processed = 0
  let skipped = 0
  let upToDate = 0

  for (const sessionId of sessionIds) {
    const current = processed + skipped + upToDate + 1

    if (isTTY) {
      process.stderr.write(`\r  Processing ${current}/${total}...`)
    }
    else if (current === 1 || current % 500 === 0) {
      console.error(`  Processing ${current}/${total}...`)
    }

    const data = await loadSession(storageDir, sessionId)
    if (!data) {
      skipped++
      continue
    }

    const { folder, timestamp } = deriveDatePath(data.session.time.created)
    const outPath = join(options.output, folder, `${timestamp}-opencode.txt`)

    const messageDir = join(storageDir, "message", sessionId)
    if (!options.force && await isUpToDate(messageDir, outPath)) {
      upToDate++
      continue
    }

    await mkdir(dirname(outPath), { recursive: true })

    const content = formatSession(data)
    if (content.trim()) {
      await Bun.write(outPath, content)
      processed++
    }
    else {
      skipped++
    }
  }

  if (isTTY) {
    process.stderr.write("\r" + " ".repeat(40) + "\r")
  }
  console.error(`  Done: ${processed} processed, ${skipped} skipped, ${upToDate} up-to-date`)
}

async function findAllSessions(storageDir: string): Promise<string[]> {
  const sessionIds = new Set<string>()

  // Get sessions from message directories (most reliable)
  const messageDir = join(storageDir, "message")
  try {
    const dirs = await readdir(messageDir)
    for (const dir of dirs) {
      if (dir.startsWith("ses_")) {
        sessionIds.add(dir)
      }
    }
  }
  catch {
    // Ignore errors
  }

  return Array.from(sessionIds)
}

async function isUpToDate(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    const [inStat, outStat] = await Promise.all([stat(inputPath), stat(outputPath)])
    return outStat.mtimeMs >= inStat.mtimeMs
  }
  catch {
    return false
  }
}

function deriveDatePath(timestamp: number): { folder: string; timestamp: string } {
  const date = new Date(timestamp)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  const hour = String(date.getUTCHours()).padStart(2, "0")
  const minute = String(date.getUTCMinutes()).padStart(2, "0")
  const second = String(date.getUTCSeconds()).padStart(2, "0")

  return {
    folder: `${year}-${month}`,
    timestamp: `${year}-${month}-${day}T${hour}-${minute}-${second}`,
  }
}
