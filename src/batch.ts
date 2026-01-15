import { readdir, stat, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { TranscriptParser } from "./parse"

export interface BatchOptions {
  input: string
  output: string
}

export async function processBatch(options: BatchOptions): Promise<void> {
  const files = await findJsonlFiles(options.input)
  console.error(`Found ${files.length} session files`)

  let processed = 0
  let skipped = 0

  for (const file of files) {
    const fileInfo = await stat(file)
    if (fileInfo.size === 0) {
      skipped++
      continue
    }

    const slug = deriveProjectSlug(file, options.input)
    const timestamp = await extractTimestamp(file)
    const outPath = join(options.output, slug, `${timestamp}.log`)

    await mkdir(dirname(outPath), { recursive: true })
    await processFile(file, outPath)
    processed++

    if (processed % 100 === 0) {
      console.error(`Processed ${processed} files...`)
    }
  }

  console.error(`Done: ${processed} processed, ${skipped} skipped (empty)`)
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

export function deriveProjectSlug(filePath: string, inputBase: string): string {
  // Extract the project directory name from the parent directory of the file
  // e.g., /base/-Users-ianzepp-github-monk-api/session.jsonl
  //       -> github/monk-api

  const parentDir = dirname(filePath)
  const projectDir = parentDir.split("/").pop() || ""

  if (!projectDir) return "unknown"

  // Remove leading dash and home path components
  // -Users-ianzepp-github-monk-api -> github/monk-api
  // -Users-ianzepp-Workspaces-monk -> Workspaces/monk

  const parts = projectDir.split("-").filter(Boolean)

  // Find where the interesting path starts (after Users/username)
  let startIdx = 0
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "Users" && parts[i + 1]) {
      startIdx = i + 2 // Skip "Users" and username
      break
    }
  }

  const relevantParts = parts.slice(startIdx)
  if (relevantParts.length === 0) return projectDir

  return relevantParts.join("/")
}

async function extractTimestamp(filePath: string): Promise<string> {
  const file = Bun.file(filePath)
  const text = await file.text()
  const firstLine = text.split("\n")[0]

  if (!firstLine) return "unknown"

  try {
    const record = JSON.parse(firstLine)
    const ts = record.timestamp as string
    // Convert ISO timestamp to filename-safe format
    // 2025-12-13T01:06:41.581Z -> 2025-12-13T01-06-41
    return ts.replace(/:/g, "-").replace(/\.\d+Z$/, "")
  }
  catch {
    return "unknown"
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
