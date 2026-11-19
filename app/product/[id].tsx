import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Badge } from '@/src/components/Badge';
import { ForecastBar } from '@/src/components/ForecastBar';
import { SeasonalityChart } from '@/src/components/SeasonalityChart';
import { daysBetweenDates } from '@/src/ml/depletionForecaster';
import { calculateProductNutrition, formatQuantity } from '@/src/ml/nutritionCalculator';
import { usePantry } from '@/src/store/PantryContext';
import { Radii, Spacing } from '@/src/theme/tokens';
import { useTheme } from '@/src/theme/useTheme';

export default function ProductDetailModal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const {
    products,
    batches,
    events,
    forecasts,
    quickConsumeProduct,
    addInventoryBatch,
    adjustProductStock,
  } = usePantry();

  const product = products.find((p) => p.id === id);
  const forecast = id ? forecasts[id] : undefined;

  const [calibrationInput, setCalibrationInput] = useState(
    forecast ? String(Math.round(forecast.currentStock)) : '0'
  );
  const [message, setMessage] = useState<string | null>(null);

  if (!product || !forecast) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.background }]}>
        <Text style={{ color: palette.textSecondary }}>Product not found.</Text>
      </View>
    );
  }

  const productBatches = batches
    .filter((b) => b.productId === product.id && b.status === 'active')
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

  const recentEvents = events
    .filter((e) => e.productId === product.id)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 6);

  const servingNut = calculateProductNutrition(product, product.servingSize);
  const now = new Date();

  const handleCalibrate = async () => {
    const val = parseFloat(calibrationInput);
    if (Number.isNaN(val) || val < 0) return;
    await adjustProductStock(product.id, val);
    setMessage('Stock calibrated & implicit consumption rate updated.');
    setTimeout(() => setMessage(null), 2600);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={styles.scroll}>
      <Stack.Screen options={{ title: product.name }} />

      {/* Product Header Card */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.title, { color: palette.text }]}>{product.name}</Text>
            <Text style={[styles.sub, { color: palette.textSecondary }]}>
              {product.brand ?? product.category} · {product.aisle} · {product.storageLocation}
            </Text>
          </View>
          <Badge label={`${forecast.confidenceScore}% ML conf.`} tone="primary" />
        </View>

        <View style={styles.metricGrid}>
          <View style={[styles.metricBox, { backgroundColor: palette.background }]}>
            <Text style={[styles.metricLbl, { color: palette.textMuted }]}>On Hand</Text>
            <Text style={[styles.metricVal, { color: palette.text }]}>
              {formatQuantity(forecast.currentStock, forecast.unit)}
            </Text>
          </View>
          <View style={[styles.metricBox, { backgroundColor: palette.background }]}>
            <Text style={[styles.metricLbl, { color: palette.textMuted }]}>Daily Rate</Text>
            <Text style={[styles.metricVal, { color: palette.primary }]}>
              {formatQuantity(forecast.dailyRateMean, forecast.unit)}/d
            </Text>
          </View>
          <View style={[styles.metricBox, { backgroundColor: palette.background }]}>
            <Text style={[styles.metricLbl, { color: palette.textMuted }]}>Est. Empty</Text>
            <Text style={[styles.metricVal, { color: palette.text }]}>
              {forecast.daysRemaining.toFixed(1)}d
            </Text>
          </View>
        </View>

        <ForecastBar forecast={forecast} />

        <Text style={[styles.detailLine, { color: palette.textSecondary }]}>
          Predicted empty: {forecast.predictedDepletionDate} (P10 {forecast.p10DepletionDate} – P90{' '}
          {forecast.p90DepletionDate}) · Reorder by {forecast.reorderDate}
        </Text>
      </View>

      {/* Spoilage Warning Card if applicable */}
      {forecast.spoilageRiskScore >= 0.3 && (
        <View style={[styles.card, { backgroundColor: palette.warningSoft, borderColor: palette.warning }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.cardTitle, { color: palette.warning }]}>
              Dual-Clock Spoilage Alert
            </Text>
            <Badge label={`${Math.round(forecast.spoilageRiskScore * 100)}% risk`} tone="warning" />
          </View>
          <Text style={[styles.detailLine, { color: palette.text }]}>
            Earliest batch expires in {forecast.daysUntilEarliestExpiry}d ({forecast.earliestExpiryDate}),
            before your predicted depletion date ({forecast.predictedDepletionDate}). Projected waste:{' '}
            {formatQuantity(forecast.projectedWasteQty, forecast.unit)}.
          </Text>
        </View>
      )}

      {/* 7-Day Seasonality Profile */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>
          Day-of-Week Consumption Seasonality
        </Text>
        <Text style={[styles.sub, { color: palette.textMuted }]}>
          Learned multipliers applied during forward depletion simulation (1.0x = average day)
        </Text>
        <SeasonalityChart multipliers={forecast.dowMultipliers} />
      </View>

      {/* Stock Calibration & Quick Actions */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>
          Quick Actions & Stock Calibration
        </Text>
        {message && <Text style={{ color: palette.success, fontSize: 12, fontWeight: '600' }}>{message}</Text>}

        <View style={styles.btnRow}>
          <Pressable
            onPress={() => quickConsumeProduct(product.id)}
            style={[styles.actionBtn, { backgroundColor: palette.primarySoft }]}>
            <Ionicons name="remove-circle-outline" size={16} color={palette.primary} />
            <Text style={[styles.actionBtnText, { color: palette.primary }]}>
              -1 Serving ({product.servingLabel})
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              addInventoryBatch({ product, quantity: product.defaultPackageQty })
            }
            style={[styles.actionBtn, { backgroundColor: palette.primary }]}>
            <Ionicons name="add-circle-outline" size={16} color={palette.primaryText} />
            <Text style={[styles.actionBtnText, { color: palette.primaryText }]}>
              +1 Pkg ({formatQuantity(product.defaultPackageQty, product.defaultUnit)})
            </Text>
          </Pressable>
        </View>

        <View style={styles.calRow}>
          <TextInput
            value={calibrationInput}
            onChangeText={setCalibrationInput}
            keyboardType="numeric"
            placeholder={`Exact qty (${product.defaultUnit})`}
            placeholderTextColor={palette.textMuted}
            style={[
              styles.input,
              { backgroundColor: palette.background, borderColor: palette.border, color: palette.text, flex: 1 },
            ]}
          />
          <Pressable
            onPress={handleCalibrate}
            style={[styles.calBtn, { backgroundColor: palette.surfaceMuted }]}>
            <Text style={[styles.calBtnText, { color: palette.text }]}>Calibrate</Text>
          </Pressable>
        </View>
      </View>

      {/* Nutrition Facts */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>
          Nutrition ({product.servingLabel})
        </Text>
        <Text style={[styles.detailLine, { color: palette.textSecondary }]}>
          {servingNut.kcal} kcal · Protein {servingNut.proteinG}g · Carbs {servingNut.carbsG}g ·
          Fat {servingNut.fatG}g · Fiber {servingNut.fiberG}g
        </Text>
      </View>

      {/* Active Batches */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>
          Active FIFO Batches ({productBatches.length})
        </Text>
        {productBatches.length === 0 ? (
          <Text style={[styles.sub, { color: palette.textMuted }]}>No active stock on hand.</Text>
        ) : (
          productBatches.map((b) => {
            const expDays = daysBetweenDates(now, b.expiresAt);
            return (
              <View key={b.id} style={[styles.batchRow, { borderTopColor: palette.borderSubtle, gap: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.batchQty, { color: palette.text }]}>
                    {formatQuantity(b.remainingQty, b.unit)} / {formatQuantity(b.initialQty, b.unit)}
                  </Text>
                  <Text style={[styles.sub, { color: palette.textMuted }]}>
                    Bought {b.purchasedAt.slice(0, 10)} · {b.storageLocation}
                  </Text>
                </View>
                <Badge
                  label={expDays <= 0 ? 'Expired' : `Exp in ${expDays}d`}
                  tone={expDays <= 2 ? 'danger' : expDays <= 5 ? 'warning' : 'success'}
                />
              </View>
            );
          })
        )}
      </View>

      {/* Recent Consumption Events */}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>
          Recent Consumption Signals ({recentEvents.length})
        </Text>
        {recentEvents.map((e) => (
          <View key={e.id} style={[styles.batchRow, { borderTopColor: palette.borderSubtle }]}>
            <Text style={[styles.sub, { color: palette.textSecondary }]}>
              {e.occurredAt.slice(0, 10)} · {e.source.replace('_', ' ')}
            </Text>
            <Text style={[styles.batchQty, { color: palette.text }]}>
              -{formatQuantity(e.quantityDelta, e.unit)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: 44,
    gap: 14,
  },
  card: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  sub: {
    fontSize: 12,
  },
  detailLine: {
    fontSize: 12,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metricBox: {
    flex: 1,
    borderRadius: Radii.md,
    padding: 10,
    gap: 2,
  },
  metricLbl: {
    fontSize: 11,
    fontWeight: '600',
  },
  metricVal: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Radii.md,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  calRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radii.sm + 2,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 14,
  },
  calBtn: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: Radii.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  batchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 9,
    borderTopWidth: 1,
  },
  batchQty: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
