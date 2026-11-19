import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { usePantry } from '@/src/store/PantryContext';
import { Radii, Spacing } from '@/src/theme/tokens';
import { useTheme } from '@/src/theme/useTheme';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SettingsModal() {
  const { palette } = useTheme();
  const router = useRouter();
  const { profile, updateProfile, clearAllData, resetDemoData } = usePantry();

  const [name, setName] = useState(profile?.name ?? '');
  const [kcalGoal, setKcalGoal] = useState(String(profile?.dailyCalorieGoal ?? 2000));
  const [proteinGoal, setProteinGoal] = useState(String(profile?.proteinGoalG ?? 130));
  const [carbsGoal, setCarbsGoal] = useState(String(profile?.carbsGoalG ?? 220));
  const [fatGoal, setFatGoal] = useState(String(profile?.fatGoalG ?? 65));
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  if (!profile) return null;

  const handleSaveGoals = async () => {
    await updateProfile({
      name: name.trim(),
      dailyCalorieGoal: Math.max(1000, parseInt(kcalGoal, 10) || 2000),
      proteinGoalG: Math.max(30, parseInt(proteinGoal, 10) || 130),
      carbsGoalG: Math.max(30, parseInt(carbsGoal, 10) || 220),
      fatGoalG: Math.max(20, parseInt(fatGoal, 10) || 65),
    });
    setSavedMsg('Preferences saved!');
    setTimeout(() => setSavedMsg(null), 2000);
  };

  const toggleDay = async (dow: number) => {
    const exists = profile.preferredShopDays.includes(dow);
    const next = exists
      ? profile.preferredShopDays.filter((d) => d !== dow)
      : [...profile.preferredShopDays, dow].sort((a, b) => a - b);
    if (next.length === 0) return;
    await updateProfile({ preferredShopDays: next });
  };

  const handleClearAll = async () => {
    await clearAllData();
    setName('');
    setKcalGoal('2000');
    setProteinGoal('130');
    setCarbsGoal('220');
    setFatGoal('65');
    setSavedMsg('All data cleared!');
    setTimeout(() => router.back(), 600);
  };

  const handleLoadDemo = async () => {
    await resetDemoData();
    setSavedMsg('Sample 21-day demo loaded!');
    setTimeout(() => router.back(), 600);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={styles.scroll}>
      {savedMsg && (
        <View style={[styles.toast, { backgroundColor: palette.successSoft }]}>
          <Text style={{ color: palette.success, fontWeight: '700', fontSize: 13 }}>{savedMsg}</Text>
        </View>
      )}

      {/* Household & Nutrition Targets */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>Household & Nutrition Goals</Text>

        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: palette.text }]}>Household Size</Text>
            <Text style={[styles.sub, { color: palette.textMuted }]}>
              Scales ML cold-start consumption priors (H^0.85)
            </Text>
          </View>
          <View style={styles.stepper}>
            <Pressable
              onPress={() =>
                updateProfile({ householdSize: Math.max(1, profile.householdSize - 1) })
              }
              style={[styles.stepBtn, { backgroundColor: palette.surfaceMuted }]}>
              <Ionicons name="remove" size={16} color={palette.text} />
            </Pressable>
            <Text style={[styles.stepVal, { color: palette.text }]}>{profile.householdSize}</Text>
            <Pressable
              onPress={() =>
                updateProfile({ householdSize: Math.min(8, profile.householdSize + 1) })
              }
              style={[styles.stepBtn, { backgroundColor: palette.primarySoft }]}>
              <Ionicons name="add" size={16} color={palette.primary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.fieldRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.fieldLbl, { color: palette.textSecondary }]}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={palette.textMuted}
              style={[styles.input, { backgroundColor: palette.background, borderColor: palette.border, color: palette.text }]}
            />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.fieldLbl, { color: palette.textSecondary }]}>Daily Calories</Text>
            <TextInput
              value={kcalGoal}
              onChangeText={setKcalGoal}
              keyboardType="numeric"
              style={[styles.input, { backgroundColor: palette.background, borderColor: palette.border, color: palette.text }]}
            />
          </View>
        </View>

        <View style={styles.fieldRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.fieldLbl, { color: palette.textSecondary }]}>Protein (g)</Text>
            <TextInput
              value={proteinGoal}
              onChangeText={setProteinGoal}
              keyboardType="numeric"
              style={[styles.input, { backgroundColor: palette.background, borderColor: palette.border, color: palette.text }]}
            />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.fieldLbl, { color: palette.textSecondary }]}>Carbs (g)</Text>
            <TextInput
              value={carbsGoal}
              onChangeText={setCarbsGoal}
              keyboardType="numeric"
              style={[styles.input, { backgroundColor: palette.background, borderColor: palette.border, color: palette.text }]}
            />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.fieldLbl, { color: palette.textSecondary }]}>Fat (g)</Text>
            <TextInput
              value={fatGoal}
              onChangeText={setFatGoal}
              keyboardType="numeric"
              style={[styles.input, { backgroundColor: palette.background, borderColor: palette.border, color: palette.text }]}
            />
          </View>
        </View>

        <Pressable
          onPress={handleSaveGoals}
          style={[styles.saveBtn, { backgroundColor: palette.primary }]}>
          <Text style={[styles.saveBtnText, { color: palette.primaryText }]}>Save Nutrition Goals</Text>
        </Pressable>
      </View>

      {/* Smart Trip Scheduler & Reminders */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>Smart Scheduler & Reminders</Text>

        <View style={{ gap: 6 }}>
          <Text style={[styles.fieldLbl, { color: palette.textSecondary }]}>
            Preferred Shopping Days
          </Text>
          <View style={styles.dowRow}>
            {WEEKDAYS.map((d, idx) => {
              const active = profile.preferredShopDays.includes(idx);
              return (
                <Pressable
                  key={d}
                  onPress={() => toggleDay(idx)}
                  style={[
                    styles.dowChip,
                    {
                      backgroundColor: active ? palette.primary : palette.surfaceMuted,
                    },
                  ]}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: active ? palette.primaryText : palette.textSecondary,
                    }}>
                    {d}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: palette.text }]}>Consolidation Horizon</Text>
            <Text style={[styles.sub, { color: palette.textMuted }]}>
              Lookahead window for batching items into one trip
            </Text>
          </View>
          <View style={styles.stepper}>
            <Pressable
              onPress={() =>
                updateProfile({ shopLookaheadDays: Math.max(3, profile.shopLookaheadDays - 1) })
              }
              style={[styles.stepBtn, { backgroundColor: palette.surfaceMuted }]}>
              <Ionicons name="remove" size={16} color={palette.text} />
            </Pressable>
            <Text style={[styles.stepVal, { color: palette.text }]}>
              {profile.shopLookaheadDays}d
            </Text>
            <Pressable
              onPress={() =>
                updateProfile({ shopLookaheadDays: Math.min(12, profile.shopLookaheadDays + 1) })
              }
              style={[styles.stepBtn, { backgroundColor: palette.primarySoft }]}>
              <Ionicons name="add" size={16} color={palette.primary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: palette.text }]}>Automated Trip & Waste Alerts</Text>
            <Text style={[styles.sub, { color: palette.textMuted }]}>
              Native iOS/Android notifications via expo-notifications
            </Text>
          </View>
          <Switch
            value={profile.remindersEnabled}
            onValueChange={(v) => updateProfile({ remindersEnabled: v })}
            trackColor={{ true: palette.primary, false: palette.surfaceMuted }}
          />
        </View>
      </View>

      {/* Data Management */}
      <Pressable
        onPress={handleClearAll}
        style={[styles.resetBtn, { borderColor: palette.border, backgroundColor: palette.surface }]}>
        <Ionicons name="trash-outline" size={16} color={palette.danger} />
        <Text style={{ color: palette.danger, fontWeight: '700', fontSize: 13 }}>
          Clear All Data (Start Blank)
        </Text>
      </Pressable>

      <Pressable
        onPress={handleLoadDemo}
        style={[styles.resetBtn, { borderColor: palette.border, backgroundColor: palette.surface }]}>
        <Ionicons name="flask-outline" size={16} color={palette.textSecondary} />
        <Text style={{ color: palette.textSecondary, fontWeight: '600', fontSize: 13 }}>
          Optional: Load Sample 21-Day Demo Data
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: Spacing.lg,
    paddingBottom: 44,
    gap: 14,
  },
  toast: {
    padding: 12,
    borderRadius: Radii.md,
    alignItems: 'center',
  },
  card: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  sub: {
    fontSize: 12,
    marginTop: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldLbl: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: Radii.sm + 2,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 14,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepVal: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  saveBtn: {
    height: 44,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  dowRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dowChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radii.sm,
    alignItems: 'center',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
});
