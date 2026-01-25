# ai-transcripts

Extract AI coding assistant session logs to readable, searchable transcripts.

Supports:
- **Claude Code** (`~/.claude/projects/`)
- **OpenAI Codex** (`~/.codex/sessions/`)
- **OpenCode** (`~/.local/share/opencode/storage/`)

## Installation

```bash
git clone https://github.com/ianzepp/ai-transcripts.git
cd ai-transcripts
bun install
```

## Usage

### All Sources

Process all AI assistant sessions at once:

```bash
bun run all -- --output ~/transcripts
```

Automatically detects and processes any of:
- `~/.claude/projects` (Claude Code)
- `~/.codex/sessions` (OpenAI Codex)
- `~/.local/share/opencode/storage` (OpenCode)

### Claude Code

**Stream mode** (stdin/stdout):
```bash
cat ~/.claude/projects/-Users-me-github/abc123.jsonl | bun run claude > session.txt
```

**Batch mode** (process all sessions):
```bash
bun run claude -- --batch ~/.claude/projects --output ~/transcripts
```

Batch mode:
- Recursively finds all `.jsonl` session files
- Skips empty files and `.bak` files
- Organizes output by date: `2025-01/2025-01-15T10-30-00-claude.txt`

### OpenAI Codex

**Stream mode** (stdin/stdout):
```bash
cat ~/.codex/sessions/2025/11/11/rollout-*.jsonl | bun run codex > session.txt
```

**Batch mode** (process all sessions):
```bash
bun run codex -- --batch ~/.codex/sessions --output ~/transcripts
```

Batch mode:
- Recursively finds all `rollout-*.jsonl` session files
- Organizes output by date: `2025-11/2025-11-11T14-12-49-codex.txt`

### OpenCode

**Batch mode only** (data is fragmented across multiple files):
```bash
bun run opencode -- --batch ~/.local/share/opencode/storage --output ~/transcripts
```

Batch mode:
- Loads session metadata, messages, and parts from separate directories
- Reconstructs conversations by joining related files
- Organizes output by date: `2025-11/2025-11-11T14-12-49-opencode.txt`

## Input Format

Claude Code stores sessions as JSONL in `~/.claude/projects/<path-encoded>/`:

```json
{"type":"user","message":{"role":"user","content":"find the config file"},"timestamp":"2025-01-15T10:30:00.000Z",...}
{"type":"assistant","message":{"role":"assistant","model":"claude-opus-4-5-20251101","content":[{"type":"text","text":"Let me search for that."},{"type":"tool_use","name":"Glob","input":{"pattern":"**/config.*"}}],"usage":{"input_tokens":100,"output_tokens":50}},...}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"...","content":"/src/config.ts"}]},...}
```

## Output Format

Emoji-prefixed lines for easy parsing:

```
📋 Session: abc123-def456
📋 Project: /Users/me/github/my-project
📋 Started: 2025-01-15T10:30:00.000Z
📋 Version: 2.0.76

👤 find the config file
📋 Model: opus-4.5
🤖 Let me search for that.
✅ Glob: pattern="**/config.*"
🤖 Found it at `/src/config.ts`
👤 show me the contents
✅ Read: file="/Users/me/github/my-project/src/config.ts"
🤖 Here's the config file:
...

📋 --- Summary ---
📋 Duration: 12m
📋 Messages: 5 user, 8 assistant
📋 Tool calls: 15 total, 2 failed
📋 Files: 3 read, 1 written, 2 edited
📋 Tokens: 1.2K in, 4.5K out
📋 Cache: 500.0K read, 50.0K created
```

### Line Prefixes

| Emoji | Meaning |
|-------|---------|
| 📋 | Metadata, model changes, summary |
| 👤 | User message |
| 🤖 | Assistant response |
| ✅ | Successful tool call |
| ❌ | Failed tool call |
| ⏳ | Background task notification |

## Searching Transcripts

