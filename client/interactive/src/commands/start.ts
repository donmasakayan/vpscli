import { sshInteractive } from "../lib/ssh";
import { usageError } from "../lib/errors";
import type { Machine } from "../types";

export async function cmdStart(
  machine: Machine,
  name: string,
  vpscliUser: string,
  description?: string,
  repoPath?: string,
  opts?: { mosh?: boolean },
): Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw usageError("Session name must contain only letters, numbers, hyphens, and underscores.", {
      name,
    });
  }

  const desc = description || "(no description)";
  const dirArg = repoPath ? ` '${repoPath}'` : "";
  const cmd = `bash ~/.vpscli/session.sh start '${name}' 'shell' '${desc}' '${vpscliUser}'${dirArg}`;
  const exitCode = await sshInteractive(machine, cmd, opts);
  process.exit(exitCode);
}
