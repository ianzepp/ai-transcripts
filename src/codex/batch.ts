import { readdir, stat, mkdir } from "node:fs/promises"
import { join, dirname, basename } from "node:path"
import { CodexTranscriptParser } from "./parse"

export interface BatchOptions {
  input: string
  output: string
}

export async function processBatch(options: BatchOptions): Promise<void> {
  const files = await findJsonlFiles(options.input)
  const total = files.length
  const isTTY = process.stderr.isTTY
  console.error(`Found ${total} session files`)

  let processed = 0
  let skipped = 0

  for (const file of files) {
    const current = processed + skipped + 1

    if (isTTY) {
      process.stderr.write(`\r  Processing ${current}/${total}...`)
    }
    else if (current === 1 || current % 500 === 0) {
      console.error(`  Processing ${current}/${total}...`)
    }

    const fileInfo = await stat(file)
    if (fileInfo.size === 0) {
      skipped++
      continue
    }

    const { folder, timestamp } = deriveOutputPath(file)
    const outPath = join(options.output, folder, `${timestamp}-codex.txt`)

    await mkdir(dirname(outPath), { recursive: true })
    await processFile(file, outPath)
    processed++
  }

  if (isTTY) {
    process.stderr.write("\r" + " ".repeat(40) + "\r")
  }
  console.error(`  Done: ${processed} processed, ${skipped} skipped (empty)`)
}

async function findJsonlFiles(dir: string): Promise<string[]> {
  const results: string[] = []

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(current, entry.name)

      if (entry.isDirectory()) {
        await walk(fullPath)
      }
      else if (entry.name.endsWith(".jsonl") && entry.name.startsWith("rollout-")) {
        results.push(fullPath)
      }
    }
  }

  await walk(dir)
  return results
}

function deriveOutputPath(filePath: string): { folder: string; timestamp: string } {
  // Codex files are at: sessions/YYYY/MM/DD/rollout-YYYY-MM-DDTHH-MM-SS-uuid.jsonl
  const filename = basename(filePath)
  // rollout-2025-11-11T14-12-49-019a7455-c459-76d1-961e-ad0a8695c7ca.jsonl
  const match = filename.match(/rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(.+)\.jsonl/)

  if (match) {
    const [, year, month, day, hour, minute, second] = match
    return {
      folder: `${year}-${month}`,
      timestamp: `${year}-${month}-${day}T${hour}-${minute}-${second}`,
    }
  }

  return {
    folder: "unknown",
    timestamp: "unknown",
  }
}

async function processFile(inputPath: string, outputPath: string): Promise<void> {
  const parser = new CodexTranscriptParser()
  const file = Bun.file(inputPath)
  const text = await file.text()
  const lines = text.split("\n")

  let output = ""
  for (const line of lines) {
    output += parser.parse(line)
  }

  // Add summary footer
  output += parser.finalize()

  // Only write if there's content
  if (output.trim()) {
    await Bun.write(outputPath, output)
  }
}
