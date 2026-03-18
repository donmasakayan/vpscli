import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config, Machine } from "../types";

const VPSCLI_DIR = join(homedir(), ".vpscli");
export const CONFIG_FILE = join(VPSCLI_DIR, "config");
export const MACHINES_FILE = join(VPSCLI_DIR, "machines.yaml");
export const SERVER_SESSION_FILE = join(VPSCLI_DIR, "session.sh");

export async function loadConfig(): Promise<Config> {
  let vpscliUser = "";
  let moshEnabled = false;
  try {
    const content = await readFile(CONFIG_FILE, "utf-8");
    const userMatch = content.match(/VPSCLI_USER="([^"]*)"/);
    if (userMatch) vpscliUser = userMatch[1];
    const moshMatch = content.match(/VPSCLI_MOSH="([^"]*)"/);
    if (moshMatch) moshEnabled = moshMatch[1] === "on";
  } catch {
    // No config file yet
  }
  return { vpscliUser, moshEnabled };
}

export async function saveConfigField(key: string, value: string): Promise<void> {
  await mkdir(VPSCLI_DIR, { recursive: true });
  let content = "";
  try {
    content = await readFile(CONFIG_FILE, "utf-8");
  } catch {
    // File doesn't exist yet
  }
  const pattern = new RegExp(`^${key}="[^"]*"$`, "m");
  const line = `${key}="${value}"`;
  if (pattern.test(content)) {
    content = content.replace(pattern, line);
  } else {
    content = content.trimEnd() + (content.length > 0 ? "\n" : "") + line + "\n";
  }
  await writeFile(CONFIG_FILE, content);
}

export async function loadMachines(): Promise<Machine[]> {
  let content: string;
  try {
    content = await readFile(MACHINES_FILE, "utf-8");
  } catch {
    return [];
  }

  const machines: Machine[] = [];
  let current: Partial<Machine> | null = null;

  for (const line of content.split("\n")) {
    const nameMatch = line.match(/^\s+-\s+name:\s+(.+)/);
    if (nameMatch) {
      if (current?.name) machines.push(current as Machine);
      current = { name: nameMatch[1].trim(), host: "", user: "", description: "" };
      continue;
    }
    if (!current) continue;

    const hostMatch = line.match(/^\s+host:\s+(.+)/);
    if (hostMatch) {
      current.host = hostMatch[1].trim();
      continue;
    }

    const userMatch = line.match(/^\s+user:\s+(.+)/);
    if (userMatch) {
      current.user = userMatch[1].trim();
      continue;
    }

    const descMatch = line.match(/^\s+description:\s+"?([^"]*)"?/);
    if (descMatch) {
      current.description = descMatch[1].trim();
    }
  }
  if (current?.name) machines.push(current as Machine);

  return machines;
}

export function vpscliDir(): string {
  return VPSCLI_DIR;
}

export function isOnVPS(): boolean {
  return existsSync(SERVER_SESSION_FILE);
}
