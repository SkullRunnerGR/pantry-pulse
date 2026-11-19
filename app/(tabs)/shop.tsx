import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/src/components/Badge';
import { formatQuantity } from '@/src/ml/nutritionCalculator';
import { usePantry } from '@/src/store/PantryContext';
import { Radii, Spacing } from '@/src/theme/tokens';
import { useTheme } from '@/src/theme/useTheme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatTripDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export default function ShopScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const {
    profile,
    products,
    forecasts,
    shoppingPlan,
    lastReminderSyncCount,
    toggleShoppingItem,
    addManualShoppingItem,
    completeShoppingTrip,
    updateProfile,
  } = usePantry();

  const [manualText, setManualText] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  if (!profile || !shoppingPlan) return null;

  const checkedCount = shoppingPlan.items.filter((i) => i.isChecked).length;

  const togglePreferredDay = async (dow: number) => {
    const exists = profile.preferredShopDays.includes(dow);
    const next = exists
      ? profile.preferredShopDays.filter((d) => d !== dow)
      : [...profile.preferredShopDays, dow].sort((a, b) => a - b);
    if (next.length === 0) return;
    await updateProfile({ preferredShopDays: next });
  };

  const handleAddManual = async () => {
    if (!manualText.trim()) return;
    await addManualShoppingItem(manualText.trim());
    setManualText('');
  };

  const handleCompleteTrip = async () => {
    const count = await completeShoppingTrip();
    if (count > 0) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setToast(`Restocked ${count} item${count > 1 ? 's' : ''} into Pantry & recalculated ML forecasts!`);
      setTimeout(() => setToast(null), 3500);
    }
  };

  const criticalItems = shoppingPlan.items.filter((i) => i.priority === 'critical');
  const upcomingItems = shoppingPlan.items.filter((i) => i.priority === 'upcoming');
  const optionalItems = shoppingPlan.items.filter((i) => i.priority === 'optional');

  const topFastMovers = products
    .map((p) => ({ product: p, forecast: forecasts[p.id] }))
    .filter((x) => x.forecast && x.forecast.observationDays > 0)
    .sort((a, b) => b.forecast.confidenceScore - a.forecast.confidenceScore)
    .slice(0, 4);

  const renderSection = (
    title: string,
    items: typeof shoppingPlan.items,
    tone: 'danger' | 'warning' | 'neutral'
  ) => {
    if (items.length === 0) return null;
    return (
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={[styles.rowBetween, { gap: 8 }]}>
          <Text style={[styles.cardTitle, { color: palette.text, flex: 1 }]}>{title}</Text>
          <Badge label={`${items.length}`} tone={tone} />
        </View>

        <View style={{ gap: 8 }}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => toggleShoppingItem(item.id)}
              style={[
                styles.shopRow,
                {
                  backgroundColor: item.isChecked ? palette.surfaceMuted : palette.background,
                  borderColor: palette.borderSubtle,
                },
              ]}>
              <Ionicons
                name={item.isChecked ? 'checkbox' : 'square-outline'}
                size={21}
                color={item.isChecked ? palette.primary : palette.textMuted}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={[
                    styles.itemName,
                    {
                      color: item.isChecked ? palette.textMuted : palette.text,
                      textDecorationLine: item.isChecked ? 'line-through' : 'none',
                    },
                  ]}>
                  {item.name}
                </Text>
                <Text style={[styles.itemMeta, { color: palette.textSecondary }]}>
                  {item.packagesToBuy}× ({formatQuantity(item.recommendedQty, item.unit)}) ·{' '}
                  {item.aisle}
                </Text>
                <Text style={[styles.itemReason, { color: palette.textMuted }]}>{item.reason}</Text>
              </View>
              <Text style={[styles.priceText, { color: palette.text }]}>
                ${item.estimatedPrice.toFixed(2)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { gap: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: palette.text }]}>Smart Shop</Text>
            <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
              Optimal trip scheduling & shelf-life-capped list
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            style={[styles.iconBtn, { backgroundColor: palette.surface, borderColor: palette.border, flexShrink: 0 }]}>
            <Ionicons name="notifications-outline" size={19} color={palette.primary} />
          </Pressable>
        </View>

        {toast && (
          <View style={[styles.toast, { backgroundColor: palette.successSoft, borderColor: palette.success }]}>
            <Ionicons name="checkmark-circle" size={18} color={palette.success} />
            <Text style={[styles.toastText, { color: palette.success }]}>{toast}</Text>
          </View>
        )}

        {/* Optimal Trip Schedule Card */}
        <View style={[styles.tripCard, { backgroundColor: palette.primary }]}>
          <View style={styles.rowBetween}>
            <Text style={styles.tripKicker}>RECOMMENDED NEXT TRIP</Text>
            <View style={styles.reminderChip}>
              <Ionicons
                name={profile.remindersEnabled ? 'notifications' : 'notifications-off'}
                size={12}
                color="#D8F3DC"
              />
              <Text style={styles.reminderText}>
                {profile.remindersEnabled
                  ? `Alert ${profile.reminderHour}:00${lastReminderSyncCount > 0 ? ' · Active' : ''}`
                  : 'Alerts Off'}
              </Text>
            </View>
          </View>

          <Text style={styles.tripTitle}>{formatTripDate(shoppingPlan.scheduledDate)}</Text>
          <Text style={styles.tripSub}>{shoppingPlan.reason}</Text>

          {/* Preferred Shopping Days Live Selector */}
          <View style={styles.prefBox}>
            <Text style={styles.prefLabel}>Preferred shop days (tap to reschedule live):</Text>
            <View style={styles.dowRow}>
              {WEEKDAYS.map((lbl, idx) => {
                const active = profile.preferredShopDays.includes(idx);
                return (
                  <Pressable
                    key={idx}
                    onPress={() => togglePreferredDay(idx)}
                    style={[
                      styles.dowCircle,
                      {
                        backgroundColor: active ? '#FFFFFF' : 'rgba(255,255,255,0.14)',
                      },
                    ]}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: active ? palette.primary : '#FFFFFF',
                      }}>
                      {lbl}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.tripBottom, { gap: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.totalLabel}>Estimated Basket</Text>
              <Text style={styles.totalVal}>${shoppingPlan.estimatedTotal.toFixed(2)}</Text>
            </View>
            {shoppingPlan.items.length > 0 && (
              <Pressable onPress={handleCompleteTrip} style={[styles.checkoutBtn, { flexShrink: 0 }]}>
                <Ionicons name="bag-check" size={16} color={palette.primary} />
                <Text style={[styles.checkoutBtnText, { color: palette.primary }]}>
                  {checkedCount > 0 ? `Restock ${checkedCount} Checked` : 'Complete Trip'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Manual Item Quick Add */}
        <View style={styles.manualRow}>
          <TextInput
            value={manualText}
            onChangeText={setManualText}
            onSubmitEditing={handleAddManual}
            placeholder="Add extra item to shopping list..."
            placeholderTextColor={palette.textMuted}
            style={[
              styles.input,
              { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text, flex: 1 },
            ]}
          />
          <Pressable
            onPress={handleAddManual}
            style={[styles.addManualBtn, { backgroundColor: palette.primary }]}>
            <Ionicons name="add" size={20} color={palette.primaryText} />
          </Pressable>
        </View>

        {/* Dynamic Priority Shopping Lists */}
        {shoppingPlan.items.length === 0 ? (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
              Your pantry is fully stocked for the next {profile.shopLookaheadDays} days! No critical or upcoming items needed yet.
            </Text>
          </View>
        ) : (
          <>
            {renderSection('Must Buy — Critical Stockout Prevention', criticalItems, 'danger')}
            {renderSection(
              `Stock Up — Within ${profile.shopLookaheadDays}-Day Horizon`,
              upcomingItems,
              'warning'
            )}
            {renderSection('Added Manually', optionalItems, 'neutral')}
          </>
        )}

        {/* ML Consumption Insights */}
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={[styles.rowBetween, { gap: 8 }]}>
            <Text style={[styles.cardTitle, { color: palette.text, flex: 1 }]}>
              Learned Household Velocity (ML)
            </Text>
            <Badge label="Bayesian-EWMA" tone="primary" />
          </View>

          {topFastMovers.map(({ product, forecast }) => (
            <Pressable
              key={product.id}
              onPress={() => router.push(`/product/${product.id}`)}
              style={[styles.mlRow, { borderTopColor: palette.borderSubtle }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: palette.text }]}>{product.name}</Text>
                <Text style={[styles.itemMeta, { color: palette.textSecondary }]}>
                  {formatQuantity(forecast.dailyRateMean, forecast.unit)}/day · Safety stock{' '}
                  {forecast.safetyStockDays}d · {forecast.observationDays} active days
                </Text>
              </View>
              <Badge label={`${forecast.confidenceScore}% conf`} tone="success" />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: 44,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radii.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  tripCard: {
    borderRadius: Radii.lg,
    padding: Spacing.md + 4,
    gap: 10,
  },
  tripKicker: {
    color: '#D8F3DC',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  reminderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  reminderText: {
    color: '#D8F3DC',
    fontSize: 11,
    fontWeight: '600',
  },
  tripTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  tripSub: {
    color: '#D8F3DC',
    fontSize: 13,
    lineHeight: 18,
  },
  prefBox: {
    gap: 8,
    marginTop: 4,
  },
  prefLabel: {
    color: '#B7E4C7',
    fontSize: 11,
    fontWeight: '600',
  },
  dowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  dowCircle: {
    flex: 1,
    height: 32,
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
  },
  totalLabel: {
    color: '#B7E4C7',
    fontSize: 11,
    fontWeight: '600',
  },
  totalVal: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radii.full,
  },
  checkoutBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  manualRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
  },
  addManualBtn: {
    width: 44,
    height: 44,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemMeta: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  itemReason: {
    fontSize: 11,
  },
  priceText: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  mlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
});
