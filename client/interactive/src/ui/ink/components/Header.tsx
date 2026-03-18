import { Box, Spacer, Text } from "ink";
import type { VersionInfo } from "../../../types";
import { useTheme } from "../context/ThemeContext";
import type { Layout } from "../hooks/useTerminalSize";
import { Logo } from "./Logo";

interface Props {
  machineName: string;
  vpscliUser: string;
  version: VersionInfo;
  cols: number;
  rows: number;
  layout: Layout;
  isOnVPS: boolean;
}

export function Header({ machineName, vpscliUser, version, cols, rows, layout, isOnVPS }: Props) {
  const theme = useTheme();

  if (layout === "narrow") {
    return (
      <Box width={cols} backgroundColor={theme.highlight} paddingX={1}>
        <Logo layout={layout} isOnVPS={isOnVPS} />
        <Spacer />
        <Box gap={1}>
          <Text color={theme.subtext0}>{vpscliUser}</Text>
        </Box>
      </Box>
    );
  }

  // Use compact logo when terminal is short (< 30 rows)
  const compactLogo = rows < 30;

  return (
    <Box flexDirection="column" paddingBottom={compactLogo ? 0 : 1}>
      <Box paddingX={1} paddingTop={compactLogo ? 0 : 1}>
        <Logo layout={layout} isOnVPS={isOnVPS} compact={compactLogo} />
      </Box>
      <Box paddingX={1} gap={1} paddingTop={1}>
        <Text color={theme.subtext0}>vpscli</Text>
        <Text color={theme.overlay0}>·</Text>
        <Text color={theme.subtext0}>{machineName}</Text>
        <Text color={theme.overlay0}>·</Text>
        <Text color={theme.subtext0}>{vpscliUser}</Text>
        <Text color={theme.overlay0}>·</Text>
        <Text color={theme.overlay1}>v{version.current}</Text>
        {version.latest && (
          <>
            <Text backgroundColor={theme.yellow} color={theme.base} bold>
              {" \u2191 "}
            </Text>
            <Text color={theme.yellow}> Update available</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
