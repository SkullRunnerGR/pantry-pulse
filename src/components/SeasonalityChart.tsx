import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

interface SeasonalityChartProps {
  multipliers: number[];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Displays the ML model's learned 7-day consumption seasonality profile
 * relative to the 1.0x average baseline.
 */
export function SeasonalityChart({ multipliers }: SeasonalityChartProps) {
  const { palette } = useTheme();
  const todayDow = new Date().getDay();
  const maxVal = Math.max(1.4, ...multipliers);

  return (
    <View style={styles.wrapper}>
      <View style={styles.barsRow}>
        {DAYS.map((label, idx) => {
          const val = multipliers[idx] ?? 1.0;
          const heightPct = Math.max(14, Math.round((val / maxVal) * 100));
          const isToday = idx === todayDow;
          const isPeak = val >= 1.15;

          return (
            <View key={label} style={styles.col}>
              <Text style={[styles.valText, { color: palette.textMuted }]}>{val.toFixed(1)}x</Text>
              <View style={[styles.barSlot, { backgroundColor: palette.surfaceMuted }]}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${heightPct}%`,
                      backgroundColor: isToday
                        ? palette.primary
                        : isPeak
                        ? palette.accent
                        : palette.textMuted,
                      opacity: isToday || isPeak ? 1 : 0.45,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.dayLabel,
                  {
                    color: isToday ? palette.primary : palette.textSecondary,
                    fontWeight: isToday ? '700' : '500',
                  },
                ]}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: 6,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  valText: {
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  barSlot: {
    width: '100%',
    maxWidth: 26,
    height: 68,
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    borderRadius: 6,
  },
  dayLabel: {
    fontSize: 11,
  },
});
