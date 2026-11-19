import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { NutritionTotals, UserProfile } from '../domain/types';
import { useTheme } from '../theme/useTheme';

interface CalorieRingProps {
  consumed: NutritionTotals;
  profile: UserProfile;
  size?: number;
}

export function CalorieRing({ consumed, profile, size = 148 }: CalorieRingProps) {
  const { palette } = useTheme();
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(1, Math.max(0, consumed.kcal / Math.max(1, profile.dailyCalorieGoal)));
  const dashOffset = circumference * (1 - ratio);
  const remaining = Math.max(0, Math.round(profile.dailyCalorieGoal - consumed.kcal));
  const over = Math.max(0, Math.round(consumed.kcal - profile.dailyCalorieGoal));

  const ringColor = over > 150 ? palette.warning : palette.primary;

  const macros = [
    {
      label: 'Protein',
      val: consumed.proteinG,
      goal: profile.proteinGoalG,
      color: palette.protein,
    },
    {
      label: 'Carbs',
      val: consumed.carbsG,
      goal: profile.carbsGoalG,
      color: palette.carbs,
    },
    {
      label: 'Fat',
      val: consumed.fatG,
      goal: profile.fatGoalG,
      color: palette.fat,
    },
    {
      label: 'Fiber',
      val: consumed.fiberG,
      goal: profile.fiberGoalG,
      color: palette.fiber,
    },
  ];

  return (
    <View style={styles.row}>
      <View style={[styles.ringContainer, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={palette.surfaceMuted}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={[styles.kcalValue, { color: palette.text }]}>
            {Math.round(consumed.kcal)}
          </Text>
          <Text style={[styles.kcalSub, { color: palette.textMuted }]}>
            of {profile.dailyCalorieGoal} kcal
          </Text>
          <Text
            style={[
              styles.remainingPill,
              { color: over > 0 ? palette.warning : palette.success },
            ]}>
            {over > 0 ? `+${over} over` : `${remaining} left`}
          </Text>
        </View>
      </View>

      <View style={styles.macroList}>
        {macros.map((m) => {
          const pct = Math.min(100, Math.round((m.val / Math.max(1, m.goal)) * 100));
          return (
            <View key={m.label} style={styles.macroItem}>
              <View style={styles.macroHeader}>
                <Text style={[styles.macroLabel, { color: palette.textSecondary }]}>{m.label}</Text>
                <Text style={[styles.macroNums, { color: palette.text }]}>
                  {Math.round(m.val)}
                  <Text style={{ color: palette.textMuted }}>/{m.goal}g</Text>
                </Text>
              </View>
              <View style={[styles.barTrack, { backgroundColor: palette.surfaceMuted }]}>
                <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: m.color }]} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  ringContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kcalValue: {
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.6,
  },
  kcalSub: {
    fontSize: 11,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  remainingPill: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  macroList: {
    flex: 1,
    gap: 10,
  },
  macroItem: {
    gap: 4,
  },
  macroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  macroLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  macroNums: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 6,
    borderRadius: 99,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 99,
  },
});
