import { useColorScheme } from 'react-native';
import { DarkPalette, LightPalette, ThemePalette } from './tokens';

export function useTheme(): { palette: ThemePalette; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return {
    palette: isDark ? DarkPalette : LightPalette,
    isDark,
  };
}
