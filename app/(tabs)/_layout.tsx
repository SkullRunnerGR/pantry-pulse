import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePantry } from '@/src/store/PantryContext';
import { useTheme } from '@/src/theme/useTheme';

export default function TabLayout() {
  const { palette } = useTheme();
  const { shoppingPlan } = usePantry();
  const insets = useSafeAreaInsets();
  const criticalCount = shoppingPlan?.criticalCount ?? 0;
  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: {
          backgroundColor: palette.tabBar,
          borderTopColor: palette.border,
          borderTopWidth: 1,
          height: 58 + bottomPad,
          paddingTop: 6,
          paddingBottom: bottomPad,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pulse',
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'pulse' : 'pulse-outline'}
              size={23}
              color={focused ? palette.primary : palette.textMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="pantry"
        options={{
          title: 'Pantry',
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'cube' : 'cube-outline'}
              size={22}
              color={focused ? palette.primary : palette.textMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'scan-circle' : 'scan-circle-outline'}
              size={26}
              color={focused ? palette.primary : palette.textMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="meals"
        options={{
          title: 'Meals',
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'restaurant' : 'restaurant-outline'}
              size={22}
              color={focused ? palette.primary : palette.textMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Shop',
          tabBarBadge: criticalCount > 0 ? criticalCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: palette.danger,
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: '700',
          },
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'cart' : 'cart-outline'}
              size={22}
              color={focused ? palette.primary : palette.textMuted}
            />
          ),
        }}
      />
    </Tabs>
  );
}
