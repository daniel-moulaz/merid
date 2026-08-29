import { useColorScheme } from "react-native";

import { themes, type ThemeColors } from "./tokens";

/** Cores do tema atual do sistema. Claro e escuro sem configuração extra. */
export function useThemeColors(): ThemeColors {
  return useColorScheme() === "dark" ? themes.dark : themes.light;
}
