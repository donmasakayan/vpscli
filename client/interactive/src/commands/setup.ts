import { mkdir, writeFile } from "node:fs/promises";
import * as p from "@clack/prompts";
import { CONFIG_FILE, vpscliDir } from "../lib/config";
import { selectMachine } from "../lib/machine";
import { sshExec } from "../lib/ssh";

export async function cmdSetup(machineOverride?: string): Promise<void> {
  p.intro("Developer identity setup");

  const selectedMachine = await selectMachine(machineOverride);

  const devName = await p.text({
    message: "Your name (e.g. don)",
    validate: (v) => (!v ? "Name is required" : undefined),
  });
  if (p.isCancel(devName)) {
    p.outro("Cancelled.");
    process.exit(0);
  }

  const defaultEmail = `${devName}@${selectedMachine.name}.local`;
  const devEmail = await p.text({
    message: "Your email",
    initialValue: defaultEmail,
  });
  if (p.isCancel(devEmail)) {
    p.outro("Cancelled.");
    process.exit(0);
  }

  const ghToken = await p.password({
    message: "GitHub personal access token (repo, read:org scopes)",
  });
  if (p.isCancel(ghToken)) {
    p.outro("Cancelled.");
    process.exit(0);
  }

  // Save locally
  await mkdir(vpscliDir(), { recursive: true });
  await writeFile(
    CONFIG_FILE,
    `# vpscli config — managed by vpscli setup\nVPSCLI_USER="${devName}"\n`,
  );
  p.log.success(`Local identity saved (VPSCLI_USER=${devName})`);

  // Create env on VPS
  const envContent = `# Developer identity for ${devName}
export GIT_AUTHOR_NAME="${devName}"
export GIT_AUTHOR_EMAIL="${devEmail}"
export GIT_COMMITTER_NAME="${devName}"
export GIT_COMMITTER_EMAIL="${devEmail}"
export GH_TOKEN="${ghToken}"`;

  const { exitCode } = await sshExec(
    selectedMachine,
    `mkdir -p ~/.vpscli/developers && cat > ~/.vpscli/developers/${devName}.env << 'DEVEOF'\n${envContent}\nDEVEOF\nchmod 600 ~/.vpscli/developers/${devName}.env`,
  );

  if (exitCode !== 0) {
    p.log.error("Failed to create VPS identity file");
    process.exit(1);
  }
  p.log.success(`VPS identity created at ~/.vpscli/developers/${devName}.env`);

  // Ensure git credential helper
  await sshExec(
    selectedMachine,
    `if [[ ! -f ~/.vpscli/git-credential-token ]]; then
cat > ~/.vpscli/git-credential-token << 'CREDHELPER'
#!/bin/bash
if [[ -n "\${GH_TOKEN:-}" ]]; then
  echo "protocol=https"
  echo "host=github.com"
  echo "username=x-access-token"
  echo "password=\${GH_TOKEN}"
fi
CREDHELPER
chmod +x ~/.vpscli/git-credential-token
git config --global credential.helper "!bash ~/.vpscli/git-credential-token"
fi`,
  );
  p.log.success("Git credential helper configured");

  // Verify
  const { stdout } = await sshExec(
    selectedMachine,
    `source ~/.vpscli/developers/${devName}.env && echo "Git: $GIT_AUTHOR_NAME <$GIT_AUTHOR_EMAIL>" && echo "GH: token set (\${#GH_TOKEN} chars)"`,
  );
  if (stdout) console.log(`  ${stdout}`);

  p.outro("Done! Sessions will now use your identity. Test with: vpscli my-session");
}