The emoji prefixes make grep effective:

```bash
# Find all user messages
grep "^👤" *.txt

# Find failed tool calls
grep "^❌" *.txt

# Find sessions using a specific model
grep "^📋 Model: sonnet" *.txt

# Find sessions that edited files
grep "^📋 Files:.*edited" *.txt

# Find long sessions
grep "^📋 Duration:" *.txt | grep -E "[0-9]+h"

# Search for specific topics across all sessions
grep -l "authentication" **/*.txt

# Find what files were read in a session
grep "^✅ Read:" session.txt
```

## Summarize Stats

Aggregate statistics across all transcripts, grouped by month:

```bash
bun run summarize ~/transcripts

# pipe to glow for pretty rendering
bun run summarize ~/transcripts | glow
```

Output (markdown table format):

```markdown
| Month | Sessions | User (words) | AI (words) | Bash (✓/✗) | R/W/E | Tokens (in/out) | Time |
|---|---|---|---|---|---|---|---|
| 2025-09 | 22 | 297 (7.8K) | 328 (5.1K) | 0 (0/0) | 0/0/0 | 19.4M/402.3K | 171h 6m |
| 2025-10 | 14 | 61 (2.0K) | 111 (1.6K) | 0 (0/0) | 0/0/0 | 4.9M/73.3K | 7h 31m |
| 2025-11 | 688 | 2731 (59.1K) | 10733 (170.1K) | 3253 (3020/233) | 3763/706/2707 | 391.4M/8.4M | 198h 31m |
|---|---|---|---|---|---|---|---|
| **TOTAL** | 2829 | 13053 (214.3K) | 39682 (588.6K) | 16303 (14865/1438) | 14476/2499/10756 | 468.1M/28.4M | 1106h 26m |
```

Columns:
- **Sessions**: Number of transcript files
- **User/AI (words)**: Message count and total word count
- **Bash (✓/✗)**: Total bash commands, successes, failures
- **R/W/E**: Read/Write/Edit file operations
- **Tokens**: Input and output token totals
- **Time**: Sum of session durations

## Project Structure

Batch output organized by date with tool suffix:

```
transcripts/
├── 2025-01/
│   ├── 2025-01-10T08-30-00-claude.txt
│   ├── 2025-01-15T10-30-00-codex.txt
│   └── 2025-01-15T14-22-15-opencode.txt
└── 2025-02/
    └── ...
```

## MCP Server (Long-term Memory)

An MCP server exposes transcripts as searchable context for Claude. This allows Claude to proactively search past conversations during exploration.

### Setup

Add to `~/.claude.json` (create if needed):

```json
{
  "mcpServers": {
    "transcripts": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/path/to/ai-transcripts",
      "env": {
        "TRANSCRIPTS_DIR": "/path/to/your/transcripts"
      }
    }
  }
}
```

Set `TRANSCRIPTS_DIR` to your transcripts directory (defaults to `~/transcripts`).

Restart Claude Code to load the server.

### Tool: search_transcripts

```typescript
search_transcripts({
  keywords: ["authentication", "JWT"],  // Required: terms to search (OR matched)
  days: 90,                              // Optional: how far back (default: 90)
  limit: 20,                             // Optional: max results (default: 20)
  context_lines: 2,                      // Optional: lines around match (default: 2)
  message_type: "all"                    // Optional: "user", "assistant", or "all"
})
```

Returns matches with date, file path, and surrounding context:

```
2025-01-15 /path/to/2025-01-15T10-30-00-claude.txt
  👤 How should we handle JWT refresh tokens?
  🤖 For refresh tokens, the standard approach is...
```

## What's Excluded

- **Thinking blocks**: Claude's internal reasoning (verbose, not useful for archive)
- **Tool result contents**: Only shows success/fail, not full output
- **System meta messages**: Internal Claude Code messages
- **Empty sessions**: Skipped automatically

## License

MIT
