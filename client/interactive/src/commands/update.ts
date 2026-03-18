import { chmod, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { MACHINES_FILE, vpscliDir } from "../lib/config";

const GITHUB_REPO = "donmasakayan/vpscli";

function defaultMachinesYaml(): string {
  const host = Bun.spawnSync(["bash", "-lc", "hostname -I 2>/dev/null | awk '{print $1}'"]).stdout.toString().trim() || "127.0.0.1";
  const name = Bun.spawnSync(["hostname"]).stdout.toString().trim() || "vps";
  const user = process.env.USER || "ubuntu";
  return `machines:
  - name: ${name}
    host: ${host}
    user: ${user}
    description: "Primary VPS"
`;
}

export const WRAPPER_SCRIPT = `#!/usr/bin/env bash
VPSCLI_CORE="\${HOME}/.vpscli/bin/vpscli-core"
[ -x "$VPSCLI_CORE" ] || { echo "vpscli-core not found. Run: vpscli update" >&2; exit 1; }
export VPSCLI_EXEC_FILE="/tmp/vpscli-exec-$$"
"$VPSCLI_CORE" "$@"
exit_code=$?
if [ "$exit_code" -eq 10 ] && [ -f "$VPSCLI_EXEC_FILE" ]; then
  cmd=$(cat "$VPSCLI_EXEC_FILE")
  rm -f "$VPSCLI_EXEC_FILE"
  stty sane 2>/dev/null
  exec bash -c "$cmd"
fi
rm -f "$VPSCLI_EXEC_FILE"
exit $exit_code
`;

export async function cmdUpdate(): Promise<void> {
  p.intro("Updating vpscli");

  const s = p.spinner();

  // Update machines.yaml
  s.start("Fetching machines.yaml");
  try {
    const resp = await fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/machines.yaml`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const content = await resp.text();
    await mkdir(vpscliDir(), { recursive: true });
    await writeFile(MACHINES_FILE, content);
    s.stop("machines.yaml updated");
  } catch {
    await mkdir(vpscliDir(), { recursive: true });
    await writeFile(MACHINES_FILE, defaultMachinesYaml());
    s.stop("machines.yaml generated locally");
  }

  // Fetch latest version from GitHub releases
  let newVersion = "unknown";
  try {
    const vResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      signal: AbortSignal.timeout(3000),
      headers: { Accept: "application/vnd.github+json" },
    });
    if (vResp.ok) {
      const data = (await vResp.json()) as { tag_name?: string };
      if (data.tag_name) newVersion = data.tag_name.replace(/^v/, "");
    }
  } catch {
    // continue with "unknown"
  }

  // Update binary → ~/.vpscli/bin/vpscli-core
  s.start("Fetching latest vpscli binary");
  const coreBinDir = join(homedir(), ".vpscli", "bin");
  const corePath = join(coreBinDir, "vpscli-core");
  try {
    const os = process.platform === "darwin" ? "darwin" : "linux";
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const url = `https://github.com/${GITHUB_REPO}/releases/latest/download/vpscli-${os}-${arch}`;
    const resp = await fetch(url, { redirect: "follow" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const buffer = await resp.arrayBuffer();
    await mkdir(coreBinDir, { recursive: true });
    const tmpPath = `${corePath}.tmp`;
    // Write to temp file then atomically replace — overwriting a running
    // binary in-place corrupts it on macOS (Mach-O is memory-mapped)
    await writeFile(tmpPath, Buffer.from(buffer));
    await chmod(tmpPath, 0o755);
    try {
      await unlink(corePath);
    } catch {}
    await rename(tmpPath, corePath);
    // Ad-hoc sign on macOS — Apple Silicon kills unsigned Mach-O binaries
    if (process.platform === "darwin") {
      const { execSync } = await import("node:child_process");
      try {
        execSync(`codesign -s - "${corePath}"`, { stdio: "ignore" });
      } catch {}
    }
    s.stop("vpscli-core binary updated");
  } catch {
    s.stop("Failed to fetch binary (may not be released yet — using current version)");
  }

  // Generate wrapper script at ~/.local/bin/vpscli
  s.start("Installing wrapper script");
  const wrapperDir = join(homedir(), ".local", "bin");
  const wrapperPath = join(wrapperDir, "vpscli");
  try {
    await mkdir(wrapperDir, { recursive: true });
    await writeFile(wrapperPath, WRAPPER_SCRIPT);
    await chmod(wrapperPath, 0o755);
    s.stop("Wrapper script installed");
  } catch {
    s.stop("Failed to install wrapper script");
  }

  p.outro(`vpscli is now at v${newVersion}`);
}
