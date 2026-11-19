import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ConsumptionForecast } from '../domain/types';
import { useTheme } from '../theme/useTheme';

interface ForecastBarProps {
  forecast: ConsumptionForecast;
  maxHorizonDays?: number;
}

/**
 * Visualizes ML depletion forecast with P10-P90 uncertainty band and an
 * expiration marker when dual-clock spoilage risk is present.
 */
export function ForecastBar({ forecast, maxHorizonDays = 14 }: ForecastBarProps) {
  const { palette } = useTheme();
  const clampPct = (days: number) => Math.min(100, Math.max(0, (days / maxHorizonDays) * 100));

  const p10Pct = clampPct(forecast.p10DaysRemaining);
  const p50Pct = clampPct(forecast.daysRemaining);
  const p90Pct = clampPct(forecast.p90DaysRemaining);
  const expPct =
    forecast.daysUntilEarliestExpiry !== null
      ? clampPct(Math.max(0, forecast.daysUntilEarliestExpiry))
      : null;

  const barColor =
    forecast.urgencyStatus === 'out' || forecast.urgencyStatus === 'critical'
      ? palette.danger
      : forecast.urgencyStatus === 'expiring'
      ? palette.warning
      : forecast.urgencyStatus === 'low'
      ? palette.warning
      : palette.accent;

  return (
    <View style={styles.container}>
      <View style={[styles.track, { backgroundColor: palette.surfaceMuted }]}>
        {/* Expected P50 fill */}
        <View style={[styles.fill, { width: `${p50Pct}%`, backgroundColor: barColor }]} />

        {/* P10-P90 uncertainty band overlay */}
        {p90Pct > p10Pct && (
          <View
            style={[
              styles.band,
              {
                left: `${p10Pct}%`,
                width: `${Math.max(2, p90Pct - p10Pct)}%`,
                backgroundColor: palette.text,
                opacity: 0.14,
              },
            ]}
          />
        )}

        {/* Dual-clock expiration marker if expiring sooner than horizon */}
        {expPct !== null && expPct <= 98 && (
          <View
            style={[
              styles.expiryMarker,
              {
                left: `${expPct}%`,
                backgroundColor:
                  forecast.spoilageRiskScore >= 0.4 ? palette.danger : palette.textMuted,
              },
            ]}
          />
        )}
      </View>

      <View style={styles.captionRow}>
        <Text style={[styles.caption, { color: palette.textMuted }]}>
          P10–P90: {forecast.p10DaysRemaining.toFixed(1)}–{forecast.p90DaysRemaining.toFixed(1)}d
        </Text>
        <Text style={[styles.caption, { color: palette.textMuted }]}>
          {forecast.confidenceScore}% model conf.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  track: {
    height: 7,
    borderRadius: 99,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    height: '100%',
    borderRadius: 99,
  },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 99,
  },
  expiryMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2.5,
  },
  captionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  caption: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});
