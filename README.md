# ai-transcripts

Extract AI coding assistant session logs to readable, searchable transcripts.

Supports:
- **Claude Code** (`~/.claude/projects/`)
- **OpenAI Codex** (`~/.codex/sessions/`)

## Installation

```bash
# Clone and build
git clone https://github.com/ianzepp/ai-transcripts.git
cd ai-transcripts
bun install
bun run build

# Binaries at dist/
#   claude-transcript           - extract Claude Code transcripts
#   codex-transcript            - extract OpenAI Codex transcripts
#   claude-transcript-summarize - aggregate stats
```

## Usage

### Claude Code

**Stream mode** (stdin/stdout):
```bash
cat ~/.claude/projects/-Users-me-github/abc123.jsonl | claude-transcript > session.txt
```

**Batch mode** (process all sessions):
```bash
claude-transcript --batch ~/.claude/projects --output ~/transcripts
```

Batch mode:
- Recursively finds all `.jsonl` session files
- Skips empty files and `.bak` files
- Organizes output by date: `2025-01/2025-01-15T10-30-00-claude.txt`

### OpenAI Codex

**Stream mode** (stdin/stdout):
```bash
cat ~/.codex/sessions/2025/11/11/rollout-*.jsonl | codex-transcript > session.txt
```

**Batch mode** (process all sessions):
```bash
codex-transcript --batch ~/.codex/sessions --output ~/transcripts
```

Batch mode:
- Recursively finds all `rollout-*.jsonl` session files
- Organizes output by date: `2025-11/2025-11-11T14-12-49-codex.txt`

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

Aggregate statistics across all transcripts, grouped by project:

```bash
claude-transcript-summarize ~/transcripts
```

Output:

```
Project                          | Sessions |   User (words) |     AI (words) | Bash (✓/✗)     | R/W/E        | Tokens (in/out)   | Time
--------------------------------------------------------------------------------------------------------------------------------------------
github/ianzepp/faber             |      478 |   2679 (38.1K) |   7078 (95.6K) | 5910 (5328/582) | 4499/441/3081 |         4.1M/4.4M | 194h 14m
github/monk/api                  |      623 |   2335 (35.6K) |   6316 (84.4K) | 3490 (3198/292) | 4336/919/3292 |         4.7M/5.1M | 159h 41m
Workspaces/monk/api              |      491 |   1738 (33.6K) |   5954 (83.0K) | 3356 (3106/250) | 3852/794/2960 |         2.7M/6.1M | 110h 48m
...
--------------------------------------------------------------------------------------------------------------------------------------------
TOTAL                            |     2167 |  8648 (136.1K) | 23491 (321.3K) | 15923 (14502/1421) | 14395/2524/10669 |       13.5M/18.7M | 610h 12m
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
│   ├── 2025-01-15T10-30-00-claude.txt
│   └── 2025-01-15T14-22-15-codex.txt
└── 2025-02/
    └── ...
```

## What's Excluded

- **Thinking blocks**: Claude's internal reasoning (verbose, not useful for archive)
- **Tool result contents**: Only shows success/fail, not full output
- **System meta messages**: Internal Claude Code messages
- **Empty sessions**: Skipped automatically

## License

MIT
