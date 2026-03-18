import chalk from "chalk";
import type { VersionInfo } from "../types";

export function showWelcome(version: VersionInfo): void {
  console.log();
  console.log(chalk.bold.cyan("  vpscli") + chalk.dim(` v${version.current}`));

  if (version.latest) {
    console.log(chalk.yellow(`  ⚠ v${version.latest} available — run: vpscli update`));
  } else {
    console.log(chalk.green("  ✓ up to date"));
  }

  console.log();
}
