import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { hostname, homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { cmdDescribe } from "./commands/describe";
import { cmdEnd } from "./commands/end";
import { cmdRepoInfo } from "./commands/repo-info";
import { cmdReposList } from "./commands/repos-list";
import { cmdSessions } from "./commands/sessions";
import { cmdSessionsList } from "./commands/sessions-list";
import { cmdSetup } from "./commands/setup";
import { cmdShell } from "./commands/shell";
import { cmdStart } from "./commands/start";
import { cmdStatus } from "./commands/status";
import { cmdSyncKeys } from "./commands/sync-keys";
import { cmdUpdate, WRAPPER_SCRIPT } from "./commands/update";
import { isOnVPS, loadConfig, loadMachines } from "./lib/config";
import {
  EXIT_CODES,
  renderError,
  usageError,
  configError,
  notFoundError,
} from "./lib/errors";
import { selectMachine } from "./lib/machine";
import { isMoshInstalled } from "./lib/mosh";
import { buildCapabilitiesDocument, buildSpecDocument, findCommandSpec } from "./lib/spec";
import { fetchSessions } from "./lib/sessions";
import { checkVersion, VPSCLI_VERSION } from "./lib/version";
import type { Machine } from "./types";
import { mainMenu } from "./ui/menu";

const USAGE = `vpscli — Shared VPS CLI  v${VPSCLI_VERSION}

Usage:
  vpscli                           Interactive dashboard (TUI)
  vpscli <session-name> [desc]     Create or attach to named tmux session
  vpscli -                         Resume most recent session
  vpscli .                         Session from current git branch

Session Management:
  vpscli sessions [--json]         List all sessions
  vpscli start <name> [--desc ".."] [--repo <path>]
                                  Start or attach to a session
  vpscli end <name>                End (kill) a session
  vpscli describe <name> <desc>    Update session description

Repository Info:
  vpscli repos [--json]            List git repos on VPS
  vpscli repo <name|path> [--json] Show repo detail + sessions + commits

VPS Overview:
  vpscli status [--json]           Sessions, repos, who's online

Setup & Maintenance:
  vpscli setup                     Set up developer identity (git + GitHub)
  vpscli sync-keys                 Sync keys/*.pub from GitHub to VPS
  vpscli update                    Update vpscli binary + machine list
  vpscli spec --json               Show agent-facing CLI contract
  vpscli spec command <path> --json
                                  Show one command contract
  vpscli capabilities --json       Show non-interactive capabilities

Global Flags:
  --json                          Output JSON (for scripts and agents)
  --user <name>                   Override developer identity
  --machine <name>                Select VPS when multiple configured
  --old                           Use classic menu (fallback)
  --version, -v                   Show version
  --help, -h                      Show this help

Pair Programming:
  Two people running the same session name share the terminal.

Inside a Session:
  Ctrl+B, D                       Detach (session stays alive)`;

const COMMANDS_HELP: Record<string, string> = {
  sessions: `vpscli sessions [--json]

List all active sessions on the VPS.

Flags:
  --json    Output as JSON array (for scripts/agents)

Examples:
  vpscli sessions
  vpscli sessions --json
  vpscli sessions --json | jq '.[] | select(.owner == "don")'`,

  start: `vpscli start <name> [flags]

Create a new tmux session or attach to an existing one.

Flags:
  --desc <description>    Session description
  --repo <path>           Start session in this repo directory

Examples:
  vpscli start my-feature
  vpscli start api-work --desc "working on auth endpoints"
  vpscli start bugfix --repo /home/ubuntu/empath`,

  end: `vpscli end <name>

End (kill) a tmux session and mark it as ended in the registry.

Examples:
  vpscli end my-feature`,

  describe: `vpscli describe <name> <description>

Update the description of an active session.

Examples:
  vpscli describe my-feature "refactoring auth middleware"`,

  repos: `vpscli repos [--json]

List all git repositories found on the VPS.

Flags:
  --json    Output as JSON array with session counts and active users

Examples:
  vpscli repos
  vpscli repos --json`,

  repo: `vpscli repo <name|path> [--json]

Show detailed info about a repo: branch, sessions inside it, recent commits.

Arguments:
  <name|path>    Repo name (e.g. "vpscli") or full path

Flags:
  --json    Output as JSON object

Examples:
  vpscli repo vpscli
  vpscli repo /home/ubuntu/empath --json`,

  status: `vpscli status [--json]

Show VPS overview: who's online, session summary, repo summary.

Flags:
  --json    Output as JSON object with full session and repo data

Examples:
  vpscli status
  vpscli status --json`,

  setup: `vpscli setup

Interactive setup for developer identity. Configures:
  - Local VPSCLI_USER config
  - VPS developer env file (git name, email, GitHub token)
  - Git credential helper`,

  "sync-keys": `vpscli sync-keys

Fetch SSH public keys from the GitHub repo and add any new ones
to ~/.ssh/authorized_keys on the VPS.`,

  update: `vpscli update

Update the vpscli binary and machines.yaml from the latest GitHub release.`,

  spec: `vpscli spec --json
vpscli spec command <path> --json

Show the machine-readable contract for the non-interactive CLI.`,

  capabilities: `vpscli capabilities --json

Show the machine-readable list of non-interactive capabilities.`,
};

interface ParsedArgs {
  command: string;
  remaining: string[];
  flags: {
    json: boolean;
    machine?: string;
    user?: string;
    old: boolean;
    desc?: string;
    repo?: string;
    id?: string;
    window?: string;
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  let machine: string | undefined;
  let user: string | undefined;
  let desc: string | undefined;
  let repo: string | undefined;
  let id: string | undefined;
  let window: string | undefined;
  let json = false;
  let old = false;
  const remaining: string[] = [];

  let i = 0;
  while (i < argv.length) {
    switch (argv[i]) {
      case "--machine":
        machine = argv[++i];
        if (!machine) throw usageError("--machine requires a name");
        break;
      case "--user":
        user = argv[++i];
        if (!user) throw usageError("--user requires a name");
        break;
      case "--desc":
        desc = argv[++i];
        if (!desc) throw usageError("--desc requires a value");
        break;
      case "--repo":
        repo = argv[++i];
        if (!repo) throw usageError("--repo requires a path");
        break;
      case "--id":
        id = argv[++i];
        if (!id) throw usageError("--id requires a summary id");
        break;
      case "--window":
        window = argv[++i];
        if (!window) throw usageError("--window requires a value");
        break;
      case "--json":
        json = true;
        break;
      case "--old":
        old = true;
        break;
      case "--version":
      case "-v":
        console.log(`vpscli ${VPSCLI_VERSION}`);
        process.exit(0);
        break;
      case "--help":
      case "-h": {
        // If there's a command before --help, show command-specific help
        const cmd = remaining[0];
        if (cmd && COMMANDS_HELP[cmd]) {
          console.log(COMMANDS_HELP[cmd]);
        } else {
          console.log(USAGE);
        }
        process.exit(0);
        break;
      }
      default:
        remaining.push(argv[i]);
    }
    i++;
  }

  return {
    command: remaining[0] || "",
    remaining: remaining.slice(1),
    flags: { json, machine, user, old, desc, repo, id, window },
  };
}

/**
 * Auto-bootstrap the wrapper on first client run.
 * When the binary is running directly (no VPSCLI_EXEC_FILE), install:
 *   - vpscli-core at ~/.vpscli/bin/vpscli-core
 *   - wrapper script at ~/.local/bin/vpscli
 * Skips if vpscli-core already exists (already bootstrapped) or on VPS.
 */
async function ensureWrapperInstalled(): Promise<void> {
  // Already running via wrapper, or on the VPS — nothing to do
  if (process.env.VPSCLI_EXEC_FILE || isOnVPS()) return;

  const coreBinDir = join(homedir(), ".vpscli", "bin");
  const corePath = join(coreBinDir, "vpscli-core");

  // Already bootstrapped
  if (existsSync(corePath)) return;

  try {
    // Copy the running binary to ~/.vpscli/bin/vpscli-core
    await mkdir(coreBinDir, { recursive: true });
    const selfPath = process.execPath;
    await copyFile(selfPath, corePath);
    await chmod(corePath, 0o755);

    // Ad-hoc sign on macOS — Apple Silicon kills unsigned Mach-O binaries
    if (process.platform === "darwin") {
      const { execSync } = await import("node:child_process");
      try {
        execSync(`codesign -s - "${corePath}"`, { stdio: "ignore" });
      } catch {}
    }

    // Write wrapper script atomically to ~/.local/bin/vpscli
    const wrapperDir = join(homedir(), ".local", "bin");
    const wrapperPath = join(wrapperDir, "vpscli");
    const tmpPath = `${wrapperPath}.tmp.${process.pid}`;
    await mkdir(wrapperDir, { recursive: true });
    await writeFile(tmpPath, WRAPPER_SCRIPT);
    await chmod(tmpPath, 0o755);
    await rename(tmpPath, wrapperPath);
  } catch {
    // Non-fatal — the stdin.destroy() fallback handles this run
  }
}

function printJson(doc: Record<string, unknown>): void {
  console.log(JSON.stringify(doc, null, 2));
}

async function main(): Promise<void> {
  const { command, remaining, flags } = parseArgs(process.argv.slice(2));

  // Auto-bootstrap wrapper for future runs (non-blocking for this run)
  await ensureWrapperInstalled();

  // Commands that don't need full config
  if (command === "spec") {
    if (remaining[0] === "command") {
      const path = remaining.slice(1).join(" ");
      if (!path) throw usageError("Usage: vpscli spec command <path> --json");
      const spec = findCommandSpec(path);
      if (!spec) throw notFoundError(`Unknown command path: ${path}`, { path });
      printJson({
        contract_version: buildSpecDocument().contract_version,
        command: spec,
      });
      process.exit(0);
    }
    printJson(buildSpecDocument());
    process.exit(0);
  }
  if (command === "capabilities") {
    printJson(buildCapabilitiesDocument());
    process.exit(0);
  }
  if (command === "update") {
    await cmdUpdate();
    process.exit(0);
  }
  if (command === "setup") {
    await cmdSetup(flags.machine);
    process.exit(0);
  }
  if (command === "help") {
    const topic = remaining[0];
    if (topic && COMMANDS_HELP[topic]) {
      console.log(COMMANDS_HELP[topic]);
    } else {
      console.log(USAGE);
    }
    process.exit(0);
  }

  // Load config
  const config = await loadConfig();
  let vpscliUser =
    flags.user || config.vpscliUser || (isOnVPS() ? process.env.GIT_AUTHOR_NAME : undefined) || "";

  // Check machines exist
  const machines = await loadMachines();
  if (machines.length === 0 && !isOnVPS()) {
    throw configError("vpscli not configured. Run: vpscli update (or bash client/setup.sh from repo)");
  }

  // Version check (non-blocking, skip for JSON/non-interactive)
  const versionPromise = flags.json ? Promise.resolve({ current: VPSCLI_VERSION, latest: null }) : checkVersion();

  // Select machine (skip on VPS)
  const getMachine = async (): Promise<Machine> => {
    if (isOnVPS()) {
      return {
        name: hostname(),
        host: "localhost",
        user: process.env.USER || "ubuntu",
        description: "local",
      };
    }
    return selectMachine(flags.machine, { interactive: process.stdin.isTTY && !flags.json });
  };

  const moshOpts = config.moshEnabled && !isOnVPS() && isMoshInstalled() ? { mosh: true } : undefined;

  // --- Command dispatch ---

  // No command: interactive dashboard
  if (command === "") {
    const isTTY = process.stdin.isTTY;
    if (isTTY) {
      if (!vpscliUser) {
        p.log.warn("Developer identity not set. Let's fix that.");
        await cmdSetup(flags.machine);
        const reloaded = await loadConfig();
        if (!reloaded.vpscliUser) throw configError("Setup incomplete.");
        vpscliUser = reloaded.vpscliUser;
      }
      const version = await versionPromise;
      const machine = await getMachine();
      if (flags.old) {
        await mainMenu(machine, vpscliUser, version, flags.machine);
      } else {
        const { renderInkDashboard } = await import("./ui/ink/render");
        await renderInkDashboard(machine, vpscliUser, version, config.moshEnabled);
      }
    } else {
      if (!vpscliUser) throw configError("Developer identity not set. Run: vpscli setup");
      const machine = await getMachine();
      await cmdShell(machine, vpscliUser);
    }
    return;
  }

  // vpscli - : resume most recent
  if (command === "-") {
    if (!vpscliUser) throw configError("Developer identity not set. Run: vpscli setup");
    const machine = await getMachine();
    const sessions = await fetchSessions(machine);
    const mine = sessions
      .filter((s) => s.owner === vpscliUser)
      .sort((a, b) => parseInt(b.last_activity, 10) - parseInt(a.last_activity, 10));
    if (mine.length === 0) throw usageError("No active sessions.");
    await cmdStart(machine, mine[0].name, vpscliUser, undefined, undefined, moshOpts);
    process.exit(0);
  }

  // vpscli . : session from current git branch
  if (command === ".") {
    if (!vpscliUser) throw configError("Developer identity not set. Run: vpscli setup");
    const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], { stdout: "pipe", stderr: "pipe" });
    const branch = (await new Response(proc.stdout).text()).trim();
    const exitCode = await proc.exited;
    if (exitCode !== 0 || !branch || branch === "HEAD") {
      throw usageError("Not on a git branch (detached HEAD or not a repo).");
    }
    const sessionName = branch.replace(/\//g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
    const machine = await getMachine();
    await cmdStart(machine, sessionName, vpscliUser, `branch: ${branch}`, undefined, moshOpts);
    process.exit(0);
  }

  // vpscli sessions [--json]
  if (command === "sessions") {
    const machine = await getMachine();
    if (flags.json || !process.stdin.isTTY) {
      await cmdSessionsList(machine, { json: flags.json });
    } else {
      await cmdSessions(machine, vpscliUser || "unknown");
    }
    process.exit(0);
  }

  // vpscli list (legacy alias for sessions)
  if (command === "list") {
    const machine = await getMachine();
    if (flags.json || !process.stdin.isTTY) {
      await cmdSessionsList(machine, { json: flags.json });
    } else {
      await cmdSessions(machine, vpscliUser || "unknown");
    }
    process.exit(0);
  }

  // vpscli start <name> [--desc ".."] [--repo <path>]
  if (command === "start") {
    const name = remaining[0];
    if (!name) throw usageError("Usage: vpscli start <name> [--desc \"...\"] [--repo <path>]");
    if (!vpscliUser) throw configError("Developer identity not set. Run: vpscli setup");
    const machine = await getMachine();
    await cmdStart(machine, name, vpscliUser, flags.desc, flags.repo, moshOpts);
    process.exit(0);
  }

  // vpscli end <name>
  if (command === "end") {
    const name = remaining[0];
    if (!name) throw usageError("Usage: vpscli end <name>");
    const machine = await getMachine();
    await cmdEnd(machine, name);
    return;
  }

  // vpscli describe <name> <desc>
  if (command === "describe") {
    const name = remaining[0];
    const desc = remaining.slice(1).join(" ") || flags.desc;
    if (!name || !desc) throw usageError("Usage: vpscli describe <name> <description>");
    const machine = await getMachine();
    await cmdDescribe(machine, name, desc);
    return;
  }

  // vpscli repos [--json]
  if (command === "repos") {
    const machine = await getMachine();
    await cmdReposList(machine, { json: flags.json });
    process.exit(0);
  }

  // vpscli repo <name|path> [--json]
  if (command === "repo") {
    const nameOrPath = remaining[0];
    if (!nameOrPath) throw usageError("Usage: vpscli repo <name|path> [--json]");
    const machine = await getMachine();
    await cmdRepoInfo(machine, nameOrPath, { json: flags.json });
    process.exit(0);
  }

  // vpscli status [--json]
  if (command === "status") {
    const machine = await getMachine();
    await cmdStatus(machine, { json: flags.json });
    process.exit(0);
  }

  // vpscli sync-keys
  if (command === "sync-keys") {
    const machine = await getMachine();
    await cmdSyncKeys(machine);
    process.exit(0);
  }

  // Default: treat as session name (vpscli my-feature [description...])
  if (!vpscliUser) throw configError("Developer identity not set. Run: vpscli setup");
  const machine = await getMachine();
  const description = remaining.join(" ") || undefined;
  await cmdStart(machine, command, vpscliUser, description, undefined, moshOpts);
}

main().catch((err) => {
  const jsonRequested = process.argv.includes("--json");
  const rendered = renderError(err, jsonRequested);
  process.exit(rendered.exitCode ?? EXIT_CODES.internal);
});
