import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
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

import { Badge, BadgeTone } from '@/src/components/Badge';
import { ForecastBar } from '@/src/components/ForecastBar';
import { ConsumptionForecast, StorageLocation } from '@/src/domain/types';
import { formatQuantity } from '@/src/ml/nutritionCalculator';
import { usePantry } from '@/src/store/PantryContext';
import { Radii, Spacing } from '@/src/theme/tokens';
import { useTheme } from '@/src/theme/useTheme';

type ZoneFilter = 'all' | StorageLocation;
type StatusFilter = 'all' | 'urgent' | 'expiring';

function urgencyBadge(f: ConsumptionForecast): { label: string; tone: BadgeTone } {
  switch (f.urgencyStatus) {
    case 'out':
      return { label: 'Out of Stock', tone: 'danger' };
    case 'critical':
      return { label: `Runs out in ${f.daysRemaining.toFixed(1)}d`, tone: 'danger' };
    case 'expiring':
      return {
        label: `Expires in ${f.daysUntilEarliestExpiry}d · ${Math.round(f.spoilageRiskScore * 100)}% risk`,
        tone: 'warning',
      };
    case 'low':
      return { label: `${f.daysRemaining.toFixed(1)}d left`, tone: 'warning' };
    default:
      return { label: `${Math.round(f.daysRemaining)}d left`, tone: 'success' };
  }
}

