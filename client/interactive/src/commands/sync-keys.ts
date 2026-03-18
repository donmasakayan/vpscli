import { existsSync, readdirSync, readFileSync } from "node:fs";
import chalk from "chalk";
import { sshExec } from "../lib/ssh";
import type { Machine } from "../types";

const GITHUB_REPO = "donmasakayan/vpscli";
const LOCAL_KEYS_DIR = "/home/ubuntu/vpscli/keys";

async function loadKeys(): Promise<Array<{ name: string; key: string }>> {
  const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/keys`);
  if (resp.ok) {
    const files: { name: string }[] = await resp.json();
    const pubFiles = files.filter((f) => f.name.endsWith(".pub") && f.name !== ".gitkeep");
    const keys: Array<{ name: string; key: string }> = [];
    for (const file of pubFiles) {
      const keyResp = await fetch(
        `https://raw.githubusercontent.com/${GITHUB_REPO}/main/keys/${file.name}`,
      );
      if (!keyResp.ok) continue;
      const key = (await keyResp.text()).trim();
      if (!key) continue;
      keys.push({ name: file.name.replace(/\.pub$/, ""), key });
    }
    return keys;
  }

  if (!existsSync(LOCAL_KEYS_DIR)) {
    throw new Error("Unable to load keys from GitHub or local checkout.");
  }

  return readdirSync(LOCAL_KEYS_DIR)
    .filter((file) => file.endsWith(".pub") && file !== ".gitkeep")
    .map((file) => ({
      name: file.replace(/\.pub$/, ""),
      key: readFileSync(`${LOCAL_KEYS_DIR}/${file}`, "utf8").trim(),
    }))
    .filter((entry) => entry.key.length > 0);
}

export async function cmdSyncKeys(machine: Machine): Promise<void> {
  console.log(`Fetching keys from GitHub (${GITHUB_REPO})...`);
  const keys = await loadKeys();
  if (keys.length === 0) {
    console.log("No .pub files found in keys/.");
    return;
  }

  let added = 0;
  for (const { name, key } of keys) {
    const { stdout } = await sshExec(
      machine,
      `grep -qF '${key}' ~/.ssh/authorized_keys 2>/dev/null && echo 'exists' || { echo '${key}' >> ~/.ssh/authorized_keys && echo 'added'; }`,
    );

    if (stdout === "added") {
      console.log(chalk.green(`  ✓ Added key: ${name}`));
      added++;
    } else {
      console.log(chalk.dim(`  · Already present: ${name}`));
    }
  }

  if (added > 0) {
    console.log(chalk.green(`${added} new key(s) synced to ${machine.name}`));
  } else {
    console.log("All keys already synced.");
  }
}
