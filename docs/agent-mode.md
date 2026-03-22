# Agent Mode — Design Proposal

**Status:** Roadmap (Phase 4)
**Depends on:** F1–F6 complete

---

## Overview

Agent mode transforms MeshMind from a chat interface into a terminal and filesystem-integrated AI workspace. Instead of only answering questions, the AI can read files, write code, run shell commands, and manage directory structures — all on the user's own machine, with explicit user approval before anything consequential runs.

The design is modeled on tools like Claude Code and GitHub Copilot Workspace, but with MeshMind's core constraint intact: **all inference is local, nothing leaves the machine without the user's knowledge.**

---

## Core Principles

1. **Local-only by default.** Agent actions run on the user's machine against their local Ollama model. No action is sent to a peer or the cloud without explicit user opt-in.
2. **Plan before execute.** The AI always produces a structured plan listing every action it intends to take. The user reviews and approves before anything is run.
3. **Destructive operations require explicit confirmation.** Deleting files, overwriting content, and running shell commands with side effects require a separate confirmation step beyond the initial plan approval.
4. **Workspace scoping.** The agent operates within a user-defined workspace directory. It cannot read, write, or execute anything outside that scope without the user explicitly expanding it.
5. **Transparent audit trail.** Every action the agent takes is logged with a timestamp, the command run, and the outcome. The log is stored locally and visible in the UI.

---

## Workspace Model

The user designates a **workspace root** at session start. This is the directory the agent treats as its working environment.

```
Workspace root: /home/user/projects/my-app/
├── src/
├── tests/
├── docs/
└── .meshmind/
    ├── agent.log       # action audit trail
    └── workspace.json  # session config (model, allowed paths, flags)
```

The agent is granted read/write access to the workspace root and its children only. Three safety layers enforce this:

### Layer 1 — Allowlist
All file paths in any agent action are resolved to absolute paths and checked against the workspace root prefix. Any path that does not start with the workspace root is rejected before the action runs.

### Layer 2 — Traversal Guard
Path traversal sequences (`../`, symlinks that escape the workspace, absolute paths injected via model output) are normalized and re-checked after resolution. If the resolved path escapes the workspace, the action is blocked and the user is notified.

### Layer 3 — Destructive Operation Gate
Actions classified as destructive require a second explicit confirmation, separate from the plan approval:
- Deleting files or directories
- Overwriting files (when content exists)
- Running shell commands (any command with external side effects)
- Installing packages
- Modifying `.git` history

The gate presents a diff or preview of the change before asking for confirmation.

---

## Agent Action Types

| Action | Description | Requires Gate |
|---|---|---|
| `read_file` | Read file contents into context | No |
| `list_dir` | List directory contents | No |
| `write_file` | Write or create a file | Yes (if overwriting) |
| `delete_file` | Delete a file or directory | Yes |
| `run_shell` | Execute a shell command | Yes |
| `run_tests` | Run the project's test suite | Yes |
| `install_deps` | Install packages (pip, npm, etc.) | Yes |
| `create_dir` | Create a new directory | No |
| `remove_dir` | Remove a directory | Yes |
| `search_code` | Grep/search within workspace | No |
| `git_status` | Read git state | No |
| `git_commit` | Commit staged changes | Yes |

---

## Plan-Then-Execute Flow

```
User: "Refactor the auth module to use JWT refresh tokens"

Agent:
  1. Reads current auth module files (read_file x3)
  2. Identifies affected files
  3. Produces structured plan:

  PLAN
  ────
  [ ] read_file: src/auth/AuthService.java
  [ ] read_file: src/auth/JwtUtil.java
  [ ] write_file: src/auth/AuthService.java  (add refreshToken logic)
  [ ] write_file: src/auth/JwtUtil.java      (add generateRefreshToken method)
  [ ] write_file: src/auth/AuthController.java (add /auth/refresh endpoint)
  [ ] run_tests: mvn test -pl auth-module

  Approve plan? [Yes / Edit / Cancel]

User: Yes

Agent executes step by step, showing output after each action.
Destructive steps (write_file on existing files) show a diff before writing.
```

---

## UI Design

### Agent Mode Toggle
A toggle in the chat header switches between **Chat** and **Agent** mode. Agent mode shows:
- The current workspace root (clickable to change)
- An action log panel (collapsible)
- A pending-plan approval card when the AI has produced a plan

### Plan Card
When the agent produces a plan, it renders as a card above the input area:
- Each action listed with type icon and target path
- Destructive actions highlighted in amber
- Approve / Edit / Cancel buttons
- After approval, each step gets a live status indicator (pending / running / done / error)

### Action Log Panel
Persistent panel showing all actions taken in the session:
- Timestamp
- Action type and target
- Outcome (success / error / skipped)
- Expandable to show stdout/stderr for shell commands

---

## Security Considerations

### Model Output Trust
The agent model can produce malicious or malformed paths in its output. All paths extracted from model responses are treated as untrusted input and validated through both the allowlist and traversal guard before use.

### Shell Command Injection
Shell commands proposed by the model are shown verbatim to the user before execution. They are never interpolated with user-controlled strings at runtime. Commands run in a subprocess with the workspace root as the working directory.

### Scope Creep Prevention
The agent cannot expand its own workspace. If it determines it needs access to a path outside the workspace, it must request permission from the user via a specific `request_scope_expansion` action type, which the user can approve or deny.

### Peer Agent Routing (Future)
When peer routing is active, agent plans can optionally be sent to a peer for execution on their machine. This requires:
- Explicit user opt-in per session
- The peer's user to approve each incoming plan before execution on their end
- All plan content encrypted client-side (same relay contract as F5)

---

## Implementation Stack

| Component | Technology |
|---|---|
| Agent loop | Python (integrates with existing OpenClaw FastAPI backend) |
| Filesystem operations | Python `pathlib`, `subprocess` (sandboxed) |
| Action log storage | Local SQLite (existing OpenClaw DB) |
| UI plan card | React component in the MeshMind frontend |
| WebSocket plan relay | Spring Boot relay (for peer agent mode, future) |

The agent backend is a new module (`app/agent/`) within the OpenClaw Python service. It exposes a streaming SSE endpoint `/api/agent/run` that accepts a user message and workspace config, streams action proposals, waits for approval events, then executes approved actions and streams results.

---

## Open Questions

- **Kernel integration:** Should agent mode support Jupyter-style kernel execution for data science workflows (Python/R cells)? This is a strong use case but adds significant complexity.
- **Model capability floor:** Agent mode requires a model capable of producing structured JSON plans reliably. What is the minimum model size that works acceptably? (Preliminary answer: 7B+ with instruction tuning.)
- **Undo:** Can we implement undo for write/delete actions via git snapshots before each destructive step?
- **Multi-step autonomy level:** Should users be able to set an autonomy level (approve every step vs. approve plan only vs. fully autonomous within workspace)?

---

## Milestones

| Milestone | Deliverable |
|---|---|
| Agent Alpha | `read_file`, `list_dir`, `search_code` — read-only agent; plan card UI |
| Agent Beta | `write_file`, `create_dir` with diff preview; action log panel |
| Agent v1 | Full action set; destructive op gate; workspace scoping enforced |
| Agent v1.1 | Peer agent routing via encrypted WebSocket relay |
| Agent v2 | Kernel integration (Jupyter); undo via git snapshots |