export default function PantryScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const { products, forecasts, quickConsumeProduct, markProductOutOfStock } = usePantry();

  const [search, setSearch] = useState('');
  const [zone, setZone] = useState<ZoneFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const stats = useMemo(() => {
    const all = Object.values(forecasts);
    return {
      stocked: all.filter((f) => f.currentStock > 0).length,
      critical: all.filter((f) => f.urgencyStatus === 'critical' || f.urgencyStatus === 'out')
        .length,
      expiring: all.filter(
        (f) => f.spoilageRiskScore >= 0.4 && (f.daysUntilEarliestExpiry ?? 99) <= 4
      ).length,
    };
  }, [forecasts]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const urgencyRank = { out: 0, critical: 1, expiring: 2, low: 3, healthy: 4 };

    return products
      .filter((p) => {
        if (zone !== 'all' && p.storageLocation !== zone) return false;
        if (q && !p.name.toLowerCase().includes(q) && !(p.brand ?? '').toLowerCase().includes(q)) {
          return false;
        }
        const f = forecasts[p.id];
        if (!f) return true;
        if (statusFilter === 'urgent') {
          return f.urgencyStatus === 'critical' || f.urgencyStatus === 'out' || f.urgencyStatus === 'low';
        }
        if (statusFilter === 'expiring') {
          return f.spoilageRiskScore >= 0.35 || (f.daysUntilEarliestExpiry !== null && f.daysUntilEarliestExpiry <= 3);
        }
        return true;
      })
      .sort((a, b) => {
        const fa = forecasts[a.id];
        const fb = forecasts[b.id];
        if (!fa || !fb) return a.name.localeCompare(b.name);
        const rDiff = urgencyRank[fa.urgencyStatus] - urgencyRank[fb.urgencyStatus];
        if (rDiff !== 0) return rDiff;
        return fa.daysRemaining - fb.daysRemaining;
      });
  }, [products, forecasts, search, zone, statusFilter]);

  const handleQuickUse = async (productId: string) => {
    await quickConsumeProduct(productId);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { gap: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: palette.text }]}>Pantry Inventory</Text>
            <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
              ML-forecasted depletion & expiration tracking
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/scan')}
            style={[styles.addBtn, { backgroundColor: palette.primary, flexShrink: 0 }]}>
            <Ionicons name="add" size={18} color={palette.primaryText} />
            <Text style={[styles.addBtnText, { color: palette.primaryText }]}>Restock</Text>
          </Pressable>
        </View>

        {/* Summary Strip */}
        <View style={styles.statsRow}>
          <Pressable
            onPress={() => setStatusFilter('all')}
            style={[
              styles.statPill,
              {
                backgroundColor: statusFilter === 'all' ? palette.primarySoft : palette.surface,
                borderColor: statusFilter === 'all' ? palette.primary : palette.border,
              },
            ]}>
            <Text style={[styles.statNum, { color: palette.text }]}>{stats.stocked}</Text>
            <Text style={[styles.statLbl, { color: palette.textSecondary }]}>In Stock</Text>
          </Pressable>
          <Pressable
            onPress={() => setStatusFilter(statusFilter === 'urgent' ? 'all' : 'urgent')}
            style={[
              styles.statPill,
              {
                backgroundColor: statusFilter === 'urgent' ? palette.dangerSoft : palette.surface,
                borderColor: statusFilter === 'urgent' ? palette.danger : palette.border,
              },
            ]}>
            <Text style={[styles.statNum, { color: palette.danger }]}>{stats.critical}</Text>
            <Text style={[styles.statLbl, { color: palette.textSecondary }]}>Critical Low</Text>
          </Pressable>
          <Pressable
            onPress={() => setStatusFilter(statusFilter === 'expiring' ? 'all' : 'expiring')}
            style={[
              styles.statPill,
              {
                backgroundColor: statusFilter === 'expiring' ? palette.warningSoft : palette.surface,
                borderColor: statusFilter === 'expiring' ? palette.warning : palette.border,
              },
            ]}>
            <Text style={[styles.statNum, { color: palette.warning }]}>{stats.expiring}</Text>
            <Text style={[styles.statLbl, { color: palette.textSecondary }]}>Spoilage Risk</Text>
          </Pressable>
        </View>

        {/* Search & Zone Filters */}
        <View style={[styles.searchBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Ionicons name="search" size={18} color={palette.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search milk, eggs, spinach..."
            placeholderTextColor={palette.textMuted}
            style={[styles.searchInput, { color: palette.text }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={palette.textMuted} />
            </Pressable>
          )}
        </View>

        <View style={styles.chipRow}>
          {(['all', 'fridge', 'pantry', 'freezer'] as ZoneFilter[]).map((z) => {
            const active = zone === z;
            return (
              <Pressable
                key={z}
                onPress={() => setZone(z)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? palette.primary : palette.surface,
                    borderColor: active ? palette.primary : palette.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? palette.primaryText : palette.textSecondary },
                  ]}>
                  {z === 'all' ? 'All Zones' : z.charAt(0).toUpperCase() + z.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Inventory Cards */}
        <View style={{ gap: 12 }}>
          {filteredProducts.map((product) => {
            const f = forecasts[product.id];
            if (!f) return null;
            const badge = urgencyBadge(f);

            return (
              <Pressable
                key={product.id}
                onPress={() => router.push(`/product/${product.id}`)}
                style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.prodName, { color: palette.text }]} numberOfLines={1}>
                      {product.name}
                    </Text>
                    <Text style={[styles.prodMeta, { color: palette.textSecondary }]}>
                      {formatQuantity(f.currentStock, f.unit)} on hand · ~
                      {formatQuantity(f.dailyRateMean, f.unit)}/day · {product.storageLocation}
                    </Text>
                  </View>
                  <Badge label={badge.label} tone={badge.tone} />
                </View>

                <ForecastBar forecast={f} />

                <View style={[styles.cardActions, { gap: 8 }]}>
                  <Text style={[styles.depleteDate, { color: palette.textMuted, flex: 1 }]}>
                    {f.currentStock <= 0
                      ? 'Scheduled on shopping list'
                      : `Est. empty ${f.predictedDepletionDate.slice(5)}`}
                  </Text>
                  <View style={[styles.btnGroup, { flexShrink: 0 }]}>
                    {f.currentStock > 0 && (
                      <>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            handleQuickUse(product.id);
                          }}
                          style={[styles.miniBtn, { backgroundColor: palette.primarySoft }]}>
                          <Text style={[styles.miniBtnText, { color: palette.primary }]}>
                            -1 serving
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            markProductOutOfStock(product.id);
                          }}
                          style={[styles.miniBtn, { backgroundColor: palette.surfaceMuted }]}>
                          <Text style={[styles.miniBtnText, { color: palette.textSecondary }]}>
                            Empty
                          </Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: 40,
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: Radii.full,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statPill: {
    flex: 1,
    borderRadius: Radii.md,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statLbl: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radii.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 10,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  prodName: {
    fontSize: 15,
    fontWeight: '700',
  },
  prodMeta: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  depleteDate: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  btnGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  miniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radii.sm,
  },
  miniBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
