import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import 'react-native-reanimated';

import { PantryProvider } from '@/src/store/PantryContext';
import { DarkPalette, LightPalette } from '@/src/theme/tokens';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const palette = isDark ? DarkPalette : LightPalette;

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const navTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: palette.background,
          card: palette.surface,
          text: palette.text,
          border: palette.border,
          primary: palette.primary,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: palette.background,
          card: palette.surface,
          text: palette.text,
          border: palette.border,
          primary: palette.primary,
        },
      };

  return (
    <PantryProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="product/[id]"
            options={{
              presentation: 'modal',
              title: 'Forecast & Batches',
              headerStyle: { backgroundColor: palette.surface },
              headerTintColor: palette.text,
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              presentation: 'modal',
              title: 'Household & Goals',
              headerStyle: { backgroundColor: palette.surface },
              headerTintColor: palette.text,
            }}
          />
        </Stack>
      </ThemeProvider>
    </PantryProvider>
  );
}
