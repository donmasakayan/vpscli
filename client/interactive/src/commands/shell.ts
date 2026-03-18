import { sshInteractive } from "../lib/ssh";
import type { Machine } from "../types";

export async function cmdShell(machine: Machine, vpscliUser: string): Promise<void> {
  const cmd = `VPSCLI_USER='${vpscliUser}' exec $SHELL -l`;
  const exitCode = await sshInteractive(machine, cmd);
  process.exit(exitCode);
}
