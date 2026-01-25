import { readdir, stat, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { TranscriptParser } from "./parse"

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

    const { folder, timestamp } = await extractDatePath(file)
    const outPath = join(options.output, folder, `${timestamp}-claude.txt`)

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
      else if (entry.name.endsWith(".jsonl") && !entry.name.includes(".bak")) {
        results.push(fullPath)
      }
    }
  }

  await walk(dir)
  return results
}

async function extractDatePath(filePath: string): Promise<{ folder: string; timestamp: string }> {
  const file = Bun.file(filePath)
  const text = await file.text()
  const firstLine = text.split("\n")[0]

  if (!firstLine) {
    return { folder: "unknown", timestamp: "unknown" }
  }

  try {
    const record = JSON.parse(firstLine)
    const ts = record.timestamp as string
    // Extract year-month for folder: 2025-12-13T01:06:41.581Z -> 2025-12
    const match = ts.match(/^(\d{4})-(\d{2})/)
    const folder = match ? `${match[1]}-${match[2]}` : "unknown"
    // Convert full timestamp to filename-safe format
    // 2025-12-13T01:06:41.581Z -> 2025-12-13T01-06-41
    const timestamp = ts.replace(/:/g, "-").replace(/\.\d+Z$/, "")
    return { folder, timestamp }
  }
  catch {
    return { folder: "unknown", timestamp: "unknown" }
  }
}

async function processFile(inputPath: string, outputPath: string): Promise<void> {
  const parser = new TranscriptParser()
  const file = Bun.file(inputPath)
  const text = await file.text()
  const lines = text.split("\n")

  let output = ""
  for (const line of lines) {
    output += parser.parse(line)
  }

  // Add summary footer
  output += parser.finalize()

  await Bun.write(outputPath, output)
}
