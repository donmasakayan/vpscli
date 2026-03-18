# vpscli

Shared VPS for pair programming via tmux.

## Getting Started

Paste this into your coding agent (Claude Code, Codex, Cursor, etc.):

```
Clone https://github.com/donmasakayan/vpscli.git then read
client/AGENTS.md and walk me through the setup step by step.
```

<details>
<summary>Manual setup (without an agent)</summary>

```bash
# Install vpscli (no repo clone needed):
curl -fsSL https://raw.githubusercontent.com/donmasakayan/vpscli/main/client/setup.sh | bash

# Then: generate SSH key, configure ~/.ssh/config, commit key to keys/<name>.pub
# See client/AGENTS.md for the full step-by-step guide.
```
</details>

## How Pair Programming Works

All developers SSH as a shared user. The tmux session manager lets multiple people attach to the same named session:

```bash
# Developer A:
vpscli feature-auth             # Creates a tmux session called "feature-auth"

# Developer B:
vpscli feature-auth             # Joins the SAME terminal — live pair programming
```

Detach without killing the session: `Ctrl+B, D`

## CLI Reference

| Command | Description |
|---|---|
| `vpscli` | Interactive menu (or quick shell if not a TTY) |
| `vpscli <name> [desc]` | Create or attach to named session |
| `vpscli list` | List all sessions |
| `vpscli end <name>` | End a session |
| `vpscli sessions/repos/repo/status --json` | Non-interactive machine-readable session and repo data |
| `vpscli spec --json` | Show the agent-facing CLI contract |
| `vpscli spec command <path> --json` | Show one command contract |
| `vpscli capabilities --json` | Show non-interactive capability metadata |
| `vpscli sync-keys` | Sync `keys/*.pub` from GitHub to VPS `authorized_keys` |
| `vpscli update` | Update vpscli binary + machines config from GitHub |
| `vpscli setup` | Set up developer identity (git + GitHub token) |
| `vpscli --machine <name>` | Select VPS (when multiple configured) |
| `vpscli --version` | Show version |
| `vpscli --help` | Full usage |

The interactive menu (run `vpscli` with no args) also includes session cleanup — interactively select and end old sessions, with a filter for your own vs all sessions.

Agent-focused usage, examples, and JSON/error contracts live in [docs/agent-cli.md](docs/agent-cli.md).

## Adding a Developer

1. New developer runs through the Getting Started prompt above
2. They commit their public key to `keys/<name>.pub` and push
3. Any existing developer syncs the key to the VPS: `vpscli sync-keys`

## Server Administration

See [server/README.md](server/README.md) for provisioning VPSes, adding machines, and server-side session management.
