# Debug: stdin issue after TUI session selection

## Status

The Bun stdin contention theory has been **ruled out**. The wrapper handoff is confirmed working — Bun exits completely (code 10) before SSH starts. Yet the user reports the issue persists on macOS (darwin-arm64, v1.1.34).

## What we know

### Confirmed working
- `~/.local/bin/vpscli` is the bash wrapper script (verified with `file`)
- `~/.vpscli/bin/vpscli-core` is v1.1.34 (verified with `--version`)
- Wrapper has `stty sane` before exec
- Exit-code-10 path fires correctly (no leftover `/tmp/vpscli-exec-*` files)
- Bun process is fully dead before SSH starts

### The handoff flow (working correctly)
```
1. User runs `vpscli`
2. Wrapper sets VPSCLI_EXEC_FILE=/tmp/vpscli-exec-$, runs vpscli-core
3. vpscli-core renders Ink TUI, user picks a session
4. sshInteractive() writes SSH command to $VPSCLI_EXEC_FILE
5. process.exit(10)
6. Wrapper detects exit code 10, reads exec file
7. Wrapper runs: stty sane 2>/dev/null && exec bash -c "$cmd"
8. bash execs: ssh -t '-o' 'StrictHostKeyChecking=accept-new' dev@13.250.2.78 'bash ~/.vpscli/session.sh start ...'
```

### Minor bug (not the cause)
The wrapper has `VPSCLI_EXEC_FILE="/tmp/vpscli-exec-$"` (single `$`) instead of `$$` (PID). This was likely installed by an older binary. The `ensureWrapperInstalled()` auto-bootstrap in index.ts uses the same WRAPPER_SCRIPT from update.ts which has `$$`. This only affects PID uniqueness for concurrent runs — doesn't break the handoff.

## What to investigate

Since Bun is dead before SSH starts, the issue is NOT Bun stdin contention. Possible causes:

### 1. Terminal state not fully reset
Ink leaves the terminal in raw mode. `stty sane` should fix it, but maybe it's not enough.

**Diagnostic:**
```bash
# Add debug output to the wrapper temporarily
# Edit ~/.local/bin/vpscli and add before the exec line:
#   stty -a > /tmp/vpscli-stty-before.log 2>&1
#   stty sane 2>/dev/null
#   stty -a > /tmp/vpscli-stty-after.log 2>&1

# Then run vpscli, pick a session, and after connecting check:
cat /tmp/vpscli-stty-before.log
cat /tmp/vpscli-stty-after.log
```

### 2. SSH allocated PTY settings
The remote tmux session might have stale TTY settings from a previous connection.

**Diagnostic:**
```bash
# From inside the SSH session on the VPS:
stty -a
# Compare with a direct SSH session (no vpscli):
ssh dev@13.250.2.78
stty -a
```

### 3. tmux configuration
`~/.vpscli/tmux.conf` might have settings that interact poorly with the terminal state.

**Diagnostic:**
```bash
# Connect without tmux to isolate:
ssh -t dev@13.250.2.78 bash -l
# Does the issue happen here? If not, it's tmux-related.
```

### 4. The SSH command itself
The wrapper execs `bash -c "exec ssh -t ..."`. The extra bash+exec layer might interact with terminal allocation.

**Diagnostic:**
```bash
# Check what command was written to the exec file
# Temporarily comment out the `rm -f` line in the wrapper
# Then after connecting, check from another terminal:
cat /tmp/vpscli-exec-*

# Try running the SSH command directly:
ssh -t -o StrictHostKeyChecking=accept-new dev@13.250.2.78 'bash ~/.vpscli/session.sh start test-debug shell test don'
# Does the issue happen with direct SSH?
```

### 5. Describe the exact symptom
The original issue was "Bun stdin contention" — input being dropped or duplicated because both Bun and SSH were reading from the same terminal. But now Bun is dead before SSH starts.

**Need to clarify:** What exactly is happening?
- Dropped keystrokes?
- Duplicated input?
- Pasting doesn't work?
- Characters echoed incorrectly?
- Certain key combos not working?
- Only happens initially, then resolves?

### 6. Compare with --old flag
The classic menu (`vpscli --old`) uses `@clack/prompts` with blocking prompts — no Ink, no React, no raw mode.

**Diagnostic:**
```bash
vpscli --old
# Pick a session. Does the issue occur?
# If --old works fine, the issue is Ink-related terminal state
# that stty sane doesn't fully clean up.
```

### 7. Compare with direct session name
```bash
vpscli my-session
# This skips the TUI entirely. Does the issue occur?
# If this works fine, confirms the issue is TUI-related.
```

## Key files

| File | Path | Purpose |
|------|------|---------|
| Wrapper script | `~/.local/bin/vpscli` | Bash wrapper, handoff via exec file |
| Binary | `~/.vpscli/bin/vpscli-core` | Compiled Bun binary |
| Ink render | `client/interactive/src/ui/ink/render.ts` | Mounts/unmounts Ink, calls handleAction |
| SSH handoff | `client/interactive/src/lib/ssh.ts` | Writes exec file + process.exit(10) |
| Start command | `client/interactive/src/commands/start.ts` | Builds session.sh command, calls sshInteractive |
| Update/wrapper | `client/interactive/src/commands/update.ts` | WRAPPER_SCRIPT constant, cmdUpdate() |
| Auto-bootstrap | `client/interactive/src/index.ts` | ensureWrapperInstalled() in main() |
| Setup installer | `client/setup.sh` | Fresh install: downloads binary + writes wrapper |

## Source repo

```
git clone https://github.com/donmasakayan/vpscli.git
cd vpscli
```

All client source is under `client/interactive/src/`. Build with `cd client/interactive && bun run build`.
