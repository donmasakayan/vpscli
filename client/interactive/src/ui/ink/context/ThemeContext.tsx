import React from "react";
import type { Theme } from "../theme";
import { getTheme } from "../theme";

const ThemeContext = React.createContext<Theme>(getTheme("remote"));

export const ThemeProvider = ThemeContext.Provider;

export function useTheme(): Theme {
  return React.useContext(ThemeContext);
}
