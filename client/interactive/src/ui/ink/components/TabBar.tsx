import { Box, Text } from "ink";
import { useTheme } from "../context/ThemeContext";

interface Props {
  activeTab: "sessions" | "team" | "repos";
  sessionCount: number;
  teamCount: number;
  repoCount: number;
}

export function TabBar({ activeTab, sessionCount, teamCount, repoCount }: Props) {
  const theme = useTheme();

  const tab = (id: string, label: string, count: number) => {
    const active = activeTab === id;
    return (
      <Text
        bold={active}
        color={active ? theme.tabActive : theme.tabInactive}
      >
        {active ? "[ " : "  "}{label} ({count}){active ? " ]" : "  "}
      </Text>
    );
  };

  return (
    <Box gap={2}>
      {tab("sessions", "Sessions", sessionCount)}
      {teamCount > 0 && tab("team", "Team", teamCount)}
      {repoCount > 0 && tab("repos", "Repos", repoCount)}
    </Box>
  );
}
