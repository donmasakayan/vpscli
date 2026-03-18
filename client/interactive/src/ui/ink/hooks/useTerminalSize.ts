import { useStdout } from "ink";

export type Layout = "wide" | "normal" | "narrow";

export function useTerminalSize() {
  const { stdout } = useStdout();
  const cols = stdout.columns || 80;
  const rows = stdout.rows || 24;
  const layout: Layout = cols > 100 ? "wide" : cols < 60 ? "narrow" : "normal";
  return { cols, rows, layout };
}
