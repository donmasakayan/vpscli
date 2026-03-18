# Agent CLI Contract

`vpscli` preserves the interactive TUI for humans, but agents and scripts should use the non-interactive command surface with `--json`.

## Compatibility Contract

- The non-interactive JSON surface is a compatibility boundary.
- Successful JSON payloads are command-specific and emitted on stdout.
- Failed `--json` invocations emit a shared JSON error object on stderr and exit with a deterministic code.
- Breaking JSON changes require versioning or explicit migration notes.

Shared error shape:

```json
{
  "ok": false,
  "error": {
    "code": "not_found",
    "message": "Repo not found: missing-repo",
    "exit_code": 4,
    "details": {}
  }
}
```

Exit codes:

- `0`: success
- `1`: unexpected internal failure
- `2`: invalid arguments or unsupported combination
- `3`: missing local `vpscli` configuration or identity
- `4`: requested resource not found
- `6`: remote SSH/VPS command failed
- `7`: remote data was malformed

## Discoverability

Use these commands instead of scraping `--help` text:

```bash
vpscli spec --json
vpscli spec command status --json
vpscli capabilities --json
```

## Command Notes

- `vpscli sessions --json`: array of active tmux sessions
- `vpscli repos --json`: array of discovered git repositories
- `vpscli repo <name|path> --json`: one repository object including sessions and commits
- `vpscli status --json`: overview object with sessions, repos, and active users

## Non-Interactive Usage Rules

- Pass `--machine <name>` if multiple VPS machines are configured.
- Do not rely on prompt text or TUI rendering.
- Prefer `spec` and `capabilities` for command discovery.
