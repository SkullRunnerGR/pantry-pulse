import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/src/components/Badge';
import { CalorieRing } from '@/src/components/CalorieRing';
import { formatQuantity } from '@/src/ml/nutritionCalculator';
import { usePantry } from '@/src/store/PantryContext';
import { Radii, Spacing } from '@/src/theme/tokens';
import { useTheme } from '@/src/theme/useTheme';

function formatShortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function PulseHomeScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const {
    loading,
    profile,
    products,
    forecasts,
    shoppingPlan,
    todayNutrition,
    zeroWasteMeals,
    logRecipeTemplate,
  } = usePantry();

  const [loggedRecipeId, setLoggedRecipeId] = useState<string | null>(null);

  if (loading || !profile) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </SafeAreaView>
    );
  }

  const productMap = new Map(products.map((p) => [p.id, p]));

  const urgentItems = Object.values(forecasts)
    .filter(
      (f) =>
        f.urgencyStatus === 'critical' ||
        f.urgencyStatus === 'out' ||
        f.urgencyStatus === 'expiring'
    )
    .sort((a, b) => {
      const rank = { out: 0, critical: 1, expiring: 2, low: 3, healthy: 4 };
      const rDiff = rank[a.urgencyStatus] - rank[b.urgencyStatus];
      if (rDiff !== 0) return rDiff;
      return a.daysRemaining - b.daysRemaining;
    })
    .slice(0, 5);

  const handleQuickLogZeroWaste = async (recipeId: string) => {
    const match = zeroWasteMeals.find((r) => r.recipe.id === recipeId);
    if (!match) return;
    await logRecipeTemplate(match.recipe);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setLoggedRecipeId(recipeId);
    setTimeout(() => setLoggedRecipeId(null), 2200);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { gap: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.kicker, { color: palette.textMuted }]}>PANTRYPULSE</Text>
            <Text style={[styles.title, { color: palette.text }]}>
              {profile.name.trim() ? `Good day, ${profile.name}` : 'Welcome to PantryPulse'}
            </Text>
          </View>
          <View style={[styles.headerActions, { flexShrink: 0 }]}>
            <Pressable
              onPress={() => router.push('/(tabs)/scan')}
              style={[styles.iconBtn, { backgroundColor: palette.primarySoft }]}>
              <Ionicons name="barcode-outline" size={20} color={palette.primary} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/settings')}
              style={[styles.iconBtn, { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }]}>
              <Ionicons name="options-outline" size={20} color={palette.text} />
            </Pressable>
          </View>
        </View>

        {/* Daily Calories & Macros Card */}
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>Today’s Intake</Text>
            <Pressable onPress={() => router.push('/(tabs)/meals')}>
              <Text style={[styles.linkText, { color: palette.primary }]}>+ Log meal</Text>
            </Pressable>
          </View>
          <CalorieRing consumed={todayNutrition} profile={profile} />
        </View>

        {/* Optimal Next Shopping Trip Banner or Getting Started Card */}
        {products.length === 0 && (!shoppingPlan || shoppingPlan.items.length === 0) ? (
          <Pressable
            onPress={() => router.push('/(tabs)/scan')}
            style={[styles.tripBanner, { backgroundColor: palette.primary }]}>
            <View style={styles.tripTopRow}>
              <View style={styles.tripLabelRow}>
                <Ionicons name="sparkles" size={14} color="#A7F3D0" />
                <Text style={styles.tripKicker}>GET STARTED</Text>
              </View>
            </View>
            <Text style={styles.tripDate}>Add Your First Groceries</Text>
            <Text style={styles.tripReason}>
              Scan a barcode, photograph a store receipt with offline OCR, or quick-add items to unlock depletion forecasts & smart trip reminders.
            </Text>
            <View style={styles.tripFooter}>
              <Text style={styles.tripMeta}>Open Barcode & Receipt Scanner</Text>
              <Ionicons name="arrow-forward-circle" size={22} color="#FFFFFF" />
            </View>
          </Pressable>
        ) : shoppingPlan ? (
          <Pressable
            onPress={() => router.push('/(tabs)/shop')}
            style={[styles.tripBanner, { backgroundColor: palette.primary }]}>
            <View style={styles.tripTopRow}>
              <View style={styles.tripLabelRow}>
                <Ionicons name="sparkles" size={14} color="#A7F3D0" />
                <Text style={styles.tripKicker}>SMART TRIP SCHEDULE</Text>
              </View>
              <View style={styles.tripPricePill}>
                <Text style={styles.tripPriceText}>
                  Est. ${shoppingPlan.estimatedTotal.toFixed(2)}
                </Text>
              </View>
            </View>

            <Text style={styles.tripDate}>
              {shoppingPlan.daysUntilTrip === 0
                ? 'Shop Today'
                : shoppingPlan.daysUntilTrip === 1
                ? `Tomorrow · ${formatShortDate(shoppingPlan.scheduledDate)}`
                : `${formatShortDate(shoppingPlan.scheduledDate)} (in ${shoppingPlan.daysUntilTrip}d)`}
            </Text>
            <Text style={styles.tripReason}>{shoppingPlan.reason}</Text>

            <View style={styles.tripFooter}>
              <Text style={styles.tripMeta}>
                {shoppingPlan.criticalCount} critical · {shoppingPlan.upcomingCount} upcoming ·{' '}
                {shoppingPlan.items.length} total items
              </Text>
              <Ionicons name="arrow-forward-circle" size={22} color="#FFFFFF" />
            </View>
          </Pressable>
        ) : null}

        {/* Predictive Inventory Radar */}
        <View style={[styles.sectionHeader, { gap: 8 }]}>
          <Text style={[styles.sectionTitle, { color: palette.text, flex: 1 }]}>
            Predictive Stock & Spoilage Radar
          </Text>
          <Pressable onPress={() => router.push('/(tabs)/pantry')} style={{ flexShrink: 0 }}>
            <Text style={[styles.linkText, { color: palette.primary }]}>All {products.length}</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, paddingVertical: 6 }]}>
          {urgentItems.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons
                name={products.length === 0 ? 'cube-outline' : 'checkmark-circle'}
                size={20}
                color={products.length === 0 ? palette.textMuted : palette.success}
              />
              <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
                {products.length === 0
                  ? 'No pantry items tracked yet. Add groceries in Scan to start forecasting.'
                  : 'All pantry items are well-stocked with low spoilage risk.'}
              </Text>
            </View>
          ) : (
            urgentItems.map((f, index) => {
              const prod = productMap.get(f.productId);
              if (!prod) return null;
              const isExpiring = f.urgencyStatus === 'expiring';
              return (
                <Pressable
                  key={f.productId}
                  onPress={() => router.push(`/product/${prod.id}`)}
                  style={[
                    styles.alertRow,
                    index < urgentItems.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: palette.borderSubtle,
                    },
                  ]}>
                  <View style={styles.alertInfo}>
                    <Text style={[styles.alertName, { color: palette.text }]} numberOfLines={1}>
                      {prod.name}
                    </Text>
                    <Text style={[styles.alertSub, { color: palette.textSecondary }]}>
                      {formatQuantity(f.currentStock, f.unit)} left ·{' '}
                      {isExpiring
                        ? `Expires in ${f.daysUntilEarliestExpiry}d (${Math.round(f.spoilageRiskScore * 100)}% waste risk)`
                        : f.urgencyStatus === 'out'
                        ? 'Out of stock'
                        : `Depletes in ${f.daysRemaining.toFixed(1)}d (${f.confidenceScore}% conf.)`}
                    </Text>
                  </View>
                  <Badge
                    label={
                      isExpiring
                        ? 'Use Soon'
                        : f.urgencyStatus === 'out'
                        ? 'Out'
                        : `${f.daysRemaining.toFixed(1)}d`
                    }
                    tone={isExpiring ? 'warning' : 'danger'}
                  />
                </Pressable>
              );
            })
          )}
        </View>

        {/* Zero-Waste Meal Suggestions */}
        {zeroWasteMeals.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { gap: 8 }]}>
              <Text style={[styles.sectionTitle, { color: palette.text, flex: 1 }]}>
                Zero-Waste Meal Suggestions
              </Text>
              <Badge label="Rescue + Macro Fit" tone="success" />
            </View>

            <View style={{ gap: 12 }}>
              {zeroWasteMeals.slice(0, 2).map((rec) => {
                const isJustLogged = loggedRecipeId === rec.recipe.id;
                return (
                  <View
                    key={rec.recipe.id}
                    style={[
                      styles.card,
                      { backgroundColor: palette.surface, borderColor: palette.border },
                    ]}>
                    <View style={styles.recipeTop}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={[styles.recipeTitle, { color: palette.text }]}>
                          {rec.recipe.title}
                        </Text>
                        <Text style={[styles.recipeMeta, { color: palette.textSecondary }]}>
                          {rec.nutrition.kcal} kcal · {rec.nutrition.proteinG}g P ·{' '}
                          {rec.recipe.prepMinutes} min
                        </Text>
                      </View>
                      <Badge label={`${rec.score}% match`} tone="primary" />
                    </View>

                    {rec.rescuedItems.length > 0 && (
                      <View style={[styles.rescueStrip, { backgroundColor: palette.warningSoft }]}>
                        <Ionicons name="leaf" size={14} color={palette.warning} />
                        <Text style={[styles.rescueText, { color: palette.warning }]} numberOfLines={2}>
                          Rescues{' '}
                          {rec.rescuedItems
                            .map((r) => `${r.productName} (${r.daysUntilExpiry}d)`)
                            .join(', ')}
                        </Text>
                      </View>
                    )}

                    <View style={[styles.recipeFooter, { gap: 10 }]}>
                      <Text style={[styles.coverageText, { color: palette.textMuted, flex: 1 }]}>
                        {Math.round(rec.pantryCoverageRatio * 100)}% in pantry · Auto-deducts FIFO
                      </Text>
                      <Pressable
                        onPress={() => handleQuickLogZeroWaste(rec.recipe.id)}
                        style={[
                          styles.logBtn,
                          {
                            backgroundColor: isJustLogged ? palette.success : palette.primary,
                            flexShrink: 0,
                          },
                        ]}>
                        <Ionicons
                          name={isJustLogged ? 'checkmark' : 'add'}
                          size={15}
                          color={palette.primaryText}
                        />
                        <Text style={[styles.logBtnText, { color: palette.primaryText }]}>
                          {isJustLogged ? 'Logged!' : 'Log Meal'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.md + 2,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tripBanner: {
    borderRadius: Radii.lg,
    padding: Spacing.md + 4,
    gap: 6,
  },
  tripTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tripKicker: {
    color: '#D8F3DC',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  tripPricePill: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tripPriceText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  tripDate: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  tripReason: {
    color: '#D8F3DC',
    fontSize: 13,
    lineHeight: 18,
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
  },
  tripMeta: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    gap: 12,
  },
  alertInfo: {
    flex: 1,
    gap: 2,
  },
  alertName: {
    fontSize: 14,
    fontWeight: '600',
  },
  alertSub: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  emptyText: {
    fontSize: 13,
    flex: 1,
  },
  recipeTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  recipeTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  recipeMeta: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  rescueStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radii.sm,
  },
  rescueText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  recipeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coverageText: {
    fontSize: 12,
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radii.full,
  },
  logBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
